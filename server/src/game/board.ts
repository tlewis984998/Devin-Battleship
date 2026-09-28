import {
  BOARD_SIZE,
  CellView,
  Coord,
  SHIPS,
  ShipPlacement,
  placementCells,
} from '@battleship/shared';

export interface BoardCell {
  /** Index into Board.ships, or -1 for open water. */
  ship: number;
  shot: boolean;
}

export interface ShipState {
  name: string;
  size: number;
  cells: Coord[];
}

export interface Board {
  cells: BoardCell[][];
  ships: ShipState[];
}

export type FireResult =
  | { kind: 'repeat' }
  | { kind: 'miss' }
  | { kind: 'hit' }
  | { kind: 'sunk'; shipName: string };

/** Returns an error message, or null if the placement is legal. */
export function validatePlacement(placements: ShipPlacement[]): string | null {
  if (placements.length !== SHIPS.length) return `expected ${SHIPS.length} ships`;
  const seen = new Set<string>();
  const occupied = new Set<number>();
  for (const p of placements) {
    const def = SHIPS.find((s) => s.name === p.name);
    if (!def) return `unknown ship "${p.name}"`;
    if (seen.has(p.name)) return `duplicate ship "${p.name}"`;
    seen.add(p.name);
    const cells = placementCells(p);
    if (!cells) return `${p.name} is out of bounds`;
    for (const c of cells) {
      const key = c.row * BOARD_SIZE + c.col;
      if (occupied.has(key)) return 'ships overlap';
      occupied.add(key);
    }
  }
  const missing = SHIPS.find((s) => !seen.has(s.name));
  if (missing) return `missing ship "${missing.name}"`;
  return null;
}

export function createBoard(placements: ShipPlacement[]): Board {
  const cells: BoardCell[][] = Array.from({ length: BOARD_SIZE }, () =>
    Array.from({ length: BOARD_SIZE }, () => ({ ship: -1, shot: false })),
  );
  const ships: ShipState[] = placements.map((p) => {
    const def = SHIPS.find((s) => s.name === p.name)!;
    return { name: p.name, size: def.size, cells: placementCells(p)! };
  });
  ships.forEach((ship, i) => {
    for (const c of ship.cells) cells[c.row][c.col].ship = i;
  });
  return { cells, ships };
}

export function isSunk(board: Board, shipIndex: number): boolean {
  return board.ships[shipIndex].cells.every((c) => board.cells[c.row][c.col].shot);
}

export function fireAt(board: Board, c: Coord): FireResult {
  const cell = board.cells[c.row][c.col];
  if (cell.shot) return { kind: 'repeat' };
  cell.shot = true;
  if (cell.ship === -1) return { kind: 'miss' };
  if (isSunk(board, cell.ship)) return { kind: 'sunk', shipName: board.ships[cell.ship].name };
  return { kind: 'hit' };
}

export function allSunk(board: Board): boolean {
  return board.ships.every((_, i) => isSunk(board, i));
}

/** Board as seen by its owner: ships, incoming hits and misses. */
export function ownView(board: Board): CellView[][] {
  return board.cells.map((row) =>
    row.map((cell) => {
      if (cell.shot)
        return cell.ship === -1 ? 'miss' : isSunk(board, cell.ship) ? 'sunk' : 'hit';
      return cell.ship === -1 ? 'water' : 'ship';
    }),
  );
}

/** Board as seen by the enemy: only fired-upon cells are revealed. */
export function foeView(board: Board, reveal = false): CellView[][] {
  return board.cells.map((row) =>
    row.map((cell) => {
      if (cell.shot)
        return cell.ship === -1 ? 'miss' : isSunk(board, cell.ship) ? 'sunk' : 'hit';
      return reveal && cell.ship !== -1 ? 'ship' : 'water';
    }),
  );
}

export function sunkNames(board: Board): string[] {
  return board.ships.filter((_, i) => isSunk(board, i)).map((s) => s.name);
}

export function emptyView(): CellView[][] {
  return Array.from({ length: BOARD_SIZE }, () =>
    Array.from({ length: BOARD_SIZE }, () => 'water' as CellView),
  );
}
