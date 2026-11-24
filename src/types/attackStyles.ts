/**
 * OSRS Attack Style data model.
 *
 * Sources: OSRS Wiki Weapons/Types and Combat_Options; RuneLite
 * AttackStyle.java / WeaponType.
 */
import { getEquipmentCombatBaseId } from '../data/equipmentCombatFamilies';
import { getSpellCastInfo } from '../data/spellCatalog';
import { DEFAULT_SPELLBOOK, type SpellbookType } from './spellbook';

export type AttackType = 'Stab' | 'Slash' | 'Crush' | 'Ranged' | 'Magic' | 'None';

export type CombatStyle =
  | 'Accurate'
  | 'Aggressive'
  | 'Defensive'
  | 'Controlled'
  | 'Rapid'
  | 'Longrange'
  | 'Casting'
  | 'Defensive Casting'
  | 'Other'
  | 'None';

export interface AttackStyleOption {
  name: string;
  attackType: AttackType;
  combatStyle: CombatStyle;
  /**
   * Icon filename, relative to /assets/ui/combat-styles/. Absent where the cache has no sprite for
   * the style (the defensive-autocast composite), so its button shows only the label.
   */
  icon?: string;
}

export interface WeaponCategory {
  name: string;
  styles: AttackStyleOption[];
}

/** The styles array follows the button layout order (top-left, top-right, bottom-left, bottom-right). */
export const WEAPON_CATEGORIES: Record<string, WeaponCategory> = {
  '2h_sword': {
    name: '2h Sword',
    styles: [
      { name: 'Chop', attackType: 'Slash', combatStyle: 'Accurate', icon: '2h_chop.png' },
      { name: 'Slash', attackType: 'Slash', combatStyle: 'Aggressive', icon: '2h_slash.png' },
      { name: 'Smash', attackType: 'Crush', combatStyle: 'Aggressive', icon: '2h_smash.png' },
      { name: 'Block', attackType: 'Slash', combatStyle: 'Defensive', icon: '2h_block.png' },
    ],
  },
  axe: {
    name: 'Axe',
    styles: [
      { name: 'Chop', attackType: 'Slash', combatStyle: 'Accurate', icon: 'axe_chop.png' },
      { name: 'Hack', attackType: 'Slash', combatStyle: 'Aggressive', icon: 'axe_hack.png' },
      { name: 'Smash', attackType: 'Crush', combatStyle: 'Aggressive', icon: 'axe_smash.png' },
      { name: 'Block', attackType: 'Slash', combatStyle: 'Defensive', icon: 'axe_block.png' },
    ],
  },
  banner: {
    name: 'Banner',
    styles: [
      { name: 'Lunge', attackType: 'Stab', combatStyle: 'Accurate', icon: 'banner_lunge.png' },
      { name: 'Swipe', attackType: 'Slash', combatStyle: 'Aggressive', icon: 'banner_swipe.png' },
      { name: 'Pound', attackType: 'Crush', combatStyle: 'Controlled', icon: 'banner_pound.png' },
      { name: 'Block', attackType: 'Stab', combatStyle: 'Defensive', icon: 'banner_block.png' },
    ],
  },
  blunt: {
    name: 'Blunt',
    styles: [
      { name: 'Pound', attackType: 'Crush', combatStyle: 'Accurate', icon: 'blunt_pound.png' },
      { name: 'Pummel', attackType: 'Crush', combatStyle: 'Aggressive', icon: 'blunt_pummel.png' },
      { name: 'Block', attackType: 'Crush', combatStyle: 'Defensive', icon: 'blunt_block.png' },
    ],
  },
  bludgeon: {
    name: 'Bludgeon',
    styles: [
      { name: 'Pound', attackType: 'Crush', combatStyle: 'Aggressive', icon: 'bludgeon_pound.png' },
      { name: 'Pummel', attackType: 'Crush', combatStyle: 'Aggressive', icon: 'bludgeon_pummel.png' },
      { name: 'Smash', attackType: 'Crush', combatStyle: 'Aggressive', icon: 'bludgeon_smash.png' },
    ],
  },
  bulwark: {
    name: 'Bulwark',
    styles: [
      { name: 'Pummel', attackType: 'Crush', combatStyle: 'Accurate', icon: 'bulwark_pummel.png' },
      { name: 'Block', attackType: 'None', combatStyle: 'None', icon: 'bulwark_block.png' },
    ],
  },
  claw: {
    name: 'Claw',
    styles: [
      { name: 'Chop', attackType: 'Slash', combatStyle: 'Accurate', icon: 'claw_chop.png' },
      { name: 'Slash', attackType: 'Slash', combatStyle: 'Aggressive', icon: 'claw_slash.png' },
      { name: 'Lunge', attackType: 'Stab', combatStyle: 'Controlled', icon: 'claw_lunge.png' },
      { name: 'Block', attackType: 'Slash', combatStyle: 'Defensive', icon: 'claw_block.png' },
    ],
  },
  partisan: {
    name: 'Partisan',
    styles: [
      { name: 'Stab', attackType: 'Stab', combatStyle: 'Accurate', icon: 'partisan_stab.png' },
      { name: 'Lunge', attackType: 'Stab', combatStyle: 'Aggressive', icon: 'partisan_lunge.png' },
      { name: 'Pound', attackType: 'Crush', combatStyle: 'Aggressive', icon: 'partisan_pound.png' },
      { name: 'Block', attackType: 'Stab', combatStyle: 'Defensive', icon: 'partisan_block.png' },
    ],
  },
  pickaxe: {
    name: 'Pickaxe',
    styles: [
      { name: 'Spike', attackType: 'Stab', combatStyle: 'Accurate', icon: 'pickaxe_spike.png' },
      { name: 'Impale', attackType: 'Stab', combatStyle: 'Aggressive', icon: 'pickaxe_impale.png' },
      { name: 'Smash', attackType: 'Crush', combatStyle: 'Aggressive', icon: 'pickaxe_smash.png' },
      { name: 'Block', attackType: 'Stab', combatStyle: 'Defensive', icon: 'pickaxe_block.png' },
    ],
  },
  polearm: {
    name: 'Polearm',
    styles: [
      { name: 'Jab', attackType: 'Stab', combatStyle: 'Controlled', icon: 'polearm_jab.png' },
      { name: 'Swipe', attackType: 'Slash', combatStyle: 'Aggressive', icon: 'polearm_swipe.png' },
      { name: 'Fend', attackType: 'Stab', combatStyle: 'Defensive', icon: 'polearm_fend.png' },
    ],
  },
  scythe: {
    name: 'Scythe',
    styles: [
      { name: 'Reap', attackType: 'Slash', combatStyle: 'Accurate', icon: 'scythe_reap.png' },
      { name: 'Chop', attackType: 'Slash', combatStyle: 'Aggressive', icon: 'scythe_chop.png' },
      { name: 'Jab', attackType: 'Crush', combatStyle: 'Aggressive', icon: 'scythe_jab.png' },
      { name: 'Block', attackType: 'Slash', combatStyle: 'Defensive', icon: 'scythe_block.png' },
    ],
  },
  slash_sword: {
    name: 'Slash Sword',
    styles: [
      { name: 'Chop', attackType: 'Slash', combatStyle: 'Accurate', icon: 'slash_sword_chop.png' },
      { name: 'Slash', attackType: 'Slash', combatStyle: 'Aggressive', icon: 'slash_sword_slash.png' },
      { name: 'Lunge', attackType: 'Stab', combatStyle: 'Controlled', icon: 'slash_sword_lunge.png' },
      { name: 'Block', attackType: 'Slash', combatStyle: 'Defensive', icon: 'slash_sword_block.png' },
    ],
  },
  spear: {
    name: 'Spear',
    styles: [
      { name: 'Lunge', attackType: 'Stab', combatStyle: 'Controlled', icon: 'spear_lunge.png' },
      { name: 'Swipe', attackType: 'Slash', combatStyle: 'Controlled', icon: 'spear_swipe.png' },
      { name: 'Pound', attackType: 'Crush', combatStyle: 'Controlled', icon: 'spear_pound.png' },
      { name: 'Block', attackType: 'Stab', combatStyle: 'Defensive', icon: 'spear_block.png' },
    ],
  },
  spiked: {
    name: 'Spiked',
    styles: [
      { name: 'Pound', attackType: 'Crush', combatStyle: 'Accurate', icon: 'spiked_pound.png' },
      { name: 'Pummel', attackType: 'Crush', combatStyle: 'Aggressive', icon: 'spiked_pummel.png' },
      { name: 'Spike', attackType: 'Stab', combatStyle: 'Aggressive', icon: 'spiked_spike.png' },
      { name: 'Block', attackType: 'Crush', combatStyle: 'Defensive', icon: 'spiked_block.png' },
    ],
  },
  stab_sword: {
    name: 'Stab Sword',
    styles: [
      { name: 'Stab', attackType: 'Stab', combatStyle: 'Accurate', icon: 'stab_sword_stab.png' },
      { name: 'Lunge', attackType: 'Stab', combatStyle: 'Aggressive', icon: 'stab_sword_lunge.png' },
      { name: 'Slash', attackType: 'Slash', combatStyle: 'Aggressive', icon: 'stab_sword_slash.png' },
      { name: 'Block', attackType: 'Stab', combatStyle: 'Defensive', icon: 'stab_sword_block.png' },
    ],
  },
  unarmed: {
    name: 'Unarmed',
    styles: [
      { name: 'Punch', attackType: 'Crush', combatStyle: 'Accurate', icon: 'unarmed_punch.png' },
      { name: 'Kick', attackType: 'Crush', combatStyle: 'Aggressive', icon: 'unarmed_kick.png' },
      { name: 'Block', attackType: 'Crush', combatStyle: 'Defensive', icon: 'unarmed_block.png' },
    ],
  },
  whip: {
    name: 'Whip',
    styles: [
      // /w/Abyssal_whip § Combat styles: Flick is Accurate and Lash is Controlled; there is no Aggressive.
      { name: 'Flick', attackType: 'Slash', combatStyle: 'Accurate', icon: 'whip_flick.png' },
      { name: 'Lash', attackType: 'Slash', combatStyle: 'Controlled', icon: 'whip_lash.png' },
      { name: 'Deflect', attackType: 'Slash', combatStyle: 'Defensive', icon: 'whip_deflect.png' },
    ],
  },
  bow: {
    name: 'Bow',
    styles: [
      { name: 'Accurate', attackType: 'Ranged', combatStyle: 'Accurate', icon: 'bow_accurate.png' },
      { name: 'Rapid', attackType: 'Ranged', combatStyle: 'Rapid', icon: 'bow_rapid.png' },
      { name: 'Longrange', attackType: 'Ranged', combatStyle: 'Longrange', icon: 'bow_longrange.png' },
    ],
  },
  crossbow: {
    name: 'Crossbow',
    styles: [
      { name: 'Accurate', attackType: 'Ranged', combatStyle: 'Accurate', icon: 'crossbow_accurate.png' },
      { name: 'Rapid', attackType: 'Ranged', combatStyle: 'Rapid', icon: 'crossbow_rapid.png' },
      { name: 'Longrange', attackType: 'Ranged', combatStyle: 'Longrange', icon: 'crossbow_longrange.png' },
    ],
  },
  thrown: {
    name: 'Thrown',
    styles: [
      { name: 'Accurate', attackType: 'Ranged', combatStyle: 'Accurate', icon: 'thrown_accurate.png' },
      { name: 'Rapid', attackType: 'Ranged', combatStyle: 'Rapid', icon: 'thrown_rapid.png' },
      { name: 'Longrange', attackType: 'Ranged', combatStyle: 'Longrange', icon: 'thrown_longrange.png' },
    ],
  },
  // The fuses are Accurate, Rapid and Longrange stances. No chinchompa style icons are mirrored, so
  // the thrown ones stand in.
  chinchompa: {
    name: 'Chinchompas',
    styles: [
      { name: 'Short fuse', attackType: 'Ranged', combatStyle: 'Accurate', icon: 'thrown_accurate.png' },
      { name: 'Medium fuse', attackType: 'Ranged', combatStyle: 'Rapid', icon: 'thrown_rapid.png' },
      { name: 'Long fuse', attackType: 'Ranged', combatStyle: 'Longrange', icon: 'thrown_longrange.png' },
    ],
  },
  staff: {
    name: 'Staff',
    styles: [
      { name: 'Bash', attackType: 'Crush', combatStyle: 'Accurate', icon: 'staff_bash.png' },
      { name: 'Pound', attackType: 'Crush', combatStyle: 'Aggressive', icon: 'staff_pound.png' },
      { name: 'Focus', attackType: 'Crush', combatStyle: 'Defensive', icon: 'staff_focus.png' },
      { name: 'Spell', attackType: 'Magic', combatStyle: 'Casting', icon: 'staff_spell.png' },
      { name: 'Spell', attackType: 'Magic', combatStyle: 'Defensive Casting' },
    ],
  },
  powered_staff: {
    name: 'Powered Staff',
    styles: [
      { name: 'Accurate', attackType: 'Magic', combatStyle: 'Accurate', icon: 'powered_staff_accurate.png' },
      { name: 'Longrange', attackType: 'Magic', combatStyle: 'Longrange', icon: 'powered_staff_longrange.png' },
    ],
  },
};

/** The live client derives this from Varbit 357 (Enum 3908); this static table stands in for it. */
export const ITEM_WEAPON_CATEGORY: Record<number, string> = {
  29594: 'staff',

  29589: 'slash_sword',

  11802: '2h_sword', // Armadyl godsword
  11804: '2h_sword', // Bandos godsword
  11806: '2h_sword', // Saradomin godsword
  11808: '2h_sword', // Zamorak godsword
  26233: '2h_sword', // Ancient godsword
  20593: '2h_sword', // Armadyl godsword (or)

  4587: 'slash_sword', // Dragon scimitar
  27690: 'slash_sword', // Voidwaker
  22324: 'stab_sword', // Ghrazi rapier

  4151: 'whip', // Abyssal whip
  12006: 'whip', // Abyssal tentacle

  13576: 'blunt', // Dragon warhammer
  21003: 'blunt', // Elder maul

  28338: 'axe', // Soulreaper axe
  28810: 'axe', // Zombie axe

  22325: 'scythe', // Scythe of vitur
  22486: 'scythe', // Scythe of vitur (uncharged)
  25736: 'scythe',
  25738: 'scythe',
  25739: 'scythe',
  25741: 'scythe',
  28543: 'scythe',
  28545: 'scythe',

  11235: 'bow', // Dark bow
  20997: 'bow', // Twisted bow
  23983: 'bow', // Crystal bow
  24123: 'bow', // Crystal bow (new)
  25865: 'bow',
  25867: 'bow',
  27610: 'bow', // Venator bow (/w/Venator_bow: CombatStyles Bow, speed 5, range 6)
  29000: 'bow',
  29591: 'bow', // Scorching bow

  9185: 'crossbow',
  11785: 'crossbow', // Armadyl crossbow
  26374: 'crossbow', // Zaryte crossbow

  11905: 'powered_staff',
  11907: 'powered_staff', // Trident of the seas
  12899: 'powered_staff', // Trident of the swamp
  22288: 'powered_staff',
  22292: 'powered_staff',
  22323: 'powered_staff', // Sanguinesti staff
  22481: 'powered_staff',
  22552: 'powered_staff',
  22555: 'powered_staff',
  23898: 'powered_staff',
  23899: 'powered_staff',
  23900: 'powered_staff',
  25731: 'powered_staff',
  25733: 'powered_staff',
  27275: 'powered_staff', // Tumeken's shadow
  27277: 'powered_staff',
  27662: 'powered_staff', // Accursed sceptre (uncharged)
  27665: 'powered_staff', // Accursed sceptre (charged)
  28547: 'powered_staff',
  28549: 'powered_staff',
  28583: 'powered_staff',
  28585: 'powered_staff',
  28796: 'powered_staff',
  31113: 'powered_staff',
  31115: 'powered_staff',
  33314: 'powered_staff',
  33318: 'powered_staff',
  33322: 'powered_staff',
  33323: 'powered_staff',
  33326: 'powered_staff',

  12926: 'thrown', // Toxic blowpipe

  10033: 'chinchompa', // Chinchompa
  10034: 'chinchompa', // Red chinchompa
  11959: 'chinchompa', // Black chinchompa

  6914: 'staff',
  4675: 'staff', // Ancient staff
  11791: 'staff', // Staff of the dead
  21006: 'staff',
  22296: 'staff', // Staff of light
  // Nightmare, Volatile and Eldritch Nightmare staves: Staff combat styles, 5-tick casts
  // (/w/Nightmare_staff, /w/Eldritch_Nightmare_staff). The Harmonised staff (24423) is left out:
  // its faster standard-spellbook casts are not modeled.
  24422: 'staff',
  24424: 'staff',
  24425: 'staff',
  27624: 'staff',
  27676: 'staff', // Accursed sceptre (au)
  27679: 'staff', // Accursed sceptre (a)
  30070: 'staff',

  26219: 'stab_sword', // Osmumten's fang: Stab, Lunge, Slash, Block (/w/Osmumten's_fang)

  13652: 'claw', // Dragon claws
  29577: 'claw', // Burning claws

  23528: 'spiked', // Sarachnis cudgel
  24417: 'spiked', // Inquisitor's mace (/w/Inquisitor's_mace: CombatStyles Spiked, speed 4)
  28997: 'spiked',
  29850: 'spiked',
  30759: 'spiked', // Soulflame horn

  11824: 'spear', // Zamorakian spear
  11889: 'spear', // Zamorakian hasta
  22978: 'spear', // Dragon hunter lance (actually polearm, but spear-like)

  23987: 'polearm', // Crystal halberd
  // Noxious halberd: Jab/Swipe/Fend; its 5-tick speed and 2-tile reach are the cache's weapon params.
  29796: 'polearm',

  11920: 'pickaxe', // Dragon pickaxe
  13243: 'pickaxe', // Infernal pickaxe

  13263: 'bludgeon', // Abyssal bludgeon

  21015: 'bulwark', // Dinh's bulwark
};

export interface AutocastSpellInfo {
  name: string;
  /** Interface sprite base name: lowercase, no extension, no size suffix. */
  icon: string;
  spellbook: SpellbookType;
  /** Attack range in tiles. */
  attackRange: number;
  /** Fixed hit delay in game ticks regardless of distance. Undefined = standard magic formula. */
  fixedHitDelay?: number;
}

const WEAPON_DEFAULT_AUTOCAST: Partial<Record<number, Partial<Record<SpellbookType, string>>>> = {
  4675: { ancient: 'Blood Barrage' },
  6914: { ancient: 'Blood Barrage' },
  21006: { ancient: 'Blood Barrage', arceuus: 'Dark Demonbane' },
  // "can autocast offensive standard spells as well as Ancient Magicks" (/w/Nightmare_staff);
  // the Volatile and Eldritch orbs keep that (/w/Eldritch_Nightmare_staff).
  24422: { ancient: 'Blood Barrage' },
  24424: { ancient: 'Blood Barrage' },
  24425: { ancient: 'Blood Barrage' },
  27624: { ancient: 'Blood Barrage' },
  29594: { arceuus: 'Dark Demonbane' },
  30070: { ancient: 'Blood Barrage' },
};

function getDefaultAutocastSpell(weaponId: number | undefined, spellbook: SpellbookType): AutocastSpellInfo | null {
  if (weaponId === undefined) return null;
  const spellName = WEAPON_DEFAULT_AUTOCAST[getEquipmentCombatBaseId(weaponId)]?.[spellbook];
  return spellName ? getSpellCastInfo(spellName) : null;
}

/** Categories whose default stance is chosen outright rather than by the scoring below. */
const CATEGORY_DEFAULT_COMBAT_STYLE: Readonly<Partial<Record<string, CombatStyle>>> = {
  whip: 'Accurate',
};

/**
 * Priority: autocast, a category's explicit default, fastest attack, greatest range, greatest melee
 * Strength stance bonus, then the first style in interface order.
 */
export function getDefaultAttackStyleIndex(
  weaponId: number | undefined,
  spellbook: SpellbookType = DEFAULT_SPELLBOOK,
): number {
  if (findWeaponCategoryKey(weaponId) === undefined) return 0;

  const category = getWeaponCategory(weaponId);
  if (getDefaultAutocastSpell(weaponId, spellbook)) {
    const castingIndex = category.styles.findIndex((style) => style.combatStyle === 'Casting');
    if (castingIndex >= 0) return castingIndex;
  }

  const preferred = CATEGORY_DEFAULT_COMBAT_STYLE[getWeaponCategoryKey(weaponId)];
  const preferredIndex = category.styles.findIndex((style) => style.combatStyle === preferred);
  if (preferredIndex >= 0) return preferredIndex;

  let bestIndex = 0;
  let bestScore = -1;
  for (const [index, style] of category.styles.entries()) {
    const speedScore = style.combatStyle === 'Rapid' ? 100 : 0;
    const rangeScore = style.combatStyle === 'Longrange' ? 10 : 0;
    const strengthScore = style.combatStyle === 'Aggressive' ? 3 : style.combatStyle === 'Controlled' ? 1 : 0;
    const score = speedScore + rangeScore + strengthScore;
    if (score > bestScore) {
      bestIndex = index;
      bestScore = score;
    }
  }
  return bestIndex;
}

function isCastingStyle(weaponId: number | undefined, selectedStyleIndex: number): boolean {
  if (weaponId === undefined) return false;
  const style = getWeaponCategory(weaponId).styles[selectedStyleIndex];
  if (!style) return false;
  return style.combatStyle === 'Casting' || style.combatStyle === 'Defensive Casting';
}

/** Prefer {@link resolveActiveSpell} in gameplay code — it honors the player's explicitly selected spell and only falls back to this table. */
export function getAutocastSpell(
  weaponId: number | undefined,
  selectedStyleIndex: number,
  spellbook: SpellbookType = DEFAULT_SPELLBOOK,
): AutocastSpellInfo | null {
  if (weaponId === undefined) return null;
  if (!isCastingStyle(weaponId, selectedStyleIndex)) return null;
  return getDefaultAutocastSpell(weaponId, spellbook);
}

export interface ActiveSpellSelection {
  readonly weaponId: number | undefined;
  readonly selectedStyleIndex: number;
  readonly selectedSpell: string | null | undefined;
  readonly spellbook: SpellbookType;
}

/** Melee and ranged styles keep their weapon range and hit-delay model even when their loadout has a spell selected for its magic switch. */
export function resolveActiveSpell({
  weaponId,
  selectedStyleIndex,
  selectedSpell,
  spellbook,
}: ActiveSpellSelection): AutocastSpellInfo | null {
  if (!isCastingStyle(weaponId, selectedStyleIndex)) return null;

  if (selectedSpell) {
    const info = getSpellCastInfo(selectedSpell);
    if (info) {
      return {
        name: info.name,
        icon: info.icon,
        spellbook: info.spellbook,
        attackRange: info.attackRange,
        ...(info.fixedHitDelay === undefined ? {} : { fixedHitDelay: info.fixedHitDelay }),
      };
    }
  }

  return getDefaultAutocastSpell(weaponId, spellbook);
}

export function findWeaponCategoryKey(weaponId: number | undefined): string | undefined {
  return weaponId === undefined ? undefined : ITEM_WEAPON_CATEGORY[getEquipmentCombatBaseId(weaponId)];
}

export function getWeaponCategoryKey(weaponId: number | undefined): string {
  return findWeaponCategoryKey(weaponId) ?? 'unarmed';
}

export function getWeaponCategory(weaponId: number | undefined): WeaponCategory {
  if (weaponId === undefined) {
    return WEAPON_CATEGORIES.unarmed;
  }

  const categoryKey = findWeaponCategoryKey(weaponId);
  if (categoryKey && WEAPON_CATEGORIES[categoryKey]) {
    return WEAPON_CATEGORIES[categoryKey];
  }

  return WEAPON_CATEGORIES.unarmed;
}
