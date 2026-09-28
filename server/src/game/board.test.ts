import { describe, expect, it } from 'vitest';
import { BOARD_SIZE, SHIPS, ShipPlacement, plusCells } from '@battleship/shared';
import {
  allSunk,
  createBoard,
  fireAt,
  foeView,
  ownView,
  sunkNames,
  validatePlacement,
} from './board';

function validPlacements(): ShipPlacement[] {
  return [
    { name: 'Carrier', row: 0, col: 0, orientation: 'h' },
    { name: 'Battleship', row: 1, col: 0, orientation: 'h' },
    { name: 'Cruiser', row: 2, col: 0, orientation: 'h' },
    { name: 'Submarine', row: 3, col: 0, orientation: 'h' },
    { name: 'Destroyer', row: 4, col: 0, orientation: 'h' },
  ];
}

describe('validatePlacement', () => {
  it('accepts a legal layout', () => {
    expect(validatePlacement(validPlacements())).toBeNull();
  });

  it('rejects the wrong ship count', () => {
    expect(validatePlacement(validPlacements().slice(0, 4))).toMatch(/expected|missing/);
  });

  it('rejects out-of-bounds ships', () => {
    const p = validPlacements();
    p[0] = { name: 'Carrier', row: 0, col: 8, orientation: 'h' };
    expect(validatePlacement(p)).toMatch(/out of bounds/);
  });

  it('rejects overlapping ships', () => {
    const p = validPlacements();
    p[1] = { name: 'Battleship', row: 0, col: 2, orientation: 'v' };
    expect(validatePlacement(p)).toMatch(/overlap/);
  });

  it('rejects unknown and duplicate ships', () => {
    const p = validPlacements();
    p[4] = { ...p[4], name: 'Yacht' };
    expect(validatePlacement(p)).toMatch(/unknown/);
    const q = validPlacements();
    q[4] = { name: 'Carrier', row: 9, col: 0, orientation: 'h' };
    expect(validatePlacement(q)).toMatch(/duplicate|missing/);
  });
});

describe('firing', () => {
  it('reports miss, hit, repeat, sunk, and victory', () => {
    const board = createBoard(validPlacements());

    expect(fireAt(board, { row: 9, col: 9 })).toEqual({ kind: 'miss' });
    expect(fireAt(board, { row: 9, col: 9 })).toEqual({ kind: 'repeat' });

    // Destroyer at row 4, cols 0-1 (size 2)
    expect(fireAt(board, { row: 4, col: 0 })).toEqual({ kind: 'hit' });
    expect(fireAt(board, { row: 4, col: 1 })).toEqual({ kind: 'sunk', shipName: 'Destroyer' });
    expect(allSunk(board)).toBe(false);

    // Sink everything else
    for (const ship of board.ships) {
      if (ship.name === 'Destroyer') continue;
      for (const c of ship.cells) fireAt(board, c);
    }
    expect(allSunk(board)).toBe(true);
    expect(sunkNames(board)).toHaveLength(SHIPS.length);
  });
});

describe('plusCells', () => {
  it('returns the centre then in-bounds neighbours', () => {
    expect(plusCells({ row: 5, col: 5 })).toEqual([
      { row: 5, col: 5 },
      { row: 4, col: 5 },
      { row: 6, col: 5 },
      { row: 5, col: 4 },
      { row: 5, col: 6 },
    ]);
    expect(plusCells({ row: 0, col: 0 })).toEqual([
      { row: 0, col: 0 },
      { row: 1, col: 0 },
      { row: 0, col: 1 },
    ]);
  });
});

describe('views', () => {
  it('hides intact enemy ships but shows them to the owner', () => {
    const board = createBoard(validPlacements());
    fireAt(board, { row: 0, col: 0 }); // hit on Carrier
    fireAt(board, { row: 9, col: 9 }); // miss

    const own = ownView(board);
    expect(own[0][0]).toBe('hit');
    expect(own[0][1]).toBe('ship');
    expect(own[9][9]).toBe('miss');
    expect(own[9][8]).toBe('water');

    const foe = foeView(board);
    expect(foe[0][0]).toBe('hit');
    expect(foe[0][1]).toBe('water'); // intact enemy ship stays hidden
    expect(foe[9][9]).toBe('miss');

    const revealed = foeView(board, true);
    expect(revealed[0][1]).toBe('ship');
  });

  it('marks every cell of a sunk ship as sunk', () => {
    const board = createBoard(validPlacements());
    fireAt(board, { row: 4, col: 0 });
    fireAt(board, { row: 4, col: 1 });
    const foe = foeView(board);
    expect(foe[4][0]).toBe('sunk');
    expect(foe[4][1]).toBe('sunk');
  });

  it('produces a full-size board', () => {
    const board = createBoard(validPlacements());
    expect(ownView(board)).toHaveLength(BOARD_SIZE);
    expect(ownView(board)[0]).toHaveLength(BOARD_SIZE);
  });
});
