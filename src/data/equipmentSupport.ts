import { findWeaponCategoryKey } from '../types/attackStyles';
import type { EquipmentCatalogItem } from './equipmentCatalog';
import { getEquipmentCombatBaseId } from './equipmentCombatFamilies';
import {
  findWeaponVerification,
  type VERIFIED_WEAPONS,
  WEAPON_VERIFICATION_GAPS,
  WEAPON_VERIFICATION_LIMITATIONS,
} from './equipmentVerification';
import { DEFAULT_ANIMATION_SET, getWeaponAnimationSetWithFallbacks } from './weaponAnimations';
import { getWeaponCombatVisuals } from './weaponCombatVisuals';

// Bows/crossbows resolve launch ammunition separately; staffs resolve the explicitly cast spell.
// Neither can require a weapon-only projectile row in this equipment verification gate.
const SELF_PROJECTILE_CATEGORIES: ReadonlySet<string> = new Set(['thrown', 'chinchompa', 'powered_staff']);

/**
 * Does a swing of this weapon look like the weapon?
 *
 * Mirrors the precedence in SceneCompositor's `flushPendingPlayerAttack`: the packet or
 * generated combat visuals win, then the generated / override / category animation chain.
 * That chain always ends in {@link DEFAULT_ANIMATION_SET}, so landing on its attack means
 * every earlier link missed and the player would throw a bare-fist punch.
 *
 * Sound does NOT ride along with this answer. `FrameSoundTracker` does play `SeqType.frameSounds`
 * for the player, but no weapon attack animation in the cache has any. Player weapon audio is
 * entirely the server-sent sound the packet captures show as `synth_sound`, modeled in
 * `resolvePlayerAttackSound`, so a weapon can swing correctly and still be silent or play the
 * wrong sound. Check the two separately.
 *
 * This is table coverage, not a render guarantee. The renderer additionally drops a sequence
 * that is missing from the cache or is skeletal rather than frame-based, and neither is
 * knowable here without the cache loaded. What it rules out is the case that motivated all of
 * this: a weapon with no entry anywhere, falling through to the bare-fist punch.
 */
function hasOwnAttackAnimation(itemId: number): boolean {
  const visuals = getWeaponCombatVisuals(itemId);
  if (visuals !== undefined && visuals.attackAnimation >= 0) {
    return true;
  }
  const resolved = getWeaponAnimationSetWithFallbacks(itemId).find((set) => set.attack !== undefined)?.attack;
  return resolved !== undefined && resolved !== DEFAULT_ANIMATION_SET.attack;
}

/**
 * Would a shot draw anything? Melee, bow and crossbow are exempt, not failing.
 *
 * The record existing is not enough: `projectileId` is -1 for weapons whose visuals carry only
 * an animation, and ProjectileController returns early on a negative id without launching. Every
 * self-projectile entry happens to have a real id today, so this changes no current answer; it is
 * here so the next generated entry cannot widen verification by existing.
 */
function hasProjectileWhenItNeedsOne(itemId: number, category: string): boolean {
  if (!SELF_PROJECTILE_CATEGORIES.has(category)) {
    return true;
  }
  const projectileId = getWeaponCombatVisuals(itemId)?.projectileId;
  return projectileId !== undefined && projectileId >= 0;
}

/**
 * Verification status, including explicitly accepted limitations.
 *
 * Non-weapons are verified: their stats come from the equipment catalog, and they have no
 * animation, sound or special of their own. A weapon is verified only when we have checked it
 * ourselves ({@link VERIFIED_WEAPONS}, which cites the evidence for each aspect), or explicitly
 * accepted its limitations ({@link WEAPON_VERIFICATION_LIMITATIONS}). Either way it must still
 * pass the checks below, so a listed weapon whose tables later lose an entry fails loudly.
 *
 * Those checks cover what fails worst. A weapon's attack styles, stance timing, hit delay and
 * animation all hang off {@link findWeaponCategoryKey}, a hand-maintained map (the live client
 * reads varbit 357 on equip, and we have no varbit). `getWeaponCategory` answers `unarmed` for
 * anything missing from it, silently, so an unmapped weapon gets Punch / Kick / Block, crush
 * damage and the bare-fist swing. A category alone is not enough either: the animation and
 * projectile tables are each independently incomplete.
 *
 * The rule covers the inventory too, because an inventory slot holding a weapon is a gear
 * switch waiting to happen (SimulationEngine's `equipFromInventory`).
 */
export function getEquipmentVerificationStatus(
  piece: Pick<EquipmentCatalogItem, 'id' | 'slot'>,
): 'verified' | 'verified-with-limitations' | 'unverified' {
  if (piece.slot !== 'weapon') {
    return 'verified';
  }
  if (!passesWeaponCapabilityChecks(piece.id)) {
    return 'unverified';
  }
  if (WEAPON_VERIFICATION_LIMITATIONS[piece.id] !== undefined) {
    return 'verified-with-limitations';
  }
  return findWeaponVerification(piece.id) !== undefined ? 'verified' : 'unverified';
}

/** Catalog filter approval: includes accepted limitations, but never capability failures. */
export function isVerifiedEquipmentPiece(piece: Pick<EquipmentCatalogItem, 'id' | 'slot'>): boolean {
  return getEquipmentVerificationStatus(piece) !== 'unverified';
}

/** The automatic half of weapon verification: category, own attack animation, projectile. */
export function passesWeaponCapabilityChecks(weaponId: number): boolean {
  return weaponCapabilityGaps(weaponId).length === 0;
}

function weaponCapabilityGaps(weaponId: number): readonly string[] {
  const itemId = getEquipmentCombatBaseId(weaponId);
  const category = findWeaponCategoryKey(itemId);
  if (category === undefined) {
    return ['Attacks as if unarmed.'];
  }
  const gaps: string[] = [];
  if (!hasOwnAttackAnimation(itemId)) gaps.push('Attack animation missing.');
  if (!hasProjectileWhenItNeedsOne(itemId, category)) gaps.push('Projectile missing.');
  return gaps;
}

/**
 * Player-facing gaps or accepted limitations, despite the function's name. Capability failures
 * come first. Empty only for fully verified weapons; an accepted limitation keeps its explicit notice.
 */
export function describeWeaponVerificationGaps(weaponId: number): readonly string[] {
  const gaps = [
    ...weaponCapabilityGaps(weaponId),
    ...(WEAPON_VERIFICATION_GAPS[weaponId] ?? []),
    ...(WEAPON_VERIFICATION_LIMITATIONS[weaponId] ?? []),
  ];
  if (gaps.length > 0 || findWeaponVerification(weaponId) !== undefined) return gaps;
  return ['Not checked yet.'];
}
