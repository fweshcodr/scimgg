/** Where a row lives: one of the two sidebars, or the game panel (its Keybinds tab). */
export type SearchPanel = 'settings' | 'plugins' | 'gamepanel';

export type SearchEntryKind = 'section' | 'plugin' | 'setting';

/** One searchable row in the Settings or Plugins sidebar. */
export interface SearchEntry {
  /** Matches the row's `data-search-id` anchor; build it with the helpers in `ids.ts`. */
  id: string;
  /** The row's visible label. */
  title: string;
  panel: SearchPanel;
  /** Labels of the row's ancestors, outermost first, e.g. `['Plugins', 'Camera', 'Zoom']`. */
  breadcrumb: string[];
  description?: string;
  /** Everyday, RuneLite and OSRS words a player might type instead of the label. */
  keywords?: string[];
  /** When the row is only shown or only applies conditionally, e.g. 'Fixed layout only'. */
  availability?: string;
  /**
   * The client layouts the row is shown in, when not all. Search ranks it by the player's layout,
   * and the search UI marks it "Not in this layout" when its anchor is on the page but the control
   * is not: a plugin option, whose plugin row is always there.
   */
  layouts?: readonly SearchLayout[];
  /**
   * The result's title when the row's own label is ambiguous out of its row ("Volume" → "Metronome
   * volume"). The id and the matching still come from `title`, the label on screen; only this title
   * can be named exactly, so a bare "Volume" does not outrank every other volume.
   */
  resultTitle?: string;
  /**
   * What the search UI says when the row cannot be shown now, and, when the player can change
   * that, the prerequisite to take them to instead (another entry's id). Never a change made for
   * them: the route only reveals the prerequisite.
   */
  whenUnavailable?: { readonly reason: string; readonly route?: { readonly label: string; readonly target: string } };
  /** Changes keyboard keys: offered on touch-only devices too, but explained as needing a keyboard. */
  needsKeyboard?: boolean;
  kind: SearchEntryKind;
}

/** The layout families an option can depend on: Fixed, the two Resizable layouts, or Mobile. */
export type SearchLayout = 'fixed' | 'resizable' | 'mobile';

export type SearchField = 'title' | 'keywords' | 'breadcrumb' | 'description' | 'availability';

/** How a query word met an entry word. `variant` is a stem match (marker / markers / marking). */
export type MatchKind = 'exact' | 'variant' | 'synonym' | 'prefix' | 'fuzzy';

export interface MatchedOn {
  /** The normalized query word. */
  queryToken: string;
  field: SearchField;
  /** The full field text that matched, e.g. the keyword phrase `'ground markers'`. */
  text: string;
  kind: MatchKind;
}

/**
 * What the match engine reads from an entry. Settings rows and the quick search's encounter rows
 * both satisfy it; `kind` only matters as `'setting'` (a control) against anything broader.
 */
export type Searchable = Pick<
  SearchEntry,
  'title' | 'resultTitle' | 'breadcrumb' | 'description' | 'keywords' | 'availability' | 'layouts'
> & {
  readonly kind: string;
};

export interface SearchResult<E extends Searchable = SearchEntry> {
  entry: E;
  score: number;
  /** The best match for each query word that matched, in query order. */
  matchedOn: MatchedOn[];
  /**
   * Character ranges `[start, end)` of the shown title (`resultTitle`, else `title`) whose words
   * the query matched, for the results to highlight. Never a synonym-only match.
   */
  titleSpans: ReadonlyArray<readonly [number, number]>;
}

export interface SearchOptions {
  /** Maximum results to return. Defaults to all for `search`, 5 for `suggest`. */
  limit?: number;
  /** The player's client layout now (`search` only): rows whose `layouts` include it rank a little higher, others a little lower. */
  layout?: SearchLayout;
}
