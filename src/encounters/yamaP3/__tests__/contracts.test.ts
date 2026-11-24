import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { PrayerReduction } from '../../../core/combat/CombatSystem';
import { calculatePrayerDamage } from '../../../core/combat/damageCalculation';
import { isYamaSnapshot } from '../../../core/encounters/snapshot';
import type { EncounterEngineContext } from '../../../core/encounters/types';
import { isCoreEvent } from '../../../core/events/types';
import { SimulationEngine } from '../../../core/SimulationEngine';
import type { WorldState } from '../../../core/WorldState';
import { getMonsterFormulaStats } from '../../../data/monsterData';
import { wretchedDamageBonusPercent, wretchedMinimumHit } from '../../../npcs/yama/wretchedStrength';
import { enqueueEnginePendingHit } from '../../../test/helpers/pendingHits';
import { type Coordinate, type DamageHistoryEntry, PrayerType } from '../../../types/simulation';
import {
  YAMA_SET_OPENING_RANGE_COMMAND,
  YAMA_SPAWN_FIREBALL_COMMAND,
  YAMA_SPAWN_VOID_FLARE_COMMAND,
} from '../commands';
import { getYamaBeatInfo, VOID_FLARE_NPC_ID, YAMA_NPC_ID, YAMA_VICTORY_QUOTES } from '../constants';
import {
  BASE_YAMA_CONFIG,
  BLOODIED_BLOWS_CONFIG,
  BLOODIED_BLOWS_FULL_FIGHT_HP,
  BLOODIED_BLOWS_P3_START_HP,
  DIVINE_CONTINUOUS_FLARE_INTERVAL,
  DIVINE_SEVERANCE_CONFIG,
  FORFEIT_BREATH_CONFIG,
  GLYPHIC_ATTENUATION_CONFIG,
  GLYPHIC_ATTENUATION_FULL_FIGHT_HP,
  GLYPHIC_ATTENUATION_P3_START_HP,
  resolveEncounterConfig,
  SENSORY_CLOUDING_CONFIG,
  VOID_FLARE_CHARGE_TICKS,
  YAMA_CONTRACT_P3_START_HP,
  YAMA_FULL_FIGHT_HP,
  YAMA_P3_START_HP,
  type YamaContractConfig,
} from '../contractConfig';
import { buildYamaControls } from '../controls';
import type { VoidFlareEncounterState } from '../state';
import { YamaVoidFlareCoordinator } from '../voidFlareCoordinator';
import { YamaEncounter } from '../YamaEncounter';

const PLAYER_POS: Coordinate = [31, 37];

function createDivineEngine(): SimulationEngine {
  const engine = new SimulationEngine({
    encounter: new YamaEncounter(DIVINE_SEVERANCE_CONFIG),
    startPos: PLAYER_POS,
  });

  engine.setMechanicsConfig({
    yamaMageRange: false,
    yamaMelee: false,
    waves: false,
    fireballs: false,
    voidFlares: false,
    infiniteHealth: true,
  });

  return engine;
}

function createForfeitEngine(
  config: YamaContractConfig = FORFEIT_BREATH_CONFIG,
  mechanics: Partial<ReturnType<SimulationEngine['getMechanicsConfig']>> = {},
): SimulationEngine {
  const engine = new SimulationEngine({
    encounter: new YamaEncounter(config),
    startPos: PLAYER_POS,
  });

  engine.setMechanicsConfig({
    yamaMageRange: false,
    yamaMelee: false,
    waves: false,
    fireballs: false,
    voidFlares: false,
    infiniteHealth: true,
    infiniteStamina: false,
    ...mechanics,
  });

  return engine;
}

function createBloodiedEngine(): SimulationEngine {
  const engine = new SimulationEngine({
    encounter: new YamaEncounter(BLOODIED_BLOWS_CONFIG),
    startPos: [31, 33],
  });

  engine.setMechanicsConfig({
    yamaMageRange: false,
    yamaMelee: false,
    waves: false,
    fireballs: false,
    voidFlares: false,
    infiniteHealth: true,
  });

  return engine;
}

function createGlyphicEngine(): SimulationEngine {
  const engine = new SimulationEngine({
    encounter: new YamaEncounter(GLYPHIC_ATTENUATION_CONFIG),
    startPos: [31, 33],
  });

  engine.setMechanicsConfig({
    yamaMageRange: false,
    yamaMelee: false,
    waves: false,
    fireballs: false,
    voidFlares: false,
    infiniteHealth: true,
  });

  return engine;
}

const getWorldState = (engine: SimulationEngine): WorldState => {
  return Reflect.get(engine, 'worldState') as WorldState;
};

describe.each([
  FORFEIT_BREATH_CONFIG,
  GLYPHIC_ATTENUATION_CONFIG,
  SENSORY_CLOUDING_CONFIG,
  DIVINE_SEVERANCE_CONFIG,
  BLOODIED_BLOWS_CONFIG,
])('$kind solo preparation', (contract) => {
  it('omits the duo role selector and defaults to player one', () => {
    const controls = buildYamaControls(contract);

    expect(controls.mechanicsToggles.map(({ key }) => key)).not.toContain('duoSide');
    expect(controls.defaultMechanicsConfig.duoSide).toBe('player1');
  });

  it.each([false, true])('ignores a stored player-two role with scheduled fireballs=%s', (scheduled) => {
    const engine = createForfeitEngine(contract, {
      fireballs: scheduled,
      fireballStart: 'vertical',
      duoSide: 'player2',
    });
    const angles: (string | null)[] = [];

    if (!scheduled) engine.executeEncounterCommand(YAMA_SPAWN_FIREBALL_COMMAND);
    for (let tick = 0; tick < 25; tick++) {
      engine.advanceTick(PLAYER_POS);
      const snapshot = engine.getState().encounter;
      if (isYamaSnapshot(snapshot)) {
        angles.push(...snapshot.visuals.fireballStates.map(({ angle }) => angle));
      }
    }

    expect(angles).toContain('diagonal');
    expect(angles).not.toContain('diagonal-alt');
  });
});

describe('Divine Severance Contract', () => {
  let engine: SimulationEngine;

  beforeEach(() => {
    engine = createDivineEngine();
  });

  it('the prayer switches off at the end of its second tick, as the client shows it', () => {
    engine.queueProtectionPrayer(PrayerType.ProtectMagic);
    engine.advanceTick(PLAYER_POS);
    expect(engine.getState().activePrayer).toBe(PrayerType.ProtectMagic);

    // Second tick: expiry runs AFTER damage, so the player sees it go dark on the same
    // tick it last protected them — the client's `1->0` lands on a tick that still
    // blocks. `captureConformance.test.ts` proves the block half.
    engine.advanceTick(PLAYER_POS);
    expect(engine.getState().activePrayer).toBeNull();
  });

  it('re-sending the active protection prayer does not extend its original expiry', () => {
    engine.queueProtectionPrayer(PrayerType.ProtectMagic);
    engine.advanceTick(PLAYER_POS);

    engine.queueProtectionPrayer(PrayerType.ProtectMagic);
    engine.advanceTick(PLAYER_POS);
    engine.advanceTick(PLAYER_POS);

    expect(engine.getState().activePrayer).toBeNull();
  });

  it('a rejected protection input does not refresh the active prayer expiry', () => {
    engine.queueProtectionPrayer(PrayerType.ProtectMagic);
    engine.advanceTick(PLAYER_POS);
    engine.prayerState.points = 0;

    engine.queueProtectionPrayer(PrayerType.ProtectRange);
    engine.advanceTick(PLAYER_POS);
    expect(engine.getState().activePrayer).toBeNull();
  });

  it('re-activation works after expiry', () => {
    engine.queueProtectionPrayer(PrayerType.ProtectRange);
    engine.advanceTick(PLAYER_POS);
    engine.advanceTick(PLAYER_POS);
    expect(engine.getState().activePrayer).toBeNull();

    engine.queueProtectionPrayer(PrayerType.ProtectMelee);
    engine.advanceTick(PLAYER_POS);
    expect(engine.getState().activePrayer).toBe(PrayerType.ProtectMelee);

    engine.advanceTick(PLAYER_POS);
    expect(engine.getState().activePrayer).toBeNull();
  });

  it('voidflare explosion damage is lethal (999)', () => {
    const lethalEngine = new SimulationEngine({
      encounter: new YamaEncounter(DIVINE_SEVERANCE_CONFIG),
      startPos: PLAYER_POS,
    });
    lethalEngine.setMechanicsConfig({
      yamaMageRange: false,
      yamaMelee: false,
      waves: false,
      fireballs: false,
      voidFlares: true,
      infiniteHealth: false,
    });

    lethalEngine.executeEncounterCommand(YAMA_SPAWN_VOID_FLARE_COMMAND);

    const flareAndHitEvents = () =>
      lethalEngine
        .getLastTickEvents()
        .filter((event) => event.type === 'voidflare_exploded' || event.type === 'hit_applied')
        .map((event) => event.type);

    for (let i = 0; i < VOID_FLARE_CHARGE_TICKS; i++) {
      lethalEngine.advanceTick(PLAYER_POS);
    }
    const detonationTickEvents = flareAndHitEvents();
    lethalEngine.advanceTick(PLAYER_POS);
    const impactTickEvents = flareAndHitEvents();

    const voidFlareHit = lethalEngine.getState().damageHistory.find((hit) => hit.source === 'VoidFlare');
    expect(voidFlareHit).toBeDefined();
    expect(voidFlareHit?.baseDamage).toBe(999);
    expect(detonationTickEvents).toEqual(['voidflare_exploded']);
    expect(impactTickEvents).toEqual(['hit_applied']);
    expect(lethalEngine.getState().isAlive).toBe(false);
    expect(lethalEngine.getState().playerHP).toBe(0);
  });

  it('adds a lone 81-hitpoint flare every 20 ticks without displacing the 71-hitpoint beat pair', () => {
    const flareEngine = createFlareEngine();
    const world = getWorldState(flareEngine);
    const seen = new Set<string>();
    const spawns = new Map<number, number[]>();

    for (let i = 0; i < 70; i++) {
      flareEngine.advanceTick(PLAYER_POS);
      for (const npc of world.getNpcs()) {
        if (npc.npcTypeId !== VOID_FLARE_NPC_ID || seen.has(npc.id)) continue;
        seen.add(npc.id);
        const tick = npc.spawnTick ?? world.tick;
        spawns.set(tick, [...(spawns.get(tick) ?? []), npc.vitals.hp]);
      }
    }

    const drumbeat = [...spawns].filter(([, hps]) => hps.length === 1);
    expect(drumbeat.length).toBeGreaterThanOrEqual(3);
    for (const [tick, hps] of drumbeat) {
      expect(tick % DIVINE_CONTINUOUS_FLARE_INTERVAL).toBe(0);
      expect(hps).toEqual([81]);
    }

    const { beatStartTick, beatIntervalTicks, voidFlareBeats } = resolveEncounterConfig(
      DIVINE_SEVERANCE_CONFIG.encounter,
    ).attackPattern;
    // The beat only schedules the spawn; the flares land with the swing one tick later.
    const pairTick = beatStartTick + beatIntervalTicks * voidFlareBeats[0] + 1;
    expect(spawns.get(pairTick)).toEqual([71, 71]);
  });
});

function createFlareEngine(): SimulationEngine {
  const engine = new SimulationEngine({
    encounter: new YamaEncounter(DIVINE_SEVERANCE_CONFIG),
    startPos: PLAYER_POS,
  });
  engine.setMechanicsConfig({
    yamaMageRange: true,
    waves: false,
    fireballs: false,
    voidFlares: true,
    infiniteHealth: true,
  });
  return engine;
}

describe('fireball beat kinds per cycle', () => {
  const kindAt = (config: YamaContractConfig, globalBeat: number) => {
    const pattern = resolveEncounterConfig(config.encounter).attackPattern;
    return getYamaBeatInfo(pattern.beatStartTick + globalBeat * pattern.beatIntervalTicks, pattern).fireballBeatKind;
  };

  it.each([
    [0, 'snap'],
    [3, 'snap'],
    [7, 'snap'],
    [10, 'snap'],
    [13, 'overlay'],
    [17, 'snap'],
    [23, 'overlay'],
  ] as const)('base: global beat %i is %s', (beat, kind) => {
    expect(kindAt(BASE_YAMA_CONFIG, beat)).toBe(kind);
  });

  it.each([
    DIVINE_SEVERANCE_CONFIG,
    FORFEIT_BREATH_CONFIG,
    SENSORY_CLOUDING_CONFIG,
    BLOODIED_BLOWS_CONFIG,
    GLYPHIC_ATTENUATION_CONFIG,
  ])('$contractId casts with the beat-3 fireball from cycle 0', (config) => {
    expect([0, 3, 7, 13].map((beat) => kindAt(config, beat))).toEqual(['snap', 'overlay', 'snap', 'overlay']);
  });
});

describe('Forfeit Breath Contract', () => {
  it('uses sigil 10-beat cycle with fireballs at beats 0, 3, 7 (snap at 0, 7; overlay at 3)', () => {
    const resolvedConfig = resolveEncounterConfig(FORFEIT_BREATH_CONFIG.encounter);

    for (let beat = 0; beat < 10; beat++) {
      const tick = 4 + beat * 7;
      const beatInfo = getYamaBeatInfo(tick, resolvedConfig.attackPattern);
      expect(beatInfo.isBeat).toBe(true);
      expect(beatInfo.beatIndex).toBe(beat);
      expect(beatInfo.isFireballBeat).toBe([0, 3, 7].includes(beat));
      expect(beatInfo.isVoidFlareBeat).toBe(beat === 8);
      if (beat === 0 || beat === 7) {
        expect(beatInfo.fireballBeatKind).toBe('snap');
      } else if (beat === 3) {
        expect(beatInfo.fireballBeatKind).toBe('overlay');
      } else {
        expect(beatInfo.fireballBeatKind).toBe('none');
      }
    }

    expect(resolvedConfig.attackPattern.beatsPerCycle).toBe(10);
  });

  it('drains 1% run energy every 4 ticks (not every tick)', () => {
    const engine = createForfeitEngine();

    expect(engine.getState().runEnergy.energy).toBe(10000);

    // Ticks 1-3: no passive drain (tick % 4 !== 0), regen capped at max.
    for (let i = 0; i < 3; i++) {
      engine.advanceTick(PLAYER_POS);
    }
    expect(engine.getState().runEnergy.energy).toBe(10000);

    // Tick 4: drain 100 (1%), then natural regen +24 at 99 agility.
    engine.advanceTick(PLAYER_POS);
    expect(engine.getState().runEnergy.energy).toBe(9924);
  });

  it('encounter fails when run energy reaches 0', () => {
    const engine = createForfeitEngine();
    const player = getWorldState(engine).getPlayer();
    if (!player) throw new Error('Player actor missing');

    // Set energy so ticks 1-3 regen to exactly 100, then tick 4 drain kills.
    // 28 + (3 * 24 regen) = 100. Drain 100 → 0 → dead.
    player.runEnergy = { energy: 28 };

    for (let i = 0; i < 4; i++) {
      engine.advanceTick(PLAYER_POS);
    }

    expect(engine.getState().runEnergy.energy).toBe(0);
    expect(engine.getState().failedCondition).toBe('StaminaDepleted');
    expect(engine.getState().isAlive).toBe(false);
  });

  describe('Forfeit Breath: infiniteStamina mechanic', () => {
    it('keeps run energy at 10000 across passive drain ticks when enabled', () => {
      const engine = createForfeitEngine(FORFEIT_BREATH_CONFIG, { infiniteStamina: true });

      for (let i = 0; i < 8; i++) {
        engine.advanceTick(PLAYER_POS);
      }

      expect(engine.getState().runEnergy.energy).toBe(10000);
      expect(engine.getState().failedCondition).toBeNull();
    });

    it('does not trigger StaminaDepleted even when run energy starts at 0', () => {
      const engine = createForfeitEngine(FORFEIT_BREATH_CONFIG, { infiniteStamina: true });
      const player = getWorldState(engine).getPlayer();
      if (!player) throw new Error('Player actor missing');

      player.runEnergy = { energy: 0 };

      for (let i = 0; i < 8; i++) {
        engine.advanceTick(PLAYER_POS);
      }

      expect(engine.getState().failedCondition).toBeNull();
      expect(engine.getState().isAlive).toBe(true);
      expect(engine.getState().runEnergy.energy).toBeGreaterThan(0);
    });

    it('drains run energy when infiniteStamina is disabled', () => {
      const engine = createForfeitEngine(FORFEIT_BREATH_CONFIG, { infiniteStamina: false });

      for (let i = 0; i < 4; i++) {
        engine.advanceTick(PLAYER_POS);
      }

      expect(engine.getState().runEnergy.energy).toBe(9924);
      expect(engine.getState().failedCondition).toBeNull();
    });

    it('triggers StaminaDepleted when energy reaches 0 without infiniteStamina', () => {
      const engine = createForfeitEngine(FORFEIT_BREATH_CONFIG, { infiniteStamina: false });
      const player = getWorldState(engine).getPlayer();
      if (!player) throw new Error('Player actor missing');

      player.runEnergy = { energy: 28 };

      for (let i = 0; i < 4; i++) {
        engine.advanceTick(PLAYER_POS);
      }

      expect(engine.getState().runEnergy.energy).toBe(0);
      expect(engine.getState().failedCondition).toBe('StaminaDepleted');
      expect(engine.getState().isAlive).toBe(false);
    });
  });

  it('flushes tick events when passive drain kills at tick start', () => {
    const engine = createForfeitEngine();
    const player = getWorldState(engine).getPlayer();
    if (!player) throw new Error('Player actor missing');

    player.runEnergy = { energy: 28 };

    for (let i = 0; i < 4; i++) {
      engine.advanceTick(PLAYER_POS);
    }

    expect(engine.getState().failedCondition).toBe('StaminaDepleted');
    const lastEvents = engine.getLastTickEvents();
    expect(lastEvents.length).toBeGreaterThan(0);
    const hasDeathEvent = lastEvents.some((event) => event.type === 'actor_died' && event.tick === 4);
    expect(hasDeathEvent).toBe(true);
  });

  it('player damage causes proportional run energy drain', () => {
    const damageConfig: YamaContractConfig = {
      ...FORFEIT_BREATH_CONFIG,
      encounter: {
        ...FORFEIT_BREATH_CONFIG.encounter,
        voidFlares: {
          ...FORFEIT_BREATH_CONFIG.encounter.voidFlares,
          chargeTicks: 1,
          explosionDamage: [10, 10],
        },
      },
    };
    const engine = createForfeitEngine(damageConfig, {
      voidFlares: true,
      infiniteHealth: false,
    });

    engine.executeEncounterCommand(YAMA_SPAWN_VOID_FLARE_COMMAND);
    engine.advanceTick(PLAYER_POS);
    engine.advanceTick(PLAYER_POS);

    const voidFlareHit = engine.getState().damageHistory.find((hit) => hit.source === 'VoidFlare');
    expect(voidFlareHit).toBeDefined();
    expect(voidFlareHit?.effectiveDamage).toBe(10);
    // Two ticks because the hit lands the tick after the flare detonates. The total is unchanged
    // from the same-tick version only because tick 1's regen is a no-op at full energy.
    expect(engine.getState().runEnergy.energy).toBe(9024);
  });

  // capture yama-contract-forfeit-breath-p3-voidflare-explosions-packet-data.txt:5211: the
  // detonation tick carries the human impact with `delay=30`, so it shows with the next-tick splat.
  it('puts the human impact graphic on the player with the explosion splat, and marks the flare detonated', () => {
    const damageConfig: YamaContractConfig = {
      ...FORFEIT_BREATH_CONFIG,
      encounter: {
        ...FORFEIT_BREATH_CONFIG.encounter,
        voidFlares: { ...FORFEIT_BREATH_CONFIG.encounter.voidFlares, chargeTicks: 1, explosionDamage: [10, 10] },
      },
    };
    const engine = createForfeitEngine(damageConfig, { voidFlares: true, infiniteHealth: true });
    engine.executeEncounterCommand(YAMA_SPAWN_VOID_FLARE_COMMAND);
    const graphicTicks: number[] = [];
    for (let step = 0; step < 3; step++) {
      engine.advanceTick(PLAYER_POS);
      for (const event of engine.getLastTickEvents()) {
        if (isCoreEvent(event, 'player_graphic_applied') && event.spotAnimId === 3242) graphicTicks.push(event.tick);
      }
    }

    const hit = engine.getState().damageHistory.find((entry) => entry.source === 'VoidFlare');
    expect(graphicTicks).toEqual([hit?.tick]);
    const flare = engine.getState().npcs.find((npc) => npc.npcTypeId === VOID_FLARE_NPC_ID);
    expect(flare).toMatchObject({ alive: false, deathCause: 'detonated', despawnTick: (hit?.tick ?? 0) - 1 });
  });

  it('shows no human impact for an explosion that never lands on a dead player', () => {
    const coordinator = new YamaVoidFlareCoordinator(
      resolveEncounterConfig(FORFEIT_BREATH_CONFIG.encounter).voidFlares,
    );
    const emit = vi.fn();
    const state = { pendingImpacts: [{ impactTick: 5, damage: 10 }] } as unknown as VoidFlareEncounterState;
    const world = { getPlayer: () => ({ alive: false }) } as unknown as WorldState;

    coordinator.drainPendingImpacts(state, { tick: 5, world, tickEvents: { emit } as never }, []);

    expect(emit).not.toHaveBeenCalled();
  });

  it('combines passive drain and damage drain in the same tick', () => {
    const damageConfig: YamaContractConfig = {
      ...FORFEIT_BREATH_CONFIG,
      encounter: {
        ...FORFEIT_BREATH_CONFIG.encounter,
        voidFlares: {
          ...FORFEIT_BREATH_CONFIG.encounter.voidFlares,
          chargeTicks: 3,
          explosionDamage: [10, 10],
        },
      },
    };
    const engine = createForfeitEngine(damageConfig, {
      voidFlares: true,
      infiniteHealth: false,
    });

    // Fuse of 3 so the explosion's damage lands on tick 4, the passive drain tick — a fuse of 4
    // detonates on tick 4 and lands on tick 5, which is what this test exists to rule out.
    engine.executeEncounterCommand(YAMA_SPAWN_VOID_FLARE_COMMAND);
    for (let i = 0; i < 4; i++) {
      engine.advanceTick(PLAYER_POS);
    }

    const voidFlareHit = engine.getState().damageHistory.find((hit) => hit.source === 'VoidFlare');
    expect(voidFlareHit).toBeDefined();
    expect(voidFlareHit?.effectiveDamage).toBe(10);
    // Tick 4: passive drain 100 (1%) + damage drain 1000 (10 × 100) + regen 24.
    // 10000 - 100 - 1000 + 24 = 8924.
    expect(engine.getState().runEnergy.energy).toBe(8924);
  });

  it('damage-driven depletion applies even with infiniteHealth', () => {
    const damageConfig: YamaContractConfig = {
      ...FORFEIT_BREATH_CONFIG,
      encounter: {
        ...FORFEIT_BREATH_CONFIG.encounter,
        voidFlares: {
          ...FORFEIT_BREATH_CONFIG.encounter.voidFlares,
          chargeTicks: 1,
          explosionDamage: [10, 10],
        },
      },
    };
    const engine = createForfeitEngine(damageConfig, {
      voidFlares: true,
      infiniteHealth: true,
    });
    const player = getWorldState(engine).getPlayer();
    if (!player) throw new Error('Player actor missing');

    // Low energy — damage drain will deplete it.
    player.runEnergy = { energy: 500 };

    engine.executeEncounterCommand(YAMA_SPAWN_VOID_FLARE_COMMAND);
    engine.advanceTick(PLAYER_POS);
    engine.advanceTick(PLAYER_POS);

    const voidFlareHit = engine.getState().damageHistory.find((hit) => hit.source === 'VoidFlare');
    expect(voidFlareHit).toBeDefined();
    // Not 0: the drain clamps there, but post-death regen still ticks, because
    // onPlayerDamageTaken doesn't halt the tick.
    expect(engine.getState().runEnergy.energy).toBe(24);
    expect(engine.getState().failedCondition).toBe('StaminaDepleted');
    expect(engine.getState().isAlive).toBe(false);
  });
});

describe('Sensory Clouding Contract', () => {
  it('halves player attack range via encounter combat params hook', () => {
    const encounter = new YamaEncounter(SENSORY_CLOUDING_CONFIG);
    const rules = encounter.getEngineRules();
    expect(rules?.modifyPlayerCombatParams).toBeDefined();
    const engine = createDivineEngine();
    const world = getWorldState(engine);
    const player = world.getPlayer();
    if (!player) throw new Error('Player actor missing');

    const modified = rules!.modifyPlayerCombatParams!(
      {
        attackSpeed: 4,
        attackRange: 10,
      },
      {
        tick: 1,
        player,
        world,
      },
    );

    expect(modified.attackRange).toBe(5);
  });
});

describe('Bloodied Blows Contract', () => {
  it('starts phase 3 at half its 3000 pool', () => {
    const engine = createBloodiedEngine();
    const yama = getWorldState(engine).getNpc('yama');

    expect(yama).toBeDefined();
    expect(yama?.vitals.maxHp).toBe(BLOODIED_BLOWS_FULL_FIGHT_HP);
    expect(yama?.vitals.hp).toBe(BLOODIED_BLOWS_P3_START_HP);
  });

  /**
   * Every phase-3 Dark Demonbane hit in `yama-contract-of-bloodied-blows-packet-data-1.txt`,
   * keyed by the player's HP on the tick the spell was CAST (not the tick it landed — the
   * opening 48 was cast at 27 and landed at 17 after a locator-orb sip). The client marks 68
   * as the max hit with two `DAMAGE_MAX_ME` splats, at two different floors, so the maximum
   * is a constant and only the floor moves.
   */
  const CAPTURED_DEMONBANE_HITS: ReadonlyArray<{ launchHp: number; floor: number; observed: readonly number[] }> = [
    { launchHp: 27, floor: 48, observed: [48] },
    { launchHp: 17, floor: 55, observed: [55, 55, 57] },
    { launchHp: 15, floor: 57, observed: [57] },
    { launchHp: 12, floor: 59, observed: [59, 61, 68] },
    { launchHp: 11, floor: 59, observed: [59, 59] },
    { launchHp: 9, floor: 61, observed: [61, 61, 61] },
    { launchHp: 8, floor: 61, observed: [61, 61] },
    { launchHp: 7, floor: 62, observed: [62, 62, 62, 62, 62] },
    { launchHp: 6, floor: 63, observed: [65, 68] },
    { launchHp: 2, floor: 65, observed: [67] },
  ];
  const CAPTURED_MAX_HIT = 68;
  const CAPTURED_PLAYER_MAX_HP = 99;

  it('reproduces every captured minimum, and never exceeds the captured maximum', () => {
    for (const { launchHp, floor, observed } of CAPTURED_DEMONBANE_HITS) {
      expect(wretchedMinimumHit(CAPTURED_MAX_HIT, launchHp, CAPTURED_PLAYER_MAX_HP), `launch hp ${launchHp}`).toBe(
        floor,
      );
      for (const damage of observed) {
        expect(damage, `launch hp ${launchHp}`).toBeGreaterThanOrEqual(floor);
        expect(damage).toBeLessThanOrEqual(CAPTURED_MAX_HIT);
      }
    }
  });

  it("leaves a full-health attacker unfloored and stays sane on Yama's 3000 pool", () => {
    expect(wretchedMinimumHit(CAPTURED_MAX_HIT, 99, 99)).toBe(0);
    // Dharok's literal (missing/100)*(maxHp/100) would be 15x here rather than a half.
    expect(wretchedMinimumHit(53, 1500, 3000)).toBe(26);
    expect(wretchedMinimumHit(53, 34, 3000)).toBe(51);
  });

  it('hands out no bonus at full health, and clamps health outside the pool', () => {
    expect(wretchedDamageBonusPercent(3000, 3000)).toBe(0);
    expect(wretchedDamageBonusPercent(99, 99)).toBe(0);
    // Overheal and negative health both clamp rather than producing a negative or >100 bonus,
    // which would turn a boost into a damage reduction or a 20x hit.
    expect(wretchedDamageBonusPercent(4000, 3000)).toBe(0);
    expect(wretchedDamageBonusPercent(-50, 3000)).toBe(100);
    expect(wretchedDamageBonusPercent(0, 3000)).toBe(100);
  });

  it("exposes the player's floor only under this contract", () => {
    const minimumHit = (config: YamaContractConfig) => new YamaEncounter(config).getEngineRules()?.playerMinimumHit;
    const engine = createBloodiedEngine();
    const world = getWorldState(engine);
    const player = world.getPlayer();
    expect(player).toBeDefined();
    player!.vitals.hp = 9;
    const ctx: EncounterEngineContext = { tick: 0, player: player!, world };

    expect(minimumHit(BLOODIED_BLOWS_CONFIG)?.(CAPTURED_MAX_HIT, ctx)).toBe(61);
    expect(minimumHit(BASE_YAMA_CONFIG)).toBeUndefined();
    expect(minimumHit(DIVINE_SEVERANCE_CONFIG)).toBeUndefined();
  });

  it('gives Yama the damage bonus, off his own health, and no other contract', () => {
    expect(resolveEncounterConfig(BLOODIED_BLOWS_CONFIG.encounter).autoAttacks.wretchedStrength).toBe(true);
    for (const config of [BASE_YAMA_CONFIG, DIVINE_SEVERANCE_CONFIG, GLYPHIC_ATTENUATION_CONFIG]) {
      expect(resolveEncounterConfig(config.encounter).autoAttacks.wretchedStrength).toBe(false);
    }
  });

  /**
   * Drives Yama's autos with his health pinned and reads the bonus back off the landed hitsplats.
   * `PLAYER_POS` is out of melee range, so every attack takes the 3-tick ranged path — which is the
   * point: the bonus must reach the landed hit, not just the config or helper.
   */
  const landedYamaDamage = (config: YamaContractConfig, bossHp: number, ticks: number): number[] => {
    // Seeded: the assertions below are about the SHAPE of the damage distribution (a roll above
    // the plain max hit, several nonzero rolls under a minimum-hit floor), which an unseeded engine
    // leaves to Math.random and turns into a rare flake.
    const engine = new SimulationEngine({ encounter: new YamaEncounter(config), startPos: PLAYER_POS, combatSeed: 0 });
    engine.setMechanicsConfig({
      yamaMageRange: true,
      waves: false,
      fireballs: false,
      voidFlares: false,
      infiniteHealth: true,
    });

    const yama = getWorldState(engine).getNpc('yama');
    expect(yama).toBeDefined();
    yama!.vitals.hp = bossHp;

    for (let tick = 0; tick < ticks; tick++) engine.advanceTick(PLAYER_POS);

    const landed = engine
      .getState()
      .damageHistory.filter((hit) => hit.source === 'YamaAttack')
      .map((hit) => hit.baseDamage);
    expect(landed.length).toBeGreaterThan(10);
    return landed;
  };

  it("boosts Yama's landed autos off his health at the calculation tick", () => {
    const { autoAttacks, boss } = resolveEncounterConfig(BLOODIED_BLOWS_CONFIG.encounter);
    const maxHit = autoAttacks.rangedMagicDamage[1];
    const bonus = wretchedDamageBonusPercent(300, boss.maxHp);
    expect(bonus).toBe(90);
    const boostedMax = maxHit + Math.floor((maxHit * bonus) / 100);

    const landed = landedYamaDamage(BLOODIED_BLOWS_CONFIG, 300, 160);

    expect(Math.max(...landed)).toBeGreaterThan(maxHit);
    for (const damage of landed) expect(damage).toBeLessThanOrEqual(boostedMax);
  });

  /**
   * The property that separates the bonus from a minimum-hit floor, and the one the capture
   * pins: a clamp cannot return a nonzero hit below its own floor, so a run with none of them
   * means the bonus has been modeled as a floor.
   */
  it('leaves low rolls low even at 1% health, which a minimum-hit floor could not', () => {
    const { autoAttacks, boss } = resolveEncounterConfig(BLOODIED_BLOWS_CONFIG.encounter);
    const wouldBeFloor = wretchedMinimumHit(autoAttacks.rangedMagicDamage[1], 30, boss.maxHp);
    expect(wouldBeFloor).toBe(52);

    const landed = landedYamaDamage(BLOODIED_BLOWS_CONFIG, 30, 220);

    expect(landed.filter((damage) => damage > 0 && damage < wouldBeFloor).length).toBeGreaterThan(3);
  });

  const landedAcrossHealthChange = (cueHp: number, releaseHp: number, ticks: number): DamageHistoryEntry[] => {
    const engine = new SimulationEngine({
      encounter: new YamaEncounter(BLOODIED_BLOWS_CONFIG, 1),
      startPos: PLAYER_POS,
      combatSeed: 7,
    });
    engine.setMechanicsConfig({
      yamaMageRange: true,
      waves: false,
      fireballs: false,
      voidFlares: false,
      infiniteHealth: true,
    });
    const yama = getWorldState(engine).getNpc('yama');
    if (yama === null) throw new Error('Expected Yama');
    yama.vitals.hp = cueHp;

    const landed: DamageHistoryEntry[] = [];
    let seen = 0;
    let flips = 0;
    for (let tick = 0; tick < ticks; tick++) {
      engine.advanceTick(PLAYER_POS);
      const launched = engine
        .getLastTickEvents()
        .some((event) => isCoreEvent(event, 'attack_started') && event.sourceId === 'yama');
      if (launched) {
        yama.vitals.hp = releaseHp;
        flips++;
      }

      const history = engine.getState().damageHistory.filter((hit) => hit.source === 'YamaAttack');
      if (history.length > seen) {
        landed.push(...history.slice(seen));
        seen = history.length;
        yama.vitals.hp = cueHp;
      }
    }
    // Without a flip per landing the health never actually differs between the two ends and the
    // assertions below hold vacuously.
    expect(flips).toBeGreaterThanOrEqual(landed.length);
    expect(landed.length).toBeGreaterThan(5);
    return landed;
  };

  it("reads the ranged bonus off Yama's release health and caps the boosted amount at player HP", () => {
    const { autoAttacks, boss } = resolveEncounterConfig(BLOODIED_BLOWS_CONFIG.encounter);
    const maxHit = autoAttacks.rangedMagicDamage[1];
    const boosted = (hp: number) => maxHit + Math.floor((maxHit * wretchedDamageBonusPercent(hp, boss.maxHp)) / 100);
    expect(boosted(boss.maxHp / 2)).toBe(79);
    expect(boosted(1)).toBe(105);

    const landed = landedAcrossHealthChange(boss.maxHp / 2, 1, 200);

    expect(Math.max(...landed.map((hit) => hit.baseDamage))).toBeGreaterThan(99);
    for (const hit of landed) {
      expect(hit.baseDamage).toBeLessThanOrEqual(boosted(1));
      expect(hit.effectiveDamage).toBe(Math.min(hit.baseDamage, 99));
    }
  });

  it('reduces the ranged bonus when Yama heals during the windup', () => {
    const { autoAttacks, boss } = resolveEncounterConfig(BLOODIED_BLOWS_CONFIG.encounter);
    const maxHit = autoAttacks.rangedMagicDamage[1];

    const landed = landedAcrossHealthChange(1, boss.maxHp / 2, 200);

    expect(Math.max(...landed.map((hit) => hit.baseDamage))).toBeGreaterThan(maxHit);
    for (const hit of landed) {
      expect(hit.baseDamage).toBeLessThanOrEqual(79);
      expect(hit.effectiveDamage).toBe(hit.baseDamage);
    }
  });

  it.each([
    { hp: 7, sample: 0.9, baseDamage: 91, effectiveDamage: 5 },
    { hp: 7, sample: 0.999, baseDamage: 100, effectiveDamage: 6 },
    { hp: 1, sample: 0.999, baseDamage: 100, effectiveDamage: 1 },
  ])('preserves positive prayed Bloodied hits at $hp HP: $effectiveDamage damage', ({
    hp,
    sample,
    baseDamage,
    effectiveDamage,
  }) => {
    const engine = new SimulationEngine({
      encounter: new YamaEncounter(BLOODIED_BLOWS_CONFIG, 1),
      startPos: PLAYER_POS,
      startHp: hp,
      combatRandom: () => sample,
    });
    engine.setMechanicsConfig({
      yamaMageRange: true,
      yamaMelee: false,
      waves: false,
      fireballs: false,
      voidFlares: false,
    });
    engine.executeEncounterCommand(YAMA_SET_OPENING_RANGE_COMMAND);
    const yama = getWorldState(engine).getNpc('yama');
    if (!yama) throw new TypeError('Expected Yama');
    yama.vitals.hp = 300;
    expect(resolveEncounterConfig(BLOODIED_BLOWS_CONFIG.encounter).autoAttacks.rangedMagicPrayerReduction).toEqual({
      type: 'reduce',
      value: 0.06,
    });
    while (engine.getState().currentTick < 14) engine.advanceTick(PLAYER_POS);
    engine.queueProtectionPrayer(PrayerType.ProtectRange);

    engine.advanceTick(PLAYER_POS);

    expect(engine.getState().damageHistory).toContainEqual(
      expect.objectContaining({
        tick: 15,
        baseDamage,
        effectiveDamage,
        prayedCorrectly: true,
        hpBefore: hp,
        hpAfter: hp - effectiveDamage,
      }),
    );
    expect(engine.getState().isAlive).toBe(hp > effectiveDamage);
  });

  it('composes the bonus with the overhead at runtime, not just in the damage helper', () => {
    const { autoAttacks, boss } = resolveEncounterConfig(BLOODIED_BLOWS_CONFIG.encounter);
    const maxHit = autoAttacks.rangedMagicDamage[1];
    const bonus = wretchedDamageBonusPercent(30, boss.maxHp);
    const support = new Set(
      [...Array(maxHit + 1).keys()].map((roll) =>
        calculatePrayerDamage(
          roll + Math.floor((roll * bonus) / 100),
          'range',
          PrayerType.ProtectRange,
          autoAttacks.rangedMagicPrayerReduction,
        ),
      ),
    );
    const unboostedCeiling = calculatePrayerDamage(
      maxHit,
      'range',
      PrayerType.ProtectRange,
      autoAttacks.rangedMagicPrayerReduction,
    );

    const engine = new SimulationEngine({
      encounter: new YamaEncounter(BLOODIED_BLOWS_CONFIG),
      startPos: PLAYER_POS,
      combatSeed: 3,
    });
    engine.setMechanicsConfig({
      yamaMageRange: true,
      waves: false,
      fireballs: false,
      voidFlares: false,
      infiniteHealth: true,
    });
    const yama = getWorldState(engine).getNpc('yama');
    if (yama === null) throw new Error('Expected Yama');
    for (let tick = 0; tick < 240; tick++) {
      yama.vitals.hp = 30;
      if (tick === 0) engine.queueProtectionPrayer(PrayerType.ProtectRange);
      engine.advanceTick(PLAYER_POS);
    }

    const prayed = engine
      .getState()
      .damageHistory.filter((hit) => hit.source === 'YamaAttack' && hit.attackType === 'range');
    expect(prayed.length).toBeGreaterThan(5);
    for (const hit of prayed) expect([...support]).toContain(hit.effectiveDamage);
    expect(Math.max(...prayed.map((hit) => hit.effectiveDamage))).toBeGreaterThan(unboostedCeiling);
  });

  it('leaves every other contract rolling from zero to its plain max hit', () => {
    const { autoAttacks } = resolveEncounterConfig(DIVINE_SEVERANCE_CONFIG.encounter);

    const damages = landedYamaDamage(DIVINE_SEVERANCE_CONFIG, 100, 220);

    expect(Math.max(...damages)).toBeLessThanOrEqual(autoAttacks.rangedMagicDamage[1]);
    expect(Math.min(...damages)).toBeLessThan(wretchedMinimumHit(autoAttacks.rangedMagicDamage[1], 100, 2500));
  });

  const spawnDebugFlare = (config: YamaContractConfig) => {
    const engine = new SimulationEngine({ encounter: new YamaEncounter(config), startPos: PLAYER_POS });
    engine.executeEncounterCommand(YAMA_SPAWN_VOID_FLARE_COMMAND);
    const flare = getWorldState(engine)
      .getNpcs()
      .find((npc) => npc.npcTypeId === VOID_FLARE_NPC_ID);
    if (flare === undefined) throw new Error('Expected debug void flare');
    return flare;
  };

  it('takes the always-max-hit guarantee off void flares, which every other Yama fight keeps', () => {
    expect(spawnDebugFlare(BLOODIED_BLOWS_CONFIG).formulaStats?.alwaysMaximumPlayerHit).toBe(false);
    for (const config of [BASE_YAMA_CONFIG, DIVINE_SEVERANCE_CONFIG, GLYPHIC_ATTENUATION_CONFIG]) {
      expect(spawnDebugFlare(config).formulaStats?.alwaysMaximumPlayerHit).toBe(true);
    }
  });

  it('keeps void flares unsplashable in every contract, guarantee or not', () => {
    for (const config of [
      BLOODIED_BLOWS_CONFIG,
      BASE_YAMA_CONFIG,
      DIVINE_SEVERANCE_CONFIG,
      GLYPHIC_ATTENUATION_CONFIG,
    ]) {
      expect(spawnDebugFlare(config).formulaStats?.alwaysAccuratePlayerHit).toBe(true);
    }
  });

  it('seeds void flare accuracy stats from the synchronized monster dataset', () => {
    expect(spawnDebugFlare(BASE_YAMA_CONFIG).formulaStats).toMatchObject({
      levels: { defence: 100, magic: 200 },
      defensive: { stab: 0, slash: 0, crush: 0, rangedLight: 0, rangedStandard: 0, rangedHeavy: 0, magic: 0 },
    });
  });

  it('leaves Yama himself alone — the override is scoped to the flare', () => {
    const rules = new YamaEncounter(BLOODIED_BLOWS_CONFIG).getEngineRules();
    expect(rules?.monsterStatOverrides?.[YAMA_NPC_ID]).toBeUndefined();
  });

  it('keeps the Bloodied Blows low-health floor independent of the flare guarantee', () => {
    const rules = new YamaEncounter(BLOODIED_BLOWS_CONFIG).getEngineRules();
    const playerMinimumHit = rules?.playerMinimumHit;
    if (playerMinimumHit === undefined) throw new Error('Expected Bloodied Blows player minimum hit');
    const world = getWorldState(createBloodiedEngine());
    const player = world.getPlayer();
    if (player === null) throw new Error('Expected player actor');
    const context: EncounterEngineContext = { tick: 0, player, world };
    player.vitals.hp = 14;

    expect(playerMinimumHit(84, context)).toBeGreaterThanOrEqual(71);
    player.vitals.hp = 15;
    expect(playerMinimumHit(84, context)).toBeLessThan(71);
  });

  it('drops four flares per cycle, as a pair on each of two beats', () => {
    const pattern = resolveEncounterConfig(BLOODIED_BLOWS_CONFIG.encounter).attackPattern;
    const { spawnCount } = resolveEncounterConfig(BLOODIED_BLOWS_CONFIG.encounter).voidFlares;

    expect(pattern.voidFlareBeats).toEqual([3, 8]);
    expect(spawnCount).toBe(2);
    // Half a cycle apart, which is what makes it "more often" rather than "more at once".
    const [first, second] = pattern.voidFlareBeats;
    expect((second - first) * pattern.beatIntervalTicks).toBe((pattern.beatsPerCycle * pattern.beatIntervalTicks) / 2);
  });
});

describe('Glyphic Attenuation Contract', () => {
  it('leaves a non-crush attack against Yama missing on an unlucky roll', () => {
    // Not a forced miss: +666 defence in every style but crush is what makes magic
    // non-viable, so a 0.99 accuracy roll misses on the stats alone.
    const randomSpy = vi.spyOn(Math, 'random').mockReturnValue(0.99);
    const engine = createGlyphicEngine();
    engine.setEquipment({ weapon: 27275 });
    engine.setAttackTarget('yama');

    for (let i = 0; i < 6; i++) {
      engine.advanceTick([31, 33]);
    }

    const playerHit = engine
      .getState()
      .damageHistory.find((hit) => hit.source === 'PlayerAttack' && hit.targetId === 'yama');

    randomSpy.mockRestore();

    expect(playerHit).toBeDefined();
    expect(playerHit!.effectiveDamage).toBe(0);
  });

  it('restats Yama so crush is the only viable style, rather than forcing a miss', () => {
    const rules = new YamaEncounter(GLYPHIC_ATTENUATION_CONFIG).getEngineRules();
    const override = rules?.monsterStatOverrides?.[YAMA_NPC_ID];

    // Crush drops far below base phase 3's 449, which is what took the modeled hit rate from
    // 13.9% up to ~38%; everything else is pushed out of reach. A forced-miss gate would have
    // made Practice's DPS projection disagree with what combat rolls.
    expect(override?.defensive?.crush).toBe(108);
    for (const style of ['stab', 'slash', 'magic', 'light', 'standard', 'heavy'] as const) {
      expect(override?.defensive?.[style], style).toBe(666);
    }
    // Defence LEVEL is left alone: no contract states one, and the wiki gives Yama 225
    // everywhere. The captures cannot discriminate it, so the sourced number stands.
    expect(override?.skills).toBeUndefined();
    expect(getMonsterFormulaStats(YAMA_NPC_ID)?.levels.defence).toBe(225);
    expect(rules?.validateAttack).toBeUndefined();
  });

  it('inverts prayer bonus scaling for drain resistance, bottoming out at the captured 40', () => {
    const encounter = new YamaEncounter(GLYPHIC_ATTENUATION_CONFIG);
    const rules = encounter.getEngineRules();
    const world = getWorldState(createDivineEngine());
    const player = world.getPlayer();
    if (!player) throw new Error('Player actor missing');

    const resistanceAt = (prayerBonus: number) =>
      rules?.prayerDrain?.modifyDrainResistance?.(
        { totalDrainEffect: 36, drainResistance: 60 + 2 * prayerBonus, prayerBonus },
        { tick: 1, player, world },
      );

    // A 0-bonus player is unaffected; bonus makes it worse rather than better, which is the
    // whole contract line. Ordinary Yama would hand +46 a resistance of 152.
    expect(resistanceAt(0)).toBe(60);
    expect(resistanceAt(10)).toBeLessThan(resistanceAt(0)!);

    // The capture: the +46 setup in both glyphic captures drains piety + an overhead
    // (effect 36) at 0.9 points per tick, which is resistance 40 and nothing else.
    expect(resistanceAt(46)).toBe(40);
    expect(36 / resistanceAt(46)!).toBeCloseTo(0.9, 5);
  });

  /**
   * Every `DAMAGE_MAX_ME` (hitsplat 43) splat the two glyphic captures contain, against the
   * first-party max hit for the same loadout with no contract applied. The
   * client only sends that splat id on the player's actual maximum, so each row is the game
   * stating a max hit rather than a sample to be estimated from.
   */
  const MAX_HIT_SPLATS = [
    { what: 'crush vs Yama, strength 118', base: 49, captured: 83, prayerBonus: 46 },
    { what: 'crush vs Yama, strength 117', base: 48, captured: 82, prayerBonus: 46 },
    { what: 'crush vs Yama, strength 116', base: 48, captured: 82, prayerBonus: 46 },
    { what: 'Dark Demonbane vs void flare', base: 65, captured: 109, prayerBonus: 44 },
    { what: 'Dark Demonbane vs Judge of Yama', base: 49, captured: 82, prayerBonus: 44 },
  ] as const;

  it.each(MAX_HIT_SPLATS)('reproduces the captured max hit: $what', ({ base, captured, prayerBonus }) => {
    const encounter = new YamaEncounter(GLYPHIC_ATTENUATION_CONFIG);
    const rules = encounter.getEngineRules();
    const world = getWorldState(createDivineEngine());
    const player = world.getPlayer();
    if (!player) throw new Error('Player actor missing');
    Object.assign(player.equipmentStats, { prayer: prayerBonus });

    const multiplier = rules?.outgoingDamageMultiplier;
    if (typeof multiplier !== 'function') throw new Error('expected a prayer-bonus-scaled multiplier');

    expect(Math.floor(base * multiplier({ tick: 1, player, world }))).toBe(captured);
  });

  it('leaves a player with no prayer bonus dealing ordinary damage', () => {
    const encounter = new YamaEncounter(GLYPHIC_ATTENUATION_CONFIG);
    const multiplier = encounter.getEngineRules()?.outgoingDamageMultiplier;
    const world = getWorldState(createDivineEngine());
    const player = world.getPlayer();
    if (!player) throw new Error('Player actor missing');
    Object.assign(player.equipmentStats, { prayer: 0 });

    if (typeof multiplier !== 'function') throw new Error('expected a prayer-bonus-scaled multiplier');
    expect(multiplier({ tick: 1, player, world })).toBe(1);
  });
});

describe('Yama phase 3 starting hitpoints', () => {
  // Yama spawns already damaged: maxHp is the full-fight pool and hp is what is
  // left when P3 opens, matching `hpbar_hud_hp` over `hpbar_hud_basehp` in
  // the captures (base 808/2500, divine 1225/2500, forfeit 1218/2500). The
  // configured hp is the threshold itself - the highest HP that still trips the
  // transition - since the captures sit slightly under it.
  it('base Yama starts phase 3 at a third of the 2500 pool', () => {
    const boss = resolveEncounterConfig().boss;

    expect(boss.maxHp).toBe(YAMA_FULL_FIGHT_HP);
    expect(boss.hp).toBe(YAMA_P3_START_HP);
    expect(YAMA_P3_START_HP).toBe(833);
  });

  it.each([
    ['divine severance', DIVINE_SEVERANCE_CONFIG, YAMA_CONTRACT_P3_START_HP, YAMA_FULL_FIGHT_HP],
    ['forfeit breath', FORFEIT_BREATH_CONFIG, YAMA_CONTRACT_P3_START_HP, YAMA_FULL_FIGHT_HP],
    ['sensory clouding', SENSORY_CLOUDING_CONFIG, YAMA_CONTRACT_P3_START_HP, YAMA_FULL_FIGHT_HP],
    ['bloodied blows', BLOODIED_BLOWS_CONFIG, BLOODIED_BLOWS_P3_START_HP, BLOODIED_BLOWS_FULL_FIGHT_HP],
    [
      'glyphic attenuation',
      GLYPHIC_ATTENUATION_CONFIG,
      GLYPHIC_ATTENUATION_P3_START_HP,
      GLYPHIC_ATTENUATION_FULL_FIGHT_HP,
    ],
  ])('%s starts phase 3 at half its pool', (_label, contract, expectedHp, expectedMaxHp) => {
    const boss = resolveEncounterConfig(contract.encounter).boss;

    expect(boss.hp).toBe(expectedHp);
    expect(boss.maxHp).toBe(expectedMaxHp);
    expect(expectedHp).toBe(Math.floor(expectedMaxHp / 2));
  });

  it('spawns the boss actor damaged: full-fight max, phase 3 current', () => {
    const engine = createForfeitEngine(BASE_YAMA_CONFIG);
    const yama = getWorldState(engine).getNpc('yama');

    expect(yama?.vitals.maxHp).toBe(YAMA_FULL_FIGHT_HP);
    expect(yama?.vitals.hp).toBe(YAMA_P3_START_HP);
  });
});

describe('Yama victory dialogue', () => {
  function defeatYama(engine: SimulationEngine): string | undefined {
    const world = getWorldState(engine);
    const yama = world.getNpc('yama');
    if (!yama) throw new Error('Yama actor missing');
    yama.vitals.hp = 1;
    enqueueEnginePendingHit(engine, {
      sourceId: 'player',
      targetId: 'yama',
      style: 'melee',
      attackKind: 'melee_slash',
      launchTick: 0,
      impactTick: 1,
      rolledDamage: 1,
      accuracySucceeded: true,
    });
    engine.advanceTick(PLAYER_POS);

    return engine
      .getLastTickEvents()
      .filter((event) => isCoreEvent(event, 'overhead_text'))
      .find((event) => event.anchor.actorId === 'yama')?.overheadText;
  }

  it('says a parting line over his head when defeated', () => {
    const quote = defeatYama(createForfeitEngine(BASE_YAMA_CONFIG));

    expect(quote).toBeDefined();
    expect(YAMA_VICTORY_QUOTES).toContain(quote);
  });

  it('picks the line from the encounter seed so replays match', () => {
    const seeded = (seed: number) =>
      defeatYama(new SimulationEngine({ encounter: new YamaEncounter(BASE_YAMA_CONFIG, seed), startPos: PLAYER_POS }));

    expect(seeded(4242)).toBe(seeded(4242));
    // A different seed reaches a different line, so the pool is actually sampled.
    expect(new Set([1, 2, 3, 4, 5, 6, 7, 8].map(seeded)).size).toBeGreaterThan(1);
  });
});

describe('resolveEncounterConfig guards', () => {
  it('clamps a zero continuous interval, which would make `tick % interval` NaN', () => {
    const resolved = resolveEncounterConfig({ voidFlares: { continuous: true, continuousIntervalTicks: 0 } });
    expect(resolved.voidFlares.continuousIntervalTicks).toBeGreaterThanOrEqual(1);
  });

  it('defaults continuous flare hitpoints to the ordinary pool when only `hp` is set', () => {
    const resolved = resolveEncounterConfig({ voidFlares: { hp: 55 } });
    expect(resolved.voidFlares.continuousHp).toBe(55);
  });
});

describe('Yama phase 3 prayer penetration', () => {
  // Protection prayers block ranged and magic outright in phases 1-2 and leak a FRACTION of
  // the roll in phase 3. The model this replaced was a cap, which collapses almost every
  // prayed hit onto one number: `min(6, roll)` over a [0,53] roll returns exactly 6 on 89% of
  // rolls, where the two glyphic captures hold a single 6 in 47 splats.
  const spread = (reduction: PrayerReduction, maxHit: number): number[] =>
    [...Array(maxHit + 1).keys()].map((roll) =>
      calculatePrayerDamage(roll, 'magic', PrayerType.ProtectMagic, reduction),
    );

  // The last column is the most a top roll can leak, and under direct-floor arithmetic it is
  // exactly `floor(rate * maxHit)` — each one is pinned by a capture or the wiki. Base's 3 is the
  // wiki's "magic and ranged ... max hit of 3" for phase 3 and the long-P3 capture's largest
  // prayed leak; glyphic's 6 and sensory's 9 are their captures' largest.
  it.each([
    ['base Yama', BASE_YAMA_CONFIG, 46, 0.08, 3],
    ['forfeit breath', FORFEIT_BREATH_CONFIG, 53, 0.12, 6],
    ['glyphic attenuation', GLYPHIC_ATTENUATION_CONFIG, 53, 0.12, 6],
    ['bloodied blows', BLOODIED_BLOWS_CONFIG, 53, 0.06, 3],
    // 56, not the wiki's 53: an unprayed magic auto lands 56 at tick 9029 of the sensory capture.
    ['sensory clouding', SENSORY_CLOUDING_CONFIG, 56, 0.17, 9],
  ])('%s leaks a fraction of the roll through the overhead', (_label, contract, maxHit, rate, topLeak) => {
    const { rangedMagicPrayerReduction, rangedMagicDamage } = resolveEncounterConfig(contract.encounter).autoAttacks;

    expect(rangedMagicPrayerReduction).toEqual({ type: 'reduce', value: rate });
    expect(rangedMagicDamage[1]).toBe(maxHit);
    expect(spread(rangedMagicPrayerReduction, maxHit).at(-1)).toBe(topLeak);
    expect(topLeak).toBe(Math.floor(maxHit * rate));
  });

  it('spreads prayed damage across a band instead of pinning it to one value', () => {
    const { rangedMagicPrayerReduction, rangedMagicDamage } = resolveEncounterConfig(
      GLYPHIC_ATTENUATION_CONFIG.encounter,
    ).autoAttacks;
    const values = spread(rangedMagicPrayerReduction, rangedMagicDamage[1]);
    const counts = new Map<number, number>();
    for (const value of values) counts.set(value, (counts.get(value) ?? 0) + 1);

    expect([...counts.keys()].sort((a, b) => a - b)).toEqual([0, 1, 2, 3, 4, 5, 6]);
    expect(Math.max(...counts.values()) / values.length).toBeLessThan(0.2);
  });

  // `calculatePrayerDamage` converts the rate with `Math.round(value * 100)`, so a fractional
  // percent is silently quantized — 0.125 leaks as 13%. Every shipped rate must therefore be a
  // whole percent, and this is what catches the next one that is not.
  it('ships only whole-percent penetration rates', () => {
    const rates = [
      BASE_YAMA_CONFIG,
      FORFEIT_BREATH_CONFIG,
      GLYPHIC_ATTENUATION_CONFIG,
      BLOODIED_BLOWS_CONFIG,
      SENSORY_CLOUDING_CONFIG,
      DIVINE_SEVERANCE_CONFIG,
    ].flatMap((contract) => {
      const { rangedMagicPrayerReduction, meleePrayerReduction } = resolveEncounterConfig(
        contract.encounter,
      ).autoAttacks;
      return [rangedMagicPrayerReduction, meleePrayerReduction]
        .filter((reduction) => reduction.type === 'reduce')
        .map((reduction) => reduction.value ?? 0);
    });

    expect(rates.length).toBeGreaterThan(8);
    for (const rate of rates) expect(rate * 100).toBe(Math.round(rate * 100));
  });

  it('leaves divine severance blocking outright', () => {
    const { rangedMagicPrayerReduction } = resolveEncounterConfig(DIVINE_SEVERANCE_CONFIG.encounter).autoAttacks;

    expect(rangedMagicPrayerReduction).toEqual({ type: 'block' });
    expect(calculatePrayerDamage(53, 'magic', PrayerType.ProtectMagic, rangedMagicPrayerReduction)).toBe(0);
  });

  // "The melee attack can now hit up to 22 through prayer" (wiki, Yama/Strategies, Phase 3), and
  // 22 is also the largest melee leak in the long-P3 capture. 48% is the rate whose ceiling is
  // exactly that: 50% would reach 23, which neither the wiki nor any capture shows.
  it('reproduces the wiki maximum of 22 melee through prayer', () => {
    const { meleePrayerReduction, meleeDamage } = resolveEncounterConfig().autoAttacks;

    expect(meleeDamage).toEqual([0, 46]);
    expect(calculatePrayerDamage(46, 'melee', PrayerType.ProtectMelee, meleePrayerReduction)).toBe(22);
    expect(calculatePrayerDamage(20, 'melee', PrayerType.ProtectMelee, meleePrayerReduction)).toBe(9);
  });
});

describe('Yama shadow-wave damage', () => {
  // Rolled bands, read off the splats where the player stood on a lit shadow-wall tile and
  // nothing else that tick could have hit them. Base is three samples (16 18 20) from one
  // capture; sigil is seven (28 28 29 31 31 33 35) from three.
  it.each([
    ['base Yama', BASE_YAMA_CONFIG, [16, 20]],
    ['forfeit breath', FORFEIT_BREATH_CONFIG, [28, 35]],
    ['glyphic attenuation', GLYPHIC_ATTENUATION_CONFIG, [28, 35]],
  ])('%s rolls its captured band', (_label, contract, expected) => {
    expect(resolveEncounterConfig(contract.encounter).waves.damage).toEqual(expected);
  });

  it('rolls fireballs up to the wiki figure rather than always dealing it', () => {
    expect(resolveEncounterConfig().fireballs.damage).toEqual([0, 20]);
  });
});
