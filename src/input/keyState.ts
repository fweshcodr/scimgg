import { useSyncExternalStore } from 'react';
import { isSyntheticInput } from './inputProvenance';
import { isCapturingKeybind } from './keybindCapture';

/**
 * Modifier keys the simulator believes are held. Deliberately NOT a live read of
 * the physical keyboard — no such API exists on the web, and every consumer here
 * (inventory left-click verb, shift-walk-under-NPC, panel snap) must agree with
 * whatever this store last observed, including when it is wrong.
 */
export interface ModifierState {
  readonly shift: boolean;
  readonly ctrl: boolean;
  readonly alt: boolean;
  readonly meta: boolean;
}

export const MODIFIER_BIT = {
  shift: 1,
  ctrl: 2,
  alt: 4,
  meta: 8,
} as const;

export type ModifierName = keyof typeof MODIFIER_BIT;

const NO_MODIFIERS: ModifierState = { shift: false, ctrl: false, alt: false, meta: false };

type ModifierListener = (state: ModifierState) => void;

/**
 * Mouse buttons the simulator believes are held. Same caveat as {@link ModifierState}:
 * observed, never polled.
 *
 * These values are `MouseEvent.buttons` bits, NOT `MouseEvent.button` numbers. The two
 * disagree on the middle button — `button` counts 0/1/2 as left/middle/right, `buttons`
 * weighs 1/2/4 as left/right/middle — so renumbering these to match `button` order lights
 * the wheel on a right-click.
 */
export const MOUSE_BUTTON_BIT = {
  left: 1,
  right: 2,
  middle: 4,
} as const;

export type MouseButtonName = keyof typeof MOUSE_BUTTON_BIT;

export interface MouseButtonState {
  readonly left: boolean;
  readonly right: boolean;
  readonly middle: boolean;
}

const NO_MOUSE_BUTTONS: MouseButtonState = { left: false, right: false, middle: false };

/**
 * Without this, a mouse with side buttons flips bits 8/16 and wakes every subscriber for a
 * state that renders identically.
 */
const MOUSE_BUTTON_MASK = MOUSE_BUTTON_BIT.left | MOUSE_BUTTON_BIT.right | MOUSE_BUTTON_BIT.middle;

type MouseButtonListener = (state: MouseButtonState) => void;

/**
 * How long a key that has ALREADY auto-repeated may go without another repeat
 * before it is presumed stuck. The slowest OS repeat rate either platform offers
 * is ~2/s, so this is a 3x margin — do not lower it toward that floor.
 */
const STUCK_KEY_TIMEOUT_MS = 1500;
const STUCK_SWEEP_INTERVAL_MS = 500;

const suppressedByCode = new Map<string, string>();
const suppressedKeyNames = new Set<string>();

/** A dismissal owns the whole press, including camera polling and its auto-repeat tail. */
export function suppressKeyUntilRelease(event: KeyboardEvent): void {
  ensureTracking();
  const code = event.code || event.key;
  const key = event.key.toLowerCase();
  suppressedByCode.set(code, key);
  suppressedKeyNames.add(key);
  const held = heldByCode.get(code);
  if (held) {
    heldByCode.delete(code);
    releaseKeyName(held.key);
    if (heldByCode.size === 0) stopSweep();
  }
}

const MODIFIER_NAMES = ['shift', 'ctrl', 'alt', 'meta'] as const;

const MODIFIER_BY_KEY: Readonly<Record<string, ModifierName>> = {
  Shift: 'shift',
  Control: 'ctrl',
  Alt: 'alt',
  Meta: 'meta',
};

const MODIFIER_KEY_NAME: Readonly<Record<ModifierName, string>> = {
  shift: 'shift',
  ctrl: 'control',
  alt: 'alt',
  meta: 'meta',
};

interface HeldKeyRecord {
  /**
   * Lowercased `KeyboardEvent.key` AS IT WAS AT PRESS TIME, which is not always what
   * the keyup reports: press Shift+2 and the browser sends `@` down but `2` up once
   * Shift is released first. Releases are matched on `code`, and this is what gets
   * un-held, or the `@` stays held forever.
   */
  key: string;
  lastSeenMs: number;
  /**
   * Set once the browser has delivered an auto-repeat keydown for this key. Until
   * then the staleness sweep must leave the key alone: a user with key repeat
   * switched off holds a camera key for minutes without a second event, and
   * pruning it would stop the pan under their finger.
   */
  sawRepeat: boolean;
}

/**
 * Non-modifier keys are PULL-only (`isKeyHeld`, polled by the camera each frame).
 * Do not add a key-level subscribe API without a consumer that genuinely cannot
 * poll: subscribed components re-render the whole simulator tree on every camera
 * keypress.
 *
 * Keyed by physical `code` so a release always finds its own press. `heldKeyNames`
 * is the lookup index for `isKeyHeld`, counted rather than a set because two codes
 * can produce the same key (either Shift, the two Enters, the numpad digits).
 */
const heldByCode = new Map<string, HeldKeyRecord>();
const heldKeyNames = new Map<string, number>();

let modifierBits = 0;
/** Replaced only when a bit actually flips, so a mousemove burst allocates nothing. */
let modifierSnapshot: ModifierState = NO_MODIFIERS;
const listeners = new Set<ModifierListener>();

/**
 * Held buttons ride their own snapshot and listener set rather than joining
 * {@link ModifierState}. Merged, every press would wake the modifier subscribers —
 * DraggablePanel's Alt tracking and the replay recorder's modifier track — for a signal
 * none of them read, and the replay track's mask is a 4-bit field the replay schema rejects
 * above 15.
 */
let mouseButtonBits = 0;
let mouseButtonSnapshot: MouseButtonState = NO_MOUSE_BUTTONS;
const mouseButtonListeners = new Set<MouseButtonListener>();
let tracking = false;
let sweepTimer: ReturnType<typeof setInterval> | null = null;

function retainKeyName(key: string): void {
  heldKeyNames.set(key, (heldKeyNames.get(key) ?? 0) + 1);
}

function releaseKeyName(key: string): void {
  const remaining = (heldKeyNames.get(key) ?? 0) - 1;
  if (remaining > 0) heldKeyNames.set(key, remaining);
  else heldKeyNames.delete(key);
}

function setModifierBits(next: number): void {
  const previous = modifierBits;
  if (next === previous) return;
  modifierBits = next;
  modifierSnapshot = {
    shift: (next & MODIFIER_BIT.shift) !== 0,
    ctrl: (next & MODIFIER_BIT.ctrl) !== 0,
    alt: (next & MODIFIER_BIT.alt) !== 0,
    meta: (next & MODIFIER_BIT.meta) !== 0,
  };
  // Modifiers are named in `heldKeyNames` so a keybind CAN be bound to one, but they
  // never enter `heldByCode`: the sweep only prunes keys that have auto-repeated, and
  // the flag resync already recovers these.
  for (const name of MODIFIER_NAMES) {
    const bit = MODIFIER_BIT[name];
    const wasHeld = (previous & bit) !== 0;
    const isHeld = (next & bit) !== 0;
    if (isHeld === wasHeld) continue;
    if (isHeld) retainKeyName(MODIFIER_KEY_NAME[name]);
    else releaseKeyName(MODIFIER_KEY_NAME[name]);
  }
  for (const listener of listeners) listener(modifierSnapshot);
}

function setMouseButtonBits(next: number): void {
  if (next === mouseButtonBits) return;
  mouseButtonBits = next;
  mouseButtonSnapshot = {
    left: (next & MOUSE_BUTTON_BIT.left) !== 0,
    right: (next & MOUSE_BUTTON_BIT.right) !== 0,
    middle: (next & MOUSE_BUTTON_BIT.middle) !== 0,
  };
  for (const listener of mouseButtonListeners) listener(mouseButtonSnapshot);
}

function bitsFromFlags(event: KeyboardEvent | MouseEvent | PointerEvent | WheelEvent): number {
  return (
    (event.shiftKey ? MODIFIER_BIT.shift : 0) |
    (event.ctrlKey ? MODIFIER_BIT.ctrl : 0) |
    (event.altKey ? MODIFIER_BIT.alt : 0) |
    (event.metaKey ? MODIFIER_BIT.meta : 0)
  );
}

/**
 * Any event carrying modifier flags, not just keydown/keyup. A keyup is routinely
 * never delivered — Alt+Tab and every OS/browser chord (Win+D, Cmd+Space, the
 * Ctrl+Shift layout switch) steal it — and that is the whole reason modifiers used
 * to latch on. Resyncing from mouse and wheel events too means the first pointer
 * move after returning to the window corrects them even if no reset fired.
 *
 * Reads the `*Key` flags rather than `getModifierState`: on a mouse event they
 * cannot disagree, and this runs at the pointer's polling rate, which on a gaming
 * mouse is 1000 Hz.
 *
 * Skipped entirely under {@link isSyntheticInput}. This store models the PHYSICAL
 * keyboard, and the events the app dispatches itself — the replay cursor, the
 * tutorial demo cursor, the tooltip hover recheck — carry no modifier flags, so
 * resyncing from one reports every held modifier as released while the user is
 * still holding it. Any new synthetic dispatch must go through `runSyntheticInput`.
 */
function onPointerEvent(event: Event): void {
  if (isSyntheticInput()) return;
  const mouseEvent = event as MouseEvent;
  setModifierBits(bitsFromFlags(mouseEvent));
  // `buttons` is the state AFTER the event, so a mouseup already excludes the button it
  // released and a mousemove re-reports a press whose mouseup was lost outside the window.
  // Deriving this from mousedown/mouseup alone instead reinstates the latch this store
  // exists to avoid.
  setMouseButtonBits(typeof mouseEvent.buttons === 'number' ? mouseEvent.buttons & MOUSE_BUTTON_MASK : 0);
}

function onKeyEvent(event: Event): void {
  if (isSyntheticInput()) return;
  if (event.type === 'keydown' && isCapturingKeybind()) return;
  const keyboardEvent = event as KeyboardEvent;
  const down = event.type === 'keydown';
  const rawKey = typeof keyboardEvent.key === 'string' ? keyboardEvent.key : '';
  const code = keyboardEvent.code || rawKey;
  const suppressed = suppressedByCode.get(code);
  if (suppressed !== undefined) {
    if (down && keyboardEvent.repeat) {
      keyboardEvent.preventDefault();
      keyboardEvent.stopImmediatePropagation();
      return;
    }
    suppressedByCode.delete(code);
    suppressedKeyNames.delete(suppressed);
  }
  const modifier = MODIFIER_BY_KEY[rawKey];
  const flags = bitsFromFlags(keyboardEvent);

  if (modifier) {
    // Only the DOWN edge overrides the flags. A synthesized `keydown` of Shift carries
    // `shiftKey: false` by default, so reading the flag alone would make that press
    // invisible. Forcing the bit OFF on the up edge is wrong for the same reason in
    // reverse: with both Shift keys down, releasing one still reports `shiftKey: true`,
    // and Shift really is still held.
    setModifierBits(down ? flags | MODIFIER_BIT[modifier] : flags);
    return;
  }

  setModifierBits(flags);
  if (rawKey === '') return;

  if (!down) {
    const existing = heldByCode.get(code);
    if (!existing) return;
    heldByCode.delete(code);
    releaseKeyName(existing.key);
    if (heldByCode.size === 0) stopSweep();
    return;
  }

  const existing = heldByCode.get(code);
  if (existing) {
    existing.lastSeenMs = Date.now();
    if (keyboardEvent.repeat) existing.sawRepeat = true;
    return;
  }
  const key = rawKey.toLowerCase();
  heldByCode.set(code, { key, lastSeenMs: Date.now(), sawRepeat: keyboardEvent.repeat === true });
  retainKeyName(key);
  startSweep();
}

function clear(): void {
  suppressedByCode.clear();
  suppressedKeyNames.clear();
  heldByCode.clear();
  heldKeyNames.clear();
  stopSweep();
  setModifierBits(0);
  setMouseButtonBits(0);
}

/**
 * The one recovery path that does not need a focus change. A chord whose keyup the
 * browser or OS eats while the page keeps focus leaves a letter key latched, and
 * nothing else will ever remove it — a held camera key then pans forever. Auto-repeat
 * is the liveness signal: once a key has repeated, its silence means release.
 *
 * A key whose keyup is swallowed BEFORE auto-repeat starts is deliberately not
 * recoverable here and waits for the next focus edge. Pruning on age alone would
 * cancel a genuine hold for anyone whose OS key repeat is switched off.
 */
function sweepStuckKeys(): void {
  const nowMs = Date.now();
  for (const [code, record] of heldByCode) {
    if (!record.sawRepeat) continue;
    if (nowMs - record.lastSeenMs <= STUCK_KEY_TIMEOUT_MS) continue;
    heldByCode.delete(code);
    releaseKeyName(record.key);
  }
  if (heldByCode.size === 0) stopSweep();
}

function startSweep(): void {
  if (sweepTimer !== null || typeof window === 'undefined') return;
  sweepTimer = setInterval(sweepStuckKeys, STUCK_SWEEP_INTERVAL_MS);
}

function stopSweep(): void {
  if (sweepTimer === null) return;
  clearInterval(sweepTimer);
  sweepTimer = null;
}

/**
 * Capture phase on `window` is load-bearing: it is the first node in the
 * propagation path, so no `stopPropagation()` from a modal, keybind capture field
 * or tutorial overlay can starve it the way a bubble-phase window listener is
 * starved. Never demote these to bubble.
 */
const POINTER_EVENTS = [
  'pointerdown',
  'pointerup',
  'pointermove',
  'mousedown',
  'mouseup',
  'mousemove',
  'click',
  'contextmenu',
  'wheel',
] as const;

function ensureTracking(): void {
  if (tracking || typeof window === 'undefined') return;
  tracking = true;
  window.addEventListener('keydown', onKeyEvent, { capture: true });
  window.addEventListener('keyup', onKeyEvent, { capture: true, passive: true });
  for (const type of POINTER_EVENTS) {
    window.addEventListener(type, onPointerEvent, { capture: true, passive: true });
  }
  // Focus loss can leave a key physically held with no keyup ever arriving;
  // regaining focus has no API to ask what is held. Every one of these edges
  // therefore clears — including becoming visible again — and the next key or
  // pointer event resyncs. Gating any of them on "only when leaving" reintroduces
  // the alt-tab latch for the browsers that skip the outbound event.
  window.addEventListener('blur', clear);
  window.addEventListener('focus', clear);
  window.addEventListener('pagehide', clear);
  document.addEventListener('visibilitychange', clear);
}

export function getModifiers(): ModifierState {
  ensureTracking();
  return modifierSnapshot;
}

/**
 * `key` is matched case-insensitively against `KeyboardEvent.key`. Polled by the
 * camera for every bound action on every animation frame, so it must stay a plain
 * lookup — never make this build or clone anything.
 */
export function isKeyHeld(key: string): boolean {
  ensureTracking();
  return !isCapturingKeybind() && !suppressedKeyNames.has(key.toLowerCase()) && heldKeyNames.has(key.toLowerCase());
}

export function subscribeModifiers(listener: ModifierListener): () => void {
  ensureTracking();
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function modifierMask(state: ModifierState): number {
  return (
    (state.shift ? MODIFIER_BIT.shift : 0) |
    (state.ctrl ? MODIFIER_BIT.ctrl : 0) |
    (state.alt ? MODIFIER_BIT.alt : 0) |
    (state.meta ? MODIFIER_BIT.meta : 0)
  );
}

export function modifierStateFromMask(mask: number): ModifierState {
  return {
    shift: (mask & MODIFIER_BIT.shift) !== 0,
    ctrl: (mask & MODIFIER_BIT.ctrl) !== 0,
    alt: (mask & MODIFIER_BIT.alt) !== 0,
    meta: (mask & MODIFIER_BIT.meta) !== 0,
  };
}

export function useModifiers(): ModifierState {
  return useSyncExternalStore(subscribeModifiers, getModifiers, () => NO_MODIFIERS);
}

export function getMouseButtons(): MouseButtonState {
  ensureTracking();
  return mouseButtonSnapshot;
}

export function subscribeMouseButtons(listener: MouseButtonListener): () => void {
  ensureTracking();
  mouseButtonListeners.add(listener);
  return () => {
    mouseButtonListeners.delete(listener);
  };
}

export function useMouseButtons(): MouseButtonState {
  return useSyncExternalStore(subscribeMouseButtons, getMouseButtons, () => NO_MOUSE_BUTTONS);
}

export function mouseButtonMask(state: MouseButtonState): number {
  return (
    (state.left ? MOUSE_BUTTON_BIT.left : 0) |
    (state.right ? MOUSE_BUTTON_BIT.right : 0) |
    (state.middle ? MOUSE_BUTTON_BIT.middle : 0)
  );
}

export function mouseButtonStateFromMask(mask: number): MouseButtonState {
  return {
    left: (mask & MOUSE_BUTTON_BIT.left) !== 0,
    right: (mask & MOUSE_BUTTON_BIT.right) !== 0,
    middle: (mask & MOUSE_BUTTON_BIT.middle) !== 0,
  };
}

/**
 * Read-side gate for anything that treats a held key as a game input. The store
 * records keys typed into a text field on purpose — filtering at record time is
 * what stranded a key held across the moment focus entered the field, because the
 * keyup was then filtered too.
 */
export function isEditableTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  if (target.isContentEditable) return true;
  const tagName = target.tagName.toLowerCase();
  return tagName === 'input' || tagName === 'textarea' || tagName === 'select';
}

/** Test seam: drops listeners and state so a suite cannot leak a held key into the next file. */
export function __resetKeyStateForTest(): void {
  if (tracking) {
    window.removeEventListener('keydown', onKeyEvent, { capture: true });
    window.removeEventListener('keyup', onKeyEvent, { capture: true });
    for (const type of POINTER_EVENTS) {
      window.removeEventListener(type, onPointerEvent, { capture: true });
    }
    window.removeEventListener('blur', clear);
    window.removeEventListener('focus', clear);
    window.removeEventListener('pagehide', clear);
    document.removeEventListener('visibilitychange', clear);
    tracking = false;
  }
  listeners.clear();
  mouseButtonListeners.clear();
  suppressedByCode.clear();
  suppressedKeyNames.clear();
  heldByCode.clear();
  heldKeyNames.clear();
  stopSweep();
  modifierBits = 0;
  modifierSnapshot = NO_MODIFIERS;
  mouseButtonBits = 0;
  mouseButtonSnapshot = NO_MOUSE_BUTTONS;
}
