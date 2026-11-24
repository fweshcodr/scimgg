import type { GameEvent } from '../../core/events/types';

export type TickAdvanceListener = (tick: number, events: GameEvent[]) => void;

/**
 * Module-level pub/sub that keeps the engine and the tutorial director
 * decoupled: the sim wiring publishes after each `advanceTick()`.
 */
class TickBus {
  private listeners = new Set<TickAdvanceListener>();

  subscribe(listener: TickAdvanceListener): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  publish(tick: number, events: GameEvent[]): void {
    // Snapshot before dispatch: a listener may subscribe/unsubscribe during
    // its own callback (e.g. a wait-for-event step completing and the next
    // step subscribing). Iterating the live Set would let a newly-added
    // listener receive the SAME tick, double-processing one engine tick.
    // The has() guard skips listeners removed earlier in this same dispatch.
    const snapshot = Array.from(this.listeners);
    for (const listener of snapshot) {
      if (this.listeners.has(listener)) listener(tick, events);
    }
  }
}

export const tickBus = new TickBus();
