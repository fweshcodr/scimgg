import { describe, expect, it } from 'vitest';
import { canCastSpell, hasRune, type RuneSourceContext } from '../../core/combat/runeAvailability';
import { EQUIPMENT_PRESETS } from '../playerPresets';
import { COMBINATION_RUNE, RUNE } from '../spellRunes';

/**
 * A preset that carries a rune pouch but leaves it empty is worse than one with no
 * pouch at all: the loadout looks castable in the equipment planner and then fails
 * the rune check in game. These tests pin the pouch contents to the spells each set
 * is built around.
 */

/** Rune-pouch item ids and the {@link RunePouch} kind they hold. */
const RUNE_POUCH_ITEMS: Readonly<Record<number, 'standard' | 'divine'>> = {
  12791: 'standard', // Rune pouch
  27281: 'divine', // Divine rune pouch
};

const ALL_PRESETS = Object.entries(EQUIPMENT_PRESETS).flatMap(([encounter, group]) =>
  Object.entries(group).map(([key, preset]) => ({ encounter, key, preset })),
);

function pouchItemKind(preset: (typeof ALL_PRESETS)[number]['preset']): 'standard' | 'divine' | null {
  for (const slot of preset.inventory) {
    const kind = slot ? RUNE_POUCH_ITEMS[slot.id] : undefined;
    if (kind) return kind;
  }
  return null;
}

function runeContext(preset: (typeof ALL_PRESETS)[number]['preset']): RuneSourceContext {
  return {
    equipment: preset.equipment,
    inventory: preset.inventory,
    runePouch: preset.supplies?.runePouch ?? null,
  };
}

const PRESETS_WITH_POUCH = ALL_PRESETS.filter((entry) => pouchItemKind(entry.preset) !== null);
const PRESETS_WITHOUT_POUCH = ALL_PRESETS.filter((entry) => pouchItemKind(entry.preset) === null);

describe('rune pouch contents', () => {
  it('finds presets that carry a rune pouch', () => {
    expect(PRESETS_WITH_POUCH.length).toBeGreaterThan(0);
  });

  it.each(PRESETS_WITH_POUCH)('$encounter/$key fills the rune pouch it carries', ({ preset }) => {
    const runePouch = preset.supplies?.runePouch;
    expect(runePouch).not.toBeNull();
    expect(runePouch?.kind).toBe(pouchItemKind(preset));
    expect(runePouch?.slots.filter((slot) => slot !== null).length).toBeGreaterThan(0);
  });

  it.each(PRESETS_WITHOUT_POUCH)('$encounter/$key declares no rune pouch it does not carry', ({ preset }) => {
    expect(preset.supplies?.runePouch ?? null).toBeNull();
  });
});

/**
 * The three spells a Yama trip is built around, with the rune TYPES they need.
 *
 * Sources: https://oldschool.runescape.wiki/w/Death_Charge,
 * https://oldschool.runescape.wiki/w/Dark_Demonbane and
 * https://oldschool.runescape.wiki/w/Resurrection_spells. Aether runes stand in for
 * both the cosmic and the soul requirements, so all three fit in four pouch slots
 * alongside death, fire and blood (https://oldschool.runescape.wiki/w/Aether_rune).
 */
const YAMA_SPELL_RUNES: Readonly<Record<string, readonly number[]>> = {
  'Death Charge': [RUNE.blood, RUNE.death, RUNE.soul],
  'Dark Demonbane': [RUNE.fire, RUNE.soul],
  'Resurrect Greater Ghost': [RUNE.fire, RUNE.blood, RUNE.cosmic],
};

const YAMA_PRESETS = PRESETS_WITH_POUCH.filter((entry) => entry.encounter.startsWith('yama_p3'));

describe('Yama rune pouches', () => {
  it('covers every Yama set that carries a pouch', () => {
    expect(YAMA_PRESETS.length).toBe(9);
  });

  it.each(YAMA_PRESETS)('$encounter/$key packs death, fire, blood and aether runes', ({ preset }) => {
    const ids = (preset.supplies?.runePouch?.slots ?? []).map((slot) => slot?.id ?? null);
    expect(ids).toEqual([RUNE.death, RUNE.fire, RUNE.blood, COMBINATION_RUNE.aether]);
  });

  const coverage = YAMA_PRESETS.flatMap((entry) =>
    Object.entries(YAMA_SPELL_RUNES).map(([spell, runeIds]) => ({ ...entry, spell, runeIds })),
  );

  it.each(coverage)('$encounter/$key holds the runes for $spell', ({ preset, runeIds }) => {
    const ctx = runeContext(preset);
    for (const runeId of runeIds) {
      expect(hasRune(runeId, ctx)).toBe(true);
    }
  });

  // Dark Demonbane is the only one of the three the engine can actually resolve a cast
  // for, so it is the one that can be checked end-to-end through the cast planner.
  it.each(YAMA_PRESETS)('$encounter/$key can cast Dark Demonbane', ({ preset }) => {
    expect(canCastSpell('Dark Demonbane', { ...runeContext(preset), magicLevel: 99 })).toBe(true);
  });
});

describe('Sol Heredit rune pouches', () => {
  const sol = EQUIPMENT_PRESETS.sol_heredit;
  const pouchIds = (key: string) => (sol[key].supplies?.runePouch?.slots ?? []).map((slot) => slot?.id ?? null);

  it.each(['max', 'mid', 'budget'])('%s carries the Yama Arceuus divine pouch', (key) => {
    expect(sol[key].supplies?.runePouch?.kind).toBe('divine');
    expect(pouchIds(key)).toEqual([RUNE.death, RUNE.fire, RUNE.blood, COMBINATION_RUNE.aether]);
    const ctx = runeContext(sol[key]);
    for (const runeIds of Object.values(YAMA_SPELL_RUNES)) {
      for (const runeId of runeIds) expect(hasRune(runeId, ctx)).toBe(true);
    }
  });

  it('ironman carries plain Death Charge runes, without aether', () => {
    expect(sol.ironman.supplies?.runePouch?.kind).toBe('standard');
    expect(pouchIds('ironman')).toEqual([RUNE.blood, RUNE.soul, RUNE.death]);
  });
});

describe('Zuk rune pouches', () => {
  it('stocks the Atlatl / RCB set for its selected Ice Burst', () => {
    const preset = EQUIPMENT_PRESETS.zuk.atlatl_eclipse;

    expect(preset.supplies?.selectedSpell).toBe('Ice Burst');
    expect(canCastSpell('Ice Burst', { ...runeContext(preset), magicLevel: 99 })).toBe(true);
  });
});
