import { describe, expect, it } from 'vitest';
import { ALL_SPELL_CATEGORIES, PRAYER_FILTER_DEFAULTS, SPELL_FILTER_DEFAULTS } from '../../types/panelFilters';
import { normalizePanelFilterSettings } from '../panelFilterState';

/**
 * A stored profile carrying keys the model does not define, rows of the wrong type and rows
 * left out. Left as stored, its unknown keys fail the replay format's strict schema when the
 * arrangement is recorded.
 */
const UNCANONICAL_PROFILE = {
  prayer: {
    hidden: ['Preserve', 7],
    order: null,
    filterOptions: {
      showLowerTiers: false,
      showRapidHealing: 'no',
      showLackLevel: false,
      notAFilter: true,
    },
    quickPrayerSelections: ['Rigour'],
    unknownSection: {},
  },
  spellbook: {
    hidden: { arceuus: [] },
    order: { arceuus: ['Ghostly_Grasp'] },
    activeCategories: ['teleport', 'invented', 'combat', 'teleport'],
    filterOptions: { showLackRunes: false, iconResizing: 1, notAFilter: true },
  },
};

describe('normalizePanelFilterSettings', () => {
  it('returns the defaults for storage that holds nothing', () => {
    const settings = normalizePanelFilterSettings(null);

    expect(settings.prayer).toEqual({
      hidden: [],
      order: null,
      filterOptions: PRAYER_FILTER_DEFAULTS,
      quickPrayerSelections: [],
    });
    expect(settings.spellbook).toEqual({
      hidden: {},
      order: {},
      activeCategories: ALL_SPELL_CATEGORIES,
      filterOptions: SPELL_FILTER_DEFAULTS,
    });
  });

  it('keeps only the prayer rows the model defines, defaulting missing and mistyped ones', () => {
    const settings = normalizePanelFilterSettings(UNCANONICAL_PROFILE);

    expect(Object.keys(settings)).toEqual(['prayer', 'spellbook']);
    expect(Object.keys(settings.prayer)).toEqual(['hidden', 'order', 'filterOptions', 'quickPrayerSelections']);
    expect(settings.prayer.filterOptions).toEqual({
      ...PRAYER_FILTER_DEFAULTS,
      showLowerTiers: false,
      showLackLevel: false,
    });
    expect(settings.prayer.hidden).toEqual(['Preserve']);
    expect(settings.prayer.quickPrayerSelections).toEqual(['Rigour']);
  });

  it('keeps only the spell options the model defines, defaulting missing and mistyped ones', () => {
    const { spellbook } = normalizePanelFilterSettings(UNCANONICAL_PROFILE);

    expect(spellbook.filterOptions).toEqual({ ...SPELL_FILTER_DEFAULTS, showLackRunes: false });
  });

  it('keeps the stored categories in click order, without unknown or repeated ones', () => {
    const { spellbook } = normalizePanelFilterSettings(UNCANONICAL_PROFILE);

    expect(spellbook.activeCategories).toEqual(['teleport', 'combat']);
  });

  it('turns every category on when none were stored, and keeps an empty list as every category off', () => {
    const missing = normalizePanelFilterSettings({ spellbook: { activeCategories: 'all' } });
    const empty = normalizePanelFilterSettings({ spellbook: { activeCategories: [] } });

    expect(missing.spellbook.activeCategories).toEqual(ALL_SPELL_CATEGORIES);
    expect(missing.spellbook.activeCategories).not.toBe(ALL_SPELL_CATEGORIES);
    expect(empty.spellbook.activeCategories).toEqual([]);
  });

  it('drops record entries whose value is the wrong shape', () => {
    const { spellbook } = normalizePanelFilterSettings({
      spellbook: {
        hidden: { arceuus: ['Ghostly_Grasp'], ancient: 'not-a-list' },
        order: { arceuus: null, lunar: 7 },
      },
    });

    expect(spellbook.hidden).toEqual({ arceuus: ['Ghostly_Grasp'] });
    expect(spellbook.order).toEqual({ arceuus: null });
  });

  it('is idempotent, so a repaired profile never rewrites itself', () => {
    const once = normalizePanelFilterSettings(UNCANONICAL_PROFILE);

    expect(normalizePanelFilterSettings(once)).toEqual(once);
  });
});
