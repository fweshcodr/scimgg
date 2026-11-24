import { describe, expect, it } from 'vitest';
import { snapPanelRect } from '../../components/snap/layoutSolver';
import { defaultOsmFrame, MOBILE_SCREENS, replayedOsmFrame } from '../../test/helpers/osmFrame';
import {
  OSM_CHAT_CONTAINER,
  OSM_INTERFACE_SCALING_OPTIONS,
  OSM_SYSTEM_STONE_SLOTS,
  osmChromeLayout,
  osmHotkeysPlacement,
  osmPopoutPlacement,
  osmSystemStoneRect,
} from '../osmClientLayout';
import { type OsmFrame, osmCssRect, osmFramePlaced } from '../osmFrame';
import { osmToolWindowLayout } from '../osmToolWindow';
import type { Rect, Size } from '../osrsClientLayout';
import { fitReplayWorkspace } from '../replayWorkspaceLayout';

const VIEWPORTS = [
  [568, 320, 27],
  [667, 375, 32],
  [844, 390, 33],
  [360, 640, 31],
  [390, 844, 33],
  [1024, 768, 49],
];
const NONE = { top: 0, right: 0, bottom: 0, left: 0 };
const overlaps = (a: Rect, b: Rect) =>
  a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + b.height && a.y + a.height > b.y;

it('does not move the closed dock upward over Hotkeys in short landscape with safe-area insets', () => {
  const viewport = { width: 641, height: 320 };
  const frame = defaultOsmFrame(viewport, { top: 8, right: 34, bottom: 24, left: 47 }, { devicePixelRatio: 2.625 });
  const dock = osmToolWindowLayout({ frame, viewport, open: false }).dock;
  const hotkeys = osmCssRect(frame, osmHotkeysPlacement(frame.size.height, false));
  expect(overlaps(dock, hotkeys)).toBe(false);
});

it.each([1, 1.25, 2, 2.625, 3, 4])('sweeps every Mobile scale and frame mode at DPR %s', (devicePixelRatio) => {
  const failures: string[] = [];
  let checked = 0;
  // Include small browser-bar heights, portrait, standard devices and deliberately awkward sizes.
  const widths = [320, 360, 390, 412, 480, 568, 641, 667, 731, 844, 913, 932, 1024, 1180, 1366];
  const heights = [270, 284, 320, 333, 375, 390, 412, 430, 503, 568, 640, 768, 820, 844, 913, 1024];
  const intersects = (a: Rect, b: Rect) =>
    Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x) > 1e-7 &&
    Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y) > 1e-7;
  const check = (frame: OsmFrame, viewport: Size, label: string, devicePixelRatio: number) => {
    checked++;
    const chrome = osmChromeLayout(frame.size, false);
    const blocked = [
      ['minimap and orbs', chrome.mapContainer],
      ['right side panel', chrome.sidePanel],
      ['right tab stones', chrome.tabRail],
      ['Hotkeys and left stones', osmHotkeysPlacement(frame.size.height, false)],
      ['collapsed Hotkeys', osmHotkeysPlacement(frame.size.height, true)],
      ['chatbox', OSM_CHAT_CONTAINER],
      ...Array.from({ length: OSM_SYSTEM_STONE_SLOTS }, (_, slot) => [
        `system stone ${slot}`,
        osmSystemStoneRect(slot),
      ]),
    ] as [string, Rect][];
    for (const sidePanelOnLeft of [false, true]) {
      const tools = osmToolWindowLayout({ frame, viewport, open: true, sidePanelOnLeft, devicePixelRatio });
      for (const [part, rect] of [
        ['dock', tools.dock],
        ['panel', tools.window!],
      ] as const) {
        for (const [name, native] of blocked) {
          if (name === 'right side panel' && sidePanelOnLeft) continue;
          const css = osmCssRect(frame, native);
          // DraggablePanel's actual paint contract, in addition to unsnapped recording bounds.
          const snapped = snapPanelRect(
            { id: name, left: css.x, top: css.y, right: css.x + css.width, bottom: css.y + css.height },
            devicePixelRatio,
          );
          const paint = {
            x: snapped.left,
            y: snapped.top,
            width: snapped.right - snapped.left,
            height: snapped.bottom - snapped.top,
          };
          if ((intersects(rect, css) || intersects(rect, paint)) && failures.length < 12) {
            failures.push(`${label} left=${sidePanelOnLeft}: ${part} overlaps ${name}: ${JSON.stringify(rect)}`);
          }
        }
      }
      const nativeDock = osmCssRect(frame, osmPopoutPlacement(frame.size.height));
      if (tools.dock.y < nativeDock.y - 1e-7 && failures.length < 12) {
        failures.push(`${label}: dock grows above native pop-out (${tools.dock.y} < ${nativeDock.y})`);
      }
      if (tools.dock.y + tools.dock.height > nativeDock.y + nativeDock.height + 1e-7 && failures.length < 12) {
        failures.push(`${label}: dock extends below native pop-out`);
      }
      const slot = osmCssRect(frame, osmChromeLayout(frame.size, false, true).sidePanel);
      if (
        tools.window!.x + tools.window!.width > slot.x + slot.width + 1e-7 ||
        tools.window!.y + tools.window!.height > slot.y + slot.height + 1e-7
      ) {
        if (failures.length < 12) failures.push(`${label}: panel grows beyond its native slot`);
      }
    }
  };
  for (const width of widths) {
    for (const height of heights) {
      const viewport = { width, height };
      for (const interfaceScaling of OSM_INTERFACE_SCALING_OPTIONS) {
        for (const insets of [NONE, { top: 8, right: 34, bottom: 24, left: 47 }]) {
          const frame = defaultOsmFrame(viewport, insets, { devicePixelRatio, interfaceScaling });
          const label = `${width}x${height} dpr=${devicePixelRatio} ui=${interfaceScaling} safe=${insets.left}`;
          check(frame, viewport, label, devicePixelRatio);
          for (const viewer of [
            { width: 390, height: 844 },
            { width: 667, height: 375 },
          ]) {
            // Automatic resolution fits the recording. Explicit resolution preserves its
            // scale and may clip it; neither recomputes the recorder's interface setting.
            for (const preserveFrameSize of [false, true]) {
              const fit = fitReplayWorkspace({ frame: viewport }, viewer.width, viewer.height, preserveFrameSize).frame;
              const placed = osmFramePlaced(viewport, insets, frame.scale, fit);
              // The recording retains its scale when viewed on a different-DPR device.
              for (const viewerDpr of [1, 2, 3]) {
                check(
                  placed,
                  viewer,
                  `${label} viewer=${viewer.width}x${viewer.height} preserve=${preserveFrameSize} viewerDpr=${viewerDpr}`,
                  viewerDpr,
                );
              }
            }
          }
        }
      }
    }
  }
  expect(checked).toBe(62_400);
  expect(failures, `native chrome sweep: ${checked} live/recorded/fitted frames`).toEqual([]);
});

describe('native left-slot tools with an aligned footer', () => {
  for (const [width, height, rowHeight] of VIEWPORTS) {
    it(`stays within the native slots and aligns Tools with the footer at ${width}×${height}`, () => {
      const viewport = { width, height };
      const frame = defaultOsmFrame(viewport, NONE);
      const slot = osmCssRect(frame, osmChromeLayout(frame.size, false, true).sidePanel);
      const result = osmToolWindowLayout({ frame, viewport, open: true });
      const right = osmCssRect(frame, osmChromeLayout(frame.size, false).sidePanel);
      expect(result.window).toEqual({ ...slot, width: Math.min(slot.width, right.x - slot.x) });
      expect(result.occupied).toEqual([result.window, result.dock]);
      expect(overlaps(result.window!, result.dock)).toBe(false);
      expect(result.dock.x + result.dock.width).toBe(result.window!.x);
      expect(result.dock.y + result.dock.height).toBe(result.window!.y + result.window!.height);
      expect(result.window!.height).toBeLessThanOrEqual(slot.height);
      expect(result.dock.width).toBe(osmCssRect(frame, osmPopoutPlacement(frame.size.height)).width);
      expect(result.dock.height).toBe(rowHeight);
      expect(result.dock).toEqual(osmToolWindowLayout({ frame, viewport, open: false }).dock);
      // A left-side game panel is the sole allowed cover; it permits the full native width.
      const left = osmToolWindowLayout({ frame, viewport, open: true, sidePanelOnLeft: true });
      expect(left.window).toEqual(slot);
      expect(left.dock).toEqual(result.dock);
    });
  }

  it('does not displace short landscape tools into the middle or portrait tools above the slot', () => {
    for (const [width, height, x, y] of [
      [568, 320, 37, 128],
      [360, 640, 42, 283],
      [390, 844, 45, 383],
    ]) {
      const viewport = { width, height };
      const frame = defaultOsmFrame(viewport, NONE);
      expect(osmToolWindowLayout({ frame, viewport, open: true }).window).toMatchObject({ x, y });
    }
  });

  it('keeps a closed tool to its native-column toggle', () => {
    const viewport = { width: 844, height: 390 };
    const frame = defaultOsmFrame(viewport, NONE);
    const result = osmToolWindowLayout({ frame, viewport, open: false });
    expect(result.window).toBeNull();
    expect(result.occupied).toEqual([result.dock]);
  });

  it.each([
    [844, 390],
    [1024, 768],
  ])('collapses tutorial presentation to the shared footer at %s×%s', (width, height) => {
    const viewport = { width, height };
    const frame = defaultOsmFrame(viewport, NONE);
    const layout = osmToolWindowLayout({ frame, viewport, open: true });
    const full = layout.window!;
    const collapsed = osmToolWindowLayout({ frame, viewport, open: true, collapsed: true }).window!;
    const footerHeight = layout.dock.height + 1;
    expect(collapsed).toEqual({ ...full, y: full.y + full.height - footerHeight, height: footerHeight });
  });

  it('aligns within the safe area without moving the native top or left', () => {
    const viewport = { width: 844, height: 390 };
    const frame = defaultOsmFrame(viewport, { top: 8, right: 34, bottom: 12, left: 34 });
    const result = osmToolWindowLayout({ frame, viewport, open: true });
    const slot = osmCssRect(frame, osmChromeLayout(frame.size, false, true).sidePanel);
    expect(result.window).toMatchObject({ x: slot.x, y: slot.y, width: slot.width });
    expect(result.window!.height).toBeLessThanOrEqual(slot.height);
    expect(result.dock.y + result.dock.height).toBe(result.window!.y + result.window!.height);
    for (const rect of [result.window!, result.dock]) {
      expect(rect.x).toBeGreaterThanOrEqual(34);
      expect(rect.y).toBeGreaterThanOrEqual(8);
      expect(rect.x + rect.width).toBeLessThanOrEqual(810);
      expect(rect.y + rect.height).toBeLessThanOrEqual(378);
    }
  });

  for (const [name, screen] of Object.entries(MOBILE_SCREENS)) {
    it(`uses the native slot of a fitted ${name} recording`, () => {
      const viewport = { width: 390, height: 844 };
      const frame = replayedOsmFrame(screen, viewport).placed;
      const { window: win, dock } = osmToolWindowLayout({ frame, viewport, open: true });
      const slot = osmCssRect(frame, osmChromeLayout(frame.size, false, true).sidePanel);
      const right = osmCssRect(frame, osmChromeLayout(frame.size, false).sidePanel);
      expect(win!.x).toBeGreaterThanOrEqual(slot.x);
      expect(win!.x - slot.x).toBeLessThan(1);
      expect(win!.y).toBe(slot.y);
      expect(win!.width).toBeLessThanOrEqual(Math.min(slot.width, right.x - slot.x));
      expect(win!.height).toBeLessThanOrEqual(slot.height + 1e-7);
      expect(dock.y + dock.height).toBe(win!.y + win!.height);
      expect(win!.x - (dock.x + dock.width)).toBeGreaterThanOrEqual(0);
      expect(win!.x - (dock.x + dock.width)).toBeLessThan(1);
      expect(win!.x).toBeGreaterThanOrEqual(0);
      expect(win!.y).toBeGreaterThanOrEqual(0);
      expect(win!.x + win!.width).toBeLessThanOrEqual(viewport.width);
      expect(win!.y + win!.height).toBeLessThanOrEqual(viewport.height);
      expect(overlaps(win!, dock)).toBe(false);
    });
  }
});
