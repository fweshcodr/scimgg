import { describe, expect, it } from 'vitest';
import type { UIPosition } from '../../hooks/usePersistedSettings';
import { type PlacementGeometry, projectPlacement } from '../panelPlacement';

const LOGICAL = { width: 200, height: 100 };
type Geometry = PlacementGeometry & { width: number; height: number };
const at = (viewportWidth: number, viewportHeight: number, scale: number): Geometry => ({
  viewportWidth,
  viewportHeight,
  width: LOGICAL.width * scale,
  height: LOGICAL.height * scale,
});

/** The painted left/top of a panel stored at `position` in `geometry`. */
function screen(position: UIPosition, geometry: Geometry) {
  const { width, height } = geometry;
  return {
    left: position.anchorX === 'left' ? position.x : geometry.viewportWidth - width - position.x,
    top: position.anchorY === 'top' ? position.y : geometry.viewportHeight - height - position.y,
    width,
    height,
  };
}

function project(position: UIPosition, from: Geometry, to: Geometry) {
  const next = projectPlacement({ ...from, position }, to, to.width, to.height);
  return screen(next, to);
}

const small = at(1920, 970, 1);
const changes: Array<[string, Geometry]> = [
  ['a UI-scale step', at(1920, 970, 2)],
  ['a window resize', at(2560, 1300, 1)],
  ['both at once', at(2560, 1300, 2)],
  ['a smaller window', at(1280, 720, 1)],
];

describe('projectPlacement', () => {
  it.each(changes)('keeps a centered panel centered through %s', (_label, to) => {
    const centred = { x: (1920 - 200) / 2, y: (970 - 100) / 2, anchorX: 'left', anchorY: 'top' } as const;
    const next = project(centred, small, to);
    expect(next.left + next.width / 2).toBeCloseTo(to.viewportWidth / 2, 9);
    expect(next.top + next.height / 2).toBeCloseTo(to.viewportHeight / 2, 9);
  });

  it.each(changes)('keeps an off-corner panel at its fraction of the free space through %s', (_label, to) => {
    // A quarter of the way from the right, a tenth of the way down.
    const spot = { x: 430, y: 87, anchorX: 'right', anchorY: 'top' } as const;
    const next = project(spot, small, to);
    expect((to.viewportWidth - next.width - next.left) / (to.viewportWidth - next.width)).toBeCloseTo(430 / 1720, 9);
    expect(next.top / (to.viewportHeight - next.height)).toBeCloseTo(87 / 870, 9);
  });

  it.each(changes)('uses the same continuous fraction for small corner gaps through %s', (_label, to) => {
    const tucked = { x: 5, y: 8, anchorX: 'right', anchorY: 'bottom' } as const;
    const next = project(tucked, small, to);
    expect(to.viewportWidth - next.width - next.left).toBeCloseTo((5 * (to.viewportWidth - next.width)) / 1720, 9);
    expect(to.viewportHeight - next.height - next.top).toBeCloseTo((8 * (to.viewportHeight - next.height)) / 870, 9);
  });

  it('does not treat a panel just past the hugging gap as hugging', () => {
    const near = { x: 9, y: 0, anchorX: 'left', anchorY: 'top' } as const;
    expect(project(near, small, at(3840, 970, 1)).left).toBeCloseTo((9 * 3640) / 1720, 9);
  });

  it.each(changes)('places left- and right-anchored saves of the same spot identically through %s', (_label, to) => {
    const left = { x: 600, y: 300, anchorX: 'left', anchorY: 'top' } as const;
    const right = { x: 1920 - 200 - 600, y: 970 - 100 - 300, anchorX: 'right', anchorY: 'bottom' } as const;
    const fromLeft = project(left, small, to);
    const fromRight = project(right, small, to);
    expect(fromRight.left).toBeCloseTo(fromLeft.left, 9);
    expect(fromRight.top).toBeCloseTo(fromLeft.top, 9);
  });

  it('writes the result against the stored anchor', () => {
    const right = { x: 300, y: 200, anchorX: 'right', anchorY: 'bottom' } as const;
    const next = projectPlacement({ ...small, ...LOGICAL, position: right }, at(2560, 1300, 1), 200, 100);
    expect(next).toMatchObject({ anchorX: 'right', anchorY: 'bottom' });
  });

  it('returns the stored position unchanged at its own geometry', () => {
    const position = { x: 123.4, y: 56.7, anchorX: 'right', anchorY: 'bottom' } as const;
    expect(projectPlacement({ ...small, ...LOGICAL, position }, small, 200, 100)).toBe(position);
  });

  it('projects zero destination slack to zero without changing the reference', () => {
    const position = { x: 300, y: 200, anchorX: 'left', anchorY: 'top' } as const;
    const reference = { ...small, ...LOGICAL, position };
    expect(projectPlacement(reference, at(150, 80, 1), 200, 100)).toEqual({ ...position, x: 0, y: 0 });
    expect(projectPlacement(reference, small, 200, 100)).toEqual(position);
  });
});
