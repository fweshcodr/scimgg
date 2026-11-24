import { useEffect, useRef } from 'react';
import { isCapturingKeybind } from '../input/keybindCapture';
import { suppressKeyUntilRelease } from '../input/keyState';
import { matchesKeyboardKey } from '../util/hotkey';
import { loadUnifiedKeybindStore } from './keybindStore';

/**
 * Who the configurable Close overlay key goes to, highest first. One press closes the
 * topmost open layer and nothing under it. The Escape names remain for existing consumers.
 */
export const ESC_PRIORITY = {
  /**
   * The replay bar (ReplayControls): its wave picker, its More, then the replay itself. Lowest,
   * so whatever is open over a replay closes before the replay ends.
   */
  REPLAY: 0,
  SIDE_PANEL: 10,
  /**
   * Above the side panel so Escape puts the spell away first, and below the modals
   * so it never swallows their dismiss.
   */
  ARMED_SPELL: 15,
  SETTINGS: 20,
  /** The launcher Menu (launcher/TopChrome.tsx): over the drawers it opens, under every modal and search. */
  LAUNCHER_MENU: 25,
  CACHE_EXPLORER: 30,
  COLOR_PICKER: 40,
  ENCOUNTER_PICKER: 50,
  /** The Ctrl+K quick search, which opens over everything, the encounter picker included. */
  QUICK_SEARCH: 60,
} as const;

/**
 * Closes the layer. Returning `false` declines the press (a layer that leaves Escape to a text
 * field, say): it goes on to the next layer down, and if none takes it, to the page untouched.
 */
type EscapeHandler = (event: KeyboardEvent) => unknown;

interface EscapeEntry {
  priority: number;
  handler: EscapeHandler;
}

const layers: EscapeEntry[] = [];
let listenerAttached = false;
const dispatched = new WeakSet<KeyboardEvent>();
const consumed = new WeakSet<KeyboardEvent>();

/** Also called by window-level hotkeys, so listener registration order cannot steal a dismissal. */
export function handleOverlayClose(e: KeyboardEvent): boolean {
  if (consumed.has(e)) return true;
  if (dispatched.has(e) || e.defaultPrevented || e.isComposing || isCapturingKeybind() || layers.length === 0)
    return false;
  const key = loadUnifiedKeybindStore().ui.closeOverlay;
  if (!key || !matchesKeyboardKey(e.key, key)) return false;
  // Escape and function keys may dismiss typing surfaces; printable/editing keys stay in the field.
  if (
    e.key !== 'Escape' &&
    !/^F(?:[1-9]|1[0-2])$/.test(e.key) &&
    (e.target instanceof HTMLInputElement ||
      e.target instanceof HTMLTextAreaElement ||
      (e.target instanceof HTMLElement && e.target.isContentEditable))
  )
    return false;
  // Like other single-key binds, Shift may change character case; app/browser chords stay separate.
  if ((e.ctrlKey && e.key !== 'Control') || (e.altKey && e.key !== 'Alt') || (e.metaKey && e.key !== 'Meta'))
    return false;
  dispatched.add(e);
  if (e.repeat) return false;
  // Highest first; equal priorities in the order they opened (the sort is stable).
  const ordered = [...layers].sort((a, b) => b.priority - a.priority);
  for (const layer of ordered) {
    if (layer.handler(e) === false) continue;
    // Taken: the press is spent on this layer.
    e.preventDefault();
    consumed.add(e);
    suppressKeyUntilRelease(e);
    e.stopImmediatePropagation();
    return true;
  }
  return false;
}

function attach() {
  if (listenerAttached) return;
  // After nested controls can decline/prevent dismissal, before any window-level game action.
  document.addEventListener('keydown', handleOverlayClose);
  window.addEventListener('keydown', handleOverlayClose);
  listenerAttached = true;
}

function detach() {
  if (layers.length > 0 || !listenerAttached) return;
  document.removeEventListener('keydown', handleOverlayClose);
  window.removeEventListener('keydown', handleOverlayClose);
  listenerAttached = false;
}

export function useEscapeLayer(priority: number, active: boolean, handler: EscapeHandler): void {
  const handlerRef = useRef(handler);
  handlerRef.current = handler;

  useEffect(() => {
    if (!active) return;
    const entry: EscapeEntry = {
      priority,
      handler: (event) => handlerRef.current(event),
    };
    layers.push(entry);
    attach();
    return () => {
      const idx = layers.indexOf(entry);
      if (idx >= 0) layers.splice(idx, 1);
      detach();
    };
  }, [active, priority]);
}
