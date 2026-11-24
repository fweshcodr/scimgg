import { describe, expect, it } from 'vitest';
import type { EncounterSnapshot } from '../../../core/encounters/snapshot';
import type { ReplayDisplayFrame } from '../../../core/ReplayRecorder';
import { yamaSnapshot } from '../../../test/helpers/encounterSnapshot';
import { encounterReplayChapters } from '../../practiceChrome';
import { FIRST_INFERNO_WAVE, LAST_ORDINARY_WAVE, ZUK_WAVE } from '../constants';
import { type InfernoReplayChapterFrame, infernoWaveChapters } from '../replayChapters';
import type { InfernoWavePhase } from '../snapshot';
import { WAVE_MILESTONES, waveCompositionText } from '../waveInfo';

function infernoSnapshot(wave: number, phase: InfernoWavePhase): EncounterSnapshot {
  return {
    kind: 'inferno',
    state: {
      wave,
      startWave: wave,
      startDestroyedPillars: { west: false, south: false, northEast: false },
      startSpawnLayout: '',
      startPlayerTile: '',
      waveSpawnLayout: '',
      waveStartDestroyedPillars: { west: false, south: false, northEast: false },
      waveStartPlayerTile: null,
      phase,
      nextWaveTick: phase === 'countdown' ? 0 : null,
      pillars: [],
      zuk: null,
    },
    visuals: { pillarLocs: [], zukControlTick: null },
  };
}

type Segment =
  | readonly [wave: number, phase: InfernoWavePhase | 'won', frames: number]
  /** The engine was reset: the next frame is back at the first tick. */
  | 'restart';

/** Consecutive frames, one per tick, through each segment in turn. */
function run(...segments: readonly Segment[]): InfernoReplayChapterFrame[] {
  const frames: InfernoReplayChapterFrame[] = [];
  let tick = 0;
  for (const segment of segments) {
    if (segment === 'restart') {
      tick = 0;
      continue;
    }
    const [wave, phase, count] = segment;
    for (let i = 0; i < count; i++)
      frames.push({
        state: {
          currentTick: tick++,
          encounter: infernoSnapshot(wave, phase === 'won' ? 'active' : phase),
          encounterOutcome: { phase: phase === 'won' ? 'victory' : 'active' },
        },
      });
  }
  return frames;
}

const chapters = (frames: readonly InfernoReplayChapterFrame[]) => infernoWaveChapters(frames)?.chapters;

describe('infernoWaveChapters', () => {
  it('opens on wave 1 and carries each countdown into the wave it leads to', () => {
    const set = infernoWaveChapters(
      run([1, 'countdown', 3], [1, 'active', 5], [2, 'countdown', 2], [2, 'active', 4], [3, 'countdown', 1]),
    );

    expect(set?.title).toBe('Waves');
    expect(set?.chapters).toEqual([
      {
        startFrame: 0,
        endFrame: 8,
        engageFrame: 3,
        label: 'Wave 1',
        shortLabel: '1',
        detail: 'First bat (Jal-MejRah)',
        landmark: true,
        cleared: true,
        attempt: 1,
      },
      {
        startFrame: 8,
        endFrame: 14,
        engageFrame: 10,
        label: 'Wave 2',
        shortLabel: '2',
        detail: waveCompositionText(2),
        landmark: false,
        cleared: true,
        attempt: 1,
      },
      // The recording ends in the countdown: wave 3 never started, let alone finished.
      {
        startFrame: 14,
        endFrame: 15,
        label: 'Wave 3',
        shortLabel: '3',
        detail: waveCompositionText(3),
        landmark: false,
        cleared: false,
        attempt: 1,
      },
    ]);
  });

  it('opens on the wave a run was started at', () => {
    const [first, second] = chapters(run([35, 'countdown', 2], [35, 'active', 3], [36, 'countdown', 1])) ?? [];

    expect(first).toMatchObject({ startFrame: 0, engageFrame: 2, endFrame: 5, label: 'Wave 35', cleared: true });
    expect(first?.landmark).toBe(true);
    expect(first?.detail).toBe('First mager (Jal-Zek)');
    expect(second).toMatchObject({ startFrame: 5, label: 'Wave 36', cleared: false, attempt: 1 });
  });

  it('counts a retry of the same wave as a new attempt, and the abandoned one as not cleared', () => {
    const result = chapters(
      run([5, 'countdown', 2], [5, 'active', 4], 'restart', [5, 'countdown', 2], [5, 'active', 3]),
    );

    expect(result).toMatchObject([
      { label: 'Wave 5', startFrame: 0, engageFrame: 2, endFrame: 6, cleared: false, attempt: 1 },
      { label: 'Wave 5', startFrame: 6, engageFrame: 8, endFrame: 11, cleared: false, attempt: 2 },
    ]);
  });

  it('treats a retry made during the countdown as a restart too', () => {
    const result = chapters(run([5, 'countdown', 3], 'restart', [5, 'countdown', 2], [5, 'active', 1]));

    expect(result).toMatchObject([
      { startFrame: 0, endFrame: 3, cleared: false, attempt: 1 },
      { startFrame: 3, engageFrame: 5, endFrame: 6, attempt: 2 },
    ]);
    expect(result?.[0]).not.toHaveProperty('engageFrame');
  });

  it('treats a wave dropping back from its fight to its own countdown as a restart', () => {
    const frames = run([12, 'countdown', 1], [12, 'active', 2], [12, 'countdown', 1], [12, 'active', 1]);

    expect(chapters(frames)).toMatchObject([
      { startFrame: 0, endFrame: 3, cleared: false, attempt: 1 },
      { startFrame: 3, engageFrame: 4, endFrame: 5, attempt: 2 },
    ]);
  });

  it('does not count a jump to another wave as a clear, even to the next one', () => {
    const jumps: Segment[] = [[10, 'countdown', 1], [10, 'active', 2], 'restart'];
    jumps.push([40, 'countdown', 1], [40, 'active', 2], 'restart', [41, 'countdown', 1]);
    const result = chapters(run(...jumps));

    expect(result?.map(({ label, cleared, attempt }) => ({ label, cleared, attempt }))).toEqual([
      { label: 'Wave 10', cleared: false, attempt: 1 },
      { label: 'Wave 40', cleared: false, attempt: 1 },
      { label: 'Wave 41', cleared: false, attempt: 1 },
    ]);
  });

  it('marks the last wave cleared when the run is won, and keeps the finish inside it', () => {
    const frames = run(
      [LAST_ORDINARY_WAVE, 'active', 2],
      [ZUK_WAVE, 'countdown', 2],
      [ZUK_WAVE, 'active', 3],
      [ZUK_WAVE, 'won', 4],
    );

    expect(chapters(frames)).toMatchObject([
      { label: `Wave ${LAST_ORDINARY_WAVE}`, cleared: true },
      { label: `Wave ${ZUK_WAVE}`, startFrame: 2, engageFrame: 4, endFrame: frames.length, cleared: true },
    ]);
  });

  it('leaves a wave the recording ends in, or the player dies in, uncleared', () => {
    expect(chapters(run([20, 'countdown', 2], [20, 'active', 9]))).toMatchObject([
      { label: 'Wave 20', endFrame: 11, cleared: false },
    ]);
  });

  it('has no lead-in when the recording opens mid-fight, as a clip can', () => {
    const [first] = chapters(run([30, 'active', 3], [31, 'countdown', 1])) ?? [];

    expect(first).toMatchObject({ startFrame: 0, endFrame: 3, cleared: true });
    expect(first).not.toHaveProperty('engageFrame');
  });

  it('flags exactly the milestone waves as landmarks', () => {
    const segments: Segment[] = [];
    for (let wave = FIRST_INFERNO_WAVE; wave <= LAST_ORDINARY_WAVE; wave++) segments.push([wave, 'active', 1]);
    const result = chapters(run(...segments)) ?? [];
    const milestoneWaves = new Set(WAVE_MILESTONES.map((milestone) => milestone.wave));

    expect(result).toHaveLength(LAST_ORDINARY_WAVE - FIRST_INFERNO_WAVE + 1);
    for (const [index, chapter] of result.entries()) {
      const wave = FIRST_INFERNO_WAVE + index;
      expect(chapter.landmark, `wave ${wave}`).toBe(milestoneWaves.has(wave));
      if (!milestoneWaves.has(wave)) expect(chapter.detail).toBe(waveCompositionText(wave));
    }
    expect(result.at(-1)?.detail).toBe('Only wave with 3 Jads');
    expect(result.find((chapter) => chapter.label === 'Wave 67')?.detail).toBe('First Jad (JalTok-Jad)');
  });

  it('keeps chapters contiguous across frames that carry no Inferno snapshot', () => {
    const frames = run([1, 'countdown', 2], [1, 'active', 2], [2, 'countdown', 1]);
    const mixed: InfernoReplayChapterFrame[] = [
      { state: { currentTick: -1, encounter: yamaSnapshot() } },
      ...frames.slice(0, 3),
      { state: { currentTick: 3, encounter: yamaSnapshot() } },
      ...frames.slice(3),
    ];

    expect(chapters(mixed)).toMatchObject([
      { label: 'Wave 1', startFrame: 1, engageFrame: 3, endFrame: 6 },
      { label: 'Wave 2', startFrame: 6, endFrame: 7 },
    ]);
  });

  it('names no chapters for a recording without an Inferno snapshot', () => {
    expect(infernoWaveChapters([])).toBeNull();
    expect(infernoWaveChapters([{ state: { currentTick: 0, encounter: yamaSnapshot() } }])).toBeNull();
  });
});

describe('encounterReplayChapters', () => {
  // The registry hands over the recorder's display frames; the derivation reads only their state.
  const frames = run([1, 'countdown', 1], [1, 'active', 1]) as unknown as readonly ReplayDisplayFrame[];

  it('derives chapters for the recording’s own encounter and none for others', () => {
    expect(encounterReplayChapters('inferno', frames)?.chapters).toHaveLength(1);
    expect(encounterReplayChapters('sol_heredit', frames)).toBeNull();
    // A recording of the retired `zuk` kind belongs to the Inferno, but its frames carry the Zuk
    // snapshot, so it has no wave chapters.
    expect(encounterReplayChapters('zuk', [])).toBeNull();
    expect(encounterReplayChapters(undefined, frames)).toBeNull();
  });
});
