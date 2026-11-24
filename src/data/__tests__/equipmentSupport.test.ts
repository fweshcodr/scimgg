import { existsSync } from 'node:fs';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { selectPlayerAttackProfile } from '../../core/combat/player/playerAttackProfileSelection';
import { getSpecialAttackDef } from '../../core/combat/player/specialAttacks/registry';
import * as attackStyles from '../../types/attackStyles';
import { findWeaponCategoryKey } from '../../types/attackStyles';
import { findEquipmentCatalogItem } from '../equipmentCatalog';
import { EQUIPMENT_COMBAT_FAMILIES } from '../equipmentCombatFamilies';
import {
  describeWeaponVerificationGaps,
  getEquipmentVerificationStatus,
  isVerifiedEquipmentPiece,
  passesWeaponCapabilityChecks,
} from '../equipmentSupport';
import { VERIFIED_WEAPONS, WEAPON_VERIFICATION_GAPS, WEAPON_VERIFICATION_LIMITATIONS } from '../equipmentVerification';
import * as weaponAnimations from '../weaponAnimations';
import * as weaponCombatVisuals from '../weaponCombatVisuals';

const weapon = (id: number) => ({ id, slot: 'weapon' as const });
const VERIFIED = Object.entries(VERIFIED_WEAPONS).map(([id, entry]) => ({ id: Number(id), entry }));
const PROJECTILE_CATEGORIES = new Set(['bow', 'crossbow', 'thrown', 'powered_staff']);

afterEach(() => {
  vi.restoreAllMocks();
});

describe('cosmetic equipment capability', () => {
  it.each(EQUIPMENT_COMBAT_FAMILIES)('preserves state-base weapon capability for family $baseId', ({
    baseId,
    variantIds,
  }) => {
    const capable = passesWeaponCapabilityChecks(baseId);
    for (const id of variantIds) expect(passesWeaponCapabilityChecks(id), String(id)).toBe(capable);
  });

  it.each([25916, 25918, 25870, 33434, 999999])('does not grant weapon capability to %i', (id) => {
    expect(passesWeaponCapabilityChecks(id)).toBe(false);
  });
});

describe('weapons we have verified', () => {
  it.each(VERIFIED)('$entry.name ($id) is a catalog weapon that passes the automatic checks', ({ id }) => {
    expect(findEquipmentCatalogItem(id)?.slot).toBe('weapon');
    expect(isVerifiedEquipmentPiece(weapon(id))).toBe(true);
    expect(getEquipmentVerificationStatus(weapon(id))).toBe('verified');
    expect(WEAPON_VERIFICATION_LIMITATIONS[id]).toBeUndefined();
  });

  it.each(VERIFIED)("$entry.name's special is simulated, damage included, or it has none", ({ id, entry }) => {
    const special = selectPlayerAttackProfile({ weaponId: id, targetSize: 1, isSpecialAttack: true });
    if (entry.special === 'none') {
      expect(getSpecialAttackDef(id)).toBeUndefined();
      expect(special).toBeNull();
    } else {
      expect(getSpecialAttackDef(id)).toBeDefined();
      expect(special?.kind).not.toBe('unsupported');
    }
  });

  it.each(VERIFIED)('$entry.name cites a projectile exactly when it fires one', ({ id, entry }) => {
    const category = findWeaponCategoryKey(id) ?? '';
    if (entry.projectile === 'spell') return;
    expect(entry.projectile === 'none').toBe(!PROJECTILE_CATEGORIES.has(category));
  });

  it.each(VERIFIED)('$entry.name leaves its attack to the spell only if it is a staff', ({ id, entry }) => {
    const spellDriven = [entry.animation, entry.sound, entry.projectile].filter((aspect) => aspect === 'spell');
    // All three or none: a staff's swing, sound and projectile are the one spell.
    expect(spellDriven.length === 0 || spellDriven.length === 3).toBe(true);
    if (spellDriven.length === 3) expect(findWeaponCategoryKey(id)).toBe('staff');
  });

  it.each(VERIFIED)('$entry.name cites evidence that exists or a named capture', ({ entry }) => {
    for (const evidence of [entry.animation, entry.sound, entry.projectile, entry.special]) {
      if (evidence === 'none' || evidence === 'spell') continue;
      for (const reference of evidence) {
        // A capture is cited by file name; any other reference is a repository path.
        if (reference.startsWith('capture:')) expect(reference).toMatch(/^capture:[^/]+\.txt$/);
        else expect(existsSync(reference.split('#')[0]), reference).toBe(true);
      }
    }
  });

  it.each([
    [23528, 'Sarachnis cudgel'],
    [28688, 'Blazing blowpipe'],
    [9185, 'Rune crossbow'],
    [25884, 'Bow of Faerdhinen (c), Ithell: a named color of the recorded shot'],
    [21006, 'Kodai wand: a staff with no special'],
    [24422, 'Nightmare staff: a staff with no special'],
    [11806, 'Saradomin godsword: every style and its special, in the weapon sweep capture'],
    [20997, 'Twisted bow'],
    [27690, 'Voidwaker: every style and its special'],
    [26484, 'Abyssal tentacle (or)'],
    [28338, 'Soulreaper axe: every style and Behead'],
    [26219, "Osmumten's fang: every style and Eviscerate"],
    [13576, 'Dragon warhammer: every style and Smash'],
    [28810, 'Zombie axe: every style'],
    [11905, 'Trident of the seas (full)'],
    [11907, 'Trident of the seas'],
    [22288, 'Trident of the seas (e)'],
  ])('keeps %i verified (%s)', (id) => {
    expect(isVerifiedEquipmentPiece(weapon(id))).toBe(true);
    expect(describeWeaponVerificationGaps(id)).toEqual([]);
  });
  it("gives Inquisitor's mace its Spiked category but keeps it unverified for Spike", () => {
    expect(passesWeaponCapabilityChecks(24417)).toBe(true);
    expect(isVerifiedEquipmentPiece(weapon(24417))).toBe(false);
  });
});

describe('weapons with accepted limitations', () => {
  it('approves only the listed weapons, keeping their notices', () => {
    expect(Object.keys(WEAPON_VERIFICATION_LIMITATIONS)).toEqual([
      '10033',
      '10034',
      '11959',
      '12899',
      '22292',
      '24424',
      '24425',
      '27610',
      '29000',
      '29796',
    ]);
    expect(findEquipmentCatalogItem(29000)?.slot).toBe('weapon');
    expect(VERIFIED_WEAPONS[29000]).toBeUndefined();
    expect(WEAPON_VERIFICATION_GAPS[29000]).toBeUndefined();
    expect(getEquipmentVerificationStatus(weapon(29000))).toBe('verified-with-limitations');
    expect(isVerifiedEquipmentPiece(weapon(29000))).toBe(true);
    expect(describeWeaponVerificationGaps(29000)).toEqual(['Special attack unavailable.']);
    expect(getSpecialAttackDef(29000)).toBeUndefined();
  });

  it('approves the charged Venator bow with its notices, and no uncharged or Echo copy', () => {
    expect(passesWeaponCapabilityChecks(27610)).toBe(true);
    expect(getEquipmentVerificationStatus(weapon(27610))).toBe('verified-with-limitations');
    expect(describeWeaponVerificationGaps(27610)).toEqual([
      'Charges not tracked; always charged.',
      'Ricochet target choice approximated.',
      'Ricochet Salve and flat armour exceptions not modeled.',
    ]);
    expect(getEquipmentVerificationStatus(weapon(30434))).toBe('unverified');
    expect(describeWeaponVerificationGaps(27612)).toEqual(['Attacks as if unarmed.']);
  });

  it('approves the Noxious halberd without its poison-gated special or venom passive', () => {
    expect(findWeaponCategoryKey(29796)).toBe('polearm');
    expect(getEquipmentVerificationStatus(weapon(29796))).toBe('verified-with-limitations');
    expect(describeWeaponVerificationGaps(29796)).toEqual([
      'Special attack needs poison; not simulated.',
      'Venom passive not simulated.',
    ]);
    expect(getSpecialAttackDef(29796)).toBeUndefined();
    // Only the captured halberd: the Barbarian Assault copy is unchecked.
    expect(getEquipmentVerificationStatus(weapon(33178))).toBe('unverified');
  });

  it.each([
    [24424, 'Volatile Nightmare staff'],
    [24425, 'Eldritch Nightmare staff'],
  ])('approves the %i %s as an autocasting staff without its special', (id) => {
    expect(findWeaponCategoryKey(id)).toBe('staff');
    expect(getEquipmentVerificationStatus(weapon(id))).toBe('verified-with-limitations');
    expect(describeWeaponVerificationGaps(id)).toEqual(['Special attack unavailable.']);
    // Like the atlatl's: no registry entry, so the special never arms and no attack is refused.
    expect(getSpecialAttackDef(id)).toBeUndefined();
    expect(selectPlayerAttackProfile({ weaponId: id, targetSize: 1, isSpecialAttack: true })).toBeNull();
    const casting = attackStyles.getDefaultAttackStyleIndex(id, 'ancient');
    expect(attackStyles.getAutocastSpell(id, casting, 'ancient')?.name).toBe('Blood Barrage');
  });

  it('leaves the Harmonised Nightmare staff unsupported: its faster standard casts are not modeled', () => {
    expect(findWeaponCategoryKey(24423)).toBeUndefined();
    expect(getEquipmentVerificationStatus(weapon(24423))).toBe('unverified');
  });

  it('approves the Trident of the swamp without its venom', () => {
    expect(getEquipmentVerificationStatus(weapon(12899))).toBe('verified-with-limitations');
    expect(describeWeaponVerificationGaps(12899)).toEqual(['Venom not simulated.']);
    expect(getEquipmentVerificationStatus(weapon(22292))).toBe('verified-with-limitations');
    expect(describeWeaponVerificationGaps(22292)).toEqual(['Venom not simulated.']);
  });

  it('approves the chinchompas, the grey and red without captured graphics', () => {
    for (const id of [10033, 10034, 11959]) {
      expect(findWeaponCategoryKey(id), String(id)).toBe('chinchompa');
      expect(passesWeaponCapabilityChecks(id), String(id)).toBe(true);
      expect(getEquipmentVerificationStatus(weapon(id)), String(id)).toBe('verified-with-limitations');
    }
    expect(describeWeaponVerificationGaps(11959)).toEqual(['Throw and explosion sounds not modeled.']);
    for (const id of [10033, 10034]) {
      expect(describeWeaponVerificationGaps(id)).toEqual([
        'Projectile graphic unverified.',
        'Throw and explosion sounds not modeled.',
      ]);
    }
  });

  it('fails a chinchompa closed when its projectile goes missing', () => {
    const visuals = weaponCombatVisuals.getWeaponCombatVisuals(11959);
    if (visuals === undefined) throw new Error('Expected black chinchompa visuals');
    vi.spyOn(weaponCombatVisuals, 'getWeaponCombatVisuals').mockReturnValue({ ...visuals, projectileId: -1 });
    expect(describeWeaponVerificationGaps(11959)).toContain('Projectile missing.');
  });

  it.each(['category', 'animation'] as const)('fails closed on a %s regression', (capability) => {
    if (capability === 'category') {
      vi.spyOn(attackStyles, 'findWeaponCategoryKey').mockReturnValue(undefined);
    } else {
      vi.spyOn(weaponCombatVisuals, 'getWeaponCombatVisuals').mockReturnValue(undefined);
      vi.spyOn(weaponAnimations, 'getWeaponAnimationSetWithFallbacks').mockReturnValue([
        weaponAnimations.DEFAULT_ANIMATION_SET,
      ]);
    }
    expect(passesWeaponCapabilityChecks(29000)).toBe(false);
    expect(getEquipmentVerificationStatus(weapon(29000))).toBe('unverified');
    expect(isVerifiedEquipmentPiece(weapon(29000))).toBe(false);
    const reason = capability === 'category' ? 'Attacks as if unarmed.' : 'Attack animation missing.';
    expect(describeWeaponVerificationGaps(29000)).toEqual(
      expect.arrayContaining([reason, 'Special attack unavailable.']),
    );
  });

  it('does not extend approval to an unchecked weapon with working capabilities', () => {
    expect(passesWeaponCapabilityChecks(23987)).toBe(true);
    expect(getEquipmentVerificationStatus(weapon(23987))).toBe('unverified');
  });
});

describe('weapons with known gaps', () => {
  const GAPS = Object.entries(WEAPON_VERIFICATION_GAPS).map(([id, gaps]) => ({ id: Number(id), gaps }));

  it.each(GAPS)('$id is an unverified catalog weapon whose card lists its gaps', ({ id, gaps }) => {
    expect(findEquipmentCatalogItem(id)?.slot).toBe('weapon');
    expect(VERIFIED_WEAPONS[id]).toBeUndefined();
    expect(WEAPON_VERIFICATION_LIMITATIONS[id]).toBeUndefined();
    expect(getEquipmentVerificationStatus(weapon(id))).toBe('unverified');
    expect(isVerifiedEquipmentPiece(weapon(id))).toBe(false);
    expect(describeWeaponVerificationGaps(id)).toEqual(expect.arrayContaining([...gaps]));
  });

  it('says so when a weapon has never been checked', () => {
    expect(describeWeaponVerificationGaps(23987)).toEqual(['Not checked yet.']); // Crystal halberd
  });

  it('names a missing category, the worst gap', () => {
    expect(describeWeaponVerificationGaps(1317)).toEqual(['Attacks as if unarmed.']); // Adamant 2h sword
  });

  it("says only the Spike style is unverified on Inquisitor's mace", () => {
    expect(describeWeaponVerificationGaps(24417)).toEqual(['Spike attacks unverified.']);
  });
});
