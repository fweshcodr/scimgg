import { describe, expect, it } from 'vitest';
import {
  defaultOsmFrame,
  liveOsmFrame,
  MOBILE_SCREENS,
  type MobileScreen,
  replayedOsmFrame,
} from '../../test/helpers/osmFrame';
import { OSM_INTERFACE_SCALING_OPTIONS, osmSidePanelPlacement } from '../osmClientLayout';
import { type OsmFrame, osmCssRect } from '../osmFrame';
import {
  OSM_BUFF_CAPACITY,
  osmBuffBarRect,
  osmBuffBarRightDodge,
  osmBuffBarUsedRect,
  osmBuffTile,
  osmHpBarOrigin,
  osmHudRect,
  osmXpDropsTopRight,
  placeOsmHud,
} from '../osmHud';
import { osmToolWindowLayout } from '../osmToolWindow';
import type { Rect } from '../osrsClientLayout';

const NO_INSETS = { top: 0, right: 0, bottom: 0, left: 0 };
const CLOSED = { panelOpen: false, tabsCollapsed: false, panelOnLeft: false };

function overlap(a: Rect, b: Rect): boolean {
  return a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;
}

describe('the Mobile HUD rect (601:8 after a resize)', () => {
  it.each([
    [667, 375],
    [844, 390],
    [932, 430],
    [1180, 820],
    [1600, 900],
  ])('is the gameframe less 58 on each side and 16 at the bottom at %ix%i', (width, height) => {
    const frame = defaultOsmFrame({ width, height }, NO_INSETS);

    expect(osmHudRect(frame.size)).toEqual({
      x: 58,
      y: 0,
      width: frame.size.width - 116,
      height: frame.size.height - 16,
    });
  });

  it('is gameframe-local, so a notch moves it with the frame', () => {
    const frame = defaultOsmFrame({ width: 844, height: 390 }, { top: 0, right: 34, bottom: 21, left: 47 });

    expect(osmHudRect(frame.size).width).toBe(frame.size.width - 116);
    expect(frame.origin).toEqual({ x: 47, y: 0 });
  });
});

describe('native default positions', () => {
  const frame = { width: 1000, height: 450 };

  it('puts the XP drops right 2 inside the 181-narrower slot, 2 rows down', () => {
    // HUD 58..942; slot 58..(58 + 884 - 181) = 761; right 2 => 759.
    expect(osmXpDropsTopRight(frame)).toEqual({ x: 759, y: 2 });
  });

  it('puts the boss bar at the HUD offset plus the mobile and XP-side margins, clear of no chat', () => {
    expect(osmHpBarOrigin()).toEqual({ x: 60, y: 6 });
    expect(osmHpBarOrigin(0)).toEqual({ x: 60, y: 6 + 145 });
  });

  it('dodges the rail and an open side panel with the buff bar', () => {
    expect(osmBuffBarRightDodge(CLOSED)).toBe(27);
    expect(osmBuffBarRightDodge({ ...CLOSED, tabsCollapsed: true })).toBe(0);
    expect(osmBuffBarRightDodge({ ...CLOSED, panelOpen: true })).toBe(27 + 204);
    expect(osmBuffBarRightDodge({ ...CLOSED, panelOpen: true, tabsCollapsed: true })).toBe(204);
    expect(osmBuffBarRightDodge({ panelOpen: true, tabsCollapsed: false, panelOnLeft: true })).toBe(27);
  });

  it('anchors the 91x249 buff bar right 1 / bottom 29 inside its dodger', () => {
    // HUD right 942, dodge 27 => dodger right 915, content right 914; HUD bottom 434, -29 => 405.
    expect(osmBuffBarRect(frame, CLOSED)).toEqual({ x: 823, y: 156, width: 91, height: 249 });
  });

  it('fills the buff bar from the bottom-right cell upward, then the next column left', () => {
    expect(OSM_BUFF_CAPACITY).toBe(12);
    expect(osmBuffTile(0)).toEqual({ x: 56, y: 214, width: 32, height: 32 });
    expect(osmBuffTile(1)).toEqual({ x: 56, y: 177, width: 32, height: 32 });
    expect(osmBuffTile(5)).toEqual({ x: 56, y: 29, width: 32, height: 32 });
    expect(osmBuffTile(6)).toEqual({ x: 19, y: 214, width: 32, height: 32 });
    expect(osmBuffTile(12)).toBeNull();
  });
});

describe('placeOsmHud', () => {
  const aids = [
    { id: 'detailedDps', size: { width: 208, height: 200 } },
    { id: 'prayerFlick', size: { width: 208, height: 144 } },
    { id: 'zukSetTimer', size: { width: 208, height: 134 } },
  ];

  function place(width: number, height: number, side = CLOSED, occupied: Rect[] = []) {
    const frame = defaultOsmFrame({ width, height }, NO_INSETS);
    return {
      frame,
      placement: placeOsmHud({
        frame,
        side,
        hotkeysCollapsed: false,
        xpDrops: { width: 170 * frame.scale, height: 130 * frame.scale },
        bossBar: { width: 150 * frame.scale, height: 42 * frame.scale },
        buffCount: 3,
        aids: aids.map((aid) => ({ ...aid, size: { width: aid.size.width * 0.8, height: aid.size.height * 0.8 } })),
        occupied,
      }),
    };
  }

  /** Every placed rect, the buff bar as the cells its 3 buffs occupy (the rest of its box is empty). */
  function everyRect(
    frame: ReturnType<typeof defaultOsmFrame>,
    placement: ReturnType<typeof placeOsmHud>,
  ): [string, Rect][] {
    const used = osmBuffBarUsedRect(3);
    if (!used) throw new Error('3 buffs occupy cells');
    const box = placement.buffBar;
    const buffCells = {
      x: box.x + used.x * frame.scale,
      y: box.y + used.y * frame.scale,
      width: used.width * frame.scale,
      height: used.height * frame.scale,
    };
    return [
      ['xpDrops', placement.xpDrops],
      ['bossBar', placement.bossBar],
      ['buffBar', buffCells],
      ...Object.entries(placement.aids),
    ];
  }

  it.each([
    [844, 390],
    [932, 430],
    [1180, 820],
    [1600, 900],
  ])('keeps every native at its native default in landscape %ix%i', (width, height) => {
    const { placement } = place(width, height);

    expect(placement.bossBar.native).toBe(true);
    expect(placement.xpDrops.native).toBe(true);
    expect(placement.buffBar.native).toBe(true);
  });

  it.each([
    [667, 375],
    [844, 390],
    [932, 430],
    [1180, 820],
    [1600, 900],
    [390, 844],
    [360, 780],
  ])('overlaps no chrome, and no native overlaps anything, at %ix%i with the panel closed or open', (width, height) => {
    for (const side of [CLOSED, { ...CLOSED, panelOpen: true }]) {
      const { frame, placement } = place(width, height, side);
      const rects = everyRect(frame, placement);
      const isAid = (name: string) => name in placement.aids;
      for (const [name, rect] of rects) {
        // Only an aid may be left with no free spot at all (360 wide, side panel open).
        if ('overlapping' in rect && rect.overlapping) {
          expect(isAid(name), `${name} found no room`).toBe(true);
          continue;
        }
        for (const chrome of placement.chrome) expect(overlap(rect, chrome), `${name} vs chrome`).toBe(false);
        for (const [other, otherRect] of rects) {
          // Out of room (portrait, panel open), an aid may cover another aid; nothing else may.
          if (other === name || (isAid(name) && isAid(other)) || ('overlapping' in otherRect && otherRect.overlapping))
            continue;
          expect(overlap(rect, otherRect), `${name} vs ${other}`).toBe(false);
        }
        expect(rect.x).toBeGreaterThanOrEqual(0);
        expect(rect.x + rect.width).toBeLessThanOrEqual(width);
        expect(rect.y + rect.height).toBeLessThanOrEqual(height);
      }
    }
  });

  it.each([
    [667, 375],
    [844, 390],
    [1600, 900],
    [390, 844],
  ])('keeps the aids apart too while the frame has room, at %ix%i', (width, height) => {
    const { frame, placement } = place(width, height);
    const aidRects = Object.values(placement.aids);
    for (const [index, rect] of aidRects.entries()) {
      for (const other of aidRects.slice(index + 1)) expect(overlap(rect, other)).toBe(false);
    }
    expect(frame.scale).toBeGreaterThan(0);
  });

  function nativeSizes(frame: OsmFrame) {
    return {
      xpDrops: { width: 170 * frame.scale, height: 130 * frame.scale },
      bossBar: { width: 150 * frame.scale, height: 42 * frame.scale },
    };
  }
  const SMALL_AIDS = aids.map((aid) => ({
    ...aid,
    size: { width: aid.size.width * 0.8, height: aid.size.height * 0.8 },
  }));

  it.each([
    [320, 568],
    [360, 640],
    [390, 844],
    [568, 320],
    [641, 320],
    [844, 390],
    [1024, 768],
    [1366, 1024],
  ])('keeps the boss bar and a full buff column clear of open/closed Tools at %ix%i', (width, height) => {
    for (const devicePixelRatio of [1, 1.25, 2, 2.625, 3, 4]) {
      for (const interfaceScaling of OSM_INTERFACE_SCALING_OPTIONS) {
        for (const insets of [NO_INSETS, { top: 8, right: 34, bottom: 24, left: 47 }]) {
          const viewport = { width, height };
          const frame = defaultOsmFrame(viewport, insets, { devicePixelRatio, interfaceScaling });
          for (const panelOnLeft of [false, true]) {
            const side = { panelOpen: true, tabsCollapsed: false, panelOnLeft };
            for (const open of [false, true]) {
              const tools = osmToolWindowLayout({
                frame,
                viewport,
                open,
                sidePanelOnLeft: panelOnLeft,
                devicePixelRatio,
              });
              const placement = placeOsmHud({
                frame,
                side,
                hotkeysCollapsed: false,
                ...nativeSizes(frame),
                buffCount: OSM_BUFF_CAPACITY,
                aids: [],
                occupied: tools.occupied,
              });
              for (const tool of tools.occupied) {
                expect(overlap(tool, placement.bossBar), 'boss bar vs Tools').toBe(false);
                expect(overlap(tool, placement.buffUsed!), 'buff column vs Tools').toBe(false);
              }
            }
          }
        }
      }
    }
  });

  it('moves natives that collide in portrait to the nearest free spot instead', () => {
    // An iPhone SE upright: the XP drops' corner holds the buff timers.
    const frame = liveOsmFrame(MOBILE_SCREENS.iPhoneSeUpright);
    const placement = placeOsmHud({
      frame,
      side: { ...CLOSED, panelOpen: true },
      hotkeysCollapsed: false,
      ...nativeSizes(frame),
      buffCount: 3,
      aids: [],
    });
    const used = placement.buffUsed;
    if (!used) throw new Error('3 buffs occupy cells');

    expect(placement.xpDrops.native).toBe(false);
    expect(placement.xpDrops.overlapping).toBeUndefined();
    for (const rect of [...placement.chrome, placement.bossBar, used])
      expect(overlap(placement.xpDrops, rect)).toBe(false);
  });

  it('keeps the buff timers in their native place on an upright iPhone, moving the XP drops instead', () => {
    // Only one of them fits top-left; the timers are placed first, so the transient drops move.
    const frame = liveOsmFrame(MOBILE_SCREENS.iPhone15Upright);
    const placement = placeOsmHud({
      frame,
      side: CLOSED,
      hotkeysCollapsed: false,
      ...nativeSizes(frame),
      buffCount: 3,
      aids: [],
    });
    expect(placement.buffBar.native).toBe(true);
    expect(placement.xpDrops.native).toBe(false);
  });

  describe('native HUD around Tools during fitted replay', () => {
    // Match Grid: place viewer-owned Tools in the fitted frame, map those bounds back to the
    // recording, and place the native HUD around them. A flagged fallback is not permission
    // to cover Tools: full buff columns and boss bars must remain clear even in the small fit.
    const CASES = [
      [
        'an iPhone 15 landscape recording on an upright iPhone 15',
        MOBILE_SCREENS.iPhone15Landscape,
        MOBILE_SCREENS.iPhone15Upright,
      ],
      [
        'an iPad Air landscape recording on an upright iPhone SE',
        MOBILE_SCREENS.iPadAirLandscape,
        MOBILE_SCREENS.iPhoneSeUpright,
      ],
      ['a desktop recording on an upright iPhone SE', MOBILE_SCREENS.desktop1080, MOBILE_SCREENS.iPhoneSeUpright],
    ] as const;
    const SIDES = [
      ['closed', CLOSED],
      ['open on the right', { ...CLOSED, panelOpen: true }],
      ['open on the left', { ...CLOSED, panelOpen: true, panelOnLeft: true }],
    ] as const;

    function placeDuringReplay(recorder: MobileScreen, viewer: MobileScreen, side = CLOSED) {
      const { recorded, placement, placed } = replayedOsmFrame(recorder, viewer.viewport);
      const tools = osmToolWindowLayout({
        frame: placed,
        viewport: viewer.viewport,
        open: true,
        sidePanelOnLeft: side.panelOnLeft,
      }).occupied;
      // In the recorded frame, as Grid maps it (windowToFrame).
      const occupiedRects = tools.map((rect) => ({
        x: (rect.x - placement.offsetX) / placement.scale,
        y: (rect.y - placement.offsetY) / placement.scale,
        width: rect.width / placement.scale,
        height: rect.height / placement.scale,
      }));
      const occupied = occupiedRects[0];
      return {
        frame: recorded,
        occupied,
        occupiedRects,
        placement: placeOsmHud({
          frame: recorded,
          side,
          hotkeysCollapsed: false,
          ...nativeSizes(recorded),
          buffCount: OSM_BUFF_CAPACITY,
          aids: SMALL_AIDS,
          occupied: occupiedRects,
        }),
      };
    }

    for (const [name, recorder, viewer] of CASES) {
      for (const [sideName, side] of SIDES) {
        it(`keeps everything inside ${name}'s frame, panel ${sideName}, and only flagged rects overlapping`, () => {
          const { frame, occupied, occupiedRects, placement } = placeDuringReplay(recorder, viewer, side);
          const bounds = osmCssRect(frame, { x: 0, y: 0, width: frame.size.width, height: frame.size.height });
          const used = placement.buffUsed;
          if (!used) throw new Error('buffs occupy cells');
          const natives: [string, Rect & { native?: boolean; overlapping?: true }][] = [
            ['xpDrops', placement.xpDrops],
            ['bossBar', placement.bossBar],
            ['buffUsed', used],
          ];
          for (const [name, rect] of natives) {
            for (const tool of occupiedRects) expect(overlap(rect, tool), `${name} must not overlap Tools`).toBe(false);
          }
          const placed = [...natives, ...Object.entries(placement.aids)];
          for (const [what, rect] of placed) {
            expect(rect.x, `${what} left`).toBeGreaterThanOrEqual(bounds.x);
            expect(rect.y, `${what} top`).toBeGreaterThanOrEqual(bounds.y);
            expect(rect.x + rect.width, `${what} right`).toBeLessThanOrEqual(bounds.x + bounds.width);
            expect(rect.y + rect.height, `${what} bottom`).toBeLessThanOrEqual(bounds.y + bounds.height);
          }
          // A native that found a free spot keeps it: clear of the chrome, the tool window and
          // every other native that did too. Only one flagged `overlapping` may cover them.
          const clear = natives.filter(([, rect]) => !rect.overlapping);
          for (const [what, rect] of clear) {
            for (const chrome of placement.chrome) expect(overlap(rect, chrome), `${what} vs chrome`).toBe(false);
            expect(overlap(rect, occupied), `${what} vs the tool window`).toBe(false);
            for (const [other, otherRect] of clear) {
              if (other !== what) expect(overlap(rect, otherRect), `${what} vs ${other}`).toBe(false);
            }
          }
          // Flagged rects never claim their native place.
          for (const [, rect] of natives) if (rect.overlapping) expect(rect.native).not.toBe(true);
        });
      }
    }

    it('keeps a full buff column clear of Tools, without accepting an overlap fallback', () => {
      const [, recorder, viewer] = CASES[0];
      for (const side of [CLOSED, { ...CLOSED, panelOpen: true }]) {
        const { frame, placement, occupied } = placeDuringReplay(recorder, viewer, side);
        const used: (Rect & { overlapping?: true }) | null = placement.buffUsed;
        if (!used) throw new Error('buffs occupy cells');
        expect(overlap(used, occupied)).toBe(false);
        if (used.overlapping) expect(placement.buffBar.native).toBe(false);
        expect(used.x).toBeGreaterThanOrEqual(frame.origin.x);
        expect(used.y + used.height).toBeLessThanOrEqual(frame.origin.y + frame.size.height * frame.scale);
      }
    });
  });

  it('keeps the aids clear of the HUD stack it is given', () => {
    const stack = { x: 60, y: 200, width: 300, height: 180 };
    const { placement } = place(844, 390, CLOSED, [stack]);

    for (const rect of Object.values(placement.aids)) expect(overlap(rect, stack)).toBe(false);
  });
});

describe('buff column against the side panel (never hanging below the panel)', () => {
  const BUFFS = 5;
  const columnRect = (placement: ReturnType<typeof placeOsmHud>, scale: number): Rect => {
    const used = osmBuffBarUsedRect(BUFFS);
    if (!used) throw new Error('5 buffs occupy cells');
    const box = placement.buffBar;
    return {
      x: box.x + used.x * scale,
      y: box.y + used.y * scale,
      width: used.width * scale,
      height: used.height * scale,
    };
  };

  function layout(
    width: number,
    height: number,
    side: { panelOpen: boolean; panelOnLeft: boolean },
    insets: typeof NO_INSETS = NO_INSETS,
  ) {
    const frame = defaultOsmFrame({ width, height }, insets);
    const placement = placeOsmHud({
      frame,
      side: { ...side, tabsCollapsed: false },
      hotkeysCollapsed: false,
      xpDrops: { width: 170 * frame.scale, height: 130 * frame.scale },
      bossBar: { width: 150 * frame.scale, height: 42 * frame.scale },
      buffCount: BUFFS,
      aids: [],
    });
    // The panel as MobileSideChrome draws it (osmCssRect), wherever it is, drawn or not.
    const panel = osmSidePanelPlacement(frame.size.height, false);
    const panelX = side.panelOnLeft ? 58 : frame.size.width - panel.right - panel.width;
    const panelCss = osmCssRect(frame, { x: panelX, y: panel.top, width: panel.width, height: panel.height });
    return { frame, placement, column: columnRect(placement, frame.scale), panel: panelCss };
  }

  // The full viewport is never under 503 rows (osmChromeScale), and a vertical safe area (an
  // iPhone's home indicator in landscape) leaves the frame a fraction under: the minimum is floored.
  const HOME_INDICATOR = { ...NO_INSETS, bottom: 21 };
  const PHONES: [number, number][] = [
    [667, 375],
    [844, 390],
  ];
  const SIDES = [
    ['open on the right', { panelOpen: true, panelOnLeft: false }],
    ['open on the left', { panelOpen: true, panelOnLeft: true }],
    ['closed', { panelOpen: false, panelOnLeft: false }],
  ] as const;

  for (const [width, height] of PHONES) {
    for (const [label, side] of SIDES) {
      it(`ends 41 rows above the bottom-anchored panel's bottom at ${width}x${height}, panel ${label}`, () => {
        const { frame, placement, column, panel } = layout(width, height, side, HOME_INDICATOR);
        // A phone frame is under 503 rows, so the panel is bottom-anchored.
        expect(frame.size.height).toBeLessThan(503);
        expect(placement.buffBar.native).toBe(true);
        // Bar bottom H-16-29 (the HUD's bottom 16, then the bar's own 29); its lowest tile sits 3 rows
        // above that. Panel bottom H-4.
        const panelBottom = panel.y + panel.height;
        // Within the one CSS pixel both rects are snapped to.
        expect(Math.abs(panelBottom - (column.y + column.height) - (45 - 4) * frame.scale)).toBeLessThanOrEqual(1);
        expect(column.y).toBeGreaterThanOrEqual(panel.y);
      });
    }

    it(`keeps the native one-pixel gap to a panel open on the right at ${width}x${height}`, () => {
      const { frame, placement, panel } = layout(
        width,
        height,
        { panelOpen: true, panelOnLeft: false },
        HOME_INDICATOR,
      );
      // One logical pixel (the bar dodges the rail and side container exactly); under
      // one CSS pixel at these phones' scales, so the two snapped edges may meet but never cross.
      const side = { panelOpen: true, panelOnLeft: false, tabsCollapsed: false };
      const bar = osmBuffBarRect(frame.size, side);
      const logicalPanel = osmSidePanelPlacement(frame.size.height, false);
      expect(frame.size.width - logicalPanel.right - logicalPanel.width - (bar.x + bar.width)).toBeCloseTo(1, 9);
      const gap = panel.x - (placement.buffBar.x + placement.buffBar.width);
      expect(gap).toBeGreaterThanOrEqual(0);
      expect(gap).toBeLessThanOrEqual(1);
    });
  }

  it('keeps x exact when a collision pushes the bar up, so the gap to the panel survives', () => {
    const frame = defaultOsmFrame({ width: 844, height: 390 }, HOME_INDICATOR);
    const input = {
      frame,
      side: { panelOpen: true, tabsCollapsed: false, panelOnLeft: false },
      hotkeysCollapsed: false,
      xpDrops: { width: 170 * frame.scale, height: 130 * frame.scale },
      bossBar: { width: 150 * frame.scale, height: 42 * frame.scale },
      buffCount: BUFFS,
      aids: [],
    };
    const free = placeOsmHud(input).buffBar;
    const used = osmBuffBarUsedRect(BUFFS);
    if (!used) throw new Error('5 buffs occupy cells');
    // A wide HUD stack from the left column to under the column's lowest cells.
    const usedBottom = free.y + (used.y + used.height) * frame.scale;
    const stack = { x: 60, y: usedBottom - 20, width: free.x + used.x * frame.scale + 10 - 60, height: 80 };
    const pushed = placeOsmHud({ ...input, occupied: [stack] }).buffBar;

    expect(pushed.native).toBe(false);
    expect(pushed.x).toBe(free.x);
    expect(pushed.y).toBeLessThan(free.y);
  });

  // Scim deviation (simulator policy): from 503 rows the panel is centered, and the bar is raised to end level with it instead of hanging below it.
  // Landscape phones without insets are exactly 503 rows tall, where the centered panel ends
  // lower than the native bar, so the bar stays native (see 'only ever raises' below).
  const AT_MIN_ROWS: [number, number][] = [
    [932, 430],
    [1280, 600],
  ];
  const RAISED: [number, number][] = [
    [1180, 820],
    [1600, 900],
  ];
  const TALL = [...AT_MIN_ROWS, ...RAISED];
  for (const [width, height] of AT_MIN_ROWS) {
    for (const [label, side] of SIDES.filter(([, s]) => s.panelOpen)) {
      it(`stays native above the centered panel's bottom at ${width}x${height} (503 rows), panel ${label}`, () => {
        const { frame, placement, column, panel } = layout(width, height, side);
        expect(frame.size.height).toBe(503);
        expect(placement.buffBar.native).toBe(true);
        const nativeBottom = frame.origin.y + (frame.size.height - 16 - 29) * frame.scale;
        expect(Math.abs(placement.buffBar.y + placement.buffBar.height - nativeBottom)).toBeLessThanOrEqual(1);
        expect(column.y + column.height).toBeLessThan(panel.y + panel.height);
      });
    }
  }
  for (const [width, height] of RAISED) {
    for (const [label, side] of SIDES.filter(([, s]) => s.panelOpen)) {
      it(`ends level with the centered panel's bottom at ${width}x${height}, panel ${label}`, () => {
        const { frame, placement, panel } = layout(width, height, side);
        expect(frame.size.height).toBeGreaterThan(503);
        expect(placement.buffBar.native).toBe(true);
        // Both snapped to whole CSS pixels.
        expect(Math.abs(placement.buffBar.y + placement.buffBar.height - (panel.y + panel.height))).toBeLessThanOrEqual(
          1,
        );
      });
    }
  }
  for (const [width, height] of TALL) {
    it(`keeps the native 1-row gap to a centered panel open on the right at ${width}x${height}`, () => {
      const { frame } = layout(width, height, { panelOpen: true, panelOnLeft: false });
      const side = { panelOpen: true, panelOnLeft: false, tabsCollapsed: false };
      const bar = osmBuffBarRect(frame.size, side);
      const panel = osmSidePanelPlacement(frame.size.height, false);
      // In logical pixels: at the scales these frames are drawn at, the two edges are snapped
      // separately and may land on the same CSS pixel.
      expect(frame.size.width - panel.right - panel.width - (bar.x + bar.width)).toBeCloseTo(1, 9);
    });

    it(`stays on the native HUD-bottom anchor with the panel closed at ${width}x${height}`, () => {
      const { frame, placement } = layout(width, height, { panelOpen: false, panelOnLeft: false });
      const nativeBottom = frame.origin.y + (frame.size.height - 16 - 29) * frame.scale;
      expect(Math.abs(placement.buffBar.y + placement.buffBar.height - nativeBottom)).toBeLessThanOrEqual(1);
    });
  }

  it('pins the raise at 900 rows: the bar ends at the centered panel bottom, not the HUD bottom', () => {
    const panel = osmSidePanelPlacement(900, false);
    const panelBottom = Math.trunc((900 - 275) / 2) + 87 + 275;
    expect(panel.top + panel.height).toBe(panelBottom);
    expect(
      osmBuffBarRect({ width: 1600, height: 900 }, { panelOpen: true, panelOnLeft: false, tabsCollapsed: false }),
    ).toMatchObject({
      y: panelBottom - 249,
    });
  });

  it('only ever raises: just over 503 rows, where the centered panel ends lower, the bar stays native', () => {
    // 503 rows: panel bottom trunc(228/2)+87+275 = 476, below the native bar bottom 503-45 = 458.
    const side = { panelOpen: true, panelOnLeft: false, tabsCollapsed: false };
    expect(osmBuffBarRect({ width: 1000, height: 503 }, side).y).toBe(503 - 45 - 249);
  });

  it('still moves a raised bar clear of a collision, keeping its x', () => {
    const frame = defaultOsmFrame({ width: 1600, height: 900 }, NO_INSETS);
    const input = {
      frame,
      side: { panelOpen: true, tabsCollapsed: false, panelOnLeft: false },
      hotkeysCollapsed: false,
      xpDrops: { width: 170, height: 130 },
      bossBar: { width: 150, height: 42 },
      buffCount: BUFFS,
      aids: [],
    };
    const free = placeOsmHud(input).buffBar;
    const used = osmBuffBarUsedRect(BUFFS);
    if (!used) throw new Error('5 buffs occupy cells');
    // Something over the raised column's lowest cells.
    const blocker = {
      x: free.x - 100,
      y: free.y + (used.y + used.height) * frame.scale - 30,
      width: 400,
      height: 60,
    };
    const pushed = placeOsmHud({ ...input, occupied: [blocker] }).buffBar;

    expect(pushed.native).toBe(false);
    expect(pushed.x).toBe(free.x);
  });
});
