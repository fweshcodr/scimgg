import type { PlayerFormulaActor, PrayerMultipliers } from './formulaTypes';

export function meleeAttackEffectiveLevel(actor: PlayerFormulaActor, prayers: PrayerMultipliers): number {
  const prayedLevel = Math.floor(actor.levels.attack * prayers.attack);
  const styleBonus = actor.stance === 'Accurate' ? 3 : actor.stance === 'Controlled' ? 1 : 0;
  const voidMultiplier = actor.voidSet === 'melee' ? 1.1 : 1;
  return Math.floor((prayedLevel + styleBonus + 8) * voidMultiplier);
}

export function meleeStrengthEffectiveLevel(actor: PlayerFormulaActor, prayers: PrayerMultipliers): number {
  const bonusPercent = actor.meleeStrengthBonusPercent ?? 0;
  // Soul stacks add to the prayer percentage rather than multiplying it (/w/Soulreaper_axe), so
  // both are summed as whole percents; integer arithmetic keeps e.g. 100 x 130% from flooring to 129.
  const prayedLevel =
    bonusPercent === 0
      ? Math.floor(actor.levels.strength * prayers.strength)
      : Math.floor((actor.levels.strength * (Math.round(prayers.strength * 100) + bonusPercent)) / 100);
  const styleBonus = actor.stance === 'Aggressive' ? 3 : actor.stance === 'Controlled' ? 1 : 0;
  const voidMultiplier = actor.voidSet === 'melee' ? 1.1 : 1;
  return Math.floor((prayedLevel + styleBonus + 8) * voidMultiplier);
}

export function rangedAttackEffectiveLevel(actor: PlayerFormulaActor, prayers: PrayerMultipliers): number {
  const prayedLevel = Math.floor(actor.levels.ranged * prayers.ranged);
  const styleBonus = actor.stance === 'Accurate' ? 3 : 0;
  const voidMultiplier = actor.voidSet === 'ranged' || actor.voidSet === 'elite_ranged' ? 1.1 : 1;
  return Math.floor((prayedLevel + styleBonus + 8) * voidMultiplier);
}

export function rangedStrengthEffectiveLevel(actor: PlayerFormulaActor, prayers: PrayerMultipliers): number {
  const prayedLevel = Math.floor((actor.rangedStrengthLevel ?? actor.levels.ranged) * prayers.rangedStrength);
  const styleBonus = actor.stance === 'Accurate' ? 3 : 0;
  const voidMultiplier = actor.voidSet === 'elite_ranged' ? 1.125 : actor.voidSet === 'ranged' ? 1.1 : 1;
  return Math.floor((prayedLevel + styleBonus + 8) * voidMultiplier);
}

export function magicAttackEffectiveLevel(actor: PlayerFormulaActor, prayers: PrayerMultipliers): number {
  const prayedLevel = Math.floor(actor.levels.magic * prayers.magic);
  const styleBonus = actor.stance === 'Accurate' ? 3 : actor.stance === 'Longrange' ? 1 : 0;
  const voidMultiplier = actor.voidSet === 'magic' || actor.voidSet === 'elite_magic' ? 1.45 : 1;
  return Math.floor(prayedLevel * voidMultiplier + styleBonus + 8);
}

export function playerDefenceEffectiveLevel(actor: PlayerFormulaActor, prayers: PrayerMultipliers): number {
  const prayedLevel = Math.floor(actor.levels.defence * prayers.defence);
  return prayedLevel + defenceStyleBonus(actor) + 8;
}

export function playerMagicDefenceEffectiveLevel(actor: PlayerFormulaActor, prayers: PrayerMultipliers): number {
  const prayedMagic = Math.floor(actor.levels.magic * prayers.magic);
  const prayedDefence = Math.floor(actor.levels.defence * prayers.defence);
  return Math.floor((prayedMagic * 7) / 10) + Math.floor((prayedDefence * 3) / 10) + defenceStyleBonus(actor) + 8;
}

function defenceStyleBonus(actor: PlayerFormulaActor): number {
  if (actor.stance === 'Defensive' || actor.stance === 'Longrange') return 3;
  return actor.stance === 'Controlled' ? 1 : 0;
}
