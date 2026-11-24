/**
 * Everything here answers a question about WHAT HAPPENS. That is the line against
 * `data/weaponCombatVisuals.ts`, which answers what it LOOKS like and is deliberately not
 * here: nothing in that module can change a hitsplat.
 *
 * `getProjectileTiming` looks like a rendering concern and is not. Its profile decides when
 * damage lands — {@link PlayerAutoAttackSystem} feeds it through `calculateProjectileEndTime`
 * and `hitDelayFromEndTime` to schedule the pending hit — and the renderer only borrows it
 * afterwards so the arc arrives on the tick the damage already did. The profiles themselves
 * live in `./hitDelay` alongside the NPC ones, because they are not weapon data: Jal-Zek and
 * TzKal-Zuk draw from the same table.
 */
import { getEquipmentCombatBaseId } from '../../data/equipmentCombatFamilies';
import {
  type AttackStyleOption,
  findWeaponCategoryKey,
  resolveActiveSpell,
  WEAPON_CATEGORIES,
} from '../../types/attackStyles';
import { DEFAULT_SPELLBOOK, type SpellbookType } from '../../types/spellbook';
import type { AttackKind, DamageType, MeleeReach } from './attackTypes';
import type { CombatFormulaStyle, RangedDefenceType } from './formulaTypes';
import type { HitDelayModel } from './hitDelay';
import { PROJ_ANIM_TIMINGS, type ProjAnimTiming } from './hitDelay';

export { getPoweredStaffBaseMaxHit } from './poweredStaffData';

const CATEGORY_HIT_DELAY: Record<string, HitDelayModel> = {
  bow: 'bow',
  crossbow: 'bow',
  thrown: 'thrown',
  chinchompa: 'thrown',
  powered_staff: 'magic',
  staff: 'melee',
  '2h_sword': 'melee',
  axe: 'melee',
  banner: 'melee',
  blunt: 'melee',
  bludgeon: 'melee',
  bulwark: 'melee',
  claw: 'melee',
  partisan: 'melee',
  pickaxe: 'melee',
  polearm: 'melee',
  scythe: 'melee',
  slash_sword: 'melee',
  spear: 'melee',
  spiked: 'melee',
  stab_sword: 'melee',
  unarmed: 'melee',
  whip: 'melee',
};

const ITEM_HIT_DELAY_OVERRIDE: Record<number, HitDelayModel> = {
  27275: 'magic_slow', // Tumeken's shadow
};

export function getHitDelayModel(weaponId: number | undefined, formulaStyle?: CombatFormulaStyle): HitDelayModel {
  if (weaponId !== undefined) {
    const override = ITEM_HIT_DELAY_OVERRIDE[getEquipmentCombatBaseId(weaponId)];
    if (override) return override;

    const categoryKey = findWeaponCategoryKey(weaponId);
    if (categoryKey) {
      const categoryModel = CATEGORY_HIT_DELAY[categoryKey];
      if (categoryModel) return categoryModel;
    }
  }
  if (formulaStyle === 'magic') return 'magic';
  return 'melee';
}

/**
 * "Light is used by thrown weapons ... Standard is used by all kinds of bows, salamanders, and the
 * Eclipse atlatl. Heavy is used by crossbows (including ballistae) and chinchompas."
 * https://oldschool.runescape.wiki/w/Attack_types#Ranged_types. The toxic blowpipe is `thrown` here.
 */
const CATEGORY_RANGED_DEFENCE_TYPE: Readonly<Partial<Record<string, RangedDefenceType>>> = {
  thrown: 'light',
  bow: 'standard',
  crossbow: 'heavy',
  chinchompa: 'heavy',
};

/** Which NPC ranged defence bonus this weapon's ranged attacks roll against, specials included. */
export function getRangedDefenceType(weaponId: number | undefined): RangedDefenceType {
  const categoryKey = findWeaponCategoryKey(weaponId);
  return (categoryKey === undefined ? undefined : CATEGORY_RANGED_DEFENCE_TYPE[categoryKey]) ?? 'standard';
}

const ATTACK_TYPE_TO_FORMULA_STYLE: Record<string, CombatFormulaStyle> = {
  Stab: 'melee_stab',
  Slash: 'melee_slash',
  Crush: 'melee_crush',
  Ranged: 'ranged',
  Magic: 'magic',
};

export function getFormulaStyle(weaponId: number | undefined, selectedStyleIndex: number = 0): CombatFormulaStyle {
  const categoryKey = findWeaponCategoryKey(weaponId);

  const category = categoryKey ? WEAPON_CATEGORIES[categoryKey] : WEAPON_CATEGORIES.unarmed;

  if (!category) return 'melee_crush';

  const style: AttackStyleOption | undefined = category.styles[selectedStyleIndex] ?? category.styles[0];
  if (!style) return 'melee_crush';

  return ATTACK_TYPE_TO_FORMULA_STYLE[style.attackType] ?? 'melee_crush';
}

export interface EffectiveCombatParams {
  attackSpeed: number;
  attackRange: number;
  /** Range-1 reach to diagonally adjacent tiles; omitted means ordinary cardinal-only melee. */
  meleeReach?: MeleeReach;
}

const CAST_STANCES: ReadonlySet<string> = new Set(['Casting', 'Defensive Casting']);

/**
 * No weapon or style attacks from further than 10 tiles: Longrange's +2 stops there, so the Twisted
 * bow's Longrange is 10 and the chinchompas' Long fuse 10 (user-confirmed OSRS rule). Combat spells
 * reach exactly this far (`DEFAULT_SPELL_ATTACK_RANGE`).
 */
const MAX_PLAYER_ATTACK_RANGE = 10;

export function getEffectiveCombatParams(
  baseSpeed: number,
  baseRange: number,
  weaponId: number | undefined,
  selectedStyleIndex: number,
): EffectiveCombatParams {
  const categoryKey = findWeaponCategoryKey(weaponId);

  const category = categoryKey ? WEAPON_CATEGORIES[categoryKey] : WEAPON_CATEGORIES.unarmed;

  if (!category) return { attackSpeed: baseSpeed, attackRange: baseRange };

  const clampedIndex = Math.min(Math.max(0, selectedStyleIndex), category.styles.length - 1);
  const style: AttackStyleOption | undefined = category.styles[clampedIndex];
  if (!style) return { attackSpeed: baseSpeed, attackRange: baseRange };

  let speed = baseSpeed;
  let range = baseRange;

  if (style.attackType === 'Ranged' && style.combatStyle === 'Rapid') {
    speed -= 1;
  } else if (CAST_STANCES.has(style.combatStyle)) {
    speed = 5;
  }

  if (style.combatStyle === 'Longrange') {
    range += 2;
  }
  range = Math.min(range, MAX_PLAYER_ATTACK_RANGE);

  speed = Math.max(speed, 1);

  return { attackSpeed: speed, attackRange: range };
}

export function getPlayerEffectiveCombatParams(player: {
  equipmentStats: { attackSpeed: number; attackRange: number };
  equipment: { weapon?: number };
  selectedAttackStyleIndex: number;
  combatSupplies?: { readonly selectedSpell: string | null; readonly spellbook: SpellbookType };
}): EffectiveCombatParams {
  const params = getEffectiveCombatParams(
    player.equipmentStats.attackSpeed,
    player.equipmentStats.attackRange,
    player.equipment.weapon,
    player.selectedAttackStyleIndex,
  );

  // The active spell dictates attack range, so an explicitly selected spell must
  // win over the weapon's built-in default autocast.
  const spell = resolveActiveSpell({
    weaponId: player.equipment.weapon,
    selectedStyleIndex: player.selectedAttackStyleIndex,
    selectedSpell: player.combatSupplies?.selectedSpell,
    spellbook: player.combatSupplies?.spellbook ?? DEFAULT_SPELLBOOK,
  });
  if (spell) {
    params.attackRange = spell.attackRange;
  }

  return params;
}

export function formulaStyleToDamageType(style: CombatFormulaStyle): DamageType {
  if (style === 'ranged') return 'range';
  if (style === 'magic') return 'magic';
  return 'melee';
}

export function formulaStyleToAttackKind(style: CombatFormulaStyle): AttackKind {
  switch (style) {
    case 'melee_stab':
      return 'melee_stab';
    case 'melee_slash':
      return 'melee_slash';
    case 'melee_crush':
      return 'melee_crush';
    case 'ranged':
      return 'range_arrow';
    case 'magic':
      return 'magic_fire';
  }
}

const CATEGORY_PROJ_TIMING: Record<string, ProjAnimTiming> = {
  bow: PROJ_ANIM_TIMINGS.arrow,
  crossbow: PROJ_ANIM_TIMINGS.arrow,
  thrown: PROJ_ANIM_TIMINGS.thrown,
  // `black_chinchompa_grenade` leaves at `starttime=21` and lands where a thrown weapon's projectile
  // does, at `endtime = 32 + 5 * distance` to the target's nearest tile: 52 at 4 tiles and 77 at 9 in
  // capture inferno-waves-(35ish)-to-68-packet-data.txt:4684,4820.
  chinchompa: { delay: 21, lengthAdjustment: 11, stepMultiplier: 5, progress: 11 },
  powered_staff: PROJ_ANIM_TIMINGS.magic_spell,
};

/**
 * The Accursed sceptre launches earlier than an ordinary spell but lands at the same `46 + 10 *
 * distance`: `starttime=46` on its own casts and `starttime=50` on Condemn, on every capture of each
 * (the weapon sweep capture's ticks 517-545 and the four Yama captures' Condemns).
 */
const ACCURSED_SCEPTRE_TIMING: ProjAnimTiming = { delay: 46, lengthAdjustment: 0, stepMultiplier: 10, progress: 64 };
const CONDEMN_TIMING: ProjAnimTiming = { delay: 50, lengthAdjustment: -4, stepMultiplier: 10, progress: 70 };

const ITEM_PROJ_TIMING_OVERRIDE: Record<number, ProjAnimTiming> = {
  // The blowpipe muzzle differs from thrown darts: capture inferno-waves-69-zuk-packet-data.txt:18827.
  12926: { ...PROJ_ANIM_TIMINGS.thrown, progress: 105 },
  27275: PROJ_ANIM_TIMINGS.tumekens_shadow,
  31113: PROJ_ANIM_TIMINGS.eye_of_ayak,
  30070: PROJ_ANIM_TIMINGS.magic_spell,
  27665: ACCURSED_SCEPTRE_TIMING,
  // Venator bow: `endtime = 46 + 2 * distance` to the target's nearest tile on 124/124 shots in the three
  // Colosseum wave captures (78 after the 19 August 2026 update, 46 before it, alike), 1x1 to 5x5 at 1-4.
  27610: { delay: 31, lengthAdjustment: 15, stepMultiplier: 2, progress: 11 },
};

/** A special attack whose projectile flies differently from the weapon's ordinary shot. */
const SPECIAL_PROJ_TIMING_OVERRIDE: Record<number, ProjAnimTiming> = {
  // capture blowpipe-spec-bowfa-attacks-packet-data.txt:24; inferno-waves-69-zuk-packet-data.txt:18641,18743.
  12926: { delay: 32, lengthAdjustment: 0, stepMultiplier: 7, progress: 105 },
  // Condemn, from either sceptre: the (a) one otherwise times its flight by the autocast spell.
  27665: CONDEMN_TIMING,
  27679: CONDEMN_TIMING,
  27676: CONDEMN_TIMING,
  // Scorching bow: `endtime = 50 + 4 * distance` on 10/10 specs in capture yama-contract-of-sensory-clouding-*.txt.
  29591: { delay: 46, lengthAdjustment: 4, stepMultiplier: 4, progress: 80 },
};

export function getProjectileTiming(
  weaponId: number | undefined,
  usingSpecialAttack = false,
): ProjAnimTiming | undefined {
  if (weaponId !== undefined) {
    const baseId = getEquipmentCombatBaseId(weaponId);
    const specialOverride = usingSpecialAttack ? SPECIAL_PROJ_TIMING_OVERRIDE[baseId] : undefined;
    if (specialOverride) return specialOverride;
    const itemOverride = ITEM_PROJ_TIMING_OVERRIDE[baseId];
    if (itemOverride) return itemOverride;

    const categoryKey = findWeaponCategoryKey(weaponId);
    if (categoryKey) return CATEGORY_PROJ_TIMING[categoryKey];
  }
  return undefined;
}
