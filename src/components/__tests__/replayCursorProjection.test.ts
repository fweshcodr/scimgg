import { describe, expect, it } from 'vitest';
import type { ReplayCursorTrack } from '../../core/ReplayRecorder';
import type { ReplayMenuEvent } from '../../core/replayMenu';
import { getReplayClickDurationMs, type ReplayClickType } from '../../input/replayClickFeedback';
import { ReplayPresentationStateSchema } from '../../replay/format/presentationFormat';
import { validPresentationSample } from '../../test/helpers/replayFixtures';
import {
  interpolateCursor,
  projectActiveClicks,
  projectActiveHolds,
  REPLAY_HOLD_MARK_DURATION_MS,
} from '../replayCursorProjection';

function clickTrack(type: ReplayClickType): ReplayCursorTrack {
  return {
    samples: [],
    clicks: [{ tMs: 100, x: 240, y: 180, insideFrame: true, type }],
  };
}

describe('projectActiveClicks', () => {
  it.each<ReplayClickType>(['yellow', 'red', 'ui'])('projects %s clicks at start, middle, and end', (type) => {
    const track = clickTrack(type);
    const durationMs = getReplayClickDurationMs(type);

    const start = projectActiveClicks(track, 100);
    const middle = projectActiveClicks(track, 100 + durationMs / 2);
    const end = projectActiveClicks(track, 100 + durationMs - 1);

    expect(start).toEqual([{ key: 'click:0', occurrence: 0, type, elapsedMs: 0, progress: 0, x: 240, y: 180 }]);
    expect(middle[0]).toMatchObject({ occurrence: 0, type, elapsedMs: durationMs / 2, progress: 0.5 });
    expect(end[0]).toMatchObject({ occurrence: 0, type, elapsedMs: durationMs - 1 });
    expect(end[0]?.progress).toBeCloseTo((durationMs - 1) / durationMs);
  });

  it.each<ReplayClickType>(['yellow', 'red', 'ui'])('uses an exclusive duration boundary for %s clicks', (type) => {
    const track = clickTrack(type);

    const active = projectActiveClicks(track, 100 + getReplayClickDurationMs(type));

    expect(active).toEqual([]);
  });

  it('preserves unique original occurrences for identical simultaneous clicks', () => {
    const click = { tMs: 100, x: 240, y: 180, insideFrame: true, type: 'yellow' } as const;
    const track = { samples: [], clicks: [click, click] } satisfies ReplayCursorTrack;

    const projected = projectActiveClicks(track, 200);

    expect(projected.map(({ key, occurrence }) => ({ key, occurrence }))).toEqual([
      { key: 'click:0', occurrence: 0 },
      { key: 'click:1', occurrence: 1 },
    ]);
  });

  it('carries a recorded finger through to the projected click, and nothing for a mouse', () => {
    const track = {
      samples: [],
      clicks: [
        { tMs: 100, x: 240, y: 180, insideFrame: true, type: 'yellow' },
        { tMs: 100, x: 260, y: 190, insideFrame: true, type: 'ui', touch: true },
      ],
    } satisfies ReplayCursorTrack;

    const [mouse, finger] = projectActiveClicks(track, 200);

    expect(mouse).not.toHaveProperty('touch');
    expect(finger).toMatchObject({ type: 'ui', touch: true });
  });

  it('returns the same phase after seeking backward and forward', () => {
    const track = clickTrack('red');

    const beforeSeek = projectActiveClicks(track, 250);
    const afterForwardSeek = projectActiveClicks(track, 650);
    const afterBackwardSeek = projectActiveClicks(track, 250);

    expect(afterForwardSeek[0]?.elapsedMs).toBe(550);
    expect(afterBackwardSeek).toEqual(beforeSeek);
  });

  it('drops a click that landed outside the reproducible frame', () => {
    // A click on a sidebar or on browser chrome is not on anything playback
    // rebuilds, so asserting a marker there would be a lie.
    const track = {
      samples: [],
      clicks: [{ tMs: 100, x: -40, y: 180, insideFrame: false, type: 'ui' as const }],
    } satisfies ReplayCursorTrack;

    expect(projectActiveClicks(track, 200)).toEqual([]);
  });
});

describe('interpolateCursor', () => {
  it('holds through a coordinate discontinuity and through a presentation-sample change', () => {
    const state = ReplayPresentationStateSchema.parse(validPresentationSample().state);
    const samples = [
      { tMs: 0, x: 0, y: 0, insideFrame: true },
      { tMs: 20, x: 20, y: 20, insideFrame: true },
    ] as const;
    const track = { samples, clicks: [] };
    expect(interpolateCursor({ ...track, samples: [samples[0], { ...samples[1], breakBefore: true }] }, 10)).toEqual({
      x: 0,
      y: 0,
    });
    expect(interpolateCursor({ ...track, presentationSamples: [{ tMs: 10, state }] }, 5)).toEqual({ x: 0, y: 0 });
  });
  it('holds rather than sliding between a finger and a mouse, either way', () => {
    const finger = { tMs: 0, x: 0, y: 0, insideFrame: true, touch: true } as const;
    const mouse = { tMs: 20, x: 20, y: 20, insideFrame: true } as const;
    expect(interpolateCursor({ samples: [finger, mouse], clicks: [] }, 10)).toEqual({ x: 0, y: 0, touch: true });
    expect(
      interpolateCursor(
        {
          samples: [
            { ...mouse, tMs: 0 },
            { ...finger, tMs: 20 },
          ],
          clicks: [],
        },
        10,
      ),
    ).toEqual({
      x: 20,
      y: 20,
    });
    const fingerTap = { ...mouse, type: 'ui', touch: true } as const;
    expect(interpolateCursor({ samples: [{ ...mouse, tMs: 0, x: 0 }], clicks: [fingerTap] }, 10)).toEqual({
      x: 0,
      y: 20,
    });
  });
  it('keeps duplicate click occurrences ordered and resolves the last exact click at its timestamp', () => {
    const track: ReplayCursorTrack = {
      samples: [
        { tMs: 0, x: 0, y: 0, insideFrame: true },
        { tMs: 10, x: 30, y: 30, insideFrame: true },
      ],
      clicks: [
        { tMs: 10, x: 10, y: 10, insideFrame: true, type: 'ui' },
        { tMs: 10, x: 20, y: 20, insideFrame: true, type: 'red' },
      ],
    };
    expect(interpolateCursor(track, 10)).toEqual({ x: 20, y: 20 });
    expect(projectActiveClicks(track, 10).map(({ x }) => x)).toEqual([10, 20]);
  });
  it('interpolates short visible motion and lands on an exact intervening click', () => {
    const track: ReplayCursorTrack = {
      samples: [
        { tMs: 0, x: 0, y: 0, insideFrame: true },
        { tMs: 20, x: 20, y: 20, insideFrame: true },
      ],
      clicks: [{ tMs: 10, x: 8, y: 8, insideFrame: true, type: 'ui' }],
    };
    expect(interpolateCursor(track, 5)).toEqual({ x: 4, y: 4 });
    expect(interpolateCursor(track, 10)).toEqual({ x: 8, y: 8 });
    expect(interpolateCursor(track, 15)).toEqual({ x: 14, y: 14 });
  });
  it('holds the last recorded position throughout an idle gap', () => {
    const track = {
      samples: [
        { tMs: 0, x: 320, y: 396, insideFrame: true },
        { tMs: 2400, x: 960, y: 252, insideFrame: true },
      ],
      clicks: [],
    } satisfies ReplayCursorTrack;

    const cursor = interpolateCursor(track, 1200);

    expect(cursor).toEqual({ x: 320, y: 396 });
  });

  it('switches to the next position at its exact recorded timestamp', () => {
    const track = {
      samples: [
        { tMs: 0, x: 300, y: 350, insideFrame: true },
        { tMs: 100, x: 700, y: 200, insideFrame: true },
      ],
      clicks: [],
    } satisfies ReplayCursorTrack;

    const beforeNextSample = interpolateCursor(track, 99);
    const atNextSample = interpolateCursor(track, 100);

    expect(beforeNextSample).toEqual({ x: 300, y: 350 });
    expect(atNextSample).toEqual({ x: 700, y: 200 });
  });

  it('reports nothing before the first sample, and while outside the frame', () => {
    const track = {
      samples: [
        { tMs: 100, x: 300, y: 350, insideFrame: true },
        { tMs: 200, x: -20, y: 350, insideFrame: false },
      ],
      clicks: [],
    } satisfies ReplayCursorTrack;

    expect(interpolateCursor(track, 99)).toBeNull();
    expect(interpolateCursor(track, 100)).toEqual({ x: 300, y: 350 });
    // Over a sidebar: hidden rather than drawn across a scene that was never under it.
    expect(interpolateCursor(track, 250)).toBeNull();
  });
});

describe('projectActiveHolds', () => {
  const view = {
    x: 400,
    y: 300,
    scale: 1,
    hoveredIndex: -1,
    submenuParentIndex: -1,
    hoveredSubmenuIndex: -1,
    submenuPosition: null,
  } as const;
  const touchOpen = (tMs: number): ReplayMenuEvent => ({
    kind: 'open',
    tMs,
    state: { ...view, rowHeight: 28, scrollTop: 0, entries: [{ action: 'Walk here' }] },
  });
  const mouseOpen = (tMs: number): ReplayMenuEvent => ({
    kind: 'open',
    tMs,
    state: { ...view, entries: [{ action: 'Walk here' }] },
  });
  // An earlier gesture, then the pinned press 300ms before the menu opened at 1300.
  const track = {
    samples: [
      { tMs: 200, x: 10, y: 20, insideFrame: true, touch: true },
      { tMs: 1000, x: 240, y: 180, insideFrame: true, pinned: true, touch: true },
    ],
    clicks: [],
  } satisfies ReplayCursorTrack;

  it('marks a touch-opened menu at its press point, not at the menu', () => {
    const events = [touchOpen(1300), { kind: 'close', tMs: 2000 } as const];

    expect(projectActiveHolds(track, events, 1300)).toEqual([
      { key: 'hold:0', x: 240, y: 180, elapsedMs: 0, progress: 0 },
    ]);
  });

  it('marks nothing for a mouse menu, or for an update to a touch one', () => {
    expect(projectActiveHolds(track, [mouseOpen(1300)], 1350)).toEqual([]);
    const update: ReplayMenuEvent = { kind: 'update', tMs: 1400, view: { ...view, rowHeight: 28, scrollTop: 40 } };
    const holds = projectActiveHolds(track, [touchOpen(1300), update], 1450);
    expect(holds.map((hold) => hold.key)).toEqual(['hold:0']);
  });

  it('marks nothing without a touch sample at or before the open', () => {
    const mouseOnly = {
      samples: [{ tMs: 1000, x: 240, y: 180, insideFrame: true }],
      clicks: [],
    } satisfies ReplayCursorTrack;
    const pressAfter = {
      samples: [{ tMs: 1301, x: 240, y: 180, insideFrame: true, pinned: true, touch: true }],
      clicks: [],
    } satisfies ReplayCursorTrack;

    expect(projectActiveHolds(mouseOnly, [touchOpen(1300)], 1300)).toEqual([]);
    expect(projectActiveHolds(pressAfter, [touchOpen(1300)], 1300)).toEqual([]);
    expect(projectActiveHolds({ samples: [], clicks: [] }, [touchOpen(1300)], 1300)).toEqual([]);
  });

  it('skips a later mouse sample to find the press, but not a press too old to have opened the menu', () => {
    const withMouse = {
      samples: [...track.samples, { tMs: 1200, x: 500, y: 500, insideFrame: true }],
      clicks: [],
    } satisfies ReplayCursorTrack;
    expect(projectActiveHolds(withMouse, [touchOpen(1300)], 1300)[0]).toMatchObject({ x: 240, y: 180 });

    // A recording with no press sample: only the previous gesture's movement.
    const unpinned = { samples: [track.samples[0]], clicks: [] } satisfies ReplayCursorTrack;
    expect(projectActiveHolds(unpinned, [touchOpen(1300)], 1300)).toEqual([]);
    // A previous tap's pinned sample: within the longest long-press at the fastest recording
    // speed, it cannot be told apart from a press.
    const stale = { samples: [{ ...track.samples[0], pinned: true }], clicks: [] } satisfies ReplayCursorTrack;
    expect(projectActiveHolds(stale, [touchOpen(1300)], 1300)).toHaveLength(1);
    expect(projectActiveHolds(stale, [touchOpen(3000)], 3000)).toEqual([]);
  });

  it('marks the pinned press point, not where the finger crept within the long-press slop', () => {
    const crept = {
      samples: [
        { tMs: 1000, x: 40, y: 50, insideFrame: true, pinned: true, touch: true },
        { tMs: 1100, x: 48, y: 50, insideFrame: true, touch: true },
      ],
      clicks: [],
    } satisfies ReplayCursorTrack;
    expect(projectActiveHolds(crept, [touchOpen(1300)], 1300)).toEqual([
      { key: 'hold:0', x: 40, y: 50, elapsedMs: 0, progress: 0 },
    ]);
  });

  it('marks nothing for an open with no press strictly before it, as a clip inherits at its start', () => {
    const atCut = {
      samples: [{ tMs: 0, x: 240, y: 180, insideFrame: true, pinned: true, touch: true }],
      clicks: [],
    } satisfies ReplayCursorTrack;
    expect(projectActiveHolds(atCut, [touchOpen(0)], 0)).toEqual([]);
    expect(projectActiveHolds(track, [touchOpen(1000)], 1000)).toEqual([]);
  });

  it('marks nothing for a press off the reproducible surface', () => {
    const offFrame = {
      samples: [{ tMs: 1000, x: -20, y: 180, insideFrame: false, pinned: true, touch: true }],
      clicks: [],
    } satisfies ReplayCursorTrack;
    expect(projectActiveHolds(offFrame, [touchOpen(1300)], 1300)).toEqual([]);
  });

  it('runs its progress over the duration, exclusive at the end, and scrubs both ways', () => {
    const events = [mouseOpen(100), { kind: 'close', tMs: 200 } as const, touchOpen(1300)];
    const at = (playheadMs: number) => projectActiveHolds(track, events, playheadMs);

    expect(at(1299)).toEqual([]);
    expect(at(1300 + REPLAY_HOLD_MARK_DURATION_MS / 2)).toEqual([
      { key: 'hold:2', x: 240, y: 180, elapsedMs: REPLAY_HOLD_MARK_DURATION_MS / 2, progress: 0.5 },
    ]);
    const last = at(1300 + REPLAY_HOLD_MARK_DURATION_MS - 1)[0];
    expect(last?.progress).toBeGreaterThan(0.99);
    expect(last?.progress).toBeLessThan(1);
    expect(at(1300 + REPLAY_HOLD_MARK_DURATION_MS)).toEqual([]);
    // Back again: the same phase.
    expect(at(1300 + REPLAY_HOLD_MARK_DURATION_MS / 2)[0]?.progress).toBe(0.5);
    expect(at(1300)[0]?.progress).toBe(0);
  });
});
