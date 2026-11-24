import { describe, expect, it } from 'vitest';
import type { NpcActor } from '../../actors/NpcActor';
import type { NpcFormulaStats } from '../../actors/types';
import { advanceNpcPoison, applyNpcPoison, POISON_PERIOD_TICKS } from '../npcPoison';

const FORMULA_STATS: NpcFormulaStats = {
  levels: { attack: 100, strength: 100, defence: 100, ranged: 100, magic: 100 },
  offensive: { atk: 100, str: 100, ranged: 100, rangedStr: 100, magic: 100, magicStr: 100 },
  defensive: { stab: 80, slash: 80, crush: 80, rangedLight: 80, rangedStandard: 80, rangedHeavy: 80, magic: 80 },
};

function makeNpc(formulaStats: NpcFormulaStats = FORMULA_STATS): NpcActor {
  return {
    id: 'target',
    kind: 'npc',
    alive: true,
    position: [10, 10],
    previousPosition: [10, 10],
    facing: 0,
    size: 1,
    vitals: { hp: 500, maxHp: 500 },
    npcTypeId: 1,
    archetypeId: 'test',
    history: new Map(),
    combat: {
      attackSpeed: 4,
      attackRange: 6,
      attackStyle: 'range',
      nextActionTick: 0,
      lastAttackTick: null,
      targetId: null,
      animations: { idle: null, walk: null, run: null, attack: null, death: null },
    },
    formulaStats,
  };
}

/** Every pulse a poison of this severity deals, in order, by running the clock to exhaustion. */
function pulseDamages(severity: number): number[] {
  const target = makeNpc();
  applyNpcPoison({ target, sourceId: 'player', severity, tick: 0 });

  const damages: number[] = [];
  for (let tick = 0; tick <= severity * POISON_PERIOD_TICKS + POISON_PERIOD_TICKS; tick++) {
    const pulse = advanceNpcPoison(target, tick);
    if (pulse !== null) damages.push(pulse.damage);
  }
  return damages;
}

describe('NPC poison', () => {
  // /w/Smoke_spells: severity 10 runs ten applications for 15 damage, severity 20 runs twenty for
  // 50. Those totals are the whole reason the severity is tracked rather than the damage.
  it('steps damage down one per five pulses and spends exactly one severity per pulse', () => {
    const weak = pulseDamages(10);
    const strong = pulseDamages(20);

    expect(weak).toEqual([2, 2, 2, 2, 2, 1, 1, 1, 1, 1]);
    expect(weak.reduce((total, damage) => total + damage, 0)).toBe(15);
    expect(strong).toEqual([4, 4, 4, 4, 4, 3, 3, 3, 3, 3, 2, 2, 2, 2, 2, 1, 1, 1, 1, 1]);
    expect(strong.reduce((total, damage) => total + damage, 0)).toBe(50);
  });

  it('pulses one full period after the hit and every period after that', () => {
    const target = makeNpc();
    applyNpcPoison({ target, sourceId: 'player', severity: 10, tick: 100 });

    const pulseTicks: number[] = [];
    for (let tick = 100; tick <= 220; tick++) {
      if (advanceNpcPoison(target, tick) !== null) pulseTicks.push(tick - 100);
    }

    // A poison applied on the hit's tick must not also pulse on it.
    expect(pulseTicks).toEqual([30, 60, 90, 120]);
  });

  it('keeps the greater severity and does not restart the cadence when re-poisoned', () => {
    const target = makeNpc();
    applyNpcPoison({ target, sourceId: 'player', severity: 10, tick: 0 });
    applyNpcPoison({ target, sourceId: 'player', severity: 20, tick: 25 });

    // Stronger poison wins; the pulse clock stays on its original 30, so re-casting cannot be used
    // to drag the next pulse forward (/w/Poison: poison does not stack).
    expect(target.poison).toEqual({ sourceId: 'player', severity: 20, nextPulseTick: 30 });

    applyNpcPoison({ target, sourceId: 'player', severity: 10, tick: 28 });
    expect(target.poison?.severity).toBe(20);
  });

  it('refuses a fully poison-resistant target', () => {
    const target = makeNpc({ ...FORMULA_STATS, poisonResistance: 100 });

    expect(applyNpcPoison({ target, sourceId: 'player', severity: 20, tick: 0 })).toBe(false);
    expect(target.poison).toBeUndefined();
  });

  it('clears poison off a dead target instead of pulsing it', () => {
    const target = makeNpc();
    applyNpcPoison({ target, sourceId: 'player', severity: 20, tick: 0 });
    target.alive = false;

    expect(advanceNpcPoison(target, 30)).toBeNull();
    expect(target.poison).toBeUndefined();
  });
});
