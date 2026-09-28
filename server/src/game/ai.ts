import { BOARD_SIZE, CellView, Coord } from '@battleship/shared';
import { FireResult } from './board';

export interface AiState {
  /** Unsunk hit cells being targeted. */
  hits: Coord[];
}

export function createAiState(): AiState {
  return { hits: [] };
}

const DIRS: Coord[] = [
  { row: -1, col: 0 },
  { row: 1, col: 0 },
  { row: 0, col: -1 },
  { row: 0, col: 1 },
];

/** Picks the next shot given the enemy board as the AI sees it (CellView[][] from foeView). */
export function chooseShot(
  view: CellView[][],
  state: AiState,
  rand: () => number = Math.random,
): Coord {
  let candidates: Coord[] = [];

  // Target mode: two or more hits on one row/column → shoot the open ends of the line.
  if (state.hits.length >= 2) {
    const byRow = new Map<number, Coord[]>();
    const byCol = new Map<number, Coord[]>();
    for (const h of state.hits) {
      byRow.set(h.row, [...(byRow.get(h.row) ?? []), h]);
      byCol.set(h.col, [...(byCol.get(h.col) ?? []), h]);
    }
    const rowLine = [...byRow.values()].find((g) => g.length >= 2);
    const colLine = [...byCol.values()].find((g) => g.length >= 2);
    const group = rowLine ?? colLine;
    if (group) {
      const horizontal = group === rowLine;
      const fixed = horizontal ? group[0].row : group[0].col;
      const vals = group.map((h) => (horizontal ? h.col : h.row));
      for (const dir of [-1, 1]) {
        let v = (dir === -1 ? Math.min(...vals) : Math.max(...vals)) + dir;
        while (v >= 0 && v < BOARD_SIZE) {
          const cell = horizontal ? view[fixed][v] : view[v][fixed];
          if (cell === 'hit' || cell === 'sunk') {
            v += dir;
            continue;
          }
          if (cell === 'water') {
            candidates.push(horizontal ? { row: fixed, col: v } : { row: v, col: fixed });
          }
          break;
        }
      }
    }
  }

  // Target mode fallback: unfired orthogonal neighbours of any known hit.
  if (candidates.length === 0 && state.hits.length > 0) {
    const seen = new Set<number>();
    for (const h of state.hits) {
      for (const d of DIRS) {
        const row = h.row + d.row;
        const col = h.col + d.col;
        const key = row * BOARD_SIZE + col;
        if (
          row >= 0 &&
          row < BOARD_SIZE &&
          col >= 0 &&
          col < BOARD_SIZE &&
          view[row][col] === 'water' &&
          !seen.has(key)
        ) {
          seen.add(key);
          candidates.push({ row, col });
        }
      }
    }
  }

  // Hunt mode: checkerboard parity first, then any unfired cell.
  if (candidates.length === 0) {
    for (let row = 0; row < BOARD_SIZE; row++) {
      for (let col = 0; col < BOARD_SIZE; col++) {
        if (view[row][col] === 'water' && (row + col) % 2 === 0) {
          candidates.push({ row, col });
        }
      }
    }
    if (candidates.length === 0) {
      for (let row = 0; row < BOARD_SIZE; row++) {
        for (let col = 0; col < BOARD_SIZE; col++) {
          if (view[row][col] === 'water') candidates.push({ row, col });
        }
      }
    }
  }

  return candidates[Math.floor(rand() * candidates.length)];
}

/** Update state after a shot; view must be the post-shot foeView. */
export function recordResult(
  state: AiState,
  coord: Coord,
  result: FireResult,
  view: CellView[][],
): void {
  if (result.kind === 'hit') state.hits.push(coord);
  else if (result.kind === 'sunk') {
    state.hits = state.hits.filter((h) => view[h.row][h.col] !== 'sunk');
  }
}
