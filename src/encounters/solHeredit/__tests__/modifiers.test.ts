import { afterEach, describe, expect, it } from 'vitest';
import { getArenaAllowUnboundedFallback, getArenaConfig, setArenaConfig } from '../../../core/constants';
import { filterModifierSelection } from '../../../core/encounters/encounterFactory';
import { resolveSetupNotes } from '../../../core/encounters/setupNotes';
import { SimulationEngine } from '../../../core/SimulationEngine';
import { SOL_ACTOR_ID } from '../../../npcs/colosseum/constants';
import { solDefinition } from '../../../npcs/colosseum/sol';
import { createEmptyCombatSupplies } from '../../../types/encounterLoadout';
import { createEmptyInventory } from '../../../types/inventory';
import { createDefaultStats } from '../../../types/playerState';
import { encounterRegistry } from '../../registry';
import { createSimulationEngineForNewRun, createSimulationEngineFromRunConfig } from '../../simulationEngineFactory';
import { SAND_DAMAGE_ONSET_TICKS } from '../constants';
import { SOL_HEREDIT_MODIFIERS, SOL_HEREDIT_SETUP_NOTES } from '../modifiers';
import { SolHereditEncounter } from '../SolHereditEncounter';

const arena = getArenaConfig();
const unbounded = getArenaAllowUnboundedFallback();
afterEach(() => setArenaConfig(arena, unbounded));

describe('Sol setup notes', () => {
  const note = {
    id: 'halberd-without-myopia',
    message: 'Noxious halberd in loadout, but Myopia is off.',
  };

  it('warns for an equipped noxious halberd with Myopia off and registers the rules', () => {
    const rules = encounterRegistry.getDescriptor('sol_heredit')?.setupNotes;
    expect(rules).toBe(SOL_HEREDIT_SETUP_NOTES);
    expect(resolveSetupNotes(rules, { equipment: { weapon: 29796 }, inventory: undefined, modifiers: {} })).toEqual([
      note,
    ]);
  });

  it('warns for a noxious halberd in inventory with Myopia off', () => {
    const inventory = createEmptyInventory();
    inventory[5] = { id: 29796 };
    expect(resolveSetupNotes(SOL_HEREDIT_SETUP_NOTES, { equipment: {}, inventory, modifiers: {} })).toEqual([note]);
  });

  it.each([1, 2, 3] as const)('does not warn when Myopia tier %i is selected', (tier) => {
    expect(
      resolveSetupNotes(SOL_HEREDIT_SETUP_NOTES, {
        equipment: { weapon: 29796 },
        inventory: createEmptyInventory(),
        modifiers: { myopia: tier },
      }),
    ).toEqual([]);
  });

  it('does not warn when the loadout has no noxious halberd', () => {
    expect(
      resolveSetupNotes(SOL_HEREDIT_SETUP_NOTES, {
        equipment: { weapon: 4151 },
        inventory: createEmptyInventory(),
        modifiers: {},
      }),
    ).toEqual([]);
  });
});

function setup() {
  const encounter = new SolHereditEncounter(7, { doom: 3, blasphemy: 3 });
  const engine = new SimulationEngine({ encounter, combatRandom: () => 0.5 });
  engine.setMechanicsConfig({ solHereditAttacks: false, solHereditBeams: false });
  const world = engine['worldState'];
  const sol = world.getNpcs().find((npc) => npc.id === SOL_ACTOR_ID);
  if (!sol || !solDefinition.isActor(sol)) throw new Error('Sol did not spawn');
  return { encounter, engine, world, sol, player: world.getPlayer()! };
}

describe('Sol composes Colosseum rules', () => {
  it('counts a real sand hit and drains prayer', () => {
    const { engine, player } = setup();
    engine.executeEncounterCommand({ encounter: 'sol_heredit', type: 'strike-sand' });
    for (let tick = 0; tick < SAND_DAMAGE_ONSET_TICKS; tick++) engine.advanceTick(player.position);
    expect(player.vitals.hp).toBe(92);
    expect(player.prayerState.points).toBe(96);
    expect(engine.getState().encounter).toMatchObject({
      state: { doomStacks: 1, modifiers: { doom: 3, blasphemy: 3 } },
    });
    expect(engine.getLastTickEvents().filter((event) => event.type === 'hitsplat_spawned')).toMatchObject([
      { amount: 7, hitsplatType: 'damage' },
      { amount: 1, hitsplatType: 'doom' },
    ]);
  });

  it('routes NPC combat hits through the same hook, including separate same-tick hits', () => {
    const { engine, world, sol, player } = setup();
    for (const amount of [0, 15, 35]) {
      engine['combatSystem'].processAttackRequest(
        world,
        {
          attacker: sol,
          target: player,
          attack: {
            style: 'typeless',
            attackKind: 'typeless',
            rolledDamage: amount,
            accuracySucceeded: true,
            impactDelayTicks: 0,
          },
        },
        engine['buildCombatBridge'](),
      );
    }
    expect(player.prayerState.points).toBe(69);
    expect(engine.getState().encounter).toMatchObject({ state: { doomStacks: 2 } });
  });

  it('keeps Doom after Sol dies and resets it only on run reset', () => {
    const { engine, encounter } = setup();
    engine['applyDamage'](1, 'typeless', 'TestHazard', 0);
    engine.setBossHp(0);
    engine.advanceTick(engine.getState().playerPosition);
    expect(engine.getState().encounter).toMatchObject({ state: { doomStacks: 1 } });
    for (let n = 0; n < 4; n++) engine['applyDamage'](1, 'typeless', 'TestHazard', 1);
    expect(engine.getState().failedCondition).toBe('Doom');
    engine.reset();
    expect(engine.getState().encounter).toMatchObject({ state: { doomStacks: 0 } });
    expect(encounter.modifiers).toEqual({ doom: 3, blasphemy: 3 });
  });

  it('honors infinite health enabled after the run starts', () => {
    const { engine, player } = setup();
    engine.executeEncounterCommand({ encounter: 'sol_heredit', type: 'strike-sand' });
    engine.advanceTick(player.position);
    engine.setMechanicsConfig({ infiniteHealth: true });
    for (let tick = 0; tick < 10; tick++) engine.advanceTick(player.position);
    expect(engine.getState().encounter).toMatchObject({ state: { doomStacks: expect.any(Number) } });
    expect(player.alive).toBe(true);
    expect(engine.getState().failedCondition).toBeNull();
  });
});

describe('modifier selection and reconstruction', () => {
  it('filters removed/invalid saved picker entries and does not offer modifiers to other encounters', () => {
    expect(filterModifierSelection(SOL_HEREDIT_MODIFIERS, { removed: 1, doom: 3, myopia: 2 })).toEqual({
      doom: 3,
      myopia: 2,
    });
    expect(filterModifierSelection(SOL_HEREDIT_MODIFIERS, JSON.parse('{"doom":4,"frailty":"2"}'))).toEqual({});
    expect(filterModifierSelection(undefined, { doom: 3 })).toEqual({});
  });

  it.each([
    { unknown: true },
    { modifiers: { unknown: 1 } },
    { modifiers: { doom: 0 } },
    { modifiers: { myopia: 4 } },
    { modifiers: { blasphemy: '3' } },
    { modifiers: [] },
    { modifiers: null },
  ])('rejects invalid module options %j', (options) => {
    expect(() => encounterRegistry.create('sol_heredit', options)).toThrow();
  });

  it('records options and reconstructs the same selection/rules through the module factory', () => {
    const modifiers = { doom: 2, frailty: 2, blasphemy: 3, myopia: 1, solarflare: 1, volatility: 2, bees: 2 } as const;
    const engine = createSimulationEngineForNewRun({
      encounterConfig: { kind: 'sol_heredit', options: { modifiers }, mechanics: {} },
      enableIntro: false,
      stats: createDefaultStats(),
      equipment: {},
      inventory: createEmptyInventory(),
      combatSupplies: createEmptyCombatSupplies(),
      attackStylePerCategory: {},
      combatSeed: 7,
    });
    const config = engine.getRunConfig();
    expect(config.bootstrap?.encounterConfig).toEqual({ modifiers });
    const rebuilt = createSimulationEngineFromRunConfig(JSON.parse(JSON.stringify(config)), null);
    expect(rebuilt).not.toBeNull();
    expect(rebuilt!.getState().encounter).toEqual(engine.getState().encounter);
    expect(rebuilt!['worldState'].getPlayer()!.vitals.maxHp).toBe(80);
    rebuilt!['applyDamage'](15, 'typeless', 'TestHazard', 0);
    expect(rebuilt!.getState().encounter).toMatchObject({ state: { modifiers, doomStacks: 1 } });
    expect(rebuilt!['worldState'].getPlayer()!.prayerState.points).toBe(90);
  });
});
