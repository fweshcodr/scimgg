import { type CombatStyle, getWeaponCategory } from '../../types/attackStyles';
import type { PlayerActor } from '../actors/PlayerActor';
import type { CombatFormulaStance } from './formulaTypes';

/**
 * The stance the player's selected combat option puts them in. It drives the hidden style
 * bonus on BOTH sides of the fight: the attack/strength share when the player swings, and the
 * defence share when something swings back. Reading it from one place is what keeps an
 * incoming hit and an outgoing hit from disagreeing about which option is selected.
 *
 * Manual casting is deliberately not modeled here — it is a single action, not a stance, and
 * it leaves the selected combat option (and therefore the defence bonus) untouched.
 */
export function selectedCombatStance(
  player: Pick<PlayerActor, 'equipment' | 'selectedAttackStyleIndex'>,
): CombatFormulaStance {
  const styles = getWeaponCategory(player.equipment.weapon).styles;
  const clampedIndex = Math.min(Math.max(0, player.selectedAttackStyleIndex), styles.length - 1);
  const style = styles[clampedIndex] ?? styles[0];
  return style === undefined ? 'Other' : toFormulaStance(style.combatStyle);
}

function toFormulaStance(style: CombatStyle): CombatFormulaStance {
  switch (style) {
    case 'Accurate':
    case 'Aggressive':
    case 'Defensive':
    case 'Controlled':
    case 'Longrange':
    case 'Casting':
    case 'Defensive Casting':
    case 'Other':
      return style;
    case 'Rapid':
    case 'None':
      return 'Other';
    default:
      return assertNever(style);
  }
}

function assertNever(value: never): never {
  throw new TypeError(`Unhandled combat style: ${String(value)}`);
}
