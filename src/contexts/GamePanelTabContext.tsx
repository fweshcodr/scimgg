import { createContext, type ReactNode, useContext, useSyncExternalStore } from 'react';
import type { GamePanelTabStore } from '../core/gamePanelTabStore';
import type { GamePanelTab } from '../hooks/keybindStore';

/**
 * Provides the {@link GamePanelTabStore} to the one component that consumes the
 * live tab (the adapter directly above `GamePanel`). The store's *identity* is
 * stable, so the provider value never changes — only subscribers re-render on a
 * tab switch, never the App/Grid/chrome/sidebar tree above them.
 */
const GamePanelTabStoreContext = createContext<GamePanelTabStore | null>(null);

export function GamePanelTabProvider({ store, children }: { store: GamePanelTabStore; children: ReactNode }) {
  return <GamePanelTabStoreContext.Provider value={store}>{children}</GamePanelTabStoreContext.Provider>;
}

const noopSubscribe = (): (() => void) => () => {};

/**
 * The live (non-replay) active game panel tab. Re-renders only the calling
 * component when the tab changes. Returns `undefined` outside a provider
 * (isolated tests), letting the caller fall back to its own prop.
 */
export function useGamePanelTab(): GamePanelTab | undefined {
  const store = useContext(GamePanelTabStoreContext);
  return useSyncExternalStore(
    store ? store.subscribe : noopSubscribe,
    () => store?.getSnapshot(),
    () => undefined,
  );
}
