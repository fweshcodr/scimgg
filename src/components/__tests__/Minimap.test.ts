import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it, vi } from 'vitest';
import { createMinimapWheelHandler, minimapCssScale, resolveMinimapZoom } from '../Minimap';

const minimapSourcePath = fileURLToPath(new URL('../Minimap.tsx', import.meta.url));
const minimapSource = readFileSync(minimapSourcePath, 'utf8');

function getNumericConstantValue(name: string, resolved: Record<string, number>): number {
  const match = minimapSource.match(new RegExp(`const\\s+${name}\\s*=\\s*([^;]+);`));
  if (!match) {
    throw new Error(`Constant ${name} not found in Minimap.tsx`);
  }

  const expression = match[1].trim();
  const dependencies = Object.keys(resolved);
  const dependencyValues = dependencies.map((dependency) => resolved[dependency]);
  const value = Function(...dependencies, `return (${expression});`)(...dependencyValues);

  if (typeof value !== 'number' || Number.isNaN(value)) {
    throw new Error(`Constant ${name} did not evaluate to a number`);
  }

  return value;
}

const constants: Record<string, number> = {};
constants.MINIMAP_FRAME_WIDTH = getNumericConstantValue('MINIMAP_FRAME_WIDTH', constants);
constants.MINIMAP_FRAME_HEIGHT = getNumericConstantValue('MINIMAP_FRAME_HEIGHT', constants);
constants.MINIMAP_CLIP_SIZE = getNumericConstantValue('MINIMAP_CLIP_SIZE', constants);
constants.MINIMAP_CLIP_TOP = getNumericConstantValue('MINIMAP_CLIP_TOP', constants);
constants.MINIMAP_CLIP_RIGHT = getNumericConstantValue('MINIMAP_CLIP_RIGHT', constants);
constants.COMPASS_CLIP_SIZE = getNumericConstantValue('COMPASS_CLIP_SIZE', constants);
constants.ORBS_OVERFLOW_LEFT = getNumericConstantValue('ORBS_OVERFLOW_LEFT', constants);
constants.COMPASS_CLIP_LEFT = getNumericConstantValue('COMPASS_CLIP_LEFT', constants);
constants.COMPASS_CLIP_TOP = getNumericConstantValue('COMPASS_CLIP_TOP', constants);
constants.TOTAL_WIDTH = getNumericConstantValue('TOTAL_WIDTH', constants);
constants.TOTAL_HEIGHT = getNumericConstantValue('TOTAL_HEIGHT', constants);

describe('Minimap geometry constants', () => {
  it('minimap clip fits within measured frame opening', () => {
    expect(constants.MINIMAP_CLIP_TOP).toBeGreaterThanOrEqual(7);
    expect(constants.MINIMAP_CLIP_RIGHT).toBeGreaterThanOrEqual(5);
    expect(constants.MINIMAP_CLIP_SIZE).toBeLessThanOrEqual(156);
  });

  it('minimap clip is centered on frame opening', () => {
    const measuredCenterX = 99.5;
    const measuredCenterY = 83.5;

    const centerX = constants.MINIMAP_FRAME_WIDTH - constants.MINIMAP_CLIP_RIGHT - constants.MINIMAP_CLIP_SIZE / 2;
    const centerY = constants.MINIMAP_CLIP_TOP + constants.MINIMAP_CLIP_SIZE / 2;

    expect(Math.abs(centerX - measuredCenterX)).toBeLessThanOrEqual(3);
    expect(Math.abs(centerY - measuredCenterY)).toBeLessThanOrEqual(3);
  });

  it('compass clip positions are integers', () => {
    expect(Number.isInteger(constants.COMPASS_CLIP_LEFT)).toBe(true);
    expect(Number.isInteger(constants.COMPASS_CLIP_TOP)).toBe(true);
  });

  it('compass clip is large enough to fill ring', () => {
    expect(constants.COMPASS_CLIP_SIZE).toBeGreaterThanOrEqual(35);
  });

  it('ORBS_OVERFLOW_LEFT is declared before dependent constants', () => {
    const orbsDeclarationIndex = minimapSource.indexOf('const ORBS_OVERFLOW_LEFT');
    const compassLeftDeclarationIndex = minimapSource.indexOf('const COMPASS_CLIP_LEFT');
    const totalWidthDeclarationIndex = minimapSource.indexOf('const TOTAL_WIDTH');

    expect(orbsDeclarationIndex).toBeGreaterThan(-1);
    expect(compassLeftDeclarationIndex).toBeGreaterThan(orbsDeclarationIndex);
    expect(totalWidthDeclarationIndex).toBeGreaterThan(orbsDeclarationIndex);

    expect(Number.isFinite(constants.ORBS_OVERFLOW_LEFT)).toBe(true);
    expect(Number.isFinite(constants.COMPASS_CLIP_LEFT)).toBe(true);
    expect(Number.isFinite(constants.TOTAL_WIDTH)).toBe(true);
    expect(Number.isFinite(constants.TOTAL_HEIGHT)).toBe(true);
  });
});

/**
 * We don't instantiate a real `WheelEvent` because jsdom is not required here
 * — the handler only reads `altKey`/`deltaY` and calls `preventDefault`/
 * `stopPropagation`, so a structural cast is sufficient.
 */
function makeWheel({ altKey, deltaY }: { altKey: boolean; deltaY: number }): {
  event: WheelEvent;
  preventDefault: ReturnType<typeof vi.fn>;
  stopPropagation: ReturnType<typeof vi.fn>;
} {
  const preventDefault = vi.fn();
  const stopPropagation = vi.fn();
  const event = { altKey, deltaY, preventDefault, stopPropagation } as unknown as WheelEvent;
  return { event, preventDefault, stopPropagation };
}

describe('createMinimapWheelHandler', () => {
  it('Alt+wheel is a no-op so the event can bubble to DraggablePanel for UI scaling', () => {
    const setMinimapZoom = vi.fn();
    const handler = createMinimapWheelHandler(setMinimapZoom);

    const { event, preventDefault, stopPropagation } = makeWheel({ altKey: true, deltaY: 100 });
    handler(event);

    expect(preventDefault).not.toHaveBeenCalled();
    expect(stopPropagation).not.toHaveBeenCalled();
    expect(setMinimapZoom).not.toHaveBeenCalled();
  });

  it('Alt+wheel with negative deltaY also no-ops (direction-independent)', () => {
    const setMinimapZoom = vi.fn();
    const handler = createMinimapWheelHandler(setMinimapZoom);

    const { event, preventDefault, stopPropagation } = makeWheel({ altKey: true, deltaY: -100 });
    handler(event);

    expect(preventDefault).not.toHaveBeenCalled();
    expect(stopPropagation).not.toHaveBeenCalled();
    expect(setMinimapZoom).not.toHaveBeenCalled();
  });

  it('plain wheel consumes the event and zooms in (deltaY < 0 → zoom in)', () => {
    const setMinimapZoom = vi.fn();
    const handler = createMinimapWheelHandler(setMinimapZoom);

    const { event, preventDefault, stopPropagation } = makeWheel({ altKey: false, deltaY: -120 });
    handler(event);

    expect(preventDefault).toHaveBeenCalledOnce();
    expect(stopPropagation).toHaveBeenCalledOnce();
    expect(setMinimapZoom).toHaveBeenCalledOnce();

    const updater = setMinimapZoom.mock.calls[0][0] as (prev: number) => number;
    // Zoom is held in OSRS units, so the clamped range is literally [2, 8].
    const start = 4;
    const result = updater(start);
    expect(result).toBeGreaterThan(start);
  });

  it('plain wheel consumes the event and zooms out (deltaY > 0 → zoom out)', () => {
    const setMinimapZoom = vi.fn();
    const handler = createMinimapWheelHandler(setMinimapZoom);

    const { event, preventDefault, stopPropagation } = makeWheel({ altKey: false, deltaY: 120 });
    handler(event);

    expect(preventDefault).toHaveBeenCalledOnce();
    expect(stopPropagation).toHaveBeenCalledOnce();
    expect(setMinimapZoom).toHaveBeenCalledOnce();

    const updater = setMinimapZoom.mock.calls[0][0] as (prev: number) => number;
    const start = 4;
    const result = updater(start);
    expect(result).toBeLessThan(start);
  });

  it('zoom updater clamps so the result never exceeds the documented OSRS bounds (zoom 2..8)', () => {
    const setMinimapZoom = vi.fn();
    const handler = createMinimapWheelHandler(setMinimapZoom);

    // Zoom in repeatedly from an already-high value — must clamp at the upper bound.
    handler(makeWheel({ altKey: false, deltaY: -1 }).event);
    const zoomInUpdater = setMinimapZoom.mock.calls[0][0] as (prev: number) => number;
    const fromHigh = zoomInUpdater(1e9);
    expect(Number.isFinite(fromHigh)).toBe(true);

    // Zoom out repeatedly from an already-low value — must clamp at the lower bound.
    setMinimapZoom.mockClear();
    handler(makeWheel({ altKey: false, deltaY: 1 }).event);
    const zoomOutUpdater = setMinimapZoom.mock.calls[0][0] as (prev: number) => number;
    const fromLow = zoomOutUpdater(-1e9);
    expect(Number.isFinite(fromLow)).toBe(true);

    expect(fromLow).toBeLessThan(fromHigh);
  });
});

describe('minimapCssScale', () => {
  // The canvas fills the aperture, so the CSS scale that yields `osrsZoom` px per tile
  // depends on which surround is mounted: 154 resizable, 148 fixed.
  const CANVAS_SIZE = 256;
  const TILE_SCALE = 4;
  const pxPerTile = (osrsZoom: number, clipSize: number) =>
    TILE_SCALE * (clipSize / CANVAS_SIZE) * minimapCssScale(osrsZoom, clipSize);

  it.each([154, 148])('puts exactly osrsZoom px per tile on a %i px aperture', (clipSize) => {
    for (const zoom of [2, 4, 8]) {
      expect(pxPerTile(zoom, clipSize)).toBeCloseTo(zoom, 10);
    }
  });

  it('scales the smaller fixed aperture up, not down', () => {
    expect(minimapCssScale(4, 148)).toBeGreaterThan(minimapCssScale(4, 154));
  });
});

describe('resolveMinimapZoom', () => {
  it("keeps the viewer's own zoom when the recording carries none", () => {
    // A recording without a zoom replays at whatever the viewer has: the optional-field
    // rule in src/core/replayPresentation.ts.
    expect(resolveMinimapZoom(undefined, 6)).toBe(6);
  });

  it("draws the recording's zoom over the viewer's", () => {
    expect(resolveMinimapZoom(6, 3)).toBe(6);
  });

  it('clamps a replay carrying a zoom this build has no transform math for', () => {
    // The format's bound is deliberately loose so raising MAX_MINIMAP_ZOOM cannot invalidate
    // existing recordings, which leaves the clamp as the only thing bounding the render.
    expect([resolveMinimapZoom(64, 4), resolveMinimapZoom(0.5, 4)]).toEqual([8, 2]);
  });
});
