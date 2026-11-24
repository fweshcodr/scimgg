/**
 * Navigating a replay by its encounter's chapters (an Inferno run's waves): which chapter a frame
 * is in, where the previous and next jumps land, and where the chapter boundaries fall on the seek
 * rail.
 *
 * All pure, and none of it reads a chapter per playback tick: the rail's geometry is derived once
 * per chapter set and rail width, and the readout needs one lookup per committed frame.
 */
import type { ReplayChapter } from '../core/replayTimeline';

/**
 * How far past a chapter's start "previous" still means this chapter's start rather than the one
 * before it, as a media transport's chapter back does. Three frames is under two seconds: enough
 * that a single step forward does not change what the button means, short enough that the shortest
 * Inferno wave still has a usable interior.
 */
export const CHAPTER_RESTART_FRAMES = 3;

/** The index of the chapter `frame` falls in, or -1 when it falls before the first one. */
export function chapterIndexAtFrame(chapters: readonly ReplayChapter[], frame: number): number {
  const first = chapters[0];
  if (!first || frame < first.startFrame) return -1;
  let low = 0;
  let high = chapters.length - 1;
  while (low < high) {
    const mid = (low + high + 1) >> 1;
    if ((chapters[mid]?.startFrame ?? 0) <= frame) low = mid;
    else high = mid - 1;
  }
  return frame < (chapters[low]?.endFrame ?? 0) ? low : -1;
}

/**
 * Where chapter-back lands: this chapter's start from inside it, the chapter before it from its
 * opening frames. Null when there is nothing earlier to reach.
 */
export function previousChapterFrame(chapters: readonly ReplayChapter[], frame: number): number | null {
  const index = chapterIndexAtFrame(chapters, frame);
  if (index < 0) return null;
  const chapter = chapters[index];
  if (!chapter) return null;
  if (frame - chapter.startFrame > CHAPTER_RESTART_FRAMES) return chapter.startFrame;
  const previous = chapters[index - 1];
  if (previous) return previous.startFrame;
  return frame > chapter.startFrame ? chapter.startFrame : null;
}

/**
 * Where chapter-forward lands: the next chapter's start, or the first one from a frame recorded
 * before any chapter began. Null at the last chapter.
 */
export function nextChapterFrame(chapters: readonly ReplayChapter[], frame: number): number | null {
  const index = chapterIndexAtFrame(chapters, frame);
  if (index < 0) return chapters[0]?.startFrame ?? null;
  return chapters[index + 1]?.startFrame ?? null;
}

/** One line of plain prose for a chapter: its name, what is in it, and whether it was finished. */
export function describeChapter(chapter: ReplayChapter): string {
  const attempt = chapter.attempt > 1 ? ` (attempt ${chapter.attempt})` : '';
  const detail = chapter.detail ? `: ${chapter.detail}` : '';
  const unfinished = chapter.cleared ? '' : ' (not finished)';
  return `${chapter.label}${attempt}${detail}${unfinished}`;
}

/** The seek rail's own measurements, in the bar's authored (unzoomed) CSS pixels. */
export interface ChapterRailMetrics {
  /** The slider's width, which the rail spans. */
  readonly railPx: number;
  /** The thumb's width: its center travels half of it short of each end. */
  readonly thumbPx: number;
  /** How wide one boundary mark is cut into the rail. */
  readonly cutPx: number;
}

/** Where the thumb's center sits for `frame`, in rail pixels. */
export function frameRailX(frame: number, totalFrames: number, { railPx, thumbPx }: ChapterRailMetrics): number {
  const span = Math.max(0, railPx - thumbPx);
  const last = Math.max(1, totalFrames - 1);
  return thumbPx / 2 + (span * Math.min(Math.max(0, frame), last)) / last;
}

/**
 * A segment wide enough to spare a second pixel at its edges. Below it every pixel of rail is
 * carrying the wave's length, so the cut stays as thin as it can be drawn.
 */
const WIDE_SEGMENT_PX = 24;

/** Where the rail's boundary marks go, and how wide one is. */
export interface ChapterRailCuts {
  /** Whole-pixel left offsets, in rail pixels. */
  readonly cuts: readonly number[];
  readonly cutPx: number;
}

/**
 * Boundary marks for the rail.
 *
 * A full Inferno run is 68 waves over a rail of a few hundred pixels, so a mark per wave would be
 * a picket fence in the long stretches and solid gray in the short early ones. Marks are therefore
 * laid down in order and skipped while they would land closer than one mark plus three pixels from
 * the last one kept: the rail then reads as a scale whose segments are waves, at the finest pitch
 * that stays legible, rather than as noise. Whole pixels, because a fractional stop turns a
 * one-pixel cut into two pixels of gray.
 *
 * A recording of a few waves gets a wider cut: at a pixel the break is barely there against the
 * unplayed rail, and a run with that much room per wave can afford the ink.
 */
export function chapterRailCuts(
  chapters: readonly ReplayChapter[],
  totalFrames: number,
  metrics: ChapterRailMetrics,
): ChapterRailCuts {
  const { railPx } = metrics;
  const none = { cuts: [], cutPx: metrics.cutPx };
  if (railPx <= 0 || totalFrames < 2 || chapters.length < 2) return none;
  const minPitch = metrics.cutPx + 3;
  const kept: number[] = [];
  let lastX = Number.NEGATIVE_INFINITY;
  let tightest = Number.POSITIVE_INFINITY;
  // Only the interior boundaries: the recording's own ends are the rail's ends.
  for (let index = 1; index < chapters.length; index++) {
    const start = chapters[index]?.startFrame;
    if (start === undefined) continue;
    const x = frameRailX(start, totalFrames, metrics);
    if (x - lastX < minPitch) continue;
    if (x <= 0 || x >= railPx) continue;
    if (kept.length > 0) tightest = Math.min(tightest, x - lastX);
    kept.push(x);
    lastX = x;
  }
  if (kept.length === 0) return none;
  const ends = Math.min(kept[0] ?? railPx, railPx - (kept[kept.length - 1] ?? 0));
  const cutPx = Math.min(tightest, ends) >= WIDE_SEGMENT_PX ? metrics.cutPx * 2 : metrics.cutPx;
  const cuts: number[] = [];
  for (const x of kept) {
    const left = Math.round(x - cutPx / 2);
    if (left <= 0 || left + cutPx >= railPx) continue;
    cuts.push(left);
  }
  return { cuts, cutPx };
}

/**
 * The CSS background layer that cuts those marks into the rail, or null when there are none.
 *
 * It is a background layer on the slider itself rather than an element over it, so the thumb still
 * paints above the marks it passes and nothing new can intercept a seek gesture. The cuts are
 * painted in the color of whatever the bar's surface is (`--replay-rail-cut`), so they read as
 * gaps in the rail on both the floating bar and the Mobile tool window's stone.
 */
export function chapterRailCutLayer(cuts: readonly number[], cutPx: number): string | null {
  if (cuts.length === 0) return null;
  const stops = cuts.map(
    (left) =>
      `transparent ${left}px, var(--replay-rail-cut) ${left}px ${left + cutPx}px, transparent ${left + cutPx}px`,
  );
  return `linear-gradient(to right, transparent 0, ${stops.join(', ')}, transparent 100%)`;
}
