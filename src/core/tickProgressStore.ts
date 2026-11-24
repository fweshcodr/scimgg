/**
 * External store (React `useSyncExternalStore` shaped) carrying the render
 * loop's interpolated tick - the integer simulation tick plus how far the
 * current tick has advanced, as a fraction in `[0, 1]`.
 *
 * Why this exists: tick-based countdowns (saturated heart, mark of darkness,
 * antipoison) are stored in ticks but displayed in seconds. A tick is 0.6s, so
 * quantizing at tick boundaries makes each displayed second last either 600ms or
 * 1200ms - a visible 2:1 stutter. The fraction here supplies the missing
 * sub-tick information so those timers can count down on true one-second
 * boundaries.
 *
 * The value is ABSOLUTE rather than a bare fraction on purpose. Consumers pair
 * it with the tick their own data was sampled at and use the difference, so a
 * frame where this store and React's simulation state disagree about the current
 * tick cancels out.
 *
 * It is fed by the render loop's existing per-frame interpolation, which already
 * freezes while paused and already scales with the speed multiplier, so timers
 * driven from it stay correct under pause, fast-forward and replay rather than
 * drifting against a wall clock.
 *
 * Following {@link ReplayFrameStore}: a store rather than a context value,
 * because this changes every animation frame and threading it through React
 * state would re-render the whole Grid/chrome tree at display refresh rate.
 * Subscribers snapshot the derived whole SECOND, not this value, so React bails
 * out on the ~59 frames a second where the displayed value is unchanged.
 */
export class TickProgressStore {
  private interpolatedTick = 0;
  private readonly listeners = new Set<() => void>();

  getSnapshot = (): number => this.interpolatedTick;

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };

  set(interpolatedTick: number): void {
    if (this.interpolatedTick === interpolatedTick) return;
    this.interpolatedTick = interpolatedTick;
    for (const listener of this.listeners) listener();
  }
}
