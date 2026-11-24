import type { ReplayCursorSample, ReplayCursorTrack } from '../core/ReplayRecorder';
import { REPLAY_CURSOR_INTERPOLATION_GAP_MS } from '../core/replayCursorSampling';
import type { ReplayMenuEvent } from '../core/replayMenu';
import { getReplayClickDurationMs, type ReplayClickType } from '../input/replayClickFeedback';
import { TOUCH_LONG_PRESS_MAX_MS } from '../input/touchPrefs';

/** Frame-local pixels, drawn unchanged in the workspace cursor host. */
export interface CursorVisual {
  readonly x: number;
  readonly y: number;
  /** The recorder's finger was here, not a mouse (see `ReplayCursorSample.touch`). */
  readonly touch?: true;
}

interface TimedCursorSample {
  readonly tMs: number;
}

export interface ProjectedClick {
  readonly key: string;
  readonly occurrence: number;
  readonly type: ReplayClickType;
  readonly elapsedMs: number;
  readonly progress: number;
  readonly x: number;
  readonly y: number;
  /**
   * A finger made this click (see `ReplayClickMarker.touch`). Absent for a mouse, and wherever
   * the recording does not carry it.
   */
  readonly touch?: true;
}

export function interpolateCursor(track: ReplayCursorTrack, playheadMs: number): CursorVisual | null {
  const sampleIndex = recordedSampleIndexAt(track.samples, playheadMs);
  const clickIndex = recordedSampleIndexAt(track.clicks, playheadMs);
  const recorded = track.samples[sampleIndex];
  const click = track.clicks[clickIndex];
  const sample = click && (!recorded || click.tMs >= recorded.tMs) ? click : recorded;
  // insideFrame was decided at record time, sidebar overlap included; do not re-clamp here.
  if (!sample || !sample.insideFrame) return null;
  const nextSample = track.samples[sampleIndex + 1];
  const nextClick = track.clicks[clickIndex + 1];
  const next = nextClick && (!nextSample || nextClick.tMs <= nextSample.tMs) ? nextClick : nextSample;
  const presentations = track.presentationSamples ?? [];
  const nextPresentation = presentations[recordedSampleIndexAt(presentations, sample.tMs) + 1];
  if (
    next?.insideFrame &&
    !nextSample?.breakBefore &&
    // A finger lands wherever it lands; it never travels from the mouse's position, or back.
    next.touch === sample.touch &&
    next.tMs > sample.tMs &&
    next.tMs - sample.tMs <= REPLAY_CURSOR_INTERPOLATION_GAP_MS &&
    (!nextPresentation || nextPresentation.tMs > next.tMs)
  ) {
    const fraction = (playheadMs - sample.tMs) / (next.tMs - sample.tMs);
    return {
      x: sample.x + (next.x - sample.x) * fraction,
      y: sample.y + (next.y - sample.y) * fraction,
      ...(sample.touch ? { touch: true } : {}),
    };
  }
  return { x: sample.x, y: sample.y, ...(sample.touch ? { touch: true } : {}) };
}

/**
 * Clicks that are still animating at `playheadMs`.
 *
 * PERF: this runs on every replay frame store update — up to once per animation
 * frame while scrubbing — so it must not be O(total clicks). Clicks are recorded
 * in ascending `tMs`, and one can only be active for `getReplayClickDurationMs`,
 * so binary-search the start of that window and walk forward until past the
 * playhead. A long fight records thousands of clicks; the active window is a
 * handful.
 */
export function projectActiveClicks(track: ReplayCursorTrack, playheadMs: number): readonly ProjectedClick[] {
  const clicks = track.clicks;

  const active: ProjectedClick[] = [];
  for (
    let occurrence = firstAtOrAfter(clicks, playheadMs - MAX_CLICK_DURATION_MS);
    occurrence < clicks.length;
    occurrence++
  ) {
    const click = clicks[occurrence];
    if (!click) break;
    const elapsedMs = playheadMs - click.tMs;
    // Ascending tMs: once we reach a click that has not started, none after it have.
    if (elapsedMs < 0) break;
    const durationMs = getReplayClickDurationMs(click.type);
    if (elapsedMs >= durationMs) continue;
    // Same fail-closed rule as the cursor: a click landed on a sidebar or on
    // browser chrome is not on anything playback rebuilt.
    if (!click.insideFrame) continue;

    active.push({
      key: `click:${occurrence}`,
      occurrence,
      type: click.type,
      elapsedMs,
      progress: elapsedMs / durationMs,
      x: click.x,
      y: click.y,
      ...(click.touch ? { touch: true } : {}),
    });
  }
  return active.length === 0 ? EMPTY_CLICKS : active;
}

const EMPTY_CLICKS: readonly ProjectedClick[] = [];

/** How long a hold mark stays on screen after its menu opens. */
export const REPLAY_HOLD_MARK_DURATION_MS = 500;

/**
 * How far before a hold's menu opened its press point may be. Track time runs at the
 * recording speed, so this is the longest long-press delay at the fastest speed (2x), with
 * slack for the menu reaching the recorder a frame or two after the hold fires.
 */
const HOLD_PRESS_LOOKBACK_MS = TOUCH_LONG_PRESS_MAX_MS * 2 + 250;

export interface ProjectedHold {
  readonly key: string;
  /** Where the finger was held, in the same space as `ProjectedClick` and the cursor. */
  readonly x: number;
  readonly y: number;
  /** Time since the hold's menu opened. */
  readonly elapsedMs: number;
  /** `elapsedMs` over `REPLAY_HOLD_MARK_DURATION_MS`, in [0, 1). */
  readonly progress: number;
}

/**
 * Touch long-presses whose mark is still showing at `playheadMs`. A hold is a menu `open` a
 * long-press made, which is the only kind to record a `rowHeight` (see `ReplayMenuView`), on
 * the world or on a panel alike. Its press point is the latest pinned touch sample before the
 * open, within `HOLD_PRESS_LOOKBACK_MS`: the recorder pins one where every finger comes down.
 * A recording with no such sample near the open shows no mark; neither does a press off the
 * reproducible surface, by the same fail-closed rule as clicks.
 *
 * PERF: runs per replay frame, like `projectActiveClicks`: a binary search for the window of
 * opens that can still be showing, and for each, one bounded walk back over its lookback.
 */
export function projectActiveHolds(
  track: ReplayCursorTrack,
  menuEvents: readonly ReplayMenuEvent[],
  playheadMs: number,
): readonly ProjectedHold[] {
  const active: ProjectedHold[] = [];
  for (
    let index = firstAtOrAfter(menuEvents, playheadMs - REPLAY_HOLD_MARK_DURATION_MS);
    index < menuEvents.length;
    index++
  ) {
    const event = menuEvents[index];
    if (!event) break;
    const elapsedMs = playheadMs - event.tMs;
    if (elapsedMs < 0) break;
    if (elapsedMs >= REPLAY_HOLD_MARK_DURATION_MS) continue;
    if (event.kind !== 'open' || event.state.rowHeight === undefined) continue;
    const press = holdPressSample(track.samples, event.tMs);
    if (!press?.insideFrame) continue;
    active.push({
      key: `hold:${index}`,
      x: press.x,
      y: press.y,
      elapsedMs,
      progress: elapsedMs / REPLAY_HOLD_MARK_DURATION_MS,
    });
  }
  return active.length === 0 ? EMPTY_HOLDS : active;
}

const EMPTY_HOLDS: readonly ProjectedHold[] = [];

/**
 * Moves within the long-press slop are not pinned; the menu opens where the finger came down.
 * The press must strictly precede the open, as a long-press delay always separates them: a
 * recording's `open` at its first instant has no press before it, so no fresh mark.
 */
function holdPressSample(samples: readonly ReplayCursorSample[], openMs: number): ReplayCursorSample | undefined {
  for (let index = firstAtOrAfter(samples, openMs) - 1; index >= 0; index--) {
    const sample = samples[index];
    if (!sample || sample.tMs < openMs - HOLD_PRESS_LOOKBACK_MS) return undefined;
    if (sample.touch && sample.pinned) return sample;
  }
  return undefined;
}

/** Longest any click marker can stay on screen; bounds the binary-search window. */
const MAX_CLICK_DURATION_MS = Math.max(
  getReplayClickDurationMs('yellow'),
  getReplayClickDurationMs('red'),
  getReplayClickDurationMs('ui'),
);

/** Index of the first entry whose tMs is >= `tMs` (entries are ascending). */
function firstAtOrAfter(entries: readonly TimedCursorSample[], tMs: number): number {
  let lo = 0;
  let hi = entries.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    const entry = entries[mid];
    if (entry && entry.tMs < tMs) {
      lo = mid + 1;
    } else {
      hi = mid;
    }
  }
  return lo;
}

function recordedSampleIndexAt(samples: readonly TimedCursorSample[], playheadMs: number): number {
  const first = samples[0];
  if (!first || playheadMs < first.tMs) return -1;

  let lo = 0;
  let hi = samples.length - 1;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    const sample = samples[mid];
    if (sample && sample.tMs <= playheadMs) {
      lo = mid;
    } else {
      hi = mid - 1;
    }
  }
  return lo;
}
