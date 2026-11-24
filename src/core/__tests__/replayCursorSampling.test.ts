import { describe, expect, it } from 'vitest';
import { interpolateCursor } from '../../components/replayCursorProjection';
import { ReplayPresentationStateSchema } from '../../replay/format/presentationFormat';
import { compactReplayCursorSamples } from '../../test/helpers/replayCursorCompaction';
import { validPresentationSample } from '../../test/helpers/replayFixtures';
import type { ReplayCursorSample, ReplayCursorTrack } from '../ReplayRecorder';

const point = (tMs: number, x = tMs): ReplayCursorSample => ({ tMs, x, y: 10, insideFrame: true });

describe('compactReplayCursorSamples', () => {
  it.each([1000, 8000])('reduces quantized %i Hz motion to 60 Hz bucket endpoints', (rate) => {
    const samples = Array.from({ length: rate + 1 }, (_, index) => {
      const tMs = (index * 1000) / rate;
      return point(tMs, Math.floor(tMs / 2));
    });
    const compacted = compactReplayCursorSamples({ samples, clicks: [] });
    expect(compacted.length).toBeLessThanOrEqual(63);
    expect(compacted[0]).toEqual(samples[0]);
    expect(compacted.at(-1)).toEqual(samples.at(-1));
  });
  it('preserves arrival, idle endpoints, and the first movement after a long idle', () => {
    const samples = [point(0), point(1), point(2, 1), point(3, 1), point(1000, 1), point(1001, 2), point(1002, 3)];
    const compacted = compactReplayCursorSamples({ samples, clicks: [] });
    expect(compacted.map(({ tMs }) => tMs)).toEqual([0, 1, 1000, 1001, 1002]);
    const resumed = compactReplayCursorSamples({
      samples: [point(0), point(1000), point(1001), point(1002)],
      clicks: [],
    });
    expect(resumed.map(({ tMs }) => tMs)).toEqual([0, 1000, 1002]);
  });
  it('preserves pinned samples and both sides of visibility and coordinate boundaries', () => {
    const samples = [
      point(0),
      point(1),
      { ...point(2), breakBefore: true },
      point(3),
      point(4),
      { ...point(5), pinned: true },
      { ...point(6), insideFrame: false },
      point(7),
      point(8),
    ] satisfies ReplayCursorSample[];
    const compacted = compactReplayCursorSamples({ samples, clicks: [] });
    expect(compacted.map(({ tMs }) => tMs)).toEqual([0, 1, 2, 4, 5, 6, 7, 8]);
    expect(compacted.find(({ tMs }) => tMs === 5)?.pinned).toBe(true);
  });
  it('keeps the first sample after a switch between finger and mouse, and never interpolates across it', () => {
    const finger = { ...point(0, 40), touch: true as const };
    const samples = [
      finger,
      point(100, 40),
      point(200, 40),
      { ...point(210, 40), touch: true as const },
      point(220, 40),
    ];
    const compacted = compactReplayCursorSamples({ samples, clicks: [] });
    expect(compacted.map(({ tMs, touch }) => [tMs, touch === true])).toEqual([
      [0, true],
      [100, false],
      [200, false],
      [210, true],
      [220, false],
    ]);
    for (const time of [150, 205, 215]) {
      expect(interpolateCursor({ samples: compacted, clicks: [] }, time)).toEqual(
        interpolateCursor({ samples, clicks: [] }, time),
      );
    }
    expect(interpolateCursor({ samples: compacted, clicks: [] }, 150)).toEqual({ x: 40, y: 10 });
    expect(interpolateCursor({ samples: compacted, clicks: [] }, 205)).toEqual({ x: 40, y: 10 });
  });
  it('protects layout boundaries and equal-time clicks without mutating input', () => {
    const state = ReplayPresentationStateSchema.parse(validPresentationSample().state);
    const track: ReplayCursorTrack = {
      samples: [point(0), point(1), point(2), point(3), point(4), point(5)],
      clicks: [
        { ...point(3), type: 'ui' },
        { ...point(3, 40), type: 'red' },
      ],
      presentationSamples: [
        { tMs: 0, state },
        { tMs: 2, state: { ...state, uiScale: 2 } },
      ],
    };
    const before = structuredClone(track);
    const compacted = compactReplayCursorSamples(track);
    expect(compacted.map(({ tMs }) => tMs)).toEqual([0, 1, 2, 3, 4, 5]);
    expect(compacted.find(({ tMs }) => tMs === 2)?.breakBefore).toBe(true);
    expect(compacted.find(({ tMs }) => tMs === 3)?.pinned).toBe(true);
    expect(track).toEqual(before);
    expect(compactReplayCursorSamples({ ...track, samples: compacted })).toEqual(compacted);
  });
});
