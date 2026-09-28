import { describe, expect, it } from 'vitest';
import { BOARD_SIZE, CellView, ShipPlacement } from '@battleship/shared';
import { allSunk, createBoard, fireAt, foeView } from './board';
import { chooseShot, createAiState, recordResult } from './ai';

function emptySea(): CellView[][] {
  return Array.from({ length: BOARD_SIZE }, () =>
    Array.from({ length: BOARD_SIZE }, () => 'water' as CellView),
  );
}

function lcg(seed = 42): () => number {
  let s = seed;
  return () => {
    s = (s * 1103515245 + 12345) % 2 ** 31;
    return s / 2 ** 31;
  };
}

function validPlacements(): ShipPlacement[] {
  return [
    { name: 'Carrier', row: 0, col: 0, orientation: 'h' },
    { name: 'Battleship', row: 1, col: 0, orientation: 'h' },
    { name: 'Cruiser', row: 2, col: 0, orientation: 'h' },
    { name: 'Submarine', row: 3, col: 0, orientation: 'h' },
    { name: 'Destroyer', row: 4, col: 0, orientation: 'h' },
  ];
}

describe('chooseShot', () => {
  it('hunts on parity cells of an empty board', () => {
    const view = emptySea();
    const c = chooseShot(view, createAiState(), lcg());
    expect(view[c.row][c.col]).toBe('water');
    expect((c.row + c.col) % 2).toBe(0);
  });

  it('targets an orthogonal neighbour after a single hit', () => {
    const view = emptySea();
    view[5][5] = 'hit';
    const state = { hits: [{ row: 5, col: 5 }] };
    const c = chooseShot(view, state, lcg());
    expect([
      { row: 4, col: 5 },
      { row: 6, col: 5 },
      { row: 5, col: 4 },
      { row: 5, col: 6 },
    ]).toContainEqual(c);
  });

  it('extends the line when two hits share a row', () => {
    const view = emptySea();
    view[5][4] = 'hit';
    view[5][5] = 'hit';
    const state = {
      hits: [
        { row: 5, col: 4 },
        { row: 5, col: 5 },
      ],
    };
    expect([
      { row: 5, col: 3 },
      { row: 5, col: 6 },
    ]).toContainEqual(chooseShot(view, state, lcg()));

    view[5][3] = 'miss';
    expect(chooseShot(view, state, lcg())).toEqual({ row: 5, col: 6 });
  });
});

describe('recordResult', () => {
  it('clears sunk hits but keeps hits on other ships', () => {
    const view = emptySea();
    view[5][5] = 'sunk';
    view[5][6] = 'sunk';
    view[2][2] = 'hit';
    const state = {
      hits: [
        { row: 5, col: 5 },
        { row: 2, col: 2 },
      ],
    };
    recordResult(state, { row: 5, col: 6 }, { kind: 'sunk', shipName: 'Destroyer' }, view);
    expect(state.hits).toEqual([{ row: 2, col: 2 }]);
  });
});

describe('integration', () => {
  it('sinks a full fleet in under 100 shots with no repeats', () => {
    const board = createBoard(validPlacements());
    const state = createAiState();
    const rand = lcg();
    let shots = 0;
    while (!allSunk(board)) {
      const view = foeView(board);
      const c = chooseShot(view, state, rand);
      const res = fireAt(board, c);
      expect(res.kind).not.toBe('repeat');
      recordResult(state, c, res, foeView(board));
      shots++;
    }
    expect(shots).toBeLessThan(100);
  });
});
