// @vitest-environment happy-dom

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  framePaintScale,
  getGameFrameRect,
  getGameViewportBounds,
  isInsideFrameRect,
  openMenuMappingFor,
  toElementClientPoint,
  toElementLocalPoint,
  toFrameLocalPoint,
  unstretchedClientPoint,
} from '../viewportBounds';

/** JSDOM returns zeroes from getBoundingClientRect, so tests must stub the frame rect. */
function mountFrame(rect: { left: number; top: number; right: number; bottom: number }): HTMLElement {
  const frame = document.createElement('div');
  frame.className = 'game-viewport-frame';
  document.body.appendChild(frame);
  frame.getBoundingClientRect = () =>
    ({
      x: rect.left,
      y: rect.top,
      left: rect.left,
      top: rect.top,
      right: rect.right,
      bottom: rect.bottom,
      width: rect.right - rect.left,
      height: rect.bottom - rect.top,
      toJSON: () => ({}),
    }) as DOMRect;
  return frame;
}

function setWindowSize(width: number, height: number): void {
  Object.defineProperty(window, 'innerWidth', { value: width, writable: true, configurable: true });
  Object.defineProperty(window, 'innerHeight', { value: height, writable: true, configurable: true });
}

describe('getGameViewportBounds', () => {
  beforeEach(() => {
    setWindowSize(1920, 1080);
  });

  afterEach(() => {
    document.body.innerHTML = '';
  });

  it('returns the full window rect when no .game-viewport-frame is present (fit mode / fallback)', () => {
    const bounds = getGameViewportBounds();
    expect(bounds).toEqual({ left: 0, top: 0, right: 1920, bottom: 1080 });
  });

  it('returns the frame rect unchanged when it fits inside the window (normal letterbox case)', () => {
    mountFrame({ left: 577, top: 288, right: 1343, bottom: 792 });

    const bounds = getGameViewportBounds();

    expect(bounds).toEqual({ left: 577, top: 288, right: 1343, bottom: 792 });
  });

  it('intersects the frame rect with the window when the frame overflows to the right', () => {
    mountFrame({ left: 0, top: 40, right: 2000, bottom: 1040 });

    const bounds = getGameViewportBounds();

    expect(bounds).toEqual({ left: 0, top: 40, right: 1920, bottom: 1040 });
  });

  it('intersects the frame rect with the window when the frame overflows to the left/top (negative offset)', () => {
    mountFrame({ left: -200, top: -100, right: 1800, bottom: 980 });

    const bounds = getGameViewportBounds();

    expect(bounds).toEqual({ left: 0, top: 0, right: 1800, bottom: 980 });
  });

  it('falls back to the window rect when the frame has zero width', () => {
    mountFrame({ left: 500, top: 500, right: 500, bottom: 800 });

    const bounds = getGameViewportBounds();

    expect(bounds).toEqual({ left: 0, top: 0, right: 1920, bottom: 1080 });
  });

  it('falls back to the window rect when the frame has zero height', () => {
    mountFrame({ left: 500, top: 500, right: 800, bottom: 500 });

    const bounds = getGameViewportBounds();

    expect(bounds).toEqual({ left: 0, top: 0, right: 1920, bottom: 1080 });
  });

  it('falls back to the window rect when the intersection is degenerate (frame entirely offscreen)', () => {
    mountFrame({ left: 3000, top: 3000, right: 4000, bottom: 4000 });

    const bounds = getGameViewportBounds();

    // Return the full window rather than a degenerate clamp zone that would anchor overlays to (0,0).
    expect(bounds).toEqual({ left: 0, top: 0, right: 1920, bottom: 1080 });
  });

  it('updates when window size changes (resize path)', () => {
    mountFrame({ left: 100, top: 50, right: 900, bottom: 650 });
    expect(getGameViewportBounds()).toEqual({ left: 100, top: 50, right: 900, bottom: 650 });

    setWindowSize(800, 600);
    expect(getGameViewportBounds()).toEqual({ left: 100, top: 50, right: 800, bottom: 600 });
  });
});
describe('replay cursor frame geometry', () => {
  it('reports a point on a sidebar as outside the reproducible surface', () => {
    // The sidebars overlay the frame rather than resize it, so a point over one is
    // geometrically inside the frame rect while sitting on UI playback never
    // recreates.
    const rect = { left: 0, top: 0, width: 1280, height: 720 };
    const insets = { left: 320, right: 0 };

    expect(isInsideFrameRect({ x: 200, y: 300 }, rect, insets)).toBe(false);
    expect(isInsideFrameRect({ x: 400, y: 300 }, rect, insets)).toBe(true);
    // Without insets the whole rect counts, which is the no-sidebar case.
    expect(isInsideFrameRect({ x: 200, y: 300 }, rect)).toBe(true);
  });

  describe('toElementLocalPoint', () => {
    /** An element painted at `rect` while laid out at `layout` CSS pixels. */
    function makeScaledElement(
      layout: { width: number; height: number },
      rect: { left: number; top: number; width: number; height: number },
    ): HTMLElement {
      const element = document.createElement('div');
      Object.defineProperty(element, 'offsetWidth', { value: layout.width, configurable: true });
      Object.defineProperty(element, 'offsetHeight', { value: layout.height, configurable: true });
      element.getBoundingClientRect = () =>
        ({ ...rect, right: rect.left + rect.width, bottom: rect.top + rect.height }) as DOMRect;
      return element;
    }

    it('is a plain offset when nothing is scaled', () => {
      const element = makeScaledElement({ width: 1280, height: 720 }, { left: 40, top: 20, width: 1280, height: 720 });

      expect(toElementLocalPoint(element, 640, 380)).toEqual({ x: 600, y: 360 });
    });

    it('undoes an ancestor downscale so the point stays in unscaled canvas pixels', () => {
      const element = makeScaledElement({ width: 1280, height: 720 }, { left: 0, top: 0, width: 768, height: 432 });

      // Naively subtracting the painted origin would report (600, 300) here and
      // put the hovered tile 400px away from the cursor.
      expect(toElementLocalPoint(element, 600, 300)).toEqual({ x: 1000, y: 500 });
    });

    it('handles a scaled element that is also offset from the viewport origin', () => {
      const element = makeScaledElement({ width: 1000, height: 500 }, { left: 100, top: 50, width: 500, height: 250 });

      expect(toElementLocalPoint(element, 350, 175)).toEqual({ x: 500, y: 250 });
    });

    it('does not divide by a zero-sized element', () => {
      const element = makeScaledElement({ width: 0, height: 0 }, { left: 0, top: 0, width: 0, height: 0 });

      expect(toElementLocalPoint(element, 10, 10)).toEqual({ x: 10, y: 10 });
    });

    it.each([1, 0.5, 0.6375])('round-trips fractional points through scale %s and a translated origin', (scale) => {
      const element = makeScaledElement(
        { width: 1600, height: 1000 },
        { left: 53.25, top: 27.5, width: 1600 * scale, height: 1000 * scale },
      );

      const client = toElementClientPoint(element, 1234.375, 831.125);
      const local = toElementLocalPoint(element, client.clientX, client.clientY);

      expect(client.clientX).toBeCloseTo(53.25 + 1234.375 * scale, 10);
      expect(client.clientY).toBeCloseTo(27.5 + 831.125 * scale, 10);
      expect(local.x).toBeCloseTo(1234.375, 10);
      expect(local.y).toBeCloseTo(831.125, 10);
    });
  });
});

describe('a frame drawn stretched (Fixed: Stretch to Window)', () => {
  afterEach(() => {
    document.body.innerHTML = '';
  });

  /** A 1643x1080 frame drawn 1920 wide at (0, 0), as Stretch to Window draws 16:9 1080p. */
  function mountStretchedFrame(): HTMLElement {
    const frame = mountFrame({ left: 0, top: 0, right: 1920, bottom: 1080 });
    Object.defineProperty(frame, 'offsetWidth', { value: 1643, configurable: true });
    Object.defineProperty(frame, 'offsetHeight', { value: 1080, configurable: true });
    return frame;
  }

  it('reports the frame playback rebuilds: its layout size, with the stretch beside it', () => {
    mountStretchedFrame();
    const rect = getGameFrameRect();
    expect(rect).toMatchObject({ left: 0, top: 0, width: 1643, height: 1080, scaleY: 1 });
    expect(rect?.scaleX).toBeCloseTo(1920 / 1643, 10);
    // The far right of the painted frame is the far right of the laid-out one.
    const local = toFrameLocalPoint({ clientX: 1920, clientY: 540 }, rect!);
    expect(local.x).toBeCloseTo(1643, 10);
    expect(local.y).toBe(540);
    expect(isInsideFrameRect(local, rect!)).toBe(true);
  });

  it('reports an unstretched frame exactly as before', () => {
    const frame = mountFrame({ left: 10, top: 20, right: 775, bottom: 523 });
    Object.defineProperty(frame, 'offsetWidth', { value: 765, configurable: true });
    Object.defineProperty(frame, 'offsetHeight', { value: 503, configurable: true });
    expect(getGameFrameRect()).toEqual({ left: 10, top: 20, width: 765, height: 503 });
  });

  it('gives a panel inside the frame the stretch, and one outside none', () => {
    const frame = mountStretchedFrame();
    const panel = document.createElement('div');
    frame.appendChild(panel);
    expect(framePaintScale(panel).x).toBeCloseTo(1920 / 1643, 10);
    expect(framePaintScale(panel).y).toBe(1);
    expect(framePaintScale(document.body)).toEqual({ x: 1, y: 1 });
  });

  it('takes the stretch out of a client point about the panel origin', () => {
    const frame = mountStretchedFrame();
    const panel = document.createElement('div');
    frame.appendChild(panel);
    const rect = { left: 100, top: 200 } as DOMRect;
    const point = unstretchedClientPoint(panel, rect, 100 + (1920 / 1643) * 50, 230);
    expect(point.clientX).toBeCloseTo(150, 10);
    expect(point.clientY).toBe(230);
  });

  it('maps an open menu rigidly: centered on the same frame point, its top on the same row', () => {
    const frame = { left: 0, top: 0, width: 765, height: 503, scaleX: 2, scaleY: 1.5 };
    const menu = new DOMRect(400, 300, 120, 90);
    const mapping = openMenuMappingFor(frame, menu);
    // Center 460 -> 230, so the left is 170; top 300 -> 200.
    expect(mapping).toMatchObject({ shiftX: 170 - 400, shiftY: 200 - 300 });
    const at = (clientX: number, clientY: number) =>
      toFrameLocalPoint({ clientX, clientY }, { ...frame, openMenu: mapping ?? undefined });
    // Over the menu, offsets inside it are kept; off it, the frame divides per axis.
    expect(at(450, 362)).toEqual({ x: 220, y: 262 });
    expect(at(10, 30)).toEqual({ x: 5, y: 20 });
  });

  it('keeps a stretched menu inside the frame playback rebuilds', () => {
    const frame = { left: 0, top: 0, width: 765, height: 503, scaleX: 1, scaleY: 2 };
    // Live at the painted bottom edge: halved, its bottom would still be past the layout frame.
    const mapping = openMenuMappingFor(frame, new DOMRect(300, 950, 120, 50));
    expect(950 + (mapping?.shiftY ?? 0)).toBe(503 - 50);
  });

  it('has no mapping where the frame is not stretched', () => {
    expect(openMenuMappingFor({ left: 0, top: 0, width: 765, height: 503 }, new DOMRect(10, 10, 50, 50))).toBeNull();
  });
});
