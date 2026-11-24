// @vitest-environment happy-dom
import { act, cleanup, renderHook } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { captureKeybind } from '../../input/keybindCapture';
import { deleteSetting, saveSetting } from '../../util/storage';
import { useAppHotkeys } from '../useAppHotkeys';

function renderUseAppHotkeys() {
  const onReset = vi.fn();
  const triggerHintToast = vi.fn((_type: string, _content: ReactNode) => undefined);
  const hook = renderHook(() =>
    useAppHotkeys({
      onReset,
      onToggleQuickSearch: vi.fn(),
      onToggleShowFps: vi.fn(),
      triggerHintToast,
    }),
  );
  return { ...hook, onReset, triggerHintToast };
}

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  deleteSetting('osrs-unified-keybinds');
});

describe('useAppHotkeys replay practice', () => {
  function renderPractice() {
    const onRetry = vi.fn();
    renderHook(() =>
      useAppHotkeys({
        onReset: onRetry,
        onToggleQuickSearch: vi.fn(),
        onToggleShowFps: vi.fn(),
        triggerHintToast: vi.fn(),
      }),
    );
    return { onRetry };
  }
  function press(init: KeyboardEventInit, target: EventTarget = window) {
    const event = new KeyboardEvent('keydown', { ...init, bubbles: true, cancelable: true });
    act(() => {
      target.dispatchEvent(event);
    });
    return event.defaultPrevented;
  }

  it('leaves undo and redo untouched without dispatching practice actions', () => {
    const { onRetry } = renderPractice();
    expect(press({ key: 'z', ctrlKey: true })).toBe(false);
    expect(press({ key: 'Z', ctrlKey: true, shiftKey: true })).toBe(false);
    expect(press({ key: 'y', ctrlKey: true })).toBe(false);
    press({ key: 'z', ctrlKey: true, repeat: true });
    press({ key: 'Z', ctrlKey: true, shiftKey: true, repeat: true });
    expect(onRetry).not.toHaveBeenCalled();
  });

  it('routes only fixed Ctrl/Cmd+R through the supplied retry, never stored custom shortcuts', () => {
    saveSetting('osrs-unified-keybinds', { ui: { restartSimulation: 'Ctrl+J' } });
    const { onRetry } = renderPractice();
    press({ key: 'r', ctrlKey: true });
    press({ key: 'R', metaKey: true });
    press({ key: 'j', ctrlKey: true });
    press({ key: 'r', ctrlKey: true, repeat: true });
    press({ key: 'j', ctrlKey: true, repeat: true });
    expect(onRetry).toHaveBeenCalledTimes(2);
    expect(press({ key: 'r', ctrlKey: true, shiftKey: true })).toBe(false);
  });

  it('preserves native undo and redo in text inputs, textareas and contenteditable, and leaves capture alone', () => {
    saveSetting('osrs-unified-keybinds', { ui: { setPracticeStart: 'Ctrl+J' } });
    const { onRetry } = renderPractice();
    for (const tag of ['input', 'textarea', 'div']) {
      const target = document.createElement(tag);
      if (tag === 'div') Object.defineProperty(target, 'isContentEditable', { value: true });
      document.body.appendChild(target);
      try {
        expect(press({ key: 'z', ctrlKey: true }, target)).toBe(false);
        expect(press({ key: 'Z', ctrlKey: true, shiftKey: true }, target)).toBe(false);
        expect(press({ key: 'j', ctrlKey: true }, target)).toBe(false);
      } finally {
        target.remove();
      }
    }
    const endCapture = captureKeybind(() => true);
    try {
      press({ key: 'z', ctrlKey: true });
      press({ key: 'Z', ctrlKey: true, shiftKey: true });
      press({ key: 'r', ctrlKey: true });
      press({ key: 'j', ctrlKey: true });
    } finally {
      endCapture();
    }
    expect(onRetry).not.toHaveBeenCalled();
  });

  it('never dispatches stored unknown UI or plugin shortcuts, including unmodified keys and native undo/redo', () => {
    saveSetting('osrs-unified-keybinds', {
      ui: { restartSimulation: 'j', setPracticeStart: 'h' },
      plugins: {
        replayPracticeRetry: 'Ctrl+Z',
        replayPracticeSetStart: 'Ctrl+Shift+Z',
        replayPracticeRewind: 'Ctrl+Y',
      },
    });
    const { onRetry } = renderPractice();
    for (const target of [document, window]) {
      expect(press({ key: 'j' }, target)).toBe(false);
      expect(press({ key: 'h' }, target)).toBe(false);
      expect(press({ key: 'j', repeat: true }, target)).toBe(false);
      expect(press({ key: 'z', ctrlKey: true }, target)).toBe(false);
      expect(press({ key: 'Z', ctrlKey: true, shiftKey: true }, target)).toBe(false);
      expect(press({ key: 'y', ctrlKey: true }, target)).toBe(false);
    }
    expect(onRetry).not.toHaveBeenCalled();
  });
});

describe('useAppHotkeys numeric binding hints', () => {
  it('does not hint for a unified UI numeric binding when no dismissal layer is active', () => {
    saveSetting('osrs-unified-keybinds', { ui: { closeOverlay: '1' } });
    const { triggerHintToast } = renderUseAppHotkeys();
    act(() => window.dispatchEvent(new KeyboardEvent('keydown', { key: '1' })));
    expect(triggerHintToast).not.toHaveBeenCalled();
  });

  it('still hints when a numeric key has no owner', () => {
    const { triggerHintToast } = renderUseAppHotkeys();
    act(() => window.dispatchEvent(new KeyboardEvent('keydown', { key: '1' })));
    expect(triggerHintToast).toHaveBeenCalledExactlyOnceWith('keybind', expect.anything());
  });

  it.each([
    { gamePanel: { prayer: '1' } },
    { camera: { orbitRotateLeft: '1' } },
  ])('keeps unified game/camera numeric ownership silent: %j', (bindings) => {
    saveSetting('osrs-unified-keybinds', bindings);
    const { triggerHintToast } = renderUseAppHotkeys();
    act(() => window.dispatchEvent(new KeyboardEvent('keydown', { key: '1' })));
    expect(triggerHintToast).not.toHaveBeenCalled();
  });
});

describe('useAppHotkeys browser shortcut suppression', () => {
  function dispatchKeyDown(init: KeyboardEventInit & { target?: EventTarget }): boolean {
    const { target, ...eventInit } = init;
    const event = new KeyboardEvent('keydown', { bubbles: true, cancelable: true, ...eventInit });
    if (target) {
      target.dispatchEvent(event);
    } else {
      window.dispatchEvent(event);
    }
    return event.defaultPrevented;
  }

  it('prevents browser-default Ctrl/Cmd shortcuts (bookmark, save, print, find)', () => {
    renderUseAppHotkeys();

    act(() => {
      expect(dispatchKeyDown({ key: 'd', ctrlKey: true })).toBe(true);
      expect(dispatchKeyDown({ key: 's', ctrlKey: true })).toBe(true);
      expect(dispatchKeyDown({ key: 'p', ctrlKey: true })).toBe(true);
      expect(dispatchKeyDown({ key: 'f', ctrlKey: true })).toBe(true);
      expect(dispatchKeyDown({ key: 'u', ctrlKey: true })).toBe(true);
      expect(dispatchKeyDown({ key: 'd', metaKey: true })).toBe(true);
    });
  });

  it('leaves clipboard, select-all, and hard-reload shortcuts alone', () => {
    renderUseAppHotkeys();

    act(() => {
      expect(dispatchKeyDown({ key: 'c', ctrlKey: true })).toBe(false);
      expect(dispatchKeyDown({ key: 'v', ctrlKey: true })).toBe(false);
      expect(dispatchKeyDown({ key: 'x', ctrlKey: true })).toBe(false);
      expect(dispatchKeyDown({ key: 'a', ctrlKey: true })).toBe(false);
      expect(dispatchKeyDown({ key: 'r', ctrlKey: true, shiftKey: true })).toBe(false);
    });
  });

  it('resets for Ctrl+R when Caps Lock makes the reported key uppercase', () => {
    const { onReset } = renderUseAppHotkeys();

    act(() => {
      dispatchKeyDown({ key: 'R', code: 'KeyR', ctrlKey: true });
    });

    expect(onReset).toHaveBeenCalledOnce();
  });

  it('does not interfere with plain keypresses or text-field editing', () => {
    renderUseAppHotkeys();
    const input = document.createElement('input');
    document.body.appendChild(input);

    act(() => {
      expect(dispatchKeyDown({ key: 'd' })).toBe(false);
      expect(dispatchKeyDown({ key: 's', ctrlKey: true, target: input })).toBe(false);
    });

    input.remove();
  });

  it("cancels every Alt+wheel so Firefox's Alt+scroll history navigation never leaves the site", () => {
    const { triggerHintToast } = renderUseAppHotkeys();
    const wheel = ({ altKey = false, ctrlKey = false, deltaY = -100 }) => {
      const event = new WheelEvent('wheel', { deltaY, bubbles: true, cancelable: true });
      // happy-dom's WheelEvent drops modifier flags from its init dict.
      Object.defineProperties(event, { altKey: { value: altKey }, ctrlKey: { value: ctrlKey } });
      act(() => {
        window.dispatchEvent(event);
      });
      return event.defaultPrevented;
    };

    // No resizable panel is mounted, so nothing else would claim these.
    expect(wheel({ altKey: true })).toBe(true);
    expect(wheel({ altKey: true, deltaY: 100 })).toBe(true);
    expect(triggerHintToast).not.toHaveBeenCalled();
    // A plain wheel still scrolls lists natively.
    expect(wheel({})).toBe(false);
    // Ctrl+wheel stays the browser-zoom guard with its resize hint.
    expect(wheel({ ctrlKey: true })).toBe(true);
    expect(triggerHintToast).toHaveBeenCalledOnce();
  });
});

describe('useAppHotkeys Ctrl+K quick search', () => {
  function renderWithToggle() {
    const onToggleQuickSearch = vi.fn();
    renderHook(() =>
      useAppHotkeys({
        onReset: vi.fn(),
        onToggleQuickSearch,
        onToggleShowFps: vi.fn(),
        triggerHintToast: vi.fn((_type: string, _content: ReactNode) => undefined),
      }),
    );
    return onToggleQuickSearch;
  }

  const press = (init: KeyboardEventInit) => {
    const event = new KeyboardEvent('keydown', { bubbles: true, cancelable: true, ...init });
    window.dispatchEvent(event);
    return event.defaultPrevented;
  };

  it('toggles the quick search on each Ctrl+K, Caps Lock included, and keeps it from the browser', () => {
    const toggle = renderWithToggle();
    act(() => {
      expect(press({ key: 'k', ctrlKey: true })).toBe(true);
      press({ key: 'K', ctrlKey: true });
    });
    expect(toggle).toHaveBeenCalledTimes(2);
  });

  it('ignores a held Ctrl+K and a bare K', () => {
    const toggle = renderWithToggle();
    act(() => {
      press({ key: 'k', ctrlKey: true, repeat: true });
      press({ key: 'k' });
    });
    expect(toggle).not.toHaveBeenCalled();
  });
});

describe('useAppHotkeys Firefox shift+right-click hint', () => {
  const originalUserAgent = window.navigator.userAgent;
  const FIREFOX_UA = 'Mozilla/5.0 (X11; Linux x86_64; rv:146.0) Gecko/20100101 Firefox/146.0';
  const CHROME_UA = 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36';

  function setUserAgent(ua: string) {
    Object.defineProperty(window.navigator, 'userAgent', { value: ua, configurable: true });
  }

  function renderWithToast() {
    const triggerHintToast = vi.fn((_type: string, _content: ReactNode) => undefined);
    const utils = renderHook(() =>
      useAppHotkeys({
        onReset: vi.fn(),
        onToggleQuickSearch: vi.fn(),
        onToggleShowFps: vi.fn(),
        triggerHintToast,
      }),
    );
    return { ...utils, triggerHintToast };
  }

  function makeGameplaySurfaceChild(): HTMLElement {
    const surface = document.createElement('div');
    surface.setAttribute('data-tutorial-input-surface', 'gameplay');
    const child = document.createElement('canvas');
    surface.appendChild(child);
    document.body.appendChild(surface);
    return child;
  }

  function rightClick(target: EventTarget, opts: { shiftKey?: boolean; button?: number } = {}) {
    target.dispatchEvent(
      new MouseEvent('mousedown', {
        bubbles: true,
        button: opts.button ?? 2,
        shiftKey: opts.shiftKey ?? false,
      }),
    );
  }

  afterEach(() => {
    setUserAgent(originalUserAgent);
    document.body.innerHTML = '';
  });

  it('nudges toward Ctrl+right-click on Firefox Shift+right-click over the gameplay surface', () => {
    setUserAgent(FIREFOX_UA);
    const { triggerHintToast } = renderWithToast();
    const child = makeGameplaySurfaceChild();

    act(() => rightClick(child, { shiftKey: true }));

    expect(triggerHintToast).toHaveBeenCalledWith('firefox-shift-rclick', expect.anything());
  });

  it('stays silent on non-Firefox browsers', () => {
    setUserAgent(CHROME_UA);
    const { triggerHintToast } = renderWithToast();
    const child = makeGameplaySurfaceChild();

    act(() => rightClick(child, { shiftKey: true }));

    expect(triggerHintToast).not.toHaveBeenCalled();
  });

  it('stays silent without Shift, on left-click, or outside the gameplay surface', () => {
    setUserAgent(FIREFOX_UA);
    const { triggerHintToast } = renderWithToast();
    const child = makeGameplaySurfaceChild();
    const outside = document.createElement('div');
    document.body.appendChild(outside);

    act(() => {
      rightClick(child, { shiftKey: false }); // plain right-click
      rightClick(child, { shiftKey: true, button: 0 }); // shift + left-click
      rightClick(outside, { shiftKey: true }); // outside gameplay surface
    });

    expect(triggerHintToast).not.toHaveBeenCalled();
  });
});
