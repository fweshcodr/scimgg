import { getEquipmentCombatBaseId } from '../../data/equipmentCombatFamilies';
import type { PlayerEquipment } from '../../rs/model/PlayerModelLoader';
import type { CombatSupplies, SupplyItem } from '../../types/encounterLoadout';
import type { Inventory } from '../../types/inventory';
import { isAmmoCompatible, weaponRequiresExternalAmmo } from './ammoCompatibility';
import type { CombatFormulaStyle } from './formulas';
import { checkSpellCast } from './runeAvailability';

const ECLIPSE_ATLATL_ID = 29000;
const ATLATL_DART_ID = 28991;
const TOXIC_BLOWPIPE_ID = 12926;
const DRAGON_DART_ID = 11230;

export type AttackResourceSource = 'equipped' | 'quiver' | 'blowpipe' | 'none';

/**
 * What an attack draws on. Ammunition and runes are infinite here, so this only
 * answers whether the right TYPE is present - nothing is ever spent.
 */
export type ResolvedAttackResources =
  | { readonly kind: 'ammo'; readonly source: Exclude<AttackResourceSource, 'none'>; readonly ammoId: number }
  | { readonly kind: 'spell'; readonly source: 'none'; readonly spellId: string }
  | { readonly kind: 'none'; readonly source: 'none' }
  | { readonly kind: 'unavailable'; readonly source: 'none' };

export const NO_ATTACK_RESOURCES: ResolvedAttackResources = { kind: 'none', source: 'none' };

export type AttackResourceContext = {
  readonly weaponId: number | undefined;
  readonly equipment: PlayerEquipment;
  readonly inventory: Inventory;
  readonly formulaStyle: CombatFormulaStyle;
  readonly supplies: CombatSupplies;
  /** Current (boosted) Magic level, for the spell level gate. */
  readonly magicLevel?: number;
  /**
   * Spell forced by a manual cast on this tick. Bypasses the magic-formula gate,
   * because in OSRS a manual cast works from any weapon and any attack style.
   */
  readonly manualCastSpell?: string | null;
  /**
   * Spell the player is actually casting this tick, already resolved through
   * `resolveActiveSpell` so a weapon's built-in default autocast is included.
   * Falls back to `supplies.selectedSpell` when omitted.
   */
  readonly activeSpell?: string | null;
};

function isCompatible(weaponId: number, ammo: SupplyItem | null): ammo is SupplyItem {
  return ammo !== null && isAmmoCompatible(weaponId, ammo.id);
}

export function resolveAttackResources(context: AttackResourceContext): ResolvedAttackResources {
  const autocastSpell = 'activeSpell' in context ? context.activeSpell : context.supplies.selectedSpell;
  const spellId = context.manualCastSpell ?? (context.formulaStyle === 'magic' ? autocastSpell : null);
  if (spellId) {
    // Fail closed. A spell with no rune data in SPELL_RUNE_REQUIREMENTS cannot be
    // gated, so casting it would be ungated - which silently invalidates every magic
    // DPS result. `checkSpellCast` reports such a spell as uncastable, and a guard
    // test enforces that every autocastable spell in the catalog carries an entry.
    return checkSpellCast(spellId, {
      equipment: context.equipment,
      inventory: context.inventory,
      runePouch: context.supplies.runePouch,
      ...(context.magicLevel === undefined ? {} : { magicLevel: context.magicLevel }),
    }).ok
      ? { kind: 'spell', source: 'none', spellId }
      : { kind: 'unavailable', source: 'none' };
  }

  const baseWeaponId = context.weaponId === undefined ? undefined : getEquipmentCombatBaseId(context.weaponId);
  switch (baseWeaponId) {
    case ECLIPSE_ATLATL_ID:
    case 29851:
      // Atlatl darts must be equipped; generic resolution would incorrectly allow quiver darts.
      return context.supplies.equippedAmmo?.id === ATLATL_DART_ID
        ? { kind: 'ammo', source: 'equipped', ammoId: ATLATL_DART_ID }
        : { kind: 'unavailable', source: 'none' };
    case TOXIC_BLOWPIPE_ID:
      // The blowpipe is modeled as permanently charged and loaded with infinite dragon darts.
      return { kind: 'ammo', source: 'blowpipe', ammoId: DRAGON_DART_ID };
    default: {
      const weaponId = context.weaponId;
      if (weaponId !== undefined && isCompatible(weaponId, context.supplies.equippedAmmo)) {
        return { kind: 'ammo', source: 'equipped', ammoId: context.supplies.equippedAmmo.id };
      }
      if (weaponId !== undefined && isCompatible(weaponId, context.supplies.quiverAmmo)) {
        return { kind: 'ammo', source: 'quiver', ammoId: context.supplies.quiverAmmo.id };
      }
      return weaponRequiresExternalAmmo(weaponId) ? { kind: 'unavailable', source: 'none' } : NO_ATTACK_RESOURCES;
    }
  }
}
