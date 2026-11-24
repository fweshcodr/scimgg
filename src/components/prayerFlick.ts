/**
 * Prayer Flick plugin — sub-tick click timing.
 *
 * A prayer click happens on the wall clock; the simulation only ever sees it at
 * a tick boundary. Every prayer input therefore carries two wall-clock stamps:
 * when the player clicked, and when that click reaches the engine after the
 * simulated input lag (see `inputLagBuffer.ts`). This module places both stamps
 * on a stack of one-tick bars, so a click that felt on time but landed a tick
 * late can be read off the timeline instead of guessed at.
 *
 * Pure and presentation-only: nothing here touches simulation state, the engine,
 * or the replay format.
 */

/** Direction of a prayer click. A quick-prayer orb click resolves to one of these too. */
export type PrayerFlickInputKind = 'on' | 'off';

export interface PrayerFlickClick {
  /** Identity across the two bars a slipped click is drawn on. */
  readonly id: number;
  readonly kind: PrayerFlickInputKind;
  /** `performance.now()` when the player clicked. */
  readonly clickTime: number;
  /** `performance.now()` when the click reaches the engine (`clickTime` plus input lag). */
  readonly arrivalTime: number;
}

/**
 * The tick the bars are measured against: the tick that is running, the
 * wall-clock time it actually ran at, and how long a tick lasts at the current
 * speed (600ms / speedMultiplier). Published by the real-time tick loop, which
 * owns that clock.
 *
 * Ticks are not evenly spaced: one that ran late was a longer tick, and a speed
 * change alters the length mid-history. So the ticks behind the running one are
 * placed by their real starts, never reconstructed from `durationMs`, which only
 * measures the running tick and anything still to come.
 */
export interface PrayerFlickWindow {
  readonly tick: number;
  readonly startTime: number;
  readonly durationMs: number;
  /**
   * When the ticks before `tick` actually ran, newest first: `[0]` is tick - 1.
   * Shorter than the bars on screen after a reset or a gap in the tick numbers;
   * older times then fall back to whole `durationMs` steps before the oldest start known.
   */
  readonly previousStartTimes?: readonly number[];
}

/**
 * Bars drawn at once: the running tick plus the two behind it.
 *
 * A flick is judged against the tick it happened in and its immediate
 * neighbors; rows past that were history nobody read, and the height they cost
 * is worth more spent on making each mark legible.
 */
export const PRAYER_FLICK_BARS = 3;

/**
 * Pruning is normally driven by the tick window, but before the first window
 * arrives (auto-advance off, or a fight not started yet) there is no tick to
 * prune against, so the list is capped by count as well.
 */
const MAX_TRACKED_CLICKS = 64;

const EMPTY_MARKS: readonly PrayerFlickMark[] = [];
const EMPTY_CLICKS: readonly PrayerFlickClick[] = [];

/** Where a wall-clock time falls: which tick, and how far into it (`[0, 1)`). */
export interface PrayerFlickPoint {
  readonly tick: number;
  readonly fraction: number;
}

/**
 * One click as drawn on ONE bar.
 *
 * A click whose arrival crosses the tick boundary produces two marks that share
 * an `id`: the click mark on its own bar with no arrival, and the arrival mark
 * on the next bar with no click. That split IS the tick slip — the bar the input
 * registered on is not the bar it was clicked on.
 */
export interface PrayerFlickMark {
  readonly id: number;
  readonly kind: PrayerFlickInputKind;
  /** Fraction of this bar the click landed at, or null when it was clicked on an earlier bar. */
  readonly clickFraction: number | null;
  /** Fraction of this bar the input arrived at, or null when it arrives on a later bar. */
  readonly arrivalFraction: number | null;
  /** True when the click and its arrival fall on different ticks. */
  readonly slipped: boolean;
}

export interface PrayerFlickBar {
  readonly tick: number;
  /** The tick currently running. Always the first bar. */
  readonly current: boolean;
  /** Marks in click order, so two clicks inside one tick keep the order they were made in. */
  readonly marks: readonly PrayerFlickMark[];
}

export interface PrayerFlickTimeline {
  /** Newest first: `bars[0]` is the running tick. */
  readonly bars: readonly PrayerFlickBar[];
  /** Tick length in ms, for the elapsed sweep on the running bar. 0 before the first tick. */
  readonly durationMs: number;
  /** Clicks with at least one mark on screen. */
  readonly clickCount: number;
  /** Of those, the ones whose arrival landed on a later tick than the click. */
  readonly slippedCount: number;
}

/**
 * A time in the running tick, or after it, is measured in whole `durationMs`
 * steps from its start: that tick has not finished, so its length is not known
 * yet. A time before it falls in the recorded tick that contains it, as a
 * fraction of that tick's real length. Before the oldest start known, whole
 * `durationMs` steps again, which `Math.floor` turns into a negative tick offset
 * and a positive fraction.
 */
export function locatePrayerFlickTime(time: number, window: PrayerFlickWindow): PrayerFlickPoint {
  if (!(window.durationMs > 0)) return { tick: window.tick, fraction: 0 };
  let tick = window.tick;
  let startTime = window.startTime;
  if (time < startTime) {
    for (const previousStart of window.previousStartTimes ?? []) {
      const endTime = startTime;
      tick -= 1;
      startTime = previousStart;
      if (time >= startTime) {
        const lengthMs = endTime - startTime;
        return { tick, fraction: lengthMs > 0 ? (time - startTime) / lengthMs : 0 };
      }
    }
  }
  const offset = (time - startTime) / window.durationMs;
  const whole = Math.floor(offset);
  return { tick: tick + whole, fraction: offset - whole };
}

function emptyBars(count: number): readonly PrayerFlickBar[] {
  // Descending ticks, so the placeholder rows carry unique React keys and read
  // in the same order as real bars.
  return Array.from({ length: count }, (_, index) => ({ tick: -index, current: false, marks: EMPTY_MARKS }));
}

/**
 * Everything is derived from the raw stamps on every build rather than
 * accumulated, so the timeline cannot drift out of step with the tick clock and
 * a click that is still in flight lands on the right bar as soon as the tick it
 * arrives in exists.
 */
export function buildPrayerFlickTimeline(
  clicks: readonly PrayerFlickClick[],
  window: PrayerFlickWindow | null,
  bars: number = PRAYER_FLICK_BARS,
): PrayerFlickTimeline {
  const count = Math.max(1, Math.floor(bars));
  if (!window) {
    return { bars: emptyBars(count), durationMs: 0, clickCount: 0, slippedCount: 0 };
  }

  const oldestTick = window.tick - (count - 1);
  const byTick = new Map<number, PrayerFlickMark[]>();
  const place = (tick: number, mark: PrayerFlickMark): boolean => {
    if (tick < oldestTick || tick > window.tick) return false;
    const existing = byTick.get(tick);
    if (existing) existing.push(mark);
    else byTick.set(tick, [mark]);
    return true;
  };

  let clickCount = 0;
  let slippedCount = 0;
  for (const click of clicks) {
    const from = locatePrayerFlickTime(click.clickTime, window);
    const to = locatePrayerFlickTime(click.arrivalTime, window);
    if (to.tick === from.tick) {
      if (
        place(from.tick, {
          id: click.id,
          kind: click.kind,
          clickFraction: from.fraction,
          arrivalFraction: to.fraction,
          slipped: false,
        })
      ) {
        clickCount++;
      }
      continue;
    }
    const clickVisible = place(from.tick, {
      id: click.id,
      kind: click.kind,
      clickFraction: from.fraction,
      arrivalFraction: null,
      slipped: true,
    });
    const arrivalVisible = place(to.tick, {
      id: click.id,
      kind: click.kind,
      clickFraction: null,
      arrivalFraction: to.fraction,
      slipped: true,
    });
    if (clickVisible || arrivalVisible) {
      clickCount++;
      slippedCount++;
    }
  }

  const rows = Array.from({ length: count }, (_, index) => {
    const tick = window.tick - index;
    return { tick, current: index === 0, marks: byTick.get(tick) ?? EMPTY_MARKS };
  });
  return { bars: rows, durationMs: window.durationMs, clickCount, slippedCount };
}

/**
 * Keyed on the ARRIVAL stamp: a click whose own bar has scrolled off can still
 * own the arrival mark on a visible bar, and dropping it there would erase the
 * slip the plugin exists to show. Clicks are recorded in order, so everything
 * expired sits at the front. Returns the same reference when nothing is dropped,
 * so a store built on this cannot churn its snapshot every tick.
 */
export function prunePrayerFlickClicks(
  clicks: readonly PrayerFlickClick[],
  window: PrayerFlickWindow | null,
  bars: number = PRAYER_FLICK_BARS,
): readonly PrayerFlickClick[] {
  const capped = clicks.length > MAX_TRACKED_CLICKS ? clicks.slice(clicks.length - MAX_TRACKED_CLICKS) : clicks;
  if (!window || capped.length === 0) return capped;
  const oldestTick = window.tick - (Math.max(1, Math.floor(bars)) - 1);
  const firstKept = capped.findIndex((click) => locatePrayerFlickTime(click.arrivalTime, window).tick >= oldestTick);
  if (firstKept === -1) return EMPTY_CLICKS;
  return firstKept === 0 ? capped : capped.slice(firstKept);
}
