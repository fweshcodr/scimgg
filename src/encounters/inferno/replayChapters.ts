/**
 * An Inferno replay's waves as chapters, so an hour-long run can be navigated by wave rather than
 * by tick. Read entirely from the recorded snapshots: one pass, never per playback tick.
 *
 * The snapshot's `wave` moves to N+1 the tick wave N is cleared, during the countdown before N+1
 * spawns, so chapter N is its countdown lead-in followed by the fight. A jump to a chapter lands
 * on the start of that lead-in.
 */
import type { EncounterSnapshot } from '../../core/encounters/snapshot';
import { isInfernoSnapshot } from '../../core/encounters/snapshot';
import type { ReplayChapter, ReplayChapterSet } from '../../core/replayTimeline';
import type { InfernoWavePhase } from './snapshot';
import { WAVE_MILESTONES, WAVE_NPC_NAMES, type WaveMilestone, waveCompositionText } from './waveInfo';

/** The part of a replay frame chapters are read from. */
export interface InfernoReplayChapterFrame {
  readonly state: {
    readonly currentTick: number;
    readonly encounter: EncounterSnapshot;
    /** The run's outcome; it leaves `active` only when TzKal-Zuk falls. */
    readonly encounterOutcome?: { readonly phase: string };
  };
}

/** The first milestone each landmark wave stands for, in the order the Inferno introduces them. */
const MILESTONE_BY_WAVE: ReadonlyMap<number, WaveMilestone> = WAVE_MILESTONES.reduce(
  (byWave, milestone) => (byWave.has(milestone.wave) ? byWave : byWave.set(milestone.wave, milestone)),
  new Map<number, WaveMilestone>(),
);

function milestoneDetail({ kind, count }: WaveMilestone): string {
  const names = WAVE_NPC_NAMES[kind];
  return count === 1 ? `First ${names.one} (${names.game})` : `Only wave with ${count} ${names.many}`;
}

interface OpenChapter {
  readonly wave: number;
  readonly startFrame: number;
  readonly startedActive: boolean;
  engageFrame?: number;
  /** The run was won: TzKal-Zuk, wave 69, fell. */
  completed: boolean;
}

/**
 * Chapters for every wave the recording shows, or null when no frame carries an Inferno snapshot.
 *
 * A chapter starts at the first Inferno frame, whenever the wave changes, and whenever the same
 * wave starts over. A wave is cleared when the next chapter is the following wave reached in the
 * same run, or when the run is won (Zuk's wave).
 *
 * Starting over is read from the tick: every practice restart (Retry, New layout, Go to wave)
 * resets the engine, which begins again at the first tick, and nothing else moves a recording's
 * tick backwards. Today those restarts also start a fresh recording, so a recording holds one run;
 * the rule keeps chapters honest if a recording ever spans restarts. A wave going back from
 * fighting to its own countdown is also treated as a restart, since a clear always moves the wave
 * on.
 */
export function infernoWaveChapters(frames: readonly InfernoReplayChapterFrame[]): ReplayChapterSet | null {
  const chapters: ReplayChapter[] = [];
  const attempts = new Map<number, number>();
  let open: OpenChapter | null = null;
  let previous: { readonly wave: number; readonly phase: InfernoWavePhase; readonly tick: number } | null = null;

  const close = (chapter: OpenChapter, endFrame: number, advanced: boolean): void => {
    const attempt = (attempts.get(chapter.wave) ?? 0) + 1;
    attempts.set(chapter.wave, attempt);
    const milestone = MILESTONE_BY_WAVE.get(chapter.wave);
    const detail = milestone ? milestoneDetail(milestone) : waveCompositionText(chapter.wave);
    chapters.push({
      startFrame: chapter.startFrame,
      endFrame,
      ...(chapter.engageFrame === undefined ? {} : { engageFrame: chapter.engageFrame }),
      label: `Wave ${chapter.wave}`,
      shortLabel: String(chapter.wave),
      ...(detail ? { detail } : {}),
      landmark: milestone !== undefined,
      cleared: advanced || chapter.completed,
      attempt,
    });
  };

  for (let index = 0; index < frames.length; index++) {
    const snapshot = frames[index].state.encounter;
    if (!isInfernoSnapshot(snapshot)) continue;
    const { wave, phase } = snapshot.state;
    const tick = frames[index].state.currentTick;
    if (open === null || previous === null) {
      open = { wave, startFrame: index, startedActive: phase === 'active', completed: false };
    } else {
      const restarted =
        tick < previous.tick || (wave === previous.wave && previous.phase !== 'countdown' && phase === 'countdown');
      if (restarted || wave !== previous.wave) {
        close(open, index, !restarted && wave === previous.wave + 1);
        open = { wave, startFrame: index, startedActive: phase === 'active', completed: false };
      }
    }
    if (phase === 'active' && !open.startedActive && open.engageFrame === undefined) open.engageFrame = index;
    if (frames[index].state.encounterOutcome !== undefined && frames[index].state.encounterOutcome?.phase !== 'active')
      open.completed = true;
    previous = { wave, phase, tick };
  }

  if (open === null) return null;
  close(open, frames.length, false);
  return { title: 'Waves', chapters };
}
