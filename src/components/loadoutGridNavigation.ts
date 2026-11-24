import type React from 'react';
import { useRef, useState } from 'react';

/** A cell's place in the grid it is drawn in. 1-based, so it doubles as its CSS grid line. */
export interface GridCell {
  readonly row: number;
  readonly col: number;
  /**
   * Which sub-grid the cell belongs to, when one coordinate space holds more than one.
   * Vertical moves stay inside a section; horizontal moves cross freely, because the two
   * sub-grids sit side by side and left/right is the axis between them. Cells that name no
   * section are all in the same one.
   */
  readonly section?: string;
}

export type GridDirection = 'up' | 'down' | 'left' | 'right';

const DIRECTION_BY_KEY: Record<string, GridDirection | undefined> = {
  ArrowUp: 'up',
  ArrowDown: 'down',
  ArrowLeft: 'left',
  ArrowRight: 'right',
};

/**
 * The cell an arrow key should land on, over a grid that may be sparse.
 *
 * Vertical moves rank the nearest row first and the nearest column second, so a column that
 * simply stops (the equipment cross has no boots under the hands) hands focus on rather than
 * trapping it, and it never leaves its own section, which is what keeps the bottom of the
 * diagram from dropping into the middle of the inventory. Horizontal moves stay inside their
 * row but may cross sections, which is how the diagram and the inventory join up. Edges hold
 * instead of
 * wrapping, which is what a grid is expected to do and what the tile listbox above, a ring,
 * deliberately is not.
 */
export function nextGridCellIndex(cells: readonly GridCell[], from: number, direction: GridDirection): number {
  const origin = cells[from];
  if (!origin) {
    return from;
  }
  const horizontal = direction === 'left' || direction === 'right';
  const step = direction === 'left' || direction === 'up' ? -1 : 1;

  let best = from;
  let bestScore = Number.POSITIVE_INFINITY;
  for (let index = 0; index < cells.length; index++) {
    const cell = cells[index];
    if (
      index === from ||
      cell === undefined ||
      (horizontal ? cell.row !== origin.row : cell.section !== origin.section)
    ) {
      continue;
    }
    const forward = (horizontal ? cell.col - origin.col : cell.row - origin.row) * step;
    if (forward <= 0) {
      continue;
    }
    // Rows outrank columns by more than any column distance can make up, so "one row on" always
    // beats "two rows on, but in exactly this column".
    const score = horizontal ? forward : forward * 100 + Math.abs(cell.col - origin.col);
    if (score < bestScore) {
      bestScore = score;
      best = index;
    }
  }
  return best;
}

/** What every navigable cell must spread onto itself for the roving group to find and rank it. */
export interface GridCellProps {
  readonly 'data-grid-cell': true;
  readonly tabIndex: number;
  readonly onFocus: () => void;
}

/**
 * Roving focus for one loadout grid: the whole grid is a single tab stop and the arrow keys
 * move inside it. Tabbing cell by cell would cost 38 presses to cross a loadout, which is the
 * whole reason the mouse was the only practical way to edit gear. The diagram and the
 * inventory share one group so left and right carry focus between them.
 *
 * Cells are found in the DOM by `data-grid-cell`, in the same order as `cells`, so no cell
 * needs a ref of its own. Arrows are swallowed whether or not they move: inside a grid the
 * grid owns them, and letting an edge press scroll the panel instead would read as a glitch.
 */
export function useGridRovingFocus(cells: readonly GridCell[]) {
  const containerRef = useRef<HTMLDivElement>(null);
  // The cell, not its index. A cell that comes and goes (the quiver's ammunition) renumbers
  // every cell after it, and the stop has to stay on the cell the arrows left rather than on
  // whatever now holds its number; a cell that has gone hands the stop to the first. It is
  // resolved against `cells` at render, so a caller must pass the SAME cell objects from one
  // render to the next: a cell rebuilt each render is never found again.
  const [activeCell, setActiveCell] = useState<GridCell | null>(null);
  const activeIndex = activeCell === null ? 0 : Math.max(0, cells.indexOf(activeCell));

  const onKeyDown = (event: React.KeyboardEvent) => {
    const direction = DIRECTION_BY_KEY[event.key];
    if (direction === undefined) {
      return;
    }
    event.preventDefault();
    const elements = Array.from(containerRef.current?.querySelectorAll<HTMLElement>('[data-grid-cell]') ?? []);
    const focused = elements.indexOf(document.activeElement as HTMLElement);
    elements[nextGridCellIndex(cells, focused === -1 ? activeIndex : focused, direction)]?.focus();
  };

  const cellProps = (index: number): GridCellProps => ({
    'data-grid-cell': true,
    tabIndex: index === activeIndex ? 0 : -1,
    onFocus: () => setActiveCell(cells[index]),
  });

  return { containerRef, onKeyDown, cellProps };
}
