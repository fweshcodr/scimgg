import { useSyncExternalStore } from 'react';

/**
 * The Mobile layout's "Edit layout" mode. In ordinary Mobile play every overlay is locked, as
 * the native HUD is; while this is on, the simulator's own aids (detailed DPS, prayer flick
 * helper, Zuk set timer) can be dragged, by touch or mouse, with no Alt key. The native
 * overlays (XP drops, buff bar, boss bar) stay where the game puts them even then.
 *
 * Transient by design: it is a mode the user enters from Settings and leaves with Done, never
 * a state to come back to on the next visit. Module state rather than App state because its
 * entry point (Settings) and its consumer (Grid's Mobile HUD overlays) sit in unrelated subtrees.
 */
let editing = false;
const listeners = new Set<() => void>();

export function isMobileLayoutEditing(): boolean {
  return editing;
}

export function setMobileLayoutEditing(next: boolean): void {
  if (editing === next) return;
  editing = next;
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function useMobileLayoutEditing(): boolean {
  return useSyncExternalStore(subscribe, isMobileLayoutEditing, isMobileLayoutEditing);
}
