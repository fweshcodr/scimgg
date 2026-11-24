/**
 * Rune requirements for casting, and the item rules that decide whether the
 * player actually has them.
 *
 * Runes are infinite in this simulator, so only the rune TYPES a spell needs are
 * modeled; the matching `magic_runecount_N` counts are deliberately not stored.
 */

/**
 * Base rune item IDs.
 * Source: RuneLite ItemID.java:1670-1730
 */
export const RUNE = {
  fire: 554,
  water: 555,
  air: 556,
  earth: 557,
  mind: 558,
  body: 559,
  death: 560,
  nature: 561,
  chaos: 562,
  law: 563,
  cosmic: 564,
  blood: 565,
  soul: 566,
  wrath: 21880,
} as const;

/**
 * Combination rune item IDs.
 * Source: RuneLite ItemID.java:15222-15247
 * and ItemID.java:79335 (aether rune).
 */
export const COMBINATION_RUNE = {
  steam: 4694,
  mist: 4695,
  dust: 4696,
  smoke: 4697,
  mud: 4698,
  lava: 4699,
  aether: 30843,
} as const;

/**
 * Which base rune each combination rune can stand in for.
 *
 * Resolved per element (https://oldschool.runescape.wiki/w/Runes#Combination_runes).
 * A consumed combination rune simultaneously supplies one rune toward every matching
 * component requirement in the same cast.
 *
 * The aether rune's components are catalytic rather than elemental: it counts as one
 * cosmic rune AND one soul rune, so a spell needing either (or both) spends a single
 * aether rune. Wiki: https://oldschool.runescape.wiki/w/Aether_rune
 */
export const COMBINATION_RUNE_ELEMENTS: Readonly<Record<number, readonly number[]>> = {
  [COMBINATION_RUNE.mist]: [RUNE.air, RUNE.water],
  [COMBINATION_RUNE.dust]: [RUNE.air, RUNE.earth],
  [COMBINATION_RUNE.smoke]: [RUNE.air, RUNE.fire],
  [COMBINATION_RUNE.mud]: [RUNE.water, RUNE.earth],
  [COMBINATION_RUNE.steam]: [RUNE.water, RUNE.fire],
  [COMBINATION_RUNE.lava]: [RUNE.earth, RUNE.fire],
  [COMBINATION_RUNE.aether]: [RUNE.cosmic, RUNE.soul],
};

/** Combination runes that can substitute for a given base rune. */
export const SUBSTITUTE_RUNES: Readonly<Record<number, readonly number[]>> = (() => {
  const byElement = new Map<number, number[]>();
  for (const [comboId, elements] of Object.entries(COMBINATION_RUNE_ELEMENTS)) {
    for (const element of elements) {
      const list = byElement.get(element) ?? [];
      list.push(Number(comboId));
      byElement.set(element, list);
    }
  }
  return Object.fromEntries(byElement);
})();

/**
 * Equipped items that supply an element without consuming runes.
 *
 * An elemental staff in the weapon slot supplies its element without consuming runes,
 * and a charged tome does the same from the shield slot
 * (https://oldschool.runescape.wiki/w/Magic#Runes, and the per-item wiki pages).
 *
 * Only the CHARGED tome ids appear: an empty tome supplies nothing.
 */
export const UNLIMITED_RUNE_SOURCES: Readonly<Record<number, readonly number[]>> = {
  1381: [RUNE.air], // Staff of air
  1397: [RUNE.air], // Air battlestaff
  1405: [RUNE.air], // Mystic air staff
  1383: [RUNE.water], // Staff of water
  1395: [RUNE.water], // Water battlestaff
  1403: [RUNE.water], // Mystic water staff
  21006: [RUNE.water], // Kodai wand
  1385: [RUNE.earth], // Staff of earth
  1399: [RUNE.earth], // Earth battlestaff
  1407: [RUNE.earth], // Mystic earth staff
  1387: [RUNE.fire], // Staff of fire
  1393: [RUNE.fire], // Fire battlestaff
  1401: [RUNE.fire], // Mystic fire staff
  // Combination staves supply both component elements
  3053: [RUNE.earth, RUNE.fire], // Lava battlestaff
  3054: [RUNE.earth, RUNE.fire], // Mystic lava staff
  6562: [RUNE.water, RUNE.earth], // Mud battlestaff
  6563: [RUNE.water, RUNE.earth], // Mystic mud staff
  11787: [RUNE.water, RUNE.fire], // Steam battlestaff
  11789: [RUNE.water, RUNE.fire], // Mystic steam staff
  11998: [RUNE.air, RUNE.fire], // Smoke battlestaff
  12000: [RUNE.air, RUNE.fire], // Mystic smoke staff
  20730: [RUNE.air, RUNE.water], // Mist battlestaff
  20733: [RUNE.air, RUNE.water], // Mystic mist staff
  20736: [RUNE.air, RUNE.earth], // Dust battlestaff
  20739: [RUNE.air, RUNE.earth], // Mystic dust staff
  30634: [RUNE.water, RUNE.fire], // Twinflame staff
  // Charged tomes (shield slot)
  20714: [RUNE.fire], // Tome of fire (charged)
  25574: [RUNE.water], // Tome of water (charged)
  30064: [RUNE.earth], // Tome of earth (charged)
};

/**
 * The two Arceuus spells the engine resolves on the caster instead of at a target.
 *
 * Named because three layers have to agree on the exact string: these requirement tables, the
 * `SimulationEngine` cast methods that gate on them, and the spellbook slot whose LABEL is what
 * routes a click to the right cast. A typo in any one of them silently produces a spell that
 * cannot be cast, or a click that does nothing.
 */
export const MARK_OF_DARKNESS_SPELL = 'Mark of Darkness';
export const DEATH_CHARGE_SPELL = 'Death Charge';

/**
 * Magic level required to cast a spell.
 *
 * This is checked against the player's CURRENT (boosted) Magic level, not their
 * base level: the OSRS Wiki states a boosted player "will be able to cast spells
 * with a higher requirement"
 * (https://oldschool.runescape.wiki/w/Magic_potion). The base-level restriction the
 * Wiki documents applies to equipping gear, not to casting.
 *
 * Sources: https://oldschool.runescape.wiki/w/Magic#Standard_spells (Combat spell table),
 * https://oldschool.runescape.wiki/w/Ancient_Magicks#Combat_spells and
 * https://oldschool.runescape.wiki/w/Arceuus_spellbook (Grasp, Demonbane, Other and
 * Teleportation spell tables).
 *
 * Only spells this simulator can actually cast are listed. The Ancient teleports are
 * omitted deliberately: they are grayed out regardless because the engine does not
 * implement them, so a level for them would never be read.
 */
export const SPELL_LEVEL_REQUIREMENTS: Readonly<Record<string, number>> = {
  'Wind Strike': 1,
  'Water Strike': 5,
  'Earth Strike': 9,
  'Fire Strike': 13,
  'Wind Bolt': 17,
  'Water Bolt': 23,
  'Earth Bolt': 29,
  'Fire Bolt': 35,
  'Crumble Undead': 39,
  'Wind Blast': 41,
  'Water Blast': 47,
  'Iban Blast': 50,
  'Magic Dart': 50,
  'Earth Blast': 53,
  'Fire Blast': 59,
  'Saradomin Strike': 60,
  'Claws of Guthix': 60,
  'Flames of Zamorak': 60,
  'Wind Wave': 62,
  'Water Wave': 65,
  'Earth Wave': 70,
  'Fire Wave': 75,
  'Wind Surge': 81,
  'Water Surge': 85,
  'Earth Surge': 90,
  'Fire Surge': 95,

  'Smoke Rush': 50,
  'Shadow Rush': 52,
  'Blood Rush': 56,
  'Ice Rush': 58,
  'Smoke Burst': 62,
  'Shadow Burst': 64,
  'Blood Burst': 68,
  'Ice Burst': 70,
  'Smoke Blitz': 74,
  'Shadow Blitz': 76,
  'Blood Blitz': 80,
  'Ice Blitz': 82,
  'Smoke Barrage': 86,
  'Shadow Barrage': 88,
  'Blood Barrage': 92,
  'Ice Barrage': 94,

  'Ghostly Grasp': 35,
  'Inferior Demonbane': 44,
  'Skeletal Grasp': 56,
  'Superior Demonbane': 62,
  'Undead Grasp': 79,
  'Dark Demonbane': 82,

  // --- Arceuus utility the engine implements ---
  'Arceuus Home Teleport': 1,
  [MARK_OF_DARKNESS_SPELL]: 59,
  [DEATH_CHARGE_SPELL]: 80,
};

/** Magic level needed for a spell, or null when the spell has no requirement data. */
export function getSpellLevelRequirement(spellName: string): number | null {
  return SPELL_LEVEL_REQUIREMENTS[spellName] ?? null;
}

/**
 * Rune types required per combat spell, keyed by the same spell name used by
 * `CombatSupplies.selectedSpell`.
 *
 * Source: OSRS Wiki combat-spell tables for the standard spellbook, Ancient Magicks
 * and the Arceuus spellbook. Only the books this simulator ships a spell grid for are
 * listed; a spell missing from this table cannot be cast (see `checkSpellCast`).
 */
export const SPELL_RUNE_REQUIREMENTS: Readonly<Record<string, readonly number[]>> = {
  // God spells additionally require the matching god staff, and Iban Blast / Magic Dart
  // their signature staves. That is a weapon gate, not a rune gate, so it is not modeled here.
  'Wind Strike': [RUNE.air, RUNE.mind],
  'Water Strike': [RUNE.water, RUNE.air, RUNE.mind],
  'Earth Strike': [RUNE.earth, RUNE.air, RUNE.mind],
  'Fire Strike': [RUNE.fire, RUNE.air, RUNE.mind],
  'Wind Bolt': [RUNE.air, RUNE.chaos],
  'Water Bolt': [RUNE.water, RUNE.air, RUNE.chaos],
  'Earth Bolt': [RUNE.earth, RUNE.air, RUNE.chaos],
  'Fire Bolt': [RUNE.fire, RUNE.air, RUNE.chaos],
  'Crumble Undead': [RUNE.earth, RUNE.air, RUNE.chaos],
  'Wind Blast': [RUNE.air, RUNE.death],
  'Water Blast': [RUNE.water, RUNE.air, RUNE.death],
  'Iban Blast': [RUNE.fire, RUNE.death],
  'Magic Dart': [RUNE.mind, RUNE.death],
  'Earth Blast': [RUNE.earth, RUNE.air, RUNE.death],
  'Fire Blast': [RUNE.fire, RUNE.air, RUNE.death],
  'Saradomin Strike': [RUNE.fire, RUNE.blood, RUNE.air],
  'Claws of Guthix': [RUNE.fire, RUNE.blood, RUNE.air],
  'Flames of Zamorak': [RUNE.fire, RUNE.blood, RUNE.air],
  'Wind Wave': [RUNE.air, RUNE.blood],
  'Water Wave': [RUNE.water, RUNE.air, RUNE.blood],
  'Earth Wave': [RUNE.earth, RUNE.air, RUNE.blood],
  'Fire Wave': [RUNE.fire, RUNE.air, RUNE.blood],
  'Wind Surge': [RUNE.air, RUNE.wrath],
  'Water Surge': [RUNE.water, RUNE.air, RUNE.wrath],
  'Earth Surge': [RUNE.earth, RUNE.air, RUNE.wrath],
  'Fire Surge': [RUNE.fire, RUNE.air, RUNE.wrath],

  'Smoke Rush': [RUNE.air, RUNE.fire, RUNE.chaos, RUNE.death],
  'Shadow Rush': [RUNE.air, RUNE.chaos, RUNE.death, RUNE.soul],
  'Blood Rush': [RUNE.blood, RUNE.chaos, RUNE.death],
  'Ice Rush': [RUNE.water, RUNE.chaos, RUNE.death],
  'Smoke Burst': [RUNE.air, RUNE.fire, RUNE.chaos, RUNE.death],
  'Shadow Burst': [RUNE.air, RUNE.chaos, RUNE.death, RUNE.soul],
  'Blood Burst': [RUNE.blood, RUNE.chaos, RUNE.death],
  'Ice Burst': [RUNE.water, RUNE.chaos, RUNE.death],
  'Smoke Blitz': [RUNE.air, RUNE.fire, RUNE.blood, RUNE.death],
  'Shadow Blitz': [RUNE.air, RUNE.blood, RUNE.death, RUNE.soul],
  'Blood Blitz': [RUNE.blood, RUNE.death],
  'Ice Blitz': [RUNE.water, RUNE.blood, RUNE.death],
  'Smoke Barrage': [RUNE.air, RUNE.fire, RUNE.blood, RUNE.death],
  'Shadow Barrage': [RUNE.air, RUNE.blood, RUNE.death, RUNE.soul],
  'Blood Barrage': [RUNE.blood, RUNE.death, RUNE.soul],
  'Ice Barrage': [RUNE.water, RUNE.blood, RUNE.death],

  'Inferior Demonbane': [RUNE.fire, RUNE.chaos],
  'Superior Demonbane': [RUNE.fire, RUNE.soul],
  'Dark Demonbane': [RUNE.fire, RUNE.soul],
  'Ghostly Grasp': [RUNE.air, RUNE.chaos],
  'Skeletal Grasp': [RUNE.earth, RUNE.death],
  'Undead Grasp': [RUNE.fire, RUNE.blood],

  // The two self-cast Arceuus spells are here for the same reason the combat spells are:
  // `SimulationEngine` gates the cast on `checkSpellCast`, and a spell absent from this table
  // reports `unknown-spell` and can never be cast at all.
  // Wiki, Mark of Darkness § Cost: "1 Cosmic rune 1 Soul rune".
  [MARK_OF_DARKNESS_SPELL]: [RUNE.cosmic, RUNE.soul],
  // Wiki, Death Charge § Cost: "1 Death rune 1 Blood rune 1 Soul rune".
  [DEATH_CHARGE_SPELL]: [RUNE.death, RUNE.blood, RUNE.soul],
};

/** Rune types a spell needs, or null when the spell has no requirement data. */
export function getSpellRuneRequirement(spellName: string): readonly number[] | null {
  return SPELL_RUNE_REQUIREMENTS[spellName] ?? null;
}
