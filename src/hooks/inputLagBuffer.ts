/**
 * Simulated network / input latency.
 *
 * In real OSRS your actions are sent to the server the instant you perform
 * them, but they only take effect on the first server tick that begins after
 * they arrive. If you click 400ms into a 600ms tick and your connection adds
 * 300ms of latency, the action reaches the server at 700ms — past the current
 * tick boundary — so it registers on the *next* tick instead.
 *
 * This buffer models that: each player input is stamped with the active-clock
 * time it will "arrive" at the server (`sendTime + lagMs`), and the real-time
 * tick loop only applies inputs that have arrived by the current tick boundary.
 */
export interface LaggedInput {
  /** Pause-excluding `animationFrames.clock` timestamp when the action reaches the server. */
  readonly arrivalTime: number;
  /** The deferred effect — the original handler body (engine mutation + UI/replay bookkeeping). */
  readonly apply: () => void;
}

export class InputLagBuffer {
  private queue: LaggedInput[] = [];

  /** Number of inputs still in flight (arrived but not yet flushed). */
  get pending(): number {
    return this.queue.length;
  }

  /**
   * Schedule `apply` to run once active time reaches `arrivalTime`.
   * Insertion order is preserved, so with a constant lag the actions apply in
   * exactly the order the player performed them.
   */
  push(arrivalTime: number, apply: () => void): void {
    this.queue.push({ arrivalTime, apply });
  }

  /**
   * Apply every buffered input that arrived strictly before `boundary`, in the
   * order it was scheduled, and drop it from the queue. Inputs still in flight
   * are kept. Call this at each tick boundary, before advancing the tick, with
   * the boundary's nominal time rather than the (later) frame that noticed it:
   * an input arriving at or after the boundary belongs to the next tick.
   */
  flush(boundary: number): void {
    if (this.queue.length === 0) return;
    const remaining: LaggedInput[] = [];
    // Snapshot first: an `apply()` may itself enqueue a new input (e.g. a
    // handler that dispatches a follow-up action). Those land in `this.queue`
    // fresh and must not be flushed until a later boundary.
    const snapshot = this.queue;
    this.queue = [];
    for (const item of snapshot) {
      if (item.arrivalTime < boundary) {
        item.apply();
      } else {
        remaining.push(item);
      }
    }
    // Prepend still-in-flight inputs ahead of anything an apply() enqueued, so
    // overall arrival order is preserved.
    if (remaining.length > 0) {
      this.queue = this.queue.length > 0 ? [...remaining, ...this.queue] : remaining;
    }
  }

  /** Drop all in-flight inputs (e.g. on fight reset or when entering replay). */
  clear(): void {
    this.queue = [];
  }
}

/**
 * Convert a player-facing input-lag value (game-time milliseconds, where a
 * tick is 600ms) into the wall-clock delay the {@link InputLagBuffer} and the
 * real-time tick loop actually run on.
 *
 * Dividing by `speedMultiplier` keeps the tick-slip fraction constant across
 * practice speeds — 300ms of lag is half a tick whether the sim runs at 0.5×,
 * 1×, or 2×. A non-finite or non-positive `inputLagMs` returns 0 (instant), so
 * a corrupted setting can never produce a NaN arrival time that never flushes.
 * A non-positive `speedMultiplier` (which would divide to ±Infinity/NaN) falls
 * back to the unscaled lag rather than stranding the input.
 */
export function inputLagWallClockDelay(inputLagMs: number, speedMultiplier: number): number {
  if (!Number.isFinite(inputLagMs) || inputLagMs <= 0) return 0;
  return speedMultiplier > 0 ? inputLagMs / speedMultiplier : inputLagMs;
}
