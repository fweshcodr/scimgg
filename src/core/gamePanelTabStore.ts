import type { GamePanelTab } from '../hooks/keybindStore';

/**
 * External store (React `useSyncExternalStore` shaped) for the game panel's
 * active tab.
 *
 * Holding the tab in `App` state instead re-renders the entire simulator tree on
 * every switch: its direct children (`SettingsSidebar`, `Grid`, `PluginsPanel`) are
 * unmemoized and receive freshly-built inline props.
 *
 * Writing here instead notifies only `useSyncExternalStore` subscribers — in
 * practice the single adapter directly above `GamePanel` — so a live tab change
 * commits that subtree and nothing else. Replay recording and the dev harness
 * read/write imperatively via `getSnapshot`/`set`, which is what lets `App`
 * stay out of the update entirely.
 *
 * Same rationale and shape as {@link ReplayFrameStore}.
 */
export class GamePanelTabStore {
  private tab: GamePanelTab;
  private readonly listeners = new Set<() => void>();

  constructor(initial: GamePanelTab = 'inventory') {
    this.tab = initial;
  }

  getSnapshot = (): GamePanelTab => this.tab;

  /** No-ops on an unchanged tab so repeated keypresses cannot spin subscribers. */
  set = (tab: GamePanelTab): void => {
    if (tab === this.tab) return;
    this.tab = tab;
    for (const listener of this.listeners) listener();
  };

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };
}
