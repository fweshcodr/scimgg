import { type RefObject, useEffect, useLayoutEffect, useRef } from 'react';
import {
  GAMEPANEL_AUDIO_ID,
  GAMEPANEL_AUDIO_IDS,
  GAMEPANEL_KEYBINDS_CAMERA_ID,
  GAMEPANEL_KEYBINDS_ID,
  GAMEPANEL_KEYBINDS_PLUGINS_ID,
} from '../settingsSearch/ids';
import { MOBILE_UI_ATTRIBUTE } from './ui/mobileSheet';
import './settingsReveal.css';

/**
 * Takes the player to one setting, wherever it lives: opens the drawer or game-panel tab that owns
 * it, expands the section or plugin row holding it, scrolls it into view inside its own scroller
 * and, once all of that has come to rest, marks it briefly. Cross-links and settings search share
 * this one route.
 *
 * Ids follow the settings-search convention, and every revealable element carries its id as
 * `data-search-id`:
 * - `settings.<section>` and `settings.<section>.<item>` live in the Settings drawer;
 * - `plugins.<pluginKey>` and `plugins.<pluginKey>.<option>` live in the Plugins drawer, where
 *   `pluginKey` is also the row's expand key;
 * - `gamepanel.keybinds` and its `.camera` / `.plugins` ids are the game panel's keybind editor
 *   (wrench tab → Keybindings, General, Camera or Plugins group);
 * - `gamepanel.audio` and `gamepanel.audio.<control>` are its Audio page and the controls on it
 *   (`GAMEPANEL_AUDIO_IDS` in settingsSearch/ids.ts);
 * - an id registered with {@link useRevealAction} is an action its owner performs instead, such as
 *   opening the Keyboard Shortcuts reference: no drawer opens, and nothing is scrolled or marked.
 *
 * API for callers:
 * - {@link getRevealAvailability}`(id)` says whether a reveal can land right now, with the reason
 *   to show when it cannot. Call it to label or disable a link before the player taps it.
 * - {@link revealSetting}`(id)` performs the reveal and returns that same status. When it is not
 *   `ok` nothing happens at all: no drawer opens or closes and no panel state changes.
 *
 * App opens and closes the drawers; each drawer, collapsible section and the game panel reacts to
 * the same event for its own part.
 */

export type DrawerSurface = 'settings' | 'plugins';
export type RevealSurface = DrawerSurface | 'gamepanel' | 'action';

export interface SettingsRevealDetail {
  readonly id: string;
  readonly surface: RevealSurface;
}

/** Whether a reveal can land now. `reason` is player-facing copy for a link or search result. */
export type RevealStatus = { readonly ok: true } | { readonly ok: false; readonly reason: string };

const REVEAL_EVENT = 'settings:reveal';

/** Shown for an id this route does not know. */
export const REVEAL_UNKNOWN_REASON = 'This setting cannot be found.';
/** A sidebar row that this device, layout or encounter does not show. */
export const REVEAL_NOT_SHOWN_REASON = 'Not available right now.';
/** No game panel on screen (still loading, or a screen without one). */
export const REVEAL_NO_GAME_PANEL_REASON = 'The game panel is not showing right now.';
/** A replay drives the game panel's tabs, so the editor cannot be opened over it. */
export const REVEAL_REPLAY_REASON = 'Keybind editing is unavailable while a replay controls the game panel.';
/** The same for the Audio page, unless the replay is already showing it (then it can be reached). */
export const REVEAL_REPLAY_AUDIO_REASON = 'Audio settings are unavailable while a replay controls the game panel.';

/** How long the target must hold still (position, size, viewport) before it is marked. */
const SETTLE_STABLE_MS = 150;
/** Marks the target anyway after this long, so an endless animation cannot swallow the mark. */
const SETTLE_MAX_MS = 2500;
const HIGHLIGHT_MS = 2500;
const HIGHLIGHT_FADE_MS = 700;
/** A visual viewport this much shorter than the window is a software keyboard still up. */
const KEYBOARD_MIN_PX = 120;

const GAMEPANEL_IDS: ReadonlySet<string> = new Set([
  GAMEPANEL_KEYBINDS_ID,
  GAMEPANEL_KEYBINDS_CAMERA_ID,
  GAMEPANEL_KEYBINDS_PLUGINS_ID,
  GAMEPANEL_AUDIO_ID,
  ...Object.values(GAMEPANEL_AUDIO_IDS),
]);

export function revealSurfaceOf(id: string): RevealSurface | null {
  if (actionOwners.has(id)) return 'action';
  if (id.startsWith('settings.')) return 'settings';
  if (id.startsWith('plugins.')) return 'plugins';
  if (GAMEPANEL_IDS.has(id)) return 'gamepanel';
  return null;
}

// --- Actions ----------------------------------------------------------------------------------

/** Ids whose reveal is an action, with how many mounted owners perform it. */
const actionOwners = new Map<string, number>();

/**
 * Makes revealing `id` perform an action, while the calling component is mounted and `perform` is
 * set: the search result for a dialog opens the dialog through the component that owns it, rather
 * than marking the control that would. With `perform` null the id reveals as usual (its drawer
 * anchor, or that anchor's reason when it is not there).
 */
export function useRevealAction(id: string, perform: (() => void) | null): void {
  const performRef = useRef(perform);
  useLayoutEffect(() => {
    performRef.current = perform;
  });
  const active = perform !== null;
  useLayoutEffect(() => {
    if (!active) return;
    actionOwners.set(id, (actionOwners.get(id) ?? 0) + 1);
    return () => {
      const owners = (actionOwners.get(id) ?? 1) - 1;
      if (owners > 0) actionOwners.set(id, owners);
      else actionOwners.delete(id);
    };
  }, [id, active]);
  useSettingsRevealListener((detail) => {
    if (detail.surface === 'action' && detail.id === id) performRef.current?.();
  });
}

// --- Game panel destination -------------------------------------------------------------------

/** Why the game panel cannot take a reveal of `id` now, or null when it can. */
type GamePanelRevealBlock = (id: string) => string | null;

/** One mounted game panel. */
interface GamePanelDestination {
  blockedReason: GamePanelRevealBlock;
}

const gamePanelDestinations = new Set<GamePanelDestination>();

function gamePanelAvailability(id: string): RevealStatus {
  if (gamePanelDestinations.size === 0) return { ok: false, reason: REVEAL_NO_GAME_PANEL_REASON };
  let reason: string | null = null;
  for (const destination of gamePanelDestinations) {
    const blocked = destination.blockedReason(id);
    if (blocked === null) return { ok: true };
    reason ??= blocked;
  }
  return { ok: false, reason: reason ?? REVEAL_NO_GAME_PANEL_REASON };
}

/** The scroller a game-panel target sits in (the Audio page's), not the target itself. */
const gamePanelScrollerOf = (target: HTMLElement) =>
  target.parentElement?.closest<HTMLElement>('.game-panel-scroll') ?? null;

/**
 * The game panel's half of a reveal. It registers the panel as a destination for as long as it is
 * mounted, with `blockedReason` answering per id: null when it can take that reveal now, else the
 * reason. It calls `onReveal` with the id when one arrives, so the panel navigates through its own
 * state. The mark follows once settled.
 */
export function useGamePanelRevealDestination(
  blockedReason: GamePanelRevealBlock,
  onReveal: (id: string) => void,
): void {
  const destinationRef = useRef<GamePanelDestination>({ blockedReason });
  // Layout effects, so availability is current by the time the commit is on screen.
  useLayoutEffect(() => {
    destinationRef.current.blockedReason = blockedReason;
  });
  useLayoutEffect(() => {
    const destination = destinationRef.current;
    gamePanelDestinations.add(destination);
    return () => {
      gamePanelDestinations.delete(destination);
    };
  }, []);
  const settle = useOwnSettling();
  useSettingsRevealListener((detail) => {
    if (detail.surface !== 'gamepanel' || destinationRef.current.blockedReason(detail.id) !== null) return;
    onReveal(detail.id);
    settle(document, detail.id, gamePanelScrollerOf);
  });
}

// --- Availability and the reveal itself -------------------------------------------------------

/** Whether `id` can be revealed right now, and if not, why. Never changes anything. */
export function getRevealAvailability(id: string): RevealStatus {
  const surface = revealSurfaceOf(id);
  if (!surface) return { ok: false, reason: REVEAL_UNKNOWN_REASON };
  if (surface === 'gamepanel') return gamePanelAvailability(id);
  if (surface === 'action') return { ok: true };
  return drawerShows(surface, id) ? { ok: true } : { ok: false, reason: REVEAL_NOT_SHOWN_REASON };
}

/**
 * Takes the player to `id` and returns the status from {@link getRevealAvailability}. When that is
 * not `ok`, it does nothing, so a caller can always call it and show `reason` on failure.
 */
export function revealSetting(id: string): RevealStatus {
  const status = getRevealAvailability(id);
  const surface = revealSurfaceOf(id);
  if (!status.ok || !surface || typeof window === 'undefined') return status;
  window.dispatchEvent(new CustomEvent<SettingsRevealDetail>(REVEAL_EVENT, { detail: { id, surface } }));
  return status;
}

/** True when `id` is `scope` itself or something inside it. */
export function isWithinRevealScope(id: string, scope: string): boolean {
  return id === scope || id.startsWith(`${scope}.`);
}

/** Subscribes to reveal requests for the component's lifetime; the latest handler always runs. */
export function useSettingsRevealListener(handler: (detail: SettingsRevealDetail) => void): void {
  const handlerRef = useRef(handler);
  useEffect(() => {
    handlerRef.current = handler;
  });
  useEffect(() => {
    const listener = (event: Event) => {
      const detail = (event as CustomEvent<SettingsRevealDetail>).detail;
      if (detail?.id) handlerRef.current(detail);
    };
    window.addEventListener(REVEAL_EVENT, listener);
    return () => window.removeEventListener(REVEAL_EVENT, listener);
  }, []);
}

/**
 * The element for `id`, or for its nearest revealable parent when the exact one is not rendered
 * (an option that only shows in another layout, or behind a checkbox that is off).
 */
function findRevealTarget(root: ParentNode, id: string): HTMLElement | null {
  const anchors = [...root.querySelectorAll<HTMLElement>('[data-search-id]')];
  for (let current = id; current.includes('.'); current = current.slice(0, current.lastIndexOf('.'))) {
    const match = anchors.find((anchor) => anchor.dataset.searchId === current);
    if (match) return match;
  }
  return null;
}

const DRAWER_SELECTOR: Record<DrawerSurface, string> = {
  settings: '.controls-overlay',
  plugins: '.plugins-overlay',
};
const ANY_DRAWER = `${DRAWER_SELECTOR.settings}, ${DRAWER_SELECTOR.plugins}`;

/**
 * Whether a sidebar `id` has somewhere to land right now. A plugin option counts when its row is
 * there (the row mounts its options when it opens), unless the row lists it as absent
 * (`data-search-absent`: an option that will not show even when the row opens, such as presets in
 * an encounter that has none); a Settings row must be there itself, since one missing from this
 * device or layout would otherwise land on its section and look like a wrong answer.
 */
function drawerShows(surface: DrawerSurface, id: string): boolean {
  if (typeof document === 'undefined') return false;
  // App mounts both drawers for the page's lifetime, so a missing drawer has nowhere to land.
  const drawer = document.querySelector(DRAWER_SELECTOR[surface]);
  if (!drawer) return false;
  const probe = surface === 'plugins' ? id.split('.').slice(0, 2).join('.') : id;
  const anchor = [...drawer.querySelectorAll<HTMLElement>('[data-search-id]')].find(
    (el) => el.dataset.searchId === probe,
  );
  return anchor !== undefined && !(anchor.dataset.searchAbsent ?? '').split(' ').includes(id);
}

/**
 * Whether the two drawers would cover each other or the game if both stayed open: on a phone or
 * touch UI, where they are full-screen sheets, or when side by side they would leave less than one
 * drawer's width of game between them.
 */
export function drawersConflict(): boolean {
  if (typeof document === 'undefined') return false;
  const root = document.documentElement;
  if (root.hasAttribute(MOBILE_UI_ATTRIBUTE)) return true;
  const [settings, plugins] = [DRAWER_SELECTOR.settings, DRAWER_SELECTOR.plugins].map(
    (selector) => document.querySelector<HTMLElement>(selector)?.offsetWidth ?? 0,
  ) as [number, number];
  return settings + plugins + Math.max(settings, plugins) > root.clientWidth;
}

function overlaps(a: DOMRect, b: DOMRect): boolean {
  return a.width > 0 && a.height > 0 && a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom;
}

/**
 * The open drawers that would cover the game panel, which a game-panel reveal closes: both on a
 * phone or touch UI, where drawers are full-screen sheets (as for {@link drawersConflict}), and
 * otherwise each drawer whose box overlaps the panel or its tab row. With no panel on screen to
 * measure, every drawer counts, since the destination has to end up visible.
 */
export function drawersCoveringGamePanel(): DrawerSurface[] {
  if (typeof document === 'undefined') return [];
  const all: DrawerSurface[] = ['settings', 'plugins'];
  if (document.documentElement.hasAttribute(MOBILE_UI_ATTRIBUTE)) return all;
  const panels = [...document.querySelectorAll<HTMLElement>('[data-tutorial="game-panel"], [data-tutorial="tab-bar"]')]
    .map((el) => el.getBoundingClientRect())
    .filter((rect) => rect.width > 0 && rect.height > 0);
  if (panels.length === 0) return all;
  return all.filter((surface) => {
    const drawer = document.querySelector<HTMLElement>(DRAWER_SELECTOR[surface]);
    if (!drawer) return false;
    const box = drawer.getBoundingClientRect();
    return panels.some((panel) => overlaps(box, panel));
  });
}

/** Scrolls `target` into view inside `scroller` only, never the page: centered, or top-aligned if tall. */
function scrollWithin(scroller: HTMLElement, target: HTMLElement): void {
  const box = scroller.getBoundingClientRect();
  const rect = target.getBoundingClientRect();
  const offset =
    rect.height > box.height * 0.6 ? rect.top - box.top - 8 : rect.top - box.top - (box.height - rect.height) / 2;
  // Whole pixels only, so a target that cannot be centered (at the end of the list) stops moving.
  if (Math.abs(offset) >= 1) scroller.scrollTop += Math.round(offset);
}

const highlightTimers = new WeakMap<HTMLElement, number[]>();

/** Marks only this element, without navigation or scrolling. Re-marking restarts the hold. */
export function flashRevealTarget(target: HTMLElement): () => void {
  for (const timer of highlightTimers.get(target) ?? []) window.clearTimeout(timer);
  target.dataset.revealHighlight = 'on';
  const timers = [
    window.setTimeout(() => {
      target.dataset.revealHighlight = 'fading';
    }, HIGHLIGHT_MS),
    window.setTimeout(() => {
      delete target.dataset.revealHighlight;
      highlightTimers.delete(target);
    }, HIGHLIGHT_MS + HIGHLIGHT_FADE_MS),
  ];
  highlightTimers.set(target, timers);
  return () => {
    // An older owner's cleanup must not cancel a newer flash on the same element.
    if (highlightTimers.get(target) !== timers) return;
    for (const timer of timers) window.clearTimeout(timer);
    delete target.dataset.revealHighlight;
    highlightTimers.delete(target);
  };
}

/** A software keyboard is still up (or retracting): the visual viewport is much shorter than the window. */
function softwareKeyboardUp(): boolean {
  const viewport = window.visualViewport;
  if (!viewport || (typeof navigator !== 'undefined' && !navigator.maxTouchPoints)) return false;
  // Pinch zoom also shrinks the visual viewport, but changes its scale; a keyboard does not.
  return Math.abs(viewport.scale - 1) < 0.01 && window.innerHeight - viewport.height > KEYBOARD_MIN_PX;
}

/** Another drawer (opening, closing, or staying) sits over the middle of `target`. */
function coveredByDrawer(target: HTMLElement): boolean {
  const rect = target.getBoundingClientRect();
  if (rect.width === 0 || rect.height === 0 || typeof document.elementFromPoint !== 'function') return false;
  const hit = document.elementFromPoint(rect.left + rect.width / 2, rect.top + rect.height / 2);
  if (!hit || target.contains(hit)) return false;
  const hitDrawer = hit.closest(ANY_DRAWER);
  return hitDrawer !== null && hitDrawer !== target.closest(ANY_DRAWER);
}

/** Everything about where `target` sits that has to stop changing before the mark goes on. */
function placement(target: HTMLElement, scroller: HTMLElement | null): string {
  const rect = target.getBoundingClientRect();
  const viewport = window.visualViewport;
  return [
    Math.round(rect.left),
    Math.round(rect.top),
    Math.round(rect.width),
    Math.round(rect.height),
    scroller?.scrollTop ?? 0,
    window.innerWidth,
    window.innerHeight,
    Math.round(viewport?.height ?? 0),
  ].join(',');
}

/** Stops the reveal still settling, so an older one cannot mark its target after a newer one. */
let cancelSettling: (() => void) | null = null;

/**
 * Follows the target every frame while the drawer slides, its section or row expands, another
 * drawer slides away and a software keyboard retracts, re-centering it in `scroller` as it goes.
 * Once it has held still for {@link SETTLE_STABLE_MS} with nothing over it, it is marked. A wheel
 * or touch on the scroller hands scrolling back to the player; the mark still follows.
 */
function settleThenMark(
  root: ParentNode,
  id: string,
  scrollerFor: (target: HTMLElement) => HTMLElement | null,
): () => void {
  cancelSettling?.();
  const start = performance.now();
  let done = false;
  let frame = 0;
  let userScrolled = false;
  let scroller: HTMLElement | null = null;
  let lastTarget: HTMLElement | null = null;
  let lastPlacement = '';
  let stableSince = start;
  const onUserScroll = () => {
    userScrolled = true;
  };
  // The scroller can mount after the reveal starts (a game-panel page), so it is followed.
  const watch = (next: HTMLElement | null) => {
    if (next === scroller) return;
    scroller?.removeEventListener('wheel', onUserScroll);
    scroller?.removeEventListener('touchstart', onUserScroll);
    scroller = next;
    scroller?.addEventListener('wheel', onUserScroll, { passive: true });
    scroller?.addEventListener('touchstart', onUserScroll, { passive: true });
  };
  // This operation's own disposer: idempotent, and it never touches a newer operation.
  const stop = () => {
    if (done) return;
    done = true;
    window.cancelAnimationFrame(frame);
    watch(null);
    if (cancelSettling === stop) cancelSettling = null;
  };
  cancelSettling = stop;

  const step = () => {
    if (done) return;
    const now = performance.now();
    const target = findRevealTarget(root, id);
    if (target) watch(scrollerFor(target));
    if (target && scroller && !userScrolled && scroller.contains(target)) scrollWithin(scroller, target);
    const where = target ? placement(target, scroller) : '';
    if (target !== lastTarget || where !== lastPlacement) {
      lastTarget = target;
      lastPlacement = where;
      stableSince = now;
    }
    const settled =
      target !== null && now - stableSince >= SETTLE_STABLE_MS && !softwareKeyboardUp() && !coveredByDrawer(target);
    if (settled || now - start >= SETTLE_MAX_MS) {
      stop();
      if (target) flashRevealTarget(target);
      return;
    }
    frame = window.requestAnimationFrame(step);
  };
  frame = window.requestAnimationFrame(step);
  return stop;
}

/**
 * Settling owned by one destination: a new reveal replaces its previous one, and unmounting
 * cancels whatever it still has pending, so a stale request cannot mark a panel or drawer mounted
 * later. Each call's disposer is its own, so an older owner's cleanup leaves a newer reveal be.
 */
function useOwnSettling(): typeof settleThenMark {
  const pendingRef = useRef<(() => void) | null>(null);
  useEffect(
    () => () => {
      pendingRef.current?.();
      pendingRef.current = null;
    },
    [],
  );
  return (root, id, scrollerFor) => {
    pendingRef.current?.();
    const stop = settleThenMark(root, id, scrollerFor);
    pendingRef.current = stop;
    return stop;
  };
}

/**
 * A drawer's half of a reveal: `expand` opens whatever holds the id (a plugin row; collapsible
 * sections expand themselves), then the target is scrolled into view within `scrollerRef` and
 * marked once settled.
 */
export function useRevealInScroller(
  surface: DrawerSurface,
  scrollerRef: RefObject<HTMLElement | null>,
  expand?: (id: string) => void,
): void {
  const settle = useOwnSettling();
  useSettingsRevealListener((detail) => {
    if (detail.surface !== surface) return;
    expand?.(detail.id);
    const scroller = scrollerRef.current;
    // The drawer, not just its scroller: a few targets sit in its fixed header (Keyboard Shortcuts).
    if (scroller) settle(scroller.closest('aside') ?? scroller, detail.id, () => scroller);
  });
}
