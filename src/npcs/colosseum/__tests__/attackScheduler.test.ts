import { describe, expect, it } from 'vitest';
import { mulberry32 } from '../../../core/rng';
import type { Coordinate } from '../../../types/simulation';
import {
  clearSolAttacks,
  createSolAttackState,
  launchSolAttack,
  launchSolSpecial,
  type SolAttackPhase,
  specialChance,
} from '../attackScheduler';
import { SPECIAL_REFRACTORY_REGULARS } from '../constants';
import { octantToward, solAimToward } from '../solAttacks';

describe('Sol footprint-aware spear aim', () => {
  const position: Coordinate = [10, 20];
  const centre: Coordinate = [12, 22];

  it.each([
    {
      direction: 'north',
      targets: [
        [10, 25],
        [14, 25],
        [10, 26],
        [14, 26],
        [10, 30],
        [14, 30],
      ],
    },
    {
      direction: 'south',
      targets: [
        [10, 19],
        [14, 19],
        [10, 18],
        [14, 18],
        [10, 14],
        [14, 14],
      ],
    },
    {
      direction: 'east',
      targets: [
        [15, 20],
        [15, 24],
        [16, 20],
        [16, 24],
        [20, 20],
        [20, 24],
      ],
    },
    {
      direction: 'west',
      targets: [
        [9, 20],
        [9, 24],
        [8, 20],
        [8, 24],
        [4, 20],
        [4, 24],
      ],
    },
  ] satisfies {
    direction: string;
    targets: Coordinate[];
  }[])('aims $direction at both inclusive face ends, adjacent and further away', ({ direction, targets }) => {
    for (const target of targets) expect(solAimToward(position, target), `target ${target}`).toBe(direction);
  });

  it.each([
    { target: [15, 25], direction: 'north-east' },
    { target: [9, 25], direction: 'north-west' },
    { target: [15, 19], direction: 'south-east' },
    { target: [9, 19], direction: 'south-west' },
  ] satisfies { target: Coordinate; direction: string }[])('keeps the true corner diagonal $direction at $target', ({
    target,
    direction,
  }) => expect(solAimToward(position, target)).toBe(direction));

  it('preserves center/inside behavior and the octant fallback outside both axes', () => {
    for (let x = 10; x <= 14; x++) {
      for (let y = 20; y <= 24; y++) {
        expect(solAimToward(position, [x, y])).toBe(octantToward(centre, [x, y]));
      }
    }
    expect(solAimToward(position, centre)).toBe('south');
    for (const target of [
      [15, 30],
      [9, 14],
      [20, 25],
      [4, 19],
    ] satisfies Coordinate[]) {
      expect(solAimToward(position, target)).toBe(octantToward(centre, target));
    }
  });

  it.each([
    { target: [12, 22], direction: 'south' },
    { target: [8, 20], direction: 'west' },
    { target: [16, 24], direction: 'east' },
    { target: [14, 26], direction: 'north' },
    { target: [10, 18], direction: 'south' },
    { target: [14, 25], direction: 'north-east' },
    { target: [10, 25], direction: 'north-west' },
    { target: [14, 19], direction: 'south-east' },
    { target: [10, 19], direction: 'south-west' },
  ] satisfies {
    target: Coordinate;
    direction: string;
  }[])('leaves generic octant aim $direction at $target unchanged', ({ target, direction }) =>
    expect(octantToward(centre, target)).toBe(direction));
});

describe('triple cooldown', () => {
  it.each([
    { phase: 0, long: false, cooldown: 12 },
    { phase: 1, long: false, cooldown: 12 },
    { phase: 2, long: false, cooldown: 11 },
    { phase: 3, long: true, cooldown: 12 },
    { phase: 5, long: true, cooldown: 12 },
  ] as const)('acts again $cooldown ticks after a phase $phase triple', ({ phase, long, cooldown }) => {
    const state = createSolAttackState(0);
    expect(launchSolSpecial(state, 'triple', { tick: 100, phase })).toMatchObject({ kind: 'triple', long });
    expect(state.nextAttackTick).toBe(100 + cooldown);
  });
});

describe('special selection', () => {
  it('ramps the special chance with the regular attacks since the last special', () => {
    expect([null, 0, 1, 2, 3, 4, 6, 9, 10, 20].map((g) => specialChance(g))).toEqual(
      [0.25, 0, 0, 0.02, 0.095, 0.17, 0.32, 0.545, 0.6, 0.6].map((chance) => expect.closeTo(chance, 10)),
    );
  });

  /** Seeded slot stream through the production launcher, recording each slot's spacing and kind. */
  function simulate(phase: SolAttackPhase, slots: number, seed: number) {
    const state = createSolAttackState(0);
    state.forceSpearNext = false;
    const random = mulberry32(seed);
    const records: { readonly g: number | null; readonly kind: string }[] = [];
    for (let slot = 0; slot < slots; slot++) {
      const g = state.regularsSinceSpecial;
      records.push({
        g,
        kind: launchSolAttack(state, { tick: slot * 20, phase, random, grappleAvailable: true }).kind,
      });
      clearSolAttacks(state);
    }
    return records;
  }

  const isSpecial = (kind: string) => kind !== 'regular';
  const rate = (records: readonly { readonly kind: string }[]) =>
    records.filter(({ kind }) => isSpecial(kind)).length / records.length;

  it('matches the captures: about 15% of slots, the refractory and the spacing ramp', () => {
    const records = simulate(2, 40_000, 0x5011);
    // L/K/M/N: 15.3% (P1, n=98) and 14.6% (P2-5, n=260); the fitted ramp sits at about 14.5%.
    expect(rate(records)).toBeGreaterThan(0.135);
    expect(rate(records)).toBeLessThan(0.155);
    // Never within two regular attacks of the previous special (0/98 captured slots).
    expect(records.filter(({ g, kind }) => g !== null && g < SPECIAL_REFRACTORY_REGULARS && isSpecial(kind))).toEqual(
      [],
    );
    const bin = (min: number, max: number) => rate(records.filter(({ g }) => g !== null && g >= min && g <= max));
    // Captured 5/97, 21/101 and 23/46; Wilson 95% intervals 2-12%, 14-30% and 36-64%.
    expect(bin(2, 3)).toBeGreaterThan(0.03);
    expect(bin(2, 3)).toBeLessThan(0.09);
    expect(bin(4, 6)).toBeGreaterThan(0.18);
    expect(bin(4, 6)).toBeLessThan(0.28);
    expect(bin(7, Number.POSITIVE_INFINITY)).toBeGreaterThan(0.4);
    expect(bin(7, Number.POSITIVE_INFINITY)).toBeLessThan(0.52);
    // Captured 10 grapples of 38 specials below 75%.
    const specials = records.filter(({ kind }) => isSpecial(kind));
    const grappleShare = specials.filter(({ kind }) => kind === 'grapple').length / specials.length;
    expect(grappleShare).toBeGreaterThan(0.23);
    expect(grappleShare).toBeLessThan(0.3);
  });

  it('uses no specials above 90% HP and only triples above 75%', () => {
    expect(simulate(0, 2_000, 1).filter(({ kind }) => isSpecial(kind))).toEqual([]);
    const above75 = simulate(1, 4_000, 2);
    expect(rate(above75)).toBeGreaterThan(0.12);
    expect(above75.some(({ kind }) => kind === 'grapple')).toBe(false);
  });
});
