// @vitest-environment happy-dom

import { act, fireEvent, render, screen } from '@testing-library/react';
import type { ComponentProps } from 'react';
import { describe, expect, it, vi } from 'vitest';
import type { ReplayClickType } from '../../core/ReplayRecorder';
import { TOUCH_LONG_PRESS_DEFAULT_MS } from '../../input/touchPrefs';
import {
  COMPACT_ORBS_LAYOUTS,
  type CompactOrbId,
  type CompactOrbsLayout,
  DEFAULT_COMPACT_ORBS_ORDER,
} from '../../types/compactOrbs';
import { ContextMenuOverlay, ContextMenuProvider } from '../ContextMenu';
import { MinimapOrbs } from '../MinimapOrbs';
import { COMPACT_ORBS_GEOMETRY, ORB_CENTER_X, ORB_CENTER_Y } from '../minimapOrbGeometry';
import { TooltipOverlay, TooltipProvider } from '../Tooltip';

type ReplayCursorClick = (clientX: number, clientY: number, type: ReplayClickType, nowMs?: number) => void;
type MinimapOrbsTestProps = Partial<ComponentProps<typeof MinimapOrbs>> & {
  readonly onReplayCursorClick?: ReplayCursorClick;
};

function setEventTimeStamp(event: Event, timeStamp: number): Event {
  Object.defineProperty(event, 'timeStamp', { value: timeStamp, configurable: true });
  return event;
}

function mouseEvent(type: string, init: MouseEventInit, timeStamp: number): MouseEvent {
  return setEventTimeStamp(new MouseEvent(type, { bubbles: true, cancelable: true, ...init }), timeStamp) as MouseEvent;
}

function buttonForAltText(altText: string): HTMLButtonElement {
  const container = screen.getByRole('img', { name: altText }).closest('div');
  const button = container?.querySelector('button') ?? null;
  expect(button).not.toBeNull();
  if (button === null) {
    throw new Error(`Missing button for ${altText}`);
  }
  return button;
}

function minimapOrbsProps(props: MinimapOrbsTestProps = {}): ComponentProps<typeof MinimapOrbs> {
  return {
    centerX: 100,
    centerY: 100,
    radius: 50,
    currentHP: 99,
    maxHP: 99,
    currentPrayer: 99,
    runEnergy: 100,
    specialAttack: 100,
    isRunEnabled: false,
    isSpecialAttackActive: false,
    pendingSpecialAttackToggles: 0,
    hasSpecialAttack: true,
    onRunToggle: vi.fn(),
    onSpecialAttackToggle: vi.fn(),
    ...props,
  };
}

function renderMinimapOrbs(props: MinimapOrbsTestProps = {}) {
  return render(
    <TooltipProvider>
      <ContextMenuProvider>
        <MinimapOrbs {...minimapOrbsProps(props)} />
      </ContextMenuProvider>
    </TooltipProvider>,
  );
}

/** Top-left of an orb's frame, which is where the component positions it. */
function orbFrameOrigin(altText: string): { left: number; top: number } {
  const frame = screen.getByRole('img', { name: altText }).closest('div');
  if (!frame) {
    throw new Error(`Missing frame for ${altText}`);
  }
  return { left: Number.parseFloat(frame.style.left), top: Number.parseFloat(frame.style.top) };
}

/** Where a compact layout puts the orb in `slot`, expressed as a frame origin. */
function compactSlotOrigin(layout: CompactOrbsLayout, slot: number): { left: number; top: number } {
  const center = COMPACT_ORBS_GEOMETRY[layout].centers[slot];
  return { left: center.x - ORB_CENTER_X, top: center.y - ORB_CENTER_Y };
}

/** The sprite file name a canvas draws, for comparing against a `MINIMAP.*` entry. */
function spriteName(canvas: Element | null, what: string): string {
  if (canvas === null) {
    throw new Error(`Missing ${what}`);
  }
  return canvas.getAttribute('data-src')?.split('/').pop() ?? '';
}

/** The orb's stone frame sprite, which is what the hover swap replaces. */
function frameSprite(altText: string): string {
  const container = screen.getByRole('img', { name: altText }).closest('div');
  return spriteName(container?.querySelector('canvas[data-src*="minimap_orb_frame"]') ?? null, `frame for ${altText}`);
}

/** The sprite filling an orb's circle behind its icon. */
function fillSprite(altText: string): string {
  const container = screen.getByRole('img', { name: altText }).closest('div');
  return spriteName(container?.querySelector(':scope > div > canvas[data-src]') ?? null, `fill for ${altText}`);
}

const ORB_ALT_TEXT: Record<CompactOrbId, string> = {
  hitpoints: 'Hitpoints',
  prayer: 'Prayer',
  run: 'Run Energy',
  special: 'Special Attack',
};

describe('MinimapOrbs', () => {
  it('renders all four orbs', () => {
    renderMinimapOrbs();
    expect(screen.getByRole('img', { name: 'Hitpoints' })).toBeTruthy();
    expect(screen.getByRole('img', { name: 'Prayer' })).toBeTruthy();
    expect(screen.getByRole('img', { name: 'Run Energy' })).toBeTruthy();
    expect(screen.getByRole('img', { name: 'Special Attack' })).toBeTruthy();
  });

  it('left-click on Run orb fires onRunToggle', () => {
    const onRunToggle = vi.fn();
    renderMinimapOrbs({ isRunEnabled: false, onRunToggle });

    const runOrbButton = screen.getByRole('img', { name: 'Run Energy' }).closest('div')!.querySelector('button')!;
    fireEvent.mouseDown(runOrbButton, { button: 0 });

    expect(onRunToggle).toHaveBeenCalledTimes(1);
    expect(onRunToggle).toHaveBeenCalledWith();
  });

  it('left-click on Special Attack orb fires onSpecialAttackToggle', () => {
    const onSpecialAttackToggle = vi.fn();
    renderMinimapOrbs({ onSpecialAttackToggle });

    const specialOrbButton = screen
      .getByRole('img', { name: 'Special Attack' })
      .closest('div')!
      .querySelector('button')!;
    fireEvent.mouseDown(specialOrbButton, { button: 0 });

    expect(onSpecialAttackToggle).toHaveBeenCalled();
  });

  it('context menu handler and left-click both work on same orb', () => {
    const onRunToggle = vi.fn();
    renderMinimapOrbs({ isRunEnabled: false, onRunToggle });

    const runOrbButton = screen.getByRole('img', { name: 'Run Energy' }).closest('div')!.querySelector('button')!;
    fireEvent.contextMenu(runOrbButton);
    fireEvent.mouseDown(runOrbButton, { button: 0 });

    expect(onRunToggle).toHaveBeenCalledTimes(1);
  });

  it('opens the orb menu on a touch-only press-and-hold without also toggling', () => {
    const matchMedia = vi.spyOn(window, 'matchMedia').mockImplementation(
      (query: string) =>
        ({
          matches: query.includes('coarse'),
          media: query,
          addEventListener: vi.fn(),
          removeEventListener: vi.fn(),
        }) as unknown as MediaQueryList,
    );
    vi.useFakeTimers();
    try {
      const onRunToggle = vi.fn();
      render(
        <TooltipProvider>
          <ContextMenuProvider>
            <MinimapOrbs {...minimapOrbsProps({ isRunEnabled: false, onRunToggle })} />
            <ContextMenuOverlay />
          </ContextMenuProvider>
        </TooltipProvider>,
      );
      const runOrbButton = buttonForAltText('Run Energy');
      const touch = (type: string) =>
        fireEvent(
          runOrbButton,
          new PointerEvent(type, { bubbles: true, pointerType: 'touch', pointerId: 1, isPrimary: true }),
        );

      touch('pointerdown');
      act(() => vi.advanceTimersByTime(TOUCH_LONG_PRESS_DEFAULT_MS));
      touch('pointerup');
      fireEvent.mouseDown(runOrbButton, { button: 0 });

      expect(screen.getByRole('menu')).toHaveTextContent('Toggle Run');
      expect(onRunToggle).not.toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
      matchMedia.mockRestore();
    }
  });

  it('toggles once on a touch-only tap that wobbles across the orb, and not on a release off it', () => {
    const matchMedia = vi.spyOn(window, 'matchMedia').mockImplementation(
      (query: string) =>
        ({
          matches: query.includes('coarse'),
          media: query,
          addEventListener: vi.fn(),
          removeEventListener: vi.fn(),
        }) as unknown as MediaQueryList,
    );
    vi.useFakeTimers();
    try {
      const onRunToggle = vi.fn();
      renderMinimapOrbs({ isRunEnabled: false, onRunToggle });
      const runOrbButton = buttonForAltText('Run Energy');
      // The orb's hit box: 27 px, a 34 px orb at the smallest Mobile scale.
      runOrbButton.getBoundingClientRect = () => new DOMRect(100, 100, 27, 27);
      const touch = (type: string, clientX: number, clientY: number) =>
        fireEvent(
          runOrbButton,
          new PointerEvent(type, {
            bubbles: true,
            cancelable: true,
            pointerType: 'touch',
            pointerId: 1,
            isPrimary: true,
            clientX,
            clientY,
          }),
        );

      // 18 px of travel, all on the orb, then the click the browser still sends.
      touch('pointerdown', 104, 104);
      touch('pointermove', 122, 106);
      touch('pointerup', 120, 120);
      fireEvent.click(runOrbButton, { button: 0, clientX: 120, clientY: 120 });
      expect(onRunToggle).toHaveBeenCalledOnce();

      touch('pointerdown', 104, 104);
      touch('pointerup', 104, 160);
      expect(onRunToggle).toHaveBeenCalledOnce();
    } finally {
      vi.useRealTimers();
      matchMedia.mockRestore();
    }
  });

  it('records a yellow replay marker when quick prayer is toggled from the prayer orb', () => {
    const onQuickPrayerToggle = vi.fn();
    const onReplayCursorClick = vi.fn<ReplayCursorClick>();
    renderMinimapOrbs({ onQuickPrayerToggle, onReplayCursorClick });

    fireEvent(buttonForAltText('Prayer'), mouseEvent('mousedown', { button: 0, clientX: 201, clientY: 301 }, 4010));

    expect(onQuickPrayerToggle).toHaveBeenCalledTimes(1);
    expect(onReplayCursorClick).toHaveBeenCalledTimes(1);
    expect(onReplayCursorClick).toHaveBeenCalledWith(201, 301, 'yellow', 4010);
  });

  it('records a yellow replay marker when run is toggled from the run orb', () => {
    const onRunToggle = vi.fn();
    const onReplayCursorClick = vi.fn<ReplayCursorClick>();
    renderMinimapOrbs({ isRunEnabled: false, onRunToggle, onReplayCursorClick });

    fireEvent(buttonForAltText('Run Energy'), mouseEvent('mousedown', { button: 0, clientX: 202, clientY: 302 }, 4020));

    expect(onRunToggle).toHaveBeenCalledTimes(1);
    expect(onReplayCursorClick).toHaveBeenCalledTimes(1);
    expect(onReplayCursorClick).toHaveBeenCalledWith(202, 302, 'yellow', 4020);
  });

  it('records a yellow replay marker when enabled special attack is toggled from the special attack orb', () => {
    const onSpecialAttackToggle = vi.fn();
    const onReplayCursorClick = vi.fn<ReplayCursorClick>();
    renderMinimapOrbs({ hasSpecialAttack: true, onSpecialAttackToggle, onReplayCursorClick });

    fireEvent(
      buttonForAltText('Special Attack'),
      mouseEvent('mousedown', { button: 0, clientX: 203, clientY: 303 }, 4030),
    );

    expect(onSpecialAttackToggle).toHaveBeenCalledTimes(1);
    expect(onReplayCursorClick).toHaveBeenCalledTimes(1);
    expect(onReplayCursorClick).toHaveBeenCalledWith(203, 303, 'yellow', 4030);
  });

  it('does not record a replay marker when disabled special attack is clicked', () => {
    const onSpecialAttackToggle = vi.fn();
    const onReplayCursorClick = vi.fn<ReplayCursorClick>();
    renderMinimapOrbs({ hasSpecialAttack: false, onSpecialAttackToggle, onReplayCursorClick });

    fireEvent(
      buttonForAltText('Special Attack'),
      mouseEvent('mousedown', { button: 0, clientX: 204, clientY: 304 }, 4040),
    );

    expect(onSpecialAttackToggle).not.toHaveBeenCalled();
    expect(onReplayCursorClick).not.toHaveBeenCalled();
  });

  /** Venom is a poison level too, so a venom check placed second never fires. */
  it.each([
    [0, 'minimap_orb_hitpoints.png'],
    [12, 'minimap_orb_hitpoints_poison.png'],
    [1000000, 'minimap_orb_hitpoints_venom.png'],
  ] as const)('fills the hitpoints orb for poisonVarp %i', (poisonVarp, sprite) => {
    renderMinimapOrbs({ poisonVarp });
    expect(fillSprite('Hitpoints')).toBe(sprite);
  });
});

describe('MinimapOrbs layouts', () => {
  it('places the orbs on the vanilla arc by default', () => {
    renderMinimapOrbs();
    // Arc positions come from centerX/centerY + radius, not the compact table.
    const origins = Object.values(ORB_ALT_TEXT).map((alt) => orbFrameOrigin(alt));
    expect(new Set(origins.map((o) => `${o.left},${o.top}`)).size).toBe(4);
    for (const { left, top } of origins) {
      expect(Number.isFinite(left)).toBe(true);
      expect(Number.isFinite(top)).toBe(true);
    }
  });

  it('ignores orbOrder on the arc layout', () => {
    const { unmount } = renderMinimapOrbs();
    const canonical = Object.values(ORB_ALT_TEXT).map((alt) => orbFrameOrigin(alt));
    unmount();

    renderMinimapOrbs({ orbOrder: ['special', 'run', 'prayer', 'hitpoints'] });
    const reordered = Object.values(ORB_ALT_TEXT).map((alt) => orbFrameOrigin(alt));
    expect(reordered).toEqual(canonical);
  });

  it('places fixed-mode orbs on the cache-authored group 160 origins', () => {
    renderMinimapOrbs({ layout: 'fixed' });

    expect(orbFrameOrigin('Hitpoints')).toEqual({ left: 0, top: 37 });
    expect(orbFrameOrigin('Prayer')).toEqual({ left: 0, top: 71 });
    expect(orbFrameOrigin('Run Energy')).toEqual({ left: 10, top: 103 });
    expect(orbFrameOrigin('Special Attack')).toEqual({ left: 32, top: 128 });
  });

  it.each(COMPACT_ORBS_LAYOUTS)('places the orbs on the %s compact block', (layout) => {
    renderMinimapOrbs({ layout });
    DEFAULT_COMPACT_ORBS_ORDER.forEach((orbId, slot) => {
      expect(orbFrameOrigin(ORB_ALT_TEXT[orbId])).toEqual(compactSlotOrigin(layout, slot));
    });
  });

  it('moves orbs to the slots named by orbOrder', () => {
    const order: CompactOrbId[] = ['special', 'run', 'prayer', 'hitpoints'];
    renderMinimapOrbs({ layout: 'vertical', orbOrder: order });
    order.forEach((orbId, slot) => {
      expect(orbFrameOrigin(ORB_ALT_TEXT[orbId])).toEqual(compactSlotOrigin('vertical', slot));
    });
  });

  it('honors orbOrder in the column-major 2x2 layout', () => {
    const order: CompactOrbId[] = ['run', 'hitpoints', 'special', 'prayer'];
    renderMinimapOrbs({ layout: 'horizontal', orbOrder: order });
    order.forEach((orbId, slot) => {
      expect(orbFrameOrigin(ORB_ALT_TEXT[orbId])).toEqual(compactSlotOrigin('horizontal', slot));
    });
  });

  it.each([
    [['hitpoints'], 'too short'],
    [['hitpoints', 'hitpoints', 'prayer', 'run'], 'duplicated'],
    [['hitpoints', 'prayer', 'run', 'special', 'special'], 'too long'],
  ])('falls back to the canonical order for a %s orbOrder (%s)', (order) => {
    renderMinimapOrbs({ layout: 'vertical', orbOrder: order as CompactOrbId[] });
    // A malformed order must never stack orbs or index past the four slots.
    DEFAULT_COMPACT_ORBS_ORDER.forEach((orbId, slot) => {
      expect(orbFrameOrigin(ORB_ALT_TEXT[orbId])).toEqual(compactSlotOrigin('vertical', slot));
    });
  });
});

/**
 * The sweep's math and gate are covered in prayerFlickOrb.test.ts. What is
 * checked here is the wiring: that the gate reaches the DOM, that the sweep
 * hangs off the PRAYER orb's own frame (so it rides both layouts for free), and
 * that closing the gate takes the element - and with it the animation loop -
 * back out again.
 */
describe('MinimapOrbs prayer flick sweep', () => {
  const sweeps = () => document.querySelectorAll('.prayer-orb-flick-sweep');

  const flickOn = {
    prayerEnabled: true,
    prayerFlickOrbEnabled: true,
    hasPredictedPrayer: true,
    hasCommittedPrayer: true,
  };

  const prayerOff = { hasPredictedPrayer: false, hasCommittedPrayer: false };

  const rerenderWith = (rerender: ReturnType<typeof render>['rerender'], props: MinimapOrbsTestProps) =>
    rerender(
      <TooltipProvider>
        <ContextMenuProvider>
          <MinimapOrbs {...minimapOrbsProps(props)} />
        </ContextMenuProvider>
      </TooltipProvider>,
    );

  it('draws the sweep on the prayer orb and nowhere else', () => {
    renderMinimapOrbs(flickOn);
    expect(sweeps().length).toBe(1);
    expect(
      screen.getByRole('img', { name: 'Prayer' }).closest('div')?.querySelector('.prayer-orb-flick-sweep'),
    ).not.toBeNull();
  });

  it.each(COMPACT_ORBS_LAYOUTS)('rides the prayer orb frame in the %s layout', (layout) => {
    renderMinimapOrbs({ ...flickOn, layout });
    const frame = screen.getByRole('img', { name: 'Prayer' }).closest('div');
    expect(frame?.querySelector('.prayer-orb-flick-sweep')).not.toBeNull();
  });

  it('stays out of the DOM while the Prayer plugin or its flick setting is off', () => {
    const { unmount } = renderMinimapOrbs({ ...flickOn, prayerEnabled: false });
    expect(sweeps().length).toBe(0);
    unmount();

    renderMinimapOrbs({ ...flickOn, prayerFlickOrbEnabled: false });
    expect(sweeps().length).toBe(0);
  });

  it('hides with no prayer on unless always-on is set', () => {
    const { unmount } = renderMinimapOrbs({ ...flickOn, ...prayerOff });
    expect(sweeps().length).toBe(0);
    unmount();

    renderMinimapOrbs({ ...flickOn, ...prayerOff, prayerFlickAlwaysOn: true });
    expect(sweeps().length).toBe(1);
  });

  /**
   * The failure this guards against: a flick is an off-click and an on-click inside one
   * tick, so the client-predicted prayer state dips to "off" between them while
   * the engine still has the prayer burning. Gating the sweep on the prediction
   * alone unmounted it there, and remounting restarted the line from its
   * `scaleY(0)` initial style - a blink every single tick, while flicking, which
   * is the one time a timing instrument has to stay continuous.
   */
  it('keeps the same sweep element through a flick, never tearing it down mid-tick', () => {
    const { rerender } = renderMinimapOrbs(flickOn);
    const before = sweeps()[0];
    expect(before).toBeDefined();

    // Off-click: the prediction says no prayer, the committed tick still says yes.
    rerenderWith(rerender, { ...flickOn, hasPredictedPrayer: false });
    expect(sweeps()[0]).toBe(before);

    // On-click, same tick. The engine folds both and the prayer never went out.
    rerenderWith(rerender, flickOn);
    expect(sweeps()[0]).toBe(before);
  });

  it('tears the sweep down when the last prayer goes off', () => {
    const { rerender } = renderMinimapOrbs(flickOn);
    expect(sweeps().length).toBe(1);
    rerenderWith(rerender, { ...flickOn, ...prayerOff });
    expect(sweeps().length).toBe(0);
  });
});

/**
 * Hovering an orb swaps `orb_frame,0` for `orb_frame,1`, but only while the orb
 * has an action for the pointer: always for prayer and run, only while poisoned
 * for hitpoints, and only with a spec weapon worn for special.
 */
describe('MinimapOrbs hover', () => {
  it.each(['Prayer', 'Run Energy'])('brightens the %s orb frame while hovered', (alt) => {
    renderMinimapOrbs();
    expect(frameSprite(alt)).toBe('minimap_orb_frame.png');

    fireEvent.mouseEnter(buttonForAltText(alt));
    expect(frameSprite(alt)).toBe('minimap_orb_frame_hovered.png');

    fireEvent.mouseLeave(buttonForAltText(alt));
    expect(frameSprite(alt)).toBe('minimap_orb_frame.png');
  });

  it('leaves the hitpoints orb frame alone unless poisoned', () => {
    const { unmount } = renderMinimapOrbs();
    fireEvent.mouseEnter(buttonForAltText('Hitpoints'));
    expect(frameSprite('Hitpoints')).toBe('minimap_orb_frame.png');
    unmount();

    renderMinimapOrbs({ poisonVarp: 12 });
    fireEvent.mouseEnter(buttonForAltText('Hitpoints'));
    expect(frameSprite('Hitpoints')).toBe('minimap_orb_frame_hovered.png');
  });

  it('leaves the special attack orb frame alone with no spec weapon', () => {
    const { unmount } = renderMinimapOrbs({ hasSpecialAttack: false });
    fireEvent.mouseEnter(buttonForAltText('Special Attack'));
    expect(frameSprite('Special Attack')).toBe('minimap_orb_frame.png');
    unmount();

    renderMinimapOrbs({ hasSpecialAttack: true });
    fireEvent.mouseEnter(buttonForAltText('Special Attack'));
    expect(frameSprite('Special Attack')).toBe('minimap_orb_frame_hovered.png');
  });

  /** The hover handlers wrap the bound tooltip's, so overwriting them silently kills it. */
  it('still shows the run orb tooltip while hovered', () => {
    render(
      <TooltipProvider>
        <ContextMenuProvider>
          <MinimapOrbs {...minimapOrbsProps()} />
          <TooltipOverlay />
        </ContextMenuProvider>
      </TooltipProvider>,
    );

    fireEvent.mouseEnter(buttonForAltText('Run Energy'));
    expect(screen.getByText('Toggle')).toBeTruthy();
  });
});

/**
 * With the Soulreaper axe worn the special orb reads the soul stacks out of five, fills by them and swaps orb_icon,6 for
 * orb_icon,16. Every layout, mobile and Compact Orbs included, draws the same special orb.
 */
describe('MinimapOrbs Soulreaper axe', () => {
  const LAYOUTS = ['arc', 'fixed', 'mobile', ...COMPACT_ORBS_LAYOUTS] as const;

  function specialOrb() {
    const icon = screen.getByRole('img', { name: 'Special Attack' });
    const orb = icon.closest('div');
    if (orb === null) throw new Error('Missing special orb');
    // The circle's empty overlay is cropped to the share of the orb that is missing.
    const empty = orb.querySelector('canvas[data-src*="minimap_orb_empty"]')?.parentElement ?? null;
    return {
      icon: spriteName(icon, 'special icon'),
      value: orb.querySelector('span')?.textContent,
      emptyHeight: empty === null ? 0 : Number.parseFloat(empty.style.height),
    };
  }

  it.each(LAYOUTS)('shows the stacks out of five with the axe icon in the %s layout', (layout) => {
    const { unmount } = renderMinimapOrbs({ layout, specialAttack: 100, soulreaperStacks: 0 });
    const empty = specialOrb();
    expect(empty).toMatchObject({ icon: 'minimap_orb_soulreaper_axe_icon.png', value: '0' });
    unmount();

    renderMinimapOrbs({ layout, specialAttack: 100, soulreaperStacks: 5 });
    expect(specialOrb()).toMatchObject({ icon: 'minimap_orb_soulreaper_axe_icon.png', value: '5', emptyHeight: 0 });
    expect(empty.emptyHeight).toBeGreaterThan(0);
  });

  it('keeps special energy and its icon without the axe', () => {
    renderMinimapOrbs({ specialAttack: 40 });
    expect(specialOrb()).toMatchObject({ icon: 'minimap_orb_special_icon.png', value: '40' });
  });
});
