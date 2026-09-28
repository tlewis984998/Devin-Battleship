import { useEffect, useMemo, useState } from 'react';
import {
  BOARD_SIZE,
  Coord,
  Orientation,
  RoomView,
  SHIPS,
  ShipPlacement,
  randomPlacements,
} from '@battleship/shared';
import { socket } from '../socket';
import BoardGrid from '../components/BoardGrid';

const key = (r: number, c: number) => r * BOARD_SIZE + c;
const inBounds = (c: Coord) => c.row >= 0 && c.row < BOARD_SIZE && c.col >= 0 && c.col < BOARD_SIZE;

function shipCells(name: string, row: number, col: number, o: Orientation): Coord[] {
  const def = SHIPS.find((s) => s.name === name)!;
  return Array.from({ length: def.size }, (_, i) => ({
    row: row + (o === 'v' ? i : 0),
    col: col + (o === 'h' ? i : 0),
  }));
}

export default function Placement({ view }: { view: RoomView }) {
  const [placements, setPlacements] = useState<ShipPlacement[]>([]);
  const [orientation, setOrientation] = useState<Orientation>('h');
  const [hover, setHover] = useState<Coord | null>(null);
  const [error, setError] = useState<string | null>(null);

  const confirmed = view.youPlaced;

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'r' || e.key === 'R') setOrientation((o) => (o === 'h' ? 'v' : 'h'));
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const occupied = useMemo(() => {
    const map = new Map<number, string>();
    for (const p of placements) {
      for (const c of shipCells(p.name, p.row, p.col, p.orientation)) {
        map.set(key(c.row, c.col), p.name);
      }
    }
    return map;
  }, [placements]);

  const current = SHIPS.find((s) => !placements.some((p) => p.name === s.name));

  const preview = hover && current ? shipCells(current.name, hover.row, hover.col, orientation) : [];
  const previewValid =
    preview.length > 0 &&
    preview.every(inBounds) &&
    !preview.some((c) => occupied.has(key(c.row, c.col)));

  const onCellClick = (r: number, c: number) => {
    setError(null);
    const existing = occupied.get(key(r, c));
    if (existing) {
      setPlacements((ps) => ps.filter((p) => p.name !== existing));
      return;
    }
    if (!current) return;
    const cells = shipCells(current.name, r, c, orientation);
    if (!cells.every(inBounds) || cells.some((cc) => occupied.has(key(cc.row, cc.col)))) return;
    setPlacements((ps) => [...ps, { name: current.name, row: r, col: c, orientation }]);
  };

  const randomize = () => {
    setError(null);
    let ps = randomPlacements();
    while (ps.length < SHIPS.length) ps = randomPlacements();
    setPlacements(ps);
  };

  const confirm = () => {
    socket.emit('placeShips', { ships: placements }, (r) => {
      if (!r.ok) setError(r.error);
    });
  };

  if (confirmed) {
    return (
      <div className="placement">
        <h2>Fleet deployed</h2>
        <BoardGrid cellClass={(r, c) => `sea ${view.yourBoard[r][c]}`} />
        <p className="pulse">
          {view.opponentPlaced ? 'Starting battle…' : 'Waiting for opponent to place ships…'}
        </p>
      </div>
    );
  }

  return (
    <div className="placement">
      <div className="toolbar">
        <button onClick={() => setOrientation((o) => (o === 'h' ? 'v' : 'h'))}>
          Rotate (R)
        </button>
        <button onClick={randomize}>Randomize</button>
        <button onClick={() => setPlacements([])}>Clear</button>
        <button
          className="primary"
          disabled={placements.length !== SHIPS.length}
          onClick={confirm}
        >
          Confirm fleet
        </button>
      </div>
      <p className="muted">
        {current
          ? `Click the water to place your ${current.name} (${current.size} cells)`
          : 'All ships placed — confirm when ready'}
      </p>
      <BoardGrid
        cellClass={(r, c) => {
          if (occupied.has(key(r, c))) return 'ship';
          if (preview.some((p) => p.row === r && p.col === c && inBounds(p))) {
            return previewValid ? 'preview-ok' : 'preview-bad';
          }
          return 'sea';
        }}
        onCellClick={onCellClick}
        onCellHover={(r, c) => setHover({ row: r, col: c })}
        onHoverEnd={() => setHover(null)}
      />
      <div className="fleet">
        {SHIPS.map((s) => (
          <span
            key={s.name}
            className={placements.some((p) => p.name === s.name) ? 'placed' : ''}
          >
            {s.name} ({s.size})
          </span>
        ))}
      </div>
      {error && <p className="error">{error}</p>}
    </div>
  );
}
