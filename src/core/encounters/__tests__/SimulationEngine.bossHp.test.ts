import { describe, expect, it } from 'vitest';
import { encounterControlsForKind } from '../../../encounters/modules';
import { YamaEncounter } from '../../../encounters/yamaP3/YamaEncounter';
import type { Coordinate } from '../../../types/simulation';
import { layBurnStack } from '../../combat/burnStacks';
import { SimulationEngine } from '../../SimulationEngine';
import { WorldState } from '../../WorldState';

/**
 * The practice "set boss HP" tool must work for EVERY encounter out of the box
 * via the generic engine path (`setBossHp` → clamp → set vitals). Encounters
 * only opt into extra behavior (`syncBossHp`, manifest `bossHpPresets`) when they own
 * HP-driven state such as phases. Yama has no phases, so it exercises the pure
 * generic path: direct HP set, no presets, no phase machinery.
 */
const PLAYER_START: Coordinate = [31, 37];
const YAMA_ACTOR_ID = 'yama';

function requireWorld(engine: SimulationEngine): WorldState {
  const candidate: unknown = Reflect.get(engine, 'worldState');
  if (!(candidate instanceof WorldState)) {
    throw new Error('Expected SimulationEngine world state');
  }
  return candidate;
}

function makeYamaEngine(): SimulationEngine {
  return new SimulationEngine({ encounter: new YamaEncounter(undefined, 0), startPos: [...PLAYER_START] });
}

function requireYama(engine: SimulationEngine) {
  const yama = requireWorld(engine).getNpc(YAMA_ACTOR_ID);
  if (!yama) throw new Error('Expected Yama NPC in world');
  return yama;
}

describe('SimulationEngine.setBossHp — generic (no-phase) encounters', () => {
  it('exposes no HP presets for an encounter without phases (Yama)', () => {
    expect(encounterControlsForKind('yama_p3')?.bossHpPresets ?? []).toEqual([]);
  });

  it('sets and clamps the boss HP with no encounter-specific hook', () => {
    const engine = makeYamaEngine();
    const yama = requireYama(engine);
    const maxHp = yama.vitals.maxHp;
    expect(maxHp).toBeGreaterThan(0);

    engine.setBossHp(Math.floor(maxHp / 2));
    expect(yama.vitals.hp).toBe(Math.floor(maxHp / 2));
    expect(yama.alive).toBe(true);

    engine.setBossHp(maxHp + 9999);
    expect(yama.vitals.hp).toBe(maxHp);

    engine.setBossHp(-50);
    expect(yama.vitals.hp).toBe(0);
    expect(yama.alive).toBe(false);

    engine.setBossHp(100);
    expect(yama.vitals.hp).toBe(100);
    expect(yama.alive).toBe(true);
  });

  it('is reproducible through applyAction (the replay take-over path)', () => {
    const engine = makeYamaEngine();
    const yama = requireYama(engine);
    engine.applyAction({ type: 'setBossHp', hp: 123 });
    expect(yama.vitals.hp).toBe(123);
  });

  it('keeps a revived boss alive and the encounter active after the next tick', () => {
    // Given: setting Yama to zero HP queues defeat adjudication.
    const engine = makeYamaEngine();
    const yama = requireYama(engine);
    engine.setBossHp(0);

    // When: Yama is revived before that defeat is adjudicated.
    engine.setBossHp(100);
    engine.advanceTick(PLAYER_START);

    // Then: the stale defeat does not resolve the revived encounter.
    expect(yama.vitals.hp).toBe(100);
    expect(yama.alive).toBe(true);
    expect(engine.getEncounterOutcome()).toEqual({ phase: 'active' });
  });

  it('does not resume a burn the boss died with', () => {
    const engine = makeYamaEngine();
    const yama = requireYama(engine);
    layBurnStack({
      target: yama,
      sourceId: 'player',
      origin: 'special-attack',
      severity: 'normal',
      pulses: 10,
      tick: 0,
    });
    engine.setBossHp(0);

    // Revival can precede the burn driver's next chance to observe the death.
    engine.setBossHp(100);
    const hpOnRevival = yama.vitals.hp;
    engine.advanceTick(PLAYER_START);

    expect(yama.burnStacks).toEqual([]);
    expect(yama.burnNextPulseTick).toBeUndefined();
    expect(yama.vitals.hp).toBe(hpOnRevival);
  });
});

describe('SimulationEngine.setBossHp defeat lifecycle', () => {
  it.each(['setBossHp', 'applyBossHpPreset'] as const)('%s cannot revive an adjudicated defeat', (method) => {
    const engine = makeYamaEngine();
    engine.setBossHp(0);
    engine.advanceTick(PLAYER_START);
    const outcome = engine.getEncounterOutcome();

    engine[method](239);

    expect(requireYama(engine)).toMatchObject({ alive: false, vitals: { hp: 0 } });
    expect(engine.getEncounterOutcome()).toEqual(outcome);
  });
});
