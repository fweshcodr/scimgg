/**
 * Single source of truth for the tutorial "watch" input boundary.
 *
 * During a watch/demo, we block input that would drive the SIMULATION (clicking
 * the world to move, toggling prayers/inventory, the minimap, the Practice and Actions panes) but
 * leave all non-gameplay chrome interactive (tutorial controls, Settings,
 * Plugins, top bar). Rather than an allowlist of chrome (which rots every time a
 * new panel is added), gameplay surfaces OPT IN with a dedicated marker:
 *
 *   <canvas data-tutorial-input-surface="gameplay" />
 *
 * This is kept deliberately separate from the `data-tutorial` targeting markers
 * (which name WHAT the demo cursor points at) so "is this a cursor target" and
 * "should the user's input be blocked here" never get coupled.
 */
import { isSyntheticInput } from '../../input/inputProvenance';

export const GAMEPLAY_INPUT_SURFACE_ATTR = 'data-tutorial-input-surface';

export const GAMEPLAY_INPUT_SURFACE_VALUE = 'gameplay';

const GAMEPLAY_SELECTOR = `[${GAMEPLAY_INPUT_SURFACE_ATTR}="${GAMEPLAY_INPUT_SURFACE_VALUE}"]`;

/** Body flag CSS reads to scope the blocked cursor while a watch demo gates input. */
export const WATCH_INPUT_GATED_ATTR = 'data-tutorial-watch-input-gated';

type WatchInputGateOwner = symbol;
type WatchInputGateListener = (gated: boolean) => void;

const DEFAULT_WATCH_INPUT_GATE_OWNER: WatchInputGateOwner = Symbol('tutorial-watch-input-gate-default');
const watchInputGateOwners = new Set<WatchInputGateOwner>();
const watchInputGateListeners = new Set<WatchInputGateListener>();
const BLOCKED_GAMEPLAY_INPUT_TYPES = [
  'pointermove',
  'mousemove',
  'pointerdown',
  'mousedown',
  'pointerup',
  'mouseup',
  'click',
  'dblclick',
  'contextmenu',
  'wheel',
  'touchstart',
  'touchmove',
  'pointerout',
  'mouseout',
  'pointerleave',
  'mouseleave',
] as const;
const WATCH_INPUT_BLOCKER_OPTIONS = { capture: true, passive: false } as const;
const WATCH_INPUT_BLOCKER_REMOVE_OPTIONS = { capture: true } as const;

let watchInputBlockerInstalled = false;

/**
 * Walks up from the event target, so nested controls (prayer icons, inventory
 * slots, orbs) are covered without each needing its own marker.
 */
export function isGameplayInputTarget(target: EventTarget | null): boolean {
  return target instanceof Element ? target.closest(GAMEPLAY_SELECTOR) !== null : false;
}

export function isWatchInputGated(): boolean {
  return watchInputGateOwners.size > 0;
}

export function subscribeWatchInputGate(listener: WatchInputGateListener): () => void {
  watchInputGateListeners.add(listener);
  return () => watchInputGateListeners.delete(listener);
}

/** Cursor affordance only — input itself is gated in JS. */
export function setWatchInputGated(active: boolean, owner: WatchInputGateOwner = DEFAULT_WATCH_INPUT_GATE_OWNER): void {
  if (typeof document === 'undefined') return;
  const wasGated = isWatchInputGated();
  if (active) watchInputGateOwners.add(owner);
  else watchInputGateOwners.delete(owner);

  const gated = isWatchInputGated();
  if (gated) {
    document.body.setAttribute(WATCH_INPUT_GATED_ATTR, 'true');
    installWatchInputBlocker();
  } else {
    document.body.removeAttribute(WATCH_INPUT_GATED_ATTR);
    removeWatchInputBlocker();
  }
  if (gated !== wasGated) {
    for (const listener of watchInputGateListeners) listener(gated);
  }
}

function blockGameplayInput(event: Event): void {
  if (isSyntheticInput()) return;
  if (!isGameplayInputTarget(event.target)) return;

  if (event.cancelable) {
    event.preventDefault();
  }
  event.stopPropagation();
  event.stopImmediatePropagation();
}

function installWatchInputBlocker(): void {
  if (watchInputBlockerInstalled) return;
  for (const type of BLOCKED_GAMEPLAY_INPUT_TYPES) {
    document.addEventListener(type, blockGameplayInput, WATCH_INPUT_BLOCKER_OPTIONS);
  }
  watchInputBlockerInstalled = true;
}

function removeWatchInputBlocker(): void {
  if (!watchInputBlockerInstalled) return;
  for (const type of BLOCKED_GAMEPLAY_INPUT_TYPES) {
    document.removeEventListener(type, blockGameplayInput, WATCH_INPUT_BLOCKER_REMOVE_OPTIONS);
  }
  watchInputBlockerInstalled = false;
}
