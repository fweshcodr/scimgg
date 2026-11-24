import { OSRS_TICK_MS } from '../../types/simulation';

const TICK_SECONDS = OSRS_TICK_MS / 1000;

/**
 * Whole seconds a timer should display for `remainingTicks` ticks left.
 *
 * Ceil, not floor: with 1 tick (0.6s) left a timer has time on it, and OSRS
 * timers read `0:01` right up to expiry rather than sitting on `0:00` for the
 * final 600ms. Fractional tick input is expected — the caller subtracts how far
 * the current tick has advanced so the value steps on true one-second
 * boundaries instead of on 0.6s tick boundaries.
 */
export function ticksToWholeSeconds(remainingTicks: number): number {
  return Math.max(0, Math.ceil(remainingTicks * TICK_SECONDS));
}

/** `M:SS`, matching the OSRS timer readout. */
export function formatSecondsClock(totalSeconds: number): string {
  const safeSeconds = Math.max(0, Math.floor(totalSeconds));
  const minutes = Math.floor(safeSeconds / 60);
  const seconds = safeSeconds % 60;
  return `${minutes}:${seconds.toString().padStart(2, '0')}`;
}

/** Convenience for callers that have no sub-tick information (tooltips, tests). */
export function formatTicksToClock(remainingTicks: number): string {
  return formatSecondsClock(ticksToWholeSeconds(remainingTicks));
}
