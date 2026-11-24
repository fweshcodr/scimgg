import type { AccuracySpec, DamageSpec, HitGate, PlannedHit, SelectedBranch } from './playerAttackTypes';

type FutureDependencies = {
  readonly accuracyIndices: readonly number[];
  readonly damageIndices: readonly number[];
  readonly usesSelectedBranch: boolean;
};

export function collectFutureDependencies(hits: readonly PlannedHit[], startIndex: number): FutureDependencies {
  const accuracyIndices = new Set<number>();
  const damage: DamageDependencies = { priorHitIndices: new Set<number>(), selectedBranch: false };
  for (const hit of hits.slice(startIndex)) {
    collectGateAccuracyIndex(hit.gate, accuracyIndices);
    collectAccuracyIndices(hit.accuracy, accuracyIndices);
    collectDamageIndices(hit.damage, damage);
  }
  return {
    accuracyIndices: [...accuracyIndices].filter((index) => index < startIndex),
    damageIndices: [...damage.priorHitIndices].filter((index) => index < startIndex),
    usesSelectedBranch: damage.selectedBranch,
  };
}

export function dependencyKey(
  priorAccuracy: readonly boolean[],
  priorDamage: readonly number[],
  selectedBranch: SelectedBranch | null,
  dependencies: FutureDependencies,
): string {
  const accuracy = dependencies.accuracyIndices.map((index) => getPriorAccuracy(priorAccuracy, index));
  const damage = dependencies.damageIndices.map((index) => getPriorDamage(priorDamage, index));
  const branch = dependencies.usesSelectedBranch ? selectedBranch : null;
  return JSON.stringify([accuracy, damage, branch]);
}

function collectGateAccuracyIndex(gate: HitGate, indices: Set<number>): void {
  switch (gate.kind) {
    case 'always':
      return;
    case 'ifPriorAccurate':
    case 'ifPriorInaccurate':
      indices.add(gate.priorHitIndex);
      return;
    default:
      assertNever(gate);
  }
}

function collectAccuracyIndices(spec: AccuracySpec, indices: Set<number>): void {
  switch (spec.kind) {
    case 'roll':
    case 'guaranteed':
    case 'whenDamagePositive':
      return;
    case 'rollUnlessAnyPriorAccurate':
      for (const index of spec.priorHitIndices) {
        indices.add(index);
      }
      return;
    default:
      assertNever(spec);
  }
}

type DamageDependencies = {
  readonly priorHitIndices: Set<number>;
  selectedBranch: boolean;
};

function collectDamageIndices(spec: DamageSpec, collected: DamageDependencies): void {
  switch (spec.kind) {
    case 'uniform':
    case 'fixed':
    case 'weighted':
      return;
    case 'floorFractionOfPriorHit':
      collected.priorHitIndices.add(spec.priorHitIndex);
      return;
    case 'minimum':
    case 'floorScale':
    case 'floorScaleOnProc':
    case 'addFloorScaledCopy':
      collectDamageIndices(spec.base, collected);
      return;
    case 'bySelectedBranch':
      collected.selectedBranch = true;
      return;
    default:
      assertNever(spec);
  }
}

function getPriorAccuracy(priorAccuracy: readonly boolean[], index: number): boolean {
  const accuracy = priorAccuracy[index];
  if (accuracy === undefined) {
    throw new RangeError(`Missing accuracy result for prior hit ${index}`);
  }
  return accuracy;
}

function getPriorDamage(priorDamage: readonly number[], index: number): number {
  const damage = priorDamage[index];
  if (damage === undefined) {
    throw new RangeError(`Missing resolved damage for prior hit ${index}`);
  }
  return damage;
}

function assertNever(value: never): never {
  throw new Error(`Unhandled player attack projection dependency: ${JSON.stringify(value)}`);
}
