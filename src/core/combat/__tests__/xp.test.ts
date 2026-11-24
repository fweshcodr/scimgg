import { describe, expect, it } from 'vitest';
import type { XpSkill } from '../../events/types';
import { accumulateXpDeltas, computeXpGains } from '../xp';

function gainsToMap(gains: ReturnType<typeof computeXpGains>): Record<string, number> {
  return Object.fromEntries(gains.map((g) => [g.skill, g.xp]));
}

describe('computeXpGains', () => {
  it('melee Accurate grants 4x attack + 1.33x hitpoints', () => {
    const gains = gainsToMap(computeXpGains('melee', 'Accurate', 30));
    expect(gains.attack).toBe(120);
    expect(gains.hitpoints).toBeCloseTo(40, 5);
    expect(gains.strength).toBeUndefined();
  });

  it('melee Aggressive grants 4x strength', () => {
    const gains = gainsToMap(computeXpGains('melee', 'Aggressive', 10));
    expect(gains.strength).toBe(40);
    expect(gains.attack).toBeUndefined();
  });

  it('melee Defensive grants 4x defence', () => {
    const gains = gainsToMap(computeXpGains('melee', 'Defensive', 10));
    expect(gains.defence).toBe(40);
  });

  it('melee Controlled splits 1.33x across attack/strength/defence', () => {
    const gains = gainsToMap(computeXpGains('melee', 'Controlled', 30));
    expect(gains.attack).toBeCloseTo(40, 5);
    expect(gains.strength).toBeCloseTo(40, 5);
    expect(gains.defence).toBeCloseTo(40, 5);
    expect(gains.hitpoints).toBeCloseTo(40, 5);
  });

  it('ranged Rapid grants 4x ranged', () => {
    const gains = gainsToMap(computeXpGains('range', 'Rapid', 25));
    expect(gains.ranged).toBe(100);
    expect(gains.defence).toBeUndefined();
  });

  it('ranged Longrange splits 2x ranged + 2x defence', () => {
    const gains = gainsToMap(computeXpGains('range', 'Longrange', 25));
    expect(gains.ranged).toBe(50);
    expect(gains.defence).toBe(50);
  });

  it('magic casting grants 2x magic', () => {
    const gains = gainsToMap(computeXpGains('magic', 'Casting', 40));
    expect(gains.magic).toBe(80);
  });

  it('magic Defensive Casting grants 1.33x magic + 1x defence', () => {
    const gains = gainsToMap(computeXpGains('magic', 'Defensive Casting', 30));
    expect(gains.magic).toBeCloseTo(40, 5);
    expect(gains.defence).toBe(30);
  });

  it('typeless damage grants nothing', () => {
    expect(computeXpGains('typeless', 'Accurate', 30)).toEqual([]);
  });

  it('zero damage grants nothing', () => {
    expect(computeXpGains('melee', 'Accurate', 0)).toEqual([]);
  });
});

describe('accumulateXpDeltas', () => {
  it('returns integer deltas and mutates the counters', () => {
    const counters: Partial<Record<XpSkill, number>> = {};
    const deltas = accumulateXpDeltas(counters, computeXpGains('melee', 'Aggressive', 10));
    expect(deltas).toEqual([
      { skill: 'strength', amount: 40 },
      { skill: 'hitpoints', amount: 13 },
    ]);
    expect(counters.strength).toBe(40);
    expect(counters.hitpoints).toBeCloseTo(13.3333, 3);
  });

  it('alternates fractional hitpoints drops like the real client (13/13/14)', () => {
    const counters: Partial<Record<XpSkill, number>> = {};
    const amounts: number[] = [];
    for (let i = 0; i < 3; i++) {
      const deltas = accumulateXpDeltas(counters, computeXpGains('melee', 'Aggressive', 10));
      amounts.push(deltas.find((d) => d.skill === 'hitpoints')?.amount ?? 0);
    }
    expect(amounts).toEqual([13, 13, 14]);
    expect(counters.hitpoints).toBeCloseTo(40, 5);
  });

  it('omits zero deltas', () => {
    const counters: Partial<Record<XpSkill, number>> = { hitpoints: 0.5 };
    const deltas = accumulateXpDeltas(counters, [{ skill: 'hitpoints', xp: 0.2 }]);
    expect(deltas).toEqual([]);
  });
});

describe('accumulateXpDeltas float stability', () => {
  it('floor(float-accumulated cumulative) matches the exact total over a long session', () => {
    // 10k hits of 10 damage — far longer than any real fight.
    const counters: Partial<Record<XpSkill, number>> = {};
    let hpTotal = 0;
    let strTotal = 0;
    const N = 10000;
    const dmg = 10;
    for (let i = 0; i < N; i++) {
      const deltas = accumulateXpDeltas(counters, computeXpGains('melee', 'Aggressive', dmg));
      hpTotal += deltas.find((d) => d.skill === 'hitpoints')?.amount ?? 0;
      strTotal += deltas.find((d) => d.skill === 'strength')?.amount ?? 0;
    }
    // Hitpoints train at 4/3 xp per damage; the summed integer drops must equal
    // the floor of the exact cumulative (no binary-precision drift).
    expect(hpTotal).toBe(Math.floor((N * dmg * 4) / 3));
    // Strength is an exact 4x integer rate — no fractional accumulation at all.
    expect(strTotal).toBe(N * dmg * 4);
  });
});
