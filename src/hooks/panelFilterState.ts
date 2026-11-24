import type { PrayerFilterOptions, SpellCategory, SpellFilterOptions } from '../types/panelFilters';
import { ALL_SPELL_CATEGORIES, PRAYER_FILTER_DEFAULTS, SPELL_FILTER_DEFAULTS } from '../types/panelFilters';

export const PANEL_FILTER_STORAGE_KEY = 'osrs-panel-filters';

export interface PrayerFilterSettings {
  hidden: string[];
  order: string[] | null;
  filterOptions: PrayerFilterOptions;
  quickPrayerSelections: string[];
}

export interface SpellbookFilterSettings {
  hidden: Record<string, string[]>;
  order: Record<string, string[] | null>;
  /**
   * One set for every book, as the live client's filter varbits are; unlike `hidden` and
   * `order`, switching book keeps them. Categories are kept in click order.
   */
  activeCategories: SpellCategory[];
  /** One set for every book, like {@link activeCategories}. */
  filterOptions: SpellFilterOptions;
}

export interface PanelFilterSettings {
  prayer: PrayerFilterSettings;
  spellbook: SpellbookFilterSettings;
}

function asRecord(raw: unknown): Record<string, unknown> {
  return raw !== null && typeof raw === 'object' && !Array.isArray(raw) ? (raw as Record<string, unknown>) : {};
}

function stringArray(raw: unknown): string[] | null {
  return Array.isArray(raw) ? raw.filter((entry): entry is string => typeof entry === 'string') : null;
}

function storedFlag(stored: Record<string, unknown>, name: string): boolean | undefined {
  const value = stored[name];
  return typeof value === 'boolean' ? value : undefined;
}

/**
 * Every option is listed explicitly rather than copied across, so adding a row to
 * {@link PrayerFilterOptions} fails to compile here instead of reaching the replay
 * format's strict schema, which rejects a key it does not know about.
 */
function normalizePrayerFilterOptions(raw: unknown): PrayerFilterOptions {
  const stored = asRecord(raw);
  return {
    showLowerTiers: storedFlag(stored, 'showLowerTiers') ?? PRAYER_FILTER_DEFAULTS.showLowerTiers,
    showTieredOverMultiskill:
      storedFlag(stored, 'showTieredOverMultiskill') ?? PRAYER_FILTER_DEFAULTS.showTieredOverMultiskill,
    showRapidHealing: storedFlag(stored, 'showRapidHealing') ?? PRAYER_FILTER_DEFAULTS.showRapidHealing,
    showLackLevel: storedFlag(stored, 'showLackLevel') ?? PRAYER_FILTER_DEFAULTS.showLackLevel,
    showLackRequirements: storedFlag(stored, 'showLackRequirements') ?? PRAYER_FILTER_DEFAULTS.showLackRequirements,
  };
}

/** See {@link normalizePrayerFilterOptions} for why each row is written out. */
function normalizeSpellFilterOptions(raw: unknown): SpellFilterOptions {
  const stored = asRecord(raw);
  return {
    showLackLevel: storedFlag(stored, 'showLackLevel') ?? SPELL_FILTER_DEFAULTS.showLackLevel,
    showLackRunes: storedFlag(stored, 'showLackRunes') ?? SPELL_FILTER_DEFAULTS.showLackRunes,
    showLackRequirements: storedFlag(stored, 'showLackRequirements') ?? SPELL_FILTER_DEFAULTS.showLackRequirements,
    showUnsimulated: storedFlag(stored, 'showUnsimulated') ?? SPELL_FILTER_DEFAULTS.showUnsimulated,
    iconResizing: storedFlag(stored, 'iconResizing') ?? SPELL_FILTER_DEFAULTS.iconResizing,
  };
}

function normalizeHidden(raw: unknown): Record<string, string[]> {
  const result: Record<string, string[]> = {};
  for (const [book, value] of Object.entries(asRecord(raw))) {
    const icons = stringArray(value);
    if (icons) result[book] = icons;
  }
  return result;
}

function normalizeOrder(raw: unknown): Record<string, string[] | null> {
  const result: Record<string, string[] | null> = {};
  for (const [book, value] of Object.entries(asRecord(raw))) {
    if (value === null) {
      result[book] = null;
      continue;
    }
    const order = stringArray(value);
    if (order) result[book] = order;
  }
  return result;
}

/** Not a list means never chosen, so every category is on; an empty list is every category off. */
function normalizeActiveCategories(raw: unknown): SpellCategory[] {
  if (!Array.isArray(raw)) return [...ALL_SPELL_CATEGORIES];
  // Stored order is kept: the category toggles append in click order, and reordering
  // them here would rewrite every profile on load for no visible gain.
  const categories = raw.filter((entry): entry is SpellCategory =>
    ALL_SPELL_CATEGORIES.includes(entry as SpellCategory),
  );
  return [...new Set(categories)];
}

/**
 * Canonicalizes the stored panel arrangement: keeps what the current model defines,
 * fills a missing or mistyped row with its default, and drops everything else.
 *
 * This runs where the settings are read rather than where a replay is captured because
 * these values are recorded into a replay's presentation track, and capture checks that
 * track against the replay format's strict schema. A key the schema does not know fails
 * the whole panel arrangement, so playback would show a fallback arrangement instead of
 * the one the user had.
 *
 * Idempotent, so re-normalizing a repaired profile is a no-op and cannot churn writes.
 */
export function normalizePanelFilterSettings(raw: unknown): PanelFilterSettings {
  const stored = asRecord(raw);
  const prayer = asRecord(stored.prayer);
  const spellbook = asRecord(stored.spellbook);
  return {
    prayer: {
      hidden: stringArray(prayer.hidden) ?? [],
      order: stringArray(prayer.order),
      filterOptions: normalizePrayerFilterOptions(prayer.filterOptions),
      quickPrayerSelections: stringArray(prayer.quickPrayerSelections) ?? [],
    },
    spellbook: {
      hidden: normalizeHidden(spellbook.hidden),
      order: normalizeOrder(spellbook.order),
      activeCategories: normalizeActiveCategories(spellbook.activeCategories),
      filterOptions: normalizeSpellFilterOptions(spellbook.filterOptions),
    },
  };
}
