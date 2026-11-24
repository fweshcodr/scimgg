/**
 * The Mobile layout's tool window: which tab it shows, and whether it is open or docked to its
 * stone. Pure, so the rules (the open tab closes the window as the side panel's does,
 * the stone toggles it, a menu choice docks behind the drawer it opens, a tutorial step can hold
 * it open, the Replay tab is replay mode) are tested without rendering.
 */

export type ToolTab = 'practice' | 'replay' | 'menu';

export const TOOL_TABS: readonly ToolTab[] = ['practice', 'replay', 'menu'];

export const TOOL_TAB_LABELS: Readonly<Record<ToolTab, string>> = {
  practice: 'Practice',
  replay: 'Replay',
  menu: 'Menu',
};

/**
 * The tab the window comes back to: after a menu choice docks it, and when replay mode ends.
 * Replay is a mode, never a place to come back to, and Menu hands over to whatever it opened.
 */
export const HOME_TOOL_TAB: ToolTab = 'practice';

export interface MobileToolWindowState {
  /** Open shows the window; closed docks it to the pop-out stone, which is all that remains. */
  readonly open: boolean;
  /** The tab the window shows when open, and reopens on. */
  readonly tab: ToolTab;
}

/**
 * Every page load starts here: closed to its stone, on Practice, whatever was open last visit.
 * Nothing about the window is remembered across loads; playback starting and a tutorial step
 * pointing inside it open it on their own.
 */
export const DEFAULT_MOBILE_TOOL_WINDOW: MobileToolWindowState = {
  open: false,
  tab: HOME_TOOL_TAB,
};

export type ToolWindowAction =
  /** The pop-out stone: open on the last tab, or dock. */
  | { readonly type: 'dock' }
  /** A tab stone whose pane is not showing: open the window on it. */
  | { readonly type: 'select'; readonly tab: ToolTab }
  /** The stone of the tab whose pane is showing: dock the window, as the side panel closes. */
  | { readonly type: 'close' }
  /** A menu entry opened a drawer or a modal: dock behind it, back on Practice. */
  | { readonly type: 'menuChosen' }
  /** Playback started somewhere else (the death or victory dialog): show its Replay tab. */
  | { readonly type: 'replayStarted' }
  /** Playback ended somewhere else (Take Over): back on Practice, where a practice session's controls are. */
  | { readonly type: 'replayEnded' };

/** Docking ends replay mode, so a docked window never reopens into one. */
function docked(state: MobileToolWindowState): MobileToolWindowState {
  return { open: false, tab: state.tab === 'replay' ? HOME_TOOL_TAB : state.tab };
}

export function toolWindowReducer(state: MobileToolWindowState, action: ToolWindowAction): MobileToolWindowState {
  switch (action.type) {
    case 'dock':
      return state.open ? docked(state) : { ...state, open: true };
    case 'select':
      if (state.open && state.tab === action.tab) return state;
      return { open: true, tab: action.tab };
    case 'close':
      return state.open ? docked(state) : state;
    case 'menuChosen':
      return { open: false, tab: HOME_TOOL_TAB };
    case 'replayStarted':
      return { open: true, tab: 'replay' };
    case 'replayEnded':
      return state.tab === 'replay' ? { ...state, tab: HOME_TOOL_TAB } : state;
  }
}

/**
 * Replay mode in Mobile is the Replay tab, shown. Playback is never active behind another tab
 * or a docked window, where its transport could not be seen.
 */
export function inReplayMode(state: MobileToolWindowState): boolean {
  return state.open && state.tab === 'replay';
}

export interface ReplaySyncInput {
  /** inReplayMode of the window's state, before and after the change. */
  readonly wasMode: boolean;
  readonly isMode: boolean;
  /** Whether playback is active, before and after the change. */
  readonly wasReplaying: boolean;
  readonly isReplaying: boolean;
  readonly hasRecording: boolean;
}

export interface ReplaySync {
  /** What to do to playback: start the last fight, or leave through the replay's own exit. */
  readonly playback: 'enter' | 'exit' | null;
  /** What to do to the window when playback changed on its own. */
  readonly window: ToolWindowAction | null;
}

/**
 * Keeps playback and the Replay tab in step, from what changed:
 * - the tab was chosen: start the last fight (nothing to start without one: the tab says so);
 * - the tab was left, by another tab, its own stone, a menu choice or docking: exit playback;
 * - playback started elsewhere: show its tab;
 * - playback ended elsewhere (Take Over): return to the pane it came from.
 */
export function syncReplay(input: ReplaySyncInput): ReplaySync {
  const { wasMode, isMode, wasReplaying, isReplaying, hasRecording } = input;
  if (isMode && !wasMode) {
    return { playback: !isReplaying && hasRecording ? 'enter' : null, window: null };
  }
  if (wasMode && !isMode) return { playback: isReplaying ? 'exit' : null, window: null };
  if (isReplaying && !wasReplaying && !isMode) return { playback: null, window: { type: 'replayStarted' } };
  if (wasReplaying && !isReplaying && isMode) return { playback: null, window: { type: 'replayEnded' } };
  return { playback: null, window: null };
}

/** Where a tutorial step's target sits in the window, if it does. */
export type ToolWindowTarget =
  | { readonly kind: 'body'; readonly tab: ToolTab }
  | { readonly kind: 'tab'; readonly tab: ToolTab }
  | null;

export interface ToolWindowView {
  readonly open: boolean;
  /**
   * Only the tab row, no pane and no tab selected: how a tutorial step pointing at a tab shows
   * the window, so that tab still means "open this tab". Never the user's own state.
   */
  readonly collapsed: boolean;
  readonly tab: ToolTab;
  /** Held open by a tutorial step rather than by the user. */
  readonly forced: boolean;
}

/**
 * What the window shows. A tutorial step pointing inside it holds it open for that step only,
 * on the tab its target is in; the user's own state is untouched and returns afterwards.
 *
 * A step pointing at a tab ("open Replay") needs that tab to still mean "open this
 * tab", so the window then shows the user's own other tab, or just its tab row.
 */
export function resolveToolWindowView(state: MobileToolWindowState, target: ToolWindowTarget): ToolWindowView {
  if (!target) return { open: state.open, collapsed: false, tab: state.tab, forced: false };
  if (target.kind === 'body') return { open: true, collapsed: false, tab: target.tab, forced: true };
  const showsOther = state.open && state.tab !== target.tab;
  return { open: true, collapsed: !showsOther, tab: state.tab, forced: true };
}

/** The tab whose body or stone holds `target`, from the window's own elements. */
export function locateToolWindowTarget(
  target: Element | null,
  roots: {
    readonly bodies: Partial<Record<ToolTab, Element | null>>;
    readonly tabs: Partial<Record<ToolTab, Element | null>>;
  },
): ToolWindowTarget {
  if (!target) return null;
  for (const tab of TOOL_TABS) {
    if (roots.bodies[tab]?.contains(target)) return { kind: 'body', tab };
    if (roots.tabs[tab]?.contains(target)) return { kind: 'tab', tab };
  }
  return null;
}
