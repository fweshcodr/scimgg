/**
 * The game-panel and camera keybinds (useGamePanelShortcuts / useCameraKeybinds)
 * store a bare `KeyboardEvent.key` because they are deliberately single-key
 * binds on the number row. Plugin hotkeys need modifiers, so they use this
 * format instead — the string is both what we persist and what we show.
 */
export interface Hotkey {
  ctrl: boolean;
  alt: boolean;
  shift: boolean;
  meta: boolean;
  /** Normalized `KeyboardEvent.key`: single characters uppercased, space as `Space`. */
  key: string;
}

type HotkeyModifier = 'ctrl' | 'alt' | 'shift' | 'meta';

const MODIFIER_ALIASES: Record<string, HotkeyModifier> = {
  ctrl: 'ctrl',
  control: 'ctrl',
  alt: 'alt',
  option: 'alt',
  shift: 'shift',
  meta: 'meta',
  cmd: 'meta',
  command: 'meta',
};

/**
 * Unsupported standalone keys. Shift remains usable by single-key camera controls. Tab is
 * bindable: `useAppHotkeys` already swallows it as focus navigation app-wide.
 */
export function isBindableKey(key: string | undefined): key is string {
  if (typeof key !== 'string') return false;
  const name = key.toLowerCase();
  if (!key || ['dead', 'unidentified', 'altgraph'].includes(name)) return false;
  const modifier = MODIFIER_ALIASES[name];
  return !modifier || modifier === 'shift';
}

/**
 * Case-fold single characters so `Ctrl+q` and `Ctrl+Q` are the same bind:
 * Shift and Caps Lock can each change the case reported by `event.key`.
 */
export function normalizeHotkeyKey(key: string | undefined): string {
  if (typeof key !== 'string') return '';
  if (key === ' ' || key === 'Spacebar') return 'Space';
  if (key === '+') return 'Plus';
  return key.length === 1 ? key.toUpperCase() : key;
}

export function matchesKeyboardKey(eventKey: string | undefined, boundKey: string): boolean {
  return isBindableKey(boundKey) && normalizeHotkeyKey(eventKey) === normalizeHotkeyKey(boundKey);
}

export function formatHotkey(hotkey: Hotkey): string {
  const parts: string[] = [];
  if (hotkey.ctrl) parts.push('Ctrl');
  if (hotkey.alt) parts.push('Alt');
  if (hotkey.shift) parts.push('Shift');
  if (hotkey.meta) parts.push('Meta');
  parts.push(hotkey.key);
  return parts.join('+');
}

/** `null` for anything that is not a usable combo: empty, unknown modifier, modifier-only. */
export function parseHotkey(value: string): Hotkey | null {
  const parts = value
    .split('+')
    .map((part) => part.trim())
    .filter(Boolean);
  if (parts.length === 0) return null;

  const last = parts[parts.length - 1];
  if (!isBindableKey(last) || MODIFIER_ALIASES[last.toLowerCase()]) return null;

  const hotkey: Hotkey = { ctrl: false, alt: false, shift: false, meta: false, key: normalizeHotkeyKey(last) };
  for (const part of parts.slice(0, -1)) {
    const modifier = MODIFIER_ALIASES[part.toLowerCase()];
    if (!modifier) return null;
    hotkey[modifier] = true;
  }
  return hotkey;
}

/** `null` while only a modifier is down, so a capture UI keeps listening for the real key. */
export function hotkeyFromEvent(event: KeyboardEvent): Hotkey | null {
  if (!isBindableKey(event.key) || event.key === 'Shift') return null;
  return {
    ctrl: event.ctrlKey,
    alt: event.altKey,
    shift: event.shiftKey,
    meta: event.metaKey,
    key: normalizeHotkeyKey(event.key),
  };
}

/**
 * Exact match, modifiers included: `Ctrl+Q` deliberately does NOT fire on
 * `Ctrl+Shift+Q`, so a plugin can bind both without one shadowing the other.
 */
export function matchesHotkey(event: KeyboardEvent, value: string): boolean {
  const bind = parseHotkey(value);
  if (!bind) return false;
  const pressed = hotkeyFromEvent(event);
  if (!pressed) return false;
  return (
    pressed.ctrl === bind.ctrl &&
    pressed.alt === bind.alt &&
    pressed.shift === bind.shift &&
    pressed.meta === bind.meta &&
    pressed.key === bind.key
  );
}
