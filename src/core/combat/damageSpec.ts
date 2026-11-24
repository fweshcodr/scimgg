import { selectedBranchDamage, selectWeightedDamage } from './damageSplit';
import type { DamageSpec, FloorRatio, SelectedBranch } from './playerAttackTypes';

export function sampleDamageSpec(
  spec: DamageSpec,
  priorResolvedDamage: readonly number[],
  random: () => number,
  selectedBranch: SelectedBranch | null = null,
): number {
  const sampleBase = (base: DamageSpec): number => sampleDamageSpec(base, priorResolvedDamage, random, selectedBranch);
  switch (spec.kind) {
    case 'uniform':
      return spec.minimumInclusive + Math.floor(random() * (spec.maximumInclusive - spec.minimumInclusive + 1));
    case 'fixed':
      return spec.damage;
    case 'floorFractionOfPriorHit':
      return Math.floor(
        (getPriorResolvedDamage(priorResolvedDamage, spec.priorHitIndex) * spec.numerator) / spec.denominator,
      );
    case 'minimum':
      return Math.max(spec.minimumDamage, sampleBase(spec.base));
    case 'floorScale':
      return floorScale(sampleBase(spec.base), spec.ratio);
    case 'floorScaleOnProc': {
      const baseDamage = sampleBase(spec.base);
      return random() < spec.chance ? floorScale(baseDamage, spec.ratio) : baseDamage;
    }
    case 'addFloorScaledCopy': {
      const baseDamage = sampleBase(spec.base);
      let scaledCopy = baseDamage;
      for (const ratio of spec.stages) {
        scaledCopy = floorScale(scaledCopy, ratio);
      }
      return baseDamage + scaledCopy;
    }
    case 'weighted':
      return selectWeightedDamage(spec.outcomes, random());
    case 'bySelectedBranch':
      return selectedBranchDamage(spec, selectedBranch);
    default:
      return assertNever(spec);
  }
}

function floorScale(damage: number, ratio: FloorRatio): number {
  return Math.floor((damage * ratio.numerator) / ratio.denominator);
}

function getPriorResolvedDamage(priorResolvedDamage: readonly number[], priorHitIndex: number): number {
  const damage = priorResolvedDamage[priorHitIndex];
  if (damage === undefined) {
    throw new RangeError(`Missing resolved damage for prior hit ${priorHitIndex}`);
  }
  return damage;
}

function assertNever(value: never): never {
  throw new Error(`Unhandled damage spec: ${JSON.stringify(value)}`);
}
