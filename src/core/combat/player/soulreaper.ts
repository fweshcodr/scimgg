import { getEquipmentCombatBaseId } from '../../../data/equipmentCombatFamilies';

/**
 * Soulreaper axe soul stacks, per /w/Soulreaper_axe (rev of 2 Oct 2026, after the 22 July 2026
 * update that removed the Hitpoints cost): every attack made with the axe, hit or miss, adds a
 * stack while below five; each stack is +6% Strength level for the axe only; one stack decays
 * every 50 ticks the player goes without attacking with the axe, and switching weapons does not
 * clear them. Behead (the special) consumes them all.
 */
export const SOULREAPER_AXE_ID = 28338;
export const SOULREAPER_MAX_STACKS = 5;
export const SOULREAPER_STACK_DECAY_TICKS = 50;
export const SOULREAPER_STRENGTH_PERCENT_PER_STACK = 6;

/** Absent on the player while there are no stacks, so a run that never touches the axe is unchanged. */
export interface SoulreaperState {
  readonly stacks: number;
  /** Absolute tick on which the next stack decays unless an axe attack pushes it out first. */
  readonly decayTick: number;
}

export function isSoulreaperAxe(weaponId: number | undefined): boolean {
  return weaponId !== undefined && getEquipmentCombatBaseId(weaponId) === SOULREAPER_AXE_ID;
}

export function soulreaperStackCount(state: SoulreaperState | undefined): number {
  return state?.stacks ?? 0;
}

/**
 * The state after an attack made with the axe on `tick`. The caller runs this AFTER the attack's
 * damage has been rolled, so the stack it adds never boosts the swing that earned it. Behead
 * consumes every stack and does not earn one back.
 */
export function afterSoulreaperAttack(
  state: SoulreaperState | undefined,
  tick: number,
  isBehead: boolean,
): SoulreaperState | undefined {
  if (isBehead) return undefined;
  return {
    stacks: Math.min(SOULREAPER_MAX_STACKS, soulreaperStackCount(state) + 1),
    decayTick: tick + SOULREAPER_STACK_DECAY_TICKS,
  };
}

/** Sheds one stack once the decay tick is reached, re-arming the clock for the next. */
export function tickSoulreaperDecay(state: SoulreaperState | undefined, tick: number): SoulreaperState | undefined {
  if (state === undefined || tick < state.decayTick) return state;
  const stacks = state.stacks - 1;
  return stacks <= 0 ? undefined : { stacks, decayTick: tick + SOULREAPER_STACK_DECAY_TICKS };
}

/**
 * The Strength-level percentage an ordinary axe attack adds on top of the prayer multiplier
 * ("additive with prayer Strength boosts", /w/Soulreaper_axe). Behead does not use it: the
 * special spends the stacks on its own damage bonus instead.
 */
export function soulreaperStrengthBonusPercent(
  weaponId: number | undefined,
  state: SoulreaperState | undefined,
  isSpecialAttack: boolean,
): number {
  if (isSpecialAttack || !isSoulreaperAxe(weaponId)) return 0;
  return soulreaperStackCount(state) * SOULREAPER_STRENGTH_PERCENT_PER_STACK;
}

/**
 * What the special orb and the combat tab's special bar show: with the axe worn the client swaps
 * special energy for the stack count out of five. Undefined means show energy as usual.
 */
export function soulreaperDisplayedStacks(
  weaponId: number | undefined,
  stacks: number | undefined,
): number | undefined {
  return isSoulreaperAxe(weaponId) ? (stacks ?? 0) : undefined;
}
