import type React from 'react';
import { useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import type { InventoryItemCategory } from '../data/inventoryItemCatalog';
import { getItemSpriteUrl } from '../services/ItemSpriteService';
import { loadSetting, saveSetting } from '../util/storage';
import { getGameViewportBounds, type ViewportBounds } from '../util/viewportBounds';
import './SlotPickerPopover.css';
import { LoadoutNoticeMark, verifiedItemNotes } from './LoadoutUnverifiedBadge';
import { PixelSprite } from './PixelSprite';
import { type LayerSprite, PixelSpriteLayer } from './PixelSpriteLayer';
import { PanelContentScaleProvider } from './panelContentScale';
import { InfoHint } from './ui/InfoHint';
import { sheet } from './ui/mobileSheet';
import { OsrsCheckbox } from './ui/OsrsCheckbox';

const ITEM_SPRITE_BOX = { maxWidth: 36, maxHeight: 32 } as const;
const INVENTORY_FILTERS = [
  { key: 'all', label: 'All' },
  { key: 'food', label: 'Food' },
  { key: 'potions', label: 'Potions' },
  { key: 'runes', label: 'Runes' },
  { key: 'gear', label: 'Gear' },
] as const;
const QUICK_SUPPLIES = [13441, 3144, 6685, 3024, 10925, 12695, 27641, 27281];

// Keep canvases out of the scrolling text layer: Blink otherwise drops its LCD text AA.
const ResultSprites: React.FC<{
  listRef: React.RefObject<HTMLDivElement | null>;
  items: readonly SlotPickerItem[];
}> = ({ listRef, items }) => {
  const [layout, setLayout] = useState<{ height: number; left: number; sprites: LayerSprite[] }>({
    height: 0,
    left: 0,
    sprites: [],
  });
  useLayoutEffect(() => {
    const list = listRef.current;
    if (!list) return;
    const measure = () => {
      const bounds = list.getBoundingClientRect();
      if (bounds.width === 0) return;
      const scale = bounds.width / list.offsetWidth;
      const icons = list.querySelectorAll<HTMLElement>('.slot-picker__icon');
      const first = icons[0]?.getBoundingClientRect();
      const sprites: LayerSprite[] = [];
      icons.forEach((icon, index) => {
        const item = items[index];
        if (!item) return;
        const box = icon.getBoundingClientRect();
        sprites.push({ src: getItemSpriteUrl(item.id), x: 2, y: (box.top - bounds.top) / scale + 2, w: 36, h: 32 });
      });
      setLayout({ height: list.clientHeight, left: first ? (first.left - bounds.left) / scale : 0, sprites });
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(list);
    list.addEventListener('scroll', measure);
    return () => {
      observer.disconnect();
      list.removeEventListener('scroll', measure);
    };
  }, [items, listRef]);
  return (
    <div className="slot-picker__sprites" aria-hidden="true" style={{ left: layout.left, height: layout.height }}>
      <PanelContentScaleProvider value={1}>
        <PixelSpriteLayer width={40} height={layout.height} sprites={layout.sprites} />
      </PanelContentScaleProvider>
    </div>
  );
};

/**
 * The catalogs run to ~5.2k pieces and the weapon slot alone holds 1,582, so the list
 * shows the first page of matches and says how many it is standing in front of. Typing
 * is the way through, not scrolling.
 */
const RESULT_LIMIT = 40;

/**
 * Persisted straight to storage rather than held in React or lifted to a prop: the popover
 * is keyed per slot, so it is torn down and remounted every time the player moves to another
 * cell. State that lived only in the component would forget the answer between one slot and
 * the next, and asking again on every cell is not an opt-in, it is a nag.
 */
const SHOW_UNVERIFIED_KEY = 'osrs-slot-picker-show-unverified';

/** Same clearance the in-game context menu keeps from the edge of the viewport. */
const VIEWPORT_PADDING = 4;

/** Gap between the slot and the surface it opens, small enough to read as attached. */
const ANCHOR_GAP = 4;

export type SlotPickerPlacement = 'below' | 'above';

export interface AnchorRect {
  readonly left: number;
  readonly top: number;
  readonly right: number;
  readonly bottom: number;
}

export interface AnchoredPosition {
  readonly left: number;
  readonly top: number;
  readonly placement: SlotPickerPlacement;
}

export interface SlotPickerItem {
  readonly id: number;
  readonly name: string;
  readonly category?: InventoryItemCategory;
  /** False for an item the simulator does not run correctly. Hidden unless the player asks. */
  readonly verified: boolean;
  /** What separates this from a same-named entry, e.g. "Charged", "Locked + Charged". */
  readonly version?: string;
  /**
   * The id this one is a variant of, per `itemAliases.json` — an ornament kit, a locked copy,
   * a recolor. Absent when the entry is its own canonical piece.
   */
  readonly canonicalId?: number;
}

/**
 * Wiki version labels meaning "the ordinary, working item". Charged, Active and similar are
 * left out: their uncharged or inactive sibling can share the bare name.
 */
const DEFAULT_VERSION_LABELS: ReadonlySet<string> = new Set([
  'normal',
  'undamaged',
  'restored',
  'repaired',
  'fixed',
  'unpoisoned',
]);

/**
 * One wearable item can hold several ids — cosmetic recolors, ornament kits, locked
 * variants — and the catalog carries an entry per id, so the weapon list answers "graceful"
 * with 24 identical hoods and "dizana" with five identical quivers.
 *
 * Two things collapse a family. `itemAliases.json` is the first and it is authoritative:
 * the combat code already resolves those ids to one piece through
 * `getCanonicalEquipmentItemId`, so offering both is the picker disagreeing with the rest
 * of the app about how many things exist. It runs first for a second reason — a recolor
 * that its row happens to name ("Dark bow", version "Blue") would otherwise be split back
 * apart by the version label below.
 *
 * What survives that is grouped by name, and a `version` is appended only where one is
 * needed to separate two entries that would otherwise read identically. Anything still
 * indistinguishable afterwards is one item as far as a player can tell.
 *
 * Both passes keep the id the slot already holds ahead of its canonical twin. The picker
 * reports an item it cannot find in its own list as unsupported, so dropping a worn variant
 * would make a perfectly valid loadout read as broken.
 */
export function distinguishCatalogItems(
  catalog: readonly SlotPickerItem[],
  currentItemId: number | undefined,
): readonly SlotPickerItem[] {
  /** Held first, then the piece the alias table points at, then the oldest id. */
  const rank = (item: SlotPickerItem, canonical: number): number =>
    item.id === currentItemId ? 0 : item.id === canonical ? 1 : 2;

  const byCanonical = new Map<number, SlotPickerItem>();
  for (const item of catalog) {
    const canonical = item.canonicalId ?? item.id;
    const standing = byCanonical.get(canonical);
    const better =
      standing === undefined ||
      rank(item, canonical) < rank(standing, canonical) ||
      (rank(item, canonical) === rank(standing, canonical) && item.id < standing.id);
    if (better) {
      byCanonical.set(canonical, item);
    }
  }

  const groups = new Map<string, SlotPickerItem[]>();
  for (const item of byCanonical.values()) {
    const key = item.name.toLowerCase();
    const group = groups.get(key);
    if (group === undefined) {
      groups.set(key, [item]);
    } else {
      group.push(item);
    }
  }

  const distinguished: SlotPickerItem[] = [];
  for (const group of groups.values()) {
    const [first] = group;
    if (first === undefined) {
      continue;
    }
    if (group.length === 1) {
      distinguished.push(first);
      continue;
    }
    const survivors = new Map<string, SlotPickerItem>();
    for (const item of group) {
      // A label that names the default says what the bare name already does. Labeling it
      // stands "Ahrim's robetop (Undamaged)" beside "Ahrim's robetop (Last Man Standing)", and
      // beside a bare-named copy it reads as though the bare one were the real item.
      const qualifier =
        item.version === undefined || DEFAULT_VERSION_LABELS.has(item.version.toLowerCase()) ? undefined : item.version;
      const suffix = qualifier === undefined ? '' : ` (${qualifier})`;
      // "Crystal helm (inactive)" carrying version "Inactive" must not become
      // "Crystal helm (inactive) (Inactive)".
      const alreadySaid = suffix !== '' && item.name.toLowerCase().endsWith(suffix.toLowerCase());
      const named = suffix === '' || alreadySaid ? item : { ...item, name: `${item.name}${suffix}` };
      const key = named.name.toLowerCase();
      const previous = survivors.get(key);
      const wins =
        previous === undefined ||
        named.id === currentItemId ||
        (previous.id !== currentItemId && named.id < previous.id);
      if (wins) {
        survivors.set(key, named);
      }
    }
    // The label only ever existed to separate this entry from a sibling. If the siblings
    // collapsed anyway, it now qualifies nothing, and "Decorative full helm (Normal)" is a
    // question the list cannot answer.
    const [sole] = survivors.values();
    if (survivors.size === 1 && sole !== undefined) {
      distinguished.push({ ...sole, name: first.name });
      continue;
    }
    distinguished.push(...survivors.values());
  }
  return distinguished;
}

/**
 * Flip decides, clamp only rescues — so the popover stays attached to its cell wherever the
 * panel has scrolled to.
 */
export function computeAnchoredPosition(
  anchor: AnchorRect,
  size: { readonly width: number; readonly height: number },
  bounds: ViewportBounds,
): AnchoredPosition {
  const below = anchor.bottom + ANCHOR_GAP;
  const above = anchor.top - ANCHOR_GAP - size.height;
  const fitsBelow = below + size.height + VIEWPORT_PADDING <= bounds.bottom;
  const fitsAbove = above >= bounds.top + VIEWPORT_PADDING;
  const placement: SlotPickerPlacement = fitsBelow || !fitsAbove ? 'below' : 'above';

  // Clamp low edge first, then high: a surface taller than the viewport sits at the top
  // rather than scrolled off it.
  const top = Math.max(
    bounds.top + VIEWPORT_PADDING,
    Math.min(placement === 'below' ? below : above, bounds.bottom - size.height - VIEWPORT_PADDING),
  );
  const left = Math.max(
    bounds.left + VIEWPORT_PADDING,
    Math.min(anchor.left, bounds.right - size.width - VIEWPORT_PADDING),
  );

  return { left, top, placement };
}

/** A selectable catalog result. Current contents and clearing live outside the list. */
interface SlotCandidate {
  readonly key: string;
  readonly name: string;
  readonly itemId: number;
  /** In the catalog, but the simulator does not run it correctly. Marked, still choosable. */
  readonly unverified?: boolean;
  /** A verified item's gray note, e.g. "Special attack unavailable." or "Always uses dragon darts." */
  readonly notes?: readonly string[];
}

export interface SlotPickerPopoverProps {
  /** The cell being edited. The surface is positioned against its box, not the cursor. */
  readonly anchor: HTMLElement | null;
  /** Visible heading and accessible dialog name. */
  readonly dialogLabel: string;
  readonly searchLabel: string;
  readonly listLabel: string;
  /** Reads inside "No supported ___ matches", e.g. "weapon gear", "inventory items". */
  readonly catalogNoun: string;
  readonly catalog: readonly SlotPickerItem[];
  /** Current contents, shown separately from the results. */
  readonly currentItemId: number | undefined;
  /** The gear slot silhouette, shown when empty. */
  readonly emptyIcon?: React.ReactNode;
  /**
   * The standing note about item effects, on by default. Off only for a catalog whose items
   * are never worn and so carry no effect to disclaim: the runes a pouch holds.
   */
  readonly showItemEffectsNote?: boolean;
  readonly onChoose: (itemId: number | undefined) => void;
  /** Put the slot down. `restoreFocus` is true when the keyboard asked, not the mouse. */
  readonly onDismiss: (restoreFocus: boolean) => void;
}

/**
 * It lives in a layer above the panel rather than in the panel's column: the loadout
 * column is height-capped and already scrolls, so a picker that stacked into it would
 * push the very diagram it edits out of view. The visible heading retains slot context
 * when the picker has to move above its anchor or clamp to a narrow viewport.
 *
 * It takes focus (the search field is the point), so unlike the in-game context menu it
 * closes deliberately rather than dissolving: a choice answers the question it was opened
 * to ask and hands the slot back to its cell, Escape hands the slot back unanswered, an
 * outside press just closes, and Tab stays inside.
 */
export const SlotPickerPopover: React.FC<SlotPickerPopoverProps> = ({
  anchor,
  dialogLabel,
  searchLabel,
  listLabel,
  catalogNoun,
  catalog,
  currentItemId,
  emptyIcon,
  showItemEffectsNote = true,
  onChoose,
  onDismiss,
}) => {
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState<InventoryItemCategory | 'all'>('all');
  /** The cursor the player moved it to, or null while it still sits where a fresh query put it. */
  const [manualActive, setManualActive] = useState<number | null>(null);
  const [showUnverified, setShowUnverified] = useState(() => loadSetting<boolean>(SHOW_UNVERIFIED_KEY) ?? false);
  const idPrefix = useId();
  const listId = `${idPrefix}-list`;
  const optionId = (index: number) => `${idPrefix}-option-${index}`;
  const rootRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const supportRef = useRef<HTMLSpanElement>(null);
  const unverifiedRef = useRef<HTMLDivElement>(null);
  const trimmed = query.trim().toLowerCase();
  const hasCategories = catalog.some((item) => item.category !== undefined);

  const distinguished = useMemo(() => distinguishCatalogItems(catalog, currentItemId), [catalog, currentItemId]);

  /**
   * Split out from the query so the walk over a 5.2k catalog happens when the switch moves,
   * not on every keystroke.
   */
  const offered = useMemo(
    () => (showUnverified ? distinguished : distinguished.filter((item) => item.verified)),
    [distinguished, showUnverified],
  );

  /**
   * Only the weapon and inventory catalogs hold anything unverified: every non-weapon piece
   * passes, and a weapon has to clear all of the checks in {@link isVerifiedEquipmentPiece}.
   */
  const hasUnverified = useMemo(() => distinguished.some((item) => !item.verified), [distinguished]);

  const matches = useMemo(() => {
    const filtered = offered.filter(
      (item) => (category === 'all' || item.category === category) && item.name.toLowerCase().includes(trimmed),
    );
    if (!hasCategories) return filtered;
    return filtered.sort((left, right) => {
      if (trimmed === '' && category === 'all') {
        const rank = (id: number) => {
          const index = QUICK_SUPPLIES.indexOf(id);
          return index === -1 ? QUICK_SUPPLIES.length : index;
        };
        const order = rank(left.id) - rank(right.id);
        if (order !== 0) return order;
      }
      if (left.category === 'potions' && right.category === 'potions') {
        const a = /^(.*)\((\d+)\)$/.exec(left.name);
        const b = /^(.*)\((\d+)\)$/.exec(right.name);
        if (a && b && a[1] === b[1]) return Number(b[2]) - Number(a[2]);
      }
      return left.name.localeCompare(right.name);
    });
  }, [category, hasCategories, offered, trimmed]);

  /**
   * Counted only when the query came up empty, because the note it feeds answers one question:
   * the game has a blade of saeldor, so why does this say there is no such thing. A full list
   * has already answered it.
   */
  const hiddenUnverified =
    showUnverified || trimmed === '' || matches.length > 0
      ? 0
      : distinguished.filter(
          (item) =>
            (category === 'all' || item.category === category) &&
            !item.verified &&
            item.name.toLowerCase().includes(trimmed),
        ).length;

  const shown = matches.slice(0, RESULT_LIMIT);
  // Resolved against the distinguished list, which is where the held id is guaranteed to have
  // survived its group — a lookup in the raw catalog would find it under its unlabeled name
  // and pin a row whose text disagrees with the identical-looking one in the list below.
  const held = currentItemId === undefined ? undefined : distinguished.find((item) => item.id === currentItemId);
  const heldNotes = held?.verified ? verifiedItemNotes(held.id) : undefined;
  // The keys matter while the query is being typed, when rows arrive and leave under a
  // focused row; a choice ends the surface, so it never re-orders one.
  const candidates: readonly SlotCandidate[] = shown.map((item) => ({
    key: `item-${item.id}`,
    name: item.name,
    itemId: item.id,
    unverified: !item.verified,
    // Looked up per shown row, never per catalog entry: at most RESULT_LIMIT lookups a query.
    notes: item.verified ? verifiedItemNotes(item.id) : undefined,
  }));

  /**
   * A fresh query puts it on the first match, so typing a name and pressing Enter is the whole
   * interaction; an empty query puts it nowhere, so a stray Enter cannot clear a slot the
   * player never chose to clear.
   */
  const activeIndex =
    manualActive === null
      ? trimmed !== '' && candidates.length > 0
        ? 0
        : -1
      : Math.min(manualActive, candidates.length - 1);

  // Mounted per slot (the popover is keyed by it), so opening a slot puts the cursor
  // where the next keystroke belongs.
  useEffect(() => {
    searchRef.current?.focus();
  }, []);

  // The cursor moves without focus, so the browser does not scroll the list to keep up; this
  // effect does.
  useEffect(() => {
    if (activeIndex === -1) {
      return;
    }
    const rows = listRef.current?.querySelectorAll<HTMLElement>('[role="option"]');
    rows?.[activeIndex]?.scrollIntoView?.({ block: 'nearest' });
  }, [activeIndex]);

  // The panel body scrolls under this layer and the window can resize while it is open,
  // so the surface re-reads its cell rather than trusting the box it opened against.
  // biome-ignore lint/correctness/useExhaustiveDependencies: the row count and the query are measured by this effect rather than read by it. Both change the surface's own height — the query by adding or removing the notes under the list, which can happen with the row count unchanged — and height decides whether it flips above the cell.
  useLayoutEffect(() => {
    const root = rootRef.current;
    if (!root || !anchor) {
      return;
    }
    const reposition = () => {
      const { left, top, placement } = computeAnchoredPosition(
        anchor.getBoundingClientRect(),
        { width: root.offsetWidth, height: root.offsetHeight },
        getGameViewportBounds(),
      );
      root.style.left = `${left}px`;
      root.style.top = `${top}px`;
      // The entrance grows out of the edge nearest the cell, so the surface reads as
      // coming from the slot rather than arriving over it.
      root.style.transformOrigin = placement === 'below' ? 'top left' : 'bottom left';
      root.dataset.placement = placement;
    };
    reposition();
    window.addEventListener('resize', reposition);
    window.addEventListener('scroll', reposition, true);
    return () => {
      window.removeEventListener('resize', reposition);
      window.removeEventListener('scroll', reposition, true);
    };
  }, [anchor, candidates.length, showUnverified, trimmed, category]);

  // A press outside closes without taking focus back: the press itself is going
  // somewhere, and yanking the caret out of it would be worse than losing the slot.
  // The cell keeps its own click, which is what toggles the slot back down.
  useEffect(() => {
    const onPointerDown = (event: MouseEvent) => {
      const target = event.target;
      if (!(target instanceof Node)) {
        return;
      }
      if (rootRef.current?.contains(target) || anchor?.contains(target)) {
        return;
      }
      onDismiss(false);
    };
    window.addEventListener('mousedown', onPointerDown);
    return () => window.removeEventListener('mousedown', onPointerDown);
  }, [anchor, onDismiss]);

  /** Move the cursor, not the focus. */
  const moveActive = (delta: 1 | -1) => {
    if (candidates.length === 0) {
      return;
    }
    setManualActive((current) => {
      const from = current ?? activeIndex;
      return from === -1
        ? delta === 1
          ? 0
          : candidates.length - 1
        : (from + delta + candidates.length) % candidates.length;
    });
  };

  /** The switch outlives the surface, so the answer is written down the moment it is given. */
  const rememberShowUnverified = (next: boolean) => {
    setShowUnverified(next);
    saveSetting(SHOW_UNVERIFIED_KEY, next);
  };

  /** Keep Tab inside the surface. Rows are arrows, so the stops are the search field and, where
   *  the catalog has anything to filter, the scope switch under the list. */
  const trapTab = (event: React.KeyboardEvent) => {
    const stops = Array.from(rootRef.current?.querySelectorAll<HTMLElement>('input, button') ?? []).filter(
      (element) => element.tabIndex >= 0 && !element.matches(':disabled'),
    );
    if (stops.length === 0) {
      return;
    }
    event.preventDefault();
    const current = stops.indexOf(document.activeElement as HTMLElement);
    const next = current === -1 ? 0 : (current + (event.shiftKey ? -1 : 1) + stops.length) % stops.length;
    stops[next]?.focus();
  };

  /** Take the option under the cursor. A row the catalog cannot name states, it does not offer. */
  const chooseActive = (event: React.KeyboardEvent) => {
    // Enter belongs to the list only while the caret is in the search field. The switch under
    // the list is a tab stop of its own, and letting its Enter through here would pick a row
    // instead of flipping it.
    if (event.target !== searchRef.current) {
      return;
    }
    const candidate = activeIndex === -1 ? undefined : candidates[activeIndex];
    if (candidate === undefined) {
      return;
    }
    event.preventDefault();
    onChoose(candidate.itemId);
    onDismiss(true);
  };

  const onKeyDown = (event: React.KeyboardEvent) => {
    if (event.key === 'Escape') {
      event.preventDefault();
      onDismiss(true);
    } else if (event.key === 'Tab') {
      trapTab(event);
    } else if (event.key === 'ArrowDown') {
      event.preventDefault();
      moveActive(1);
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      moveActive(-1);
    } else if (event.key === 'Enter') {
      chooseActive(event);
    }
  };

  return createPortal(
    <div
      ref={rootRef}
      className="slot-picker"
      {...sheet.popover}
      role="dialog"
      aria-label={dialogLabel}
      onKeyDown={onKeyDown}
    >
      <div className="slot-picker__heading">
        <span>{dialogLabel}</span>
        <button
          type="button"
          className="slot-picker__close"
          aria-label="Close item picker"
          onClick={() => onDismiss(true)}
        >
          <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true">
            <path d="M2 2L10 10M10 2L2 10" fill="none" stroke="currentColor" strokeWidth="1.5" />
          </svg>
        </button>
      </div>
      <fieldset className="slot-picker__current" aria-label="Current item">
        <span className="slot-picker__current-icon" aria-hidden="true">
          {currentItemId === undefined ? (
            emptyIcon
          ) : (
            <PixelSprite src={getItemSpriteUrl(currentItemId)} alt="" style={ITEM_SPRITE_BOX} />
          )}
        </span>
        <span className="slot-picker__current-name">
          <span className="slot-picker__current-label">Current{held?.verified === false ? ' / Unverified' : ''}</span>
          {currentItemId === undefined ? 'Empty' : (held?.name ?? 'Unsupported item')}
          {heldNotes && (
            <span className="slot-picker__item-note">
              <LoadoutNoticeMark notice="note" />
              {heldNotes.join(' ')}
            </span>
          )}
        </span>
        <button
          type="button"
          className="slot-picker__clear"
          aria-label="Clear slot"
          disabled={currentItemId === undefined}
          onClick={() => {
            onChoose(undefined);
            onDismiss(true);
          }}
        >
          Clear
        </button>
      </fieldset>
      <input
        ref={searchRef}
        className="slot-picker__search"
        type="text"
        value={query}
        placeholder={
          hasCategories ? (category === 'all' ? 'Search all inventory items' : `Search ${category}`) : 'Search items'
        }
        autoComplete="off"
        spellCheck={false}
        aria-label={searchLabel}
        // The caret never leaves this field: up and down move a cursor through the list
        // without taking the focus, so left, right and every other key stay text editing and
        // the query can be corrected mid-search without ever leaving the list behind.
        role="combobox"
        aria-expanded
        aria-controls={listId}
        aria-autocomplete="list"
        aria-activedescendant={activeIndex === -1 ? undefined : optionId(activeIndex)}
        onChange={(event) => {
          setQuery(event.currentTarget.value);
          setManualActive(null);
        }}
      />

      {hasCategories && (
        <fieldset className="slot-picker__filters" aria-label="Item categories">
          {INVENTORY_FILTERS.map((filter) => (
            <button
              key={filter.key}
              type="button"
              aria-pressed={category === filter.key}
              onClick={() => {
                setCategory(filter.key);
                setManualActive(null);
              }}
            >
              {filter.label}
            </button>
          ))}
        </fieldset>
      )}

      <div className="slot-picker__results">
        <div className="slot-picker__list" role="listbox" aria-label={listLabel} id={listId} ref={listRef}>
          {candidates.map((candidate, index) => {
            const isSelected = candidate.itemId === currentItemId;
            const isActive = index === activeIndex;
            return (
              <button
                key={candidate.key}
                id={optionId(index)}
                type="button"
                role="option"
                tabIndex={-1}
                aria-selected={isSelected}
                className={`slot-picker__option${isSelected ? ' slot-picker__option--selected' : ''}${
                  isActive ? ' slot-picker__option--active' : ''
                }`}
                onClick={() => {
                  onChoose(candidate.itemId);
                  onDismiss(true);
                }}
              >
                <span className="slot-picker__icon" aria-hidden="true" />
                {/* The mark rides inside the name rather than beside it: a third column would
                  squeeze names that already wrap at this width. */}
                <span className="slot-picker__name">
                  {candidate.name}
                  {candidate.unverified && <span className="slot-picker__unverified">Unverified</span>}
                  {candidate.notes && (
                    <span className="slot-picker__item-note">
                      <LoadoutNoticeMark notice="note" />
                      {candidate.notes.join(' ')}
                    </span>
                  )}
                </span>
              </button>
            );
          })}
        </div>
        <ResultSprites listRef={listRef} items={shown} />
      </div>

      <div className="slot-picker__notes">
        {shown.length === 0 && (
          <p className="slot-picker__note">{`No supported ${catalogNoun} matches "${query.trim()}".`}</p>
        )}
        {hiddenUnverified > 0 && (
          <p className="slot-picker__note">
            {`${hiddenUnverified} unverified ${hiddenUnverified === 1 ? 'match' : 'matches'} hidden.`}
          </p>
        )}
        {matches.length > shown.length && (
          <p className="slot-picker__note">{`${shown.length} of ${matches.length.toLocaleString()} shown. Type to narrow.`}</p>
        )}
      </div>
      {/* Everything above the footer answers the current query and comes and goes with it;
          nothing here does, which is why the divider sits where it does. It is left out
          entirely when both halves are, so the divider never rules off an empty box. */}
      {(hasUnverified || showItemEffectsNote) && (
        <div className="slot-picker__footer">
          {hasUnverified && (
            <div className="slot-picker__scope info-hint-region" ref={unverifiedRef}>
              <OsrsCheckbox checked={showUnverified} onChange={rememberShowUnverified} label="Show unverified items" />
              <InfoHint
                label="Show unverified items"
                hoverRegionRef={unverifiedRef}
                placement="above"
                cardClassName="slot-picker-support-card"
                text="Unverified items are not fully implemented. We have not checked them end to end, so their animations, sounds, projectiles or special attacks may be missing or wrong."
              />
            </div>
          )}
          {/* Verification is a claim about combat, and only about combat. The line has to give back
              as much as it takes away: stats come from the catalog for every piece AND the combat
              engine implements the armour set effects players actually build around (Void,
              Dharok's, Verac's, Justiciar, Obsidian, Karil's, black mask, crystal), so saying only
              "simulated for stats" reads as though a Void set does nothing. What is genuinely
              missing is the one-off per-item effect, which is hand-written code that may not exist
              yet.

              It stays a blanket statement rather than a per-row tag because nothing in the catalog
              or the cache says which items carry an effect, only which ones we implement. A tag
              would quietly promise that every untagged item has none. */}
          {showItemEffectsNote && (
            <span className="slot-picker__support info-hint-region" ref={supportRef}>
              Item support
              <InfoHint
                label="Item support"
                hoverRegionRef={supportRef}
                placement="above"
                cardClassName="slot-picker-support-card"
                text="Stats and most set effects are simulated. Many item effects are not."
              />
            </span>
          )}
        </div>
      )}
    </div>,
    document.body,
  );
};
