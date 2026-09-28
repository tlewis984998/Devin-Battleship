export const BOARD_SIZE = 10;

export interface ShipDef {
  name: string;
  size: number;
}

export const SHIPS: ShipDef[] = [
  { name: 'Carrier', size: 5 },
  { name: 'Battleship', size: 4 },
  { name: 'Cruiser', size: 3 },
  { name: 'Submarine', size: 3 },
  { name: 'Destroyer', size: 2 },
];

export interface Coord {
  row: number;
  col: number;
}

/** Centre plus in-bounds orthogonal neighbours, centre first (SuperShot pattern). */
export function plusCells(c: Coord): Coord[] {
  const cells: Coord[] = [c];
  for (const d of [
    { row: -1, col: 0 },
    { row: 1, col: 0 },
    { row: 0, col: -1 },
    { row: 0, col: 1 },
  ]) {
    const cell = { row: c.row + d.row, col: c.col + d.col };
    if (cell.row >= 0 && cell.row < BOARD_SIZE && cell.col >= 0 && cell.col < BOARD_SIZE) {
      cells.push(cell);
    }
  }
  return cells;
}

export type Orientation = 'h' | 'v';

export interface ShipPlacement {
  name: string;
  row: number;
  col: number;
  orientation: Orientation;
}

/** Expands a placement into its board cells, or null if any cell is out of bounds. */
export function placementCells(p: ShipPlacement): Coord[] | null {
  const def = SHIPS.find((s) => s.name === p.name);
  if (!def) return null;
  const cells: Coord[] = [];
  for (let i = 0; i < def.size; i++) {
    const row = p.row + (p.orientation === 'v' ? i : 0);
    const col = p.col + (p.orientation === 'h' ? i : 0);
    if (row < 0 || row >= BOARD_SIZE || col < 0 || col >= BOARD_SIZE) return null;
    cells.push({ row, col });
  }
  return cells;
}

/** Generates a legal random layout. May rarely return fewer ships if unlucky — retry if so. */
export function randomPlacements(rand: () => number = Math.random): ShipPlacement[] {
  const placements: ShipPlacement[] = [];
  const occupied = new Set<number>();
  for (const ship of SHIPS) {
    for (let attempt = 0; attempt < 500; attempt++) {
      const p: ShipPlacement = {
        name: ship.name,
        row: Math.floor(rand() * BOARD_SIZE),
        col: Math.floor(rand() * BOARD_SIZE),
        orientation: rand() < 0.5 ? 'h' : 'v',
      };
      const cells = placementCells(p);
      if (!cells || cells.some((c) => occupied.has(c.row * BOARD_SIZE + c.col))) continue;
      cells.forEach((c) => occupied.add(c.row * BOARD_SIZE + c.col));
      placements.push(p);
      break;
    }
  }
  return placements;
}

export type Phase = 'waiting' | 'placing' | 'battle' | 'finished';

export type GameMode = 'human' | 'ai';

/** What a player may see in a cell. */
export type CellView =
  | 'water' // unknown (opponent board) or empty own water
  | 'ship' // own intact ship cell / revealed enemy ship after game over
  | 'hit' // a ship cell that has been hit
  | 'miss' // a shot that hit water
  | 'sunk'; // cell of a fully sunk ship

export interface RoomView {
  roomCode: string;
  phase: Phase;
  playerIndex: 0 | 1;
  opponentConnected: boolean;
  opponentIsAi: boolean;
  opponentLeft: boolean;
  youPlaced: boolean;
  opponentPlaced: boolean;
  yourBoard: CellView[][];
  opponentBoard: CellView[][];
  yourTurn: boolean;
  superShotAvailable: boolean;
  opponentSuperShotAvailable: boolean;
  winner: 'you' | 'opponent' | null;
  /** Enemy ship names you have sunk. */
  sunkByYou: string[];
  /** Your ship names the opponent has sunk. */
  sunkByOpponent: string[];
  /** Player indices that have requested a rematch. */
  rematchRequestedBy: number[];
}

export type SimpleResult = { ok: true } | { ok: false; error: string };
export type JoinResult = ({ ok: true; token: string; view: RoomView } | { ok: false; error: string });
export type ResumeResult = ({ ok: true; view: RoomView } | { ok: false; error: string });

export interface ClientToServer {
  createRoom: (p: { mode: GameMode }, cb: (r: JoinResult) => void) => void;
  joinRoom: (p: { roomCode: string }, cb: (r: JoinResult) => void) => void;
  resume: (p: { token: string }, cb: (r: ResumeResult) => void) => void;
  placeShips: (p: { ships: ShipPlacement[] }, cb: (r: SimpleResult) => void) => void;
  fire: (p: Coord, cb: (r: SimpleResult) => void) => void;
  superShot: (p: Coord, cb: (r: SimpleResult) => void) => void;
  rematch: (cb: (r: SimpleResult) => void) => void;
  leaveRoom: (cb: (r: SimpleResult) => void) => void;
}

export interface ServerToClient {
  state: (view: RoomView) => void;
}
