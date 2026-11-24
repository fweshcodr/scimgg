/**
 * The fixed tick grid for a frame without a recorded start. Spelled out rather than imported
 * from `types/simulation`, which would drag the engine's types into this dependency-free module.
 */
const OSRS_TICK_MS = 600;

/** The part of a replay frame the timeline reads. */
export interface ReplayTimelineFrame {
  readonly startMs?: number;
}

/**
 * Replay-timeline milliseconds at which frame `index` starts: the one mapping between frames and
 * playback time. The recorder stamps each tick's real start, so a tick that ran late is a long
 * one; a frame without the field (a hand-built display frame) sits on the fixed 600 ms grid. An
 * index past the last frame extends the grid from it.
 */
export function frameStartMs(frames: readonly ReplayTimelineFrame[], index: number): number {
  if (index <= 0) return 0;
  const last = frames.length - 1;
  if (index > last) {
    return last < 0 ? index * OSRS_TICK_MS : frameStartMs(frames, last) + (index - last) * OSRS_TICK_MS;
  }
  return frames[index]?.startMs ?? index * OSRS_TICK_MS;
}

/**
 * The frame on screen at `playheadMs`: the last one starting at or before it, clamped to the
 * recording. Searches each frame's own start, so frames with and without a recorded start can
 * share one timeline.
 */
export function frameIndexAtMs(frames: readonly ReplayTimelineFrame[], playheadMs: number): number {
  const last = frames.length - 1;
  if (last <= 0 || !(playheadMs > 0)) return 0;
  let lo = 0;
  let hi = last;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (frameStartMs(frames, mid) <= playheadMs) lo = mid;
    else hi = mid - 1;
  }
  return lo;
}

/**
 * The frame whose start is nearest `ms`, for a typed time. Past the last frame the 600 ms grid
 * continues, and nothing is clamped: bounding the index is the caller's job.
 */
export function frameIndexNearestMs(frames: readonly ReplayTimelineFrame[], ms: number): number {
  const last = frames.length - 1;
  if (last < 0) return Math.round(ms / OSRS_TICK_MS);
  const lastStartMs = frameStartMs(frames, last);
  if (ms >= lastStartMs) return last + Math.round((ms - lastStartMs) / OSRS_TICK_MS);
  const index = frameIndexAtMs(frames, ms);
  const fromStart = ms - frameStartMs(frames, index);
  const toNext = frameStartMs(frames, index + 1) - ms;
  return toNext < fromStart ? index + 1 : index;
}

/**
 * Like {@link frameIndexAtMs}, but past the last frame the 600 ms grid carries on unclamped, so
 * playback can tell how many tick-lengths a jump in the recording's tail would cover.
 */
export function frameSlotAtMs(frames: readonly ReplayTimelineFrame[], playheadMs: number): number {
  const last = Math.max(0, frames.length - 1);
  const lastStartMs = frameStartMs(frames, last);
  if (playheadMs < lastStartMs) return frameIndexAtMs(frames, playheadMs);
  return last + Math.floor((playheadMs - lastStartMs) / OSRS_TICK_MS);
}

/**
 * A stretch of a replay its encounter names, such as one Inferno wave, so a long recording can be
 * navigated by what happened in it rather than by tick. Encounters derive these from their own
 * recorded snapshots; the replay bar only draws and jumps to them.
 */
export interface ReplayChapter {
  /** First frame of the chapter, where jumping to it lands. */
  readonly startFrame: number;
  /** First frame after the chapter: the next chapter's start, or the frame count. */
  readonly endFrame: number;
  /**
   * Frame the fighting starts on when a lead-in (a wave countdown) opens the chapter. Omitted when
   * the chapter is fighting from its first frame.
   */
  readonly engageFrame?: number;
  /** Full name, e.g. "Wave 35". */
  readonly label: string;
  /** Narrow face for the rail and compact layouts, e.g. "35". */
  readonly shortLabel: string;
  /** One plain line of context, e.g. "Jal-Zek first appears". */
  readonly detail?: string;
  /** A chapter worth finding at a glance, emphasized on the rail. */
  readonly landmark?: boolean;
  /** Whether the recording shows this chapter being finished (a wave cleared). */
  readonly cleared: boolean;
  /** 1 the first time this label appears in the recording, 2+ for each retry of it. */
  readonly attempt: number;
}

/** The chapters of one replay, oldest first, contiguous and non-overlapping. */
export interface ReplayChapterSet {
  /** What the chapters are, plural, for headings: "Waves". */
  readonly title: string;
  readonly chapters: readonly ReplayChapter[];
}

/** Ticks that ran late enough to have their timing kept, for the replay's warning. */
export interface ReplayLateTick {
  readonly frameIndex: number;
  readonly lateByMs: number;
}

export function getReplayLateTicks(
  frames: readonly { readonly timing?: { readonly lateByMs: number } }[],
): readonly ReplayLateTick[] {
  const late: ReplayLateTick[] = [];
  frames.forEach((frame, frameIndex) => {
    if (frame.timing) late.push({ frameIndex, lateByMs: frame.timing.lateByMs });
  });
  return late;
}
