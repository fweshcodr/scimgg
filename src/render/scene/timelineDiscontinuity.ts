/**
 * Encounter-agnostic replay-timeline discontinuity classifier.
 *
 * The render/audio path is fed a per-tick `displayState` + that tick's
 * `displayEvents`, but most render/audio components build transient cross-tick
 * state incrementally, assuming a *contiguous, forward* tick stream. During
 * replay the timeline is non-contiguous — the user can seek/scrub backward,
 * jump forward, or the underlying engine/scene can change (live↔replay,
 * takeover, scene load). This pure function classifies the transition between
 * the previously-displayed frame and the current one so the base
 * `SceneCompositor` can drive a single uniform `resetTransientState` across all
 * render/audio participants.
 *
 * It is deliberately pure and dependency-free so it can be unit-tested in
 * isolation and reused by any encounter compositor — no Yama specifics.
 */

export type DiscontinuityReason = 'rewind' | 'forward-jump' | 'timeline-change';

/** The previously-observed timeline state, owned by the compositor. */
export interface TimelineDiscontinuityState {
  /** Last displayed tick, or undefined before the first frame. */
  readonly lastDisplayedTick: number | undefined;
  /** Last timeline key, or undefined before the first frame. */
  readonly lastTimelineKey: string | undefined;
}

/** The current frame's timeline descriptor. */
export interface TimelineFrameInfo {
  readonly currentTick: number;
  /**
   * Stable identity of the current timeline. Changes on live↔replay, engine
   * swap/takeover, and scene load. May be undefined when timeline metadata is
   * not yet wired for a surface (lobby / 2D); in that case only tick-based
   * discontinuities (rewind / forward-jump) are detected.
   */
  readonly timelineKey: string | undefined;
}

/**
 * Classify the transition into `next` given the previously-observed `prev`.
 *
 * - `timeline-change` — the timeline identity changed (takes priority; covers
 *   live↔replay, takeover, scene load). Only fires once a previous key existed.
 * - first frame (`lastDisplayedTick === undefined`) — no reset.
 * - `rewind` — current tick is strictly before the last displayed tick.
 * - `forward-jump` — current tick skipped ahead by more than one tick.
 * - otherwise (same tick, or contiguous `tick + 1`) — no reset, so normal
 *   contiguous playback never hitches.
 *
 * Note: `paused` is intentionally NOT an input — pausing changes clock/audio
 * behavior but is not itself a discontinuity, and a held/seeked frame must not
 * repeatedly reset.
 */
export function detectTimelineDiscontinuity(
  prev: TimelineDiscontinuityState,
  next: TimelineFrameInfo,
): DiscontinuityReason | null {
  if (
    prev.lastTimelineKey !== undefined &&
    next.timelineKey !== undefined &&
    next.timelineKey !== prev.lastTimelineKey
  ) {
    return 'timeline-change';
  }

  if (prev.lastDisplayedTick === undefined) {
    return null;
  }

  if (next.currentTick < prev.lastDisplayedTick) {
    return 'rewind';
  }

  if (next.currentTick > prev.lastDisplayedTick + 1) {
    return 'forward-jump';
  }

  return null;
}
