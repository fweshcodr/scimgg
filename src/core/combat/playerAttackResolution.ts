import { sampleDamageSpec } from './damageSpec';
import type {
  AccuracySpec,
  BranchSelectionSpec,
  HitGate,
  HitProcSpec,
  PlannedHit,
  ReadyPlayerAttackPlan,
  ResolvedAttack,
  ResolvedHit,
  SelectedBranch,
} from './playerAttackTypes';

type HitResolutionContext = {
  readonly plannedHit: PlannedHit;
  readonly planIndex: number;
  readonly priorHits: readonly ResolvedHit[];
  readonly selectedBranch: SelectedBranch | null;
  readonly random: () => number;
};

export function resolvePlayerAttack(plan: ReadyPlayerAttackPlan, random: () => number): ResolvedAttack {
  const selectedBranch = plan.branchSelection === undefined ? null : selectBranch(plan.branchSelection, random);
  const [firstPlannedHit, ...remainingPlannedHits] = plan.hits;
  const firstResolvedHit = resolvePlannedHit({
    plannedHit: firstPlannedHit,
    planIndex: 0,
    priorHits: [],
    selectedBranch,
    random,
  });
  const resolvedHits: [ResolvedHit, ...ResolvedHit[]] = [firstResolvedHit];

  for (const [remainingIndex, plannedHit] of remainingPlannedHits.entries()) {
    resolvedHits.push(
      resolvePlannedHit({
        plannedHit,
        planIndex: remainingIndex + 1,
        priorHits: resolvedHits,
        selectedBranch,
        random,
      }),
    );
  }

  return {
    attackSpeedTicks: plan.attackSpeedTicks,
    application: plan.application,
    hits: resolvedHits,
    selectedBranch,
  };
}

function selectBranch(selection: BranchSelectionSpec, random: () => number): SelectedBranch {
  for (const [index, attempt] of selection.attempts.entries()) {
    if (random() >= attempt.chance) continue;
    const { minimumInclusive, maximumInclusive } = attempt.total;
    return {
      kind: 'landed',
      index,
      total: minimumInclusive + Math.floor(random() * (maximumInclusive - minimumInclusive + 1)),
    };
  }
  return { kind: 'allMiss', outcome: selectWeightedIndex(selection.allMissWeights, random()) };
}

function selectWeightedIndex(weights: readonly number[], roll: number): number {
  let remaining = roll * weights.reduce((total, weight) => total + weight, 0);
  for (const [index, weight] of weights.entries()) {
    remaining -= weight;
    if (remaining < 0) return index;
  }
  return weights.length - 1;
}

function resolvePlannedHit(context: HitResolutionContext): ResolvedHit {
  const gatePassed = resolveGate(context.plannedHit.gate, context.priorHits);
  const priorDamage = context.priorHits.map((hit) => hit.rolledDamage);
  const delivery = {
    planIndex: context.planIndex,
    style: context.plannedHit.style,
    attackKind: context.plannedHit.attackKind,
    impactDelayTicks: context.plannedHit.impactDelayTicks,
  };

  if (context.plannedHit.accuracy.kind === 'whenDamagePositive') {
    const rolledDamage = gatePassed
      ? sampleDamageSpec(context.plannedHit.damage, priorDamage, context.random, context.selectedBranch)
      : 0;
    return { ...delivery, gatePassed, accuracySucceeded: rolledDamage > 0, rolledDamage };
  }

  const procActivated =
    gatePassed && context.plannedHit.proc !== undefined && context.random() < context.plannedHit.proc.chance;
  const accuracySucceeded =
    gatePassed && (procActivated || resolveAccuracy(context.plannedHit.accuracy, context.priorHits, context.random));
  const rolledDamage = accuracySucceeded
    ? procActivated
      ? sampleProcDamage(context.plannedHit.proc, context.random)
      : sampleDamageSpec(context.plannedHit.damage, priorDamage, context.random, context.selectedBranch)
    : 0;

  return {
    ...delivery,
    gatePassed,
    accuracySucceeded,
    rolledDamage,
    ...(procActivated ? { procActivated: true } : {}),
    ...(procActivated &&
    context.plannedHit.proc?.kind === 'fixedDamage' &&
    context.plannedHit.proc.selfDamageRatio !== undefined
      ? { procSelfDamageRatio: context.plannedHit.proc.selfDamageRatio }
      : {}),
  };
}

function sampleProcDamage(proc: HitProcSpec | undefined, random: () => number): number {
  if (proc === undefined) throw new TypeError('Expected an activated hit proc');
  switch (proc.kind) {
    case 'fixedDamage':
      return proc.damage;
    case 'uniformDamage':
      return proc.minimumInclusive + Math.floor(random() * (proc.maximumInclusive - proc.minimumInclusive + 1));
    default:
      return assertNever(proc);
  }
}

function resolveGate(gate: HitGate, priorHits: readonly ResolvedHit[]): boolean {
  switch (gate.kind) {
    case 'always':
      return true;
    case 'ifPriorAccurate':
      return getPriorHit(priorHits, gate.priorHitIndex).accuracySucceeded;
    case 'ifPriorInaccurate':
      return !getPriorHit(priorHits, gate.priorHitIndex).accuracySucceeded;
    default:
      return assertNever(gate);
  }
}

function resolveAccuracy(accuracy: AccuracySpec, priorHits: readonly ResolvedHit[], random: () => number): boolean {
  switch (accuracy.kind) {
    case 'roll':
      return random() < accuracy.chance;
    case 'guaranteed':
      return true;
    case 'rollUnlessAnyPriorAccurate':
      return accuracy.priorHitIndices.some((index) => getPriorHit(priorHits, index).accuracySucceeded)
        ? true
        : random() < accuracy.chance;
    case 'whenDamagePositive':
      throw new TypeError('whenDamagePositive accuracy is resolved from rolled damage, not by rolling');
    default:
      return assertNever(accuracy);
  }
}

function getPriorHit(priorHits: readonly ResolvedHit[], priorHitIndex: number): ResolvedHit {
  const priorHit = priorHits[priorHitIndex];
  if (priorHit === undefined) {
    throw new RangeError(`Missing resolved prior hit ${priorHitIndex}`);
  }
  return priorHit;
}

function assertNever(value: never): never {
  throw new Error(`Unhandled player attack variant: ${JSON.stringify(value)}`);
}
