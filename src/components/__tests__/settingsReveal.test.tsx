// @vitest-environment happy-dom

import { act, render } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  GAMEPANEL_AUDIO_ID,
  GAMEPANEL_AUDIO_IDS,
  GAMEPANEL_KEYBINDS_CAMERA_ID,
  GAMEPANEL_KEYBINDS_ID,
  KEYBOARD_SHORTCUTS_REFERENCE_ID,
} from '../../settingsSearch/ids';
import {
  drawersCoveringGamePanel,
  flashRevealTarget,
  getRevealAvailability,
  REVEAL_NO_GAME_PANEL_REASON,
  REVEAL_NOT_SHOWN_REASON,
  REVEAL_REPLAY_REASON,
  REVEAL_UNKNOWN_REASON,
  revealSetting,
  revealSurfaceOf,
  useGamePanelRevealDestination,
  useRevealAction,
} from '../settingsReveal';
import { MOBILE_UI_ATTRIBUTE } from '../ui/mobileSheet';

/** A stand-in game panel: registers as the destination and renders the editor's anchor. */
function Destination({
  blockedReason = null,
  onReveal = () => {},
}: {
  blockedReason?: string | null;
  onReveal?: (id: string) => void;
}) {
  useGamePanelRevealDestination(() => blockedReason, onReveal);
  return (
    <div data-search-id={GAMEPANEL_KEYBINDS_ID}>
      <button type="button" data-search-id={GAMEPANEL_KEYBINDS_CAMERA_ID}>
        Camera
      </button>
    </div>
  );
}

function rect(left: number, top: number, width: number, height: number): DOMRect {
  return {
    left,
    top,
    width,
    height,
    right: left + width,
    bottom: top + height,
    x: left,
    y: top,
    toJSON: () => ({}),
  } as DOMRect;
}

const restores: (() => void)[] = [];

/** Pins `key` on `target` for one test; afterEach puts back exactly what was there. */
function pin(target: object, key: string, value: unknown): void {
  const previous = Object.getOwnPropertyDescriptor(target, key);
  Object.defineProperty(target, key, { configurable: true, value });
  restores.push(() => {
    if (previous) Object.defineProperty(target, key, previous);
    else delete (target as Record<string, unknown>)[key];
  });
}

afterEach(() => {
  for (const restore of restores.splice(0).reverse()) restore();
  vi.useRealTimers();
  vi.restoreAllMocks();
  document.documentElement.removeAttribute(MOBILE_UI_ATTRIBUTE);
});

describe('local reveal flashes', () => {
  it('marks a control without a search id, holds, fades and clears without moving focus', () => {
    vi.useFakeTimers();
    const view = render(<div data-testid="row">Inventory</div>);
    const row = view.getByTestId('row');
    const before = document.activeElement;
    const stop = flashRevealTarget(row);
    expect(row.dataset.revealHighlight).toBe('on');
    expect(row).not.toHaveAttribute('data-search-id');
    expect(document.activeElement).toBe(before);
    act(() => vi.advanceTimersByTime(2500));
    expect(row.dataset.revealHighlight).toBe('fading');
    act(() => vi.advanceTimersByTime(700));
    expect(row.dataset.revealHighlight).toBeUndefined();
    stop();
    expect(vi.getTimerCount()).toBe(0);
  });

  it('restarts the same flash and keeps an older cleanup from canceling it', () => {
    vi.useFakeTimers();
    const view = render(<div data-testid="row">Inventory</div>);
    const row = view.getByTestId('row');
    const first = flashRevealTarget(row);
    act(() => vi.advanceTimersByTime(2000));
    const second = flashRevealTarget(row);
    first();
    expect(row.dataset.revealHighlight).toBe('on');
    act(() => vi.advanceTimersByTime(2499));
    expect(row.dataset.revealHighlight).toBe('on');
    act(() => vi.advanceTimersByTime(1));
    expect(row.dataset.revealHighlight).toBe('fading');
    second();
    expect(row.dataset.revealHighlight).toBeUndefined();
    expect(vi.getTimerCount()).toBe(0);
  });
});

describe('reveal availability', () => {
  it('names the Audio page and its controls by their visible labels', () => {
    expect(GAMEPANEL_AUDIO_ID).toBe('gamepanel.audio');
    expect(GAMEPANEL_AUDIO_IDS).toEqual({
      masterVolume: 'gamepanel.audio.master-volume',
      muteWhenUnfocused: 'gamepanel.audio.mute-when-unfocused',
      sfxVolume: 'gamepanel.audio.sound-effects',
      areaVolume: 'gamepanel.audio.area-sounds',
    });
  });

  it('knows the two game-panel ids and nothing else under that prefix', () => {
    expect(revealSurfaceOf(GAMEPANEL_KEYBINDS_ID)).toBe('gamepanel');
    expect(revealSurfaceOf(GAMEPANEL_KEYBINDS_CAMERA_ID)).toBe('gamepanel');
    for (const id of [GAMEPANEL_AUDIO_ID, ...Object.values(GAMEPANEL_AUDIO_IDS)]) {
      expect(revealSurfaceOf(id), id).toBe('gamepanel');
    }
    expect(revealSurfaceOf('gamepanel.audio.bass')).toBeNull();
    expect(getRevealAvailability('gamepanel.audio.bass')).toEqual({ ok: false, reason: REVEAL_UNKNOWN_REASON });
    expect(getRevealAvailability('nowhere')).toEqual({ ok: false, reason: REVEAL_UNKNOWN_REASON });
  });

  it('refuses a game-panel reveal with no game panel mounted, and changes nothing', () => {
    const events = vi.fn();
    window.addEventListener('settings:reveal', events);
    expect(revealSetting(GAMEPANEL_KEYBINDS_ID)).toEqual({ ok: false, reason: REVEAL_NO_GAME_PANEL_REASON });
    window.removeEventListener('settings:reveal', events);
    expect(events).not.toHaveBeenCalled();
  });

  it('reports a blocked panel with its reason, and revealSetting returns the same without dispatching', () => {
    const onReveal = vi.fn();
    render(<Destination blockedReason={REVEAL_REPLAY_REASON} onReveal={onReveal} />);
    const events = vi.fn();
    window.addEventListener('settings:reveal', events);
    const blocked = { ok: false, reason: REVEAL_REPLAY_REASON };
    expect(getRevealAvailability(GAMEPANEL_KEYBINDS_CAMERA_ID)).toEqual(blocked);
    let status: unknown;
    act(() => {
      status = revealSetting(GAMEPANEL_KEYBINDS_CAMERA_ID);
    });
    expect(status).toEqual(blocked);
    window.removeEventListener('settings:reveal', events);
    expect(events).not.toHaveBeenCalled();
    expect(onReveal).not.toHaveBeenCalled();
  });

  it('follows the panel as it mounts, unblocks and unmounts', () => {
    const view = render(<Destination blockedReason={REVEAL_REPLAY_REASON} />);
    view.rerender(<Destination blockedReason={null} />);
    expect(getRevealAvailability(GAMEPANEL_KEYBINDS_ID)).toEqual({ ok: true });
    view.unmount();
    expect(getRevealAvailability(GAMEPANEL_KEYBINDS_ID)).toEqual({ ok: false, reason: REVEAL_NO_GAME_PANEL_REASON });
  });

  it('hands an available reveal to the panel with its id', () => {
    const onReveal = vi.fn();
    render(<Destination onReveal={onReveal} />);
    let status: unknown;
    act(() => {
      status = revealSetting(GAMEPANEL_KEYBINDS_CAMERA_ID);
    });
    expect(status).toEqual({ ok: true });
    expect(onReveal).toHaveBeenCalledWith(GAMEPANEL_KEYBINDS_CAMERA_ID);
  });

  it('refuses a sidebar row its mounted drawer does not show', () => {
    render(
      <aside className="controls-overlay">
        <div data-search-id="settings.interface" />
      </aside>,
    );
    expect(getRevealAvailability('settings.interface')).toEqual({ ok: true });
    expect(revealSetting('settings.mobile.hotkeys')).toEqual({ ok: false, reason: REVEAL_NOT_SHOWN_REASON });
  });

  it('refuses a sidebar row whose drawer is not mounted, as for a missing game panel', () => {
    const events = vi.fn();
    window.addEventListener('settings:reveal', events);
    expect(revealSetting('plugins.camera')).toEqual({ ok: false, reason: REVEAL_NOT_SHOWN_REASON });
    window.removeEventListener('settings:reveal', events);
    expect(events).not.toHaveBeenCalled();
  });
});

describe('reveal actions', () => {
  function Owner({ perform }: { perform: (() => void) | null }) {
    useRevealAction(KEYBOARD_SHORTCUTS_REFERENCE_ID, perform);
    return null;
  }

  it('lets the owner perform the reveal itself, with no drawer to open or anchor to mark', () => {
    const perform = vi.fn();
    const drawer = document.createElement('aside');
    drawer.className = 'controls-overlay';
    document.body.appendChild(drawer);
    try {
      const { unmount } = render(<Owner perform={perform} />);
      // The anchor is not on the page, yet the action is available.
      expect(revealSurfaceOf(KEYBOARD_SHORTCUTS_REFERENCE_ID)).toBe('action');
      expect(getRevealAvailability(KEYBOARD_SHORTCUTS_REFERENCE_ID)).toEqual({ ok: true });
      const details: unknown[] = [];
      const listener = (event: Event) => details.push((event as CustomEvent).detail);
      window.addEventListener('settings:reveal', listener);
      act(() => {
        revealSetting(KEYBOARD_SHORTCUTS_REFERENCE_ID);
      });
      window.removeEventListener('settings:reveal', listener);
      expect(perform).toHaveBeenCalledOnce();
      expect(details).toEqual([{ id: KEYBOARD_SHORTCUTS_REFERENCE_ID, surface: 'action' }]);
      unmount();
      // Without its owner the id is the Settings row again, unavailable while its anchor is absent.
      expect(revealSurfaceOf(KEYBOARD_SHORTCUTS_REFERENCE_ID)).toBe('settings');
      expect(getRevealAvailability(KEYBOARD_SHORTCUTS_REFERENCE_ID)).toEqual({
        ok: false,
        reason: REVEAL_NOT_SHOWN_REASON,
      });
    } finally {
      drawer.remove();
    }
  });

  it('stays a plain reveal while the owner offers no action (no keyboard)', () => {
    render(<Owner perform={null} />);
    expect(revealSurfaceOf(KEYBOARD_SHORTCUTS_REFERENCE_ID)).toBe('settings');
  });
});

describe('drawers covering the game panel', () => {
  function layout(panel: DOMRect, settings: DOMRect, plugins: DOMRect) {
    render(
      <>
        <div data-tutorial="game-panel" />
        <aside className="controls-overlay" />
        <aside className="plugins-overlay" />
      </>,
    );
    const boxes = new Map<Element, DOMRect>([
      [document.querySelector('[data-tutorial="game-panel"]') as Element, panel],
      [document.querySelector('.controls-overlay') as Element, settings],
      [document.querySelector('.plugins-overlay') as Element, plugins],
    ]);
    vi.spyOn(Element.prototype, 'getBoundingClientRect').mockImplementation(function (this: Element) {
      return boxes.get(this) ?? rect(0, 0, 0, 0);
    });
  }

  it('closes only the drawer whose box overlaps the panel', () => {
    // Modern 1366: Settings on the left, Plugins on the right over the panel.
    layout(rect(1100, 400, 204, 275), rect(0, 0, 321, 768), rect(1045, 0, 321, 768));
    expect(drawersCoveringGamePanel()).toEqual(['plugins']);
  });

  it('closes none when neither overlaps, and both on a touch UI where they are sheets', () => {
    layout(rect(1100, 400, 204, 275), rect(0, 0, 321, 768), rect(-400, 0, 321, 768));
    expect(drawersCoveringGamePanel()).toEqual([]);
    document.documentElement.setAttribute(MOBILE_UI_ATTRIBUTE, '');
    expect(drawersCoveringGamePanel()).toEqual(['settings', 'plugins']);
  });
});

describe('reveal timing', () => {
  /** Frames at 16ms: rAF, timers and performance.now all advance together. */
  function useFrames() {
    vi.useFakeTimers({
      toFake: ['requestAnimationFrame', 'cancelAnimationFrame', 'performance', 'setTimeout', 'clearTimeout'],
    });
    return (ms: number) => act(() => vi.advanceTimersByTime(ms));
  }

  const highlight = (id: string) =>
    document.querySelector<HTMLElement>(`[data-search-id="${id}"]`)?.dataset.revealHighlight;

  it('drops a pending reveal when its destination unmounts, so a remounted panel is not marked', () => {
    const advance = useFrames();
    const first = render(<Destination />);
    act(() => {
      revealSetting(GAMEPANEL_KEYBINDS_CAMERA_ID);
    });
    advance(48);
    first.unmount();
    // Nothing left queued: no frame callback, no listener work.
    expect(vi.getTimerCount()).toBe(0);

    render(<Destination />);
    advance(3000);
    expect(highlight(GAMEPANEL_KEYBINDS_CAMERA_ID)).toBeUndefined();
  });

  it("does not let an older destination's cleanup cancel a newer reveal", () => {
    const advance = useFrames();
    const older = render(<Destination />);
    render(<Destination />);
    act(() => {
      // Both panels take the event; the second's reveal supersedes the first's.
      revealSetting(GAMEPANEL_KEYBINDS_ID);
    });
    older.unmount();
    advance(400);
    expect(highlight(GAMEPANEL_KEYBINDS_ID)).toBe('on');
  });

  it('marks the exact control only once it has held still, holds ~2.5s, then fades', () => {
    const advance = useFrames();
    render(<Destination />);
    const camera = document.querySelector(`[data-search-id="${GAMEPANEL_KEYBINDS_CAMERA_ID}"]`) as HTMLElement;
    let top = 0;
    vi.spyOn(camera, 'getBoundingClientRect').mockImplementation(() => rect(10, top, 60, 20));

    act(() => {
      revealSetting(GAMEPANEL_KEYBINDS_CAMERA_ID);
    });
    // Still moving (a drawer sliding, a panel opening): no mark yet.
    for (let i = 0; i < 20; i++) {
      top += 5;
      advance(16);
    }
    expect(highlight(GAMEPANEL_KEYBINDS_CAMERA_ID)).toBeUndefined();
    advance(100);
    expect(highlight(GAMEPANEL_KEYBINDS_CAMERA_ID)).toBeUndefined();
    advance(80);
    expect(highlight(GAMEPANEL_KEYBINDS_CAMERA_ID)).toBe('on');
    // The exact control, not its parent.
    expect(highlight(GAMEPANEL_KEYBINDS_ID)).toBeUndefined();

    advance(2400);
    expect(highlight(GAMEPANEL_KEYBINDS_CAMERA_ID)).toBe('on');
    advance(150);
    expect(highlight(GAMEPANEL_KEYBINDS_CAMERA_ID)).toBe('fading');
    advance(750);
    expect(highlight(GAMEPANEL_KEYBINDS_CAMERA_ID)).toBeUndefined();
  });

  it('waits for a software keyboard to retract before marking', () => {
    const advance = useFrames();
    const viewport = { height: 400, scale: 1 };
    pin(window, 'visualViewport', viewport);
    pin(window, 'innerHeight', 800);
    pin(navigator, 'maxTouchPoints', 5);
    render(<Destination />);

    act(() => {
      revealSetting(GAMEPANEL_KEYBINDS_ID);
    });
    advance(600);
    expect(highlight(GAMEPANEL_KEYBINDS_ID)).toBeUndefined();

    viewport.height = 800;
    advance(100);
    expect(highlight(GAMEPANEL_KEYBINDS_ID)).toBeUndefined();
    advance(100);
    expect(highlight(GAMEPANEL_KEYBINDS_ID)).toBe('on');
  });

  it('waits while a drawer still sits over the target', () => {
    const advance = useFrames();
    render(
      <>
        <Destination />
        <aside className="plugins-overlay">
          <div data-testid="sheet" />
        </aside>
      </>,
    );
    const target = document.querySelector(`[data-search-id="${GAMEPANEL_KEYBINDS_ID}"]`) as HTMLElement;
    vi.spyOn(target, 'getBoundingClientRect').mockReturnValue(rect(100, 100, 200, 200));
    const sheet = document.querySelector('[data-testid="sheet"]') as Element;
    let covering = true;
    pin(document, 'elementFromPoint', () => (covering ? sheet : target));

    act(() => {
      revealSetting(GAMEPANEL_KEYBINDS_ID);
    });
    advance(500);
    expect(highlight(GAMEPANEL_KEYBINDS_ID)).toBeUndefined();
    covering = false;
    advance(32);
    expect(highlight(GAMEPANEL_KEYBINDS_ID)).toBe('on');
  });

  it('restarts the hold on a repeat reveal, after it settles again', () => {
    const advance = useFrames();
    render(<Destination />);
    act(() => {
      revealSetting(GAMEPANEL_KEYBINDS_ID);
    });
    advance(200);
    expect(highlight(GAMEPANEL_KEYBINDS_ID)).toBe('on');
    advance(2000);
    act(() => {
      revealSetting(GAMEPANEL_KEYBINDS_ID);
    });
    advance(600);
    // Without the restart it would have faded at 2500ms.
    expect(highlight(GAMEPANEL_KEYBINDS_ID)).toBe('on');
  });

  it('never moves focus', () => {
    const advance = useFrames();
    render(<Destination />);
    const before = document.activeElement;
    act(() => {
      revealSetting(GAMEPANEL_KEYBINDS_CAMERA_ID);
    });
    advance(400);
    expect(document.activeElement).toBe(before);
  });
});
