import { useState } from 'react';
import { RoomView, SHIPS } from '@battleship/shared';
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

  const fire = (row: number, col: number) => {
    if (!canFire || view.opponentBoard[row][col] !== 'water') return;
    setError(null);
    socket.emit('fire', { row, col }, (res) => {
      if (!res.ok) setError(res.error);
    });
  };

  return (
    <div className="battle">
      <div className="statusbar">
        {finished ? (
          <h2 className={view.winner === 'you' ? 'win' : 'lose'}>
            {view.winner === 'you' ? 'Victory — enemy fleet destroyed!' : 'Defeat — your fleet was sunk.'}
          </h2>
        ) : (
          <h2 className={view.yourTurn ? 'win' : ''}>
            {view.yourTurn ? 'Your turn — fire!' : "Opponent's turn…"}
          </h2>
        )}
        {!view.opponentConnected && (
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
          <BoardGrid
            cellClass={(r, c) =>
              `sea ${view.opponentBoard[r][c]}${
                canFire && view.opponentBoard[r][c] === 'water' ? ' target' : ''
              }`
            }
            content={(r, c) => glyph(view.opponentBoard[r][c])}
            onCellClick={fire}
          />
          <Fleet sunk={view.sunkByYou} />
        </section>
      </div>

      {finished && (
        <div className="rematch">
          <button
            className="primary"
            disabled={voted}
            onClick={() => socket.emit('rematch', () => {})}
          >
            {voted ? 'Rematch requested…' : 'Rematch'}
          </button>
          {opponentVoted && !voted && <span className="muted">Opponent wants a rematch.</span>}
        </div>
      )}
      {error && <p className="error">{error}</p>}
    </div>
  );
}
