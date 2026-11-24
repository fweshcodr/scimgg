import type React from 'react';
import { useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { EncounterDescriptor, EncounterRegistry } from '../core/encounters/encounterFactory';
import { isAppShortcut } from '../hooks/useAppHotkeys';
import { ESC_PRIORITY, useEscapeLayer } from '../hooks/useEscapeLayer';
import { useIsTouchOnly } from '../hooks/useIsTouchOnly';
import {
  type EncounterSearchEntry,
  type EncounterSearchSource,
  encounterSearchEntries,
} from '../settingsSearch/encounters';
import { SETTINGS_SEARCH_ENTRIES } from '../settingsSearch/entries';
import { search, suggest } from '../settingsSearch/match';
import type { SearchEntry, SearchLayout, SearchResult } from '../settingsSearch/types';
import { TUTORIAL_QUICK_SEARCH_OPENED_EVENT } from '../tutorial/events';
import { encounterPresentationModuleForKind } from './encounterPickerMeta';
import {
  ChevronGlyph,
  credibleSuggestions,
  HighlightedTitle,
  partitionRows,
  type SearchContext,
  SearchGlyph,
  type Unavailable,
  unavailability,
} from './searchResults';
import { revealSetting } from './settingsReveal';
import { useBackdropDismiss } from './ui/backdropDismiss';
import { BetaBadge } from './ui/StatusBadge';
import './QuickSearch.css';

/**
 * The quick search (Ctrl+K): one field over encounters, settings, plugins and keybinds, ranked by
 * the sidebars' own search engine (settingsSearch). A setting, plugin or keybind is revealed where
 * it lives (settingsReveal.ts); an encounter opens the encounter picker with it selected, so a fight
 * never starts from here.
 *
 * Its field is a keyboard exception (Keyboard and focus policy): it takes the caret on open, and
 * Up, Down and Enter choose from the list. Everything else typed stays in the field.
 */

export const QUICK_SEARCH_PLACEHOLDER = 'Search encounters, settings, plugins and keybinds';

export type QuickSearchEntry = SearchEntry | EncounterSearchEntry;
export type QuickSearchType = 'Encounter' | 'Setting' | 'Plugin' | 'Keybind';

/** What the picker opens on when an encounter is chosen here. */
export interface EncounterSelection {
  /** The rail entry: a base kind, or an encounter group's id. */
  readonly kind: string;
  /** A row to select in it: a contract, or a group's stage (its kind). */
  readonly variantId?: string;
}

/**
 * Ctrl+K was the encounter switcher first, so on comparable evidence an encounter leads: "zuk"
 * finds TzKal-Zuk before the Zuk Set Timer plugin, "contract" Yama's contracts before Contrast.
 * Below an exact or prefix title match elsewhere (+20, +8), so it never buries the row a player named.
 */
const ENCOUNTER_LEAD = 6;

const LOBBY_KIND = 'lobby';

export function quickSearchType(entry: QuickSearchEntry): QuickSearchType {
  if (entry.kind === 'encounter') return 'Encounter';
  // The game panel holds the keybind editor and the Audio page: only the first is a keybind.
  if (entry.needsKeyboard) return 'Keybind';
  return entry.panel === 'plugins' ? 'Plugin' : 'Setting';
}

/** The picker's rail, as the quick search indexes it: every registered fight but the lobby. */
export function encounterSearchSources(registry: EncounterRegistry): EncounterSearchSource[] {
  const sources: EncounterSearchSource[] = [];
  const descriptors = registry
    .getRegisteredKinds()
    .map((kind) => registry.getDescriptor(kind))
    .filter((desc): desc is EncounterDescriptor => !!desc && desc.kind !== LOBBY_KIND);
  for (const desc of descriptors) {
    const presentation = encounterPresentationModuleForKind(desc.kind)?.presentation ?? {};
    sources.push({
      kind: desc.kind,
      title: presentation.title ?? desc.displayName,
      displayName: desc.displayName,
      description: desc.description,
      tagline: presentation.tagline,
      isWorkInProgress: desc.isWorkInProgress ?? false,
      variants: desc.variants ?? [],
    });
  }
  return sources;
}

/**
 * Ranked matches for `query`, encounters leading on comparable evidence. When nothing matches,
 * only credible near misses (`suggested`), as in the sidebars.
 */
export function rankQuickSearch(
  query: string,
  entries: readonly QuickSearchEntry[],
  layout: SearchLayout,
): { results: SearchResult<QuickSearchEntry>[]; suggested: boolean } {
  const found = search(query, entries, { layout });
  if (found.length > 0) {
    const lead = (result: SearchResult<QuickSearchEntry>) =>
      result.score + (result.entry.kind === 'encounter' ? ENCOUNTER_LEAD : 0);
    return { results: [...found].sort((a, b) => lead(b) - lead(a)), suggested: false };
  }
  return { results: credibleSuggestions(query, suggest(query, entries)), suggested: true };
}

interface Row {
  result: SearchResult<QuickSearchEntry>;
  unavailable: Unavailable | null;
}

interface QuickSearchProps {
  isOpen: boolean;
  onClose: () => void;
  encounterRegistry: EncounterRegistry;
  /** The client layout now, for options only some layouts show. */
  layout: SearchLayout;
  /** An encounter was chosen: open the picker on it. */
  onChooseEncounter: (selection: EncounterSelection) => void;
  /** Open the full encounter picker. */
  onBrowseEncounters: () => void;
}

export function QuickSearch({
  isOpen,
  onClose,
  encounterRegistry,
  layout,
  onChooseEncounter,
  onBrowseEncounters,
}: QuickSearchProps) {
  useEscapeLayer(ESC_PRIORITY.QUICK_SEARCH, isOpen, onClose);
  useEffect(() => {
    if (isOpen) window.dispatchEvent(new CustomEvent(TUTORIAL_QUICK_SEARCH_OPENED_EVENT));
  }, [isOpen]);
  if (!isOpen) return null;
  return (
    <QuickSearchDialog
      onClose={onClose}
      encounterRegistry={encounterRegistry}
      layout={layout}
      onChooseEncounter={onChooseEncounter}
      onBrowseEncounters={onBrowseEncounters}
    />
  );
}

/**
 * The RuneScape faces have no arrow glyphs, so a fallback font drew them: thin, blurred and off
 * the caps' line. These are drawn on the same 1px grid instead, exactly as tall as a capital
 * (QuickSearch.css lines them up with the "E" of Enter).
 */
const ARROW_PATH = {
  up: 'M3 0h1v8H3zM2 1h1v1H2zM4 1h1v1H4zM1 2h1v1H1zM5 2h1v1H5z',
  down: 'M3 0h1v8H3zM2 6h1v1H2zM4 6h1v1H4zM1 5h1v1H1zM5 5h1v1H5z',
} as const;

function ArrowKey({ direction }: { direction: keyof typeof ARROW_PATH }) {
  return (
    <kbd className="kbd quick-search__arrow-key">
      <svg width="7" height="8" viewBox="0 0 7 8" shapeRendering="crispEdges" aria-hidden="true" focusable="false">
        <path d={ARROW_PATH[direction]} fill="currentColor" />
      </svg>
    </kbd>
  );
}

/** The "Show remaining" button's place in the keyboard order: after every actionable row. */
const MORE = 'quick-search:more';

/**
 * Whether Enter can do something with the row: go to it, or take its route to the prerequisite.
 * A row that is only information (unavailable, nowhere to send the player) stays listed but is
 * passed over by Up and Down.
 */
function isActionable(row: Row): boolean {
  return row.unavailable === null || row.unavailable.route !== undefined;
}

/** What Enter does with the row, for the footer: "Enter view encounter", "Enter open". */
function enterAction(row: Row): string {
  if (row.result.entry.kind === 'encounter') return 'view encounter';
  const route = row.unavailable?.route;
  return route ? route.label.charAt(0).toLowerCase() + route.label.slice(1) : 'open';
}

/** Mounted only while open, so each opening starts from an empty field. */
function QuickSearchDialog({
  onClose,
  encounterRegistry,
  layout,
  onChooseEncounter,
  onBrowseEncounters,
}: Omit<QuickSearchProps, 'isOpen'>) {
  const [query, setQuery] = useState('');
  /** The keyboard's place: a row's entry id or MORE; null follows the first actionable item. */
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [showAll, setShowAll] = useState(false);
  /** A reveal refused at the moment of choosing (the situation changed since the list rendered). */
  const [refused, setRefused] = useState<{ id: string; reason: string } | null>(null);
  const touchOnly = useIsTouchOnly();
  const cardRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const backdropDismiss = useBackdropDismiss(cardRef, onClose);
  const baseId = useId().replace(/:/g, '');
  const listId = `quick-search-list-${baseId}`;
  const moreId = `quick-search-more-${baseId}`;
  const optionId = (index: number) => `quick-search-option-${baseId}-${index}`;

  const encounters = useMemo(
    () => encounterSearchEntries(encounterSearchSources(encounterRegistry)),
    [encounterRegistry],
  );
  // One array per registry, so the engine's prepared index is built once.
  const entries = useMemo<QuickSearchEntry[]>(() => [...encounters, ...SETTINGS_SEARCH_ENTRIES], [encounters]);

  const trimmed = query.trim();
  const { results, suggested } = useMemo(
    () => (trimmed ? rankQuickSearch(trimmed, entries, layout) : { results: [], suggested: false }),
    [trimmed, entries, layout],
  );

  useLayoutEffect(() => {
    inputRef.current?.focus();
  }, []);

  // Read when the list renders: both drawers stay mounted, so their anchors are current.
  const context: SearchContext = { layout, touchOnly };
  const rows: Row[] = trimmed
    ? results.map((result) => ({
        result,
        unavailable: result.entry.kind === 'encounter' ? null : unavailability(result.entry, context),
      }))
    : // Before typing: the fights themselves, as the encounter switcher Ctrl+K always was.
      encounters
        .filter((entry) => entry.variantId === undefined)
        .map((entry) => ({ result: { entry, score: 0, matchedOn: [], titleSpans: [] }, unavailable: null }));
  const { usable, elsewhere, shownUsable, shownElsewhere, hidden } = partitionRows(rows, showAll);
  const shown = [...shownUsable, ...shownElsewhere];

  // Up and Down walk the actionable rows, then "Show remaining" when the list is cut short.
  const navKeys = [...shown.filter(isActionable).map((row) => row.result.entry.id), ...(hidden > 0 ? [MORE] : [])];
  const activeKey = selectedKey !== null && navKeys.includes(selectedKey) ? selectedKey : (navKeys[0] ?? null);
  const activeIndex = shown.findIndex((row) => row.result.entry.id === activeKey);
  const activeRow = activeIndex === -1 ? null : shown[activeIndex];
  const activeDescendant = activeKey === MORE ? moreId : activeIndex === -1 ? undefined : optionId(activeIndex);

  // biome-ignore lint/correctness/useExhaustiveDependencies: follow the selection, which moves by key or pointer.
  useEffect(() => {
    if (!activeDescendant) return;
    // Optional-call guarded: happy-dom does not implement scrollIntoView.
    document.getElementById(activeDescendant)?.scrollIntoView?.({ block: 'nearest' });
  }, [activeDescendant, trimmed]);

  const goTo = (id: string) => {
    const status = revealSetting(id);
    if (status.ok) {
      onClose();
    } else {
      setRefused({ id, reason: status.reason });
    }
  };

  const choose = (row: Row) => {
    const { entry } = row.result;
    if (entry.kind === 'encounter') {
      onChooseEncounter(
        entry.variantId ? { kind: entry.encounterKind, variantId: entry.variantId } : { kind: entry.encounterKind },
      );
      return;
    }
    // Listed with its reason already: Enter takes the route to the prerequisite when there is one.
    if (row.unavailable) {
      if (row.unavailable.route) goTo(row.unavailable.route.target);
      return;
    }
    goTo(entry.id);
  };

  /** Shows every result, with the keyboard on the first actionable one it brought into view. */
  const showRemaining = () => {
    const before = new Set(shown.map((row) => row.result.entry.id));
    const exposed = [...usable, ...elsewhere].find((row) => !before.has(row.result.entry.id) && isActionable(row));
    setShowAll(true);
    setSelectedKey(exposed ? exposed.result.entry.id : null);
  };

  const onKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    // Tab is the app's to swallow, Escape the escape layer's, and the app's own shortcuts (Ctrl+K,
    // which toggles this closed, and the reload, help and zoom keys it keeps from the browser) go on.
    if (event.key === 'Tab' || event.key === 'Escape' || isAppShortcut(event.nativeEvent)) return;
    event.stopPropagation();
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      if (activeKey === null) return;
      const step = event.key === 'ArrowDown' ? 1 : -1;
      setSelectedKey(navKeys[(navKeys.indexOf(activeKey) + step + navKeys.length) % navKeys.length]);
    } else if (event.key === 'Enter') {
      event.preventDefault();
      if (activeKey === MORE) showRemaining();
      else if (activeRow) choose(activeRow);
    }
  };

  const renderRow = (row: Row, index: number) => {
    const { entry } = row.result;
    const isSelected = index === activeIndex;
    const actionable = isActionable(row);
    const reason = row.unavailable?.reason ?? (refused?.id === entry.id ? refused.reason : null);
    const route = row.unavailable?.route;
    const wip = entry.kind === 'encounter' && entry.isWorkInProgress;
    return (
      // biome-ignore lint/a11y/useKeyWithClickEvents lint/a11y/useFocusableInteractive: an option of the field's listbox; the keyboard reaches it through the field (Keyboard and focus policy).
      <div
        key={entry.id}
        id={optionId(index)}
        role="option"
        aria-selected={isSelected}
        aria-disabled={actionable ? undefined : true}
        className={`drawer-search-result quick-search-row${isSelected ? ' is-selected' : ''}${
          row.unavailable ? ' is-unavailable' : ''
        }`}
        onMouseMove={() => {
          if (actionable && !isSelected) setSelectedKey(entry.id);
        }}
        onMouseDown={(event) => event.preventDefault()}
        onClick={() => {
          if (actionable) choose(row);
        }}
      >
        <span className="drawer-search-result__text">
          <span className="quick-search-row__head">
            <HighlightedTitle result={row.result} />
            {wip && <BetaBadge compact />}
          </span>
          <span className="drawer-search-result__crumb">{entry.breadcrumb.join(' › ')}</span>
          {reason ? (
            <span className="drawer-search-result__reason">{reason}</span>
          ) : (
            entry.description && (
              <span className="drawer-search-result__description quick-search-row__description">
                {entry.description}
              </span>
            )
          )}
          {route && (
            <button
              type="button"
              className="drawer-search-result__route"
              onMouseDown={(event) => event.preventDefault()}
              onClick={(event) => {
                event.stopPropagation();
                goTo(route.target);
              }}
            >
              {route.label}
              <span aria-hidden="true"> →</span>
            </button>
          )}
        </span>
        <span className="quick-search-row__type">{quickSearchType(entry)}</span>
        {!row.unavailable && <ChevronGlyph />}
      </div>
    );
  };

  const firstEncounter = encounters[0]?.title.toLowerCase();
  const heading = !trimmed
    ? 'Encounters'
    : !suggested
      ? `${results.length} ${results.length === 1 ? 'match' : 'matches'}`
      : results.length > 0
        ? 'Possible matches'
        : `Nothing found for “${trimmed}”.`;
  const enterHint = activeKey === MORE ? 'show all' : activeRow ? enterAction(activeRow) : null;

  return (
    <div className="quick-search-overlay" {...backdropDismiss}>
      <div ref={cardRef} className="quick-search" role="dialog" aria-modal="true" aria-label="Quick search">
        <div className="quick-search__field">
          <div className="drawer-search">
            <SearchGlyph />
            <input
              ref={inputRef}
              type="text"
              className="drawer-search__input"
              value={query}
              onChange={(event) => {
                setQuery(event.target.value);
                setSelectedKey(null);
                setShowAll(false);
                setRefused(null);
              }}
              onKeyDown={onKeyDown}
              placeholder={QUICK_SEARCH_PLACEHOLDER}
              aria-label={QUICK_SEARCH_PLACEHOLDER}
              role="combobox"
              aria-expanded={shown.length > 0}
              aria-controls={listId}
              aria-activedescendant={activeDescendant}
              aria-autocomplete="list"
              autoComplete="off"
              autoCorrect="off"
              autoCapitalize="off"
              spellCheck={false}
              enterKeyHint="go"
            />
          </div>
        </div>
        <section className="quick-search__results" aria-label="Results">
          <h3 className="drawer-search-results__heading" aria-live="polite">
            {heading}
          </h3>
          {trimmed && results.length === 0 && (
            <p className="drawer-search-results__empty">
              Try an encounter{firstEncounter ? ` such as “${firstEncounter}”` : ''}, or a setting such as “theme” or
              “keybinds”.
            </p>
          )}
          <div id={listId} role="listbox" aria-label="Results" className="drawer-search-results__list">
            {shownUsable.map((row, index) => renderRow(row, index))}
            {shownElsewhere.length > 0 && (
              <div role="presentation" className="drawer-search-results__divider">
                Available elsewhere
              </div>
            )}
            {shownElsewhere.map((row, index) => renderRow(row, shownUsable.length + index))}
          </div>
          {hidden > 0 && (
            <button
              id={moreId}
              type="button"
              className={`drawer-search-results__more${activeKey === MORE ? ' is-selected' : ''}`}
              onMouseDown={(event) => event.preventDefault()}
              onMouseMove={() => {
                if (activeKey !== MORE) setSelectedKey(MORE);
              }}
              onClick={showRemaining}
            >
              Show remaining {hidden} {hidden === 1 ? 'result' : 'results'}
            </button>
          )}
        </section>
        <footer className="quick-search__foot">
          <button
            type="button"
            className="quick-search__browse"
            onMouseDown={(event) => event.preventDefault()}
            onClick={onBrowseEncounters}
          >
            Browse all encounters
            <ChevronGlyph />
          </button>
          <span className="quick-search__keys" aria-hidden="true">
            {navKeys.length > 1 && (
              <span>
                <ArrowKey direction="up" />
                <ArrowKey direction="down" /> move
              </span>
            )}
            {enterHint && (
              <span>
                <kbd className="kbd">Enter</kbd> {enterHint}
              </span>
            )}
            <span>
              <kbd className="kbd">Esc</kbd> close
            </span>
          </span>
        </footer>
      </div>
    </div>
  );
}
