import type { CombatStyle } from '../../types/attackStyles';
import type { DamageType } from '../actors/types';
import type { XpSkill } from '../events/types';

/**
 * OSRS combat XP rates per point of damage dealt.
 *
 * Source: https://oldschool.runescape.wiki/w/Combat_Options ("Experience")
 *
 * Fractional rates are exact thirds in the real game engine (4/3, not 1.33),
 * so we use the exact fractions and let the caller's cumulative counters
 * produce the alternating integer drops the client shows.
 */
const FOUR_THIRDS = 4 / 3;

export interface XpGain {
  skill: XpSkill;
  /** Exact fractional xp granted (accumulate, then display integer deltas). */
  xp: number;
}

/** @param damage - damage the hit will deal (post accuracy/min-hit resolution) */
export function computeXpGains(damageClass: DamageType, combatStyle: CombatStyle, damage: number): XpGain[] {
  if (damage <= 0) return [];

  const gains: XpGain[] = [];

  switch (damageClass) {
    case 'melee': {
      if (combatStyle === 'Controlled') {
        gains.push(
          { skill: 'attack', xp: damage * FOUR_THIRDS },
          { skill: 'strength', xp: damage * FOUR_THIRDS },
          { skill: 'defence', xp: damage * FOUR_THIRDS },
        );
      } else if (combatStyle === 'Defensive') {
        gains.push({ skill: 'defence', xp: damage * 4 });
      } else if (combatStyle === 'Aggressive') {
        gains.push({ skill: 'strength', xp: damage * 4 });
      } else {
        gains.push({ skill: 'attack', xp: damage * 4 });
      }
      break;
    }
    case 'range': {
      if (combatStyle === 'Longrange') {
        gains.push({ skill: 'ranged', xp: damage * 2 }, { skill: 'defence', xp: damage * 2 });
      } else {
        gains.push({ skill: 'ranged', xp: damage * 4 });
      }
      break;
    }
    case 'magic': {
      if (combatStyle === 'Defensive Casting' || combatStyle === 'Longrange') {
        gains.push({ skill: 'magic', xp: damage * FOUR_THIRDS }, { skill: 'defence', xp: damage });
      } else {
        gains.push({ skill: 'magic', xp: damage * 2 });
      }
      break;
    }
    default:
      // typeless damage grants no combat xp
      return [];
  }

  gains.push({ skill: 'hitpoints', xp: damage * FOUR_THIRDS });
  return gains;
}

/**
 * Fold fractional gains into cumulative counters and return the INTEGER
 * display deltas — exactly how the OSRS client turns tenth-precision server
 * xp into the drop amounts you see (a 10-damage scythe hit shows HP 13, the
 * next one 14, ...).
 *
 * Mutates `counters` in place (sim-owned state).
 */
export function accumulateXpDeltas(
  counters: Partial<Record<XpSkill, number>>,
  gains: XpGain[],
): Array<{ skill: XpSkill; amount: number }> {
  const deltas: Array<{ skill: XpSkill; amount: number }> = [];
  for (const gain of gains) {
    const before = counters[gain.skill] ?? 0;
    const after = before + gain.xp;
    counters[gain.skill] = after;
    const amount = Math.floor(after) - Math.floor(before);
    if (amount > 0) {
      deltas.push({ skill: gain.skill, amount });
    }
  }
  return deltas;
}
