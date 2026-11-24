import { describe, expect, it } from 'vitest';
import type { SpellCastContext } from '../../../core/combat/runeAvailability';
import { RUNE } from '../../../data/spellRunes';
import { createEmptyInventory } from '../../../types/inventory';
import type { SpellCategory, SpellFilterOptions } from '../../../types/panelFilters';
import { SPELL_FILTER_DEFAULTS } from '../../../types/panelFilters';
import {
  ANCIENT_GRID,
  ARCEUUS_GRID,
  calculateSpellbookLayout,
  filterSpellGrid,
  isSpellSimulated,
  sortSpellGrid,
} from '../spellbookFilterUtils';

const allShown: SpellFilterOptions = SPELL_FILTER_DEFAULTS;

describe('sortSpellGrid', () => {
  it('returns original array when order is null', () => {
    const result = sortSpellGrid(null, ARCEUUS_GRID);
    expect(result).toBe(ARCEUUS_GRID);
  });

  it('sorts according to custom order', () => {
    const grid = ARCEUUS_GRID.slice(0, 6);
    const result = sortSpellGrid(['basic_reanimation', 'battlefront_teleport'], grid);
    expect(result.map((slot) => slot.icon)).toEqual([
      'basic_reanimation',
      'battlefront_teleport',
      'home_teleport',
      'minigame_teleport',
      'arceuus_library_teleport',
      'draynor_manor_teleport',
    ]);
  });
});

describe('filterSpellGrid', () => {
  const allCategories = new Set<SpellCategory>(['combat', 'teleport', 'utility']);

  it('returns everything in reorder mode', () => {
    const result = filterSpellGrid(
      ARCEUUS_GRID,
      new Set(['ghostly_grasp', 'barrows_teleport']),
      new Set<SpellCategory>(['combat']),
      allShown,
      true,
      true,
    );
    expect(result).toBe(ARCEUUS_GRID);
    expect(result).toHaveLength(ARCEUUS_GRID.length);
  });

  it('hides icons in hidden set', () => {
    const result = filterSpellGrid(
      ARCEUUS_GRID,
      new Set(['ghostly_grasp', 'barrows_teleport']),
      allCategories,
      allShown,
      false,
      false,
    );
    expect(result.some((slot) => slot.icon === 'ghostly_grasp')).toBe(false);
    expect(result.some((slot) => slot.icon === 'barrows_teleport')).toBe(false);
  });

  it('does not apply category filters when filtering is disabled', () => {
    const result = filterSpellGrid(ARCEUUS_GRID, new Set(), new Set<SpellCategory>(['combat']), allShown, false, false);
    expect(result).toHaveLength(ARCEUUS_GRID.length);
  });

  it('applies category filters when filtering is enabled', () => {
    const result = filterSpellGrid(ARCEUUS_GRID, new Set(), new Set<SpellCategory>(['utility']), allShown, true, false);
    expect(result.every((slot) => slot.category === 'utility')).toBe(true);
    expect(result).toHaveLength(ARCEUUS_GRID.filter((s) => s.category === 'utility').length);
  });

  it('returns only combat spells when only combat is active', () => {
    const result = filterSpellGrid(ARCEUUS_GRID, new Set(), new Set<SpellCategory>(['combat']), allShown, true, false);
    const expectedCombat = ARCEUUS_GRID.filter((s) => s.category === 'combat');
    expect(result).toHaveLength(expectedCombat.length);
    expect(result.every((slot) => slot.category === 'combat')).toBe(true);
    expect(result.map((slot) => slot.icon)).toContain('ghostly_grasp');
    expect(result.map((slot) => slot.icon)).toContain('greater_corruption');
  });

  it('supports multiple active categories', () => {
    const result = filterSpellGrid(
      ARCEUUS_GRID,
      new Set(),
      new Set<SpellCategory>(['combat', 'teleport']),
      allShown,
      true,
      false,
    );
    const expected = ARCEUUS_GRID.filter((s) => s.category === 'combat' || s.category === 'teleport');
    expect(result).toHaveLength(expected.length);
    expect(result.every((slot) => slot.category === 'combat' || slot.category === 'teleport')).toBe(true);
  });

  it('returns nothing with empty category set when filtering is enabled', () => {
    const result = filterSpellGrid(ARCEUUS_GRID, new Set(), new Set<SpellCategory>(), allShown, true, false);
    expect(result).toHaveLength(0);
  });

  it('hides spells above both the base and the boosted Magic level when showLackLevel is off', () => {
    const options: SpellFilterOptions = { ...allShown, showLackLevel: false };
    const runeContext = { magicLevel: 62 } as SpellCastContext;
    const result = filterSpellGrid(ARCEUUS_GRID, new Set(), allCategories, options, true, false, {
      baseMagicLevel: 60,
      runeContext,
    });
    const kept = new Set(result.map((slot) => slot.icon));
    // Ghostly Grasp is 35 Magic, Undead Grasp 79.
    expect(kept.has('ghostly_grasp')).toBe(true);
    expect(kept.has('undead_grasp')).toBe(false);
  });

  it('passes a spell the boost reaches even when the base level does not', () => {
    const options: SpellFilterOptions = { ...allShown, showLackLevel: false };
    const boosted = filterSpellGrid(ARCEUUS_GRID, new Set(), allCategories, options, true, false, {
      baseMagicLevel: 70,
      runeContext: { magicLevel: 82 } as SpellCastContext,
    });
    const drained = filterSpellGrid(ARCEUUS_GRID, new Set(), allCategories, options, true, false, {
      baseMagicLevel: 82,
      runeContext: { magicLevel: 70 } as SpellCastContext,
    });
    // Undead Grasp is 79 Magic: reachable by the boost in one and by the base in the other.
    expect(boosted.map((slot) => slot.icon)).toContain('undead_grasp');
    expect(drained.map((slot) => slot.icon)).toContain('undead_grasp');
  });

  it('leaves the level row inert without stats to judge against', () => {
    const options: SpellFilterOptions = { ...allShown, showLackLevel: false };
    const result = filterSpellGrid(ARCEUUS_GRID, new Set(), allCategories, options, true, false);
    expect(result).toHaveLength(ARCEUUS_GRID.length);
  });

  it('classifies every authored Arceuus spell for the level filter', () => {
    const options: SpellFilterOptions = { ...allShown, showLackLevel: false };
    const result = filterSpellGrid(ARCEUUS_GRID, new Set(), allCategories, options, true, false, {
      baseMagicLevel: 1,
      runeContext: { equipment: {}, inventory: createEmptyInventory(), runePouch: null, magicLevel: 1 },
    });
    expect(result.map((slot) => slot.icon)).toEqual(['home_teleport', 'minigame_teleport']);
  });

  it('classifies every authored spell for the rune filter', () => {
    const options: SpellFilterOptions = { ...allShown, showLackRunes: false };
    const emptyRunes: SpellCastContext = {
      equipment: {},
      inventory: createEmptyInventory(),
      runePouch: null,
      magicLevel: 99,
    };
    const arceuus = filterSpellGrid(ARCEUUS_GRID, new Set(), allCategories, options, true, false, {
      baseMagicLevel: 99,
      runeContext: emptyRunes,
    });
    const ancient = filterSpellGrid(ANCIENT_GRID, new Set(), allCategories, options, true, false, {
      baseMagicLevel: 99,
      runeContext: emptyRunes,
    });
    expect(arceuus.map((slot) => slot.icon)).toEqual(['home_teleport', 'minigame_teleport']);
    expect(ancient.map((slot) => slot.icon)).toEqual(['home_teleport', 'minigame_teleport']);
  });

  it('leaves the requirements row inert while no spell is gated', () => {
    const options: SpellFilterOptions = { ...allShown, showLackRequirements: false };
    const result = filterSpellGrid(ARCEUUS_GRID, new Set(), allCategories, options, true, false);
    expect(result).toHaveLength(ARCEUUS_GRID.length);
  });

  it('keeps only spells the engine can resolve when showUnsimulated is off', () => {
    const options: SpellFilterOptions = { ...allShown, showUnsimulated: false };
    const result = filterSpellGrid(ARCEUUS_GRID, new Set(), allCategories, options, true, false);
    expect(result.every((slot) => isSpellSimulated(slot))).toBe(true);
    expect(result.map((slot) => slot.icon)).toEqual(expect.arrayContaining(['home_teleport', 'death_charge']));
    expect(result.map((slot) => slot.icon)).not.toContain('degrime');
    expect(result.length).toBeLessThan(ARCEUUS_GRID.length);
  });

  it('leaves the coverage row independent of level and rune state', () => {
    const options: SpellFilterOptions = { ...allShown, showUnsimulated: false };
    const starved = filterSpellGrid(ARCEUUS_GRID, new Set(), allCategories, options, true, false, {
      baseMagicLevel: 1,
      runeContext: { equipment: {}, inventory: createEmptyInventory(), runePouch: null, magicLevel: 1 },
    });
    const maxed = filterSpellGrid(ARCEUUS_GRID, new Set(), allCategories, options, true, false);
    expect(starved.map((slot) => slot.icon)).toEqual(maxed.map((slot) => slot.icon));
  });
});

describe('ANCIENT_GRID', () => {
  // The live Ancient book opens with Edgeville Home Teleport; omitting it shifted
  // every later spell one slot early (https://oldschool.runescape.wiki/w/Ancient_Magicks).
  it('opens with Edgeville Home Teleport, force-enabled like the other books home teleport', () => {
    expect(ANCIENT_GRID[0]).toMatchObject({
      icon: 'home_teleport',
      label: 'Edgeville Home Teleport',
      category: 'teleport',
      level: 1,
      supported: true,
    });
    expect(ANCIENT_GRID).toHaveLength(27);
  });

  it('matches all 27 slots in the Wiki spell summary and reference grid', () => {
    // https://oldschool.runescape.wiki/w/Ancient_Magicks#Spell_summary
    expect(ANCIENT_GRID.map((slot) => slot.icon)).toEqual([
      'home_teleport',
      'minigame_teleport',
      'smoke_rush',
      'shadow_rush',
      'paddewwa_teleport',
      'blood_rush',
      'ice_rush',
      'senntisten_teleport',
      'smoke_burst',
      'shadow_burst',
      'kharyrll_teleport',
      'blood_burst',
      'ice_burst',
      'lassar_teleport',
      'smoke_blitz',
      'shadow_blitz',
      'dareeyak_teleport',
      'blood_blitz',
      'ice_blitz',
      'carrallangar_teleport',
      'teleport_to_target',
      'smoke_barrage',
      'shadow_barrage',
      'annakarl_teleport',
      'blood_barrage',
      'ice_barrage',
      'ghorrock_teleport',
    ]);
    const levels = ANCIENT_GRID.map((slot) => slot.level);
    expect(levels).toEqual([...levels].sort((a, b) => a - b));
  });

  it('keeps both added teleports visible by default without making them castable', () => {
    const result = filterSpellGrid(
      ANCIENT_GRID,
      new Set(),
      new Set<SpellCategory>(['combat', 'teleport', 'utility']),
      SPELL_FILTER_DEFAULTS,
      true,
      false,
    );
    const minigame = result.find((slot) => slot.icon === 'minigame_teleport');
    const target = result.find((slot) => slot.icon === 'teleport_to_target');

    expect(minigame).toMatchObject({ label: 'Minigame Teleport', category: 'teleport', level: 1, runeTypes: [] });
    expect(target).toMatchObject({
      label: 'Teleport to Target',
      category: 'teleport',
      level: 85,
      runeTypes: [RUNE.law, RUNE.chaos, RUNE.death],
    });
    if (!minigame || !target) throw new Error('Missing teleport slots');
    expect(isSpellSimulated(minigame)).toBe(false);
    expect(isSpellSimulated(target)).toBe(false);
  });
});

describe('calculateSpellbookLayout', () => {
  // Classic layout: each book's authored grid and offsets.
  it('lays arceuus out on its authored 6-column grid when filtering is off', () => {
    expect(calculateSpellbookLayout(false, ARCEUUS_GRID.length, 'arceuus')).toEqual({
      slotSize: 24,
      startX: 7,
      startY: 7,
      gapX: 9,
      gapY: 7,
      cols: 6,
    });
  });

  it('lays ancients out on its authored 4-column grid when filtering is off', () => {
    expect(calculateSpellbookLayout(false, ANCIENT_GRID.length, 'ancient')).toEqual({
      slotSize: 24,
      startX: 26,
      startY: 15,
      gapX: 20,
      gapY: 4,
      cols: 4,
    });
  });

  it('lays standard and lunar out on their authored grids', () => {
    expect(calculateSpellbookLayout(false, 70, 'standard')).toEqual({
      slotSize: 24,
      startX: 19,
      startY: 22,
      gapX: 0,
      gapY: 0,
      cols: 7,
    });
    expect(calculateSpellbookLayout(false, 48, 'lunar')).toEqual({
      slotSize: 24,
      startX: 15,
      startY: 15,
      gapX: 6,
      gapY: 5,
      cols: 6,
    });
  });

  it('never reflows the classic grid as spells are hidden', () => {
    expect(calculateSpellbookLayout(false, 3, 'arceuus')).toEqual(calculateSpellbookLayout(false, 44, 'arceuus'));
  });

  // Filtering layout, inside the 184x240 box the filter button leaves behind.
  it('uses 3 columns at 40px for count <= 15', () => {
    expect(calculateSpellbookLayout(true, 15, 'arceuus')).toEqual({
      slotSize: 40,
      startX: 14,
      startY: 7,
      gapX: 28,
      gapY: 10,
      cols: 3,
    });
  });

  it('uses 4 columns at 40px for count 16-20', () => {
    expect(calculateSpellbookLayout(true, 16, 'arceuus')).toEqual({
      slotSize: 40,
      startX: 10,
      startY: 35,
      gapX: 8,
      gapY: 8,
      cols: 4,
    });
  });

  it('uses 24px slots and clamped columns for count >= 21', () => {
    expect(calculateSpellbookLayout(true, 44, 'arceuus')).toEqual({
      slotSize: 24,
      startX: 10,
      startY: 7,
      gapX: 16,
      gapY: 3,
      cols: 5,
    });
    expect(calculateSpellbookLayout(true, 21, 'arceuus').cols).toBe(4);
    expect(calculateSpellbookLayout(true, 63, 'arceuus').cols).toBe(7);
  });

  it('caps the horizontal gap at scale(5, 7, slotSize) and the vertical gap at the horizontal one', () => {
    for (const count of [1, 15, 16, 20, 21, 44, 70]) {
      const layout = calculateSpellbookLayout(true, count, 'arceuus');
      expect(layout.gapX).toBeLessThanOrEqual(Math.trunc((5 * layout.slotSize) / 7));
      expect(layout.gapY).toBeLessThanOrEqual(layout.gapX);
    }
  });

  it('centers the filtered grid inside the 184x240 content box', () => {
    for (const count of [1, 15, 16, 20, 21, 44, 70]) {
      const layout = calculateSpellbookLayout(true, count, 'arceuus');
      const rows = Math.max(1, Math.ceil(count / layout.cols));
      const gridWidth = layout.cols * layout.slotSize + (layout.cols - 1) * layout.gapX;
      const gridHeight = rows * layout.slotSize + (rows - 1) * layout.gapY;
      expect(gridWidth).toBeLessThanOrEqual(184);
      expect(gridHeight).toBeLessThanOrEqual(240);
      expect(layout.startX).toBe(10 + Math.trunc((184 - gridWidth) / 2));
      expect(layout.startY).toBe(7 + Math.trunc((240 - gridHeight) / 2));
    }
  });

  // Blocked resizing.
  it('holds 24px slots in four columns when icon resizing is off', () => {
    for (const count of [1, 15, 16, 20, 28]) {
      const layout = calculateSpellbookLayout(true, count, 'arceuus', false);
      expect(layout.slotSize).toBe(24);
      expect(layout.cols).toBe(4);
    }
    expect(calculateSpellbookLayout(true, 44, 'arceuus', false).cols).toBe(5);
  });

  it('pins a short blocked-resizing grid to the top rather than centering it', () => {
    // The layer is floored at contentH - 30, so its top sits 15 below the content box's.
    expect(calculateSpellbookLayout(true, 4, 'arceuus', false).startY).toBe(7 + 15);
  });

  it('caps the blocked-resizing horizontal gap at the slot size', () => {
    for (const count of [1, 15, 21, 44, 70]) {
      const layout = calculateSpellbookLayout(true, count, 'arceuus', false);
      expect(layout.gapX).toBeLessThanOrEqual(layout.slotSize);
      expect(layout.gapY).toBeLessThanOrEqual(layout.gapX);
    }
  });
});
