import { selectedBranchDamage, totalWeight } from './damageSplit';
import type { DamageSpec, FloorRatio, SelectedBranch } from './playerAttackTypes';

type DamageMass = Map<number, number>;
type DamageOutcomeVisitor = (damage: number, probability: number) => void;

export function visitDamageSpecOutcomes(
  spec: DamageSpec,
  priorResolvedDamage: readonly number[],
  selectedBranch: SelectedBranch | null,
  visit: DamageOutcomeVisitor,
): void {
  for (const [damage, probability] of evaluateDamageSpec(spec, priorResolvedDamage, selectedBranch)) {
    visit(damage, probability);
  }
}

function evaluateDamageSpec(
  spec: DamageSpec,
  priorResolvedDamage: readonly number[],
  selectedBranch: SelectedBranch | null,
): DamageMass {
  const evaluateBase = (base: DamageSpec): DamageMass => evaluateDamageSpec(base, priorResolvedDamage, selectedBranch);
  switch (spec.kind) {
    case 'uniform': {
      const mass: DamageMass = new Map();
      const probability = 1 / (spec.maximumInclusive - spec.minimumInclusive + 1);
      for (let damage = spec.minimumInclusive; damage <= spec.maximumInclusive; damage += 1) {
        mass.set(damage, probability);
      }
      return mass;
    }
    case 'fixed':
      return new Map([[spec.damage, 1]]);
    case 'floorFractionOfPriorHit':
      return new Map([
        [
          Math.floor(
            (getPriorResolvedDamage(priorResolvedDamage, spec.priorHitIndex) * spec.numerator) / spec.denominator,
          ),
          1,
        ],
      ]);
    case 'minimum':
      return transformMass(evaluateBase(spec.base), (damage) => Math.max(spec.minimumDamage, damage));
    case 'floorScale':
      return transformMass(evaluateBase(spec.base), (damage) => floorScale(damage, spec.ratio));
    case 'floorScaleOnProc': {
      const mass: DamageMass = new Map();
      for (const [damage, probability] of evaluateBase(spec.base)) {
        addMass(mass, damage, probability * (1 - spec.chance));
        addMass(mass, floorScale(damage, spec.ratio), probability * spec.chance);
      }
      return mass;
    }
    case 'addFloorScaledCopy':
      return transformMass(evaluateBase(spec.base), (damage) => {
        let scaledCopy = damage;
        for (const ratio of spec.stages) {
          scaledCopy = floorScale(scaledCopy, ratio);
        }
        return damage + scaledCopy;
      });
    case 'weighted': {
      const mass: DamageMass = new Map();
      const total = totalWeight(spec.outcomes);
      for (const outcome of spec.outcomes) {
        addMass(mass, outcome.damage, outcome.weight / total);
      }
      return mass;
    }
    case 'bySelectedBranch':
      return new Map([[selectedBranchDamage(spec, selectedBranch), 1]]);
    default:
      return assertNever(spec);
  }
}

function transformMass(mass: ReadonlyMap<number, number>, transform: (damage: number) => number): DamageMass {
  const transformed: DamageMass = new Map();
  for (const [damage, probability] of mass) {
    addMass(transformed, transform(damage), probability);
  }
  return transformed;
}

function addMass(mass: DamageMass, damage: number, probability: number): void {
  if (probability > 0) {
    mass.set(damage, (mass.get(damage) ?? 0) + probability);
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
