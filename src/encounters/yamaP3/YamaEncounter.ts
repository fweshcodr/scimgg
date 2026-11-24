import type { NpcActor } from '../../core/actors/NpcActor';
import type { ArenaConfig } from '../../core/arena/ArenaConfig';
import { getArenaBounds, getDefaultArenaConfig, isWalkableTile } from '../../core/constants';
import type { EncounterCommand } from '../../core/encounters/commands';
import type { EncounterOutcome } from '../../core/encounters/outcome';
import type { EncounterSnapshotContext, YamaSnapshot } from '../../core/encounters/snapshot';
import type {
  Encounter,
  EncounterCommandContext,
  EncounterCommandResult,
  EncounterCompletionOwnership,
  EncounterContext,
  EncounterEngineRules,
  EncounterNpcDefeat,
  EncounterTickResult,
  EnvironmentalDamage,
  NpcMovementRequest,
} from '../../core/encounters/types';
import { canNpcActThisTurn } from '../../core/npcDeath';
import { type NpcPursuitProfile, pursuePlayer } from '../../core/npcPursuit';
import { NpcDefinitionCollection, type NpcDefinitionContext } from '../../core/npcs';
import { mulberry32 } from '../../core/rng';
import { voidFlareDefinition } from '../../npcs/yama/voidFlare';
import {
  createYamaActor,
  getYamaState,
  markYamaFireballAttack,
  setYamaOpeningStyle,
  type YamaAttackMechanics,
  yamaDefinition,
} from '../../npcs/yama/yama';
import type { Coordinate, MechanicsConfig } from '../../types/simulation';
import type { YamaEncounterCommand } from './commands';
import {
  getYamaBeatInfo,
  isSouthOfArenaEntrance,
  PLAYER_INTRO_ANIM_SEQ_ID,
  PLAYER_INTRO_FACING,
  randomLandingPosition,
  YAMA_SIZE,
  YAMA_START_POS,
  YAMA_VICTORY_COMPLETION_DELAY_TICKS,
  YAMA_VICTORY_QUOTES,
} from './constants';
import {
  BASE_YAMA_CONFIG,
  CONTRACT_COMBAT_LEVELS,
  type ResolvedYamaEncounterConfig,
  resolveEncounterConfig,
  type YamaContractConfig,
} from './contractConfig';
import type { YamaEncounterKind } from './contracts';
import { buildYamaControls } from './controls';
import { YamaFireballRuntime } from './fireballRuntime';
import { createYamaSimulationState, toYamaSeedPayload, type YamaSeedPayload, type YamaSimulationState } from './state';
import { YamaVoidFlareCoordinator } from './voidFlareCoordinator';
import { getWaveTiles, isWaveTile } from './waves';

const YAMA_ACTOR_ID = 'yama';

/**
 * Yama WALKS under Contract of sensory clouding, confirmed by
 * capture `yama-contract-of-sensory-clouding-packet-data-1(incomplete).txt`.
 */
const YAMA_PURSUIT_SPEED = 1;

const YAMA_PURSUIT: NpcPursuitProfile = {
  size: YAMA_SIZE,
  maxSpeed: YAMA_PURSUIT_SPEED,
  underFootprint: 'random-cardinal',
  unreachable: 'nearest-reachable',
  canOccupy: (sw, size) => {
    for (let dx = 0; dx < size; dx++) {
      for (let dy = 0; dy < size; dy++) {
        if (!isWalkableTile(sw[0] + dx, sw[1] + dy)) return false;
      }
    }
    return true;
  },
};

const YAMA_WAVE_FALLBACK_BOUNDS = { minX: 17, maxX: 44, minY: 0, maxY: 45 };

function getNearestWavePosition(playerPos: Coordinate, wavePositions: Coordinate[]): Coordinate {
  let nearest = wavePositions[0];
  let bestDistance = Number.POSITIVE_INFINITY;
  for (const wavePos of wavePositions) {
    const dx = wavePos[0] - playerPos[0];
    const dy = wavePos[1] - playerPos[1];
    const distance = dx * dx + dy * dy;
    if (distance < bestDistance) {
      bestDistance = distance;
      nearest = wavePos;
    }
  }
  return nearest;
}

/**
 * Which of the two ranged styles phase 3 opens on, rolled per fight.
 *
 * In-game it is phase 2's northern glyph color (Shadow means ranged, Fire means magic). A
 * phase-3-only fight has no phase 2, so the roll stands in for it. Do not fix it to a constant:
 * the captures include both openers (Yama captures). The alternation
 * that follows IS fixed, and is handled by the actor's alternating attack count.
 */
export class YamaEncounter implements Encounter {
  public readonly kind: YamaEncounterKind;

  private readonly contract: YamaContractConfig;
  private readonly resolvedConfig: ResolvedYamaEncounterConfig;
  private readonly fireballRuntime: YamaFireballRuntime;
  private readonly voidFlareCoordinator: YamaVoidFlareCoordinator;
  private npcDefinitions: NpcDefinitionCollection;
  private state: YamaSimulationState;
  private yamaActor: ReturnType<typeof createYamaActor> | null = null;
  private attackMechanics: YamaAttackMechanics = { meleeEnabled: false, rangedMagicEnabled: false };

  private sealedArenaConfig: ArenaConfig | null = null;
  private sealedArenaSource: Set<string> | null = null;

  constructor(contract?: YamaContractConfig, encounterSeed?: number) {
    this.contract = contract ?? BASE_YAMA_CONFIG;
    this.resolvedConfig = resolveEncounterConfig(this.contract.encounter);
    this.kind = this.contract.kind;
    this.fireballRuntime = new YamaFireballRuntime(
      YAMA_ACTOR_ID,
      this.resolvedConfig.attackPattern,
      this.resolvedConfig.fireballs.damage,
      this.contract.contractId === null,
    );
    this.voidFlareCoordinator = new YamaVoidFlareCoordinator(this.resolvedConfig.voidFlares);
    this.state = createYamaSimulationState(
      { waves: this.resolvedConfig.waves },
      encounterSeed === undefined ? { source: 'constructor' } : { source: 'constructor', encounterSeed },
    );
    this.npcDefinitions = this.createNpcDefinitions();
  }

  getOutcome(): EncounterOutcome {
    return this.state.lifecycle.outcome;
  }

  getDefaultPlayerStart(): Coordinate {
    return randomLandingPosition() as Coordinate;
  }

  getIntroConfig(): { facingAngle: number; animationSeqId: number } | null {
    return { facingAngle: PLAYER_INTRO_FACING, animationSeqId: PLAYER_INTRO_ANIM_SEQ_ID };
  }

  createNpcs(_playerStart: Coordinate): NpcActor[] {
    this.yamaActor = createYamaActor({
      position: [...YAMA_START_POS] as Coordinate,
      hp: this.resolvedConfig.boss.hp,
      maxHp: this.resolvedConfig.boss.maxHp,
      openingStyle: this.state.run.openingStyleSeed,
      levelOverrides: this.contract.contractId === null ? undefined : CONTRACT_COMBAT_LEVELS,
      // Normal Yama: 225 Defence, at most 80 levels drained. Phase 3 raises bonuses, not levels.
      // https://oldschool.runescape.wiki/w/Yama?oldid=15337263#Fight_overview
      // Simulator policy: the same absolute 145 floor for every contract. This is not a verified
      // wiki contract rule; their base levels and drain formulas stay unchanged.
      defenceDrainFloor: 145,
    });
    return [this.yamaActor];
  }

  reset(seeds?: Record<string, unknown>): void {
    this.state = createYamaSimulationState(
      { waves: this.resolvedConfig.waves },
      seeds === undefined ? { source: 'reset' } : { source: 'reset', seeds },
    );
    this.yamaActor = null;
    this.attackMechanics = { meleeEnabled: false, rangedMagicEnabled: false };
    this.npcDefinitions = this.createNpcDefinitions();
  }

  getSeeds(): YamaSeedPayload {
    return toYamaSeedPayload(this.state);
  }

  getNpcDefinitions(): NpcDefinitionCollection {
    return this.npcDefinitions;
  }

  /**
   * "Yama will always attempt to attack with melee (non-stop pursuit), including in phase 3
   * regardless of the player's mainhand weapon" (wiki, Contract of sensory clouding § Contract
   * details). Off for every other variant, where phase-3 Yama never leaves his spawn tile.
   */
  moveNpc(actor: NpcActor, ctx: EncounterContext): NpcMovementRequest[] {
    if (
      actor.id !== YAMA_ACTOR_ID ||
      !canNpcActThisTurn(actor, ctx.tick) ||
      !this.resolvedConfig.pursuit ||
      this.state.lifecycle.defeated
    )
      return [];
    return pursuePlayer(actor, ctx.playerPos, this.state.run.pursuitRng, YAMA_PURSUIT);
  }

  resolveHazards(ctx: EncounterContext, mechanicsEnabled: Partial<MechanicsConfig>): EnvironmentalDamage[] {
    if (this.state.lifecycle.defeated) return [];
    const damages: EnvironmentalDamage[] = [];
    const waveDamage = this.resolvedConfig.waves.damage;

    if (
      mechanicsEnabled.waves &&
      ctx.tick !== this.state.fireballs.shadowWaveImmunityTick &&
      isWaveTile(ctx.playerPos[0], ctx.playerPos[1], ctx.tick, this.state.run.waveConfig)
    ) {
      damages.push({
        baseDamage: waveDamage,
        attackType: 'typeless',
        source: 'Waves',
      });
    }

    this.voidFlareCoordinator.drainPendingImpacts(this.state.voidFlares, ctx, damages);
    const player = ctx.world.getPlayer();
    if (player?.alive) {
      const definitionContext = this.toNpcDefinitionContext(ctx);
      for (const actor of ctx.world.getNpcs()) {
        damages.push(...this.npcDefinitions.resolveLocalEffects(actor, definitionContext));
      }
    }

    this.fireballRuntime.resolveHazards(this.state.fireballs, ctx, { mechanics: mechanicsEnabled, damages });
    return damages;
  }

  /** Yama's turn: his swing. Void flares have no turn of their own; their fuse runs in `resolveHazards`. */
  processNpcTick(
    actor: NpcActor,
    ctx: EncounterContext,
    mechanicsEnabled: Partial<MechanicsConfig>,
  ): EncounterTickResult {
    if (actor.id !== YAMA_ACTOR_ID || this.state.lifecycle.defeated) return { environmentalDamages: [] };
    this.setAttackMechanics(mechanicsEnabled);
    return this.npcDefinitions.tick(actor, this.toNpcDefinitionContext(ctx));
  }

  completeNpcBand(ctx: EncounterContext, mechanicsEnabled: Partial<MechanicsConfig>): EnvironmentalDamage[] {
    if (this.state.lifecycle.outcome.phase === 'resolving' && ctx.tick >= this.state.lifecycle.outcome.completionTick) {
      this.state.lifecycle.outcome = { ...this.state.lifecycle.outcome, phase: 'victory' };
    }
    // The flares his last beat decided, once every flare's hit queue has run: a flare killed anywhere in
    // this band frees its slot and tile first, as when kills resolved before NPC actions. A Yama killed in
    // his own hit pass still drops them.
    if (!this.state.lifecycle.defeated) this.spawnPendingVoidFlares(ctx, mechanicsEnabled);
    return [];
  }

  /**
   * The void flare shares its tick with the attack it belongs to. The beat one tick earlier only
   * DECIDES the attack (it has to, because the style is picked from the player's post-move tile); the
   * swing and its flare both land on this tick. Spawned in `completeNpcBand`, apart from the attack guard,
   * so a suppressed or disabled swing still drops its flare on the right tick. Confirmed by capture `yama-packet-data.txt`.
   */
  private spawnPendingVoidFlares(ctx: EncounterContext, mechanicsEnabled: Partial<MechanicsConfig>): void {
    this.voidFlareCoordinator.processPendingSpawns(this.state.voidFlares, ctx, mechanicsEnabled.voidFlares === true);
  }

  processPostTick(ctx: EncounterContext, mechanicsEnabled: Partial<MechanicsConfig>): EnvironmentalDamage[] {
    if (this.state.lifecycle.defeated) return [];
    const beatInfo = getYamaBeatInfo(ctx.tick, this.resolvedConfig.attackPattern);
    const yama = ctx.world.getNpc(YAMA_ACTOR_ID);
    this.setAttackMechanics(mechanicsEnabled);
    if (yama) this.npcDefinitions.postTick(yama, this.toNpcDefinitionContext(ctx));
    const yamaState = yama ? getYamaState(yama) : null;
    if (mechanicsEnabled.waves) {
      const bounds = this.getArenaConfig().bounds ?? getArenaBounds() ?? YAMA_WAVE_FALLBACK_BOUNDS;
      const waveTiles = getWaveTiles(
        ctx.tick,
        bounds.minX,
        bounds.maxX,
        bounds.minY,
        bounds.maxY,
        this.state.run.waveConfig,
      );
      if (waveTiles.length > 0) {
        const wavePositions = waveTiles.map((tile) => [tile.x, tile.y] as Coordinate);
        ctx.tickEvents.emit({
          type: 'wave_activated',
          position: getNearestWavePosition(ctx.playerPos, wavePositions),
          wavePositions,
        });
      }
    }

    const snapAttackStarted = this.fireballRuntime.processPostTick(this.state.fireballs, ctx, {
      beatInfo,
      didMeleeThisTick: yamaState?.didPlanMelee === true,
      mechanics: mechanicsEnabled,
    });
    if (snapAttackStarted) {
      if (yama) markYamaFireballAttack(yama, ctx.tick);
    }

    this.voidFlareCoordinator.processPostTick(this.state.voidFlares, ctx, {
      enabled: mechanicsEnabled.voidFlares === true,
      beatInfo,
      didMeleeThisTick: yamaState?.didPlanMelee === true,
    });

    return [];
  }

  getSnapshot(ctx: Pick<EncounterSnapshotContext, 'tick' | 'mechanics'>): YamaSnapshot {
    const yamaState = this.yamaActor ? getYamaState(this.yamaActor) : null;
    return {
      kind: this.kind,
      state: {
        contractId: this.contract.contractId,
        firstRangeMageType: yamaState?.openingStyle ?? this.state.run.openingStyleSeed,
        lastAttackKind: yamaState?.latestAttackKind ?? null,
        lastAttackTick: yamaState?.latestAttackTick ?? null,
        waveConfig: this.state.run.waveConfig,
        attackPattern: this.resolvedConfig.attackPattern,
      },
      visuals: this.fireballRuntime.buildVisuals(this.state.fireballs, {
        tick: ctx.tick,
        defeated: this.state.lifecycle.defeated,
        mechanics: ctx.mechanics,
      }),
    };
  }

  onNpcDefeated(defeat: EncounterNpcDefeat, ctx: EncounterContext, ownership: EncounterCompletionOwnership): void {
    if (defeat.npcId !== YAMA_ACTOR_ID || this.state.lifecycle.defeated) return;

    this.state.lifecycle.defeated = true;
    this.fireballRuntime.clearForDefeat(this.state.fireballs);
    this.voidFlareCoordinator.clearForDefeat(this.state.voidFlares, ctx, defeat.tick);
    ctx.world.removePendingHitsBySource(YAMA_ACTOR_ID);

    // Deterministic per encounter so replays match.
    const quoteRng = mulberry32(this.state.run.encounterSeed ^ 0x5941_4d41);
    const quoteIndex = Math.floor(quoteRng() * YAMA_VICTORY_QUOTES.length);
    ctx.tickEvents.emit({
      type: 'overhead_text',
      anchor: { kind: 'actor', actorId: YAMA_ACTOR_ID },
      overheadText: YAMA_VICTORY_QUOTES[quoteIndex],
      overheadCycle: YAMA_VICTORY_COMPLETION_DELAY_TICKS,
    });

    if (ownership === 'encounter-owned') {
      this.state.lifecycle.outcome = {
        phase: 'resolving',
        decisiveTick: defeat.tick,
        completionTick: defeat.tick + YAMA_VICTORY_COMPLETION_DELAY_TICKS,
        primaryActorId: YAMA_ACTOR_ID,
        completionActorIds: [YAMA_ACTOR_ID],
      };
    }
  }

  getEngineRules(): EncounterEngineRules | undefined {
    return this.contract.engineRules;
  }

  getDefaultMechanicsConfig(): Partial<MechanicsConfig> {
    return buildYamaControls(this.contract).defaultMechanicsConfig;
  }

  getNpcDamageSourceLabel(): string {
    return 'YamaAttack';
  }

  getArenaConfig(): ArenaConfig {
    // The fight seals the arena entrance (tile (31, 19)): every tile on or south
    // of that line is removed from the walkable set, so isWalkableTile() — the
    // single gate the pathfinder (findPath/findPathToNpc) and step validation
    // (canMoveInDirection) consult — rejects them, making the area south of the
    // entrance non-walkable and non-pathable. Memoized on the source set identity
    // so per-tick / reset callers don't rebuild the set every call.
    const base = getDefaultArenaConfig();
    if (!base.walkableTiles) {
      return base;
    }
    if (this.sealedArenaConfig && this.sealedArenaSource === base.walkableTiles) {
      return this.sealedArenaConfig;
    }
    const walkableTiles = new Set<string>();
    for (const key of base.walkableTiles) {
      const y = Number(key.slice(key.indexOf(',') + 1));
      if (!isSouthOfArenaEntrance(y)) {
        walkableTiles.add(key);
      }
    }
    this.sealedArenaSource = base.walkableTiles;
    this.sealedArenaConfig = { ...base, walkableTiles };
    return this.sealedArenaConfig;
  }

  executeCommand(
    command: EncounterCommand,
    ctx: EncounterCommandContext,
    mechanics: Readonly<Partial<MechanicsConfig>>,
  ): EncounterCommandResult | undefined {
    if (command.encounter !== 'yama_p3') return undefined;
    return this.executeYamaCommand(command, ctx, mechanics);
  }

  private executeYamaCommand(
    command: YamaEncounterCommand,
    ctx: EncounterCommandContext,
    mechanics: Readonly<Partial<MechanicsConfig>>,
  ): EncounterCommandResult {
    switch (command.type) {
      case 'set-opening-style':
        this.state.run.openingStyleSeed = command.style;
        {
          const yama = ctx.world.getNpc(YAMA_ACTOR_ID) ?? this.yamaActor;
          if (yama) setYamaOpeningStyle(yama, command.style);
        }
        return {};
      case 'spawn-fireball':
        if (!this.state.lifecycle.defeated) {
          this.fireballRuntime.spawnManualBurst(this.state.fireballs, { tick: ctx.tick, mechanics });
        }
        return {};
      case 'spawn-void-flare': {
        if (this.state.lifecycle.defeated) return {};
        const event = this.voidFlareCoordinator.spawnDebug(this.state.voidFlares, ctx);
        return event ? { gameEvents: [event] } : {};
      }
      default: {
        const exhaustive: never = command;
        return exhaustive;
      }
    }
  }

  private createNpcDefinitions(): NpcDefinitionCollection {
    return new NpcDefinitionCollection([
      yamaDefinition.register({
        attackPattern: this.resolvedConfig.attackPattern,
        meleeDamage: this.resolvedConfig.autoAttacks.meleeDamage,
        rangedMagicDamage: this.resolvedConfig.autoAttacks.rangedMagicDamage,
        meleePrayerReduction: this.resolvedConfig.autoAttacks.meleePrayerReduction,
        rangedMagicPrayerReduction: this.resolvedConfig.autoAttacks.rangedMagicPrayerReduction,
        wretchedStrength: this.resolvedConfig.autoAttacks.wretchedStrength,
        accuracyRandom: this.state.run.accuracyRng,
        getMechanics: () => this.attackMechanics,
      }),
      voidFlareDefinition.register({
        damageSeed: this.state.fireballs.seed,
        explosionDamage: this.resolvedConfig.voidFlares.explosionDamage,
        getBoss: ({ world }) => world.getNpc(YAMA_ACTOR_ID),
        scheduleImpact: (impact) => this.state.voidFlares.pendingImpacts.push(impact),
      }),
    ]);
  }

  private setAttackMechanics(mechanics: Partial<MechanicsConfig>): void {
    this.attackMechanics = {
      meleeEnabled: mechanics.yamaMelee === true,
      rangedMagicEnabled: mechanics.yamaMageRange === true,
    };
  }

  private toNpcDefinitionContext(ctx: EncounterContext): NpcDefinitionContext {
    return { ...ctx, random: this.state.run.accuracyRng };
  }
}
