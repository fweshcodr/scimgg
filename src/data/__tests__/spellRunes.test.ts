import { describe, expect, it } from 'vitest';
import { ALL_SPELLBOOKS } from '../../types/spellbook';
import { getAutocastableSpells } from '../spellCatalog';
import {
  COMBINATION_RUNE,
  getSpellLevelRequirement,
  getSpellRuneRequirement,
  RUNE,
  SUBSTITUTE_RUNES,
  UNLIMITED_RUNE_SOURCES,
} from '../spellRunes';

/**
 * `resolveAttackResources` fails closed on a spell with no rune data, so a spell that reaches
 * the autocast picker without an entry here is not merely unpriced - it is uncastable.
 */
describe('spell rune coverage', () => {
  const autocastable = ALL_SPELLBOOKS.flatMap((spellbook) =>
    getAutocastableSpells(spellbook).map((spell) => ({ spellbook, name: spell.name })),
  );

  it('exposes autocastable spells to check', () => {
    expect(autocastable.length).toBeGreaterThan(0);
  });

  it.each(autocastable)('$spellbook/$name has a rune requirement', ({ name }) => {
    expect(getSpellRuneRequirement(name)).not.toBeNull();
  });

  it.each(autocastable)('$spellbook/$name has a Magic level requirement', ({ name }) => {
    expect(getSpellLevelRequirement(name)).not.toBeNull();
  });

  it('lists at least one known rune id per spell and no duplicates', () => {
    const knownRuneIds = new Set<number>(Object.values(RUNE));
    for (const { name } of autocastable) {
      const runeIds = getSpellRuneRequirement(name) ?? [];
      expect(runeIds.length).toBeGreaterThan(0);
      expect(new Set(runeIds).size).toBe(runeIds.length);
      for (const runeId of runeIds) {
        expect(knownRuneIds.has(runeId)).toBe(true);
      }
    }
  });
});

describe('unlimited rune sources', () => {
  it.each([
    { item: 'Tome of fire (charged)', id: 20714, rune: RUNE.fire },
    { item: 'Tome of water (charged)', id: 25574, rune: RUNE.water },
    { item: 'Tome of earth (charged)', id: 30064, rune: RUNE.earth },
  ])('$item supplies its element', ({ id, rune }) => {
    expect(UNLIMITED_RUNE_SOURCES[id]).toContain(rune);
  });
});

describe('surge spells', () => {
  it('need a wrath rune', () => {
    for (const name of ['Wind Surge', 'Water Surge', 'Earth Surge', 'Fire Surge']) {
      expect(getSpellRuneRequirement(name)).toContain(RUNE.wrath);
    }
  });
});

describe('aether runes', () => {
  it('substitute for both cosmic and soul runes', () => {
    expect(SUBSTITUTE_RUNES[RUNE.cosmic]).toContain(COMBINATION_RUNE.aether);
    expect(SUBSTITUTE_RUNES[RUNE.soul]).toContain(COMBINATION_RUNE.aether);
  });

  it('substitute for nothing else', () => {
    const substitutable = Object.entries(SUBSTITUTE_RUNES)
      .filter(([, substitutes]) => substitutes.includes(COMBINATION_RUNE.aether))
      .map(([runeId]) => Number(runeId))
      .sort((a, b) => a - b);
    expect(substitutable).toEqual([RUNE.cosmic, RUNE.soul].sort((a, b) => a - b));
  });
});
