// @vitest-environment happy-dom

import { afterEach, describe, expect, it, vi } from 'vitest';
import { findCoveredPanels, MIN_OVERLAP_PX, type OverlapRect, overlapOf, paintedOnTop } from '../panelOverlap';

const box = (left: number, top: number, width: number, height: number): OverlapRect => ({
  left,
  top,
  right: left + width,
  bottom: top + height,
});

describe('overlapOf', () => {
  it('returns the shared region of two overlapping rects', () => {
    expect(overlapOf(box(0, 0, 100, 100), box(60, 40, 100, 100))).toEqual(box(60, 40, 40, 60));
  });

  it('ignores panels that only touch or share a sliver thinner than the minimum', () => {
    expect(overlapOf(box(0, 0, 100, 100), box(100, 0, 100, 100))).toBeNull();
    expect(overlapOf(box(0, 0, 100, 100), box(100 - (MIN_OVERLAP_PX - 1), 0, 100, 100))).toBeNull();
    expect(overlapOf(box(0, 0, 100, 100), box(100 - MIN_OVERLAP_PX, 0, 100, 100))).not.toBeNull();
  });
});

describe('findCoveredPanels', () => {
  const panel = (id: string, rect: OverlapRect, z: number) => ({ id, rect, z });
  const byZ = <T extends { z: number }>(a: T, b: T) => (a.z >= b.z ? a : b);

  it('reports only the lower panel of each overlapping pair, with the shared region', () => {
    const lower = panel('dps', box(0, 0, 100, 100), 1);
    const upper = panel('flick', box(50, 50, 100, 100), 2);
    const apart = panel('boss', box(400, 0, 100, 40), 3);

    expect(findCoveredPanels([lower, upper, apart], byZ)).toEqual([{ panel: lower, overlaps: [box(50, 50, 50, 50)] }]);
  });

  it('collects one overlap per covering panel, and a middle panel can be both covered and covering', () => {
    const bottom = panel('bottom', box(0, 0, 100, 100), 1);
    const middle = panel('middle', box(80, 0, 100, 100), 2);
    const top = panel('top', box(0, 80, 200, 50), 3);

    const covered = findCoveredPanels([bottom, middle, top], byZ);
    expect(covered.map(({ panel: p, overlaps }) => [p.id, overlaps])).toEqual([
      ['bottom', [box(80, 0, 20, 100), box(0, 80, 100, 20)]],
      ['middle', [box(80, 80, 100, 20)]],
    ]);
  });

  it('reports nothing when no panels overlap', () => {
    expect(findCoveredPanels([panel('a', box(0, 0, 10, 10), 1), panel('b', box(20, 0, 10, 10), 2)], byZ)).toEqual([]);
  });
});

describe('paintedOnTop', () => {
  const original = document.elementsFromPoint;
  afterEach(() => {
    document.elementsFromPoint = original;
    document.body.innerHTML = '';
  });

  function twoPanels() {
    const first = document.createElement('div');
    const second = document.createElement('div');
    const firstChild = document.createElement('span');
    first.append(firstChild);
    document.body.append(first, second);
    return { first, second, firstChild };
  }

  it('trusts the browser hit test, which respects every stacking context', () => {
    const { first, second, firstChild } = twoPanels();
    document.elementsFromPoint = vi.fn(() => [firstChild, first, second, document.body]);
    expect(paintedOnTop(first, second, 10, 10)).toBe(first);
    expect(paintedOnTop(second, first, 10, 10)).toBe(first);
  });

  it('falls back to document order when neither panel is hit-testable there', () => {
    const { first, second } = twoPanels();
    document.elementsFromPoint = vi.fn(() => [document.body]);
    expect(paintedOnTop(first, second, 10, 10)).toBe(second);
  });
});
