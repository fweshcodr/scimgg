// @vitest-environment happy-dom

import { fireEvent, render, screen, within } from '@testing-library/react';
import type { ComponentProps } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { getGearCatalog } from '../../data/customEquipmentPresets';
import { getInventoryCatalog } from '../../data/inventoryItemCatalog';
import { computeAnchoredPosition, distinguishCatalogItems, SlotPickerPopover } from '../SlotPickerPopover';

const TOXIC_BLOWPIPE = 12926;
/** Mapped to the `bow` category, so the picker offers it by default. */
const WEAPONS = getGearCatalog('weapon');
/** No entry in ITEM_WEAPON_CATEGORY, so the simulator would swing it as unarmed. */
const BLADE_OF_SAELDOR = 'Blade of Saeldor';

const BOUNDS = { left: 0, top: 0, right: 1000, bottom: 600 };
const SIZE = { width: 244, height: 200 };

/** The 44x44 diagram cell the picker is opened from. */
const CELL = { left: 100, top: 100, right: 144, bottom: 144 };

const anchors: HTMLElement[] = [];

function anchorAt(rect: { left: number; top: number; right: number; bottom: number }): HTMLElement {
  const element = document.createElement('button');
  element.type = 'button';
  element.textContent = 'Weapon';
  document.body.appendChild(element);
  anchors.push(element);
  element.getBoundingClientRect = () =>
    ({
      ...rect,
      width: rect.right - rect.left,
      height: rect.bottom - rect.top,
      x: rect.left,
      y: rect.top,
      toJSON: () => ({}),
    }) as DOMRect;
  return element;
}

function popover(
  anchor: HTMLElement,
  overrides: Partial<ComponentProps<typeof SlotPickerPopover>> = {},
): ComponentProps<typeof SlotPickerPopover> {
  return {
    anchor,
    dialogLabel: 'Edit weapon slot',
    searchLabel: 'Search supported weapon gear',
    listLabel: 'Weapon gear',
    catalogNoun: 'weapon gear',
    catalog: WEAPONS,
    currentItemId: undefined,
    onChoose: vi.fn(),
    onDismiss: vi.fn(),
    ...overrides,
  };
}

function renderPopover(overrides: Partial<ComponentProps<typeof SlotPickerPopover>> = {}) {
  const anchor = anchorAt(CELL);
  const props = popover(anchor, overrides);
  const view = render(<SlotPickerPopover {...props} />);
  return { anchor, props, ...view };
}

function surface(): HTMLElement {
  const element = document.querySelector<HTMLElement>('.slot-picker');
  if (!element) {
    throw new Error('picker surface not found');
  }
  return element;
}

function search(): HTMLElement {
  return screen.getByRole('combobox', { name: 'Search supported weapon gear' });
}

afterEach(() => {
  for (const anchor of anchors.splice(0)) {
    anchor.remove();
  }
  // The scope switch persists to localStorage, which outlives a test. Restored here rather
  // than reset in a beforeEach: per-file isolation would hide the leak until two suites
  // shared a worker, and then it would surface as an order-dependent failure elsewhere.
  localStorage.clear();
});

describe('computeAnchoredPosition', () => {
  it('opens directly under the cell, left edges aligned', () => {
    expect(computeAnchoredPosition(CELL, SIZE, BOUNDS)).toEqual({ left: 100, top: 148, placement: 'below' });
  });

  it('flips above the cell when there is no room below', () => {
    const low = { left: 100, top: 376, right: 144, bottom: 420 };

    expect(computeAnchoredPosition(low, SIZE, BOUNDS)).toEqual({ left: 100, top: 172, placement: 'above' });
  });

  it('clamps inside the visible game area rather than hanging off the edge', () => {
    const farRight = { left: 900, top: 100, right: 944, bottom: 144 };

    expect(computeAnchoredPosition(farRight, SIZE, BOUNDS).left).toBe(752);
  });

  it('sits at the top when it fits neither above nor below', () => {
    const squeezed = { left: 0, top: 0, right: 1000, bottom: 300 };
    const tall = { width: 244, height: 400 };

    expect(computeAnchoredPosition({ left: 100, top: 120, right: 144, bottom: 164 }, tall, squeezed)).toEqual({
      left: 100,
      top: 4,
      placement: 'below',
    });
  });
});

describe('SlotPickerPopover', () => {
  it('opens inventory browsing on supplies rather than alphabetic equipment', () => {
    renderPopover({ catalog: getInventoryCatalog() });
    expect(within(screen.getByRole('listbox')).getAllByRole('option')[0]).toHaveTextContent('Anglerfish');
    fireEvent.click(screen.getByRole('button', { name: 'Gear' }));
    fireEvent.change(search(), { target: { value: 'toxic blowpipe' } });
    expect(screen.getByRole('option', { name: /^Toxic blowpipe/ })).toBeInTheDocument();
  });

  it('shows full doses first without removing lower doses from search', () => {
    renderPopover({ catalog: getInventoryCatalog() });
    fireEvent.change(search(), { target: { value: 'super restore' } });
    expect(
      within(screen.getByRole('listbox'))
        .getAllByRole('option')
        .map((row) => row.textContent),
    ).toEqual(['Super restore(4)', 'Super restore(3)', 'Super restore(2)', 'Super restore(1)']);
  });

  it('does not claim hidden gear matches inside a food search', () => {
    renderPopover({ catalog: getInventoryCatalog() });
    fireEvent.click(screen.getByRole('button', { name: 'Food' }));
    fireEvent.change(search(), { target: { value: BLADE_OF_SAELDOR } });
    expect(screen.queryAllByRole('option')).toHaveLength(0);
    expect(screen.queryByText(/unverified matches hidden/)).toBeNull();
  });

  it('keeps clearing separate from search results', () => {
    const { props } = renderPopover({ currentItemId: TOXIC_BLOWPIPE });
    fireEvent.change(search(), { target: { value: 'no such item' } });
    expect(screen.queryAllByRole('option')).toHaveLength(0);
    fireEvent.click(screen.getByRole('button', { name: 'Clear slot' }));
    expect(props.onChoose).toHaveBeenCalledWith(undefined);
  });

  it('paints result sprites outside the scrolling text layer', () => {
    renderPopover();
    expect(screen.getByRole('listbox').querySelector('canvas')).toBeNull();
    expect(surface().querySelectorAll('.slot-picker__sprites canvas')).toHaveLength(1);
  });
  it('opens on the cell it edits, in a layer of its own', () => {
    renderPopover();

    // Anchored to the cell's box, not to the cursor and not to the end of a column.
    expect(surface().style.left).toBe('100px');
    expect(surface().style.top).toBe('148px');
    expect(surface().parentElement).toBe(document.body);
  });

  it('follows its cell when the panel underneath scrolls', () => {
    const { anchor } = renderPopover();

    anchor.getBoundingClientRect = () =>
      ({
        left: 100,
        top: 40,
        right: 144,
        bottom: 84,
        width: 44,
        height: 44,
        x: 100,
        y: 40,
        toJSON: () => ({}),
      }) as DOMRect;
    fireEvent.scroll(window);

    expect(surface().style.top).toBe('88px');
  });

  it('puts the cursor where the next keystroke belongs', () => {
    renderPopover();

    expect(document.activeElement).toBe(search());
  });

  it('names the slot visibly as well as for assistive technology', () => {
    renderPopover();

    expect(screen.getByRole('dialog', { name: 'Edit weapon slot' })).toBeInTheDocument();
    expect(surface().querySelector('.slot-picker__heading')).toHaveTextContent('Edit weapon slot');
  });

  it('opens with what the slot holds pinned, named, and marked', () => {
    const { container } = renderPopover({ currentItemId: TOXIC_BLOWPIPE });

    const held = screen.getByRole('group', { name: 'Current item' });
    expect(held).toHaveTextContent('Toxic blowpipe');
    expect(within(held).getByRole('button', { name: 'Clear slot' })).toBeEnabled();
    // The same sprite the diagram draws, so the row is recognized before it is read.
    expect(container.ownerDocument.querySelector(`canvas[data-src*="${TOXIC_BLOWPIPE}"]`)).not.toBeNull();
  });

  it('stands in front of a catalog too large to scroll, and says so', () => {
    renderPopover();
    // Only the unverified catalog is large; the verified weapons fit on screen.
    fireEvent.click(screen.getByRole('checkbox', { name: 'Show unverified items' }));

    expect(within(screen.getByRole('listbox')).getAllByRole('option').length).toBeLessThan(50);
    expect(screen.getByText(/shown\. Type to narrow\./)).toBeInTheDocument();
  });

  it('filters the catalog by name', () => {
    renderPopover();

    fireEvent.change(search(), { target: { value: 'toxic blowpipe' } });

    const list = screen.getByRole('listbox');
    expect(within(list).getByRole('option', { name: /^Toxic blowpipe/ })).toBeInTheDocument();
    expect(within(list).queryByRole('option', { name: 'Abyssal whip' })).toBeNull();
  });

  it('offers a set of same-named ids once, rather than once per id', () => {
    // One item that happens to hold five ids must not read as five identical rows when
    // searching "dizana".
    const catalog = [
      { id: 28828, name: "Blessed Dizana's quiver", verified: true },
      { id: 28955, name: "Blessed Dizana's quiver", verified: true },
      { id: 28957, name: "Blessed Dizana's quiver", verified: true },
      { id: 33528, name: "Blessed Dizana's quiver", verified: true },
      { id: 33530, name: "Blessed Dizana's quiver", verified: true },
    ];
    renderPopover({ catalog });

    fireEvent.change(search(), { target: { value: 'dizana' } });

    const rows = within(screen.getByRole('listbox')).getAllByRole('option', { name: /Dizana/ });
    expect(rows).toHaveLength(1);
  });

  it('tells same-named variants apart by the version that separates them', () => {
    const catalog = [
      { id: 552, name: 'Ghostspeak amulet', verified: true, version: 'Normal' },
      { id: 4250, name: 'Ghostspeak amulet', verified: true, version: 'Enchanted' },
    ];
    renderPopover({ catalog });

    fireEvent.change(search(), { target: { value: 'ghostspeak' } });

    // Both are offered, because they are genuinely different pieces — but neither is now
    // an unexplained repeat of the other. The plain one keeps the bare name: "Normal" is what
    // that name already means.
    const list = screen.getByRole('listbox');
    expect(within(list).getByRole('option', { name: 'Ghostspeak amulet' })).toBeInTheDocument();
    expect(within(list).getByRole('option', { name: 'Ghostspeak amulet (Enchanted)' })).toBeInTheDocument();
  });

  it('keeps the id the slot already holds as the row that survives the collapse', () => {
    // Collapsing to the lowest id would leave a worn piece unrepresented in its own list,
    // and the picker would then report it as an unsupported item.
    const catalog = [
      { id: 11850, name: 'Graceful hood', verified: true },
      { id: 13579, name: 'Graceful hood', verified: true },
    ];
    renderPopover({ catalog, currentItemId: 13579 });

    const held = screen.getByRole('option', { name: 'Graceful hood' });
    expect(held).toHaveAttribute('aria-selected', 'true');
    expect(screen.queryByRole('option', { name: 'Unsupported item' })).toBeNull();
  });

  it('answers a real search with one row per thing a player can tell apart', () => {
    // The cape slot carries five ids for one blessed quiver and five for one max cape, so
    // without merging "dizana" would answer with ten rows nothing on screen separates.
    const capes = getGearCatalog('cape');
    const raw = capes.filter((item) => /dizana/i.test(item.name));
    const shown = distinguishCatalogItems(capes, undefined).filter((item) => /dizana/i.test(item.name));

    expect(shown.length).toBeLessThan(raw.length);
    expect(new Set(shown.map((item) => item.name)).size).toBe(shown.length);
  });

  it('offers an ornament or locked variant once, under the name of the piece it is', () => {
    // itemAliases.json already declares these one item, and the combat code reads that table
    // through getCanonicalEquipmentItemId. Offering both is the picker disagreeing with the
    // rest of the app about how many things exist.
    const amulets = distinguishCatalogItems(getGearCatalog('amulet'), undefined).map((item) => item.name);

    expect(amulets).toContain('Amulet of fury');
    expect(amulets).not.toContain('Amulet of fury (or)');
    expect(amulets).not.toContain('Occult necklace (or)');
  });

  it('does not split a cosmetic recolor apart just because the row names a version', () => {
    // The version label earns its place only where it separates two real pieces. Coloring a
    // dark bow does not make a second bow, and the alias table says so — this is the case the
    // version pass would re-split if it ran before the alias pass.
    const bows = distinguishCatalogItems(getGearCatalog('weapon'), undefined)
      .map((item) => item.name)
      .filter((name) => name.startsWith('Dark bow'));

    expect(bows).toContain('Dark bow');
    expect(bows.filter((name) => /\((?:Blue|Green|Yellow|White)\)$/.test(name))).toEqual([]);
  });

  it('keeps an imbued piece apart from the plain one it was made from', () => {
    // The one collapse that would cost real stats: imbued rings are a different piece, and
    // no alias points one at its unimbued base.
    const rings = distinguishCatalogItems(getGearCatalog('ring'), undefined).map((item) => item.name);

    expect(rings).toContain('Seers ring');
    // 11770; the Last Man Standing copy beside it is labeled, not left as the bare imbued ring.
    expect(rings).toContain('Seers ring (i) (Nightmare Zone)');
    expect(rings).toContain('Seers ring (i) (Last Man Standing)');
  });

  it('keeps a variant that only its version separates, rather than collapsing it away', () => {
    // Real catalog data, so this fails the moment `version` stops being carried through from
    // the equipment row — at which point these two become indistinguishable and one of a pair
    // of genuinely different capes silently stops being offered at all. No alias joins them,
    // so the version label is the only thing standing between them.
    const shown = distinguishCatalogItems(getGearCatalog('cape'), undefined);
    const deadman = shown.filter((item) => item.name.startsWith("Deadman's cape")).map((item) => item.name);

    expect(deadman.sort()).toEqual(["Deadman's cape (Cosmetic)", "Deadman's cape (Deadman Mode)"]);
  });

  it('gives the working item the bare name and labels the Last Man Standing copy', () => {
    // Real catalog data. The wiki's version for the working piece ("Undamaged", "Restored") is
    // what the bare name already means; the mode copy is labeled from its own page title, so
    // it does not read as the plain item.
    const name = (slot: Parameters<typeof getGearCatalog>[0], id: number) =>
      distinguishCatalogItems(getGearCatalog(slot), undefined).find((item) => item.id === id)?.name;
    /** The bare name and any parenthesized label on it; "Dharok's helm 100" is another item. */
    const labelled = (slot: Parameters<typeof getGearCatalog>[0], bare: string) =>
      distinguishCatalogItems(getGearCatalog(slot), undefined)
        .map((item) => item.name)
        .filter((shown) => shown === bare || shown.startsWith(`${bare} (`));

    expect(name('body', 4712)).toBe("Ahrim's robetop");
    expect(name('body', 20598)).toBe("Ahrim's robetop (Last Man Standing)");
    expect(name('weapon', 26219)).toBe("Osmumten's fang");
    expect(name('weapon', 33174)).toBe("Osmumten's fang (Last Man Standing)");
    // These LMS copies alias to the working piece, so each is offered once, under its own name.
    expect(labelled('head', "Dharok's helm")).toEqual(["Dharok's helm"]);
    expect(name('head', 4716)).toBe("Dharok's helm");
    expect(labelled('legs', 'Torva platelegs')).toEqual(['Torva platelegs']);
    expect(name('legs', 26386)).toBe('Torva platelegs');
  });

  it('drops a version label that ends up qualifying nothing', () => {
    // Its siblings collapsed, so the label separates the entry from nothing and only raises a
    // question the list cannot answer.
    const shown = distinguishCatalogItems(getGearCatalog('head'), undefined).map((item) => item.name);

    expect(shown).toContain('Decorative full helm');
    expect(shown.filter((name) => /\(Normal\)$/.test(name))).toEqual([]);
    expect(shown.filter((name) => /\(inactive\) \(Inactive\)$/i.test(name))).toEqual([]);
  });

  it('names what it could not find, and still offers the way back to empty', () => {
    renderPopover();

    fireEvent.change(search(), { target: { value: 'zzzz' } });

    expect(screen.getByText('No supported weapon gear matches "zzzz".')).toBeInTheDocument();
    expect(within(screen.getByRole('listbox')).queryAllByRole('option')).toHaveLength(0);
    expect(screen.getByRole('button', { name: 'Clear slot' })).toBeDisabled();
  });

  it('clears the slot back to empty, and closes on the answer', () => {
    const onChoose = vi.fn();
    const onDismiss = vi.fn();
    renderPopover({ currentItemId: TOXIC_BLOWPIPE, onChoose, onDismiss });

    fireEvent.click(screen.getByRole('button', { name: 'Clear slot' }));

    expect(onChoose).toHaveBeenCalledWith(undefined);
    // A choice is the whole question, so the surface goes and the cell takes its focus back.
    expect(onDismiss).toHaveBeenCalledWith(true);
  });

  it('closes on the item it was opened to pick', () => {
    const onChoose = vi.fn();
    const onDismiss = vi.fn();
    renderPopover({ onChoose, onDismiss });

    fireEvent.change(search(), { target: { value: 'toxic blowpipe' } });
    fireEvent.click(screen.getByRole('option', { name: /^Toxic blowpipe/ }));

    expect(onChoose).toHaveBeenCalledWith(TOXIC_BLOWPIPE);
    expect(onDismiss).toHaveBeenCalledWith(true);
  });

  it('shows an empty current state when the slot is empty', () => {
    renderPopover();

    expect(screen.getByRole('group', { name: 'Current item' })).toHaveTextContent('Empty');
  });

  it('still names an item the catalog cannot list, and does not offer it as a choice', () => {
    const onChoose = vi.fn();
    const onDismiss = vi.fn();
    renderPopover({ currentItemId: 999999, onDismiss, onChoose });

    const held = screen.getByRole('group', { name: 'Current item' });
    expect(held).toHaveTextContent('Unsupported item');

    // The row states the loadout; it does not offer it. So it neither chooses nor closes.
    fireEvent.click(held);
    expect(onChoose).not.toHaveBeenCalled();
    expect(onDismiss).not.toHaveBeenCalled();
  });

  it('walks the results with a cursor, never with the caret', () => {
    renderPopover();

    fireEvent.keyDown(search(), { key: 'ArrowDown' });

    // Up and down move a cursor through the list. The focus stays in the field, so left and
    // right and every other key remain text editing for as long as the surface is open.
    const first = screen.getAllByRole('option')[0];
    expect(document.activeElement).toBe(search());
    expect(search()).toHaveAttribute('aria-activedescendant', first.id);
    expect(first).toHaveClass('slot-picker__option--active');

    fireEvent.keyDown(search(), { key: 'ArrowUp' });
    expect(search()).toHaveAttribute('aria-activedescendant', screen.getAllByRole('option').at(-1)?.id);
  });

  it('puts the cursor on the first match of a query, so a name and Enter is the whole job', () => {
    const onChoose = vi.fn();
    const onDismiss = vi.fn();
    renderPopover({ onChoose, onDismiss });

    // Nothing is under the cursor until there is a query: a stray Enter must not be able to
    // clear a slot the player never chose to clear.
    expect(search()).not.toHaveAttribute('aria-activedescendant');
    fireEvent.keyDown(search(), { key: 'Enter' });
    expect(onChoose).not.toHaveBeenCalled();

    fireEvent.change(search(), { target: { value: 'toxic blowpipe' } });
    const [first] = screen.getAllByRole('option');
    expect(first).toHaveClass('slot-picker__option--active');
    expect(search()).toHaveAttribute('aria-activedescendant', first?.id);

    fireEvent.keyDown(search(), { key: 'Enter' });

    expect(onChoose).toHaveBeenCalledWith(expect.any(Number));
    expect(onDismiss).toHaveBeenCalledWith(true);
  });

  it('keeps Tab inside: it cycles the surface rather than leaving it', () => {
    renderPopover();
    // The weapon catalog carries unverified gear, so the scope switch is rendered and joins
    // the search field in the ring. Tab moves between them; it never escapes the surface.
    fireEvent.keyDown(search(), { key: 'Tab' });

    expect(surface().contains(document.activeElement)).toBe(true);
    expect(document.activeElement).toBe(screen.getByRole('checkbox', { name: 'Show unverified items' }));
    fireEvent.keyDown(screen.getByRole('checkbox', { name: 'Show unverified items' }), { key: 'Tab' });
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'About Show unverified items' }));
  });

  it('closes on Escape and asks for the cell back', () => {
    const onDismiss = vi.fn();
    renderPopover({ onDismiss });

    fireEvent.keyDown(search(), { key: 'Escape' });

    expect(onDismiss).toHaveBeenCalledWith(true);
  });

  it('closes on a press outside, and leaves that press its focus', () => {
    const onDismiss = vi.fn();
    renderPopover({ onDismiss });

    fireEvent.mouseDown(document.body);

    expect(onDismiss).toHaveBeenCalledWith(false);
  });

  it('ignores presses on itself and on the cell it belongs to', () => {
    const onDismiss = vi.fn();
    const { anchor } = renderPopover({ onDismiss });

    fireEvent.mouseDown(surface());
    // The cell owns the second click that puts the slot back down; closing here would
    // race it and reopen the picker.
    fireEvent.mouseDown(anchor);

    expect(onDismiss).not.toHaveBeenCalled();
  });
});

/**
 * The picker offers only gear the simulator runs correctly, because the alternative is
 * silent: an unmapped weapon does not refuse to equip, it turns the player's attack styles
 * into Punch / Kick / Block. Everything past the switch is opt-in and marked.
 */
describe('SlotPickerPopover scope', () => {
  const scopeSwitch = () => screen.getByRole('checkbox', { name: 'Show unverified items' });

  const optionNames = () =>
    within(screen.getByRole('listbox'))
      .queryAllByRole('option')
      .map((option) => option.textContent ?? '');

  it('offers verified gear and holds the rest back', () => {
    renderPopover();

    fireEvent.change(search(), { target: { value: 'blowpipe' } });
    expect(optionNames().some((name) => name.includes('Toxic blowpipe'))).toBe(true);

    fireEvent.change(search(), { target: { value: BLADE_OF_SAELDOR } });
    expect(optionNames().some((name) => name.includes(BLADE_OF_SAELDOR))).toBe(false);
  });

  it('reveals unverified items without adding a standing warning', () => {
    renderPopover();
    expect(screen.queryByText(/not fully implemented/)).toBeNull();

    fireEvent.click(scopeSwitch());

    expect(screen.queryByText(/not fully implemented/)).toBeNull();
    fireEvent.change(search(), { target: { value: BLADE_OF_SAELDOR } });
    expect(optionNames().some((name) => name.includes(BLADE_OF_SAELDOR))).toBe(true);
  });

  it('explains unverified items on demand before the switch is enabled', async () => {
    renderPopover();
    fireEvent.focus(screen.getByRole('button', { name: 'About Show unverified items' }));
    const hint = await screen.findByRole('tooltip');
    expect(hint).toHaveTextContent(/Unverified items are not fully implemented/);
    expect(hint).toHaveTextContent(/animations, sounds, projectiles or special attacks/);
    expect(hint).toHaveClass('slot-picker-support-card');
    expect(scopeSwitch()).toHaveAttribute('aria-checked', 'false');
  });

  it('marks the individual rows it is unsure of, not just the list', () => {
    renderPopover();
    fireEvent.click(scopeSwitch());

    fireEvent.change(search(), { target: { value: BLADE_OF_SAELDOR } });
    const blade = within(screen.getByRole('listbox'))
      .getAllByRole('option')
      .find((option) => option.textContent?.includes(BLADE_OF_SAELDOR));
    expect(blade).toHaveTextContent('Unverified');

    fireEvent.change(search(), { target: { value: 'Toxic blowpipe' } });
    const blowpipe = within(screen.getByRole('listbox')).getByRole('option', { name: /^Toxic blowpipe(?! \(empty\))/ });
    expect(blowpipe).not.toHaveTextContent('Unverified');
  });

  it('offers a verified weapon with a known limitation by default, with its gray note', () => {
    renderPopover();

    fireEvent.change(search(), { target: { value: 'Eclipse atlatl' } });
    const atlatl = within(screen.getByRole('listbox')).getByRole('option', { name: /^Eclipse atlatl/ });
    expect(atlatl.querySelector('.slot-picker__item-note')).toHaveTextContent('Special attack unavailable.');
    expect(atlatl.querySelector('.loadout-slot-note')).not.toBeNull();
    expect(atlatl.querySelector('.loadout-slot-unverified')).toBeNull();
    expect(atlatl).not.toHaveTextContent('Unverified');

    fireEvent.change(search(), { target: { value: 'Sarachnis cudgel' } });
    const cudgel = within(screen.getByRole('listbox')).getByRole('option', { name: 'Sarachnis cudgel' });
    expect(cudgel.querySelector('.slot-picker__item-note')).toBeNull();
  });

  it('notes that both verified blowpipes always use dragon darts, and nothing on their other variants', () => {
    renderPopover();

    fireEvent.change(search(), { target: { value: 'blowpipe' } });
    const notes = within(screen.getByRole('listbox'))
      .getAllByRole('option')
      .map((option) => [
        option.querySelector('.slot-picker__name')?.firstChild?.textContent,
        option.querySelector('.slot-picker__item-note')?.textContent ?? null,
      ]);
    // Offered by default, so both are verified; the gray `i`, never the amber warning.
    expect(notes).toEqual([
      ['Blazing blowpipe', 'Always uses dragon darts.'],
      ['Toxic blowpipe', 'Always uses dragon darts.'],
    ]);
    expect(screen.getByRole('listbox').querySelectorAll('.loadout-slot-note')).toHaveLength(2);
    expect(screen.getByRole('listbox').querySelector('.loadout-slot-unverified')).toBeNull();

    // The empty and other-wood blowpipes are unverified: marked as such, and given no note.
    fireEvent.click(screen.getByRole('checkbox', { name: 'Show unverified items' }));
    for (const option of within(screen.getByRole('listbox')).getAllByRole('option')) {
      const unverified = option.textContent?.includes('Unverified') ?? false;
      expect(option.querySelector('.slot-picker__item-note') === null).toBe(unverified);
    }
  });

  it('carries the same limitation note on the Current row when the slot holds the item', () => {
    renderPopover({ currentItemId: 29000 });

    const held = screen.getByRole('group', { name: 'Current item' });
    expect(held.querySelector('.slot-picker__item-note')).toHaveTextContent(/^Special attack unavailable\.$/);
    expect(held.querySelector('.loadout-slot-note')).not.toBeNull();
    expect(held).not.toHaveTextContent('Unverified');
  });

  it('carries the blowpipe note on the Current row', () => {
    renderPopover({ currentItemId: TOXIC_BLOWPIPE });

    const held = screen.getByRole('group', { name: 'Current item' });
    expect(held.querySelector('.slot-picker__item-note')).toHaveTextContent(/^Always uses dragon darts\.$/);
    expect(held.querySelector('.loadout-slot-note')).not.toBeNull();
  });

  it('adds no note to a fully verified item with nothing to say on the Current row', () => {
    renderPopover({ currentItemId: 23528 }); // Sarachnis cudgel

    expect(screen.getByRole('group', { name: 'Current item' }).querySelector('.slot-picker__item-note')).toBeNull();
  });

  it('answers the dead end instead of claiming the item does not exist', () => {
    // Derived, not hardcoded: the blade ships in charged and clan variants, and the count
    // moves whenever the checked-in catalog changes. Counted off the distinguished list for
    // the same reason the note is: promising more matches than turning the switch on can
    // actually show is the one way this note can mislead.
    const hidden = distinguishCatalogItems(WEAPONS, undefined).filter(
      (item) => !item.verified && item.name.toLowerCase().includes(BLADE_OF_SAELDOR.toLowerCase()),
    ).length;
    expect(hidden).toBeGreaterThan(1);
    renderPopover();

    fireEvent.change(search(), { target: { value: BLADE_OF_SAELDOR } });

    // Without this note the player reads "no such gear" and concludes the sim lacks the item.
    expect(screen.getByText(`${hidden} unverified matches hidden.`)).toBeInTheDocument();
  });

  it('re-measures when a note appears on the query alone, with the row count unchanged', () => {
    // The hidden-match note comes and goes with the query while the list stays at just Empty,
    // so the row count cannot see it. The surface still gets taller, and height is what decides
    // whether it flips above the cell, so the layout effect has to run on the query too.
    const { anchor } = renderPopover();
    fireEvent.change(search(), { target: { value: 'zzzz' } });
    expect(within(screen.getByRole('listbox')).queryAllByRole('option')).toHaveLength(0);

    // Move the cell. Only a reposition can pick this up, so `top` doubles as proof it ran.
    anchor.getBoundingClientRect = () =>
      ({
        left: 100,
        top: 40,
        right: 144,
        bottom: 84,
        width: 44,
        height: 44,
        x: 100,
        y: 40,
        toJSON: () => ({}),
      }) as DOMRect;

    // Still one row, still no switch movement: the note is the only thing that changed.
    fireEvent.change(search(), { target: { value: BLADE_OF_SAELDOR } });

    expect(within(screen.getByRole('listbox')).queryAllByRole('option')).toHaveLength(0);
    expect(screen.getByText(/unverified matches hidden\./)).toBeInTheDocument();
    expect(surface().style.top).toBe('88px');
  });

  it('leaves Enter to the switch when the switch is what has focus', () => {
    // Enter is handled on the surface, so without a guard it would pick the row under the
    // cursor while the player was trying to flip the switch: a silent gear change.
    const onChoose = vi.fn();
    const onDismiss = vi.fn();
    renderPopover({ onChoose, onDismiss });
    fireEvent.change(search(), { target: { value: 'Toxic blowpipe' } });

    fireEvent.keyDown(scopeSwitch(), { key: 'Enter' });

    expect(onChoose).not.toHaveBeenCalled();
    expect(onDismiss).not.toHaveBeenCalled();
  });

  it('remembers the answer across slots, because the picker remounts on every cell', () => {
    const first = renderPopover();
    fireEvent.click(scopeSwitch());
    first.unmount();

    renderPopover();

    expect(scopeSwitch()).toHaveAttribute('aria-checked', 'true');
    expect(screen.queryByText(/not fully implemented/)).toBeNull();
  });

  it('offers no switch on slots where nothing is held back', () => {
    // Every non-weapon piece is verified, so armour slots have nothing to filter.
    renderPopover({ catalog: getGearCatalog('body'), listLabel: 'Body gear' });

    expect(screen.queryByRole('checkbox', { name: 'Show unverified items' })).toBeNull();
    expect(screen.queryByText(/not fully implemented/)).toBeNull();
  });

  it('explains item support on demand on every slot, switch or no switch', async () => {
    // Verification is about combat. The line names what IS covered as well as what is not:
    // stats and supported set effects, against one-off per-item effects that may not exist yet.
    // "Most" is doing real work there because Blue moon's set effect is not modeled.
    const terms = /Stats and most set effects are simulated\. Many item effects are not\./;

    const armour = renderPopover({ catalog: getGearCatalog('body'), listLabel: 'Body gear' });
    fireEvent.focus(screen.getByRole('button', { name: 'About Item support' }));
    expect(await screen.findByText(terms)).toBeInTheDocument();
    expect(screen.getByRole('tooltip')).toHaveClass('slot-picker-support-card');
    armour.unmount();

    renderPopover();
    fireEvent.focus(screen.getByRole('button', { name: 'About Item support' }));
    expect(await screen.findByText(terms)).toBeInTheDocument();
    expect(screen.getByRole('tooltip')).toHaveClass('slot-picker-support-card');
  });

  it('still pins an unverified item the slot already holds', () => {
    const blade = WEAPONS.find((item) => item.name === BLADE_OF_SAELDOR);
    if (!blade) {
      throw new Error('catalog no longer carries the unverified fixture');
    }
    // Filtering the offer must never disown the loadout: the slot says what it holds.
    renderPopover({ currentItemId: blade.id });

    const held = screen.getByRole('group', { name: 'Current item' });
    expect(held).toHaveTextContent(BLADE_OF_SAELDOR);
    expect(held).toHaveTextContent('Unverified');
  });
});
