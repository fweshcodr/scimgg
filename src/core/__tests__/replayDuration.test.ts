import { describe, expect, it } from 'vitest';
import { getReplayClickDurationMs } from '../../input/replayClickFeedback';
import { freshReplayCapture, REPLAY_CAPTURE_TRACKS } from '../../replay/format/capture';
import type { ReplayCursorTrack } from '../ReplayRecorder';
import { getReplayDurationMs } from '../replayDuration';

/** Frames that carry no tick timing: a 600 ms grid. */
const gridFrames = (count: number) => Array.from({ length: count }, () => ({}));

describe('getReplayDurationMs', () => {
  it.each(REPLAY_CAPTURE_TRACKS)('keeps a %s cutoff reachable without a sample at the cutoff', (track) => {
    const capture = {
      ...freshReplayCapture(),
      [track]: { provenance: 'bounded-v1', stoppedAtMs: 100, reason: 'entry-limit' },
    } as const;

    const duration = getReplayDurationMs(
      gridFrames(1),
      { samples: [], clicks: [] },
      { samples: [] },
      [],
      [],
      [],
      capture,
    );

    expect(duration).toBe(100);
  });

  it('preserves a later frame boundary when all capture cutoffs are earlier', () => {
    const capture = {
      ...freshReplayCapture(),
      menuEvents: { provenance: 'bounded-v1', stoppedAtMs: 100, reason: 'entry-limit' },
    } as const;

    const duration = getReplayDurationMs(
      gridFrames(2),
      { samples: [], clicks: [] },
      { samples: [] },
      [],
      [],
      [],
      capture,
    );

    expect(duration).toBe(600);
  });

  it('keeps a presentation-only sample reachable after the last frame', () => {
    const duration = getReplayDurationMs(
      gridFrames(2),
      { samples: [], clicks: [] },
      { samples: [] },
      [],
      [],
      [{ tMs: 950 }],
    );

    expect(duration).toBe(950);
  });

  it('ends at the last frame of a timed recording, where a late tick moved it', () => {
    const frames = [{ startMs: 0 }, { startMs: 700 }, { startMs: 1300 }];

    expect(getReplayDurationMs(frames, { samples: [], clicks: [] }, { samples: [] })).toBe(1300);
  });

  it('keeps the final menu-only close reachable after the last frame', () => {
    const duration = getReplayDurationMs(
      gridFrames(2),
      { samples: [], clicks: [] },
      { samples: [] },
      [],
      [{ kind: 'close', tMs: 950 }],
    );

    expect(duration).toBe(950);
  });
  it('uses the latest frame, cursor sample, or type-specific click tail', () => {
    const track = {
      samples: [{ tMs: 925, x: 10, y: 20, insideFrame: true }],
      clicks: [
        { tMs: 700, x: 10, y: 20, insideFrame: true, type: 'yellow' },
        { tMs: 1100, x: 30, y: 40, insideFrame: true, type: 'ui' },
      ],
    } satisfies ReplayCursorTrack;

    const durationMs = getReplayDurationMs(gridFrames(2), track, { samples: [] });

    expect(durationMs).toBe(1100 + getReplayClickDurationMs('ui'));
  });

  it('uses the final simulation frame boundary when cursor feedback ends earlier', () => {
    const track = {
      samples: [{ tMs: 100, x: 10, y: 20, insideFrame: true }],
      clicks: [],
    } satisfies ReplayCursorTrack;

    const durationMs = getReplayDurationMs(gridFrames(3), track, { samples: [] });

    expect(durationMs).toBe(1200);
  });

  it('keeps a camera-only sub-tick sample reachable at the replay tail', () => {
    const track = {
      samples: [],
      clicks: [],
    } satisfies ReplayCursorTrack;
    const viewportTrack = {
      samples: [
        {
          tMs: 950,
          viewportState: {
            kind: 'orbit3d',
            pitchDeg: -45,
            yawDeg: 210,
            fovScale: 512,
            distance: 6,
            target: { x: 31.5, y: 37.5, z: 0.9 },
          },
        },
      ],
    } as const;

    const durationMs = getReplayDurationMs(gridFrames(2), track, viewportTrack);

    expect(durationMs).toBe(950);
  });
});
