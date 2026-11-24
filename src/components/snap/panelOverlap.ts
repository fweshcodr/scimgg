/**
 * Which movable panels sit partly or wholly under another. Pure geometry plus an injected
 * "which one paints on top" answer, so the rule is testable without a browser; the overlay
 * asks the browser itself (see `paintedOnTop`).
 */

export interface OverlapRect {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

/**
 * Smaller slivers are not worth a guide: snapped panels keep a 5px gap, and a rounding
 * pixel along a shared edge should not light up two panels that merely touch.
 */
export const MIN_OVERLAP_PX = 4;

export function overlapOf(a: OverlapRect, b: OverlapRect): OverlapRect | null {
  const left = Math.max(a.left, b.left);
  const top = Math.max(a.top, b.top);
  const right = Math.min(a.right, b.right);
  const bottom = Math.min(a.bottom, b.bottom);
  if (right - left < MIN_OVERLAP_PX || bottom - top < MIN_OVERLAP_PX) return null;
  return { left, top, right, bottom };
}

export interface CoveredPanel<T> {
  panel: T;
  /** The parts of the panel that another panel paints over, one per covering panel. */
  overlaps: OverlapRect[];
}

/**
 * Every panel that some other panel covers, in input order. `onTop` names whichever of
 * the two paints above the other at their overlap.
 */
export function findCoveredPanels<T extends { rect: OverlapRect }>(
  panels: readonly T[],
  onTop: (a: T, b: T, overlap: OverlapRect) => T,
): CoveredPanel<T>[] {
  const overlapsByPanel = new Map<T, OverlapRect[]>();
  for (let i = 0; i < panels.length; i++) {
    for (let j = i + 1; j < panels.length; j++) {
      const a = panels[i] as T;
      const b = panels[j] as T;
      const overlap = overlapOf(a.rect, b.rect);
      if (!overlap) continue;
      const covered = onTop(a, b, overlap) === a ? b : a;
      const list = overlapsByPanel.get(covered) ?? [];
      list.push(overlap);
      overlapsByPanel.set(covered, list);
    }
  }
  return panels.flatMap((panel) => {
    const overlaps = overlapsByPanel.get(panel);
    return overlaps ? [{ panel, overlaps }] : [];
  });
}

/**
 * Asks the browser which of two panels paints on top at a client point. Hit-testing is
 * the only answer that respects every stacking context between them (the Mobile tool
 * window's layer, a pinned strip) without re-deriving CSS stacking rules. It works
 * because Alt makes every panel's content layer hit-testable; if neither is found there,
 * later in the document is the usual tiebreak for siblings at the same z-index.
 */
export function paintedOnTop(a: HTMLElement, b: HTMLElement, clientX: number, clientY: number): HTMLElement {
  const stack = typeof document.elementsFromPoint === 'function' ? document.elementsFromPoint(clientX, clientY) : [];
  for (const element of stack) {
    if (a.contains(element)) return a;
    if (b.contains(element)) return b;
  }
  return a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING ? b : a;
}
