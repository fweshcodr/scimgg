import { describe, expect, it } from 'vitest';
import { yamaAudioRules } from '../audio/yamaAudioRules';
import { isYamaSnapshot } from '../core/encounters/snapshot';
import { type GameEvent, isCoreEvent } from '../core/events/types';
import { SimulationEngine } from '../core/SimulationEngine';
import { YAMA_SPAWN_FIREBALL_COMMAND, YAMA_SPAWN_VOID_FLARE_COMMAND } from '../encounters/yamaP3/commands';
import { VOID_FLARE_NPC_ID } from '../encounters/yamaP3/constants';
import { YAMA_ENCOUNTER_RENDER_CONFIG } from '../encounters/yamaP3/renderConfig';
import { YamaEncounter } from '../encounters/yamaP3/YamaEncounter';
import { VOID_FLARE_DETONATED_DEATH_CAUSE } from '../npcs/yama/timing';
import { npcDespawnTimerRatio } from '../render/overlay/npcDespawnTimer';
import type { CacheInfo } from '../rs/cache/CacheInfo';
import { ObjType } from '../rs/config/objtype/ObjType';
import type { ObjTypeLoader } from '../rs/config/objtype/ObjTypeLoader';
import { SpotAnimID } from '../rs/config/spotanimtype/SpotAnimID';
import { type Coordinate, OSRS_TICK_MS } from '../types/simulation';

const WEAPON_ID = 50_004;
const PLAYER_START_POS: Coordinate = [34, 32]; // adjacent to Yama, in range, no melee

const MOCK_CACHE_INFO: CacheInfo = {
  name: 'test',
  game: 'oldschool',
  environment: 'test',
  revision: 1,
  timestamp: '2024-01-01T00:00:00Z',
  size: 0,
};

/** Minimal ranged weapon: attack range 10 (param 13), attack speed 4 (param 14). */
const createWeaponLoader = (): ObjTypeLoader => ({
  load(id: number): ObjType {
    if (id !== WEAPON_ID) throw new Error(`Unknown test item ${id}`);
    const obj = new ObjType(id, MOCK_CACHE_INFO);
    obj.wearPos1 = 3;
    obj.maleModel0 = 1;
    obj.inventoryActions = ['Wield', undefined, undefined, undefined, undefined];
    obj.params = new Map([
      [13, 10],
      [14, 4],
    ]);
    return obj;
  },
  getCount: () => 1,
  clearCache: () => {},
});

function makeAttackingEngine(overrides: Record<string, boolean> = {}): SimulationEngine {
  const engine = new SimulationEngine({ encounter: new YamaEncounter(), startPos: PLAYER_START_POS });
  engine.setObjTypeLoader(createWeaponLoader());
  engine.setEquipment({ weapon: WEAPON_ID });
  engine.setMechanicsConfig({
    yamaMageRange: false,
    yamaMelee: false,
    waves: false,
    fireballs: true,
    voidFlares: false,
    infiniteHealth: true,
    ...overrides,
  });
  engine.setAttackTarget('yama');
  return engine;
}

/** Advance to `untilTick` (always guarding canAdvance so a dead player can't spin forever). */
function advanceTo(engine: SimulationEngine, untilTick: number, clickTarget: Coordinate): void {
  while (engine.getState().currentTick < untilTick && engine.canAdvance()) {
    engine.advanceTick(clickTarget);
  }
}

/** Advance to `untilTick`, returning the ticks on which the PLAYER started an attack. */
function runCollectingPlayerAttackTicks(
  engine: SimulationEngine,
  clickTarget: Coordinate,
  untilTick: number,
): number[] {
  const attackTicks: number[] = [];
  while (engine.getState().currentTick < untilTick && engine.canAdvance()) {
    engine.advanceTick(clickTarget);
    const attacked = engine.getLastTickEvents().some((e) => e.type === 'attack_started' && e.sourceId === 'player');
    if (attacked) attackTicks.push(engine.getState().currentTick);
  }
  return attackTicks;
}

describe('HUD debug spawn buttons (end-to-end via SimulationEngine)', () => {
  it('keeps the player attacking on the SAME cadence after Spawn Fireball mid-fight', () => {
    const control = makeAttackingEngine();
    const controlTicks = runCollectingPlayerAttackTicks(control, PLAYER_START_POS, 80);

    const spawn = makeAttackingEngine();
    const before = runCollectingPlayerAttackTicks(spawn, PLAYER_START_POS, 40);
    const tickAtClick = spawn.getState().currentTick;

    spawn.queueEncounterCommand(YAMA_SPAWN_FIREBALL_COMMAND);

    // The combat clock must NOT move: rewinding the tick would shift the attack cadence.
    expect(spawn.getState().currentTick).toBe(tickAtClick);

    const after = runCollectingPlayerAttackTicks(spawn, PLAYER_START_POS, 80);
    const spawnTicks = [...before, ...after];

    expect(spawnTicks.length).toBeGreaterThan(8);
    expect(spawnTicks).toEqual(controlTicks);
  });

  it('spawns the whole 3-set fireball burst centered on the (stationary) player', () => {
    // fireballs toggle OFF: only the debug burst fires, so the spawn events are
    // unambiguous (also proves the debug button works regardless of the toggle).
    const engine = makeAttackingEngine({ fireballs: false });
    advanceTo(engine, 30, PLAYER_START_POS);

    engine.queueEncounterCommand(YAMA_SPAWN_FIREBALL_COMMAND);

    const spawnEvents: unknown[] = [];
    for (let i = 0; i < 12 && engine.canAdvance(); i++) {
      engine.advanceTick(PLAYER_START_POS);
      for (const e of engine.getLastTickEvents()) {
        if (e.type === 'fireball_spawned') spawnEvents.push(e);
      }
    }

    // A burst is 3 sets; every one lands on the player's location.
    expect(spawnEvents).toHaveLength(3);
    for (const e of spawnEvents) {
      expect(e).toMatchObject({ targetPosition: PLAYER_START_POS });
    }
  });

  it('the spawned fireball lands on and damages a stationary player (even with the toggle off)', () => {
    // fireballs toggle OFF + finite health: the ONLY damage source is the debug burst.
    const engine = makeAttackingEngine({ fireballs: false, infiniteHealth: false });
    advanceTo(engine, 20, PLAYER_START_POS);
    const hpBefore = engine.getState().playerHP;

    engine.queueEncounterCommand(YAMA_SPAWN_FIREBALL_COMMAND);
    for (let i = 0; i < 12 && engine.canAdvance(); i++) engine.advanceTick(PLAYER_START_POS);

    expect(engine.getState().playerHP).toBeLessThan(hpBefore);
  });

  it('repeated Spawn Fireball clicks do not leak ad-hoc fireball state', () => {
    const engine = makeAttackingEngine();
    advanceTo(engine, 20, PLAYER_START_POS);

    for (let click = 0; click < 5; click++) {
      engine.queueEncounterCommand(YAMA_SPAWN_FIREBALL_COMMAND);
      // 14 > the 12-tick burst lifetime, so each burst fully expires before the next click.
      for (let i = 0; i < 14 && engine.canAdvance(); i++) engine.advanceTick(PLAYER_START_POS);
    }

    const encounter = Reflect.get(engine, 'encounter') as YamaEncounter;
    const manualFireballs = encounter['state'].fireballs.manual;
    expect(manualFireballs.size).toBe(0);
  });

  it('Spawn Voidflare adds a void flare on the next tick boundary without rewinding the clock', () => {
    const engine = makeAttackingEngine({ voidFlares: true });
    runCollectingPlayerAttackTicks(engine, PLAYER_START_POS, 30);
    const tickBefore = engine.getState().currentTick;

    expect(engine.queueEncounterCommand(YAMA_SPAWN_VOID_FLARE_COMMAND)).toBe(true);

    // Nothing happens mid-tick: the clock holds and no flare exists yet.
    expect(engine.getState().currentTick).toBe(tickBefore);
    expect(engine.getState().npcs.filter((npc) => npc.npcTypeId === VOID_FLARE_NPC_ID)).toEqual([]);

    engine.advanceTick(PLAYER_START_POS);
    const spawned = engine.getLastTickEvents().filter((e) => e.type === 'voidflare_spawned');
    expect(spawned).toEqual([expect.objectContaining({ tick: tickBefore + 1 })]);
    // The first state holding the flare is its spawn tick, so its spawn clip starts at progress 0.
    const state = engine.getState();
    const flare = state.npcs.find((npc) => npc.npcTypeId === VOID_FLARE_NPC_ID);
    expect(flare?.spawnTick).toBe(state.currentTick);
  });

  it('rejects a command for another encounter without queueing it', () => {
    const engine = makeAttackingEngine();
    expect(engine.queueEncounterCommand({ encounter: 'zuk', type: 'spawn-healers' })).toBe(false);
    engine.advanceTick(PLAYER_START_POS);
    expect(engine.getState().npcs.map((npc) => npc.id)).toEqual(['yama']);
  });

  it('a reset drops a command still waiting for its tick', () => {
    const engine = makeAttackingEngine({ voidFlares: true });
    engine.queueEncounterCommand(YAMA_SPAWN_VOID_FLARE_COMMAND);
    engine.reset();
    engine.advanceTick(PLAYER_START_POS);
    expect(engine.getState().npcs.some((npc) => npc.npcTypeId === VOID_FLARE_NPC_ID)).toBe(false);
  });

  // Capture timings of a phase-3 E=600 flare: add+3 fuse bar, explosion at add+25 (Yama captures;
  // see `VOID_FLARE_CHARGE_TICKS`).
  it('runs a P3 Spawn Voidflare through the captured activation, fuse bar and detonation ticks', () => {
    const engine = makeAttackingEngine({ voidFlares: true });
    engine.setAttackTarget(null);
    advanceTo(engine, 5, PLAYER_START_POS);
    engine.queueEncounterCommand(YAMA_SPAWN_VOID_FLARE_COMMAND);
    const spawnTick = engine.getState().currentTick + 1;

    const timeline = new Map<number, { targetable: boolean; bar: number | null; events: GameEvent[] }>();
    for (let tick = spawnTick; tick <= spawnTick + 27; tick++) {
      // An attack on the flare queued now is processed on `tick`'s input band. Probe only around
      // activation, so the player's own hits cannot decide when the flare goes.
      const probe = tick > spawnTick && tick <= spawnTick + 4;
      if (probe) {
        const flareId = engine.getState().npcs.find((npc) => npc.npcTypeId === VOID_FLARE_NPC_ID)?.id;
        if (flareId) engine.applyAction({ type: 'attackTarget', targetId: flareId });
      }
      engine.advanceTick(PLAYER_START_POS);
      const state = engine.getState();
      expect(state.currentTick).toBe(tick);
      const flare = state.npcs.find((npc) => npc.npcTypeId === VOID_FLARE_NPC_ID);
      if (!flare) throw new Error(`flare missing on tick ${tick}`);
      timeline.set(tick, {
        targetable: probe && engine.getAttackTarget() === flare.id,
        bar: npcDespawnTimerRatio(flare, tick),
        events: engine.getLastTickEvents(),
      });
      engine.setAttackTarget(null);
    }
    const at = (offset: number) => {
      const entry = timeline.get(spawnTick + offset);
      if (!entry) throw new Error(`no timeline entry for +${offset}`);
      return entry;
    };

    // Inert for +0..+2: no attack lands on it, and its bars are not up.
    for (const offset of [0, 1, 2]) expect(at(offset)).toMatchObject({ targetable: false, bar: null });
    expect(at(3)).toMatchObject({ targetable: true, bar: 0 });
    expect(at(4).targetable).toBe(true);
    expect(at(13).bar).toBeCloseTo(0.5);
    expect(at(22).bar).toBeLessThan(1);
    expect(at(23).bar).toBe(1);
    expect(at(24).bar).toBe(1);

    const explodedOn = [...timeline].filter(([, entry]) => entry.events.some((e) => e.type === 'voidflare_exploded'));
    expect(explodedOn.map(([tick]) => tick)).toEqual([spawnTick + 25]);
    expect(at(25).events).toContainEqual(
      expect.objectContaining({ type: 'hitsplat_spawned', targetId: 'yama', hitsplatType: 'heal' }),
    );
    expect(at(25).events.some((e) => isCoreEvent(e, 'player_graphic_applied'))).toBe(false);
    expect(at(26).events).toContainEqual(
      expect.objectContaining({
        type: 'player_graphic_applied',
        spotAnimId: SpotAnimID.VFX_VOIDFLARE_HUMAN_IMPACT_BLUE,
      }),
    );
    expect(
      engine
        .getState()
        .damageHistory.filter((hit) => hit.source === 'VoidFlare')
        .map((hit) => hit.tick),
    ).toEqual([spawnTick + 26]);

    // Removed (`del`) two ticks after detonating: the detonated corpse clip lasts exactly that long.
    const flare = engine.getState().npcs.find((npc) => npc.npcTypeId === VOID_FLARE_NPC_ID);
    expect(flare).toMatchObject({
      alive: false,
      deathCause: VOID_FLARE_DETONATED_DEATH_CAUSE,
      despawnTick: spawnTick + 25,
    });
    const renderType = YAMA_ENCOUNTER_RENDER_CONFIG.preloadNpcTypes?.find(
      (type) => type.npcTypeId === VOID_FLARE_NPC_ID,
    );
    expect(renderType?.deathClips?.[VOID_FLARE_DETONATED_DEATH_CAUSE]?.durationMs).toBe(2 * OSRS_TICK_MS);
  });

  it('does not leak scheduled fireball spawns after the toggle is turned off mid-burst', () => {
    const engine = new SimulationEngine({ encounter: new YamaEncounter(), startPos: PLAYER_START_POS });
    const on = {
      yamaMageRange: false,
      yamaMelee: false,
      waves: false,
      fireballs: true,
      voidFlares: false,
      infiniteHealth: true,
    };
    engine.setMechanicsConfig(on);

    // Run with fireballs ON so the first scheduled burst registers (fireball beat at tick 4).
    while (engine.getState().currentTick < 4 && engine.canAdvance()) {
      engine.advanceTick(PLAYER_START_POS);
    }

    // Toggle fireballs OFF, then spawn a manual fireball so captureFireballPositions keeps
    // running (it runs while any manual fireball is active).
    engine.setMechanicsConfig({ ...on, fireballs: false });
    engine.queueEncounterCommand(YAMA_SPAWN_FIREBALL_COMMAND);

    // Advance past the scheduled sets' capture ticks (their startTicks are 7/10/13).
    const scheduledSpawnIndices: number[] = [];
    const manualSpawnIndices: number[] = [];
    while (engine.getState().currentTick < 15 && engine.canAdvance()) {
      engine.advanceTick(PLAYER_START_POS);
      for (const e of engine.getLastTickEvents()) {
        if (e.type === 'fireball_spawned') {
          const idx = (e as unknown as { fireballIndex: number }).fireballIndex;
          (idx >= 0 ? scheduledSpawnIndices : manualSpawnIndices).push(idx);
        }
      }
    }

    // No scheduled (>= 0) fireball spawn leaks while the toggle is off...
    expect(scheduledSpawnIndices).toEqual([]);
    // ...but the manual (negative-id) burst still spawns, proving capture still runs.
    expect(manualSpawnIndices.length).toBeGreaterThan(0);
  });

  it('Spawn Voidflare detonates, heals Yama and damages the player even when Void Flares is off', () => {
    const engine = new SimulationEngine({ encounter: new YamaEncounter(), startPos: PLAYER_START_POS });
    engine.setMechanicsConfig({
      yamaMageRange: false,
      yamaMelee: false,
      waves: false,
      fireballs: false,
      voidFlares: false,
      infiniteHealth: false,
    });
    advanceTo(engine, 5, PLAYER_START_POS);
    const hpBefore = engine.getState().playerHP;

    // Void Flares toggle is OFF, but the debug spawn is an always-on tool.
    engine.queueEncounterCommand(YAMA_SPAWN_VOID_FLARE_COMMAND);

    // Past two of the fight's own flare beats (61 and 131), which the off toggle must suppress.
    const events: GameEvent[] = [];
    const flareOrigins = new Map<string, string | undefined>();
    while (engine.getState().currentTick < 150 && engine.canAdvance()) {
      engine.advanceTick(PLAYER_START_POS);
      events.push(...engine.getLastTickEvents());
      for (const npc of engine.getState().npcs) {
        if (npc.npcTypeId === VOID_FLARE_NPC_ID) flareOrigins.set(npc.id, npc.spawnOrigin);
      }
    }

    expect([...flareOrigins.values()]).toEqual(['practice']);
    expect(events.filter((e) => e.type === 'voidflare_exploded')).toHaveLength(1);
    expect(events).toContainEqual(
      expect.objectContaining({ type: 'hitsplat_spawned', targetId: 'yama', hitsplatType: 'heal' }),
    );
    expect(events).toContainEqual(
      expect.objectContaining({
        type: 'player_graphic_applied',
        spotAnimId: SpotAnimID.VFX_VOIDFLARE_HUMAN_IMPACT_BLUE,
      }),
    );
    expect(engine.getState().playerHP).toBeLessThan(hpBefore);
  });

  it('Spawn Fireball shows, sounds and lands while Fireballs is off, and no scheduled set appears', () => {
    const engine = makeAttackingEngine({ fireballs: false });
    engine.setAttackTarget(null);
    engine.queueEncounterCommand(YAMA_SPAWN_FIREBALL_COMMAND);
    const visualIds = new Set<number>();
    const events: GameEvent[] = [];
    // Past several of the fight's own fireball beats (from tick 4, every 7).
    while (engine.getState().currentTick < 40 && engine.canAdvance()) {
      engine.advanceTick(PLAYER_START_POS);
      events.push(...engine.getLastTickEvents());
      const snapshot = engine.getEncounterSnapshot();
      if (!isYamaSnapshot(snapshot)) throw new TypeError('Expected Yama snapshot');
      for (const fireball of snapshot.visuals.fireballStates) visualIds.add(fireball.phaseIndex ?? 0);
    }

    // Practice fireballs carry negative instance ids; the fight's own are non-negative.
    expect([...visualIds].sort((a, b) => a - b)).toEqual([-3, -2, -1]);
    const spawned = events.filter((e) => e.type === 'fireball_spawned');
    expect(spawned.map((e) => (e as unknown as { fireballIndex: number }).fireballIndex)).toEqual([-1, -2, -3]);
    // Each spawn event plays the barrage sound.
    const resolve = yamaAudioRules.fireball_spawned?.resolve;
    if (typeof resolve !== 'function') throw new TypeError('Expected a fireball_spawned sound resolver');
    for (const event of spawned) expect(resolve(event)).toMatchObject({ kind: 'play' });
    expect(events.filter((e) => e.type === 'fireball_impact')).toHaveLength(3);
    expect(engine.getState().damageHistory.some((hit) => hit.source === 'Fireball')).toBe(true);
  });

  it('hides in-flight scheduled fireball visuals when Fireballs is toggled off', () => {
    const cfg = (fireballs: boolean) => ({
      yamaMageRange: false,
      yamaMelee: false,
      waves: false,
      fireballs,
      voidFlares: false,
      infiniteHealth: true,
    });
    const engine = new SimulationEngine({ encounter: new YamaEncounter(), startPos: PLAYER_START_POS });
    engine.setMechanicsConfig(cfg(true));

    // Advance to a tick where the first scheduled set is mid-flight (startTick 7, active 7..11).
    advanceTo(engine, 9, PLAYER_START_POS);
    const activeScheduledCount = (fireballs: boolean): number => {
      engine.setMechanicsConfig(cfg(fireballs));
      const snapshot = engine.getEncounterSnapshot();
      if (!isYamaSnapshot(snapshot)) throw new TypeError('Expected Yama snapshot');
      const states = snapshot.visuals.fireballStates;
      return states.filter((s) => s.active && (s.phaseIndex ?? -1) >= 0).length;
    };

    expect(activeScheduledCount(true)).toBeGreaterThan(0);
    expect(activeScheduledCount(false)).toBe(0);
  });
});
