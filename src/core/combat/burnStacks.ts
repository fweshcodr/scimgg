import { clearBurnStacks, type NpcActor, type NpcBurnOrigin } from '../actors/NpcActor';
import type { ActorId, NpcBurnImmunity } from '../actors/types';

/**
 * /w/Burn: all stacks share one four-tick target cadence; adding a stack must not restart it.
 */
export const BURN_PERIOD_TICKS = 4;

/**
 * /w/Burn: the five-stack cap spans all sources; excess burns are discarded, not replaced.
 */
export const MAX_ACTIVE_BURN_STACKS = 5;

export type BurnSeverity = 'weak' | 'normal' | 'strong' | 'incendiary';

// /w/Burn: immunity rejects burns at or below its severity.
const SEVERITY_RANK: Record<BurnSeverity, number> = { weak: 0, normal: 1, strong: 2, incendiary: 3 };
const IMMUNITY_RANK: Record<NpcBurnImmunity, number> = { Weak: 0, Normal: 1, Strong: 2 };

export function isImmuneToBurn(target: NpcActor, severity: BurnSeverity): boolean {
  // /w/Burn: incendiary burns bypass immunity.
  if (severity === 'incendiary') return false;
  const immunity = target.formulaStats?.burnImmunity;
  if (immunity === undefined || immunity === null) return false;
  return SEVERITY_RANK[severity] <= IMMUNITY_RANK[immunity];
}

export interface LayBurnStackInput {
  readonly target: NpcActor;
  readonly sourceId: ActorId;
  readonly origin: NpcBurnOrigin;
  readonly severity: BurnSeverity;
  readonly pulses: number;
  readonly tick: number;
  /**
   * Applies only to a fresh cadence; joining stacks use the target's existing clock.
   */
  readonly firstPulseDelayTicks?: number;
}

/**
 * Check eligibility before rolling burn chance; an ineligible roll shifts later replay RNG.
 */
export function canLayBurnStack(target: NpcActor, severity: BurnSeverity): boolean {
  if (!target.alive) return false;
  if (isImmuneToBurn(target, severity)) return false;
  return (target.burnStacks?.length ?? 0) < MAX_ACTIVE_BURN_STACKS;
}

export function layBurnStack(input: LayBurnStackInput): boolean {
  const { target, severity, tick } = input;
  if (!canLayBurnStack(target, severity)) return false;

  const stacks = target.burnStacks ?? [];
  if (stacks.length === 0) {
    target.burnNextPulseTick = tick + (input.firstPulseDelayTicks ?? BURN_PERIOD_TICKS);
  }
  target.burnStacks = [...stacks, { origin: input.origin, sourceId: input.sourceId, pulsesRemaining: input.pulses }];
  return true;
}

export interface BurnPulse {
  readonly sourceId: ActorId;
  /** "the entity will take damage equal to the number of burn stacks they currently have" (/w/Burn). */
  readonly stackCount: number;
}

export function advanceBurnStacks(target: NpcActor, currentTick: number): BurnPulse | null {
  const stacks = target.burnStacks;
  if (stacks === undefined || stacks.length === 0) return null;
  if (!target.alive) {
    clearBurnStacks(target);
    return null;
  }
  if (target.burnNextPulseTick === undefined || target.burnNextPulseTick > currentTick) return null;

  // Counted before the decrement: a stack on its final pulse still deals damage on the pulse that ends it.
  const pulse: BurnPulse = { sourceId: stacks[0].sourceId, stackCount: stacks.length };

  const surviving = stacks.flatMap((stack) =>
    stack.pulsesRemaining <= 1 ? [] : [{ ...stack, pulsesRemaining: stack.pulsesRemaining - 1 }],
  );
  target.burnStacks = surviving;
  target.burnNextPulseTick = surviving.length === 0 ? undefined : currentTick + BURN_PERIOD_TICKS;
  return pulse;
}
