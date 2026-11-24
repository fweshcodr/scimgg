import { describe, expect, it, vi } from 'vitest';
import { applyBranchSplit, selectWeightedDamage, totalWeight } from '../damageSplit';
import { resolvePlayerAttack } from '../playerAttackResolution';
import type {
  BranchSplitSpec,
  NonEmptyReadonlyArray,
  PlannedHit,
  ReadyPlayerAttackPlan,
  WeightedDamageOutcome,
} from '../playerAttackTypes';

const APPLICATION = {
  outgoingDamageMultiplier: 1.25,
  specialAttackDamageMultiplier: 1.5,
} as const;

function plannedHit(overrides: Partial<PlannedHit> = {}): PlannedHit {
  return {
    style: 'melee',
    attackKind: 'melee_slash',
    impactDelayTicks: 0,
    gate: { kind: 'always' },
    accuracy: { kind: 'guaranteed' },
    damage: { kind: 'fixed', damage: 1 },
    ...overrides,
  };
}

function readyPlan(hits: ReadyPlayerAttackPlan['hits']): ReadyPlayerAttackPlan {
  return {
    kind: 'ready',
    attackSpeedTicks: 4,
    application: APPLICATION,
    hits,
  };
}

describe('resolvePlayerAttack', () => {
  it('resolves independent hits in plan order and preserves attack metadata', () => {
    const random = vi
      .fn<() => number>()
      .mockReturnValueOnce(0.1)
      .mockReturnValueOnce(0)
      .mockReturnValueOnce(0.2)
      .mockReturnValueOnce(0.999_999);
    const plan = readyPlan([
      plannedHit({
        accuracy: { kind: 'roll', chance: 0.5 },
        damage: { kind: 'uniform', minimumInclusive: 2, maximumInclusive: 6 },
      }),
      plannedHit({
        style: 'range',
        attackKind: 'range_arrow',
        impactDelayTicks: 2,
        accuracy: { kind: 'roll', chance: 0.5 },
        damage: { kind: 'uniform', minimumInclusive: 4, maximumInclusive: 9 },
      }),
    ]);

    const result = resolvePlayerAttack(plan, random);

    expect(result).toEqual({
      attackSpeedTicks: 4,
      application: APPLICATION,
      hits: [
        {
          planIndex: 0,
          style: 'melee',
          attackKind: 'melee_slash',
          impactDelayTicks: 0,
          gatePassed: true,
          accuracySucceeded: true,
          rolledDamage: 2,
        },
        {
          planIndex: 1,
          style: 'range',
          attackKind: 'range_arrow',
          impactDelayTicks: 2,
          gatePassed: true,
          accuracySucceeded: true,
          rolledDamage: 9,
        },
      ],
      selectedBranch: null,
    });
    expect(random).toHaveBeenCalledTimes(4);
  });

  it('retains a suppressed hit without evaluating its accuracy or damage', () => {
    const random = vi.fn(() => 0.9);
    const plan = readyPlan([
      plannedHit({
        accuracy: { kind: 'roll', chance: 0.5 },
        damage: { kind: 'uniform', minimumInclusive: 1, maximumInclusive: 8 },
      }),
      plannedHit({
        gate: { kind: 'ifPriorAccurate', priorHitIndex: 0 },
        accuracy: { kind: 'guaranteed' },
        damage: {
          kind: 'floorScaleOnProc',
          chance: 1,
          ratio: { numerator: 2, denominator: 1 },
          base: { kind: 'uniform', minimumInclusive: 1, maximumInclusive: 8 },
        },
      }),
    ]);

    const result = resolvePlayerAttack(plan, random);

    expect(result.hits[1]).toEqual({
      planIndex: 1,
      style: 'melee',
      attackKind: 'melee_slash',
      impactDelayTicks: 0,
      gatePassed: false,
      accuracySucceeded: false,
      rolledDamage: 0,
    });
    expect(random).toHaveBeenCalledTimes(1);
  });

  it('uses one proc roll to guarantee and replace an inaccurate ruby bolt hit', () => {
    const random = vi.fn<() => number>().mockReturnValueOnce(0.05);
    const result = resolvePlayerAttack(
      readyPlan([
        plannedHit({
          accuracy: { kind: 'roll', chance: 0 },
          damage: { kind: 'uniform', minimumInclusive: 0, maximumInclusive: 30 },
          proc: { kind: 'fixedDamage', chance: 0.06, damage: 100, selfDamageRatio: { numerator: 1, denominator: 10 } },
        }),
      ]),
      random,
    );

    expect(result.hits[0]).toMatchObject({
      accuracySucceeded: true,
      rolledDamage: 100,
      procActivated: true,
    });
    expect(random).toHaveBeenCalledTimes(1);
  });

  it('treats accurate zero as prior accuracy for both gate predicates', () => {
    const random = vi.fn(() => 0.1);
    const plan = readyPlan([
      plannedHit({ damage: { kind: 'fixed', damage: 0 } }),
      plannedHit({
        gate: { kind: 'ifPriorAccurate', priorHitIndex: 0 },
        accuracy: { kind: 'roll', chance: 0.5 },
        damage: { kind: 'fixed', damage: 4 },
      }),
      plannedHit({
        gate: { kind: 'ifPriorInaccurate', priorHitIndex: 0 },
        damage: { kind: 'fixed', damage: 7 },
      }),
    ]);

    const result = resolvePlayerAttack(plan, random);

    expect(
      result.hits.map(({ gatePassed, accuracySucceeded, rolledDamage }) => ({
        gatePassed,
        accuracySucceeded,
        rolledDamage,
      })),
    ).toEqual([
      { gatePassed: true, accuracySucceeded: true, rolledDamage: 0 },
      { gatePassed: true, accuracySucceeded: true, rolledDamage: 4 },
      { gatePassed: false, accuracySucceeded: false, rolledDamage: 0 },
    ]);
    expect(random).toHaveBeenCalledTimes(1);
  });

  it('guarantees accuracy without consuming an accuracy sample', () => {
    const random = vi.fn(() => 0.5);
    const plan = readyPlan([plannedHit({ damage: { kind: 'uniform', minimumInclusive: 5, maximumInclusive: 9 } })]);

    const result = resolvePlayerAttack(plan, random);

    expect(result.hits[0]).toMatchObject({ accuracySucceeded: true, rolledDamage: 7 });
    expect(random).toHaveBeenCalledTimes(1);
  });

  it('rolls until a referenced prior hit is accurate, then guarantees later accuracy', () => {
    const random = vi.fn<() => number>().mockReturnValueOnce(0.8).mockReturnValueOnce(0.2);
    const plan = readyPlan([
      plannedHit({ accuracy: { kind: 'roll', chance: 0.5 }, damage: { kind: 'fixed', damage: 9 } }),
      plannedHit({
        accuracy: { kind: 'rollUnlessAnyPriorAccurate', chance: 0.5, priorHitIndices: [0] },
        damage: { kind: 'fixed', damage: 0 },
      }),
      plannedHit({
        accuracy: { kind: 'rollUnlessAnyPriorAccurate', chance: 0, priorHitIndices: [0, 1] },
        damage: { kind: 'fixed', damage: 3 },
      }),
    ]);

    const result = resolvePlayerAttack(plan, random);

    expect(result.hits.map((hit) => hit.accuracySucceeded)).toEqual([false, true, true]);
    expect(result.hits.map((hit) => hit.rolledDamage)).toEqual([0, 0, 3]);
    expect(random).toHaveBeenCalledTimes(2);
  });

  it('samples prior-derived damage from resolved rolled damage without another random value', () => {
    const random = vi.fn(() => 0.6);
    const plan = readyPlan([
      plannedHit({ damage: { kind: 'uniform', minimumInclusive: 0, maximumInclusive: 10 } }),
      plannedHit({
        damage: { kind: 'floorFractionOfPriorHit', priorHitIndex: 0, numerator: 1, denominator: 2 },
      }),
    ]);

    const result = resolvePlayerAttack(plan, random);

    expect(result.hits.map((hit) => hit.rolledDamage)).toEqual([6, 3]);
    expect(random).toHaveBeenCalledTimes(1);
  });

  it('consumes RNG per hit in accuracy, base damage, then proc order', () => {
    const random = vi
      .fn<() => number>()
      .mockReturnValueOnce(0.4)
      .mockReturnValueOnce(0.6)
      .mockReturnValueOnce(0.2)
      .mockReturnValueOnce(0.7);
    const plan = readyPlan([
      plannedHit({
        accuracy: { kind: 'roll', chance: 0.5 },
        damage: {
          kind: 'floorScaleOnProc',
          chance: 0.25,
          ratio: { numerator: 2, denominator: 1 },
          base: { kind: 'uniform', minimumInclusive: 0, maximumInclusive: 9 },
        },
      }),
      plannedHit({
        gate: { kind: 'ifPriorAccurate', priorHitIndex: 0 },
        accuracy: { kind: 'roll', chance: 0.5 },
        damage: { kind: 'uniform', minimumInclusive: 20, maximumInclusive: 29 },
      }),
    ]);

    const result = resolvePlayerAttack(plan, random);

    expect(result.hits.map((hit) => hit.rolledDamage)).toEqual([12, 0]);
    expect(result.hits.map((hit) => hit.accuracySucceeded)).toEqual([true, false]);
    expect(random).toHaveBeenCalledTimes(4);
  });
});

describe('resolvePlayerAttack with a branch selection', () => {
  const BURNING_BARRAGE_SHARES: readonly BranchSplitSpec[][] = [
    [
      { fraction: { numerator: 1, denominator: 4 }, offset: 0 },
      { fraction: { numerator: 1, denominator: 4 }, offset: 0 },
      { fraction: { numerator: 1, denominator: 2 }, offset: 0 },
    ],
    [
      { fraction: { numerator: 1, denominator: 2 }, offset: -1 },
      { fraction: { numerator: 1, denominator: 2 }, offset: -1 },
      { fraction: { numerator: 0, denominator: 1 }, offset: 2 },
    ],
    [
      { fraction: { numerator: 0, denominator: 1 }, offset: 1 },
      { fraction: { numerator: 0, denominator: 1 }, offset: 1 },
      { fraction: { numerator: 1, denominator: 1 }, offset: -2 },
    ],
  ];

  /** Burning barrage's whole-swing all-miss outcomes: 0, 1 or 2 on the last splat, 20/40/40. */
  const ALL_MISS_DAMAGES = [
    [0, 0, 0],
    [0, 0, 1],
    [0, 0, 2],
  ] as const;
  const ALL_MISS_WEIGHTS: NonEmptyReadonlyArray<number> = [20, 40, 40];

  const ACCURATE = 0;
  const INACCURATE = 0.99;
  const ACCURACY_CHANCE = 0.5;

  function burningBarragePlan(fixedTotal: number): ReadyPlayerAttackPlan {
    const splat = (index: number): PlannedHit =>
      plannedHit({
        accuracy: { kind: 'whenDamagePositive' },
        damage: {
          kind: 'bySelectedBranch',
          branches: [
            BURNING_BARRAGE_SHARES[0][index],
            BURNING_BARRAGE_SHARES[1][index],
            BURNING_BARRAGE_SHARES[2][index],
          ],
          allMiss: [ALL_MISS_DAMAGES[0][index], ALL_MISS_DAMAGES[1][index], ALL_MISS_DAMAGES[2][index]],
        },
      });
    const attempt = {
      chance: ACCURACY_CHANCE,
      total: { minimumInclusive: fixedTotal, maximumInclusive: fixedTotal },
    };
    return {
      ...readyPlan([splat(0), splat(1), splat(2)]),
      branchSelection: { attempts: [attempt, attempt, attempt], allMissWeights: ALL_MISS_WEIGHTS },
    };
  }

  it('splits a first-roll total 25-25-50, losing the floored remainder', () => {
    const random = vi.fn<() => number>().mockReturnValueOnce(ACCURATE).mockReturnValue(0);

    const result = resolvePlayerAttack(burningBarragePlan(29), random);

    expect(result.selectedBranch).toEqual({ kind: 'landed', index: 0, total: 29 });
    expect(result.hits.map((hit) => hit.rolledDamage)).toEqual([7, 7, 14]);
    expect(random).toHaveBeenCalledTimes(2);
  });

  it('moves a point off each of the first two splats onto the third on a second-roll total', () => {
    const random = vi
      .fn<() => number>()
      .mockReturnValueOnce(INACCURATE)
      .mockReturnValueOnce(ACCURATE)
      .mockReturnValue(0);

    const result = resolvePlayerAttack(burningBarragePlan(16), random);

    expect(result.selectedBranch).toEqual({ kind: 'landed', index: 1, total: 16 });
    expect(result.hits.map((hit) => hit.rolledDamage)).toEqual([7, 7, 2]);
  });

  it('moves two points off the third splat onto the other two on a third-roll total', () => {
    const random = vi
      .fn<() => number>()
      .mockReturnValueOnce(INACCURATE)
      .mockReturnValueOnce(INACCURATE)
      .mockReturnValueOnce(ACCURATE)
      .mockReturnValue(0);

    const result = resolvePlayerAttack(burningBarragePlan(9), random);

    expect(result.selectedBranch).toEqual({ kind: 'landed', index: 2, total: 9 });
    expect(result.hits.map((hit) => hit.rolledDamage)).toEqual([1, 1, 7]);
  });

  it('keeps an all-miss swing zero splats inaccurate so none is raised to 1', () => {
    const random = vi.fn(() => INACCURATE);

    const result = resolvePlayerAttack(burningBarragePlan(29), random);

    expect(result.selectedBranch).toEqual({ kind: 'allMiss', outcome: 2 });
    expect(result.hits.map((hit) => hit.rolledDamage)).toEqual([0, 0, 2]);
    expect(result.hits.map((hit) => hit.accuracySucceeded)).toEqual([false, false, true]);
  });

  it('weights the all-miss total 20/40/40 across 0, 1 and 2', () => {
    const allMissTotal = (weightRoll: number): number =>
      resolvePlayerAttack(
        burningBarragePlan(29),
        vi
          .fn<() => number>()
          .mockReturnValueOnce(INACCURATE)
          .mockReturnValueOnce(INACCURATE)
          .mockReturnValueOnce(INACCURATE)
          .mockReturnValue(weightRoll),
      ).hits.reduce((total, hit) => total + hit.rolledDamage, 0);

    expect(allMissTotal(0.19)).toBe(0);
    expect(allMissTotal(0.21)).toBe(1);
    expect(allMissTotal(0.59)).toBe(1);
    expect(allMissTotal(0.61)).toBe(2);
  });
});

describe('damageSplit', () => {
  const outcomes: readonly WeightedDamageOutcome[] = [
    { damage: 0, weight: 20 },
    { damage: 1, weight: 40 },
    { damage: 2, weight: 40 },
  ];

  it('picks the outcome whose cumulative weight the roll falls inside', () => {
    expect(totalWeight(outcomes)).toBe(100);
    expect(selectWeightedDamage(outcomes, 0)).toBe(0);
    expect(selectWeightedDamage(outcomes, 0.19)).toBe(0);
    expect(selectWeightedDamage(outcomes, 0.21)).toBe(1);
    expect(selectWeightedDamage(outcomes, 0.59)).toBe(1);
    expect(selectWeightedDamage(outcomes, 0.61)).toBe(2);
  });

  it('treats each boundary as the start of the next outcome, and 1 as in range', () => {
    // Half-open bands: a roll landing exactly on a cumulative edge belongs to the outcome AFTER
    // it, so no weight is double-counted. `Math.random()` never returns 1, but the guaranteed-
    // accuracy transform feeds a literal 1 through here and must not fall off the end.
    expect(selectWeightedDamage(outcomes, 0.2)).toBe(1);
    expect(selectWeightedDamage(outcomes, 0.6)).toBe(2);
    expect(selectWeightedDamage(outcomes, 1)).toBe(2);
  });

  it('rejects an empty outcome list rather than returning a silent zero', () => {
    expect(() => selectWeightedDamage([], 0.5)).toThrow(RangeError);
  });

  it('floors a split transfer at zero so an offset cannot make a splat negative', () => {
    const takeOne: BranchSplitSpec = { fraction: { numerator: 1, denominator: 2 }, offset: -1 };
    expect(applyBranchSplit({ kind: 'landed', index: 1, total: 16 }, takeOne)).toBe(7);
    // A total of 1 gives this splat floor(0.5) = 0, and the -1 transfer would take it to -1.
    expect(applyBranchSplit({ kind: 'landed', index: 1, total: 1 }, takeOne)).toBe(0);
  });
});
