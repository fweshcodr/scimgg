import { projectPlayerAttack } from './playerAttackProjection';
import type { DamageSpec, FloorRatio, PlannedHit, ReadyPlayerAttackPlan } from './playerAttackTypes';

export type PlayerAttackPlanTransformOptions = {
  readonly guaranteedAccuracy: boolean;
  readonly guaranteedMaximum: boolean;
  readonly minimumDamage?: (maximumRolledDamage: number) => number;
};

export function transformPlayerAttackPlan(
  plan: ReadyPlayerAttackPlan,
  options: PlayerAttackPlanTransformOptions,
): ReadyPlayerAttackPlan {
  let transformed = plan;
  if (options.guaranteedAccuracy || options.guaranteedMaximum) {
    // A `whenDamagePositive` splat has no roll of its own to guarantee; the swing's one roll is
    // the branch selection below. Dropping the ternary silently leaves that selection rolling,
    // so a void flare's guaranteed spec still misses.
    transformed = mapHits(transformed, (hit) =>
      hit.accuracy.kind === 'whenDamagePositive' ? hit : { ...hit, accuracy: { kind: 'guaranteed' } },
    );
    if (transformed.branchSelection !== undefined) {
      const [firstAttempt, ...remainingAttempts] = transformed.branchSelection.attempts;
      transformed = {
        ...transformed,
        branchSelection: {
          ...transformed.branchSelection,
          attempts: [{ ...firstAttempt, chance: 1 }, ...remainingAttempts],
        },
      };
    }
  }
  if (options.guaranteedMaximum) {
    const maxima = projectPlayerAttack(transformed).hits;
    transformed = mapHits(transformed, (hit, index) => ({
      ...hit,
      damage: { kind: 'fixed', damage: maxima[index]?.maximumRolledDamage ?? 0 },
    }));
  }

  const minimumDamageFor = options.minimumDamage;
  if (minimumDamageFor !== undefined) {
    const maxima = projectPlayerAttack(transformed).hits;
    transformed = mapHits(transformed, (hit, index) => ({
      ...hit,
      damage: minimumDamage(hit.damage, minimumDamageFor(maxima[index]?.maximumRolledDamage ?? 0)),
    }));
  }
  return transformed;
}

/**
 * Lowers each hit's maximum to `floor(max * ratio)` and rolls uniformly up to it, as a reduced
 * max hit does: not the same as scaling a full roll, which skips values. Only plain rolls carry a
 * max hit to lower; a minimum (a seeking arrow's) is kept on the lowered roll.
 */
export function scalePlayerAttackMaximum(plan: ReadyPlayerAttackPlan, ratio: FloorRatio): ReadyPlayerAttackPlan {
  return mapHits(plan, (hit) => ({ ...hit, damage: scaleMaximum(hit.damage, ratio) }));
}

function scaleMaximum(damage: DamageSpec, ratio: FloorRatio): DamageSpec {
  switch (damage.kind) {
    case 'uniform': {
      const maximumInclusive = Math.floor((damage.maximumInclusive * ratio.numerator) / ratio.denominator);
      return { ...damage, minimumInclusive: Math.min(damage.minimumInclusive, maximumInclusive), maximumInclusive };
    }
    case 'fixed':
      return { ...damage, damage: Math.floor((damage.damage * ratio.numerator) / ratio.denominator) };
    case 'minimum':
      return { ...damage, base: scaleMaximum(damage.base, ratio) };
    default:
      throw new RangeError(`Cannot lower the maximum of a ${damage.kind} damage roll`);
  }
}

function mapHits(
  plan: ReadyPlayerAttackPlan,
  transform: (hit: PlannedHit, index: number) => PlannedHit,
): ReadyPlayerAttackPlan {
  const [firstHit, ...remainingHits] = plan.hits;
  return {
    ...plan,
    hits: [transform(firstHit, 0), ...remainingHits.map((hit, index) => transform(hit, index + 1))],
  };
}

function minimumDamage(base: DamageSpec, minimum: number): DamageSpec {
  return base.kind === 'bySelectedBranch'
    ? { ...base, minimumWhenSelected: minimum }
    : { kind: 'minimum', base, minimumDamage: minimum };
}
