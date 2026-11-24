import { findEquipmentCatalogItem } from '../../data/equipmentCatalog';
import { getEquipmentCombatBaseId } from '../../data/equipmentCombatFamilies';
import { SEEKING_ARROWS } from '../../data/seekingArrows';

const ECLIPSE_ATLATL_IDS: ReadonlySet<number> = new Set([29000, 29851]);
const ATLATL_DART_ID = 28991;

// /w/Venator_bow: "It can fire any type of arrow, including dragon arrows".
const ARROW_WEAPON_IDS: ReadonlySet<number> = new Set([11235, 20997, 27610, 29591]);
const STANDARD_BOLT_WEAPON_IDS: ReadonlySet<number> = new Set([9185]);
const DRAGON_BOLT_WEAPON_IDS: ReadonlySet<number> = new Set([11785, 26374]);

const STANDARD_ARROW_NAME = /^(?:bronze|iron|steel|mithril|adamant|rune|broad|amethyst|dragon)(?: fire)? arrows?/i;
const STANDARD_BOLT_NAME =
  /^(?:bronze|blurite|iron|steel|mithril|adamant|runite|silver|broad|amethyst broad|opal|jade|pearl|topaz|sapphire|emerald|ruby|diamond|dragonstone|onyx) bolts?/i;
const DRAGON_BOLT_NAME =
  /^(?:dragon|opal dragon|jade dragon|pearl dragon|topaz dragon|sapphire dragon|emerald dragon|ruby dragon|diamond dragon|dragonstone dragon|onyx dragon) bolts?/i;

type AmmoKind = 'arrow' | 'standard_bolt' | 'dragon_bolt' | 'atlatl_dart' | 'unsupported';

function classifyAmmo(ammoId: number): AmmoKind {
  if (ammoId === ATLATL_DART_ID) return 'atlatl_dart';
  if (SEEKING_ARROWS[ammoId] !== undefined) return 'arrow';
  const item = findEquipmentCatalogItem(ammoId);
  if (item?.slot !== 'ammo') return 'unsupported';
  if (DRAGON_BOLT_NAME.test(item.name)) return 'dragon_bolt';
  if (STANDARD_BOLT_NAME.test(item.name)) return 'standard_bolt';
  return STANDARD_ARROW_NAME.test(item.name) ? 'arrow' : 'unsupported';
}

export function isQuiverStorableAmmo(ammoId: number): boolean {
  const kind = classifyAmmo(ammoId);
  return kind === 'arrow' || kind === 'standard_bolt' || kind === 'dragon_bolt';
}

export function weaponRequiresExternalAmmo(weaponId: number | undefined): boolean {
  const baseWeaponId = weaponId === undefined ? undefined : getEquipmentCombatBaseId(weaponId);
  return (
    baseWeaponId !== undefined &&
    (ECLIPSE_ATLATL_IDS.has(baseWeaponId) ||
      ARROW_WEAPON_IDS.has(baseWeaponId) ||
      STANDARD_BOLT_WEAPON_IDS.has(baseWeaponId) ||
      DRAGON_BOLT_WEAPON_IDS.has(baseWeaponId))
  );
}

export function isAmmoCompatible(weaponId: number, ammoId: number): boolean {
  const baseWeaponId = getEquipmentCombatBaseId(weaponId);
  const kind = classifyAmmo(ammoId);
  if (ECLIPSE_ATLATL_IDS.has(baseWeaponId)) return kind === 'atlatl_dart';
  if (ARROW_WEAPON_IDS.has(baseWeaponId)) return kind === 'arrow';
  if (STANDARD_BOLT_WEAPON_IDS.has(baseWeaponId)) return kind === 'standard_bolt';
  return DRAGON_BOLT_WEAPON_IDS.has(baseWeaponId) && (kind === 'standard_bolt' || kind === 'dragon_bolt');
}
