import { BOARD_SIZE, Coord, GameMode, SHIPS, ShipPlacement } from '@battleship/shared';

export const isRecord = (x: unknown): x is Record<string, unknown> =>
  typeof x === 'object' && x !== null;

export function isCoord(x: unknown): x is Coord {
  return (
    isRecord(x) &&
    Number.isInteger(x.row) &&
    Number.isInteger(x.col) &&
    (x.row as number) >= 0 &&
    (x.row as number) < BOARD_SIZE &&
    (x.col as number) >= 0 &&
    (x.col as number) < BOARD_SIZE
  );
}

export function isRoomCode(x: unknown): x is string {
  return typeof x === 'string' && /^[A-Za-z0-9]{4}$/.test(x.trim());
}

export function isToken(x: unknown): x is string {
  return typeof x === 'string' && x.length > 0 && x.length <= 64;
}

export function isGameMode(x: unknown): x is GameMode {
  return x === 'human' || x === 'ai';
}

export function isShipPlacements(x: unknown): x is ShipPlacement[] {
  return (
    Array.isArray(x) &&
    x.every(
      (p) =>
        isRecord(p) &&
        typeof p.name === 'string' &&
        SHIPS.some((s) => s.name === p.name) &&
        Number.isInteger(p.row) &&
        Number.isInteger(p.col) &&
        (p.orientation === 'h' || p.orientation === 'v'),
    )
  );
}
