import type { PrayerFlickWindow } from './prayerFlick';

/**
 * Prayer plugin — the prayer-orb flick sweep.
 *
 * A port of RuneLite's prayer flick helper as it draws on the prayer orb
 * (`RuneLite PrayerFlickOverlay.java`
 * lines 82-96): a 1px vertical line crossing the orb left to right once per
 * tick, whose length at any moment is the circle's chord at that x. The line's
 * two ends therefore trace the orb's circular interior, and where it sits
 * across the orb IS how far through the tick you are.
 *
 * Pure. No DOM, no clock of its own, no simulation state: the caller passes
 * `performance.now()` and the tick window the real-time loop published.
 */

/**
 * How far into the running tick the wall clock is, in `[0, 1)`.
 *
 * RuneLite derives this from the real clock and the last tick boundary
 * (`PrayerPlugin.java:315-321`), which is what makes the sweep glide between
 * ticks instead of stepping once per tick. It scales that to `0..π` at the
 * point of use; the angle is applied in {@link prayerFlickOrbSweep} instead, so
 * this returns the raw fraction and stays readable on its own.
 *
 * RuneLite lets the elapsed time wrap (`%`), because its client always has a
 * tick running. Ours does not: paused, stopped, and replay-scrubbed fights all
 * stop publishing windows, and a wrapping sweep would keep crossing the orb as
 * though ticks were still passing — the one thing a timing instrument must
 * never do. Past the end of the window the progress therefore pins at 1 rather
 * than wrapping. The chord is 0px tall at both ends of the sweep, so a frame or
 * two of overshoot before the next window arrives looks exactly like reaching
 * the boundary on time, and a genuinely stalled clock simply shows nothing.
 *
 * A clock behind the window's own start (a window published for a tick that has
 * not begun) reads as the start of the tick, since a negative JS remainder
 * would otherwise place the line off the left of the orb.
 */
export function prayerFlickTickProgress(now: number, window: PrayerFlickWindow): number {
  if (!(window.durationMs > 0)) return 0;
  const elapsed = now - window.startTime;
  if (!(elapsed > 0)) return 0;
  return Math.min(elapsed / window.durationMs, 1);
}

/** The 1px line for one frame, in pixels relative to the orb circle's top-left. */
export interface PrayerFlickOrbSweep {
  /** Left edge of the line. Runs 0 → `size` across one tick. */
  readonly x: number;
  /** Top of the line, so the chord stays centered on the circle's axis. */
  readonly y: number;
  /** Length of the line: the circle's chord at `x`. 0 at both ends of the sweep. */
  readonly height: number;
}

/**
 * Place the sweep line for a tick progress of `[0, 1]`.
 *
 * `size` is the orb circle's diameter and is used for BOTH axes. RuneLite is
 * explicit about that ("Purposefully using height twice here as the bounds of
 * the prayer orb includes the number sticking out the side",
 * `PrayerFlickOverlay.java:81-83`) — the sprite's frame is wider than the round
 * orb, and the sweep belongs to the circle, not the frame.
 *
 * Values are truncated exactly where RuneLite's `(int)` casts and integer
 * division truncate. That keeps the port faithful and the line on whole pixels,
 * which is what the rest of this HUD does (every sprite here renders
 * `imageRendering: 'pixelated'`).
 */
export function prayerFlickOrbSweep(progress: number, size: number): PrayerFlickOrbSweep {
  const angle = progress * Math.PI;
  const height = Math.trunc(Math.sin(angle) * size);
  return {
    x: Math.trunc((-Math.cos(angle) * size) / 2) + Math.trunc(size / 2),
    y: Math.trunc(size / 2) - Math.trunc(height / 2),
    height,
  };
}

export interface PrayerFlickOrbVisibility {
  /** The Prayer plugin's own on/off toggle. The sweep is the whole plugin. */
  readonly prayerPluginEnabled: boolean;
  /** The Prayer plugin's flick-helper setting — this port's stand-in for RuneLite's PRAYER_ORB location. */
  readonly orbEnabled: boolean;
  /**
   * A prayer the engine has COMMITTED: what is actually burning during the tick
   * that is running. Only changes on a tick boundary, which is what RuneLite
   * reads too (`client.isPrayerActive` is a server-owned varbit).
   */
  readonly prayersCommitted: boolean;
  /**
   * A prayer the player's un-ticked clicks predict (`WorldState.ts` reports
   * queued prayer inputs as already applied, exactly like the real client
   * flipping its own varbit on click).
   *
   * Held separately from {@link prayersCommitted} and OR-ed with it, because on its
   * own it dips to false mid-flick: a flick is an off-click and an on-click
   * inside ONE tick, the engine folds both at the boundary, and the prayer never
   * actually goes out. Gating on the prediction alone tore the sweep off the orb
   * between the two clicks — every tick, precisely while flicking, which is the
   * one time the instrument has to stay continuous.
   *
   * Keeping it in the gate at all is what lets a fresh activation light the sweep
   * on the click instead of a tick later.
   */
  readonly prayersPredicted: boolean;
  /** RuneLite's "Never hide prayer flick helper" (`PrayerConfig.java:61-70`). */
  readonly alwaysOn: boolean;
}

/**
 * RuneLite's visibility gate (`PrayerFlickOverlay.java:57-63`): with no prayer
 * burning there is nothing to flick, so the helper hides itself unless the
 * player asked for it to stay. The location check that follows it there is the
 * orb setting here — this port ships only the orb, not PRAYER_BAR or BOTH, and
 * the tick-bars panel is a separate plugin with its own toggle.
 *
 * Also the switch for the animation loop: false means the line is not drawn AND
 * no frame is requested.
 */
export function isPrayerFlickOrbVisible({
  prayerPluginEnabled,
  orbEnabled,
  prayersCommitted,
  prayersPredicted,
  alwaysOn,
}: PrayerFlickOrbVisibility): boolean {
  if (!prayerPluginEnabled || !orbEnabled) return false;
  return prayersCommitted || prayersPredicted || alwaysOn;
}
