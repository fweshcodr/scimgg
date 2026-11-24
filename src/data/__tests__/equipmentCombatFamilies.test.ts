import { describe, expect, it } from 'vitest';
import { findEquipmentCatalogItem, getEquipmentCatalog } from '../equipmentCatalog';
import {
  EQUIPMENT_COMBAT_FAMILIES,
  getEquipmentCombatBaseId,
  getEquipmentCombatVariantIds,
} from '../equipmentCombatFamilies';
import { isVerifiedEquipmentPiece } from '../equipmentSupport';

describe('equipment combat families', () => {
  it.each([
    [28688, 12926],
    [25734, 22324],
    [25731, 22323],
    [25733, 22481],
    [25736, 22325],
    [25739, 22325],
    [25738, 22486],
    [25741, 22486],
    [25888, 25867],
    [33021, 25867],
    [25870, 24551],
    [24664, 21018],
    [24666, 21021],
    [24668, 21024],
    [28254, 26382],
    [28256, 26384],
    [28258, 26386],
    [29804, 29801],
    [27253, 27251],
    [26469, 13072],
    [26463, 8839],
    [27000, 24177],
    [27003, 24178],
    [27008, 24143],
    [27009, 24142],
    [26496, 3840],
    [26498, 3842],
    [26531, 4089],
    [4099, 4089],
    [4109, 4089],
    [23047, 4089],
    [23050, 4091],
    [23053, 4093],
    [23056, 4095],
    [23059, 4097],
    [27119, 20595],
    [27123, 24288],
    [25063, 13243],
    [30345, 13243],
    [25369, 13244],
    [30346, 13244],
    [29605, 11802],
    [29611, 11235],
    [29615, 21793],
    [33322, 11907],
    [33323, 11905],
    [33434, 11908],
    [33314, 12899],
    [33316, 12900],
    [33318, 22292],
    [30445, 4708],
    [30519, 4856],
    [30525, 4857],
    [27705, 23971],
    [27707, 23973],
    [33031, 23971],
    [33033, 23973],
    [13197, 12931],
    [27376, 24222],
    [33340, 11864],
    [33445, 11865],
    [33447, 25177],
    [33449, 26674],
    [25069, 11850],
    [25071, 11851],
    [30777, 30750],
    [30437, 26241],
  ])('resolves cosmetic %i to its same-state base %i', (variantId, baseId) => {
    const resolved = getEquipmentCombatBaseId(variantId);

    expect(resolved).toBe(baseId);
  });

  it.each([
    -1, 0, 999999, 732, 3840, 12598, 25862, 25865, 25867, 23995, 23997, 24551, 22323, 22481, 22325, 22486, 12924, 12926,
    25985, 27251, 26376, 26378, 26380, 27853, 29599, 27187, 25495, 20593, 30302, 28945, 25112, 27550, 27551, 27552,
    27553,
  ])('preserves unclassified or distinct-state item %i', (itemId) => {
    const resolved = getEquipmentCombatBaseId(itemId);

    expect(resolved).toBe(itemId);
  });

  it('returns only direct cosmetic variants when given a state base', () => {
    const variants = getEquipmentCombatVariantIds(22325);

    expect(variants).toEqual([25736, 25739]);
  });

  it.each([999999, 25736, 25865])('returns no variants when %i is not a family base', (itemId) => {
    const variants = getEquipmentCombatVariantIds(itemId);

    expect(variants).toEqual([]);
  });

  it('has unique bases and unique variant membership when inspecting all groups', () => {
    const bases = EQUIPMENT_COMBAT_FAMILIES.map((group) => group.baseId);
    const variants = EQUIPMENT_COMBAT_FAMILIES.flatMap((group) => group.variantIds);

    expect(new Set(bases).size).toBe(bases.length);
    expect(new Set(variants).size).toBe(variants.length);
    expect(variants.filter((variantId) => bases.includes(variantId))).toEqual([]);
  });

  it('keeps every row nonempty and directly resolvable without chains or cycles', () => {
    for (const { baseId, variantIds } of EQUIPMENT_COMBAT_FAMILIES) {
      expect(variantIds.length).toBeGreaterThan(0);
      expect(getEquipmentCombatBaseId(baseId)).toBe(baseId);
      expect(getEquipmentCombatVariantIds(baseId)).toEqual(variantIds);
      for (const variantId of variantIds) {
        expect(Number.isSafeInteger(variantId)).toBe(true);
        expect(variantId).toBeGreaterThan(0);
        expect(getEquipmentCombatBaseId(variantId)).toBe(baseId);
        expect(getEquipmentCombatVariantIds(variantId)).toEqual([]);
      }
    }
  });

  it('references existing same-slot catalog items without relying on generated names or states', () => {
    for (const { baseId, variantIds } of EQUIPMENT_COMBAT_FAMILIES) {
      const base = findEquipmentCatalogItem(baseId);

      expect(base, `base ${baseId}`).toBeDefined();
      for (const variantId of variantIds) {
        const variant = findEquipmentCatalogItem(variantId);
        expect(variant, `variant ${variantId}`).toBeDefined();
        expect(variant?.slot, `variant ${variantId}`).toBe(base?.slot);
      }
    }
  });

  it('classifies every current explicit ornament suffix when scanning the catalog', () => {
    const ornaments = getEquipmentCatalog().filter((item) => item.name.includes('(or)'));

    const unclassified = ornaments.filter((item) => getEquipmentCombatBaseId(item.id) === item.id);

    expect(ornaments.length).toBeGreaterThan(0);
    expect(unclassified.map((item) => item.id)).toEqual([]);
  });

  it('does not grant weapon capability when a cosmetic family is classified', () => {
    const blade = { id: getEquipmentCombatBaseId(25870), slot: 'weapon' } as const;

    const supported = isVerifiedEquipmentPiece(blade);

    expect(blade.id).toBe(24551);
    expect(supported).toBe(false);
  });
});
