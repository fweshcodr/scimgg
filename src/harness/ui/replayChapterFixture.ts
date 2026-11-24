/**
 * Dev-only replay chapter sets for the UI harness (`?replayChapters=`).
 *
 * A real 69-wave Inferno recording needs the OSRS cache and an hour of fight, which the harness
 * mounts no renderer for and the browser-reach limit forbids driving. So the frames are synthesized
 * and handed to the encounter's OWN derivation (`infernoWaveChapters`), which means the
 * labels, details, landmarks and cleared flags under review are the ones a real recording produces,
 * not a hand-written imitation of them.
 */
import type { InfernoSnapshot } from '../../core/encounters/snapshot';
import type { ReplayChapterSet } from '../../core/replayTimeline';
import { FIRST_INFERNO_WAVE, ZUK_WAVE } from '../../encounters/inferno/constants';
import { type InfernoReplayChapterFrame, infernoWaveChapters } from '../../encounters/inferno/replayChapters';
import type { InfernoWavePhase } from '../../encounters/inferno/snapshot';

/** Which fixture `?replayChapters=` names. */
export type ReplayChapterFixture = 'full' | 'practice';

export const REPLAY_CHAPTER_FIXTURES: readonly ReplayChapterFixture[] = ['full', 'practice'];

export function isReplayChapterFixture(value: string | null): value is ReplayChapterFixture {
  return value !== null && (REPLAY_CHAPTER_FIXTURES as readonly string[]).includes(value);
}

/** Spelled out, with no cast, so a change to the real payload fails here rather than drifting. */
function snapshot(wave: number, phase: InfernoWavePhase): InfernoSnapshot {
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

/**
 * Frames for `waves`, each a countdown then a fight. Later waves run longer, as they do in the
 * game, so the rail's boundaries bunch at the start exactly as a real run's do: that crowding is
 * the thing the rail's thinning has to survive.
 */
function waveFrames(waves: readonly number[], finishLast: boolean): InfernoReplayChapterFrame[] {
  const frames: InfernoReplayChapterFrame[] = [];
  let tick = 0;
  const push = (wave: number, phase: InfernoWavePhase, count: number, won = false) => {
    for (let index = 0; index < count; index++)
      frames.push({
        state: {
          currentTick: tick++,
          encounter: snapshot(wave, phase),
          ...(won ? { encounterOutcome: { phase: 'victory' } } : {}),
        },
      });
  };
  waves.forEach((wave, index) => {
    push(wave, 'countdown', 4);
    push(wave, 'active', 12 + Math.round(wave * 0.9));
    // The run stops inside the last wave unless it is finished, which is what a death looks like.
    if (index === waves.length - 1 && finishLast) push(wave, 'active', 2, true);
  });
  return frames;
}

/**
 * A whole run (wave 1 to 69, Zuk cleared) or a practice recording that starts at wave 35 and dies on
 * wave 37. Returns the chapter set and the frame count it was derived from, which the bar needs as
 * its `totalFrames`.
 */
export function replayChapterFixture(
  fixture: ReplayChapterFixture,
): { readonly chapters: ReplayChapterSet; readonly totalFrames: number } | null {
  const waves =
    fixture === 'full'
      ? Array.from({ length: ZUK_WAVE - FIRST_INFERNO_WAVE + 1 }, (_, index) => FIRST_INFERNO_WAVE + index)
      : [35, 36, 37];
  const frames = waveFrames(waves, fixture === 'full');
  const chapters = infernoWaveChapters(frames);
  return chapters ? { chapters, totalFrames: frames.length } : null;
}
