import { describe, expect, it } from 'vitest';
import { EQUIPMENT_COMBAT_FAMILIES } from '../../../data/equipmentCombatFamilies';
import { getAutocastableSpells, isAutocastableSpell } from '../../../data/spellCatalog';
import {
  COMBINATION_RUNE,
  DEATH_CHARGE_SPELL,
  getSpellLevelRequirement,
  getSpellRuneRequirement,
  MARK_OF_DARKNESS_SPELL,
  RUNE,
  SPELL_RUNE_REQUIREMENTS,
} from '../../../data/spellRunes';
import type { RunePouch } from '../../../types/encounterLoadout';
import type { Inventory } from '../../../types/inventory';
import { createEmptyInventory } from '../../../types/inventory';
import { canCastSpell, checkSpellCast, hasRune, meetsSpellLevel, type SpellCastContext } from '../runeAvailability';

const FIRE_BATTLESTAFF = 1393;
const LAVA_BATTLESTAFF = 3053;
const KODAI_WAND = 21006;
const TOME_OF_FIRE_CHARGED = 20714;
const TOME_OF_FIRE_EMPTY = 20716;

function inventoryOf(...items: Array<{ id: number; quantity?: number }>): Inventory {
  const inventory = createEmptyInventory();
  items.forEach((item, index) => {
    inventory[index] = item;
  });
  return inventory;
}

function standardPouch(...items: Array<{ id: number } | null>): RunePouch {
  return { kind: 'standard', slots: [items[0] ?? null, items[1] ?? null, items[2] ?? null] };
}

function ctx(overrides: Partial<SpellCastContext> = {}): SpellCastContext {
  return { equipment: {}, inventory: createEmptyInventory(), runePouch: null, ...overrides };
}

describe('hasRune', () => {
  it.each(EQUIPMENT_COMBAT_FAMILIES)('inherits unlimited rune sources for family $baseId', ({ baseId, variantIds }) => {
    for (const runeId of [RUNE.fire, RUNE.water, RUNE.air, RUNE.earth]) {
      const expected = hasRune(runeId, ctx({ equipment: { weapon: baseId } }));
      for (const variantId of variantIds) {
        expect(hasRune(runeId, ctx({ equipment: { weapon: variantId } }))).toBe(expected);
      }
    }
  });

  it('finds a rune held in the inventory', () => {
    expect(hasRune(RUNE.death, ctx({ inventory: inventoryOf({ id: RUNE.death }) }))).toBe(true);
  });

  it('ignores how many the player carries - runes never deplete', () => {
    const one = ctx({ inventory: inventoryOf({ id: RUNE.death, quantity: 1 }) });
    const many = ctx({ inventory: inventoryOf({ id: RUNE.death, quantity: 10_000 }) });

    expect(hasRune(RUNE.death, one)).toBe(true);
    expect(hasRune(RUNE.death, many)).toBe(true);
  });

  it('reports a rune the player does not carry as missing', () => {
    expect(hasRune(RUNE.death, ctx({ inventory: inventoryOf({ id: RUNE.blood }) }))).toBe(false);
  });

  it('finds a rune stored in the rune pouch', () => {
    const context = ctx({ runePouch: standardPouch({ id: RUNE.blood }) });
    expect(hasRune(RUNE.blood, context)).toBe(true);
  });

  it('accepts combination runes for either component element', () => {
    const context = ctx({ inventory: inventoryOf({ id: COMBINATION_RUNE.lava }) });
    expect(hasRune(RUNE.earth, context)).toBe(true);
    expect(hasRune(RUNE.fire, context)).toBe(true);
    // Lava is earth + fire, so it must not satisfy an unrelated element.
    expect(hasRune(RUNE.water, context)).toBe(false);
  });

  it('supplies an element from a matching elemental staff but not another', () => {
    expect(hasRune(RUNE.fire, ctx({ equipment: { weapon: FIRE_BATTLESTAFF } }))).toBe(true);
    expect(hasRune(RUNE.water, ctx({ equipment: { weapon: FIRE_BATTLESTAFF } }))).toBe(false);
  });

  it('supplies both elements from a combination staff', () => {
    const context = ctx({ equipment: { weapon: LAVA_BATTLESTAFF } });
    expect(hasRune(RUNE.earth, context)).toBe(true);
    expect(hasRune(RUNE.fire, context)).toBe(true);
  });

  it('supplies water from the Kodai wand', () => {
    expect(hasRune(RUNE.water, ctx({ equipment: { weapon: KODAI_WAND } }))).toBe(true);
  });

  it('supplies runes from a charged tome in the shield slot but not an empty one', () => {
    expect(hasRune(RUNE.fire, ctx({ equipment: { shield: TOME_OF_FIRE_CHARGED } }))).toBe(true);
    expect(hasRune(RUNE.fire, ctx({ equipment: { shield: TOME_OF_FIRE_EMPTY } }))).toBe(false);
  });
});

describe('checkSpellCast', () => {
  // Ice Barrage needs water, blood and death.
  const iceBarrageCtx = (overrides: Partial<SpellCastContext> = {}) =>
    ctx({
      inventory: inventoryOf({ id: RUNE.water }, { id: RUNE.blood }, { id: RUNE.death }),
      ...overrides,
    });

  it('allows a cast when every required rune type is carried', () => {
    expect(checkSpellCast('Ice Barrage', iceBarrageCtx())).toEqual({ ok: true });
  });

  it('allows a cast from a single rune of each type - counts do not gate casting', () => {
    // One water, one blood and one death rune, against a spell that costs 6/2/4 in OSRS.
    const context = iceBarrageCtx({
      inventory: inventoryOf(
        { id: RUNE.water, quantity: 1 },
        { id: RUNE.blood, quantity: 1 },
        { id: RUNE.death, quantity: 1 },
      ),
    });

    expect(checkSpellCast('Ice Barrage', context)).toEqual({ ok: true });
  });

  it('refuses a cast when one rune type is absent', () => {
    const plan = checkSpellCast(
      'Ice Barrage',
      iceBarrageCtx({ inventory: inventoryOf({ id: RUNE.water }, { id: RUNE.death }) }),
    );
    expect(plan).toEqual({ ok: false, reason: 'missing-runes' });
  });

  it('reports an unknown spell separately from a missing rune', () => {
    expect(checkSpellCast('Not A Spell', iceBarrageCtx())).toEqual({ ok: false, reason: 'unknown-spell' });
  });

  it('needs no carried rune for an element the equipped staff supplies', () => {
    const plan = checkSpellCast(
      'Ice Barrage',
      iceBarrageCtx({
        equipment: { weapon: KODAI_WAND },
        inventory: inventoryOf({ id: RUNE.blood }, { id: RUNE.death }),
      }),
    );
    expect(plan).toEqual({ ok: true });
  });

  it('accepts one smoke rune for simultaneous air and fire requirements', () => {
    const plan = checkSpellCast(
      'Smoke Barrage',
      ctx({
        inventory: inventoryOf({ id: COMBINATION_RUNE.smoke }, { id: RUNE.blood }, { id: RUNE.death }),
      }),
    );
    expect(plan).toEqual({ ok: true });
  });

  it('accepts one aether rune for simultaneous cosmic and soul requirements', () => {
    const context = ctx({ inventory: inventoryOf({ id: COMBINATION_RUNE.aether }) });
    expect(hasRune(RUNE.cosmic, context)).toBe(true);
    expect(hasRune(RUNE.soul, context)).toBe(true);
  });

  it('reads the rune pouch as well as the inventory', () => {
    // Blood Blitz needs blood and death; both live in the pouch.
    const plan = checkSpellCast(
      'Blood Blitz',
      ctx({ runePouch: standardPouch({ id: RUNE.death }, { id: RUNE.blood }) }),
    );
    expect(plan).toEqual({ ok: true });
  });
});

describe('rune requirement coverage', () => {
  it('has a rune requirement for every autocastable spell of the books we ship', () => {
    for (const spellbook of ['ancient', 'arceuus'] as const) {
      for (const spell of getAutocastableSpells(spellbook)) {
        expect(getSpellRuneRequirement(spell.name), `missing rune requirement for ${spell.name}`).not.toBeNull();
      }
    }
  });

  it('has a Magic level requirement for every autocastable spell of those books', () => {
    for (const spellbook of ['ancient', 'arceuus'] as const) {
      for (const spell of getAutocastableSpells(spellbook)) {
        expect(getSpellLevelRequirement(spell.name), `missing level for ${spell.name}`).not.toBeNull();
      }
    }
  });

  // Bounds the table to spells the simulator can actually resolve, so a typo'd or aspirational
  // entry cannot sit here looking authoritative. Self-casts are the deliberate exception: the
  // engine resolves them on the player rather than through the autocast catalog, and they are
  // gated on this table just the same.
  it('only lists spells the simulator can cast', () => {
    const selfCast: readonly string[] = [MARK_OF_DARKNESS_SPELL, DEATH_CHARGE_SPELL];
    for (const spellName of Object.keys(SPELL_RUNE_REQUIREMENTS)) {
      if (selfCast.includes(spellName)) continue;
      expect(isAutocastableSpell(spellName), `${spellName} is not an autocastable spell`).toBe(true);
    }
  });

  it('records rune types only - no counts', () => {
    for (const runeIds of Object.values(SPELL_RUNE_REQUIREMENTS)) {
      for (const runeId of runeIds) {
        expect(typeof runeId).toBe('number');
      }
      expect(new Set(runeIds).size, 'a rune type is listed twice').toBe(runeIds.length);
    }
  });

  it('gates the spellbook on runes', () => {
    const rich = ctx({ inventory: inventoryOf({ id: RUNE.water }, { id: RUNE.blood }, { id: RUNE.death }) });
    expect(canCastSpell('Ice Barrage', rich)).toBe(true);
    expect(canCastSpell('Ice Barrage', ctx())).toBe(false);
  });

  it('gates on the Magic level before the runes', () => {
    const stocked = { inventory: inventoryOf({ id: RUNE.water }, { id: RUNE.blood }, { id: RUNE.death }) };
    // Ice Barrage needs 94 Magic.
    expect(checkSpellCast('Ice Barrage', ctx({ ...stocked, magicLevel: 93 }))).toEqual({
      ok: false,
      reason: 'missing-level',
    });
    expect(canCastSpell('Ice Barrage', ctx({ ...stocked, magicLevel: 94 }))).toBe(true);
  });

  it('lets a boosted Magic level cast above the base level', () => {
    const stocked = ctx({
      inventory: inventoryOf({ id: RUNE.water }, { id: RUNE.blood }, { id: RUNE.death }),
      // A 92 base boosted to 96 by a Magic potion still clears Ice Barrage's 94.
      magicLevel: 96,
    });
    expect(canCastSpell('Ice Barrage', stocked)).toBe(true);
  });

  it('reports a level shortfall even when the runes are also missing', () => {
    expect(checkSpellCast('Ice Barrage', ctx({ magicLevel: 1 }))).toEqual({ ok: false, reason: 'missing-level' });
  });

  it('skips the level check when no level is supplied', () => {
    expect(meetsSpellLevel('Ice Barrage', undefined)).toBe(true);
  });

  it('does not level-gate a spell with no requirement recorded', () => {
    // Unknown spells are rejected earlier by `resolveAttackResources`, which fails
    // closed; `meetsSpellLevel` itself stays permissive for names it has no data for.
    expect(meetsSpellLevel('Not A Real Spell', 1)).toBe(true);
  });
});
