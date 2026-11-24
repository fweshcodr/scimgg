/**
 * Ordinary-wave (1-68) NPC surface for the Inferno encounter. The encounter owns spawn layout,
 * pillar proxies, the corpse ledger, wave completion and the actual spawns; these definitions own each
 * species' behavior. Evidence: docs/encounters/inferno-facts-spec.md; simulator policy:
 * docs/encounters/inferno-policy.md.
 *
 * Wiring, per tick:
 * - `removeNpcIfDue` (each NPC's own turn): `removeInfernoNpcIfDue`, its `addSplit` spawning each split
 *   with `createInfernoWaveNpc(split.species, { ..., spawnTick: tick, origin: 'split' })`.
 * - `moveNpc` / `processNpcTick`: forward to the collection built from `registerInfernoWaveDefinitions`
 *   plus the encounter's own `jadDefinition` / `jadHealerDefinition` registrations, shared with wave 69
 *   (`LIVE_JAD_EXECUTION` with each ordinary Jad's own opening from `INFERNO_WAVE_JAD_SCHEDULE`).
 * - Engine rules: `onPlayerDamageTaken: jalMejRahDrainEffect` (bat run-energy and stat drain).
 */
import type { NpcActor } from '../../core/actors/NpcActor';
import type { ActorId } from '../../core/actors/types';
import type { NpcDefinitionContext, NpcDefinitionRegistration } from '../../core/npcs';
import type { Coordinate } from '../../types/simulation';
import type { InfernoWaveSpecies } from './actors';
import { batDefinition, createBat } from './bat';
import {
  blobDefinition,
  createBlob,
  createSplitBlob,
  isBlob,
  type SplitBlobSpawn,
  splitBlobDefinition,
  splitBlobSpawns,
} from './blob';
import { INFERNO_WAVE_NPC_IDS } from './constants';
import { jadDefinition, removeJadIfDue } from './jad';
import { createMeleer, meleerDefinition } from './meleer';
import { createNibbler, type NibblerConfig, nibblerDefinition } from './nibbler';
import type { MagerResurrection } from './resurrection';
import { createMager, createRanger, magerDefinition, rangerDefinition } from './setMonsters';

export { jalMejRahDrainEffect } from './bat';
export { SPLIT_BLOB_OFFSETS, type SplitBlobSpawn, type SplitBlobSpecies, splitBlobSpawns } from './blob';
export { INFERNO_WAVE_NPC_IDS, INFERNO_WAVE_SEQS, INFERNO_WAVE_SPOT_ANIM_IDS } from './constants';
export {
  createJad,
  INFERNO_WAVE_JAD_SCHEDULE,
  jadDefinition,
  LIVE_JAD_EXECUTION,
  ORDINARY_JAD_EXECUTION,
} from './jad';
export { createJadHealer, jadHealerDefinition } from './jadHealer';
export type { NibblerConfig } from './nibbler';
export {
  type InfernoCorpse,
  type MagerResurrection,
  type ResurrectableSpecies,
  resurrectableSpecies,
} from './resurrection';

/** Species `createInfernoWaveNpc` builds; Jads and their healers use `createJad` / `createJadHealer`. */
export type InfernoWaveNpcSpecies = InfernoWaveSpecies | 'ranger' | 'mager';

/**
 * How the NPC entered the wave: a resurrection revives at half HP, acts no earlier than add+4 and
 * (a meleer) digs first at add+49.
 */
export type InfernoWaveSpawnOrigin = 'wave' | 'split' | 'resurrection';

export type InfernoWaveSpawnOptions = {
  readonly id: ActorId;
  /** SW tile, simulation (= map-square local) coordinates. */
  readonly position: Coordinate;
  /**
   * The add tick. Added during the NPC turns (a split, a resurrection), it takes an ordinary first step
   * that tick; added by the wave spawn after them, it first moves next tick (engine rule).
   */
  readonly spawnTick: number;
  /** Combat target, normally the player's id. Nibblers ignore it and pick a pillar. */
  readonly targetId: ActorId | null;
  readonly origin?: InfernoWaveSpawnOrigin;
};

// Ticks from the death sequence to removal, every matched death in P+Q (facts spec, NPCs table).
// JalTok-Jad's +6 lives in `jad.ts`; Yt-HurKot are removed with their Jad.
export const INFERNO_REMOVAL_DELAY_TICKS: Readonly<Record<number, number>> = {
  [INFERNO_WAVE_NPC_IDS.nibbler]: 2,
  [INFERNO_WAVE_NPC_IDS.bat]: 2,
  [INFERNO_WAVE_NPC_IDS.blob]: 2,
  [INFERNO_WAVE_NPC_IDS.blob_mage]: 2,
  [INFERNO_WAVE_NPC_IDS.blob_range]: 2,
  [INFERNO_WAVE_NPC_IDS.blob_melee]: 3,
  [INFERNO_WAVE_NPC_IDS.meleer]: 5,
  [INFERNO_WAVE_NPC_IDS.ranger]: 4,
  [INFERNO_WAVE_NPC_IDS.mager]: 2,
};

export type InfernoRemoval = {
  readonly actorId: ActorId;
  readonly npcTypeId: number;
  /** A Jal-Ak's three children, added before it left (P:2484-2540). Empty for every other NPC. */
  readonly splits: readonly SplitBlobSpawn[];
};

/**
 * Removes a dead ordinary-wave NPC (or a Jad, with his healers) once its removal delay has passed since
 * its death sequence started. The encounter calls it at the start of the NPC's own turn
 * (`Encounter.removeNpcIfDue`), as wave 69 does for Jad. A Jal-Ak's children are added through
 * `addSplit`, in order, BEFORE the parent leaves: its removal then clears its whole 3x3 of collision
 * flags, the children's birth tiles included (198/198 captured child add tiles reproduced). Returns what
 * was removed, or null.
 */
export function removeInfernoNpcIfDue(
  actor: NpcActor,
  context: Pick<NpcDefinitionContext, 'tick' | 'despawnNpc'>,
  addSplit?: (split: SplitBlobSpawn) => void,
): InfernoRemoval | null {
  if (jadDefinition.isActor(actor)) {
    return removeJadIfDue(actor, context) ? { actorId: actor.id, npcTypeId: actor.npcTypeId, splits: [] } : null;
  }
  const delay = INFERNO_REMOVAL_DELAY_TICKS[actor.npcTypeId];
  if (delay === undefined || actor.death?.status !== 'started' || actor.deathAnimationTick === undefined) return null;
  if (context.tick < actor.deathAnimationTick + delay) return null;
  const splits = isBlob(actor) ? splitBlobSpawns(actor) : [];
  if (addSplit) for (const split of splits) addSplit(split);
  context.despawnNpc(actor.id);
  return { actorId: actor.id, npcTypeId: actor.npcTypeId, splits };
}

export function createInfernoWaveNpc(species: InfernoWaveNpcSpecies, options: InfernoWaveSpawnOptions): NpcActor {
  const actor = createWaveSpecies(species, options);
  if (options.origin === 'resurrection') {
    // floor(maxHp / 2) + 1: replaying every captured revival's splats (with regeneration) ends at 0 HP
    // for all of them, including the even maxima ceil(maxHp / 2) misses (P t4931 blob 21, Q t4701 mager
    // 111); bat 13 and meleer 38 fit either.
    actor.vitals.hp = Math.floor(actor.vitals.maxHp / 2) + 1;
  }
  return actor;
}

// Revived attack delay (docs/encounters/inferno-policy.md): captures bound the gate to add+4..add+7;
// +4 is simulator policy within that bound. It still takes an ordinary first step in its add tick
// (engine rule: it is added during the NPC turns); a blob reads at +4 and first releases at +7.
const REVIVED_FIRST_ACTION_TICKS = 4;

function createWaveSpecies(species: InfernoWaveNpcSpecies, options: InfernoWaveSpawnOptions): NpcActor {
  const { id, position, spawnTick, targetId } = options;
  const revived = options.origin === 'resurrection';
  const revivedDelay = revived ? { initialDelayTicks: REVIVED_FIRST_ACTION_TICKS } : {};
  switch (species) {
    case 'nibbler':
      return createNibbler({ id, position, spawnTick });
    case 'bat':
      return createBat({ id, position, spawnTick, targetId, ...revivedDelay });
    case 'blob':
      return createBlob({ id, position, spawnTick, targetId, ...revivedDelay });
    case 'blob_mage':
    case 'blob_range':
    case 'blob_melee':
      return createSplitBlob({ id, position, spawnTick, targetId, species });
    case 'meleer':
      return createMeleer({ id, position, spawnTick, targetId, resurrected: revived, ...revivedDelay });
    case 'ranger':
      return createRanger({
        variant: 'ordinary',
        id,
        position,
        spawnTick,
        initialTargetId: targetId,
        initialDelayTicks: revived ? REVIVED_FIRST_ACTION_TICKS : 1,
      });
    case 'mager':
      // Reach 15 (facts spec, Jal-Zek).
      return createMager({
        variant: 'ordinary',
        id,
        position,
        spawnTick,
        initialTargetId: targetId,
        initialDelayTicks: revived ? REVIVED_FIRST_ACTION_TICKS : 1,
        attackRange: 15,
      });
    default:
      return assertNever(species);
  }
}

export type InfernoWaveDefinitionDependencies = NibblerConfig & {
  readonly resurrection: MagerResurrection;
};

/** Registrations for every ordinary-wave species except Jad and Yt-HurKot (the encounter registers those). */
export function registerInfernoWaveDefinitions(
  dependencies: InfernoWaveDefinitionDependencies,
): readonly NpcDefinitionRegistration[] {
  return [
    nibblerDefinition.register({ getWaveTarget: dependencies.getWaveTarget }),
    batDefinition.register(undefined),
    blobDefinition.register(undefined),
    splitBlobDefinition.register(undefined),
    meleerDefinition.register(undefined),
    rangerDefinition.register(undefined),
    magerDefinition.register({ resurrection: dependencies.resurrection }),
  ];
}

function assertNever(value: never): never {
  throw new TypeError(`Unknown Inferno wave species: ${String(value)}`);
}
