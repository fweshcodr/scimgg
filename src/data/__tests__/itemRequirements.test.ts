import { describe, expect, it } from 'vitest';
import type { PlayerEquipment } from '../../rs/model/PlayerModelLoader';
import { createEmptyInventory, parseInventoryFromSetup } from '../../types/inventory';
import { computeSetRequirements, ITEM_WIELD_REQUIREMENTS } from '../itemRequirements';
import { EQUIPMENT_PRESETS } from '../playerPresets';

describe('ITEM_WIELD_REQUIREMENTS', () => {
  it('encodes the wiki wield requirements for the tricky items', () => {
    expect(ITEM_WIELD_REQUIREMENTS[22325]).toEqual({ attack: 80, strength: 90 }); // Scythe of vitur
    expect(ITEM_WIELD_REQUIREMENTS[26219]).toEqual({ attack: 82 }); // Osmumten's fang (82, not 80)
    expect(ITEM_WIELD_REQUIREMENTS[11806]).toEqual({ attack: 75 }); // Saradomin godsword (no strength)
    expect(ITEM_WIELD_REQUIREMENTS[24417]).toEqual({ attack: 80 }); // Inquisitor's mace (raised to 80)
    expect(ITEM_WIELD_REQUIREMENTS[30753]).toEqual({ defence: 78 }); // Oathplate chest (78, not 80)
    expect(ITEM_WIELD_REQUIREMENTS[29591]).toEqual({ ranged: 77 }); // Scorching bow (77, not 74)
    expect(ITEM_WIELD_REQUIREMENTS[31097]).toEqual({ defence: 80, strength: 80, ranged: 80, magic: 80 }); // Avernic treads
    expect(ITEM_WIELD_REQUIREMENTS[31106]).toEqual({ hitpoints: 90 }); // Confliction gauntlets
    expect(ITEM_WIELD_REQUIREMENTS[24422]).toEqual({ magic: 72, hitpoints: 50 }); // Nightmare staff (72 since 2022)
    expect(ITEM_WIELD_REQUIREMENTS[24425]).toEqual({ magic: 82, hitpoints: 50 }); // Eldritch: the orb raises it
  });

  it('omits items with no wield requirement (rings, capes, gloves, books)', () => {
    expect(ITEM_WIELD_REQUIREMENTS[28313]).toBeUndefined(); // Magus ring
    expect(ITEM_WIELD_REQUIREMENTS[28307]).toBeUndefined(); // Ultor ring
    expect(ITEM_WIELD_REQUIREMENTS[21295]).toBeUndefined(); // Infernal cape
    expect(ITEM_WIELD_REQUIREMENTS[7462]).toBeUndefined(); // Barrows gloves
  });
});

describe('computeSetRequirements', () => {
  it('takes the max per skill across equipment and inventory items', () => {
    const equipment: PlayerEquipment = {
      weapon: 22325, // Scythe of vitur — attack 80, strength 90
      boots: 31097, // Avernic treads — defence/strength/ranged/magic 80
      head: 30753, // Oathplate chest (body id reused as a stand-in) — defence 78
    };
    const inventory = parseInventoryFromSetup([
      { id: 26219 }, // Osmumten's fang — attack 82
      { id: 21295 }, // Infernal cape — no requirement, contributes nothing
    ]);

    expect(computeSetRequirements(equipment, inventory)).toEqual({
      attack: 82, // fang 82 beats scythe 80
      strength: 90, // scythe 90 beats treads 80
      defence: 80, // treads 80 beats oathplate 78
      ranged: 80,
      magic: 80,
    });
  });

  it('returns an empty map for an empty loadout', () => {
    expect(computeSetRequirements({}, createEmptyInventory())).toEqual({});
  });
});

describe('EQUIPMENT_PRESETS derived requirements', () => {
  it('gates Max Mage on Tumeken shadow, Avernic treads, ward and Confliction gauntlets', () => {
    expect(EQUIPMENT_PRESETS.yama_p3['max-mage'].requirements).toEqual({
      attack: 75,
      strength: 80,
      defence: 80,
      ranged: 80,
      magic: 85,
      prayer: 80,
      hitpoints: 90,
    });
  });

  it('gates Learner (Mage) only on its Blue moon / Purging staff / Tormented bracelet items', () => {
    expect(EQUIPMENT_PRESETS.yama_p3['learner-mage'].requirements).toEqual({
      attack: 50, // Purging staff
      defence: 50, // Blue moon (not 75)
      magic: 77, // Purging staff (not 75)
      hitpoints: 75, // Tormented bracelet
    });
  });

  it('gates Glyphic Melee prayer on the Bonecrusher necklace (70, not 60)', () => {
    expect(EQUIPMENT_PRESETS.yama_p3_glyphic.melee.requirements).toEqual({
      attack: 80,
      strength: 75,
      defence: 80,
      magic: 77,
      prayer: 70,
    });
  });

  it('gives every real (non-fallback) preset a non-empty requirement and leaves fallbacks free', () => {
    for (const group of Object.values(EQUIPMENT_PRESETS)) {
      for (const preset of Object.values(group)) {
        if (preset.isFallback) {
          expect(preset.requirements ?? {}).toEqual({});
        } else {
          expect(Object.keys(preset.requirements ?? {}).length).toBeGreaterThan(0);
        }
      }
    }
  });
});
