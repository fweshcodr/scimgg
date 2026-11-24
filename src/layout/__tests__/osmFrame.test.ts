import { describe, expect, it } from 'vitest';
import {
  isOsmInterfaceScaling,
  OSM_INTERFACE_SCALING_DEFAULT,
  OSM_INTERFACE_SCALING_OPTIONS,
  osmChromeLayout,
  osmChromeScale,
  osmHotkeyContent,
  osmHotkeysPlacement,
  osmPopoutPlacement,
  osmSidePanelOnLeft,
  osmSidePanelPlacement,
  osmTabRailPlacement,
} from '../osmClientLayout';
import { osmCssRect, osmFrame, osmFramePlaced, osmLeftColumnRight } from '../osmFrame';
import { type Size, scaleRect } from '../osrsClientLayout';

const NO_INSETS = { top: 0, right: 0, bottom: 0, left: 0 };
type Insets = typeof NO_INSETS;

/** CSS pixels per logical pixel for this setting and pixel ratio, on a CSS viewport and safe area. */
function scaleAt(
  interfaceScaling: number,
  devicePixelRatio: number,
  viewport: Size,
  safeAreaInsets: Insets = NO_INSETS,
): number {
  return osmChromeScale({ interfaceScaling, devicePixelRatio, viewport, safeAreaInsets });
}

/** A screen given in device pixels, as the measurements were taken, and its safe area. */
function deviceScreen(width: number, height: number, dpr: number, deviceInsets: Insets = NO_INSETS) {
  return {
    dpr,
    viewport: { width: width / dpr, height: height / dpr },
    insets: {
      top: deviceInsets.top / dpr,
      right: deviceInsets.right / dpr,
      bottom: deviceInsets.bottom / dpr,
      left: deviceInsets.left / dpr,
    },
  };
}
type DeviceScreen = ReturnType<typeof deviceScreen>;

/** Device pixels per logical pixel, the unit the client was measured in. */
function deviceScaleAt(zoom: number, screen: DeviceScreen): number {
  return scaleAt(zoom, screen.dpr, screen.viewport, screen.insets) * screen.dpr;
}

/** The whole screen and the safe-area gameframe, in logical pixels. */
function logicalAt(zoom: number, screen: DeviceScreen) {
  const scale = scaleAt(zoom, screen.dpr, screen.viewport, screen.insets);
  return {
    full: osmFrame(screen.viewport, NO_INSETS, scale).size,
    safe: osmFrame(screen.viewport, screen.insets, scale).size,
  };
}

const HIGH_SETTINGS = [225, 250, 275, 300, 325, 350, 375, 400];

describe('Interface scaling', () => {
  it('offers 175% to 400% in steps of 25, defaulting to 400%', () => {
    expect(OSM_INTERFACE_SCALING_OPTIONS).toEqual([175, 200, 225, 250, 275, 300, 325, 350, 375, 400]);
    expect(OSM_INTERFACE_SCALING_DEFAULT).toBe(400);
    expect(isOsmInterfaceScaling(150)).toBe(false);
    expect(isOsmInterfaceScaling(210)).toBe(false);
    expect(isOsmInterfaceScaling('400')).toBe(false);
  });
});

describe('osmChromeScale', () => {
  // A Pixel 10 Pro, 2410x1080 landscape at DPR 2.625, its safe area 20 device px short at the
  // top and bottom. Measured: 175% -> 1.75, 200% -> 2.0, 225-400% -> about 2.069.
  const PIXEL = deviceScreen(2410, 1080, 2.625, { top: 20, right: 0, bottom: 20, left: 0 });

  it('follows the setting while the safe area stays over 894x503 (Pixel: 175% -> 1.75, 200% -> 2.0)', () => {
    expect(deviceScaleAt(175, PIXEL)).toBeCloseTo(2410 / 1377, 9);
    expect(deviceScaleAt(175, PIXEL)).toBeCloseTo(1.75, 3);
    expect(deviceScaleAt(200, PIXEL)).toBeCloseTo(2, 9);
    expect(logicalAt(175, PIXEL).full.width).toBe(1377);
    expect(logicalAt(200, PIXEL).full.width).toBe(1205);
  });

  it('grows the screen to 522 rows so the safe area keeps 503 (Pixel: 225-400% all about 2.069)', () => {
    for (const zoom of HIGH_SETTINGS) {
      // h = 522, the width following it: round(2410 * 522 / 1080) = 1165.
      expect(deviceScaleAt(zoom, PIXEL)).toBeCloseTo(2410 / 1165, 9);
      expect(logicalAt(zoom, PIXEL).full.width).toBe(1165);
    }
    expect(deviceScaleAt(225, PIXEL)).toBeCloseTo(2.069, 3);
    // The safe area falls a fraction short of 503: the minimum is floored.
    expect(logicalAt(400, PIXEL).safe.height).toBeCloseTo((1040 * 1165) / 2410, 9);
    expect(logicalAt(400, PIXEL).safe.height).toBeGreaterThan(502);
  });

  it('lets the width minimum bind on a 16:10 tablet (Samsung, 400% -> 908 columns, 568 rows)', () => {
    const tablet = deviceScreen(2560, 1600, 2, { top: 20, right: 20, bottom: 20, left: 20 });
    // minW = floor(2560 * 894 / 2520) = 908, then h = round(1600 * 908 / 2560) = 568. The
    // scale holds the whole 908x568 canvas, so the rounded-up rows set it.
    expect(deviceScaleAt(400, tablet)).toBeCloseTo(1600 / 568, 9);
    expect(logicalAt(400, tablet).full.height).toBe(568);
    expect(logicalAt(400, tablet).full.width).toBeCloseTo(908.8, 9);
    expect(logicalAt(400, tablet).safe.width).toBeGreaterThan(894);
    for (const zoom of [300, 325, 350, 375]) expect(deviceScaleAt(zoom, tablet)).toBe(deviceScaleAt(400, tablet));
    // Below about 282% every setting is its own size, the chrome smaller as the setting drops.
    expect(deviceScaleAt(275, tablet)).toBeCloseTo(2560 / 930, 9);
    expect(deviceScaleAt(250, tablet)).toBeCloseTo(2.5, 9);
    expect(deviceScaleAt(200, tablet)).toBeCloseTo(2, 9);
    expect(deviceScaleAt(175, tablet)).toBeCloseTo(1600 / 914, 9);
  });

  it('applies the same rule to a landscape iPhone (DPR 3, 852x393, notch and home indicator)', () => {
    const iphone = deviceScreen(852 * 3, 393 * 3, 3, { top: 0, right: 59 * 3, bottom: 21 * 3, left: 59 * 3 });
    // minH = floor(1179 * 503 / 1116) = 531 binds after the width's 1037: w = round(2556 * 531 / 1179) = 1151.
    for (const zoom of HIGH_SETTINGS) expect(logicalAt(zoom, iphone).full.height).toBe(531);
    expect(scaleAt(400, 3, iphone.viewport, iphone.insets)).toBeCloseTo(393 / 531, 9);
    expect(logicalAt(400, iphone).full.width).toBeGreaterThan(1151);
    expect(logicalAt(200, iphone).full.width).toBe(1278);
    expect(logicalAt(175, iphone).full.width).toBe(1460);
  });

  it('applies the same rule to an iPad (DPR 2, 1180x820, status bar and home indicator)', () => {
    const ipad = deviceScreen(2360, 1640, 2, { top: 48, right: 0, bottom: 40, left: 0 });
    for (const zoom of [275, 300, 400]) expect(logicalAt(zoom, ipad).full.width).toBe(894);
    expect(scaleAt(400, 2, ipad.viewport, ipad.insets)).toBeCloseTo(1180 / 894, 9);
    expect(logicalAt(250, ipad).full.width).toBe(944);
    expect(scaleAt(300, 2, { width: 1180, height: 820 })).toBeCloseTo(1180 / 894, 9);
    // 175%: 1348x937, the rows setting the scale.
    expect(scaleAt(175, 2, { width: 1180, height: 820 })).toBeCloseTo(820 / 937, 9);
  });

  it('keeps a screen without insets at least 503 rows tall where the height binds', () => {
    // 2400x1080 at DPR 1: minW 894 gives 402 rows, so h = 503 and w = round(2400 * 503 / 1080).
    const wide = { width: 2400, height: 1080 };
    for (const zoom of HIGH_SETTINGS) expect(scaleAt(zoom, 1, wide)).toBe(2400 / 1118);
    const frame = osmFrame(wide, NO_INSETS, scaleAt(400, 1, wide));
    expect(frame.size.width).toBe(1118);
    expect(frame.size.height).toBeCloseTo(503.1, 9);
    expect(scaleAt(200, 1, wide)).toBe(2);
  });

  it('never rounds a binding 503 rows under 503 (a 1920x1080 desktop forced to Mobile)', () => {
    // minW 894 gives h = round(1080 * 894 / 1920) = 503; 1920 / 894 would leave 502.88 rows.
    const desktop = { width: 1920, height: 1080 };
    for (const zoom of HIGH_SETTINGS) expect(scaleAt(zoom, 1, desktop)).toBe(1080 / 503);
    const frame = osmFrame(desktop, NO_INSETS, scaleAt(400, 1, desktop));
    expect(frame.size.height).toBe(503);
    expect(frame.size.width).toBeGreaterThan(894);
  });

  it('gives a portrait viewport its landscape scale, so the chrome is one size either way up', () => {
    const upright = { width: 390, height: 844 };
    const rotated = { width: 844, height: 390 };
    const uprightInsets = { top: 47, right: 0, bottom: 34, left: 0 };
    const rotatedInsets = { top: 0, right: 34, bottom: 0, left: 47 };
    for (const zoom of [175, 200, 400]) {
      expect(scaleAt(zoom, 3, upright, uprightInsets)).toBe(scaleAt(zoom, 3, rotated, rotatedInsets));
    }
    // Not 894 logical columns across 390 CSS px.
    expect(scaleAt(400, 3, upright, uprightInsets)).toBeGreaterThan(0.77);
  });

  it('treats a missing pixel ratio as 1 and an unmeasured viewport as the setting alone', () => {
    const viewport = { width: 1000, height: 600 };
    expect(scaleAt(175, Number.NaN, viewport)).toBe(scaleAt(175, 1, viewport));
    expect(scaleAt(175, 0, viewport)).toBe(scaleAt(175, 1, viewport));
    expect(scaleAt(400, 2, { width: 0, height: 0 })).toBe(2);
    expect(scaleAt(175, 3, { width: Number.NaN, height: 600 })).toBe(1.75 / 3);
  });

  it('ignores unusable insets: negative or non-finite as zero, none left as no insets', () => {
    const viewport = { width: 1000, height: 600 };
    const bare = scaleAt(400, 2, viewport);
    expect(scaleAt(400, 2, viewport, { top: -5, right: Number.NaN, bottom: 0, left: 0 })).toBe(bare);
    expect(scaleAt(400, 2, viewport, { top: 300, right: 0, bottom: 300, left: 0 })).toBe(bare);
  });

  it('falls back to the default for a setting off the slider', () => {
    expect(scaleAt(150, 1, { width: 2400, height: 1080 })).toBe(scaleAt(400, 1, { width: 2400, height: 1080 }));
  });
});

describe('osmChromeLayout', () => {
  it('bottom-anchors rail and panel on a short gameframe', () => {
    const layout = osmChromeLayout({ width: 900, height: 450 }, false);
    expect(layout.tabRail).toEqual({ x: 900 - 85, y: 450 - 280 - 4, width: 85, height: 280 });
    expect(layout.sidePanel).toEqual({ x: 900 - 85 - 204, y: 450 - 275 - 4, width: 204, height: 275 });
    expect(layout.mapContainer).toEqual({ x: 900 - 234, y: 0, width: 234, height: 207 });
  });

  it('centers them 87 rows low from 503 up, and follows the collapsed rail', () => {
    const layout = osmChromeLayout({ width: 1180, height: 820 }, true);
    expect(layout.tabRail).toEqual({
      x: 1180 - 58,
      y: osmTabRailPlacement(820, true).top,
      width: 58,
      height: 280,
    });
    expect(layout.tabRail.y).toBe(Math.trunc((820 - 280) / 2) + 87);
    expect(layout.sidePanel.x).toBe(1180 - 58 - 204);
    expect(layout.sidePanel.y).toBe(osmSidePanelPlacement(820, true).top);
  });
});

describe('osmFrame', () => {
  const PHONE = { width: 844, height: 390 };
  const HOME_INDICATOR = { top: 0, right: 47, bottom: 21, left: 47 };

  it('is the viewport minus the safe area, measured in logical pixels', () => {
    const scale = scaleAt(400, 3, PHONE, HOME_INDICATOR);
    const frame = osmFrame(PHONE, HOME_INDICATOR, scale);
    expect(frame.origin).toEqual({ x: 47, y: 0 });
    expect(frame.scale).toBe(scale);
    expect(frame.size.width * frame.scale).toBeCloseTo(844 - 94);
    expect(frame.size.height * frame.scale).toBeCloseTo(369);
  });

  it('takes its scale from the full viewport and the safe area, which keeps about 894x503', () => {
    const scale = scaleAt(400, 3, PHONE, HOME_INDICATOR);
    // The insets enlarge the logical screen: the safe area, not the screen, meets the minimum.
    expect(scale).toBeLessThan(scaleAt(400, 3, PHONE));
    const frame = osmFrame(PHONE, HOME_INDICATOR, scale);
    expect(frame.size.width).toBeGreaterThan(893);
    expect(frame.size.height).toBeGreaterThan(502);
    expect(osmFrame(PHONE, NO_INSETS, scaleAt(400, 3, PHONE)).size.height).toBeGreaterThanOrEqual(503);
  });

  it('feeds the logical height into the placement rules: below 503 bottom-anchors, from 503 centers', () => {
    // The floored minimum leaves this phone's safe area a fraction under 503 rows.
    const phone = osmFrame(PHONE, HOME_INDICATOR, scaleAt(400, 3, PHONE, HOME_INDICATOR));
    const tablet = osmFrame({ width: 1180, height: 820 }, NO_INSETS, scaleAt(400, 2, { width: 1180, height: 820 }));
    // A lower setting draws the chrome smaller, so the same phone gets a taller frame.
    const smallChrome = osmFrame(PHONE, HOME_INDICATOR, scaleAt(175, 3, PHONE, HOME_INDICATOR));
    expect(phone.size.height).toBeLessThan(503);
    expect(osmTabRailPlacement(phone.size.height, false).top).toBeCloseTo(phone.size.height - 280 - 4);
    expect(tablet.size.height).toBeGreaterThanOrEqual(503);
    expect(smallChrome.size.height).toBeGreaterThanOrEqual(503);
  });

  it('snaps in gameframe space, then offsets by the safe-area origin', () => {
    const insets = { top: 0, right: 0, bottom: 0, left: 30 };
    const frame = osmFrame(PHONE, insets, scaleAt(400, 3, PHONE, insets));
    const rail = osmChromeLayout(frame.size, false).tabRail;
    const snapped = scaleRect(rail, frame.scale);
    expect(osmCssRect(frame, rail)).toEqual({ ...snapped, x: snapped.x + 30 });
    // Right-anchored chrome lands flush with the viewport's right edge.
    const css = osmCssRect(frame, rail);
    expect(css.x + css.width).toBe(844);
  });
});

describe('left column (popout, hotkeys)', () => {
  it('stacks hotkeys directly on the pop-out, bottom-left on a short frame', () => {
    const hotkeys = osmHotkeysPlacement(450, false);
    expect(hotkeys.y + hotkeys.height).toBe(osmPopoutPlacement(450).y);
    expect(osmPopoutPlacement(450)).toEqual({ x: 0, y: 450 - 4 - 46, width: 58, height: 46 });
  });

  it('lays out five stones from row 10 at the 39-row pitch, the toggle closing the column', () => {
    const content = osmHotkeyContent(5, false);
    expect(content.height).toBe(10 + 5 * 39 + 33);
    expect(content.stones.map((stone) => stone.y)).toEqual([10, 49, 88, 127, 166]);
    expect(content.stones.every((stone) => stone.x === 9)).toBe(true);
    expect(content.toggle).toEqual({ x: 0, y: content.height - 33, width: 58, height: 33 });
    expect(osmHotkeyContent(5, true)).toMatchObject({ height: 43, stones: [] });
  });

  it('puts a hotkey-opened panel at LEFT 58 when the setting is on', () => {
    expect(osmSidePanelOnLeft(true, true)).toBe(true);
    expect(osmSidePanelOnLeft(true, false)).toBe(false);
    expect(osmSidePanelOnLeft(false, true)).toBe(false);
    expect(osmChromeLayout({ width: 900, height: 450 }, false, true).sidePanel.x).toBe(58);
  });

  it('measures the left column in viewport pixels', () => {
    const viewport = { width: 1180, height: 820 };
    const insets = { top: 0, right: 0, bottom: 0, left: 30 };
    const scale = scaleAt(400, 2, viewport, insets);
    const frame = osmFrame(viewport, insets, scale);
    expect(osmLeftColumnRight(frame)).toBe(30 + Math.round(58 * scale));
  });
});

describe('osmFramePlaced', () => {
  const insets = { top: 0, right: 34, bottom: 21, left: 47 };
  const size = { width: 844, height: 390 };
  const placement = { scale: 1.5, offsetX: 100, offsetY: 20 };

  it("places the recorder's gameframe inside the fitted replay frame", () => {
    const recordedScale = scaleAt(400, 3, size, insets);
    const recorded = osmFrame(size, insets, recordedScale);
    const replayed = osmFramePlaced(size, insets, recordedScale, placement);
    expect(replayed.size).toEqual(recorded.size);
    expect(replayed.scale).toBeCloseTo(recorded.scale * 1.5);
    expect(replayed.origin).toEqual({ x: 100 + 47 * 1.5, y: 20 });
  });

  it('uses the recorded scale, so a recording at 175% replays at 175% on any screen', () => {
    const recordedScale = scaleAt(175, 3, size, insets);
    const replayed = osmFramePlaced(size, insets, recordedScale, placement);
    expect(replayed.scale).toBeCloseTo(recordedScale * 1.5);
    expect(replayed.size).toEqual(osmFrame(size, insets, recordedScale).size);
    expect(replayed.size).not.toEqual(osmFrame(size, insets, scaleAt(400, 3, size, insets)).size);
  });

  it("puts a locked resolution's left column at its centered frame, not the window's edge", () => {
    const frame = { width: 640, height: 300 };
    const chromeScale = scaleAt(400, 3, frame, insets);
    const live = osmFramePlaced(frame, insets, chromeScale, { scale: 1, offsetX: 102, offsetY: 45 });
    const unplaced = osmFrame(frame, insets, chromeScale);
    expect(live.scale).toBe(unplaced.scale);
    expect(osmLeftColumnRight(live)).toBeCloseTo(102 + osmLeftColumnRight(unplaced));
    expect(live.origin.y).toBe(45 + unplaced.origin.y);
  });
});

describe('recorded taps on the left column during playback', () => {
  // A phone recording is frame-local, and on a phone the frame is the window. Playback draws a
  // recorded frame point at offset + point * scale (computeReplayPresentationLayout).
  const insets = { top: 0, right: 34, bottom: 21, left: 47 };
  const recordedSize = { width: 844, height: 390 };
  const placement = { scale: 1.6, offsetX: 152, offsetY: 38 };
  const recordedScale = scaleAt(400, 3, recordedSize, insets);
  const recorder = osmFrame(recordedSize, insets, recordedScale);
  const replayed = osmFramePlaced(recordedSize, insets, recordedScale, placement);

  it.each([
    ['pop-out', osmPopoutPlacement(recorder.size.height)],
    ['full-screen stone', { x: 0, y: 4, width: 58, height: 46 }],
  ])("lands a tap on the recorder's %s on the one playback draws", (_name, piece) => {
    const tapped = osmCssRect(recorder, piece);
    const tap = { x: tapped.x + tapped.width / 2, y: tapped.y + tapped.height / 2 };
    const shown = osmCssRect(replayed, piece);
    const replayedTap = {
      x: placement.offsetX + tap.x * placement.scale,
      y: placement.offsetY + tap.y * placement.scale,
    };
    expect(replayedTap.x).toBeGreaterThan(shown.x);
    expect(replayedTap.x).toBeLessThan(shown.x + shown.width);
    expect(replayedTap.y).toBeGreaterThan(shown.y);
    expect(replayedTap.y).toBeLessThan(shown.y + shown.height);
    expect(Math.abs(shown.x - (placement.offsetX + tapped.x * placement.scale))).toBeLessThanOrEqual(1);
    expect(Math.abs(shown.y - (placement.offsetY + tapped.y * placement.scale))).toBeLessThanOrEqual(1);
  });
});
