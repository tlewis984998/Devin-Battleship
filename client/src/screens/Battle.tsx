import { useEffect, useState } from 'react';
import { Coord, RoomView, SHIPS, plusCells } from '@battleship/shared';
import { socket } from '../socket';
import BoardGrid from '../components/BoardGrid';

function glyph(cell: string): string {
  if (cell === 'hit' || cell === 'sunk') return '✕';
  if (cell === 'miss') return '·';
  return '';
}

function Fleet({ sunk }: { sunk: string[] }) {
  return (
    <div className="fleet">
      {SHIPS.map((s) => (
        <span key={s.name} className={sunk.includes(s.name) ? 'sunk' : ''}>
          {s.name}
        </span>
      ))}
    </div>
  );
}

export default function Battle({ view }: { view: RoomView }) {
  const [error, setError] = useState<string | null>(null);
  const finished = view.phase === 'finished';
  const canFire = !finished && view.yourTurn;
  const voted = view.rematchRequestedBy.includes(view.playerIndex);
  const opponentVoted = view.rematchRequestedBy.some((i) => i !== view.playerIndex);
  const opponent = view.opponentIsAi ? 'Computer' : 'Opponent';
  const [armed, setArmed] = useState(false);
  const [hover, setHover] = useState<Coord | null>(null);

  useEffect(() => {
    if (!canFire || !view.superShotAvailable) setArmed(false);
  }, [canFire, view.superShotAvailable]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.key === 's' || e.key === 'S') && view.superShotAvailable && canFire) {
        setArmed((a) => !a);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [view.superShotAvailable, canFire]);

  const onCell = (row: number, col: number) => {
    if (!canFire) return;
    if (armed) {
      const pattern = plusCells({ row, col });
      if (!pattern.some((c) => view.opponentBoard[c.row][c.col] === 'water')) return;
      setError(null);
      socket.emit('superShot', { row, col }, (res) => {
        if (!res.ok) setError(res.error);
        setArmed(false);
      });
      return;
    }
    if (view.opponentBoard[row][col] !== 'water') return;
    setError(null);
    socket.emit('fire', { row, col }, (res) => {
      if (!res.ok) setError(res.error);
    });
  };

  const enemyCellClass = (r: number, c: number) => {
    let cls = `sea ${view.opponentBoard[r][c]}${
      canFire && view.opponentBoard[r][c] === 'water' ? ' target' : ''
    }`;
    if (armed && hover) {
      const pattern = plusCells(hover);
      const anyWater = pattern.some((p) => view.opponentBoard[p.row][p.col] === 'water');
      if (pattern.some((p) => p.row === r && p.col === c)) {
        cls += anyWater
          ? view.opponentBoard[r][c] === 'water'
            ? ' preview-ok'
            : ''
          : ' preview-bad';
      }
    }
    return cls;
  };

  return (
    <div className="battle">
      <div className="statusbar">
        {view.opponentLeft ? (
          <h2 className="warn">Opponent left the game.</h2>
        ) : finished ? (
          <h2 className={view.winner === 'you' ? 'win' : 'lose'}>
            {view.winner === 'you' ? 'Victory — enemy fleet destroyed!' : 'Defeat — your fleet was sunk.'}
          </h2>
        ) : (
          <h2 className={view.yourTurn ? 'win' : ''}>
            {view.yourTurn ? 'Your turn — fire!' : `${opponent}'s turn…`}
          </h2>
        )}
        {!view.opponentConnected && !view.opponentIsAi && !view.opponentLeft && (
          <span className="warn">Opponent disconnected — they can rejoin anytime.</span>
        )}
      </div>

      <div className="boards">
        <section>
          <h3>Your fleet</h3>
          <BoardGrid
            cellClass={(r, c) => `sea ${view.yourBoard[r][c]}`}
            content={(r, c) => glyph(view.yourBoard[r][c])}
          />
          <Fleet sunk={view.sunkByOpponent} />
        </section>
        <section>
          <h3>Enemy waters</h3>
          <div className="supershot">
            <button
              className={`seg${armed ? ' active' : ''}`}
              disabled={!view.superShotAvailable || !canFire}
              onClick={() => setArmed((a) => !a)}
            >
              {view.superShotAvailable
                ? armed
                  ? 'SuperShot armed — pick a target'
                  : 'SuperShot: Ready (S)'
                : 'SuperShot: Used'}
            </button>
            <span className="muted small">
              {opponent} SuperShot: {view.opponentSuperShotAvailable ? 'ready' : 'used'}
            </span>
          </div>
          <BoardGrid
            cellClass={enemyCellClass}
            content={(r, c) => glyph(view.opponentBoard[r][c])}
            onCellClick={onCell}
            onCellHover={(r, c) => {
              if (armed) setHover({ row: r, col: c });
            }}
            onHoverEnd={() => setHover(null)}
          />
          <Fleet sunk={view.sunkByYou} />
        </section>
      </div>

      {finished &&
        (view.opponentLeft ? (
          <p className="muted">Start a new game from the home screen.</p>
        ) : (
          <div className="rematch">
            <button
              className="primary"
              disabled={voted}
              onClick={() =>
                socket.emit('rematch', (r) => {
                  if (!r.ok) setError(r.error);
                })
              }
            >
              {voted ? 'Rematch requested…' : 'Rematch'}
            </button>
            {opponentVoted && !voted && <span className="muted">{opponent} wants a rematch.</span>}
          </div>
        ))}
      {error && <p className="error">{error}</p>}
    </div>
  );
}
