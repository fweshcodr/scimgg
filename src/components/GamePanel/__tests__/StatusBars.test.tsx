// @vitest-environment happy-dom

import { render } from '@testing-library/react';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  CLASSIC_EDGE_LEFT,
  CLASSIC_EDGE_RIGHT,
  type ClientLayoutMode,
  FIXED_EDGE_LEFT_UPPER,
  FIXED_EDGE_RIGHT,
  FIXED_SIDE_COLUMN_ORIGIN,
  type Rect,
} from '../../../layout/osrsClientLayout';
import { MINIMAP } from '../../../resourcePack';
import type { PrayerState } from '../../../types/simulation';
import { ContextMenuProvider } from '../../ContextMenu';
import { PanelContentScaleProvider } from '../../panelContentScale';
import { TooltipProvider } from '../../Tooltip';
import { GamePanel } from '../GamePanel';
import { StatusBars, statusBarsPlacement } from '../StatusBars';
import type { BarFillTarget, BarPaintSpec, BarTextTarget, BarValuePaintSpec } from '../statusBarsPaint';

const sprites = vi.hoisted(() => ({
  prayerIcon: '/assets/ui/status-bars/prayer.png',
  prayer: { naturalWidth: 16, naturalHeight: 16 },
  orb: { naturalWidth: 26, naturalHeight: 26 },
}));

const paintSpies = vi.hoisted(() => ({
  bar: vi.fn<(target: BarFillTarget, spec: BarPaintSpec) => void>(),
  value: vi.fn<(target: BarTextTarget, spec: BarValuePaintSpec) => void>(),
}));

// Call-through spies, not stubs: the paint itself is pinned against a probe in
// statusBarsPaint.test.ts, and what is left to prove here is WHEN the component
// drives it and with which spec.
vi.mock('../statusBarsPaint', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../statusBarsPaint')>();
  paintSpies.bar.mockImplementation(actual.paintBar);
  paintSpies.value.mockImplementation(actual.paintBarValue);
  return { ...actual, paintBar: paintSpies.bar, paintBarValue: paintSpies.value };
});

// Nothing decodes an image in this environment, and a `PixelSprite` whose sprite has not
// resolved has no layout box at all. The icon boxes asserted below are exactly that box.
vi.mock('../../pixelSpriteStore', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../pixelSpriteStore')>();
  const getSprite = (src: string) => {
    if (src === sprites.prayerIcon) return sprites.prayer;
    return src.endsWith('minimap_orb_hitpoints_icon.png') ? sprites.orb : actual.getSprite(src);
  };
  return { ...actual, getSprite };
});

const MODES = ['fixed', 'classic', 'modern', 'mobile'] as const;

/**
 * Upstream contract: RuneLite's statusbars plugin — `StatusBarsOverlay`,
 * `BarRenderer` and `Viewport`. Every expected number below is derived from those
 * files plus this repo's own cache geometry, never read back out of the module
 * under test.
 *
 * Viewport.FIXED / RESIZED_BOX offsets (20, -4) and (0, -4) against the content box;
 * RESIZED_BOTTOM's x = location.x + 10 - 61 and + 10 - 35, y = location.y - 12 + 12.
 */
const PLACEMENTS: Record<ClientLayoutMode, { readonly left: Rect; readonly right: Rect }> = {
  fixed: { left: { x: 11, y: 42, width: 20, height: 252 }, right: { x: 221, y: 42, width: 20, height: 252 } },
  classic: { left: { x: 6, y: 41, width: 20, height: 252 }, right: { x: 216, y: 41, width: 20, height: 252 } },
  modern: { left: { x: -51, y: 0, width: 20, height: 272 }, right: { x: -25, y: 0, width: 20, height: 272 } },
  // RuneLite has no mobile viewport; the mobile side panel is the same 204x275 shell as
  // modern's, so the bars hang off it the same way.
  mobile: { left: { x: -51, y: 0, width: 20, height: 272 }, right: { x: -25, y: 0, width: 20, height: 272 } },
};

describe('statusBarsPlacement', () => {
  it('pins every layout to its exact upstream rects', () => {
    for (const mode of MODES) expect(statusBarsPlacement(mode), mode).toMatchObject(PLACEMENTS[mode]);
  });

  it('keeps both side-column bars over the stone pillars, never over the inventory', () => {
    const covers = (pillar: Rect, bar: Rect, originX = 0) => {
      expect(bar.x).toBeGreaterThanOrEqual(pillar.x - originX);
      expect(bar.x + bar.width).toBeLessThanOrEqual(pillar.x - originX + pillar.width);
    };
    const fixed = statusBarsPlacement('fixed');
    const classic = statusBarsPlacement('classic');

    covers(FIXED_EDGE_LEFT_UPPER, fixed.left, FIXED_SIDE_COLUMN_ORIGIN.x);
    covers(FIXED_EDGE_RIGHT, fixed.right, FIXED_SIDE_COLUMN_ORIGIN.x);
    covers(CLASSIC_EDGE_LEFT, classic.left);
    covers(CLASSIC_EDGE_RIGHT, classic.right);
  });

  it('reports a bounds box that covers both bars', () => {
    for (const mode of MODES) {
      const { left, right, bounds } = statusBarsPlacement(mode);
      expect(bounds.x).toBe(Math.min(left.x, right.x));
      expect(bounds.y).toBe(Math.min(left.y, right.y));
      expect(bounds.x + bounds.width).toBe(Math.max(left.x + left.width, right.x + right.width));
      expect(bounds.y + bounds.height).toBe(Math.max(left.y + left.height, right.y + right.height));
    }
  });
});

const Providers = ({ children }: { children: ReactNode }) => (
  <TooltipProvider>
    <ContextMenuProvider>{children}</ContextMenuProvider>
  </TooltipProvider>
);

const renderPanel = (props: {
  statusBarsEnabled?: boolean;
  statusBarsShowValues?: boolean;
  clientLayoutMode?: ClientLayoutMode;
  prayerState?: PrayerState;
}) => render(<GamePanel activePrayer={null} onPrayerChange={vi.fn()} {...props} />, { wrapper: Providers });

const statusBarsRoot = (): HTMLElement | null => document.querySelector<HTMLElement>('[data-status-bars]');

interface BarValues {
  readonly showValues?: boolean;
  readonly currentHitpoints?: number;
  readonly currentPrayer?: number;
}

function bars(mode: ClientLayoutMode, values: BarValues = {}) {
  const { showValues = true, currentHitpoints = 70, currentPrayer = 50 } = values;
  return (
    <StatusBars
      mode={mode}
      currentHitpoints={currentHitpoints}
      maxHitpoints={99}
      currentPrayer={currentPrayer}
      maxPrayer={99}
      anyPrayerActive={false}
      showValues={showValues}
    />
  );
}

const renderBars = (mode: ClientLayoutMode, values: BarValues = {}) => render(bars(mode, values));

const fillCanvas = (): HTMLCanvasElement | null =>
  document.querySelector<HTMLCanvasElement>('[data-status-bars] canvas:not([data-src])');

const iconCanvases = (): HTMLCanvasElement[] => [
  ...document.querySelectorAll<HTMLCanvasElement>('[data-status-bars] canvas[data-src]'),
];

const styleBox = (icon?: HTMLCanvasElement): string =>
  [icon?.style.width, icon?.style.height, icon?.style.left, icon?.style.top].join(' ');

const paintedValues = (): number[] => paintSpies.value.mock.calls.map(([, spec]) => spec.current);
const paintedFills = (): number[] => paintSpies.bar.mock.calls.map(([, spec]) => spec.current);
const paintedScales = (): number[] => paintSpies.bar.mock.calls.map(([, spec]) => spec.deviceScale);

/** `skill_icons_small` are 16x16, and `BarRenderer.renderIconsAndCounters` insets by 4. */
const ICON_SIZE = 16;
const ICON_TOP_INSET = 4;

describe('Status Bars icons', () => {
  it('hangs both icons off the overlay as sprites, over a single fill canvas', () => {
    renderBars('modern');
    expect(document.querySelectorAll('[data-status-bars] canvas:not([data-src])')).toHaveLength(1);
    expect(iconCanvases().map((icon) => icon.dataset.src)).toEqual([MINIMAP.orbHitpointsIcon, sprites.prayerIcon]);
  });

  it('gives both icons the same box, centered on their own bar at the same top', () => {
    for (const mode of MODES) {
      const view = renderBars(mode);
      const [hitpoints, prayer] = iconCanvases();
      const { left, right, bounds } = statusBarsPlacement(mode);
      const boxOf = (bar: Rect) =>
        `${ICON_SIZE}px ${ICON_SIZE}px ${bar.x - bounds.x + (bar.width - ICON_SIZE) / 2}px ${bar.y - bounds.y + ICON_TOP_INSET}px`;

      expect(styleBox(hitpoints), `hitpoints icon in ${mode}`).toBe(boxOf(left));
      expect(styleBox(prayer), `prayer icon in ${mode}`).toBe(boxOf(right));
      expect(hitpoints?.style.top, `icons out of line in ${mode}`).toBe(prayer?.style.top);
      view.unmount();
    }
  });
});

describe('Status Bars values', () => {
  beforeEach(() => vi.clearAllMocks());

  it('writes the current hitpoints and prayer under their own icons', () => {
    renderBars('modern', { currentHitpoints: 70, currentPrayer: 50 });
    const { left, right } = PLACEMENTS.modern;

    expect(paintedValues()).toEqual([70, 50]);
    expect(paintSpies.value.mock.calls.map(([, spec]) => spec.bar)).toEqual([left, right]);
  });

  it('keeps both bars and both icons while the values are switched off', () => {
    renderBars('modern', { showValues: false });

    expect(paintSpies.value).not.toHaveBeenCalled();
    expect(paintSpies.bar).toHaveBeenCalledTimes(2);
    expect(iconCanvases()).toHaveLength(2);
  });

  it('drops the values the moment the setting goes off, without remounting the bars', () => {
    const view = renderBars('modern');
    const canvas = fillCanvas();
    vi.clearAllMocks();

    view.rerender(bars('modern', { showValues: false }));

    expect(paintSpies.value).not.toHaveBeenCalled();
    expect(fillCanvas()).toBe(canvas);
  });

  it('repaints the fills and the values when a value changes', () => {
    const view = renderBars('modern', { currentHitpoints: 70, currentPrayer: 50 });
    vi.clearAllMocks();

    view.rerender(bars('modern', { currentHitpoints: 31, currentPrayer: 12 }));

    expect(paintedFills()).toEqual([31, 12]);
    expect(paintedValues()).toEqual([31, 12]);
  });

  it("repaints at the panel's own scale when it zooms", () => {
    const view = render(<PanelContentScaleProvider value={1}>{bars('modern')}</PanelContentScaleProvider>);
    expect(paintedScales()).toEqual([1, 1]);
    vi.clearAllMocks();

    view.rerender(<PanelContentScaleProvider value={2}>{bars('modern')}</PanelContentScaleProvider>);

    expect(paintedScales()).toEqual([2, 2]);
    expect(paintSpies.value.mock.calls.map(([, spec]) => spec.deviceScale)).toEqual([2, 2]);
  });

  // The GPU can drop a 2D context at any time; nothing re-renders React when it
  // comes back, so without this listener the bars stay blank until the next tick.
  it('repaints fills and values when the canvas context is restored, with no rerender', () => {
    renderBars('modern', { currentHitpoints: 70, currentPrayer: 50 });
    const canvas = fillCanvas();
    vi.clearAllMocks();

    canvas?.dispatchEvent(new Event('contextrestored'));

    expect(paintedFills()).toEqual([70, 50]);
    expect(paintedValues()).toEqual([70, 50]);
  });
});

describe('GamePanel mounts the Status Bars overlay', () => {
  it('renders nothing while the plugin is off, and defaults to off', () => {
    renderPanel({ statusBarsEnabled: false });
    expect(statusBarsRoot()).toBeNull();

    renderPanel({});
    expect(statusBarsRoot()).toBeNull();
  });

  it('mounts exactly one overlay per layout, tagged with the layout it was laid out for', () => {
    for (const mode of MODES) {
      const view = renderPanel({ statusBarsEnabled: true, clientLayoutMode: mode });
      expect(statusBarsRoot()?.dataset.statusBars, `no status bars in ${mode}`).toBe(mode);
      expect(document.querySelectorAll('[data-status-bars]')).toHaveLength(1);
      view.unmount();
    }
  });

  it("is decorative, and sits on the layout's bounds box", () => {
    renderPanel({ statusBarsEnabled: true, clientLayoutMode: 'modern' });
    const root = statusBarsRoot();
    expect(root?.getAttribute('aria-hidden')).toBe('true');
    expect(root?.style.pointerEvents).toBe('none');

    const { bounds } = statusBarsPlacement('modern');
    const box = [root?.style.left, root?.style.top, root?.style.width, root?.style.height].join(' ');
    expect(box).toBe(`${bounds.x}px ${bounds.y}px ${bounds.width}px ${bounds.height}px`);
  });

  it('feeds the live prayer points through the Show values setting, and defaults it on', () => {
    const prayerState: PrayerState = {
      points: 50,
      maxPoints: 99,
      drainCounter: 0,
      activePrayers: [],
      prayerActivationTicks: {},
    };

    vi.clearAllMocks();
    renderPanel({ statusBarsEnabled: true, prayerState }).unmount();
    expect(paintedValues()).toEqual([0, 50]);

    vi.clearAllMocks();
    renderPanel({ statusBarsEnabled: true, statusBarsShowValues: false, prayerState }).unmount();
    expect(paintSpies.value).not.toHaveBeenCalled();

    vi.clearAllMocks();
    renderPanel({ statusBarsEnabled: true, statusBarsShowValues: true, prayerState }).unmount();
    expect(paintedValues()).toEqual([0, 50]);
  });
});
