import { describe, expect, it } from 'vitest';
import { centredInUncovered, frameOrigin, sidebarOverlap, uncoveredCentreX } from '../viewportLayout';

const SIDEBAR = 320;
const LEFT = { left: SIDEBAR, right: 0 };
const RIGHT = { left: 0, right: SIDEBAR };
const BOTH = { left: SIDEBAR, right: SIDEBAR };
const at = (width: number, height: number) => ({ left: 0, top: 0, width, height });

describe('uncoveredCentreX', () => {
  it('is the window center with no sidebars, and the center of the room beside them otherwise', () => {
    expect(uncoveredCentreX(1280)).toBe(640);
    expect(uncoveredCentreX(1280, LEFT)).toBe(800);
    expect(uncoveredCentreX(1280, RIGHT)).toBe(480);
    expect(uncoveredCentreX(1280, BOTH)).toBe(640);
  });
});

describe('centredInUncovered', () => {
  it('centers on the whole span with no sidebars', () => {
    expect(centredInUncovered(1280, 765)).toBe(257.5);
  });

  it('centers in the room the sidebars leave when the box fits there', () => {
    expect(centredInUncovered(1920, 765, SIDEBAR, 0)).toBe(320 + (1600 - 765) / 2);
    expect(centredInUncovered(1920, 765, 0, SIDEBAR)).toBe((1600 - 765) / 2);
    expect(centredInUncovered(1920, 765, SIDEBAR, SIDEBAR)).toBe(320 + (1280 - 765) / 2);
  });

  it('reaches under the sidebars no further than staying on the span needs', () => {
    // 960 left beside the Settings drawer is too little for 1100: it stays flush with the right edge.
    expect(centredInUncovered(1280, 1100, SIDEBAR, 0)).toBe(180);
    expect(centredInUncovered(1280, 1100, 0, SIDEBAR)).toBe(0);
    // Both open: the room beside them shares the span's center.
    expect(centredInUncovered(1280, 765, SIDEBAR, SIDEBAR)).toBe(257.5);
  });

  it('starts a box longer than the span at its leading edge, sidebars or not', () => {
    expect(centredInUncovered(1280, 1920)).toBe(0);
    expect(centredInUncovered(1280, 1920, SIDEBAR, 0)).toBe(0);
    expect(centredInUncovered(1280, 1920, 0, SIDEBAR)).toBe(0);
  });
});

describe('frameOrigin', () => {
  it('centers a frame that fits on whole pixels', () => {
    expect(frameOrigin({ width: 640, height: 300 }, at(844, 390))).toEqual({ x: 102, y: 45 });
    expect(frameOrigin({ width: 765, height: 503 }, at(1280, 720))).toEqual({ x: 258, y: 109 });
  });

  it('pins a frame larger than the window to the top-left edge', () => {
    expect(frameOrigin({ width: 1920, height: 1080 }, at(1280, 720))).toEqual({ x: 0, y: 0 });
    expect(frameOrigin({ width: 1920, height: 1080 }, at(1280, 720), LEFT)).toEqual({ x: 0, y: 0 });
  });

  it('centers beside the open sidebars, on whole pixels, and never moves vertically for them', () => {
    const fixed = { width: 765, height: 503 };
    expect(frameOrigin(fixed, at(1920, 1080), LEFT)).toEqual({ x: 738, y: 289 });
    expect(frameOrigin(fixed, at(1920, 1080), RIGHT)).toEqual({ x: 418, y: 289 });
    expect(frameOrigin(fixed, at(1920, 1080), BOTH)).toEqual({ x: 578, y: 289 });
    // Odd room: 1280 - 320 - 765 = 195 rounds onto a whole pixel.
    expect(frameOrigin(fixed, at(1280, 720), LEFT)).toEqual({ x: 418, y: 109 });
  });

  it('keeps a frame too wide for the room beside the sidebars on screen', () => {
    // Fixed at 2x in a 1920 window: 1530 does not fit the 1280 between both sidebars.
    expect(frameOrigin({ width: 1530, height: 1006 }, at(1920, 1080), BOTH)).toEqual({ x: 195, y: 37 });
    expect(frameOrigin({ width: 1530, height: 1006 }, at(1920, 1080), LEFT)).toEqual({ x: 355, y: 37 });
  });

  it('snaps where the frame lands on screen when the stage itself is off the pixel grid', () => {
    const stage = { left: 0.4, top: 0.25, width: 1000, height: 600 };
    const origin = frameOrigin({ width: 765, height: 503 }, stage);
    expect(stage.left + origin.x).toBeCloseTo(118, 9);
    expect(stage.top + origin.y).toBeCloseTo(49, 9);
  });
});

describe('sidebarOverlap', () => {
  it('is each sidebar itself over a frame that fills the window', () => {
    expect(sidebarOverlap({ x: 0, width: 1280 }, 1280, BOTH)).toEqual(BOTH);
    expect(sidebarOverlap({ x: 0, width: 1280 }, 1280, { left: 0, right: 0 })).toEqual({ left: 0, right: 0 });
  });

  it('is zero for a frame centered beside the sidebars', () => {
    const fixed = { width: 765, height: 503 };
    const x = frameOrigin(fixed, at(1920, 1080), BOTH).x;
    expect(sidebarOverlap({ x, width: fixed.width }, 1920, BOTH)).toEqual({ left: 0, right: 0 });
  });

  it('counts only the part of each sidebar that covers the frame', () => {
    // 765 centered in a 1280 window with both drawers open: 62.5 under each.
    expect(sidebarOverlap({ x: 257.5, width: 765 }, 1280, BOTH)).toEqual({ left: 62.5, right: 62.5 });
    // Flush right beside the Settings drawer: under it by what the room lacks.
    expect(sidebarOverlap({ x: 180, width: 1100 }, 1280, LEFT)).toEqual({ left: 140, right: 0 });
  });

  it('measures a frame wider than the window from its visible part, not its clipped edge', () => {
    // A 1920 frame pinned at 0 in a 1280 window: the Plugins drawer covers 320 of what shows.
    expect(sidebarOverlap({ x: 0, width: 1920 }, 1280, BOTH)).toEqual(BOTH);
  });

  it('never exceeds the frame', () => {
    expect(sidebarOverlap({ x: 100, width: 150 }, 1280, LEFT)).toEqual({ left: 150, right: 0 });
  });
});
