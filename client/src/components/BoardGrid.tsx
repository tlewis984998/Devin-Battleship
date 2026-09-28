import type { ReactNode } from 'react';
import { BOARD_SIZE } from '@battleship/shared';

interface BoardGridProps {
  cellClass: (row: number, col: number) => string;
  content?: (row: number, col: number) => ReactNode;
  onCellClick?: (row: number, col: number) => void;
  onCellHover?: (row: number, col: number) => void;
  onHoverEnd?: () => void;
}

export default function BoardGrid({
  cellClass,
  content,
  onCellClick,
  onCellHover,
  onHoverEnd,
}: BoardGridProps) {
  return (
    <div className="board" onMouseLeave={onHoverEnd}>
      {Array.from({ length: BOARD_SIZE }, (_, r) =>
        Array.from({ length: BOARD_SIZE }, (_, c) => (
          <button
            key={`${r}-${c}`}
            type="button"
            className={`cell ${cellClass(r, c)}`}
            onClick={onCellClick ? () => onCellClick(r, c) : undefined}
            onMouseEnter={onCellHover ? () => onCellHover(r, c) : undefined}
          >
            {content?.(r, c)}
          </button>
        )),
      )}
    </div>
  );
}
