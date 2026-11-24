import { useEffect, useId, useLayoutEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { isAppShortcut } from '../hooks/useAppHotkeys';
import { useIsTouchOnly } from '../hooks/useIsTouchOnly';
import type { ClientLayoutMode } from '../layout/osrsClientLayout';
import { SETTINGS_SEARCH_ENTRIES } from '../settingsSearch/entries';
import { search, suggest } from '../settingsSearch/match';
import type { SearchLayout, SearchPanel, SearchResult } from '../settingsSearch/types';
import { LauncherIcon } from './launcher/launcherIcons';
import {
  ChevronGlyph,
  credibleSuggestions,
  HighlightedTitle,
  partitionRows,
  type SearchContext,
  SearchGlyph,
  settingsEntry,
  type Unavailable,
  unavailability,
} from './searchResults';
import { getRevealAvailability, revealSetting, useSettingsRevealListener } from './settingsReveal';
import { HoverHintButton } from './ui/HoverHintControl';

/**
 * One search over both sidebars, behind a magnifier in each header. Typing covers the panel body
 * with a ranked list from Settings AND Plugins; choosing a row reveals the setting in whichever
 * sidebar owns it (settingsReveal.ts), and that sidebar then offers the way back to the results.
 * Pointer and touch only: the field types and clears, but results take no arrow or Enter
 * navigation (keyboard and focus policy).
 */

const SEARCH_LABEL = 'Search settings and plugins';

export function searchLayoutOf(mode: ClientLayoutMode): SearchLayout {
  return mode === 'fixed' || mode === 'mobile' ? mode : 'resizable';
}

// ---- The last search, for the way back -------------------------------------------------------

/** Where the player came from: the query, whether its full list was showing, and how far down it they were. */
interface LastSearch {
  readonly query: string;
  readonly showAll: boolean;
  readonly scrollTop: number;
  /** The sidebar that shows the way back: the one the chosen row landed in, or for a row in the
   * game panel, the one the search was in. */
  readonly shownIn: DrawerPanel;
}

let lastSearch: LastSearch | null = null;
const lastSearchListeners = new Set<() => void>();

function setLastSearch(next: LastSearch | null): void {
  if (next === lastSearch) return;
  lastSearch = next;
  for (const listener of lastSearchListeners) listener();
}

function useLastSearch(): LastSearch | null {
  return useSyncExternalStore(
    (listener) => {
      lastSearchListeners.add(listener);
      return () => lastSearchListeners.delete(listener);
    },
    () => lastSearch,
    () => null,
  );
}

/** Test seam: the way back is module state shared by both sidebars. */
export function resetLastSearchForTests(): void {
  setLastSearch(null);
  closingForNavigation.clear();
}

/**
 * Drawers App is closing to take the player somewhere (a reveal in the game panel, or in the other
 * drawer where both cannot be open), not because the player dismissed them. Their closing keeps
 * the way back; a dismissal ends it. Consumed by the drawer's next close, or forgotten when it opens.
 */
const closingForNavigation = new Set<DrawerPanel>();

/** Called by App before it closes `panel` for a reveal elsewhere. */
export function closeDrawerForNavigation(panel: DrawerPanel): void {
  closingForNavigation.add(panel);
}

// ---- State ------------------------------------------------------------------------------------

/** The two sidebars, which each carry this search. */
export type DrawerPanel = Exclude<SearchPanel, 'gamepanel'>;

export interface SidebarSearchState {
  panel: DrawerPanel;
  query: string;
  /** Typing: a new search, which also forgets the way back to the previous one. */
  type: (query: string) => void;
  /** Every result is showing, not only the first few. */
  showAll: boolean;
  /** Shows every result. */
  expandAll: () => void;
  /** True while there is something to search for: the panel body is covered by results. */
  active: boolean;
  /** The field is showing (the header's magnifier was pressed, or a search is being restored). */
  open: boolean;
  /** Shows the field; `focus` puts the caret in it (a mouse press, never touch). */
  expand: (focus: boolean) => void;
  /** Clears and hides the field. */
  collapse: () => void;
  /** Brings back the last search's results, scrolled where they were. */
  restore: () => void;
  /** Set while restored results wait to be scrolled back into place. */
  pendingScrollTop: number | null;
  clearPendingScroll: () => void;
  /** Requested focus, consumed by the field once it mounts. */
  focusRequested: boolean;
  clearFocusRequest: () => void;
  /** Records where the player was, then takes them to `id`. */
  goTo: (id: string, scrollTop: number) => void;
}

/**
 * The search state for one sidebar. It clears and hides when the sidebar closes, and when a
 * reveal lands in this sidebar, so the panel body is showing for the reveal to scroll to.
 */
export function useSidebarSearch(panel: DrawerPanel, visible: boolean): SidebarSearchState {
  const [query, setQuery] = useState('');
  const [showAll, setShowAll] = useState(false);
  const [open, setOpen] = useState(false);
  const [pendingScrollTop, setPendingScrollTop] = useState<number | null>(null);
  const [focusRequested, setFocusRequested] = useState(false);

  const collapse = () => {
    setQuery('');
    setShowAll(false);
    setOpen(false);
  };

  useSettingsRevealListener(({ surface }) => {
    if (surface === panel) collapse();
  });
  useEffect(() => {
    if (visible) {
      closingForNavigation.delete(panel);
      return;
    }
    setQuery('');
    setShowAll(false);
    setOpen(false);
    // The player closing the sidebar that holds the way back ends it; App closing it on the way to
    // a reveal (the game panel's keybinds or Audio page) keeps it for when they come back.
    const navigated = closingForNavigation.delete(panel);
    if (!navigated && lastSearch?.shownIn === panel) setLastSearch(null);
  }, [visible, panel]);

  return {
    panel,
    query,
    type: (next) => {
      if (next.trim() !== '') setLastSearch(null);
      // A new query starts with the short list.
      if (next !== query) setShowAll(false);
      setQuery(next);
    },
    showAll,
    expandAll: () => setShowAll(true),
    active: query.trim() !== '',
    open: open || query !== '',
    expand: (focus) => {
      setOpen(true);
      if (focus) setFocusRequested(true);
    },
    collapse,
    restore: () => {
      const last = lastSearch;
      if (!last) return;
      setLastSearch(null);
      setQuery(last.query);
      // Expanded in the same render as the query, so the list is full length before it is scrolled.
      setShowAll(last.showAll);
      setOpen(true);
      setPendingScrollTop(last.scrollTop);
    },
    pendingScrollTop,
    clearPendingScroll: () => setPendingScrollTop(null),
    focusRequested,
    clearFocusRequest: () => setFocusRequested(false),
    goTo: (id, scrollTop) => {
      // Listed as usable when rendered; if that changed since, stay put rather than half-navigate.
      if (!getRevealAvailability(id).ok) return;
      const entry = settingsEntry(id);
      const shownIn = entry && (entry.panel === 'settings' || entry.panel === 'plugins') ? entry.panel : panel;
      // The field keeps focus through the tap (results cancel mousedown); hand the keys back to
      // the game now that the player is done typing.
      const active = document.activeElement;
      if (active instanceof HTMLElement && active.classList.contains('drawer-search__input')) active.blur();
      const remembered = { query, showAll };
      collapse();
      setLastSearch({ ...remembered, scrollTop, shownIn });
      revealSetting(id);
    },
  };
}

// ---- Header button and field ------------------------------------------------------------------

/**
 * The header's magnifier. It shows the field; pressed again it clears and hides it. A mouse puts
 * the caret in the field, since the player is about to type; a finger does not, as that would
 * raise the keyboard before they asked for it.
 */
export function SidebarSearchToggle({ search: state, fieldId }: { search: SidebarSearchState; fieldId: string }) {
  const pointerType = useRef<string>('mouse');
  return (
    // The launcher icons' hint: the app's hover card at once, for a pointer that hovers.
    <HoverHintButton
      hint="Search"
      type="button"
      className={`panel-header-action drawer-search-toggle${state.open ? ' is-open' : ''}`}
      aria-label={SEARCH_LABEL}
      aria-expanded={state.open}
      aria-controls={state.open ? fieldId : undefined}
      onPointerDown={(event) => {
        pointerType.current = event.pointerType;
      }}
      onMouseDown={(event) => event.preventDefault()}
      onClick={() => {
        if (state.open) state.collapse();
        else state.expand(pointerType.current !== 'touch' && pointerType.current !== 'pen');
      }}
    >
      <LauncherIcon glyph="search" />
    </HoverHintButton>
  );
}

/**
 * The field. Keys typed into it stay in it: everything but Tab (which the app blurs) and Escape
 * stops at the field, so no game hotkey fires while typing. Escape clears and hides the field; with
 * the field hidden, Escape closes the sidebar as usual. Leaving it empty hides it too.
 */
function SidebarSearchField({
  search: state,
  fieldId,
  resultsId,
}: {
  search: SidebarSearchState;
  fieldId: string;
  resultsId: string;
}) {
  const { query, type, active, collapse, focusRequested, clearFocusRequest } = state;
  const inputRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (!focusRequested) return;
    inputRef.current?.focus();
    clearFocusRequest();
  }, [focusRequested, clearFocusRequest]);
  return (
    <div className="drawer-search">
      <SearchGlyph />
      <input
        ref={inputRef}
        id={fieldId}
        type="text"
        className="drawer-search__input"
        value={query}
        onChange={(event) => type(event.target.value)}
        onBlur={() => {
          if (query === '') collapse();
        }}
        onKeyDown={(event) => {
          if (event.key === 'Tab') return;
          if (event.key === 'Escape') {
            // Spent here: the sidebar's own Escape layer skips a press already handled.
            event.preventDefault();
            event.currentTarget.blur();
            collapse();
            return;
          }
          // The app's own shortcuts work over this field as over anything else: Ctrl+K's quick
          // search, Ctrl+R's restart, and the reload, help and zoom keys it keeps from the browser.
          if (isAppShortcut(event.nativeEvent)) return;
          // Commit, as in any text field: on a phone it also puts the keyboard away.
          if (event.key === 'Enter') event.currentTarget.blur();
          // Everything else typed stays in the field: no game hotkey fires while typing.
          event.stopPropagation();
        }}
        placeholder="Search settings and plugins"
        aria-label="Search settings and plugins"
        aria-controls={active ? resultsId : undefined}
        autoComplete="off"
        autoCorrect="off"
        autoCapitalize="off"
        spellCheck={false}
        enterKeyHint="search"
      />
      <button
        type="button"
        className="drawer-search__clear"
        aria-label="Close search"
        onMouseDown={(event) => event.preventDefault()}
        onClick={collapse}
      >
        <svg width="10" height="10" viewBox="0 0 12 12" fill="none" aria-hidden="true" focusable="false">
          <path d="M1 1L11 11M11 1L1 11" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
        </svg>
      </button>
    </div>
  );
}

/**
 * Under the header: the field while searching, and after a result took the player here, the way
 * back to those results. Renders nothing otherwise, so the header stays one row.
 */
export function SidebarSearchBar({
  search: state,
  fieldId,
  resultsId,
  className,
}: {
  search: SidebarSearchState;
  fieldId: string;
  resultsId: string;
  className?: string;
}) {
  const last = useLastSearch();
  const back = !state.active && last?.shownIn === state.panel ? last : null;
  if (!state.open && !back) return null;
  return (
    <div className={`drawer-search-bar${className ? ` ${className}` : ''}`}>
      {state.open && <SidebarSearchField search={state} fieldId={fieldId} resultsId={resultsId} />}
      {back && (
        <button
          type="button"
          className="drawer-search-back"
          onMouseDown={(event) => event.preventDefault()}
          onClick={state.restore}
        >
          <svg width="10" height="10" viewBox="0 0 10 10" fill="none" aria-hidden="true" focusable="false">
            <path
              d="M8.5 5h-7M4.5 2l-3 3 3 3"
              stroke="currentColor"
              strokeWidth="1.4"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
          <span>Results for “{back.query.trim()}”</span>
        </button>
      )}
    </div>
  );
}

// ---- Results ----------------------------------------------------------------------------------

function ResultText({ result }: { result: SearchResult }) {
  const { entry } = result;
  return (
    <>
      <HighlightedTitle result={result} />
      <span className="drawer-search-result__crumb">{entry.breadcrumb.join(' › ')}</span>
      {entry.description && <span className="drawer-search-result__description">{entry.description}</span>}
    </>
  );
}

function ResultRow({ result, onChoose }: { result: SearchResult; onChoose: (id: string) => void }) {
  return (
    <li className="drawer-search-result-item">
      <button
        type="button"
        className="drawer-search-result"
        onMouseDown={(event) => event.preventDefault()}
        onClick={() => onChoose(result.entry.id)}
      >
        <span className="drawer-search-result__text">
          <ResultText result={result} />
        </span>
        <ChevronGlyph />
      </button>
    </li>
  );
}

/** A match that cannot be shown now: information, with a route to the prerequisite when there is one. */
function UnavailableRow({
  result,
  unavailable,
  onChoose,
}: {
  result: SearchResult;
  unavailable: Unavailable;
  onChoose: (id: string) => void;
}) {
  return (
    <li className="drawer-search-result-item">
      <div className="drawer-search-result is-unavailable">
        <span className="drawer-search-result__text">
          <ResultText result={result} />
          <span className="drawer-search-result__reason">{unavailable.reason}</span>
          {unavailable.route && (
            <button
              type="button"
              className="drawer-search-result__route"
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => unavailable.route && onChoose(unavailable.route.target)}
            >
              {unavailable.route.label}
              <span aria-hidden="true"> →</span>
            </button>
          )}
        </span>
      </div>
    </li>
  );
}

/**
 * The results, covering the panel body while there is a query. Ranked across both sidebars, the
 * ones usable here first; below them, under "Available elsewhere", the ones that are not, each with
 * its reason. A query that matches nothing offers only credible near misses, or says so.
 */
export function SidebarSearchResults({
  search: state,
  id,
  layout,
}: {
  search: SidebarSearchState;
  id: string;
  /** The client layout now, for options only some layouts show. */
  layout: SearchLayout;
}) {
  const { query, showAll, expandAll, pendingScrollTop, clearPendingScroll, goTo } = state;
  const touchOnly = useIsTouchOnly();
  const context: SearchContext = { layout, touchOnly };
  const scrollerRef = useRef<HTMLElement>(null);
  // The layout ranks rows that apply here a little higher; it never hides one.
  const found = useMemo(() => search(query, SETTINGS_SEARCH_ENTRIES, { layout }), [query, layout]);
  const suggested = useMemo(
    () => (found.length === 0 ? credibleSuggestions(query, suggest(query, SETTINGS_SEARCH_ENTRIES)) : []),
    [found.length, query],
  );
  const matches = found.length > 0 ? found : suggested;

  // Read when the list renders: both drawers stay mounted, so their anchors are current.
  const rows = matches.map((result) => ({ result, unavailable: unavailability(result.entry, context) }));
  const { shownUsable, shownElsewhere, hidden } = partitionRows(rows, showAll);

  useLayoutEffect(() => {
    if (pendingScrollTop === null) return;
    if (scrollerRef.current) scrollerRef.current.scrollTop = pendingScrollTop;
    clearPendingScroll();
  }, [pendingScrollTop, clearPendingScroll]);

  const headingId = useId();
  const choose = (target: string) => goTo(target, scrollerRef.current?.scrollTop ?? 0);
  const trimmed = query.trim();

  return (
    <section ref={scrollerRef} id={id} className="drawer-search-results" aria-labelledby={headingId}>
      <h3 id={headingId} className="drawer-search-results__heading" aria-live="polite">
        {found.length > 0
          ? `${found.length} ${found.length === 1 ? 'match' : 'matches'} in Settings and Plugins`
          : suggested.length > 0
            ? 'Possible matches'
            : `No settings found for “${trimmed}”.`}
      </h3>
      {matches.length === 0 && (
        <p className="drawer-search-results__empty">
          Try a feature or effect, such as “health bar”, “bigger UI”, or “sound”.
        </p>
      )}
      {shownUsable.length > 0 && (
        <ul className="drawer-search-results__list">
          {shownUsable.map(({ result }) => (
            <ResultRow key={result.entry.id} result={result} onChoose={choose} />
          ))}
        </ul>
      )}
      {shownElsewhere.length > 0 && (
        <>
          <div className="drawer-search-results__divider">Available elsewhere</div>
          <ul className="drawer-search-results__list">
            {shownElsewhere.map(({ result, unavailable }) =>
              unavailable ? (
                <UnavailableRow key={result.entry.id} result={result} unavailable={unavailable} onChoose={choose} />
              ) : null,
            )}
          </ul>
        </>
      )}
      {hidden > 0 && (
        <button
          type="button"
          className="drawer-search-results__more"
          onMouseDown={(event) => event.preventDefault()}
          onClick={expandAll}
        >
          Show remaining {hidden} {hidden === 1 ? 'result' : 'results'}
        </button>
      )}
    </section>
  );
}

/** Stable ids per sidebar for the field and results' ARIA links. */
export function useSearchIds(): { fieldId: string; resultsId: string } {
  const base = useId().replace(/:/g, '');
  return { fieldId: `drawer-search-field-${base}`, resultsId: `drawer-search-results-${base}` };
}
