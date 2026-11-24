import { type EncounterSnapshot, isInfernoSnapshot } from '../../core/encounters/snapshot';
import { FIRST_INFERNO_WAVE, LAST_ORDINARY_WAVE } from './constants';
import { parseSpawnLayout } from './spawnLayout';

/**
 * Practice restarts, answered by `InfernoEncounter.planPracticeRestart` rather than run in-fight:
 * each starts a fresh run with a fresh loadout and the configured pillars.
 */
export type InfernoCommand =
  /**
   * The current wave again: with this run's custom layout for it, or its spawns kept, the same run
   * seed, so its spawns repeat; otherwise a new run seed, so a random wave gets new random spawns.
   */
  | { readonly encounter: 'inferno'; readonly type: 'retry-wave' }
  /**
   * The current wave, a new run seed, no kept spawns and no custom layout for it: what turns the
   * wave back to random spawns for this run (a saved layout is kept for Go and Restart fight).
   */
  | { readonly encounter: 'inferno'; readonly type: 'reroll-wave' }
  /**
   * The current wave with the same run seed, its spawns kept for the run's later Retries: what
   * makes a random wave repeat as this attempt's did, until the run moves past it.
   */
  | { readonly encounter: 'inferno'; readonly type: 'keep-spawns' }
  /**
   * A wave the player picked in the setup, now. The number travels with the command rather than
   * being read from the mechanics config: the press that sends it also saves it, and saving goes
   * through React state, which has not landed in the engine by the time the restart runs.
   */
  | { readonly encounter: 'inferno'; readonly type: 'go-to-wave'; readonly wave: number };

/** Wave 67's one Jad stands on a fixed tile, so every attempt spawns alike. */
const SINGLE_JAD_WAVE = 67;

/** Whether Lock layout has spawns to keep: not on 67, nor on 69, whose run seed picks only a shield start. */
export function waveKeepsSpawns(wave: number): boolean {
  return wave >= FIRST_INFERNO_WAVE && wave <= LAST_ORDINARY_WAVE && wave !== SINGLE_JAD_WAVE;
}

/**
 * The restart the session bar and the Actions list offer beside Retry, read from the run, never the
 * saved setup it may not have applied: the reroll where Retry repeats the wave's spawns (Random spawns
 * on a custom layout's wave, New spawns on a locked one), Lock layout on a random wave (Retry rolls
 * new ones) that has spawns to keep. Null outside an Inferno run.
 */
export function infernoSecondaryRestart(snapshot: EncounterSnapshot | undefined): 'reroll-wave' | 'keep-spawns' | null {
  if (!snapshot || !isInfernoSnapshot(snapshot)) return null;
  const { wave, startSpawnLayout, pinnedWave } = snapshot.state;
  if (parseSpawnLayout(startSpawnLayout)?.wave === wave) return 'reroll-wave';
  if (!waveKeepsSpawns(wave)) return null;
  return pinnedWave === wave ? 'reroll-wave' : 'keep-spawns';
}

/**
 * The Actions list's copies of the session bar's restarts. Static labels, because this list is built
 * from the encounter's controls rather than from a live snapshot; the bar names the wave. Retry is
 * always listed, the other two where `infernoSecondaryRestart` picks them (`buildInfernoControls`).
 */
export const INFERNO_DEBUG_ACTIONS = [
  { command: { encounter: 'inferno', type: 'retry-wave' }, label: 'Retry Wave' },
  { command: { encounter: 'inferno', type: 'reroll-wave' }, label: 'Random Spawns' },
  { command: { encounter: 'inferno', type: 'keep-spawns' }, label: 'Lock Layout' },
] as const satisfies readonly { readonly command: InfernoCommand; readonly label: string }[];
