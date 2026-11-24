// @vitest-environment happy-dom

import { afterEach, describe, expect, it, vi } from 'vitest';
import { runSyntheticInput } from '../inputProvenance';
import {
  __resetKeyStateForTest,
  getModifiers,
  getMouseButtons,
  isKeyHeld,
  MODIFIER_BIT,
  MOUSE_BUTTON_BIT,
  modifierMask,
  modifierStateFromMask,
  subscribeModifiers,
  subscribeMouseButtons,
} from '../keyState';

afterEach(() => {
  __resetKeyStateForTest();
  setVisibility('visible');
});

function setVisibility(state: 'visible' | 'hidden'): void {
  Object.defineProperty(document, 'visibilityState', { value: state, configurable: true });
}

function keyEvent(type: 'keydown' | 'keyup', key: string, held: Partial<KeyboardEventInit>): KeyboardEvent {
  return new KeyboardEvent(type, { key, ...held });
}

function codedKeyEvent(
  type: 'keydown' | 'keyup',
  key: string,
  code: string,
  init: Partial<KeyboardEventInit> = {},
): KeyboardEvent {
  return new KeyboardEvent(type, { key, code, ...init });
}

function mouseEvent(type: string, init: Partial<MouseEventInit> = {}): MouseEvent {
  return new MouseEvent(type, init);
}

describe('keyState', () => {
  it('tracks shift down and up', () => {
    getModifiers();
    window.dispatchEvent(keyEvent('keydown', 'Shift', { shiftKey: true }));
    expect(getModifiers().shift).toBe(true);
    window.dispatchEvent(keyEvent('keyup', 'Shift', { shiftKey: false }));
    expect(getModifiers().shift).toBe(false);
  });

  it('resyncs from a later unrelated event when the keyup never arrives', () => {
    getModifiers();
    window.dispatchEvent(keyEvent('keydown', 'Shift', { shiftKey: true }));
    expect(getModifiers().shift).toBe(true);

    // Alt+Tab: the OS eats the Shift keyup, so nothing releases it. The next
    // pointer event over the app carries the true state and must un-stick it.
    window.dispatchEvent(mouseEvent('mousemove', { shiftKey: false }));
    expect(getModifiers().shift).toBe(false);
  });

  it('clears every modifier on window blur', () => {
    getModifiers();
    window.dispatchEvent(keyEvent('keydown', 'Control', { ctrlKey: true }));
    window.dispatchEvent(keyEvent('keydown', 'Alt', { ctrlKey: true, altKey: true }));
    expect(getModifiers()).toMatchObject({ ctrl: true, alt: true });

    window.dispatchEvent(new Event('blur'));
    expect(getModifiers()).toMatchObject({ shift: false, ctrl: false, alt: false, meta: false });
  });

  it('clears on tab hide and on pagehide', () => {
    getModifiers();
    window.dispatchEvent(keyEvent('keydown', 'Shift', { shiftKey: true }));
    setVisibility('hidden');
    document.dispatchEvent(new Event('visibilitychange'));
    expect(getModifiers().shift).toBe(false);

    setVisibility('visible');
    window.dispatchEvent(keyEvent('keydown', 'Shift', { shiftKey: true }));
    window.dispatchEvent(new Event('pagehide'));
    expect(getModifiers().shift).toBe(false);
  });

  it('survives a capture-phase listener that stops propagation', () => {
    getModifiers();
    const swallow = (e: Event) => e.stopPropagation();
    window.addEventListener('keyup', swallow, true);
    document.addEventListener('keydown', swallow, true);
    try {
      window.dispatchEvent(keyEvent('keydown', 'Shift', { shiftKey: true }));
      expect(getModifiers().shift).toBe(true);
      window.dispatchEvent(keyEvent('keyup', 'Shift', { shiftKey: false }));
      expect(getModifiers().shift).toBe(false);
    } finally {
      window.removeEventListener('keyup', swallow, true);
      document.removeEventListener('keydown', swallow, true);
    }
  });

  it('notifies subscribers only on change', () => {
    const listener = vi.fn();
    subscribeModifiers(listener);
    window.dispatchEvent(keyEvent('keydown', 'Shift', { shiftKey: true }));
    window.dispatchEvent(mouseEvent('mousemove', { shiftKey: true }));
    expect(listener).toHaveBeenCalledTimes(1);
    window.dispatchEvent(keyEvent('keyup', 'Shift', { shiftKey: false }));
    expect(listener).toHaveBeenCalledTimes(2);
  });

  it('returns a stable snapshot identity while unchanged', () => {
    const first = getModifiers();
    window.dispatchEvent(mouseEvent('mousemove', {}));
    expect(getModifiers()).toBe(first);
  });

  it('round-trips a mask', () => {
    const state = { shift: true, ctrl: false, alt: true, meta: false };
    expect(modifierMask(state)).toBe(MODIFIER_BIT.shift | MODIFIER_BIT.alt);
    expect(modifierStateFromMask(modifierMask(state))).toEqual(state);
  });
});

describe('keyState non-modifier keys', () => {
  it('tracks any key, not just modifiers', () => {
    isKeyHeld('w');
    window.dispatchEvent(keyEvent('keydown', 'w', {}));
    expect(isKeyHeld('W')).toBe(true);
    window.dispatchEvent(keyEvent('keyup', 'w', {}));
    expect(isKeyHeld('w')).toBe(false);
  });

  it('drops every held key when the window loses focus', () => {
    isKeyHeld('w');
    window.dispatchEvent(keyEvent('keydown', 'w', {}));
    window.dispatchEvent(keyEvent('keydown', 'Shift', { shiftKey: true }));
    expect(isKeyHeld('w')).toBe(true);
    expect(getModifiers().shift).toBe(true);

    window.dispatchEvent(new Event('blur'));
    expect(isKeyHeld('w')).toBe(false);
    expect(getModifiers().shift).toBe(false);
  });

  it('does not notify modifier subscribers when a plain key changes', () => {
    const listener = vi.fn();
    subscribeModifiers(listener);
    window.dispatchEvent(keyEvent('keydown', 'w', {}));
    window.dispatchEvent(keyEvent('keydown', 'w', { repeat: true }));
    window.dispatchEvent(keyEvent('keyup', 'w', {}));
    expect(listener).not.toHaveBeenCalled();
  });

  it('does not allocate a new snapshot for pointer events that change nothing', () => {
    const first = getModifiers();
    for (let i = 0; i < 50; i++) {
      window.dispatchEvent(mouseEvent('mousemove', {}));
    }
    expect(getModifiers()).toBe(first);
  });
});

describe('keyState stuck-key sweep', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('never prunes a key that has not auto-repeated', () => {
    vi.useFakeTimers();
    getModifiers();
    window.dispatchEvent(keyEvent('keydown', 'w', {}));

    // Key repeat can be switched off system-wide; a genuinely held camera key then
    // produces no second event for as long as the user holds it.
    vi.advanceTimersByTime(30_000);
    expect(isKeyHeld('w')).toBe(true);
  });

  it('prunes a repeating key that goes silent', () => {
    vi.useFakeTimers();
    getModifiers();
    window.dispatchEvent(keyEvent('keydown', 'w', {}));
    window.dispatchEvent(keyEvent('keydown', 'w', { repeat: true }));
    expect(isKeyHeld('w')).toBe(true);

    vi.advanceTimersByTime(600);
    expect(isKeyHeld('w')).toBe(true);

    vi.advanceTimersByTime(1500);
    expect(isKeyHeld('w')).toBe(false);
  });
});

describe('keyState under a listener that swallows events outright', () => {
  // The shape of an extension or browser component whose content script registers at
  // document_start — before any page script — and calls stopImmediatePropagation.
  // That genuinely starves this store's own window-capture listener, so the recovery
  // paths below are the only thing standing between the user and a latched key.
  function installSwallower(type: string): () => void {
    __resetKeyStateForTest();
    const swallow = (e: Event) => e.stopImmediatePropagation();
    window.addEventListener(type, swallow, true);
    getModifiers();
    return () => window.removeEventListener(type, swallow, true);
  }

  it('recovers a modifier whose keyup is swallowed, from the next pointer event', () => {
    const uninstall = installSwallower('keyup');
    try {
      window.dispatchEvent(keyEvent('keydown', 'Shift', { shiftKey: true }));
      window.dispatchEvent(keyEvent('keyup', 'Shift', { shiftKey: false }));
      expect(getModifiers().shift).toBe(true);

      window.dispatchEvent(mouseEvent('mousemove', { shiftKey: false }));
      expect(getModifiers().shift).toBe(false);
    } finally {
      uninstall();
    }
  });

  it('recovers a plain key whose keyup is swallowed, from the staleness sweep', () => {
    vi.useFakeTimers();
    const uninstall = installSwallower('keyup');
    try {
      window.dispatchEvent(keyEvent('keydown', 'w', {}));
      window.dispatchEvent(keyEvent('keydown', 'w', { repeat: true }));
      window.dispatchEvent(keyEvent('keyup', 'w', {}));
      expect(isKeyHeld('w')).toBe(true);

      vi.advanceTimersByTime(2100);
      expect(isKeyHeld('w')).toBe(false);
    } finally {
      uninstall();
      vi.useRealTimers();
    }
  });
});

describe('keyState provenance and identity', () => {
  it('ignores the synthetic pointer events the app dispatches itself', () => {
    getModifiers();
    window.dispatchEvent(keyEvent('keydown', 'Shift', { shiftKey: true }));

    // What the replay cursor layer, the tutorial demo cursor and the tooltip hover
    // recheck all send. None carry modifier flags, and the user may well be holding
    // Shift while one fires.
    runSyntheticInput(() => window.dispatchEvent(new MouseEvent('mousemove', { clientX: 10, clientY: 10 })));
    expect(getModifiers().shift).toBe(true);
  });

  it('keeps Shift held when one of two Shift keys is released', () => {
    getModifiers();
    window.dispatchEvent(codedKeyEvent('keydown', 'Shift', 'ShiftLeft', { shiftKey: true }));
    window.dispatchEvent(codedKeyEvent('keydown', 'Shift', 'ShiftRight', { shiftKey: true }));
    expect(getModifiers().shift).toBe(true);

    // The browser still reports shiftKey: true because the other key is down.
    window.dispatchEvent(codedKeyEvent('keyup', 'Shift', 'ShiftLeft', { shiftKey: true }));
    expect(getModifiers().shift).toBe(true);

    window.dispatchEvent(codedKeyEvent('keyup', 'Shift', 'ShiftRight', { shiftKey: false }));
    expect(getModifiers().shift).toBe(false);
  });

  it('releases a shifted key whose keyup reports a different key', () => {
    getModifiers();
    // Shift+2 presses "@" on a US layout.
    window.dispatchEvent(codedKeyEvent('keydown', '@', 'Digit2', { shiftKey: true }));
    expect(isKeyHeld('@')).toBe(true);

    // Shift released first, so Digit2's keyup reports the unshifted "2".
    window.dispatchEvent(codedKeyEvent('keyup', 'Shift', 'ShiftLeft', { shiftKey: false }));
    window.dispatchEvent(codedKeyEvent('keyup', '2', 'Digit2', { shiftKey: false }));
    expect(isKeyHeld('@')).toBe(false);
    expect(isKeyHeld('2')).toBe(false);
  });

  it('keeps a key held while either of two codes producing it is down', () => {
    getModifiers();
    window.dispatchEvent(codedKeyEvent('keydown', 'Enter', 'Enter'));
    window.dispatchEvent(codedKeyEvent('keydown', 'Enter', 'NumpadEnter'));
    window.dispatchEvent(codedKeyEvent('keyup', 'Enter', 'Enter'));
    expect(isKeyHeld('Enter')).toBe(true);

    window.dispatchEvent(codedKeyEvent('keyup', 'Enter', 'NumpadEnter'));
    expect(isKeyHeld('Enter')).toBe(false);
  });
});

describe('keyState mouse buttons', () => {
  it('tracks each button independently through a chorded press', () => {
    getMouseButtons();
    window.dispatchEvent(mouseEvent('mousedown', { buttons: MOUSE_BUTTON_BIT.left }));
    expect(getMouseButtons()).toEqual({ left: true, right: false, middle: false });

    window.dispatchEvent(mouseEvent('mousedown', { buttons: MOUSE_BUTTON_BIT.left | MOUSE_BUTTON_BIT.right }));
    expect(getMouseButtons()).toEqual({ left: true, right: true, middle: false });

    window.dispatchEvent(mouseEvent('mouseup', { buttons: MOUSE_BUTTON_BIT.right }));
    expect(getMouseButtons()).toEqual({ left: false, right: true, middle: false });

    window.dispatchEvent(mouseEvent('mouseup', { buttons: 0 }));
    expect(getMouseButtons()).toEqual({ left: false, right: false, middle: false });
  });

  it('recovers a press whose mouseup was lost outside the window, from the next move', () => {
    getMouseButtons();
    window.dispatchEvent(mouseEvent('mousedown', { buttons: MOUSE_BUTTON_BIT.left }));
    expect(getMouseButtons().left).toBe(true);

    window.dispatchEvent(mouseEvent('mousemove', { buttons: 0 }));
    expect(getMouseButtons().left).toBe(false);
  });

  it('releases a held button when the window loses focus', () => {
    getMouseButtons();
    window.dispatchEvent(mouseEvent('mousedown', { buttons: MOUSE_BUTTON_BIT.middle }));
    expect(getMouseButtons().middle).toBe(true);

    window.dispatchEvent(new Event('blur'));
    expect(getMouseButtons()).toEqual({ left: false, right: false, middle: false });
  });

  it('ignores the side buttons rather than waking subscribers for them', () => {
    const seen = vi.fn();
    subscribeMouseButtons(seen);
    window.dispatchEvent(mouseEvent('mousedown', { buttons: 8 | 16 }));
    expect(getMouseButtons()).toEqual({ left: false, right: false, middle: false });
    expect(seen).not.toHaveBeenCalled();
  });

  it('does not notify modifier subscribers when only a button changes', () => {
    const seen = vi.fn();
    subscribeModifiers(seen);
    window.dispatchEvent(mouseEvent('mousedown', { buttons: MOUSE_BUTTON_BIT.left }));
    expect(getMouseButtons().left).toBe(true);
    expect(seen).not.toHaveBeenCalled();
  });

  it('ignores the synthetic pointer events the app dispatches itself', () => {
    getMouseButtons();
    window.dispatchEvent(mouseEvent('mousedown', { buttons: MOUSE_BUTTON_BIT.left }));
    runSyntheticInput(() => {
      window.dispatchEvent(mouseEvent('mousemove', { buttons: 0 }));
    });
    expect(getMouseButtons().left).toBe(true);
  });
});
