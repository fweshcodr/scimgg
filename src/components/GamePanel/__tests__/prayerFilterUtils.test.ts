import { describe, expect, it } from 'vitest';
import type { PrayerFilterOptions } from '../../../types/panelFilters';
import { PRAYER_FILTER_DEFAULTS } from '../../../types/panelFilters';
import { PrayerType } from '../../../types/simulation';
import {
  filterPrayerGrid,
  isPrayerAvailable,
  PRAYER_GRID,
  PRAYER_SLOT_ICON_NAMES,
  type PrayerAvailability,
  type PrayerSlot,
  type PrayerTierGroup,
  passesPrayerFilter,
  type ResolvedPrayerSlot,
  resolvePrayerSlots,
  resolveQuickPrayerSelections,
  sortPrayerGrid,
} from '../prayerFilterUtils';

const allShown: PrayerFilterOptions = PRAYER_FILTER_DEFAULTS;

/** Maxed, so no tier successor is ever suppressed by an unmet requirement. */
const MAXED: PrayerAvailability = {
  basePrayerLevel: 99,
  baseDefenceLevel: 99,
  baseAttackLevel: 99,
  baseStrengthLevel: 99,
};

const icons = (grid: readonly { icon: string }[]) => grid.map((slot) => slot.icon);

describe('sortPrayerGrid', () => {
  it('returns original array when order is null', () => {
    const result = sortPrayerGrid(null, PRAYER_GRID);
    expect(result).toBe(PRAYER_GRID);
  });

  it('sorts according to custom order', () => {
    const grid = PRAYER_GRID.slice(0, 5);
    const result = sortPrayerGrid(['clarity_of_thought', 'thick_skin'], grid);
    expect(result.map((slot) => slot.icon)).toEqual([
      'clarity_of_thought',
      'thick_skin',
      'burst_of_strength',
      'sharp_eye',
      'mystic_will',
    ]);
  });

  it('keeps unranked items at the end in original order', () => {
    const grid = PRAYER_GRID.slice(0, 6);
    const result = sortPrayerGrid(['rock_skin', 'thick_skin'], grid);
    expect(result.map((slot) => slot.icon)).toEqual([
      'rock_skin',
      'thick_skin',
      'burst_of_strength',
      'clarity_of_thought',
      'sharp_eye',
      'mystic_will',
    ]);
  });
});

describe('filterPrayerGrid', () => {
  it('returns everything in reorder mode', () => {
    const hiddenSet = new Set(['thick_skin', 'rapid_heal']);
    const options: PrayerFilterOptions = {
      ...allShown,
      showLowerTiers: false,
      showTieredOverMultiskill: false,
      showRapidHealing: false,
    };
    const result = filterPrayerGrid(PRAYER_GRID, hiddenSet, options, true, true, MAXED);
    expect(result).toBe(PRAYER_GRID);
  });

  it('hides icons in hidden set', () => {
    const hiddenSet = new Set(['protect_item', 'thick_skin']);
    const result = filterPrayerGrid(PRAYER_GRID, hiddenSet, allShown, true, false, MAXED);
    expect(icons(result)).not.toContain('protect_item');
    expect(icons(result)).not.toContain('thick_skin');
  });

  it('does not apply the filter rows when filtering is disabled', () => {
    const options: PrayerFilterOptions = {
      ...allShown,
      showLowerTiers: false,
      showTieredOverMultiskill: false,
      showRapidHealing: false,
    };
    const result = filterPrayerGrid(PRAYER_GRID, new Set(), options, false, false, MAXED);
    expect(icons(result)).toEqual(icons(PRAYER_GRID));
  });

  it('leaves the grid untouched with every row checked', () => {
    const result = filterPrayerGrid(PRAYER_GRID, new Set(), allShown, true, false, MAXED);
    expect(icons(result)).toEqual(icons(PRAYER_GRID));
  });

  describe('lower tiers', () => {
    const hideLowerTiers: PrayerFilterOptions = { ...allShown, showLowerTiers: false };

    it('drops a prayer whose next tier on the same ladder is available', () => {
      const result = icons(filterPrayerGrid(PRAYER_GRID, new Set(), hideLowerTiers, true, false, MAXED));
      expect(result).not.toContain('thick_skin');
      expect(result).not.toContain('rock_skin');
      expect(result).not.toContain('mystic_will');
      expect(result).not.toContain('mystic_lore');
    });

    it('keeps the top of a single-skill ladder, whose successor is multi-skill', () => {
      const result = icons(filterPrayerGrid(PRAYER_GRID, new Set(), hideLowerTiers, true, false, MAXED));
      expect(result).toContain('steel_skin');
      expect(result).toContain('ultimate_strength');
      expect(result).toContain('incredible_reflexes');
      expect(result).toContain('eagle_eye');
      expect(result).toContain('mystic_might');
    });

    it('drops Chivalry, whose successor Piety shares its ladder', () => {
      const result = icons(filterPrayerGrid(PRAYER_GRID, new Set(), hideLowerTiers, true, false, MAXED));
      expect(result).not.toContain('chivalry');
      expect(result).toContain('piety');
    });

    it('keeps a prayer whose successor the account cannot yet use', () => {
      const under70 = { basePrayerLevel: 60, baseDefenceLevel: 99, baseAttackLevel: 99, baseStrengthLevel: 99 };
      const result = icons(filterPrayerGrid(PRAYER_GRID, new Set(), hideLowerTiers, true, false, under70));
      expect(result).toContain('chivalry');
    });

    it('reads the successor requirement, not just its level', () => {
      const lowDefence = { basePrayerLevel: 99, baseDefenceLevel: 60, baseAttackLevel: 99, baseStrengthLevel: 99 };
      const result = icons(filterPrayerGrid(PRAYER_GRID, new Set(), hideLowerTiers, true, false, lowDefence));
      // Chivalry needs 65 Defence and Piety 70, so neither can suppress Steel Skin.
      expect(result).toContain('steel_skin');
      expect(result).toContain('ultimate_strength');
    });
  });

  it('lets a multi-skill successor suppress a tier only when showTieredOverMultiskill is off', () => {
    const options: PrayerFilterOptions = {
      ...allShown,
      showLowerTiers: false,
      showTieredOverMultiskill: false,
    };
    const result = icons(filterPrayerGrid(PRAYER_GRID, new Set(), options, true, false, MAXED));
    expect(result).not.toContain('steel_skin');
    expect(result).not.toContain('eagle_eye');
    expect(result).not.toContain('mystic_might');
    expect(result).toEqual(expect.arrayContaining(['protect_from_melee', 'preserve', 'piety', 'rigour', 'augury']));
  });

  it('ignores showTieredOverMultiskill while lower tiers are shown', () => {
    const options: PrayerFilterOptions = { ...allShown, showTieredOverMultiskill: false };
    const result = filterPrayerGrid(PRAYER_GRID, new Set(), options, true, false, MAXED);
    expect(icons(result)).toEqual(icons(PRAYER_GRID));
  });

  it('removes rapid healing prayers when showRapidHealing is false', () => {
    const result = icons(
      filterPrayerGrid(PRAYER_GRID, new Set(), { ...allShown, showRapidHealing: false }, true, false, MAXED),
    );
    expect(result).not.toContain('rapid_restore');
    expect(result).not.toContain('rapid_heal');
  });

  it('removes prayers above the base Prayer level when showLackLevel is false', () => {
    const options: PrayerFilterOptions = { ...allShown, showLackLevel: false };
    const availability = { basePrayerLevel: 43, baseDefenceLevel: 99, baseAttackLevel: 99, baseStrengthLevel: 99 };
    const result = icons(filterPrayerGrid(PRAYER_GRID, new Set(), options, true, false, availability));
    expect(result).toContain('protect_from_melee');
    expect(result).not.toContain('eagle_eye');
    expect(result).not.toContain('piety');
  });

  it('removes prayers behind an unmet Defence requirement when showLackRequirements is false', () => {
    const options: PrayerFilterOptions = { ...allShown, showLackRequirements: false };
    const availability = { basePrayerLevel: 99, baseDefenceLevel: 66, baseAttackLevel: 99, baseStrengthLevel: 99 };
    const result = icons(filterPrayerGrid(PRAYER_GRID, new Set(), options, true, false, availability));
    expect(result).toContain('chivalry');
    expect(result).not.toContain('piety');
    expect(result).not.toContain('rigour');
    expect(result).not.toContain('augury');
  });

  it('keeps a low-level prayer visible while its level row stays checked', () => {
    const availability = { basePrayerLevel: 1, baseDefenceLevel: 1, baseAttackLevel: 99, baseStrengthLevel: 99 };
    const result = filterPrayerGrid(PRAYER_GRID, new Set(), allShown, true, false, availability);
    expect(icons(result)).toEqual(icons(PRAYER_GRID));
  });
});

describe('resolvePrayerSlots', () => {
  const resolve = (basePrayerLevel: number, upgradedPrayers: boolean): ResolvedPrayerSlot[] =>
    resolvePrayerSlots(PRAYER_GRID, { ...MAXED, basePrayerLevel }, { upgradedPrayers });

  const slot = (grid: readonly ResolvedPrayerSlot[], icon: string): ResolvedPrayerSlot => {
    const found = grid.find((entry) => entry.icon === icon);
    if (found === undefined) throw new Error(`no slot keyed ${icon}`);
    return found;
  };

  it('leaves the base prayer in place one level below its replacement', () => {
    expect(slot(resolve(61, true), 'eagle_eye')).toMatchObject({
      prayer: PrayerType.EagleEye,
      label: 'Eagle Eye',
      displayIcon: 'eagle_eye',
    });
    expect(slot(resolve(62, true), 'mystic_might')).toMatchObject({
      prayer: PrayerType.MysticMight,
      label: 'Mystic Might',
      displayIcon: 'mystic_might',
    });
  });

  it('swaps the replacement in on the level that unlocks it', () => {
    expect(slot(resolve(62, true), 'eagle_eye')).toMatchObject({
      prayer: PrayerType.Deadeye,
      label: 'Deadeye',
      displayIcon: 'deadeye',
    });
    expect(slot(resolve(63, true), 'mystic_might')).toMatchObject({
      prayer: PrayerType.MysticVigour,
      label: 'Mystic Vigour',
      displayIcon: 'mystic_vigour',
    });
  });

  it('keeps the base prayers at max level while the account toggle is off', () => {
    const grid = resolve(99, false);
    expect(slot(grid, 'eagle_eye')).toMatchObject({ prayer: PrayerType.EagleEye, displayIcon: 'eagle_eye' });
    expect(slot(grid, 'mystic_might')).toMatchObject({ prayer: PrayerType.MysticMight, displayIcon: 'mystic_might' });
  });

  it.each([
    [83, true, PrayerType.Piety, 'piety'],
    [84, true, PrayerType.Zeal, 'zeal'],
    [99, false, PrayerType.Piety, 'piety'],
  ] as const)('resolves Piety at level %s with Zeal unlocked %s', (basePrayerLevel, zealPrayer, prayer, displayIcon) => {
    const grid = resolvePrayerSlots(PRAYER_GRID, { ...MAXED, basePrayerLevel }, { zealPrayer });
    expect(slot(grid, 'piety')).toMatchObject({
      icon: 'piety',
      basePrayer: PrayerType.Piety,
      prayer,
      displayIcon,
      label: prayer,
      available: true,
    });
    expect(icons(grid)).toEqual(icons(PRAYER_GRID));
  });

  it('defaults Zeal off independently of the older prayer upgrades', () => {
    expect(slot(resolve(99, true), 'piety').prayer).toBe(PrayerType.Piety);
  });

  it.each([false, true])('keeps Deadeye and Mystic Vigour independent of Zeal unlock %s', (zealPrayer) => {
    const availability = { basePrayerLevel: 99, baseDefenceLevel: 99, baseAttackLevel: 99, baseStrengthLevel: 99 };
    const upgraded = resolvePrayerSlots(PRAYER_GRID, availability, { upgradedPrayers: true, zealPrayer });
    expect(slot(upgraded, 'eagle_eye').prayer).toBe(PrayerType.Deadeye);
    expect(slot(upgraded, 'mystic_might').prayer).toBe(PrayerType.MysticVigour);
    const base = resolvePrayerSlots(PRAYER_GRID, availability, { upgradedPrayers: false, zealPrayer });
    expect(slot(base, 'eagle_eye').prayer).toBe(PrayerType.EagleEye);
    expect(slot(base, 'mystic_might').prayer).toBe(PrayerType.MysticMight);
    expect(slot(base, 'piety').prayer).toBe(zealPrayer ? PrayerType.Zeal : PrayerType.Piety);
  });

  it('makes Rapid Heal a usable prayer from level 22', () => {
    expect(slot(resolve(21, true), 'rapid_heal')).toMatchObject({ prayer: PrayerType.RapidHeal, available: false });
    expect(slot(resolve(22, true), 'rapid_heal')).toMatchObject({ prayer: PrayerType.RapidHeal, available: true });
  });

  it('makes Rapid Restore a usable prayer from level 19', () => {
    expect(slot(resolve(18, true), 'rapid_restore')).toMatchObject({
      prayer: PrayerType.RapidRestore,
      available: false,
    });
    expect(slot(resolve(19, true), 'rapid_restore')).toMatchObject({
      prayer: PrayerType.RapidRestore,
      available: true,
    });
  });

  it('marks prayers above the configured levels unavailable', () => {
    const grid = resolvePrayerSlots(
      PRAYER_GRID,
      { basePrayerLevel: 1, baseDefenceLevel: 1, baseAttackLevel: 99, baseStrengthLevel: 99 },
      { upgradedPrayers: false },
    );

    expect(slot(grid, 'thick_skin').available).toBe(true);
    expect(slot(grid, 'protect_from_magic').available).toBe(false);
    expect(slot(grid, 'piety').available).toBe(false);
  });

  it('treats missing availability as ungated and unset unlocks as their defaults', () => {
    const grid = resolvePrayerSlots(PRAYER_GRID);
    expect(slot(grid, 'eagle_eye').prayer).toBe(PrayerType.Deadeye);
    expect(slot(grid, 'mystic_might').prayer).toBe(PrayerType.MysticVigour);
    expect(slot(grid, 'piety').prayer).toBe(PrayerType.Piety);
  });

  it('keeps the persisted slot identity and ladder but uses the replacement level', () => {
    const upgraded = resolve(99, true);
    expect(icons(upgraded)).toEqual(icons(PRAYER_GRID));
    expect(slot(upgraded, 'eagle_eye')).toMatchObject({ level: 62, tierGroup: 'ranged', successor: 'rigour' });
    expect(slot(upgraded, 'mystic_might')).toMatchObject({ level: 63, tierGroup: 'magic', successor: 'augury' });
  });

  it('paints every other slot from its own icon', () => {
    const replaced = resolve(99, true).filter((entry) => entry.displayIcon !== entry.icon);
    expect(replaced.map((entry) => entry.icon)).toEqual(['eagle_eye', 'mystic_might']);
  });
});

describe('resolveQuickPrayerSelections', () => {
  it.each([
    [83, true, PrayerType.Piety],
    [84, true, PrayerType.Zeal],
    [99, false, PrayerType.Piety],
  ] as const)('resolves saved Piety at level %s with Zeal unlocked %s', (basePrayerLevel, zealPrayer, expected) => {
    expect(
      resolveQuickPrayerSelections(
        [PrayerType.Piety],
        { ...MAXED, basePrayerLevel },
        { upgradedPrayers: false, zealPrayer },
      ),
    ).toEqual([expected]);
  });

  it('canonicalizes saved Zeal and deduplicates it with Piety', () => {
    const availability = { basePrayerLevel: 99, baseDefenceLevel: 99, baseAttackLevel: 99, baseStrengthLevel: 99 };
    expect(
      resolveQuickPrayerSelections([PrayerType.Zeal, PrayerType.Piety], availability, { zealPrayer: true }),
    ).toEqual([PrayerType.Zeal]);
    expect(resolveQuickPrayerSelections([PrayerType.Zeal], availability, { zealPrayer: false })).toEqual([
      PrayerType.Piety,
    ]);
  });

  it('uses replacements for saved base prayers once their levels are reached', () => {
    const availability = { basePrayerLevel: 63, baseDefenceLevel: 99, baseAttackLevel: 99, baseStrengthLevel: 99 };

    expect(resolveQuickPrayerSelections([PrayerType.ProtectMagic, PrayerType.EagleEye], availability)).toEqual([
      PrayerType.ProtectMagic,
      PrayerType.Deadeye,
    ]);
    expect(resolveQuickPrayerSelections([PrayerType.MysticMight], availability)).toEqual([PrayerType.MysticVigour]);
  });

  it('retains saved base prayers below the replacement level or when upgrades are off', () => {
    expect(
      resolveQuickPrayerSelections(
        [PrayerType.EagleEye, PrayerType.MysticMight],
        { basePrayerLevel: 61, baseDefenceLevel: 99, baseAttackLevel: 99, baseStrengthLevel: 99 },
        { upgradedPrayers: true },
      ),
    ).toEqual([PrayerType.EagleEye, PrayerType.MysticMight]);
    expect(
      resolveQuickPrayerSelections(
        [PrayerType.EagleEye, PrayerType.MysticMight],
        { basePrayerLevel: 99, baseDefenceLevel: 99, baseAttackLevel: 99, baseStrengthLevel: 99 },
        { upgradedPrayers: false },
      ),
    ).toEqual([PrayerType.EagleEye, PrayerType.MysticMight]);
  });

  it('maps previously saved replacement names back to the available base prayer', () => {
    expect(
      resolveQuickPrayerSelections(
        [PrayerType.Deadeye, PrayerType.MysticVigour],
        { basePrayerLevel: 99, baseDefenceLevel: 99, baseAttackLevel: 99, baseStrengthLevel: 99 },
        { upgradedPrayers: false },
      ),
    ).toEqual([PrayerType.EagleEye, PrayerType.MysticMight]);
  });

  it('drops saved prayers the configured levels cannot activate', () => {
    expect(
      resolveQuickPrayerSelections(
        [PrayerType.ProtectMagic, PrayerType.EagleEye, PrayerType.MysticMight],
        { basePrayerLevel: 1, baseDefenceLevel: 1, baseAttackLevel: 99, baseStrengthLevel: 99 },
        { upgradedPrayers: false },
      ),
    ).toEqual([]);
  });
});

describe('effective Zeal requirements', () => {
  const zealLevels: PrayerAvailability = {
    basePrayerLevel: 84,
    baseDefenceLevel: 1,
    baseAttackLevel: 75,
    baseStrengthLevel: 75,
  };

  it.each([
    [75, 75, true],
    [74, 75, false],
    [75, 74, false],
  ] as const)('requires Attack %s / Strength %s independently of Defence', (baseAttackLevel, baseStrengthLevel, available) => {
    const availability = { ...zealLevels, baseAttackLevel, baseStrengthLevel };
    const grid = resolvePrayerSlots(PRAYER_GRID, availability, { zealPrayer: true });
    const zeal = grid.find((slot) => slot.icon === 'piety');
    expect(zeal).toMatchObject({
      prayer: PrayerType.Zeal,
      level: 84,
      attackLevel: 75,
      strengthLevel: 75,
      defenceLevel: undefined,
      available,
    });
    expect(resolveQuickPrayerSelections([PrayerType.Piety], availability, { zealPrayer: true })).toEqual(
      available ? [PrayerType.Zeal] : [],
    );
    const hiddenUnusable = filterPrayerGrid(
      grid,
      new Set(),
      { ...allShown, showLackRequirements: false },
      true,
      false,
      availability,
    );
    expect(icons(hiddenUnusable).includes('piety')).toBe(available);
    expect(icons(filterPrayerGrid(grid, new Set(), allShown, true, false, availability))).toContain('piety');
  });

  it('keeps Piety unavailable below 70 Defence while Zeal is off', () => {
    const availability = { ...zealLevels, baseDefenceLevel: 69 };
    const grid = resolvePrayerSlots(PRAYER_GRID, availability, { zealPrayer: false });
    expect(grid.find((slot) => slot.icon === 'piety')).toMatchObject({ prayer: PrayerType.Piety, available: false });
    expect(resolveQuickPrayerSelections([PrayerType.Piety], availability, { zealPrayer: false })).toEqual([]);
    expect(
      icons(filterPrayerGrid(grid, new Set(), { ...allShown, showLackRequirements: false }, true, false, availability)),
    ).not.toContain('piety');
  });

  it.each([
    [true, 75, 65, false],
    [true, 74, 70, true],
    [false, 75, 69, true],
    [false, 75, 70, false],
  ] as const)('checks Chivalry’s effective successor with Zeal %s, Attack %s, Defence %s', (zealPrayer, baseAttackLevel, baseDefenceLevel, chivalryShown) => {
    const availability = { ...zealLevels, baseAttackLevel, baseDefenceLevel };
    const grid = resolvePrayerSlots(PRAYER_GRID, availability, { upgradedPrayers: true, zealPrayer });
    const options = { ...allShown, showLowerTiers: false };
    expect(icons(filterPrayerGrid(grid, new Set(), options, true, false, availability)).includes('chivalry')).toBe(
      chivalryShown,
    );
  });

  it('still hides Zeal using the persisted Piety cell key', () => {
    const grid = resolvePrayerSlots(PRAYER_GRID, zealLevels, { zealPrayer: true });
    expect(icons(filterPrayerGrid(grid, new Set(['piety']), allShown, true, false, zealLevels))).not.toContain('piety');
  });
});

describe('PRAYER_SLOT_ICON_NAMES', () => {
  it('lists every sprite the book can paint, replacements included', () => {
    expect(PRAYER_SLOT_ICON_NAMES).toEqual(expect.arrayContaining(icons(PRAYER_GRID)));
    expect(PRAYER_SLOT_ICON_NAMES).toContain('deadeye');
    expect(PRAYER_SLOT_ICON_NAMES).toContain('mystic_vigour');
    expect(PRAYER_SLOT_ICON_NAMES).toContain('zeal');
  });
});

const ALL_OPTION_COMBOS: PrayerFilterOptions[] = Array.from({ length: 32 }, (_, mask) => ({
  showLowerTiers: (mask & 1) !== 0,
  showTieredOverMultiskill: (mask & 2) !== 0,
  showRapidHealing: (mask & 4) !== 0,
  showLackLevel: (mask & 8) !== 0,
  showLackRequirements: (mask & 16) !== 0,
}));

const LEVEL_BOUNDARIES = [0, 1, 25, 43, 44, 59, 60, 64, 65, 69, 70, 73, 74, 76, 77, 99];

const BY_ICON = new Map(PRAYER_GRID.map((slot) => [slot.icon, slot]));

/**
 * Eager, unordered oracle for the production function's four short-circuit guards. It stops
 * agreeing if a guard becomes order-dependent or shields another guard from an invalid input.
 */
function passesByUnorderedConjunction(slot: PrayerSlot, o: PrayerFilterOptions, av: PrayerAvailability): boolean {
  const successor = slot.successor === undefined ? undefined : BY_ICON.get(slot.successor);
  const tripped = [
    !o.showLackLevel && av.basePrayerLevel < slot.level,
    !o.showLackRequirements &&
      (av.baseDefenceLevel < (slot.defenceLevel ?? 1) ||
        av.baseAttackLevel < (slot.attackLevel ?? 1) ||
        av.baseStrengthLevel < (slot.strengthLevel ?? 1)),
    !o.showRapidHealing && slot.healing === true,
    successor !== undefined &&
      !o.showLowerTiers &&
      (!o.showTieredOverMultiskill || successor.tierGroup === slot.tierGroup) &&
      isPrayerAvailable(successor, av),
  ];
  return !tripped.some(Boolean);
}

const SYNTHETIC_SLOTS: PrayerSlot[] = (() => {
  const tierGroups: (PrayerTierGroup | undefined)[] = [undefined, 'defence', 'melee-combined'];
  const successors = [undefined, 'piety', 'chivalry', 'no_such_prayer'];
  const slots: PrayerSlot[] = [];
  for (const level of [1, 60, 99]) {
    for (const defenceLevel of [undefined, 65, 70]) {
      for (const healing of [undefined, true] as const) {
        for (const tierGroup of tierGroups) {
          for (const successor of successors) {
            slots.push({
              icon: `synthetic_${slots.length}`,
              label: 'Synthetic',
              level,
              ...(defenceLevel === undefined ? {} : { defenceLevel }),
              ...(healing === undefined ? {} : { healing }),
              ...(tierGroup === undefined ? {} : { tierGroup }),
              ...(successor === undefined ? {} : { successor }),
            });
          }
        }
      }
    }
  }
  return slots;
})();

describe('passesPrayerFilter', () => {
  it('hides a prayer above the base Prayer level only while that row is off', () => {
    const piety = BY_ICON.get('piety') as PrayerSlot;
    const under: PrayerAvailability = {
      basePrayerLevel: 69,
      baseDefenceLevel: 99,
      baseAttackLevel: 99,
      baseStrengthLevel: 99,
    };
    expect(passesPrayerFilter(piety, { ...allShown, showLackLevel: false }, under)).toBe(false);
    expect(passesPrayerFilter(piety, { ...allShown, showLackLevel: true }, under)).toBe(true);
  });

  it('hides a prayer behind an unmet Defence requirement only while that row is off', () => {
    const piety = BY_ICON.get('piety') as PrayerSlot;
    const under: PrayerAvailability = {
      basePrayerLevel: 99,
      baseDefenceLevel: 69,
      baseAttackLevel: 99,
      baseStrengthLevel: 99,
    };
    expect(passesPrayerFilter(piety, { ...allShown, showLackRequirements: false }, under)).toBe(false);
    expect(passesPrayerFilter(piety, { ...allShown, showLackRequirements: true }, under)).toBe(true);
  });

  it('hides a healing prayer only while that row is off', () => {
    const rapidHeal = BY_ICON.get('rapid_heal') as PrayerSlot;
    expect(passesPrayerFilter(rapidHeal, { ...allShown, showRapidHealing: false }, MAXED)).toBe(false);
    expect(passesPrayerFilter(rapidHeal, { ...allShown, showRapidHealing: true }, MAXED)).toBe(true);
  });

  it('suppresses a lower tier only when its successor is actually prayable', () => {
    const steelSkin = BY_ICON.get('steel_skin') as PrayerSlot;
    const options = { ...allShown, showLowerTiers: false, showTieredOverMultiskill: false };
    expect(passesPrayerFilter(steelSkin, options, MAXED)).toBe(false);
    expect(
      passesPrayerFilter(steelSkin, options, {
        basePrayerLevel: 59,
        baseDefenceLevel: 99,
        baseAttackLevel: 99,
        baseStrengthLevel: 99,
      }),
    ).toBe(true);
    expect(
      passesPrayerFilter(steelSkin, options, {
        basePrayerLevel: 99,
        baseDefenceLevel: 64,
        baseAttackLevel: 99,
        baseStrengthLevel: 99,
      }),
    ).toBe(true);
  });

  it('is independent of the order its guards are evaluated in', () => {
    for (const slot of [...PRAYER_GRID, ...SYNTHETIC_SLOTS]) {
      for (const options of ALL_OPTION_COMBOS) {
        for (const basePrayerLevel of LEVEL_BOUNDARIES) {
          for (const baseDefenceLevel of LEVEL_BOUNDARIES) {
            const availability = { ...MAXED, basePrayerLevel, baseDefenceLevel };
            if (
              passesPrayerFilter(slot, options, availability) !==
              passesByUnorderedConjunction(slot, options, availability)
            ) {
              throw new Error(
                `order-dependent result for ${slot.icon} at ${JSON.stringify(availability)} ${JSON.stringify(options)}`,
              );
            }
          }
        }
      }
    }
  });
});
