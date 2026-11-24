import type { BranchSplitSpec, SelectedBranch, WeightedDamageOutcome } from './playerAttackTypes';

/**
 * Floored at 0 because a split's `offset` is a transfer between splats, not a bonus: Burning
 * barrage's second branch moves 1 from each of the first two splats onto the third, which would
 * go negative on a total roll too small to give the first two a point each.
 */
export function applyBranchSplit(
  branch: Extract<SelectedBranch, { readonly kind: 'landed' }>,
  split: BranchSplitSpec,
): number {
  return Math.max(0, Math.floor((branch.total * split.fraction.numerator) / split.fraction.denominator) + split.offset);
}

/** A `bySelectedBranch` splat's damage once the swing's branch is known. */
export function selectedBranchDamage(
  spec: {
    readonly branches: readonly BranchSplitSpec[];
    readonly allMiss: readonly number[];
    readonly minimumWhenSelected?: number;
  },
  branch: SelectedBranch | null,
): number {
  if (branch === null) throw new RangeError("A branched splat needs the swing's selected branch");
  if (branch.kind === 'allMiss') {
    const damage = spec.allMiss[branch.outcome];
    if (damage === undefined) throw new RangeError(`Missing all-miss damage for outcome ${branch.outcome}`);
    return damage;
  }
  const split = spec.branches[branch.index];
  if (split === undefined) throw new RangeError(`Missing branch split for selected branch ${branch.index}`);
  return Math.max(spec.minimumWhenSelected ?? 0, applyBranchSplit(branch, split));
}

export function totalWeight(outcomes: readonly WeightedDamageOutcome[]): number {
  return outcomes.reduce((total, outcome) => total + outcome.weight, 0);
}

export function selectWeightedDamage(outcomes: readonly WeightedDamageOutcome[], roll: number): number {
  const [first, ...rest] = outcomes;
  if (first === undefined) throw new RangeError('Expected at least one weighted damage outcome');
  let remaining = roll * totalWeight(outcomes);
  let selected = first;
  for (const outcome of [first, ...rest]) {
    selected = outcome;
    remaining -= outcome.weight;
    if (remaining < 0) return outcome.damage;
  }
  return selected.damage;
}
