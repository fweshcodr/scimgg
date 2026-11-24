import { getCanonicalEquipmentItemId } from '../../../data/equipmentCatalog';
import { getSpellCastInfo, type SpellSecondaryEffect } from '../../../data/spellCatalog';
import type { PlayerEquipment } from '../../../rs/model/PlayerModelLoader';
import type { LaunchHeal, SpecialAttackEffect } from './specialAttacks/types';

/**
 * /w/Smoke_spells: a damaging Smoke hit poisons one time in eight. The same 1/8 covers all four
 * Smoke spells, so it belongs here next to the roll rather than repeated across four spell records
 * that would then have to agree.
 */
export const SMOKE_POISON_CHANCE = 1 / 8;

/**
 * Canonical ids of the Ancient sceptre and its four quartz upgrades.
 *
 * Every upgrade keeps the base sceptre's boost to ALL FOUR Ancient families, not just its own
 * (/w/Ancient_sceptre?oldid=15338578, and each upgrade page: Blood 15292069, Ice 15292071, Smoke
 * 15292070, Shadow 15292072). Ids are canonical, so the locked and cosmetic variants that alias
 * onto them are covered without listing each one.
 */
const ANCIENT_SCEPTRE_CANONICAL_IDS: ReadonlySet<number> = new Set([
  27624, // Ancient sceptre
  28260, // Blood ancient sceptre
  28264, // Smoke ancient sceptre
  28262, // Ice ancient sceptre
  28266, // Shadow ancient sceptre
]);

/**
 * The sceptre's shared boost to an Ancient spell's secondary effect: a flat 10% more.
 *
 * Applied as `* 11 / 10` rather than `* 1.1` so the exact wiki-stated freeze durations come out of
 * integer arithmetic (32 -> 35, not 35.2 -> 35 via a binary float).
 */
function boosted(value: number): number {
  return (value * 11) / 10;
}

function hasAncientSceptre(equipment: Readonly<PlayerEquipment>): boolean {
  const weapon = equipment.weapon;
  return weapon !== undefined && ANCIENT_SCEPTRE_CANONICAL_IDS.has(getCanonicalEquipmentItemId(weapon));
}

/**
 * Translates a cast's wiki-stated secondary effect into the post-hit effects the combat pipeline
 * already carries and applies, so an Ancient cast needs no parallel transport of its own.
 *
 * Call this ONCE PER TARGET, and roll at launch off the engine's seeded stream. Hoisting it to one
 * roll for the whole cast would make a Smoke Barrage poison all nine targets or none instead of
 * each independently. The roll is taken whether or not the hit is accurate, for the reason
 * `CombatSystem` draws its damage roll unconditionally: a draw taken only on a hit lets one
 * accuracy outcome shift every later roll in the fight. Whether the effect then lands is
 * `CombatSystem`'s job, not this function's: at launch for a freeze, at impact for the rest.
 *
 * The sceptre boost is read from the equipment at LAUNCH and baked into the returned amounts, so
 * swapping weapons while the spell is airborne cannot change the effect that lands — the same
 * contract `captureEquipmentHitEffects` follows.
 */
export function resolveSpellHitEffects(
  spellId: string | undefined,
  random: () => number,
  equipment: Readonly<PlayerEquipment>,
): readonly SpecialAttackEffect[] | undefined {
  const effect = secondaryEffectOf(spellId);
  if (effect === undefined) return undefined;
  const sceptre = hasAncientSceptre(equipment);
  switch (effect.kind) {
    case 'poison': {
      // Severity scales, the 1/8 chance does not (/w/Smoke_spells?oldid=15319468).
      if (random() >= SMOKE_POISON_CHANCE) return undefined;
      const severity = sceptre ? Math.floor(boosted(effect.severity)) : effect.severity;
      return [{ effect: 'poison', severity }];
    }
    case 'drain_attack':
      // Left unfloored: the sceptre takes Blitz/Barrage's 15% to 16.5%, and the integer stat loss
      // is floored once, at the end, by `drainOfCurrentLevel`.
      return [{ effect: 'drain_attack', percent: sceptre ? boosted(effect.percent) : effect.percent }];
    case 'freeze':
      return [
        {
          effect: 'freeze',
          durationTicks: sceptre ? Math.floor(boosted(effect.durationTicks)) : effect.durationTicks,
        },
      ];
    case 'leech_hp':
      // Blood resolves on the CAST tick instead — see `resolveSpellLaunchHeal`.
      return undefined;
  }
}

/**
 * Blood's life leech, which resolves at LAUNCH rather than on the hitsplat.
 *
 * capture `ancient-spells-casts-anims-sounds-packet-data.txt` puts "You drain some of your
 * opponent's health." on the tick the spell FIRES, while that same tick only SCHEDULES the impact
 * spotanim: Rush t607 `delay=56`, Barrage t650 `delay=66`, Blitz t663 `delay=66`, Burst t656
 * `delay=106` against damage at t660. No other spell family in that capture emits the message, so
 * the drain is resolved at cast time, ahead of the damage it is drawn from.
 *
 * That capture does NOT measure the heal itself: its caster sits at 99/99 throughout, and every
 * Hitpoints stat update in it — on Ice and Smoke casts too — is the Hitpoints XP drop
 * every damaging hit grants, not a health change. The AMOUNT and the exact tick of the HP
 * transition rest on /w/Blood_spells and on the Toxic blowpipe's Zuk capture, which does show a
 * real level change at launch (see {@link LaunchHeal}). Treat the timing as well-supported rather
 * than directly measured until an injured-caster capture exists.
 *
 * Resolving at cast is also what lets /w/Blood_spells heal against a target with almost no HP
 * left, or one immune to the damage: the heal is drawn from the ROLL, not from HP actually removed.
 *
 * `minimumHeal: 0` because the leech is a flat percentage with no floor, unlike the shared
 * post-hit healing default of 10.
 *
 * UNMODIFIED BY EQUIPMENT, deliberately. The Ancient sceptre (27.5%) and Bloodbark (+2% a piece)
 * both raise this nominal percentage, but /w/Bloodbark_armour?oldid=15340143 states the 1/4 is
 * floored BEFORE the bloodbark scaling, so `floor(damage * 29 / 100)` is not the same number as
 * the game's `floor(floor(damage / 4) * 29 / 25)` — at 35 damage, 10 against 9. Where the
 * sceptre's own truncation sits relative to that, and how the April 2025 multi-hit fix aggregates
 * a Barrage, are not settled by those pages. Left at the base percentage rather than shipping
 * invented arithmetic; see the Ice/Smoke/Shadow boost in {@link resolveSpellHitEffects}.
 */
export function resolveSpellLaunchHeal(spellId: string | undefined): LaunchHeal | undefined {
  const effect = secondaryEffectOf(spellId);
  return effect?.kind === 'leech_hp' ? { percentOfDamage: effect.percentOfDamage, minimumHeal: 0 } : undefined;
}

function secondaryEffectOf(spellId: string | undefined): SpellSecondaryEffect | undefined {
  return spellId === undefined ? undefined : getSpellCastInfo(spellId)?.secondaryEffect;
}
