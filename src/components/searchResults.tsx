import type { ReactNode } from 'react';
import { SETTINGS_SEARCH_ENTRIES } from '../settingsSearch/entries';
import { normalizeText } from '../settingsSearch/match';
import type { Searchable, SearchEntry, SearchLayout, SearchResult } from '../settingsSearch/types';
import { getRevealAvailability } from './settingsReveal';
// The field and result-row styles both searches share (the sidebars' and Ctrl+K's).
import './SidebarSearch.css';

/**
 * What the sidebars' search and the quick search (Ctrl+K) show the same way: whether a result can
 * be used now and why not, which near misses are worth offering, how the list is cut short, and
 * a result's title with the matched words picked out. Each search keeps its own list and keys.
 */

/** Enough to scan on a phone or at a glance; the rest are one press away. */
const FIRST_RESULTS = 12;

/** Suggestions for a query that found nothing must clear this likeness (0..1) to be offered. */
const CREDIBLE_SUGGESTION = 0.55;
/** ...and stay this close to the best one, so a near miss is not padded out with weak rows. */
const SUGGESTION_SPREAD = 0.08;
/** Fewer letters than this cannot say what was meant ("abc", "lol"). */
const SUGGESTION_MIN_LETTERS = 4;

const ENTRY_BY_ID = new Map(SETTINGS_SEARCH_ENTRIES.map((entry) => [entry.id, entry]));

/** The settings-search entry for `id`, if there is one. */
export function settingsEntry(id: string): SearchEntry | undefined {
  return ENTRY_BY_ID.get(id);
}

/** What the results need to know about the player's situation to say what is usable now. */
export interface SearchContext {
  layout: SearchLayout;
  /** No keyboard: keybind rows are listed, but explained rather than offered. */
  touchOnly: boolean;
}

/**
 * Why the row cannot be used now, from the situation alone, or null when it can: no keyboard for
 * a keybind, the route's own answer (another device, layout, encounter, a replay holding the game
 * panel), or an option its layout does not show.
 */
function blockedNow(entry: SearchEntry, context: SearchContext): string | null {
  if (entry.needsKeyboard && context.touchOnly) return 'Needs a keyboard.';
  const status = getRevealAvailability(entry.id);
  if (!status.ok) return status.reason;
  if (entry.layouts && !entry.layouts.includes(context.layout)) return 'Not in this layout.';
  return null;
}

export interface Unavailable {
  reason: string;
  route?: { label: string; target: string };
}

/**
 * Why a match cannot be shown now, and where the player can change that, or null when it can be
 * shown. A route whose own target is unavailable gives way to that target's explanation: the
 * click-through option in Fixed says what the transparent chatbox needs, not to turn it on.
 */
export function unavailability(entry: SearchEntry, context: SearchContext, depth = 0): Unavailable | null {
  const blocked = blockedNow(entry, context);
  if (blocked === null) return null;
  // The entry's own words when it has them; otherwise what the route says (a replay, say).
  const own = (!entry.needsKeyboard || !context.touchOnly ? entry.whenUnavailable : undefined) ?? { reason: blocked };
  const target = own.route ? ENTRY_BY_ID.get(own.route.target) : undefined;
  if (target && depth < 3) {
    const prerequisite = unavailability(target, context, depth + 1);
    if (prerequisite) return prerequisite;
  }
  return { reason: own.reason, ...(own.route && target ? { route: { ...own.route } } : {}) };
}

/** Suggestions only when they plausibly are what was meant. */
export function credibleSuggestions<E extends Searchable>(
  query: string,
  suggestions: readonly SearchResult<E>[],
): SearchResult<E>[] {
  if (normalizeText(query).replace(/ /g, '').length < SUGGESTION_MIN_LETTERS) return [];
  const best = suggestions[0]?.score ?? 0;
  return suggestions.filter(
    (result) => result.score >= CREDIBLE_SUGGESTION && result.score >= best - SUGGESTION_SPREAD,
  );
}

/**
 * The list as shown: the rows usable here first, then under "Available elsewhere" the rest. Cut to
 * {@link FIRST_RESULTS} until `showAll`, with the usable rows taking the places first; `hidden`
 * counts what the cut left out.
 */
export function partitionRows<R extends { readonly unavailable: Unavailable | null }>(
  rows: readonly R[],
  showAll: boolean,
): { usable: R[]; elsewhere: R[]; shownUsable: R[]; shownElsewhere: R[]; hidden: number } {
  const usable = rows.filter((row) => row.unavailable === null);
  const elsewhere = rows.filter((row) => row.unavailable !== null);
  const limit = showAll ? Number.POSITIVE_INFINITY : FIRST_RESULTS;
  const shownUsable = usable.slice(0, limit);
  const shownElsewhere = elsewhere.slice(0, Math.max(0, limit - shownUsable.length));
  return {
    usable,
    elsewhere,
    shownUsable,
    shownElsewhere,
    hidden: rows.length - shownUsable.length - shownElsewhere.length,
  };
}

/** The result's shown title, with the words the engine matched (`titleSpans`) picked out. */
export function HighlightedTitle({ result }: { result: SearchResult<Searchable> }) {
  const title = result.entry.resultTitle ?? result.entry.title;
  const parts: ReactNode[] = [];
  let at = 0;
  for (const [start, end] of result.titleSpans) {
    if (start > at) parts.push(title.slice(at, start));
    parts.push(
      <mark key={start} className="drawer-search-result__match">
        {title.slice(start, end)}
      </mark>,
    );
    at = end;
  }
  if (at < title.length) parts.push(title.slice(at));
  return <span className="drawer-search-result__title">{parts}</span>;
}

export function SearchGlyph() {
  return (
    <svg
      className="drawer-search__glyph"
      width="14"
      height="14"
      viewBox="0 0 16 16"
      fill="none"
      aria-hidden="true"
      focusable="false"
    >
      <circle cx="7" cy="7" r="5" stroke="currentColor" strokeWidth="1.5" />
      <path d="M11 11l3 3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

export function ChevronGlyph() {
  return (
    <svg
      className="drawer-search-result__chevron"
      width="8"
      height="12"
      viewBox="0 0 8 12"
      fill="none"
      aria-hidden="true"
      focusable="false"
    >
      <path d="M2 2l4 4-4 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
