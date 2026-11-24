/**
 * Lives here rather than beside the components that render it because these
 * types are part of the replay recording's presentation contract
 * (`ReplayPanelPresentation` in src/core/replayPresentation.ts). With them in
 * `SpellbookContent`/`usePanelFilters`, serialization imported its own contract
 * back out of the React layer and those two modules imported it in turn.
 *
 * Every flag below is stored in the POSITIVE sense the filter panel's label reads
 * ("Show X" checked = true). OSRS stores the inverse: its varbits are named
 * `*_FILTER_BLOCK*` (RuneLite `gameval/VarbitID`) and a row is checked when its
 * varbit is 0. Anyone transcribing a rule from a source in the client's sense must
 * negate it on the way in, or every filter comes out backwards.
 */

export type SpellCategory = 'combat' | 'teleport' | 'utility';

/**
 * Row order of the three category toggles as the live filter panel lists them
 * — deliberately NOT the `spell_type` param order, which is combat=0, utility=1,
 * teleport=2.
 */
export const ALL_SPELL_CATEGORIES: SpellCategory[] = ['combat', 'teleport', 'utility'];

/**
 * The five prayer filter rows, in panel order
 * (https://oldschool.runescape.wiki/w/Prayer#Prayer_filtering).
 */
export interface PrayerFilterOptions {
  /** RuneLite `PRAYER_FILTER_BLOCKLOWTIER` (varbit 6574). */
  showLowerTiers: boolean;
  /**
   * RuneLite `PRAYER_FILTER_ALLOWCOMBINEDTIER` (varbit 6575). Only reachable while
   * `showLowerTiers` is off; the live client grays the row out otherwise.
   */
  showTieredOverMultiskill: boolean;
  /** RuneLite `PRAYER_FILTER_BLOCKHEALING` (varbit 6576). */
  showRapidHealing: boolean;
  /** RuneLite `PRAYER_FILTER_BLOCKLACKLEVEL` (varbit 6577). */
  showLackLevel: boolean;
  /** RuneLite `PRAYER_FILTER_BLOCKLOCKED` (varbit 6578). */
  showLackRequirements: boolean;
}

/**
 * The spellbook filter rows that are not category toggles, in panel order
 * (https://oldschool.runescape.wiki/w/Spellbook#Spellbook_filtering), plus one row
 * this simulator adds for its own coverage.
 */
export interface SpellFilterOptions {
  /** RuneLite `LEVEL_SPELL_FILTER` (varbit 6607). */
  showLackLevel: boolean;
  /** RuneLite `RUNES_SPELL_FILTER` (varbit 6608). */
  showLackRunes: boolean;
  /** RuneLite `REQUIREMENTS_SPELL_FILTER` (varbit 12137). */
  showLackRequirements: boolean;
  /**
   * Simulator-only row hiding spells the engine cannot resolve; the enabled-state check uses
   * the same distinction without filtering the slot.
   */
  showUnsimulated: boolean;
  /**
   * Varbit 6548, added by https://oldschool.runescape.wiki/w/Update:More_Poll_78_Changes!
   * The one row that hides nothing: it decides whether a short filtered list may grow
   * its icons to 40px or stays at 24px.
   */
  iconResizing: boolean;
}

/** Every varbit 0, i.e. every row checked — the live client's initial state. */
export const PRAYER_FILTER_DEFAULTS: PrayerFilterOptions = {
  showLowerTiers: true,
  showTieredOverMultiskill: true,
  showRapidHealing: true,
  showLackLevel: true,
  showLackRequirements: true,
};

export const SPELL_FILTER_DEFAULTS: SpellFilterOptions = {
  showLackLevel: true,
  showLackRunes: true,
  showLackRequirements: true,
  showUnsimulated: true,
  iconResizing: true,
};
