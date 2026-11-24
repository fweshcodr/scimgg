import type { Coordinate } from '../../types/simulation';
import {
  FAST_PHASE_COOLDOWN_REDUCTION,
  FIRST_SPECIAL_CHANCE,
  GRAPPLE_COOLDOWN_TICKS,
  GRAPPLE_SHARE_OF_SPECIALS,
  SHIELD_COOLDOWN_TICKS,
  SHORT_FAST_TRIPLE_COOLDOWN_TICKS,
  SPEAR_COOLDOWN_TICKS,
  SPEAR_SELECTION_CHANCE,
  SPECIAL_CHANCE_AFTER_REFRACTORY,
  SPECIAL_CHANCE_CAP,
  SPECIAL_CHANCE_STEP,
  SPECIAL_REFRACTORY_REGULARS,
  TELEGRAPH_TO_GROUND_TICKS,
  TRIPLE_COOLDOWN_TICKS,
  TRIPLE_DAMAGE_LONG,
  TRIPLE_DAMAGE_SHORT,
  TRIPLE_HIT_OFFSETS_LONG,
  TRIPLE_HIT_OFFSETS_SHORT,
} from './constants';
import {
  type ArenaRect,
  INITIAL_SOL_VARIANT_MEMORY,
  rememberSolAction,
  type SolAttackStyle,
  type SolAttackVariant,
  type SolVariantMemory,
  selectSolVariant,
  solAimToward,
  solAttackTiles,
  solCentreTile,
} from './solAttacks';

/** Transitions Sol has passed: 0 is the opening, 5 is enrage (encounter `phaseForHp`). */
export type SolAttackPhase = 0 | 1 | 2 | 3 | 4 | 5;

/** Triple attack unlocks at the first transition (Wiki: below 90% HP). */
export function tripleUnlocked(phase: SolAttackPhase): boolean {
  return phase >= 1;
}

/** Grapple unlocks at the second transition (Wiki: below 75% HP). */
export function grappleUnlocked(phase: SolAttackPhase): boolean {
  return phase >= 2;
}

/** Regular attacks speed up by one tick at the 75% transition. */
export function regularsAreFast(phase: SolAttackPhase): boolean {
  return phase >= 2;
}

/**
 * At and below 50% HP the triple's third hit slips a tick and hits harder, and Sol plays the
 * longer charge animation.
 *
 * Both captures' triples agree with this phase rule. It is preferred over reading the animation
 * split as "first use of the fight" because it explains the animation AND the hit spacing with
 * one cause, and matches the Wiki's documented Phase 4 timing change. The first-use reading fits
 * the same five samples and remains an open question.
 */
export function tripleIsLong(phase: SolAttackPhase): boolean {
  return phase >= 3;
}

export type SolLaunch =
  | {
      readonly kind: 'regular';
      readonly style: SolAttackStyle;
      readonly variant: SolAttackVariant;
      readonly groundTick: number;
    }
  | { readonly kind: 'triple'; readonly long: boolean; readonly hitTicks: readonly number[] }
  | { readonly kind: 'grapple' };

/** A telegraphed regular attack. Where it lands is only decided on `resolveTick`. */
export interface PendingGround {
  readonly style: SolAttackStyle;
  readonly variant: SolAttackVariant;
  readonly resolveTick: number;
}

export interface SolGroundTiles {
  readonly style: SolAttackStyle;
  readonly centre: Coordinate;
  readonly tiles: readonly Coordinate[];
}

export interface SolAim {
  readonly position: Readonly<Coordinate>;
  readonly target: Readonly<Coordinate>;
  readonly arena: ArenaRect;
}

/**
 * The tiles a pending attack covers when aimed from `aim`. The spear direction comes from where
 * the player stands at the START of the landing tick, not at the telegraph: that fits all 63
 * captured spears, while telegraph-tick positions miss eight or nine of them (analysis section 10).
 */
export function solGroundTiles(pending: PendingGround, aim: SolAim): SolGroundTiles {
  return {
    style: pending.style,
    centre: solCentreTile(aim.position),
    tiles: solAttackTiles(
      aim.position,
      solAimToward(aim.position, aim.target),
      pending.style,
      pending.variant,
      aim.arena,
    ),
  };
}

/** A special queued by a practice command for Sol's next attack slot, whatever his HP. */
export type SolForcedSpecial = 'triple' | 'grapple';

export interface SolAttackState {
  memory: SolVariantMemory;
  forceSpearNext: boolean;
  /**
   * Practice command: the special the next ready slot launches, with the same bookkeeping as a
   * rolled one. A repeat command replaces it. With regular attacks on, a pending forced spear
   * still goes first; with them off it is the only thing Sol launches.
   */
  forcedSpecial: SolForcedSpecial | null;
  nextAttackTick: number;
  pendingGround: PendingGround | null;
  pendingTriple: { readonly tick: number; readonly damage: number; readonly index: number }[];
  /** Regular attacks since the last triple or grapple; null until the fight's first special. */
  regularsSinceSpecial: number | null;
}

// Capture analysis sections 2/4: cadence, T+3 ground, short/long triple offsets.
// Special selection is the MODEL documented at `SPECIAL_REFRACTORY_REGULARS`, not a measured rule.
export function cooldownAfter(style: SolAttackStyle, phase: SolAttackPhase): number {
  const base = style === 'spear' ? SPEAR_COOLDOWN_TICKS : SHIELD_COOLDOWN_TICKS;
  return base - (regularsAreFast(phase) ? FAST_PHASE_COOLDOWN_REDUCTION : 0);
}

export function createSolAttackState(firstAttackTick: number): SolAttackState {
  return {
    memory: { ...INITIAL_SOL_VARIANT_MEMORY },
    forceSpearNext: true,
    forcedSpecial: null,
    nextAttackTick: firstAttackTick,
    pendingGround: null,
    pendingTriple: [],
    regularsSinceSpecial: null,
  };
}

/** The chance that an unforced slot is a special, before the HP unlocks are applied. */
export function specialChance(regularsSinceSpecial: number | null): number {
  if (regularsSinceSpecial === null) return FIRST_SPECIAL_CHANCE;
  if (regularsSinceSpecial < SPECIAL_REFRACTORY_REGULARS) return 0;
  const ramp =
    SPECIAL_CHANCE_AFTER_REFRACTORY + SPECIAL_CHANCE_STEP * (regularsSinceSpecial - SPECIAL_REFRACTORY_REGULARS);
  return Math.min(SPECIAL_CHANCE_CAP, ramp);
}

export function clearSolAttacks(state: SolAttackState): void {
  state.pendingGround = null;
  state.pendingTriple = [];
}

export function solAttackReady(state: SolAttackState, tick: number): boolean {
  return state.pendingGround === null && state.pendingTriple.length === 0 && tick >= state.nextAttackTick;
}

export interface SolAttackInput {
  readonly tick: number;
  readonly phase: SolAttackPhase;
  readonly random: () => number;
  readonly grappleAvailable: boolean;
  /**
   * Practice pin for a regular attack's style. The seeded style roll is still drawn so every later
   * roll stays where it would have been. It also overrides the forced opener spear.
   */
  readonly stylePin?: SolAttackStyle;
}

/** The queued practice special this slot can launch, if any; a forced spear is the caller's concern. */
export function readyForcedSpecial(state: SolAttackState, grappleAvailable: boolean): SolForcedSpecial | null {
  return state.forcedSpecial === 'grapple' && !grappleAvailable ? null : state.forcedSpecial;
}

export function launchSolAttack(state: SolAttackState, input: SolAttackInput): SolLaunch {
  const { tick, phase, random } = input;
  // VERIFIED: all 18 captured fight/transition openers are spears (K:1340, M:904, N:4707).
  // Wiki Sol_Heredit#Fight_overview also specifies a spear after transitions, retaining variant memory.
  const forceSpear = state.forceSpearNext;
  state.forceSpearNext = false;
  const forced = forceSpear ? null : readyForcedSpecial(state, input.grappleAvailable);
  if (forced !== null) return launchSolSpecial(state, forced, input);
  // Every special needs the triple's 90% unlock; the grapple's 75% unlock only adds it as a choice.
  const chance = forceSpear || !tripleUnlocked(phase) ? 0 : specialChance(state.regularsSinceSpecial);
  if (chance > 0 && random() < chance) {
    const grapple = grappleUnlocked(phase) && input.grappleAvailable && random() < GRAPPLE_SHARE_OF_SPECIALS;
    return launchSolSpecial(state, grapple ? 'grapple' : 'triple', input);
  }
  const rolledSpear = forceSpear || random() < SPEAR_SELECTION_CHANCE;
  // A practice pin overrides even the forced opener spear: a learner who picks Shield expects only shields.
  const style: SolAttackStyle = input.stylePin ?? (rolledSpear ? 'spear' : 'shield');
  const variant = selectSolVariant(state.memory, style);
  state.memory = rememberSolAction(style, variant);
  if (state.regularsSinceSpecial !== null) state.regularsSinceSpecial += 1;
  state.nextAttackTick = tick + cooldownAfter(style, phase);
  const groundTick = tick + TELEGRAPH_TO_GROUND_TICKS;
  state.pendingGround = { style, variant, resolveTick: groundTick };
  return { kind: 'regular', style, variant, groundTick };
}

/**
 * Launches a special with the bookkeeping every special shares, rolled or forced: it consumes a
 * matching queued practice special, restarts the spacing count and counts as a style switch.
 */
export function launchSolSpecial(
  state: SolAttackState,
  kind: SolForcedSpecial,
  input: Pick<SolAttackInput, 'tick' | 'phase'>,
): SolLaunch {
  const { tick, phase } = input;
  if (state.forcedSpecial === kind) state.forcedSpecial = null;
  state.regularsSinceSpecial = 0;
  state.memory = rememberSolAction('special', state.memory.lastVariant);
  if (kind === 'grapple') {
    state.nextAttackTick = tick + GRAPPLE_COOLDOWN_TICKS;
    return { kind: 'grapple' };
  }
  const long = tripleIsLong(phase);
  const offsets = long ? TRIPLE_HIT_OFFSETS_LONG : TRIPLE_HIT_OFFSETS_SHORT;
  const damages = long ? TRIPLE_DAMAGE_LONG : TRIPLE_DAMAGE_SHORT;
  state.pendingTriple = offsets.map((offset, index) => ({ tick: tick + offset, damage: damages[index], index }));
  state.nextAttackTick =
    tick + (!long && regularsAreFast(phase) ? SHORT_FAST_TRIPLE_COOLDOWN_TICKS : TRIPLE_COOLDOWN_TICKS);
  return { kind: 'triple', long, hitTicks: state.pendingTriple.map((hit) => hit.tick) };
}

/** Consumes the pending attack on its landing tick and resolves where it lands. */
export function takeSolGroundLanding(state: SolAttackState, tick: number, aim: SolAim): SolGroundTiles | null {
  if (state.pendingGround?.resolveTick !== tick) return null;
  const landing = solGroundTiles(state.pendingGround, aim);
  state.pendingGround = null;
  return landing;
}

export function takeSolTripleHit(state: SolAttackState, tick: number) {
  const hit = state.pendingTriple.find((entry) => entry.tick === tick) ?? null;
  state.pendingTriple = state.pendingTriple.filter((entry) => entry.tick !== tick);
  return hit;
}
