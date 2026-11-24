import { getArenaAllowUnboundedFallback, getArenaConfig, setArenaConfig } from '../core/constants';
import {
  assertReplayTakeoverBootstrap,
  type EngineRunBootstrap,
  type EngineRunConfig,
  resolveRunBootstrap,
} from '../core/engineRunConfig';
import type { ReplayFrame } from '../core/ReplayRecorder';
import { ReplaySafetyError } from '../core/replaySafety';
import { ReplayTakeoverWork } from '../core/replayTakeover';
import { SimulationEngine } from '../core/SimulationEngine';
import type { ObjTypeLoader } from '../rs/config/objtype/ObjTypeLoader';
import type { PlayerEquipment } from '../rs/model/PlayerModelLoader';
import type { CombatSupplies } from '../types/encounterLoadout';
import type { Inventory } from '../types/inventory';
import type { PlayerStats } from '../types/playerState';
import type { MechanicsConfig } from '../types/simulation';
import { log } from '../util/Logger';
import { encounterRegistry } from './registry';

export type EncounterSetupConfig<Options extends Record<string, unknown> = Record<string, unknown>> = {
  readonly kind: string;
  readonly options?: Options;
  readonly mechanics: Readonly<Partial<MechanicsConfig>>;
};

/**
 * The two ways a `SimulationEngine` is born — starting a fight, and rebuilding a recorded one —
 * share a body here so they cannot drift apart.
 *
 * Anything a new run configures must be configured for a reconstruction too, which is what
 * routing both through {@link instantiate} enforces.
 *
 * This lives outside `src/core` because construction needs the POPULATED registry, and core
 * must not import the concrete encounters that populate it — the engine module is itself
 * imported by those encounters.
 */
export interface SimulationEngineBuildInput {
  readonly encounterConfig: EncounterSetupConfig;
  readonly objTypeLoader?: ObjTypeLoader | null;
  readonly enableIntro: boolean;
  readonly stats: PlayerStats;
  readonly startHp?: number;
  readonly inventory: Inventory;
  readonly equipment: PlayerEquipment;
  readonly combatSupplies: CombatSupplies;
  readonly attackStylePerCategory: Record<string, number>;
  readonly startPosition?: readonly [number, number];
  readonly combatSeed?: number;
}

function instantiate(
  input: SimulationEngineBuildInput,
  seeds?: Record<string, unknown>,
  replayTakeoverWork?: ReplayTakeoverWork,
): SimulationEngine {
  const { kind, options, mechanics } = input.encounterConfig;
  const encounter = encounterRegistry.create(kind, options);
  if (seeds !== undefined) encounter.reset(seeds);
  const engine = new SimulationEngine({
    replayTakeoverWork,
    encounter,
    objTypeLoader: input.objTypeLoader ?? undefined,
    enableIntro: input.enableIntro,
    stats: input.stats,
    // At construction, so the world opens the configured run setup (and its start tile).
    mechanics: { ...mechanics },
    ...(input.startHp === undefined ? {} : { startHp: input.startHp }),
    ...(options === undefined ? {} : { encounterConfig: options }),
    ...(input.startPosition === undefined ? {} : { startPos: [...input.startPosition] as [number, number] }),
    ...(input.combatSeed === undefined ? {} : { combatSeed: input.combatSeed }),
  });
  // Before the loadout: `setEquipment` resolves the attack style for the weapon it installs,
  // and reads the per-category map to do it.
  engine.setAttackStylePerCategory(input.attackStylePerCategory);
  engine.setMechanicsConfig(mechanics);
  engine.setInventory(input.inventory);
  engine.setEquipment(input.equipment);
  engine.setCombatSupplies(input.combatSupplies);
  return engine;
}

export function createSimulationEngineForNewRun(input: SimulationEngineBuildInput): SimulationEngine {
  return instantiate(input);
}

/**
 * Rebuild the engine a recording started from, ready to replay its frames.
 *
 * Returns null when the recording has no reconstruction bootstrap or carries one this engine
 * cannot read — callers must treat that as "takeover unavailable" rather than falling back to a
 * hand-built engine, which would resume a fight in the wrong state.
 *
 * Auto-Prepot is applied only if the recorded run applied it. The live path calls it from the
 * wiring rather than from construction, so mirroring the recorded flag is what keeps the two in
 * step without this factory having to assume anything about its callers.
 */
export function createSimulationEngineFromRunConfig(
  runConfig: EngineRunConfig,
  objTypeLoader: ObjTypeLoader | null,
  replayTakeoverWork?: ReplayTakeoverWork,
): SimulationEngine | null {
  assertReplayTakeoverBootstrap(runConfig.bootstrap);
  const bootstrap: EngineRunBootstrap | null = resolveRunBootstrap(runConfig);
  if (!bootstrap) return null;

  try {
    return rebuild(runConfig, bootstrap, objTypeLoader, replayTakeoverWork);
  } catch (error) {
    if (error instanceof ReplaySafetyError) throw error;
    // The schema in `engineRunConfig` passes the bootstrap's leaves (stats, inventory, equipment,
    // supplies) through without checking their contents, so a malformed one, such as a `baseStats`
    // missing a skill, throws here rather than failing to parse. The caller's contract is already
    // "null means it cannot be rebuilt".
    log.warn('Replay', 'Take Over could not rebuild the recorded engine', { error });
    return null;
  }
}

function rebuild(
  runConfig: EngineRunConfig,
  bootstrap: EngineRunBootstrap,
  objTypeLoader: ObjTypeLoader | null,
  replayTakeoverWork?: ReplayTakeoverWork,
): SimulationEngine {
  const engine = instantiate(
    {
      encounterConfig: {
        kind: runConfig.encounter.kind,
        ...(bootstrap.encounterConfig === undefined ? {} : { options: bootstrap.encounterConfig }),
        mechanics: bootstrap.mechanicsConfig,
      },
      objTypeLoader,
      enableIntro: bootstrap.enableIntro,
      stats: bootstrap.baseStats,
      ...(bootstrap.startHp === undefined ? {} : { startHp: bootstrap.startHp }),
      inventory: bootstrap.inventory,
      equipment: bootstrap.equipment,
      combatSupplies: bootstrap.combatSupplies,
      attackStylePerCategory: bootstrap.attackStylePerCategory,
      startPosition: bootstrap.startPosition,
      combatSeed: bootstrap.combatSeed,
    },
    runConfig.encounter.seeds,
    replayTakeoverWork,
  );
  engine.setCompletionOwnership(runConfig.completionOwnership);
  if (bootstrap.prepotApplied) engine.applyPrepotEffects();
  return engine;
}

export function reconstructReplayPrefix(
  runConfig: EngineRunConfig,
  frames: readonly ReplayFrame[],
  throughFrameIndex: number,
  objTypeLoader: ObjTypeLoader | null,
  work = new ReplayTakeoverWork(),
): SimulationEngine | null {
  work.checkPrefix(frames, throughFrameIndex);
  assertReplayTakeoverBootstrap(runConfig.bootstrap);
  const arena = getArenaConfig();
  const allowUnbounded = getArenaAllowUnboundedFallback();
  try {
    const engine = createSimulationEngineFromRunConfig(runConfig, objTypeLoader, work);
    if (!engine) return null;
    if (engine.getState().introActive) engine.completeIntro();
    for (let index = 1; index <= throughFrameIndex; index++) {
      work.frameIndex = index;
      const frame = frames[index];
      if (frame.state.mechanicsConfig) engine.setMechanicsConfig(frame.state.mechanicsConfig);
      for (const action of frame.actions) engine.applyAction(action);
      engine.advanceTick(frame.input);
    }
    // The rebuilt engine emits fewer events than the recording did (it skips the intro, and the
    // recorded engine may have run before this recording began), so its counter would restart
    // below IDs already in the retained prefix. The branch appended after the fork then repeats
    // them, and every consumer that dedups on `eventId` silently drops its events on playback.
    let lastRecordedEventId = 0;
    for (let index = 0; index <= throughFrameIndex; index++) {
      for (const event of frames[index].events) lastRecordedEventId = Math.max(lastRecordedEventId, event.eventId);
    }
    engine.continueEventIdsAfter(lastRecordedEventId);
    // The run was validated against the recording's setup; whatever mechanics the caller applies
    // next (a takeover's viewer policy, even on tick 0) must not reconfigure its start.
    engine.keepRunStartSetup();
    return engine;
  } finally {
    setArenaConfig(arena, allowUnbounded);
  }
}
