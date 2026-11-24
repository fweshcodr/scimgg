import { afterEach, describe, expect, it } from 'vitest';
import { getArenaAllowUnboundedFallback, getArenaConfig, setArenaConfig } from '../../../core/constants';
import { filterModifierSelection } from '../../../core/encounters/encounterFactory';
import { SimulationEngine } from '../../../core/SimulationEngine';
import { SOL_ACTOR_ID } from '../../../npcs/colosseum/constants';
import { isInsideArena } from '../../../npcs/colosseum/solAttacks';
import { WARBAND_SLOT_OFFSETS, warbanderDefinition } from '../../../npcs/colosseum/warband';
import { PrayerType } from '../../../types/simulation';
import {
  SOL_ARENA,
  SOL_BEES_SPAWN_TICK,
  SOL_PLAYER_START,
  SOL_QUARTET_SPAWN_TICK,
  SOL_QUARTET_SPAWN_TILES,
} from '../constants';
import { SOL_HEREDIT_MODIFIERS } from '../modifiers';
import { SolHereditEncounter } from '../SolHereditEncounter';
import { WARBAND_SPAWN_TICKS } from './fixtures/warbandSpawnCapture';

const arena = getArenaConfig();
const unbounded = getArenaAllowUnboundedFallback();
afterEach(() => setArenaConfig(arena, unbounded));

function setup(seed = 7, quartet = true) {
  const encounter = new SolHereditEncounter(seed, quartet ? { quartet: 1 } : {});
  const engine = new SimulationEngine({ encounter, combatRandom: () => 0.5 });
  engine.setMechanicsConfig({
    infiniteHealth: true,
    solHereditAttacks: false,
    solHereditBeams: false,
    solHereditSand: false,
  });
  const world = engine['worldState'];
  const warbanders = () => world.getNpcs().filter(warbanderDefinition.isActor);
  const advance = () => engine.advanceTick(world.getPlayer()!.position);
  const advanceTo = (tick: number) => {
    while (engine.getState().currentTick < tick) advance();
  };
  return { engine, world, warbanders, advance, advanceTo };
}

describe('Sol Quartet', () => {
  it('is offered as a one-tier modifier and off by default', () => {
    const quartet = SOL_HEREDIT_MODIFIERS.find(({ id }) => id === 'quartet');
    expect(quartet?.tiers).toHaveLength(1);
    expect(filterModifierSelection(SOL_HEREDIT_MODIFIERS, { quartet: 1 })).toEqual({ quartet: 1 });
    expect(filterModifierSelection(SOL_HEREDIT_MODIFIERS, { quartet: 2 })).toEqual({});
    const { warbanders, advanceTo } = setup(7, false);
    advanceTo(40);
    expect(warbanders()).toEqual([]);
  });

  it('derives control+3 from the wave anchor and draws from the captured extra-member tiles', () => {
    const extras: number[][] = [];
    for (const { waveMessage, adds } of WARBAND_SPAWN_TICKS) {
      // Every warband enters on its "Wave: N" tick; Bees follow five ticks later (B:2361 -> 2366).
      expect(waveMessage).toBe(true);
      const berserker = adds.find(([npcId]) => npcId === 12816)!;
      const centre = [berserker[1], berserker[2] - 1];
      for (const [, x, y] of adds) {
        if (x === centre[0] && y === centre[1]! - 1) extras.push([x, y]);
      }
    }
    expect(extras).toEqual(SOL_QUARTET_SPAWN_TILES);
    expect(SOL_QUARTET_SPAWN_TICK).toBe(SOL_BEES_SPAWN_TICK - 5);
    for (const tile of SOL_QUARTET_SPAWN_TILES) expect(isInsideArena(tile, SOL_ARENA)).toBe(true);
  });

  it('spawns one warbander at control+3 that keeps the south slot and never moves on its spawn tick', () => {
    const { engine, warbanders, advance, advanceTo } = setup();
    advanceTo(SOL_QUARTET_SPAWN_TICK - 1);
    expect(warbanders()).toEqual([]);
    advance();
    const [warbander] = warbanders();
    expect(warbanders()).toHaveLength(1);
    expect(warbander).toMatchObject({ id: 'sol_quartet_warbander', spawnTick: SOL_QUARTET_SPAWN_TICK });
    expect(SOL_QUARTET_SPAWN_TILES).toContainEqual(warbander!.position);
    expect(warbander!.state.slotOffset).toEqual(WARBAND_SLOT_OFFSETS.quartet);
    expect(warbander!.state.fallbackOffsets).toEqual([]);
    const spawnTile = [...warbander!.position];
    advance();
    expect(warbander!.position).toEqual(spawnTile);
    advanceTo(30);
    // The player has not moved, so it now stands on the player's south tile.
    expect(warbander!.position).toEqual([SOL_PLAYER_START[0], SOL_PLAYER_START[1] - 1]);
    expect(engine.getState().npcs.filter((npc) => npc.id === 'sol_quartet_warbander')).toHaveLength(1);
  });

  it('picks berserker, archer or seer from the seeded stream', () => {
    const roles = new Set<string>();
    for (let seed = 0; seed < 20; seed++) {
      const { warbanders, advanceTo } = setup(seed);
      advanceTo(SOL_QUARTET_SPAWN_TICK);
      expect(warbanders()).toHaveLength(1);
      roles.add(warbanders()[0]!.state.role);
    }
    expect([...roles].sort()).toEqual(['archer', 'berserker', 'seer']);
  });

  it('hits on its phase from the south slot, and a matching protection prayer blocks it', () => {
    const { engine, world, warbanders, advanceTo } = setup(0);
    advanceTo(SOL_QUARTET_SPAWN_TICK);
    const warbander = warbanders()[0]!;
    const prayer = {
      berserker: PrayerType.ProtectMelee,
      archer: PrayerType.ProtectRange,
      seer: PrayerType.ProtectMagic,
    }[warbander.state.role];
    engine.queueProtectionPrayer(prayer);
    advanceTo(40);
    const hits = engine.getDamageHistory().filter((hit) => hit.targetId === 'player');
    const phase = { berserker: 3, seer: 4, archer: 5 }[warbander.state.role];
    // Every member's hit lands the tick after its attack (berserker C:1801 -> 1802).
    const delay = 1;
    expect(hits.length).toBeGreaterThan(0);
    for (const hit of hits) {
      expect(hit).toMatchObject({
        source: 'FremennikWarbandAttack',
        sourceNpcTypeId: warbander.npcTypeId,
        prayedCorrectly: true,
        effectiveDamage: 0,
      });
      expect((hit.tick - delay - SOL_QUARTET_SPAWN_TICK - phase) % 6).toBe(0);
    }
    expect(world.getPlayer()!.vitals.hp).toBe(world.getPlayer()!.vitals.maxHp);
  });

  it('is not replaced after it dies', () => {
    const { engine, world, warbanders, advance, advanceTo } = setup();
    advanceTo(SOL_QUARTET_SPAWN_TICK);
    const warbander = warbanders()[0]!;
    engine['combatSystem'].processAttackRequest(
      world,
      {
        attacker: world.getPlayer()!,
        target: warbander,
        attack: {
          style: 'melee',
          attackKind: 'melee_slash',
          rolledDamage: 99,
          accuracySucceeded: true,
          impactDelayTicks: 0,
        },
      },
      engine['buildCombatBridge'](),
    );
    expect(warbander.alive).toBe(false);
    for (let tick = SOL_QUARTET_SPAWN_TICK; tick < 60; tick++) {
      advance();
      expect(warbanders().every((npc) => npc === warbander && !npc.alive)).toBe(true);
    }
  });

  it('leaves with the crystals at Sol death+1', () => {
    const { engine, world, warbanders, advance, advanceTo } = setup();
    advanceTo(SOL_QUARTET_SPAWN_TICK);
    engine['combatSystem'].processAttackRequest(
      world,
      {
        attacker: world.getPlayer()!,
        target: world.getNpc(SOL_ACTOR_ID)!,
        attack: {
          style: 'melee',
          attackKind: 'melee_slash',
          rolledDamage: 1500,
          accuracySucceeded: true,
          impactDelayTicks: 1,
        },
      },
      engine['buildCombatBridge']({ enablePendingHits: true }),
    );
    advance(); // Sol dies this tick.
    expect(warbanders()).toHaveLength(1);
    advance();
    expect(warbanders()).toEqual([]);
    expect(engine.getLastTickEvents()).toContainEqual(
      expect.objectContaining({ type: 'actor_despawned', actorId: 'sol_quartet_warbander' }),
    );
  });

  it('replays the same draws and route after a reset', () => {
    const { engine, warbanders, advance } = setup(11);
    const config = engine.getRunConfig();
    const trail: string[] = [];
    for (let tick = 1; tick <= 30; tick++) {
      advance();
      trail.push(JSON.stringify(warbanders().map((npc) => [npc.state.role, npc.position])));
    }
    engine.reset(undefined, config);
    for (let tick = 1; tick <= 30; tick++) {
      advance();
      expect(JSON.stringify(warbanders().map((npc) => [npc.state.role, npc.position]))).toBe(trail[tick - 1]);
    }
  });
});
