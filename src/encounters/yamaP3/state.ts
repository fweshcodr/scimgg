import { ACTIVE_ENCOUNTER_OUTCOME, type EncounterOutcome } from '../../core/encounters/outcome';
import { mulberry32 } from '../../core/rng';
import { voidFlareHash } from '../../npcs/yama/timing';
import type { VoidFlareImpact } from '../../npcs/yama/voidFlare';
import type { Coordinate } from '../../types/simulation';
import { type FireballAngle, VOID_FLARE_SPAWN_POSITIONS } from './constants';
import type { ResolvedYamaEncounterConfig } from './contractConfig';
import type { FireballBurstShape } from './fireball';

export type YamaSeedPayload = {
  readonly encounterSeed: number;
  readonly fireballSeed: number;
  readonly voidFlareSeed: number;
  readonly firstRangeMageType: 'magic' | 'range';
};

export type YamaStateInitialization =
  | { readonly source: 'constructor'; readonly encounterSeed?: number }
  | { readonly source: 'reset'; readonly seeds?: Record<string, unknown> };

export type YamaStateConfig = {
  readonly waves: ResolvedYamaEncounterConfig['waves'];
};

type PendingFireballSpawn = {
  readonly startTick: number;
  readonly instanceId: number;
  readonly center: Coordinate;
};

type ManualFireball = {
  readonly startTick: number;
  readonly angle: FireballAngle;
};

export type YamaFireballState = {
  readonly seed: number;
  readonly startPositions: Map<number, Coordinate>;
  pendingSpawnEvents: PendingFireballSpawn[];
  readonly impactDealt: Set<number>;
  readonly impactEmitted: Set<number>;
  readonly explosionDealt: Set<number>;
  readonly registeredIds: Set<number>;
  readonly burstShapes: Map<number, FireballBurstShape>;
  readonly perfectDodgeTriggered: Set<number>;
  /**
   * The single tick after a perfect dodge on which shadow waves deal no damage (and so show no
   * hitsplat). Community-reported mechanic, not packet-verified; see `resolveFireballHazards`.
   */
  shadowWaveImmunityTick: number | null;
  readonly manual: Map<number, ManualFireball>;
  manualNextId: number;
  manualBurstCount: number;
};

/** One flare to spawn, with its own fuse. */
export type VoidFlareSpawn = { readonly chargeTicks: number; readonly hp: number };

export type VoidFlareEncounterState = {
  readonly seed: number;
  spawnIndex: number;
  nextId: number;
  /** Decided on a beat or melee swing; spawned with the swing on the next tick. */
  pendingSpawns: VoidFlareSpawn[];
  pendingImpacts: VoidFlareImpact[];
};

export type YamaSimulationState = {
  readonly run: {
    readonly encounterSeed: number;
    readonly waveConfig: ResolvedYamaEncounterConfig['waves'];
    readonly pursuitRng: () => number;
    /**
     * Deliberately NOT `SimulationEngine.rollCombat`, which every other damage roll uses: a
     * swing landing or missing would then consume draws from the same stream the player's
     * rolls take, and a takeover that resumes on a different attack cadence desyncs every
     * later roll in the fight.
     */
    readonly accuracyRng: () => number;
    openingStyleSeed: 'magic' | 'range';
  };
  readonly fireballs: YamaFireballState;
  readonly voidFlares: VoidFlareEncounterState;
  readonly lifecycle: {
    defeated: boolean;
    outcome: EncounterOutcome;
  };
};

function isValidUint32(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0 && value <= 0xffffffff;
}

function randomFirstRangeMageType(seed: number): 'magic' | 'range' {
  const rng = mulberry32(seed ^ 0xa5a5a5a5);
  return rng() < 0.5 ? 'magic' : 'range';
}

function randomFireballSeed(seed: number): number {
  const rng = mulberry32(seed ^ 0xc3ef3720);
  return Math.floor(rng() * 0x100000000) >>> 0;
}

export function createYamaSimulationState(
  config: YamaStateConfig,
  initialization: YamaStateInitialization,
): YamaSimulationState {
  const seeds = initialization.source === 'reset' ? initialization.seeds : undefined;
  const encounterSeed =
    initialization.source === 'constructor'
      ? (initialization.encounterSeed ?? Math.floor(Math.random() * 0xffffffff))
      : isValidUint32(seeds?.encounterSeed)
        ? seeds.encounterSeed
        : Math.floor(Math.random() * 0xffffffff);
  const firstRangeMageType =
    initialization.source === 'reset' &&
    (seeds?.firstRangeMageType === 'magic' || seeds?.firstRangeMageType === 'range')
      ? seeds.firstRangeMageType
      : randomFirstRangeMageType(encounterSeed);
  const fireballSeed =
    initialization.source === 'reset' && isValidUint32(seeds?.fireballSeed)
      ? seeds.fireballSeed
      : randomFireballSeed(encounterSeed);
  const voidFlareSeed =
    initialization.source === 'reset' && isValidUint32(seeds?.voidFlareSeed)
      ? seeds.voidFlareSeed
      : voidFlareHash(fireballSeed, encounterSeed ^ 0x9e3779b9);

  return {
    run: {
      encounterSeed,
      waveConfig: { ...config.waves, seed: voidFlareHash(encounterSeed, 0x57415645) },
      pursuitRng: mulberry32(voidFlareHash(encounterSeed, 0x50555253)),
      accuracyRng: mulberry32(voidFlareHash(encounterSeed, 0x41434355)),
      openingStyleSeed: firstRangeMageType,
    },
    fireballs: {
      seed: fireballSeed,
      startPositions: new Map(),
      pendingSpawnEvents: [],
      impactDealt: new Set(),
      impactEmitted: new Set(),
      explosionDealt: new Set(),
      registeredIds: new Set(),
      burstShapes: new Map(),
      perfectDodgeTriggered: new Set(),
      shadowWaveImmunityTick: null,
      manual: new Map(),
      manualNextId: 0,
      manualBurstCount: 0,
    },
    voidFlares: {
      seed: voidFlareSeed,
      spawnIndex: voidFlareSeed % VOID_FLARE_SPAWN_POSITIONS.length,
      nextId: 0,
      pendingSpawns: [],
      pendingImpacts: [],
    },
    lifecycle: { defeated: false, outcome: ACTIVE_ENCOUNTER_OUTCOME },
  };
}

export function toYamaSeedPayload(state: YamaSimulationState): YamaSeedPayload {
  return {
    encounterSeed: state.run.encounterSeed,
    fireballSeed: state.fireballs.seed,
    voidFlareSeed: state.voidFlares.seed,
    firstRangeMageType: state.run.openingStyleSeed,
  };
}
