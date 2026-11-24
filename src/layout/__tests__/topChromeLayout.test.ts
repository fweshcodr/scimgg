import { describe, expect, it } from 'vitest';
import { infoboxContentScale } from '../../components/InfoBox/InfoBoxPanel';
import { LAUNCHER_ROW_MAX_SHARE, launcherRowFits, protectedPlayArea, sceneInFrame } from '../chromeBreakpoints';
import {
  balancedColumns,
  bossBarDefault,
  type ChromeFrame,
  chatboxInfoboxAnchor,
  chatboxInfoboxGrid,
  fpsPosition,
  intersects,
  launcherRowPosition,
  launcherRowUsesIcons,
  type PanePlacementInput,
  placePane,
  pluginsClearOfRow,
  pluginsPosition,
  type Rect,
} from '../topChromeLayout';

// The measured placement cases the chrome layout is pinned to.
const FIXED_1X: ChromeFrame = { rect: { x: 0, y: 0, width: 765, height: 503 }, fixed: true };
const MODERN_1270: ChromeFrame = { rect: { x: 0, y: 0, width: 1270, height: 747 }, fixed: false };
const ROW = { width: 254, height: 28 };
const BAR = { width: 239, height: 42 };

/**
 * The Chatbox strip `count` infoboxes make over Fixed 1x's chatbox at UI scale `uiScale`, in frame
 * pixels, as InfoBoxPanel lays it out (32px tiles, 2px gaps, damped by `infoboxContentScale`).
 */
function fixedStrip(count: number, uiScale: number, chatTop = 338) {
  const anchor = chatboxInfoboxAnchor({
    frame: { width: 765, height: 503 },
    fixed: true,
    chat: { x: 0, y: chatTop, width: 519, height: 503 - chatTop },
    zoom: 1,
  });
  const tile = 32 * infoboxContentScale(uiScale);
  const gap = 2 * infoboxContentScale(uiScale);
  const { columns, rows } = chatboxInfoboxGrid({ count, maxWidth: anchor.maxWidth, tile, gap, scale: uiScale });
  const width = (columns * tile + (columns - 1) * gap) * uiScale;
  const height = (rows * tile + (rows - 1) * gap) * uiScale;
  return { columns, rows, rect: { x: anchor.left, y: anchor.bottom - height, width, height } };
}

describe('the Chatbox infobox rows in Fixed 1x', () => {
  it("run the chat's width, so even many tiles take few rows", () => {
    expect(fixedStrip(16, 1)).toMatchObject({ columns: 8, rows: 2 });
    expect(fixedStrip(16, 1).rect.y).toBe(334 - 66);
    expect(fixedStrip(10, 1.5)).toMatchObject({ columns: 10, rows: 1 });
    expect(fixedStrip(60, 1)).toMatchObject({ columns: 12, rows: 5 });
  });
});

describe('the launcher row', () => {
  it('sits one gap from the window, or from the Fixed border over the frame', () => {
    expect(launcherRowPosition(ROW, MODERN_1270, 1)).toEqual({ x: 4, y: 4 });
    expect(launcherRowPosition(ROW, FIXED_1X, 1)).toEqual({ x: 8, y: 8 });
    // Fixed fitted to 1024x640: the border scales with the frame (round(4 * 973/765) = 5).
    const fitted: ChromeFrame = { rect: { x: 26, y: 0, width: 973, height: 640 }, fixed: true };
    expect(launcherRowPosition(ROW, fitted, 1)).toEqual({ x: 35, y: 9 });
    // Fixed 1x with room around it: the row stays in the margin, at the window's corner.
    const margins: ChromeFrame = { rect: { x: 258, y: 149, width: 765, height: 503 }, fixed: true };
    expect(launcherRowPosition(ROW, margins, 1)).toEqual({ x: 4, y: 4 });
  });

  it('scales the gap with the chrome', () => {
    expect(launcherRowPosition(ROW, MODERN_1270, 1.5)).toEqual({ x: 6, y: 6 });
  });

  it('moves right past the open Settings drawer, one gap from its edge', () => {
    expect(launcherRowPosition(ROW, MODERN_1270, 1, 320)).toEqual({ x: 324, y: 4 });
    // Over the Fixed frame it keeps the frame's top inset, past the drawer rather than the border.
    expect(launcherRowPosition(ROW, FIXED_1X, 1, 320)).toEqual({ x: 324, y: 8 });
    // In the margin above a Fixed frame it stays at the window's top.
    const margins: ChromeFrame = { rect: { x: 258, y: 149, width: 765, height: 503 }, fixed: true };
    expect(launcherRowPosition(ROW, margins, 1, 320)).toEqual({ x: 324, y: 4 });
  });
});

describe('Plugins', () => {
  const PLUGINS = { width: 66, height: 28 };

  it("is always the window's top-right corner, one gap in, over whatever is there", () => {
    expect(pluginsPosition(PLUGINS, { width: 1270, height: 747 }, 1)).toEqual({ x: 1200, y: 4 });
    // Fixed 1x filling the window: over the minimap's stone column, not moved off it.
    expect(pluginsPosition(PLUGINS, { width: 765, height: 503 }, 1)).toEqual({ x: 695, y: 4 });
    // Fixed with margins: the window's corner, not the frame's.
    expect(pluginsPosition(PLUGINS, { width: 1280, height: 800 }, 1)).toEqual({ x: 1210, y: 4 });
    expect(pluginsPosition({ width: 99, height: 42 }, { width: 2560, height: 1800 }, 1.5)).toEqual({ x: 2455, y: 6 });
  });

  it('keeps clear of the row only where it keeps one gap from it on the row’s line', () => {
    const plugins = { x: 510, y: 4, width: 66, height: 28 };
    expect(pluginsClearOfRow(plugins, null, 1)).toBe(true);
    // Both drawers open on a 1000px window: the row ends at 506, one gap short.
    expect(pluginsClearOfRow(plugins, { x: 324, y: 4, width: 182, height: 28 }, 1)).toBe(true);
    // 900px: the labeled row runs to 606, over Plugins.
    expect(pluginsClearOfRow(plugins, { x: 324, y: 4, width: 282, height: 28 }, 1)).toBe(false);
    // A row on another line (over the Fixed frame's border) never meets it.
    expect(pluginsClearOfRow(plugins, { x: 324, y: 40, width: 282, height: 28 }, 1)).toBe(true);
  });

  it('moves left past its open drawer, one gap short of it, as the row moves right past Settings', () => {
    expect(pluginsPosition(PLUGINS, { width: 1270, height: 747 }, 1, 320)).toEqual({ x: 880, y: 4 });
    expect(pluginsPosition(PLUGINS, { width: 1270, height: 747 }, 1, 0)).toEqual({ x: 1200, y: 4 });
    expect(pluginsPosition({ width: 99, height: 42 }, { width: 2560, height: 1800 }, 1.5, 320)).toEqual({
      x: 2135,
      y: 6,
    });
  });
});

describe('the FPS readout', () => {
  const corner = { right: 8, top: 4 };
  const window765 = { width: 765, height: 503 };

  it('sits one gap under Plugins, flush with its right edge, whenever Plugins shows', () => {
    expect(fpsPosition(window765, { x: 695, y: 4, width: 66, height: 28 }, 1, corner)).toEqual({ right: 4, top: 36 });
    expect(fpsPosition({ width: 2560, height: 1800 }, { x: 2455, y: 6, width: 99, height: 42 }, 1.5, corner)).toEqual({
      right: 6,
      top: 54,
    });
  });

  it('follows Plugins past its open drawer', () => {
    expect(fpsPosition({ width: 1270, height: 747 }, { x: 880, y: 4, width: 66, height: 28 }, 1, corner)).toEqual({
      right: 324,
      top: 36,
    });
  });

  it('keeps its own corner while Plugins is hidden', () => {
    expect(fpsPosition(window765, null, 1, corner)).toEqual({ right: 8, top: 4 });
  });
});

describe("the boss bar's default slot", () => {
  const FIXED_SCENE_1X = { x: 4, y: 4, width: 512, height: 334 };
  const COMPACT = { maxWidth: 208, height: 56 };
  const slot = (scene: Rect, row: Rect | null, chrome: Rect[] = [], bar = BAR) =>
    bossBarDefault({ scene, bar, row, zoom: 1, compact: COMPACT, chrome });

  it('is centered on the scene where the row leaves room', () => {
    const scene = { x: 0, y: 0, width: 1909, height: 867 };
    expect(slot(scene, { x: 4, y: 4, ...ROW })).toEqual({ x: 835, y: 4, compact: false, width: 239 });
  });

  it('moves to 8px after the row where centering would meet it, inside the scene', () => {
    // Fixed 1x in a combat tutorial, which hides Replay: Menu, Practice, Actions labeled, 8..220.
    expect(slot(FIXED_SCENE_1X, { x: 8, y: 8, width: 212, height: 28 })).toEqual({
      x: 228,
      y: 8,
      compact: false,
      width: 239,
    });
  });

  it('takes its compact form under the row where neither line has room for it (Fixed 1x, drawer open)', () => {
    // The icon row at 324..448; 188 to the scene's right inset.
    expect(slot(FIXED_SCENE_1X, { x: 324, y: 8, width: 124, height: 28 })).toEqual({
      x: 324,
      y: 40,
      compact: true,
      width: 188,
    });
  });

  it('takes the next line in its normal form where that has room, centered as nearly as it can', () => {
    // A name too long to sit beside that labeled row: under it, clear of the scene's right inset.
    expect(slot(FIXED_SCENE_1X, { x: 8, y: 8, width: 212, height: 28 }, [], { width: 300, height: 42 })).toEqual({
      x: 110,
      y: 40,
      compact: false,
      width: 300,
    });
  });

  describe('keeps clear of the minimap, its orbs and Plugins, which sit over the scene in Modern and Classic', () => {
    const window765 = { x: 0, y: 0, width: 765, height: 503 };
    const minimap765 = { x: 521, y: 0, width: 244, height: 166 };
    const plugins765 = { x: 695, y: 4, width: 66, height: 28 };

    it('Modern 765, Settings drawer open: compact under the row, short of the minimap', () => {
      const row = { x: 324, y: 4, width: 124, height: 28 };
      expect(slot(window765, row, [minimap765, plugins765])).toEqual({ x: 324, y: 36, compact: true, width: 193 });
      // Without the chrome it would have sat beside the row over the minimap's orbs.
      expect(slot(window765, row)).toMatchObject({ x: 456, y: 4, compact: false });
    });

    it('Modern 765: the next line, normal and centered, where beside the row would meet the minimap', () => {
      const row = { x: 4, y: 4, width: 282, height: 28 };
      expect(slot(window765, row, [minimap765, plugins765])).toEqual({ x: 263, y: 36, compact: false, width: 239 });
    });

    it('narrow Classic: beside the row while the room before the minimap holds it, then the next line', () => {
      const row = { x: 4, y: 4, width: 282, height: 28 };
      const classic = (width: number) => ({
        scene: { x: 0, y: 0, width, height: 600 },
        chrome: [
          { x: width - 244, y: 0, width: 244, height: 166 },
          { x: width - 70, y: 4, width: 66, height: 28 },
        ],
      });
      const at800 = classic(800);
      expect(slot(at800.scene, row, at800.chrome)).toEqual({ x: 294, y: 4, compact: false, width: 239 });
      const at770 = classic(770);
      expect(slot(at770.scene, row, at770.chrome)).toEqual({ x: 265.5, y: 36, compact: false, width: 239 });
    });

    it('ignores chrome below the line it is placing on', () => {
      const row = { x: 4, y: 4, width: 282, height: 28 };
      const lowMinimap = { x: 521, y: 200, width: 244, height: 166 };
      expect(slot(window765, row, [lowMinimap])).toEqual({ x: 294, y: 4, compact: false, width: 239 });
    });
  });
});

describe("the launcher row's form", () => {
  // Labeled widths Menu 56, Practice 76, Actions 72, Replay 66, 4px gaps: 282.
  const LABELLED = 56 + 76 + 72 + 66 + 12;
  const icons = (frame: ChromeFrame, leftInset = 0, zoom = 1, labelledWidth = LABELLED) =>
    launcherRowUsesIcons({ labelledWidth: labelledWidth * zoom, frame, zoom, leftInset });
  const modern = (width: number): ChromeFrame => ({ rect: { x: 0, y: 0, width, height: 503 }, fixed: false });

  it('is labeled where the labeled row takes at most half the scene beside it (Modern)', () => {
    expect(icons(MODERN_1270)).toBe(false);
    expect(icons(MODERN_1270, 320)).toBe(false);
    // The desktop minimum with the drawers closed: 757 of room.
    expect(icons(modern(765))).toBe(false);
  });

  it('turns to icons wherever the labeled row would take more than half, with no in-between form', () => {
    // Fixed 1x: 282 is over half of 504.
    expect(icons(FIXED_1X)).toBe(true);
    // Fixed 1x with the Settings drawer open: 188 of room.
    expect(icons(FIXED_1X, 320)).toBe(true);
    // Modern with the Settings drawer open: labeled from 892 wide (564 of room), icons below.
    expect(icons(modern(892), 320)).toBe(false);
    expect(icons(modern(891), 320)).toBe(true);
    expect(icons(modern(765), 320)).toBe(true);
  });

  it('is decided on the row with Replay, so a recording appearing never changes it', () => {
    // Fixed 1x without Replay would be 212, inside half of 504; TopChrome passes the row with it.
    expect(icons(FIXED_1X, 0, 1, LABELLED - 66 - 4)).toBe(false);
    expect(icons(FIXED_1X)).toBe(true);
  });

  it("is the same at any zoom or Fixed scale: the share is of the viewport's pixels", () => {
    expect(icons({ rect: { x: 0, y: 0, width: 1530, height: 1006 }, fixed: true }, 0, 2)).toBe(true);
    expect(icons({ rect: { x: 0, y: 0, width: 2540, height: 1494 }, fixed: false }, 0, 2)).toBe(false);
  });

  it('is decided at the half-share line', () => {
    expect(launcherRowFits(252, 504)).toBe(true);
    expect(launcherRowFits(253, 504)).toBe(false);
    expect(LAUNCHER_ROW_MAX_SHARE).toBe(0.5);
  });
});

describe('where a pane opens', () => {
  const fixedOpen = (overrides: Partial<PanePlacementInput> = {}): PanePlacementInput => ({
    kind: 'practice',
    zoom: 1,
    row: { x: 8, y: 8, ...ROW },
    frame: FIXED_1X,
    window: { width: 765, height: 503 },
    chatTop: 338,
    ...overrides,
  });

  it('opens under its launcher, 152 wide in Fixed 1x, short of the play area, down to the chat', () => {
    const at = placePane(fixedOpen());
    expect(at).toEqual({ x: 8, y: 40, width: 152, maxHeight: 338 - 4 - 40, column: 'launcher' });
    const playArea = protectedPlayArea(sceneInFrame(FIXED_1X.rect, true, false));
    expect(at.x + at.width).toBeLessThanOrEqual(playArea.left - 4);
  });

  it('takes no overlay as an input: it draws over the infoboxes and the boss bar', () => {
    // Placement has no infobox or boss-bar input at all; the Chatbox rows and a bar under the row
    // are simply covered while the pane is open.
    const keys = Object.keys(fixedOpen()).sort();
    expect(keys).toEqual(['chatTop', 'frame', 'kind', 'row', 'window', 'zoom']);
  });

  it('keeps the collapsed-chat width with the chat collapsed, and grows taller', () => {
    expect(placePane(fixedOpen({ chatTop: 480 }))).toEqual({
      x: 8,
      y: 40,
      width: 152,
      maxHeight: 400,
      column: 'launcher',
    });
  });

  it('is 240 wide and at most 400 tall in a roomy resizable window', () => {
    const at = placePane({
      kind: 'practice',
      zoom: 1,
      row: { x: 4, y: 4, ...ROW },
      frame: MODERN_1270,
      window: { width: 1270, height: 747 },
      chatTop: 588,
    });
    expect(at).toEqual({ x: 4, y: 36, width: 240, maxHeight: 400, column: 'launcher' });
  });

  describe('Modern 765 with the Settings drawer open: under the pushed row, one gap short of the minimap', () => {
    const MODERN_765: ChromeFrame = { rect: { x: 0, y: 0, width: 765, height: 503 }, fixed: false };
    const minimap = { x: 521, y: 0, width: 244, height: 166 };
    const plugins = { x: 695, y: 4, width: 66, height: 28 };
    const drawerOpen = (kind: PanePlacementInput['kind'], chrome: Rect[]): PanePlacementInput => ({
      kind,
      zoom: 1,
      row: { x: 324, y: 4, width: 124, height: 28 },
      frame: MODERN_765,
      window: { width: 765, height: 503 },
      chatTop: 360,
      chrome,
    });

    it('opens Practice 193 wide, under the row (over the compact boss bar)', () => {
      expect(placePane(drawerOpen('practice', [minimap, plugins]))).toEqual({
        x: 324,
        y: 36,
        width: 193,
        maxHeight: 360 - 4 - 36,
        column: 'launcher',
      });
    });

    it('opens Actions the same way', () => {
      expect(placePane(drawerOpen('actions', [minimap, plugins]))).toMatchObject({
        x: 324,
        y: 36,
        width: 193,
        column: 'launcher',
      });
    });

    it('is not narrowed by chrome above the pane (Plugins on the row line)', () => {
      expect(placePane(drawerOpen('practice', [plugins])).width).toBe(240);
    });

    it('falls back to the right-side column, below the chrome over it, where the chrome leaves too little width', () => {
      const wideMap = { x: 470, y: 0, width: 295, height: 166 };
      for (const kind of ['practice', 'actions'] as const) {
        const at = placePane(drawerOpen(kind, [wideMap, plugins]));
        expect(at.column).toBe('right');
        expect(at.y).toBe(166 + 4);
      }
    });
  });

  it('opens under a row the Settings drawer pushed past the play area', () => {
    // Fixed 1x with the drawer open: the row at 324; the drawer holds the scene's left, so the pane
    // runs from the row to the scene's right inset.
    const at = placePane(fixedOpen({ row: { x: 324, y: 8, width: 124, height: 28 } }));
    expect(at).toEqual({ x: 324, y: 40, width: 188, maxHeight: 338 - 4 - 40, column: 'launcher' });
    // Modern 1270 with the drawer open: 158 left of the play area is still room enough.
    const modern = placePane({
      kind: 'practice',
      zoom: 1,
      row: { x: 324, y: 4, width: 286, height: 28 },
      frame: MODERN_1270,
      window: { width: 1270, height: 747 },
      chatTop: 582,
    });
    expect(modern).toMatchObject({ x: 324, y: 36, column: 'launcher' });
    expect(modern.width).toBe(Math.floor(635 - 0.2 * 747 - 4 - 324));
  });

  describe('the narrow-window tool window (Modern 480 portrait)', () => {
    // Measured in the harness: the minimap's panel 236..480 by 0..166, Plugins, the side panel and
    // its tab bar at the bottom right, the chat across the bottom from 647.
    const narrow = (kind: PanePlacementInput['kind']): PanePlacementInput => ({
      kind,
      zoom: 1,
      row: { x: 4, y: 4, width: 124, height: 28 },
      frame: { rect: { x: 0, y: 0, width: 480, height: 800 }, fixed: false },
      window: { width: 480, height: 800 },
      chatTop: 647,
      chrome: [
        { x: 236, y: 0, width: 244, height: 166 },
        { x: 410, y: 4, width: 66, height: 28 },
        { x: 276, y: 487, width: 204, height: 275 },
        { x: 243, y: 764, width: 237, height: 36 },
      ],
    });

    it('opens Practice and Actions at the row, one gap short of the minimap, when no column fits', () => {
      for (const kind of ['practice', 'actions'] as const) {
        expect(placePane(narrow(kind))).toEqual({ x: 4, y: 36, width: 228, maxHeight: 400, column: 'window' });
      }
    });

    it('is the full 240 below the minimap where beside it would be narrower than a pane can be', () => {
      const input = narrow('practice');
      const wideMap = { x: 140, y: 0, width: 340, height: 166 };
      const at = placePane({ ...input, chrome: [wideMap, ...(input.chrome ?? []).slice(1)] });
      expect(at).toMatchObject({ x: 4, y: 170, width: 240, column: 'window' });
    });

    it('replaces the clipped right-side column: never narrower than a pane can be', () => {
      const at = placePane(narrow('practice'));
      expect(at.width).toBeGreaterThanOrEqual(150);
    });

    it('ends one gap above the chat, clamped inside the window', () => {
      const at = placePane({ ...narrow('practice'), chatTop: 300 });
      expect(at.y + at.maxHeight).toBe(300 - 4);
      const tiny = placePane({ ...narrow('practice'), window: { width: 200, height: 800 }, chrome: [] });
      expect(tiny.x).toBe(4);
      expect(tiny.x + tiny.width).toBeLessThanOrEqual(200 - 4);
    });
  });

  it('opens in the margin around a Fixed frame, limited only by the window', () => {
    const margins: ChromeFrame = { rect: { x: 258, y: 149, width: 765, height: 503 }, fixed: true };
    expect(
      placePane({
        kind: 'practice',
        zoom: 1,
        row: { x: 4, y: 4, ...ROW },
        frame: margins,
        window: { width: 1280, height: 800 },
        chatTop: 487,
      }),
    ).toEqual({ x: 4, y: 36, width: 240, maxHeight: 400, column: 'launcher' });
  });

  it('never covers the chat or the play area', () => {
    for (const chatTop of [338, 480]) {
      const input = fixedOpen({ chatTop });
      const at = placePane(input);
      const pane = { x: at.x, y: at.y, width: at.width, height: at.maxHeight };
      expect(pane.y + pane.height).toBeLessThanOrEqual(chatTop - 4);
      const area = protectedPlayArea(sceneInFrame(FIXED_1X.rect, true, chatTop === 338));
      const band = { x: area.left, y: area.top, width: area.right - area.left, height: area.bottom - area.top };
      expect(intersects(pane, band)).toBe(false);
    }
  });
});

describe('the Chatbox infobox rows', () => {
  it('sit one gap inside the Fixed border and above the chat, as wide as the chat inside the scene', () => {
    const anchor = chatboxInfoboxAnchor({
      frame: { width: 765, height: 503 },
      fixed: true,
      chat: { x: 0, y: 338, width: 519, height: 165 },
      zoom: 1,
    });
    // The chat runs to 519, the scene to 516: the rows stop one gap short of the scene's edge.
    expect(anchor).toEqual({ left: 8, bottom: 334, maxWidth: 516 - 4 - 8 });
    // They cross the play area, which they may: the strip takes no clicks.
    const playArea = protectedPlayArea(sceneInFrame({ x: 0, y: 0, width: 765, height: 503 }, true, false));
    expect(anchor.left + anchor.maxWidth).toBeGreaterThan(playArea.right);
  });

  it('run the resizable chatbox width, one gap in at each end, open or collapsed', () => {
    const at = (y: number, height: number) =>
      chatboxInfoboxAnchor({
        frame: { width: 1270, height: 747 },
        fixed: false,
        chat: { x: 0, y, width: 519, height },
        zoom: 1,
      });
    expect(at(582, 165)).toEqual({ left: 4, bottom: 578, maxWidth: 519 - 4 - 4 });
    expect(at(724, 23).maxWidth).toBe(at(582, 165).maxWidth);
    // At 1.5x the gaps grow with the chrome.
    expect(
      chatboxInfoboxAnchor({
        frame: { width: 1270, height: 747 },
        fixed: false,
        chat: { x: 0, y: 582, width: 519, height: 165 },
        zoom: 1.5,
      }),
    ).toEqual({ left: 6, bottom: 576, maxWidth: 519 - 6 - 6 });
  });

  it('fit fifteen 1x tiles a row over Modern 1270, fourteen over Fixed 1x', () => {
    expect(chatboxInfoboxGrid({ count: 30, maxWidth: 511, tile: 32, gap: 2, scale: 1 })).toEqual({
      columns: 15,
      rows: 2,
    });
    expect(chatboxInfoboxGrid({ count: 14, maxWidth: 504, tile: 32, gap: 2, scale: 1 })).toEqual({
      columns: 14,
      rows: 1,
    });
    expect(chatboxInfoboxGrid({ count: 15, maxWidth: 504, tile: 32, gap: 2, scale: 1 })).toEqual({
      columns: 8,
      rows: 2,
    });
  });

  it('spread the tiles evenly over the fewest rows', () => {
    expect(balancedColumns(6, 4)).toBe(3);
    expect(balancedColumns(5, 6)).toBe(5);
    expect(balancedColumns(16, 4)).toBe(4);
    expect(balancedColumns(7, 4)).toBe(4);
    expect(balancedColumns(10, 3)).toBe(3);
    expect(balancedColumns(0, 4)).toBe(1);
  });
});
