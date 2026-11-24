/**
 * How a replay's chapters are drawn in the transport: the landmark marks under the seek rail, the
 * rail's own measurements, and the picker the readout opens.
 *
 * Kept out of {@link ./ReplayControls.tsx} because it is one subject (the encounter's named
 * stretches of the recording) with its own geometry, and because the two pieces here must not
 * re-render with the playhead: a full Inferno run is 68 waves, and the bar re-renders on every
 * pointer sample of a drag. Both are memoized on the chapter set alone. Styles live in
 * ReplayControls.css with the rest of the bar, so the Mobile tool window's stylesheet can place
 * them the way it places every other part of the transport.
 */
import type React from 'react';
import { memo, useCallback, useEffect, useRef, useState } from 'react';
import type { ReplayChapter, ReplayChapterSet } from '../core/replayTimeline';
import { type ChapterRailMetrics, describeChapter } from './replayChapterNav';

/**
 * The chapters worth finding at a glance, marked under the rail (the first of each Inferno
 * monster, and the one wave with three Jads). Only these: a mark per wave would be a picket fence
 * at 68 of them, and the rail's own boundary cuts already show where every wave is.
 *
 * Under the rail rather than over it, so the late-tick pips above keep their lane and the two
 * kinds of mark can never be read for one another.
 */
export const ReplayWaveMarks = memo(function ReplayWaveMarks({
  landmarks,
  totalFrames,
}: {
  readonly landmarks: readonly ReplayChapter[];
  readonly totalFrames: number;
}) {
  if (landmarks.length === 0 || totalFrames < 2) return null;
  return (
    <div className="replay-wave-marks" aria-hidden="true">
      {landmarks.map((chapter) => (
        <span
          key={chapter.startFrame}
          className="replay-wave-mark"
          style={{ '--at': chapter.startFrame / (totalFrames - 1) } as React.CSSProperties}
        />
      ))}
    </div>
  );
});

/**
 * The rail's measurements, in the bar's authored CSS pixels, or null while it has no width.
 *
 * Measured rather than expressed in percentages because the boundary cuts are one pixel wide: a
 * fractional stop paints two pixels of gray instead, and 68 of those turn the rail to mush. The
 * zoom the chrome may be drawn at divides out, since both the layout width and the custom
 * properties are read unzoomed.
 */
export function useChapterRailMetrics(
  ref: React.RefObject<HTMLInputElement | null>,
  enabled: boolean,
): ChapterRailMetrics | null {
  const [metrics, setMetrics] = useState<ChapterRailMetrics | null>(null);
  useEffect(() => {
    const input = ref.current;
    if (!enabled || !input) {
      setMetrics(null);
      return;
    }
    const measure = () => {
      const style = getComputedStyle(input);
      const next: ChapterRailMetrics = {
        railPx: input.offsetWidth,
        thumbPx: Number.parseFloat(style.getPropertyValue('--seek-thumb')) || 0,
        cutPx: Math.max(1, Math.round(Number.parseFloat(style.getPropertyValue('--seek-cut')) || 1)),
      };
      setMetrics((previous) =>
        previous &&
        previous.railPx === next.railPx &&
        previous.thumbPx === next.thumbPx &&
        previous.cutPx === next.cutPx
          ? previous
          : next,
      );
    };
    measure();
    const sizes = new ResizeObserver(measure);
    sizes.observe(input);
    return () => sizes.disconnect();
  }, [ref, enabled]);
  return metrics;
}

/** The cells, which never change while the pointer moves over them: only the line below does. */
const WaveGrid = memo(function WaveGrid({
  chapters,
  currentIndex,
  onPick,
}: {
  readonly chapters: readonly ReplayChapter[];
  readonly currentIndex: number;
  readonly onPick: (chapter: ReplayChapter) => void;
}) {
  return (
    <div className="replay-waves__grid">
      {chapters.map((chapter, index) => (
        <button
          key={chapter.startFrame}
          type="button"
          data-index={index}
          className={`replay-waves__cell${chapter.landmark ? ' replay-waves__cell--landmark' : ''}${
            chapter.cleared ? '' : ' replay-waves__cell--open'
          }${index === currentIndex ? ' replay-waves__cell--current' : ''}`}
          aria-label={describeChapter(chapter)}
          aria-current={index === currentIndex ? 'true' : undefined}
          onClick={() => onPick(chapter)}
        >
          {chapter.shortLabel}
        </button>
      ))}
    </div>
  );
});

function cellIndex(target: EventTarget | null): number | null {
  const cell = target instanceof Element ? target.closest<HTMLElement>('.replay-waves__cell') : null;
  const index = cell ? Number(cell.dataset.index) : Number.NaN;
  return Number.isInteger(index) ? index : null;
}

/**
 * Every chapter of the recording as its short label, in order, with a line naming the one under
 * the pointer (the current one at rest).
 *
 * A grid of numbers rather than a list of rows: a full run has 68 waves, and a player looking for
 * one is looking for its number. Landmarks read brighter so the run's shape is visible without
 * reading, a wave the recording never shows finished is drawn open, and the line below is where
 * the words go, so the grid itself stays a scale. Only that line follows the pointer: the grid is
 * memoized, so passing over 68 cells re-renders one paragraph.
 */
export function ReplayWavePicker({
  chapterSet,
  currentIndex,
  panelRef,
  onPick,
}: {
  readonly chapterSet: ReplayChapterSet;
  readonly currentIndex: number;
  readonly panelRef: React.RefObject<HTMLFieldSetElement | null>;
  readonly onPick: (chapter: ReplayChapter) => void;
}) {
  const [hovered, setHovered] = useState<number | null>(null);
  const { chapters } = chapterSet;
  const described = chapters[hovered ?? currentIndex] ?? chapters[0];
  // Through a ref so the grid's memo survives the parent's every render, including a drag's.
  const pickRef = useRef(onPick);
  pickRef.current = onPick;
  const pick = useCallback((chapter: ReplayChapter) => pickRef.current(chapter), []);
  return (
    <fieldset
      ref={panelRef}
      className="replay-waves"
      aria-label={chapterSet.title}
      onPointerOver={(event) => setHovered(cellIndex(event.target))}
      onPointerLeave={() => setHovered(null)}
    >
      <WaveGrid chapters={chapters} currentIndex={currentIndex} onPick={pick} />
      <p className="replay-waves__detail">{described ? describeChapter(described) : null}</p>
    </fieldset>
  );
}
