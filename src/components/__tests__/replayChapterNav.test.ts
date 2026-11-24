import { describe, expect, it } from 'vitest';
import type { ReplayChapter } from '../../core/replayTimeline';
import {
  CHAPTER_RESTART_FRAMES,
  chapterIndexAtFrame,
  chapterRailCutLayer,
  chapterRailCuts,
  describeChapter,
  frameRailX,
  nextChapterFrame,
  previousChapterFrame,
} from '../replayChapterNav';

function chapter(
  wave: number,
  startFrame: number,
  endFrame: number,
  extra: Partial<ReplayChapter> = {},
): ReplayChapter {
  return {
    startFrame,
    endFrame,
    label: `Wave ${wave}`,
    shortLabel: String(wave),
    cleared: true,
    attempt: 1,
    ...extra,
  };
}

/** Waves 1..count, each `length` frames, which is the shape every case below navigates. */
function run(count: number, length: number): ReplayChapter[] {
  return Array.from({ length: count }, (_, index) => chapter(index + 1, index * length, (index + 1) * length));
}

const METRICS = { railPx: 400, thumbPx: 6, cutPx: 1 };

describe('chapterIndexAtFrame', () => {
  const chapters = run(4, 10);

  it.each([
    [0, 0],
    [9, 0],
    [10, 1],
    [25, 2],
    [39, 3],
  ])('puts frame %i in chapter %i', (frame, index) => {
    expect(chapterIndexAtFrame(chapters, frame)).toBe(index);
  });

  it('answers -1 outside the chapters, which a recording can start and end beyond', () => {
    expect(chapterIndexAtFrame([chapter(5, 4, 12)], 2)).toBe(-1);
    expect(chapterIndexAtFrame(chapters, 40)).toBe(-1);
    expect(chapterIndexAtFrame([], 0)).toBe(-1);
  });
});

describe('previousChapterFrame', () => {
  const chapters = run(3, 20);

  it('restarts the chapter being watched from inside it', () => {
    expect(previousChapterFrame(chapters, 35)).toBe(20);
    expect(previousChapterFrame(chapters, 20 + CHAPTER_RESTART_FRAMES + 1)).toBe(20);
  });

  it('steps back a chapter from its opening frames, so two presses reach the one before', () => {
    expect(previousChapterFrame(chapters, 20)).toBe(0);
    expect(previousChapterFrame(chapters, 20 + CHAPTER_RESTART_FRAMES)).toBe(0);
  });

  it("has nowhere to go at the first chapter's start, or before any chapter", () => {
    expect(previousChapterFrame(chapters, 0)).toBeNull();
    expect(previousChapterFrame([chapter(5, 4, 12)], 1)).toBeNull();
  });

  it('still restarts the first chapter from inside it', () => {
    expect(previousChapterFrame(chapters, 10)).toBe(0);
  });
});

describe('nextChapterFrame', () => {
  const chapters = run(3, 20);

  it("goes to the next chapter's start", () => {
    expect(nextChapterFrame(chapters, 0)).toBe(20);
    expect(nextChapterFrame(chapters, 19)).toBe(20);
    expect(nextChapterFrame(chapters, 20)).toBe(40);
  });

  it('stops at the last chapter, and enters the first from before them', () => {
    expect(nextChapterFrame(chapters, 50)).toBeNull();
    expect(nextChapterFrame([chapter(5, 4, 12)], 1)).toBe(4);
  });
});

describe('describeChapter', () => {
  it('names the wave, what is in it, and whether the recording finished it', () => {
    expect(describeChapter(chapter(67, 0, 10, { detail: 'First Jad (JalTok-Jad)' }))).toBe(
      'Wave 67: First Jad (JalTok-Jad)',
    );
    expect(describeChapter(chapter(68, 0, 10, { detail: '3 Jads', cleared: false }))).toBe(
      'Wave 68: 3 Jads (not finished)',
    );
    expect(describeChapter(chapter(35, 0, 10, { attempt: 2 }))).toBe('Wave 35 (attempt 2)');
  });
});

describe('chapterRailCuts', () => {
  it("marks every boundary but the recording's own ends", () => {
    const { cuts } = chapterRailCuts(run(4, 100), 400, METRICS);
    expect(cuts).toHaveLength(3);
    expect(cuts[0]).toBe(Math.round(frameRailX(100, 400, METRICS) - 1));
  });

  it('skips a boundary that would land inside the last mark kept, so 68 waves stay a scale', () => {
    // Sixty-eight equal waves over 400px is under 6px a wave: everything clears the 4px pitch.
    expect(chapterRailCuts(run(68, 10), 680, METRICS).cuts).toHaveLength(67);
    // The same run on a bar a third as wide cannot: it thins to what the pitch allows.
    const narrow = chapterRailCuts(run(68, 10), 680, { ...METRICS, railPx: 120 }).cuts;
    expect(narrow.length).toBeLessThan(34);
    expect(narrow.length).toBeGreaterThan(20);
    for (let index = 1; index < narrow.length; index++)
      expect(narrow[index] - narrow[index - 1]).toBeGreaterThanOrEqual(4);
  });

  it("widens the mark where every wave has room for it, and never at the rail's edges", () => {
    expect(chapterRailCuts(run(3, 100), 300, METRICS).cutPx).toBe(2);
    expect(chapterRailCuts(run(68, 10), 680, METRICS).cutPx).toBe(1);
    const cuts = chapterRailCuts(run(3, 100), 300, METRICS).cuts;
    expect(Math.min(...cuts)).toBeGreaterThan(0);
    expect(Math.max(...cuts)).toBeLessThan(METRICS.railPx - 2);
  });

  it('has nothing to mark without a rail, a timeline or a second chapter', () => {
    expect(chapterRailCuts(run(4, 10), 40, { ...METRICS, railPx: 0 }).cuts).toEqual([]);
    expect(chapterRailCuts(run(1, 10), 10, METRICS).cuts).toEqual([]);
    expect(chapterRailCuts(run(4, 10), 1, METRICS).cuts).toEqual([]);
  });
});

describe('chapterRailCutLayer', () => {
  it("cuts each mark out of the rail in the bar's own surface color", () => {
    expect(chapterRailCutLayer([12, 40], 2)).toBe(
      'linear-gradient(to right, transparent 0, transparent 12px, var(--replay-rail-cut) 12px 14px, ' +
        'transparent 14px, transparent 40px, var(--replay-rail-cut) 40px 42px, transparent 42px, transparent 100%)',
    );
  });

  it('draws no layer at all with no marks, so a replay without chapters keeps the rail it had', () => {
    expect(chapterRailCutLayer([], 1)).toBeNull();
  });
});
