import { createContext, type ReactNode, useContext, useSyncExternalStore } from 'react';
import { ticksToWholeSeconds } from '../components/InfoBox/timerFormat';
import type { TickProgressStore } from '../core/tickProgressStore';

/**
 * Provides the {@link TickProgressStore} to the render loop that writes the
 * current tick fraction and to the infobox timers that read it. The store's
 * *identity* is stable, so the provider value never changes between frames.
 */
const TickProgressStoreContext = createContext<TickProgressStore | null>(null);

export function TickProgressProvider({ store, children }: { store: TickProgressStore; children: ReactNode }) {
  return <TickProgressStoreContext.Provider value={store}>{children}</TickProgressStoreContext.Provider>;
}

export function useTickProgressStore(): TickProgressStore | null {
  return useContext(TickProgressStoreContext);
}

const noopSubscribe = (): (() => void) => () => {};

/**
 * Whole seconds left on a tick-based timer, counted down smoothly inside the
 * current tick.
 *
 * `sampledAtTick` is the simulation tick `ticksRemaining` was read at. Elapsed
 * time is the difference against the store's interpolated tick, so on the frame
 * where React has committed a new tick but the store has not yet been written
 * (or vice versa) the two move together instead of the timer dipping a second.
 * Clamped to one tick of interpolation, which is all the render loop produces.
 *
 * Cost: the store notifies every animation frame, but the snapshot is the
 * integer second, so React bails out on every frame where the displayed value
 * has not changed - the caller re-renders roughly once per second, and nothing
 * above it re-renders at all. Outside a provider (isolated tests) this degrades
 * to the tick-boundary value.
 */
export function useRemainingSeconds(ticksRemaining: number, sampledAtTick: number): number {
  const store = useContext(TickProgressStoreContext);
  return useSyncExternalStore(
    store ? store.subscribe : noopSubscribe,
    () => {
      const interpolatedTick = store?.getSnapshot();
      if (interpolatedTick === undefined) return ticksToWholeSeconds(ticksRemaining);
      const elapsed = Math.min(1, Math.max(0, interpolatedTick - sampledAtTick));
      return ticksToWholeSeconds(ticksRemaining - elapsed);
    },
    () => ticksToWholeSeconds(ticksRemaining),
  );
}
