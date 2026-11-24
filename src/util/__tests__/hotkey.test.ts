// @vitest-environment happy-dom
// KeyboardEvent is a DOM constructor; src/util/ otherwise runs in the node env.

import { describe, expect, it } from 'vitest';
import {
  formatHotkey,
  hotkeyFromEvent,
  isBindableKey,
  matchesHotkey,
  matchesKeyboardKey,
  normalizeHotkeyKey,
  parseHotkey,
} from '../hotkey';

function keyEvent(key: string, modifiers: Partial<KeyboardEventInit> = {}): KeyboardEvent {
  return new KeyboardEvent('keydown', { key, ...modifiers });
}

describe('single-key binding policy', () => {
  it.each([undefined, null, 42, {}, false])('ignores a malformed runtime event key %j', (key) => {
    const event = keyEvent('q', { ctrlKey: true });
    Object.defineProperty(event, 'key', { value: key });

    expect(normalizeHotkeyKey(key as string | undefined)).toBe('');
    expect(matchesKeyboardKey(key as string | undefined, 'Escape')).toBe(false);
    expect(matchesKeyboardKey(key as string | undefined, 'Q')).toBe(false);
    expect(hotkeyFromEvent(event)).toBeNull();
    expect(matchesHotkey(event, 'Ctrl+Q')).toBe(false);
  });

  it.each([
    'Alt',
    'Control',
    'Ctrl',
    'Meta',
    'Command',
    'Cmd',
    'Option',
    'AltGraph',
    'Dead',
    'Unidentified',
    '',
  ])('rejects unsupported standalone key %j consistently', (key) => {
    expect(isBindableKey(key)).toBe(false);
    expect(matchesKeyboardKey(key, key)).toBe(false);
    expect(hotkeyFromEvent(keyEvent(key))).toBeNull();
    expect(parseHotkey(key)).toBeNull();
    expect(parseHotkey(`Ctrl+${key}`)).toBeNull();
  });

  it.each(['Shift', 'Escape', ' ', '+', 'ArrowLeft', 'F8', 'j', 'Tab'])('preserves the valid single key %j', (key) => {
    expect(isBindableKey(key)).toBe(true);
    expect(matchesKeyboardKey(key, key)).toBe(true);
  });

  it('binds Tab alone and in plugin chords', () => {
    expect(hotkeyFromEvent(keyEvent('Tab'))).toEqual({
      ctrl: false,
      alt: false,
      shift: false,
      meta: false,
      key: 'Tab',
    });
    expect(parseHotkey('Tab')).toEqual({ ctrl: false, alt: false, shift: false, meta: false, key: 'Tab' });
    expect(matchesHotkey(keyEvent('Tab'), 'Tab')).toBe(true);
    expect(matchesHotkey(keyEvent('Tab', { shiftKey: true }), 'Shift+Tab')).toBe(true);
    expect(matchesHotkey(keyEvent('Tab', { shiftKey: true }), 'Tab')).toBe(false);
    expect(matchesHotkey(keyEvent('Tab'), 'Shift+Tab')).toBe(false);
  });

  it.each(['Alt+J', 'Ctrl+J', 'Meta+J', 'Shift+J'])('preserves plugin modifier chord %s', (value) => {
    expect(parseHotkey(value)).not.toBeNull();
    expect(
      matchesHotkey(
        keyEvent('j', {
          altKey: value.startsWith('Alt'),
          ctrlKey: value.startsWith('Ctrl'),
          metaKey: value.startsWith('Meta'),
          shiftKey: value.startsWith('Shift'),
        }),
        value,
      ),
    ).toBe(true);
  });
});

describe('parseHotkey', () => {
  it('parses modifiers and normalizes the key', () => {
    expect(parseHotkey('Ctrl+Shift+q')).toEqual({ ctrl: true, alt: false, shift: true, meta: false, key: 'Q' });
  });

  it('parses a bare key', () => {
    expect(parseHotkey('F')).toEqual({ ctrl: false, alt: false, shift: false, meta: false, key: 'F' });
  });

  it('rejects empty, modifier-only, and unknown-modifier strings', () => {
    expect(parseHotkey('')).toBeNull();
    expect(parseHotkey('Ctrl+Shift')).toBeNull();
    expect(parseHotkey('Hyper+Q')).toBeNull();
  });
});

describe('formatHotkey', () => {
  it('round-trips through parseHotkey in a stable modifier order', () => {
    const parsed = parseHotkey('Shift+Ctrl+Q');
    expect(parsed).not.toBeNull();
    expect(formatHotkey(parsed!)).toBe('Ctrl+Shift+Q');
  });
});

describe('hotkeyFromEvent', () => {
  it('returns null while only a modifier is held', () => {
    expect(hotkeyFromEvent(keyEvent('Control', { ctrlKey: true }))).toBeNull();
    expect(hotkeyFromEvent(keyEvent('Shift', { shiftKey: true }))).toBeNull();
  });

  it('captures the pressed combo', () => {
    expect(hotkeyFromEvent(keyEvent('q', { ctrlKey: true }))).toEqual({
      ctrl: true,
      alt: false,
      shift: false,
      meta: false,
      key: 'Q',
    });
  });
});

describe('matchesHotkey', () => {
  it('round-trips a literal plus key without mistaking it for a modifier separator', () => {
    const event = keyEvent('+', { shiftKey: true });
    const captured = hotkeyFromEvent(event);
    if (!captured) throw new Error('Expected a captured plus key');

    const value = formatHotkey(captured);

    expect(value).toBe('Shift+Plus');
    expect(matchesHotkey(event, value)).toBe(true);
  });

  it('matches regardless of the key case the browser reports', () => {
    expect(matchesHotkey(keyEvent('q', { ctrlKey: true }), 'Ctrl+Q')).toBe(true);
    expect(matchesHotkey(keyEvent('Q', { ctrlKey: true, shiftKey: true }), 'Ctrl+Shift+Q')).toBe(true);
  });

  it('is modifier-exact, so a broader combo never fires a narrower bind', () => {
    expect(matchesHotkey(keyEvent('Q', { ctrlKey: true, shiftKey: true }), 'Ctrl+Q')).toBe(false);
    expect(matchesHotkey(keyEvent('q', { ctrlKey: true }), 'Ctrl+Shift+Q')).toBe(false);
    expect(matchesHotkey(keyEvent('q'), 'Ctrl+Q')).toBe(false);
  });

  it('never matches an unparseable bind', () => {
    expect(matchesHotkey(keyEvent('q', { ctrlKey: true }), '')).toBe(false);
  });
});
