import type { EquipmentSlot } from '../../core/actors/types';
import type { EnvironmentalDamage, EquipmentClickSlot } from '../../core/encounters/types';
import { CHAT_HIGHLIGHT_COLORS } from '../../core/events/gameMessages';
import type { OverheadTextSegment } from '../../core/events/types';
import { GRAPPLE_FAIL_MAX_HIT, GRAPPLE_WINDOW_TICKS, SOL_CHAT_NAME } from './constants';

export interface GrappleTarget {
  readonly slot: EquipmentSlot;
  readonly taunt: string;
  /** The word the overhead highlights in white; always a substring of `taunt`. */
  readonly bodyPart: string;
}

// Wiki slot mapping; FEET and LEGS observed at K:4093 and M:8436.
export const GRAPPLE_TARGETS: readonly GrappleTarget[] = [
  { slot: 'body', taunt: "I'LL CRUSH YOUR BODY!", bodyPart: 'BODY' },
  { slot: 'cape', taunt: "I'LL BREAK YOUR BACK!", bodyPart: 'BACK' },
  { slot: 'hands', taunt: "I'LL TWIST YOUR HANDS OFF!", bodyPart: 'HANDS' },
  { slot: 'legs', taunt: "I'LL BREAK YOUR LEGS!", bodyPart: 'LEGS' },
  { slot: 'boots', taunt: "I'LL CUT YOUR FEET OFF!", bodyPart: 'FEET' },
];

export const GRAPPLE_TAUNT_COLOR = '#ff0000';
const GRAPPLE_BODY_PART_COLOR = '#ffffff';

/**
 * The overhead is red with the body part in white, in all four captured grapples:
 * `<col=ff0000>I'LL CUT YOUR <col=ffffff>FEET<col=FF0000> OFF!` (K:3468; M:6070, N:8616/14989 LEGS).
 * HANDS matches it too (L:4698). BODY and BACK are assumed to follow the same markup.
 */
export function grappleTauntSegments(target: GrappleTarget): readonly OverheadTextSegment[] {
  const start = target.taunt.indexOf(target.bodyPart);
  const end = start + target.bodyPart.length;
  return [
    { text: target.taunt.slice(0, start) },
    { text: target.bodyPart, color: GRAPPLE_BODY_PART_COLOR },
    { text: target.taunt.slice(end) },
  ];
}

/**
 * The game message sent with the overhead, e.g. L:4698
 * `Sol Heredit: @mes_hl_red@I'LL TWIST YOUR <col=ffffff>HANDS<col=FF0000> OFF!`. As captured, the
 * text before the body part is the red highlight and the text after it the overhead's plain red.
 */
export function grappleWarningMessage(target: GrappleTarget): readonly OverheadTextSegment[] {
  const [before, bodyPart, after] = grappleTauntSegments(target);
  return [
    { text: `${SOL_CHAT_NAME}: ` },
    { text: before.text, color: CHAT_HIGHLIGHT_COLORS.red },
    bodyPart,
    { text: after.text, color: GRAPPLE_TAUNT_COLOR },
  ];
}

/** L:4701, one per wrong-slot click inside the window. */
export const GRAPPLE_WRONG_SLOT_MESSAGE: readonly OverheadTextSegment[] = [
  { text: 'You defended the wrong body part!', color: CHAT_HIGHLIGHT_COLORS.red },
];

/** L:4858 and every other captured perfect parry. */
export const GRAPPLE_PERFECT_PARRY_MESSAGE: readonly OverheadTextSegment[] = [
  { text: `You perfectly parry ${SOL_CHAT_NAME}'s grapple!`, color: CHAT_HIGHLIGHT_COLORS.green },
];

/**
 * An early correct defense, L:4701 "You successfully defend your Hands from Sol Heredit's grapple!".
 * UNVERIFIED for the other targets: only Hands is captured, so the other parts' wording is assumed to
 * be the overhead's body part in title case.
 */
export function grappleDefendedMessage(target: GrappleTarget): readonly OverheadTextSegment[] {
  const part = target.bodyPart.charAt(0) + target.bodyPart.slice(1).toLowerCase();
  return [
    {
      text: `You successfully defend your ${part} from ${SOL_CHAT_NAME}'s grapple!`,
      color: CHAT_HIGHLIGHT_COLORS.green,
    },
  ];
}

/** The chat line for a resolved grapple. No capture shows a failed grapple, so it has none. */
export function grappleOutcomeMessage(resolution: GrappleResolution): readonly OverheadTextSegment[] | null {
  switch (resolution.outcome) {
    case 'perfect-parry':
      return GRAPPLE_PERFECT_PARRY_MESSAGE;
    case 'parry':
      return grappleDefendedMessage(resolution.target);
    case 'fail':
      return null;
  }
}

export interface SolGrappleState {
  pending: {
    readonly target: GrappleTarget;
    readonly startTick: number;
    /** The tick a correct defense was processed; the grapple resolves on it. */
    defendedTick: number | null;
  } | null;
}

export interface GrappleResolution {
  readonly outcome: 'perfect-parry' | 'parry' | 'fail';
  readonly target: GrappleTarget;
  readonly damages: readonly EnvironmentalDamage[];
}

export function startSolGrapple(state: SolGrappleState, tick: number, random: () => number): GrappleTarget {
  // PROVISIONAL uniform slot choice; two captures do not establish a distribution.
  const target = { ...GRAPPLE_TARGETS[Math.floor(random() * GRAPPLE_TARGETS.length)] };
  state.pending = { target, startTick: tick, defendedTick: null };
  return target;
}

/**
 * Wiki (Fortis_Colosseum/Strategies#Sol_Heredit): defending gear does not unequip it during the
 * attack. Consume every slot click while the grapple is pending, wrong or repeated ones included.
 */
export function acceptsSolParry(state: SolGrappleState): boolean {
  return state.pending !== null;
}

/**
 * A wrong-slot click costs nothing beyond "You defended the wrong body part!". It never locks in a
 * failure, so a correct click on the same tick (SINGLE-OBSERVATION, L:4701) or a later tick
 * (simulator policy, unverified) still defends. Returns whether the click fell inside the window.
 */
export function registerSolParry(state: SolGrappleState, slot: EquipmentClickSlot, tick: number): boolean {
  const pending = state.pending;
  // Use the processing tick, not the UI click time. A delayed accepted click never unequips,
  // but cannot defend after the window closes.
  if (!pending || tick < pending.startTick || tick > pending.startTick + GRAPPLE_WINDOW_TICKS) return false;
  if (slot === pending.target.slot) pending.defendedTick ??= tick;
  return true;
}

/**
 * Resolves the grapple on a correct defense's tick, or as the window closes. On a failure the Wiki
 * also says the targeted item moves to the inventory; that is not modeled, since no capture shows
 * a failed grapple.
 */
export function resolveSolGrapple(
  state: SolGrappleState,
  tick: number,
  alive: boolean,
  random: () => number,
): GrappleResolution | null {
  const pending = state.pending;
  if (!pending) return null;
  const closeTick = pending.startTick + GRAPPLE_WINDOW_TICKS;
  // VERIFIED: an early correct defense ends the grapple on its tick (L:4701 at shout+3: pending
  // cleared, parry animation, "successfully defend", no reward). Only a defense on the closing tick
  // is a perfect parry (L 5/5 and K:4093->4097, M:8436->8440 at shout+4; Wiki).
  if (pending.defendedTick !== null && pending.defendedTick <= tick) {
    state.pending = null;
    const outcome = pending.defendedTick === closeTick ? 'perfect-parry' : 'parry';
    return { outcome, target: pending.target, damages: [] };
  }
  if (tick !== closeTick) return null;
  state.pending = null;
  // Wiki Changes, 24 April 2024: the grapple stops damaging once Sol is out of HP.
  if (!alive) return { outcome: 'fail', target: pending.target, damages: [] };
  // UNVERIFIED: no failed grapple is captured. Mirrors the regular AoE's higher-of-two-rolls model
  // (sol.ts) over 0..GRAPPLE_FAIL_MAX_HIT; the real range and spread are unknown.
  const roll = () => Math.floor(random() * (GRAPPLE_FAIL_MAX_HIT + 1));
  return {
    outcome: 'fail',
    target: pending.target,
    damages: [{ baseDamage: Math.max(roll(), roll()), attackType: 'typeless', source: 'SolGrapple' }],
  };
}
