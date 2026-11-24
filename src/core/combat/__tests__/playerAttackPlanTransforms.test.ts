import { describe, expect, it, vi } from 'vitest';
import { scalePlayerAttackMaximum, transformPlayerAttackPlan } from '../playerAttackPlanTransforms';
import { projectPlayerAttack } from '../playerAttackProjection';
import { resolvePlayerAttack } from '../playerAttackResolution';
import type { BranchSplitSpec, PlannedHit, ReadyPlayerAttackPlan } from '../playerAttackTypes';

function hit(overrides: Partial<PlannedHit> = {}): PlannedHit {
  return {
    style: 'melee',
    attackKind: 'melee_slash',
    impactDelayTicks: 0,
    gate: { kind: 'always' },
    accuracy: { kind: 'roll', chance: 0.5 },
    damage: { kind: 'uniform', minimumInclusive: 0, maximumInclusive: 10 },
    ...overrides,
  };
}

function plan(hits: ReadyPlayerAttackPlan['hits']): ReadyPlayerAttackPlan {
  return {
    kind: 'ready',
    attackSpeedTicks: 4,
    application: { outgoingDamageMultiplier: 1, specialAttackDamageMultiplier: 1 },
    hits,
  };
}

describe('transformPlayerAttackPlan with a branch selection', () => {
  const SPLIT_IN_HALF = { fraction: { numerator: 1, denominator: 2 }, offset: 0 };

  function branchedPlan(chance: number): ReadyPlayerAttackPlan {
    const splat = hit({
      accuracy: { kind: 'whenDamagePositive' },
      damage: {
        kind: 'bySelectedBranch',
        branches: [SPLIT_IN_HALF, SPLIT_IN_HALF],
        allMiss: [0],
      },
    });
    return {
      ...plan([splat, splat]),
      branchSelection: {
        attempts: [
          { chance, total: { minimumInclusive: 10, maximumInclusive: 10 } },
          { chance, total: { minimumInclusive: 6, maximumInclusive: 6 } },
        ],
        allMissWeights: [1],
      },
    };
  }

  it('guarantees the swing by forcing the first branch, not by overwriting the splats', () => {
    // A void flare sets alwaysAccuratePlayerHit, so a spec fired at one must land. Every accuracy
    // attempt here would otherwise fail, which is what makes this discriminate.
    const transformed = transformPlayerAttackPlan(branchedPlan(0), {
      guaranteedAccuracy: true,
      guaranteedMaximum: false,
    });

    expect(transformed.branchSelection?.attempts[0].chance).toBe(1);
    expect(transformed.hits.map((planned) => planned.accuracy.kind)).toEqual([
      'whenDamagePositive',
      'whenDamagePositive',
    ]);

    const resolved = resolvePlayerAttack(transformed, () => 0.99);

    expect(resolved.selectedBranch).toEqual({ kind: 'landed', index: 0, total: 10 });
    expect(resolved.hits.map((resolvedHit) => resolvedHit.rolledDamage)).toEqual([5, 5]);
  });

  it('leaves the selection rolling when accuracy is not guaranteed', () => {
    const resolved = resolvePlayerAttack(branchedPlan(0), () => 0.99);

    expect(resolved.selectedBranch).toEqual({ kind: 'allMiss', outcome: 0 });
    expect(resolved.hits.map((resolvedHit) => resolvedHit.rolledDamage)).toEqual([0, 0]);
  });

  it('raises a landed swing to the encounter minimum but leaves an all-miss swing alone', () => {
    const withMinimum = transformPlayerAttackPlan(branchedPlan(1), {
      guaranteedAccuracy: false,
      guaranteedMaximum: false,
      minimumDamage: () => 4,
    });

    expect(resolvePlayerAttack(withMinimum, () => 0).hits.map((h) => h.rolledDamage)).toEqual([5, 5]);

    const missed = transformPlayerAttackPlan(branchedPlan(0), {
      guaranteedAccuracy: false,
      guaranteedMaximum: false,
      minimumDamage: () => 4,
    });
    const resolved = resolvePlayerAttack(missed, () => 0.99);

    expect(resolved.selectedBranch).toEqual({ kind: 'allMiss', outcome: 0 });
    expect(resolved.hits.map((h) => h.rolledDamage)).toEqual([0, 0]);
    expect(resolved.hits.map((h) => h.accuracySucceeded)).toEqual([false, false]);
  });

  it('pins guaranteed maximum to the guaranteed branch, not to a mix of branches', () => {
    // Burning barrage's real shape: the later branch gives its FIRST splat a bigger share than
    // branch 0 does (1/2 vs 1/4), so a splat can only take an impossible maximum from a branch
    // that guaranteed accuracy has already made unreachable.
    const splat = (branchZero: BranchSplitSpec, branchOne: BranchSplitSpec) =>
      hit({
        accuracy: { kind: 'whenDamagePositive' },
        damage: {
          kind: 'bySelectedBranch',
          branches: [branchZero, branchOne],
          allMiss: [0],
        },
      });
    const quarter: BranchSplitSpec = { fraction: { numerator: 1, denominator: 4 }, offset: 0 };
    const half: BranchSplitSpec = { fraction: { numerator: 1, denominator: 2 }, offset: 0 };
    const flatTwo: BranchSplitSpec = { fraction: { numerator: 0, denominator: 1 }, offset: 2 };
    const attack: ReadyPlayerAttackPlan = {
      ...plan([splat(quarter, half), splat(half, flatTwo)]),
      branchSelection: {
        attempts: [
          { chance: 0.5, total: { minimumInclusive: 8, maximumInclusive: 8 } },
          { chance: 0.5, total: { minimumInclusive: 8, maximumInclusive: 8 } },
        ],
        allMissWeights: [1],
      },
    };

    const guaranteed = transformPlayerAttackPlan(attack, { guaranteedAccuracy: true, guaranteedMaximum: true });
    const resolved = resolvePlayerAttack(guaranteed, () => 0.99);

    // Branch 0 on a total of 8 is 2-4. Branch 1's 4-2 is unreachable once attempt 0 is
    // guaranteed, so the first splat must not borrow its 4.
    expect(resolved.hits.map((h) => h.rolledDamage)).toEqual([2, 4]);
  });
});

describe('transformPlayerAttackPlan', () => {
  it('applies each per-hit minimum outside the existing floored damage stages for resolve and project', () => {
    const attack = plan([
      hit({
        accuracy: { kind: 'guaranteed' },
        damage: {
          kind: 'floorScale',
          ratio: { numerator: 7, denominator: 6 },
          base: { kind: 'uniform', minimumInclusive: 0, maximumInclusive: 41 },
        },
      }),
    ]);
    const minimumDamage = vi.fn((maximum: number) => maximum - 2);

    const transformed = transformPlayerAttackPlan(attack, {
      guaranteedAccuracy: false,
      guaranteedMaximum: false,
      minimumDamage,
    });
    const resolved = resolvePlayerAttack(transformed, () => 0);
    const projected = projectPlayerAttack(transformed);

    expect(minimumDamage).toHaveBeenCalledWith(47);
    expect(resolved.hits[0].rolledDamage).toBe(45);
    expect(projected.hits[0].maximumRolledDamage).toBe(47);
    expect(projected.hits[0].expectedRolledDamage).toBeCloseTo(45.07, 2);
  });

  it('guarantees every reachable hitsplat maximum before resolve and project', () => {
    const attack = plan([
      hit({
        accuracy: { kind: 'roll', chance: 0 },
        damage: { kind: 'uniform', minimumInclusive: 0, maximumInclusive: 5 },
      }),
      hit({
        gate: { kind: 'ifPriorAccurate', priorHitIndex: 0 },
        accuracy: { kind: 'roll', chance: 0 },
        damage: { kind: 'uniform', minimumInclusive: 0, maximumInclusive: 3 },
      }),
    ]);
    const random = vi.fn(() => 0.5);

    const transformed = transformPlayerAttackPlan(attack, { guaranteedAccuracy: false, guaranteedMaximum: true });
    const resolved = resolvePlayerAttack(transformed, random);
    const projected = projectPlayerAttack(transformed);

    expect(resolved.hits.map((resolvedHit) => resolvedHit.rolledDamage)).toEqual([5, 3]);
    expect(projected.hits.map((projectedHit) => projectedHit.expectedRolledDamage)).toEqual([5, 3]);
    expect(random).not.toHaveBeenCalled();
  });

  it('guarantees accuracy without pinning damage to the maximum', () => {
    const attack = plan([
      hit({
        accuracy: { kind: 'roll', chance: 0.1 },
        damage: { kind: 'uniform', minimumInclusive: 0, maximumInclusive: 10 },
      }),
      hit({
        gate: { kind: 'ifPriorAccurate', priorHitIndex: 0 },
        accuracy: { kind: 'rollUnlessAnyPriorAccurate', chance: 0.1, priorHitIndices: [0] },
        damage: { kind: 'uniform', minimumInclusive: 0, maximumInclusive: 6 },
      }),
    ]);

    const projected = projectPlayerAttack(
      transformPlayerAttackPlan(attack, { guaranteedAccuracy: true, guaranteedMaximum: false }),
    );

    for (const projectedHit of projected.hits) {
      expect(projectedHit.accuracyProbability).toBeCloseTo(1, 10);
    }
    expect(projected.hits[0].expectedRolledDamage).toBeCloseTo(5, 10);
    expect(projected.hits[1].expectedRolledDamage).toBeCloseTo(3, 10);
  });
});

describe('scalePlayerAttackMaximum', () => {
  const TWO_THIRDS = { numerator: 2, denominator: 3 };

  it('rolls uniformly up to the lowered max hit rather than scaling a full roll', () => {
    const scaled = scalePlayerAttackMaximum(plan([hit()]), TWO_THIRDS);

    expect(scaled.hits[0].damage).toEqual({ kind: 'uniform', minimumInclusive: 0, maximumInclusive: 6 });
    expect(projectPlayerAttack(scaled).hits[0].maximumRolledDamage).toBe(6);
  });

  it('lowers a fixed maximum and the roll under a minimum, keeping the minimum', () => {
    const scaled = scalePlayerAttackMaximum(
      plan([
        hit({ damage: { kind: 'fixed', damage: 40 } }),
        hit({
          damage: {
            kind: 'minimum',
            base: { kind: 'uniform', minimumInclusive: 0, maximumInclusive: 27 },
            minimumDamage: 3,
          },
        }),
      ]),
      TWO_THIRDS,
    );

    expect(scaled.hits.map((planned) => planned.damage)).toEqual([
      { kind: 'fixed', damage: 26 },
      { kind: 'minimum', base: { kind: 'uniform', minimumInclusive: 0, maximumInclusive: 18 }, minimumDamage: 3 },
    ]);
  });

  it('refuses a roll that carries no max hit to lower', () => {
    expect(() =>
      scalePlayerAttackMaximum(
        plan([hit({ damage: { kind: 'weighted', outcomes: [{ damage: 5, weight: 1 }] } })]),
        TWO_THIRDS,
      ),
    ).toThrow(RangeError);
  });
});
