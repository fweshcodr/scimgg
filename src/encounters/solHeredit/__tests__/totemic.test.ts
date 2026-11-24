import { afterEach, describe, expect, it } from 'vitest';
import { canInitiateAttackOnNpc, type NpcActor } from '../../../core/actors/NpcActor';
import { isRicochetReachable } from '../../../core/combat/player/ricochet';
import { getArenaAllowUnboundedFallback, getArenaConfig, setArenaConfig } from '../../../core/constants';
import { filterModifierSelection } from '../../../core/encounters/encounterFactory';
import { SimulationEngine } from '../../../core/SimulationEngine';
import { SOL_ACTOR_ID } from '../../../npcs/colosseum/constants';
import { healingTotemDefinition } from '../../colosseum/modifiers/totemic';
import { SOL_TOTEMIC_HEAL_AMOUNT, SOL_TOTEMIC_RESPAWN_TICKS } from '../constants';
import { SOL_HEREDIT_MODIFIERS } from '../modifiers';
import { SOL_PHASE_TRANSITIONS } from '../phases';
import { SolHereditEncounter } from '../SolHereditEncounter';

const arena = getArenaConfig();
const unbounded = getArenaAllowUnboundedFallback();
afterEach(() => setArenaConfig(arena, unbounded));

const HALF_HP_TAUNT = SOL_PHASE_TRANSITIONS[2]!.taunt;

function setup(totemic = true, combatRoll = 0.5) {
  const encounter = new SolHereditEncounter(7, totemic ? { totemic: 1 } : {});
  const engine = new SimulationEngine({ encounter, combatRandom: () => combatRoll });
  engine.setMechanicsConfig({
    infiniteHealth: true,
    solHereditAttacks: false,
    solHereditBeams: false,
    solHereditSand: false,
  });
  const world = engine['worldState'];
  const sol = world.getNpc(SOL_ACTOR_ID)!;
  const totems = () => world.getNpcs().filter(healingTotemDefinition.isActor);
  const tick = () => engine.getState().currentTick;
  const advance = () => engine.advanceTick(world.getPlayer()!.position);
  const hitSol = (damage: number) =>
    engine['combatSystem'].processAttackRequest(
      world,
      {
        attacker: world.getPlayer()!,
        target: sol,
        attack: {
          style: 'melee',
          attackKind: 'melee_slash',
          rolledDamage: damage,
          accuracySucceeded: true,
          impactDelayTicks: 0,
        },
      },
      engine['buildCombatBridge'](),
    );
  /** A landed player hit between ticks, adjudicated (and so "destroyed") at the end of the next. */
  const killTotem = (totem: NpcActor) =>
    engine['combatSystem'].processAttackRequest(
      world,
      {
        attacker: world.getPlayer()!,
        target: totem,
        attack: {
          style: 'range',
          attackKind: 'range_arrow',
          rolledDamage: 1,
          accuracySucceeded: true,
          impactDelayTicks: 0,
        },
      },
      engine['buildCombatBridge'](),
    );
  const heals = () =>
    engine
      .getLastTickEvents()
      .filter((event) => event.type === 'hitsplat_spawned' && event.hitsplatType === 'heal')
      .map((event) => (event.type === 'hitsplat_spawned' ? [event.targetId, event.amount] : []));
  const taunts = () =>
    engine
      .getLastTickEvents()
      .flatMap((event) => (event.type === 'overhead_text' ? [event.overheadText] : []))
      .filter((text) => text === HALF_HP_TAUNT);
  return { encounter, engine, world, sol, totems, tick, advance, hitSol, killTotem, heals, taunts };
}

describe('Sol Totemic', () => {
  it('is offered as a one-tier modifier and off by default', () => {
    const totemic = SOL_HEREDIT_MODIFIERS.find(({ id }) => id === 'totemic');
    expect(totemic).toMatchObject({ name: 'Totemic', icon: '/assets/encounters/modifier-totemic.png' });
    expect(totemic?.tiers).toHaveLength(1);
    expect(filterModifierSelection(SOL_HEREDIT_MODIFIERS, { totemic: 1 })).toEqual({ totemic: 1 });
    expect(filterModifierSelection(SOL_HEREDIT_MODIFIERS, { totemic: 2 })).toEqual({});
    const { sol, totems, advance, hitSol } = setup(false);
    advance();
    hitSol(1000);
    for (let n = 0; n < 30; n++) advance();
    expect(sol.vitals.hp).toBe(500);
    expect(totems()).toEqual([]);
  });

  it('spawns one totem south-west of Sol on the tick he is at half HP, aimed at him', () => {
    const { sol, totems, tick, advance, hitSol } = setup();
    for (let n = 0; n < 5; n++) advance();
    hitSol(749);
    for (let n = 0; n < 10; n++) advance();
    expect(sol.vitals.hp).toBe(751);
    expect(totems()).toEqual([]);
    hitSol(1);
    advance();
    expect(totems()).toHaveLength(1);
    expect(totems()[0]).toMatchObject({
      spawnTick: tick(),
      position: [sol.position[0] - 1, sol.position[1] - 1],
      combat: { targetId: SOL_ACTOR_ID },
    });
  });

  it('spawns north-east of his footprint when the south-west diagonal is off the arena', () => {
    const { sol, totems, advance, hitSol } = setup();
    advance();
    sol.position = [26, 32];
    hitSol(800);
    advance();
    expect(totems().map((totem) => totem.position)).toEqual([[31, 37]]);
  });

  it(`heals Sol ${SOL_TOTEMIC_HEAL_AMOUNT} every 6 ticks from spawn+13, with a heal splat`, () => {
    const { sol, totems, tick, advance, hitSol, heals } = setup();
    advance();
    hitSol(1000);
    advance();
    const spawn = tick();
    const totem = totems()[0]!;
    const healTicks: number[] = [];
    while (tick() < spawn + 31) {
      advance();
      if (heals().length > 0) {
        expect(heals()).toEqual([[SOL_ACTOR_ID, SOL_TOTEMIC_HEAL_AMOUNT]]);
        healTicks.push(tick() - spawn);
      }
    }
    expect(healTicks).toEqual([13, 19, 25, 31]);
    expect(sol.vitals.hp).toBe(500 + 4 * SOL_TOTEMIC_HEAL_AMOUNT);
    expect(totem.alive).toBe(true);
  });

  it('heals nothing once destroyed before its projectile lands', () => {
    const { sol, totems, tick, advance, hitSol, killTotem, heals } = setup();
    advance();
    hitSol(1000);
    advance();
    const spawn = tick();
    const totem = totems()[0]!;
    while (tick() < spawn + 8) advance(); // launched at spawn+7
    killTotem(totem);
    expect(totem.alive).toBe(false);
    while (tick() < spawn + 20) {
      advance();
      expect(heals()).toEqual([]);
    }
    expect(sol.vitals.hp).toBe(500);
  });

  it.each([0, 0.999])('always lands a player hit on a totem and kills it in one (combat roll %f)', (roll) => {
    const { engine, world, sol, totems, advance, hitSol } = setup(true, roll);
    advance();
    hitSol(1000);
    advance();
    const totem = totems()[0]!;
    const player = world.getPlayer()!;
    player.position = [totem.position[0] - 1, totem.position[1]];
    engine.applyAction({ type: 'attackTarget', targetId: totem.id });
    for (let n = 0; n < 6 && totem.alive; n++) advance();
    expect(totem.alive).toBe(false);
    expect(engine.getDamageHistory().filter((hit) => hit.targetId === totem.id)).toEqual([
      expect.objectContaining({ source: 'PlayerAttack', effectiveDamage: 1, hpBefore: 1, hpAfter: 0 }),
    ]);
    expect(sol.alive).toBe(true);
  });

  it('is a Venator ricochet candidate, though its spawn tile is beyond reach of Sol', () => {
    const { encounter, world, sol, totems, advance, hitSol } = setup();
    advance();
    hitSol(1000);
    advance();
    const totem = totems()[0]!;
    const validate = encounter.getEngineRules().validateAttack!;
    const ctx = { tick: world.tick, player: world.getPlayer()!, world };
    expect(validate('range_arrow', totem.id, ctx)).not.toBe(false);
    expect(canInitiateAttackOnNpc(totem, world.tick)).toBe(true);
    // Sol's center tile is three tiles from the south-west diagonal; hops reach two (Run A, 116/116).
    expect(isRicochetReachable(sol, totem)).toBe(false);
    expect(isRicochetReachable(totem, sol)).toBe(false);
  });

  it(`respawns ${SOL_TOTEMIC_RESPAWN_TICKS} ticks after the player destroys it, one at a time`, () => {
    const { sol, totems, tick, advance, hitSol, killTotem } = setup();
    advance();
    hitSol(1000);
    advance();
    const first = totems()[0]!;
    for (let n = 0; n < 10; n++) advance();
    const killed = tick();
    killTotem(first);
    hitSol(100); // still below half: no re-trigger until the respawn is due
    while (tick() < killed + SOL_TOTEMIC_RESPAWN_TICKS - 1) {
      advance();
      expect(totems().filter((totem) => totem.alive)).toEqual([]);
    }
    advance();
    const second = totems().filter((totem) => totem.alive);
    expect(second).toHaveLength(1);
    expect(second[0]).toMatchObject({ spawnTick: killed + SOL_TOTEMIC_RESPAWN_TICKS });
    expect(second[0]!.id).not.toBe(first.id);
    expect(sol.alive).toBe(true);
  });

  it('never adds a second totem while one lives, even when heals lift Sol back over half and he drops again', () => {
    const { sol, totems, tick, advance, hitSol } = setup();
    advance();
    hitSol(760); // 740
    advance();
    const spawn = tick();
    const totem = totems()[0]!;
    while (tick() < spawn + 13) advance();
    expect(sol.vitals.hp).toBe(740 + SOL_TOTEMIC_HEAL_AMOUNT); // healed back over half
    hitSol(200); // and down through it again
    while (tick() < spawn + 3 * SOL_TOTEMIC_RESPAWN_TICKS) {
      advance();
      expect(totems()).toEqual([totem]);
    }
    expect(totem.alive).toBe(true);
  });

  it('respawns whatever his HP once the delay has run (MODEL)', () => {
    const { sol, totems, tick, advance, hitSol, killTotem } = setup();
    advance();
    hitSol(1000);
    advance();
    const killed = tick();
    killTotem(totems()[0]!);
    advance();
    sol.vitals.hp = 1400; // as if heals had lifted him back over half before the kill
    while (tick() < killed + SOL_TOTEMIC_RESPAWN_TICKS) advance();
    expect(totems().filter((totem) => totem.alive)).toHaveLength(1);
  });

  it('never repeats a transition the heals undo, and still heals across thresholds', () => {
    const { engine, sol, totems, tick, advance, hitSol, taunts } = setup();
    engine.setBossHp(1000); // phase 2, synced without a taunt
    advance();
    hitSol(260); // 740: crosses 50%
    let announced = 0;
    for (let n = 0; n < 12; n++) {
      advance();
      announced += taunts().length;
    }
    expect(announced).toBe(1);
    const spawn = totems()[0]!.spawnTick!;
    while (tick() < spawn + 13) advance();
    expect(sol.vitals.hp).toBe(740 + SOL_TOTEMIC_HEAL_AMOUNT);
    hitSol(100); // 715: below 50% again
    for (let n = 0; n < 20; n++) {
      advance();
      announced += taunts().length;
    }
    expect(announced).toBe(1);
  });

  it('removes its totems when Sol dies', () => {
    const { engine, world, sol, totems, advance, hitSol } = setup();
    advance();
    hitSol(1000);
    advance();
    expect(totems()).toHaveLength(1);
    hitSol(500);
    expect(sol.alive).toBe(false);
    advance();
    expect(totems()).toEqual([]);
    expect(engine.getLastTickEvents()).toContainEqual(expect.objectContaining({ type: 'actor_despawned' }));
    expect(world.getNpc(SOL_ACTOR_ID)).toBe(sol);
  });

  it('starts over on a boss HP preset: totems go and half HP re-arms the first', () => {
    const { engine, totems, tick, advance, hitSol } = setup();
    advance();
    hitSol(1000);
    advance();
    expect(totems()).toHaveLength(1);
    engine.applyBossHpPreset(1500);
    advance();
    expect(totems()).toEqual([]);
    for (let n = 0; n < 5; n++) advance();
    expect(totems()).toEqual([]);
    engine.applyBossHpPreset(750);
    advance();
    expect(totems()).toHaveLength(1);
    expect(totems()[0]!.spawnTick).toBe(tick());
  });
});
