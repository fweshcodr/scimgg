// @vitest-environment happy-dom

import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { type LoadoutDraft, LoadoutPicker } from '../LoadoutPicker';

function renderPicker(overrides: Partial<Parameters<typeof LoadoutPicker>[0]> = {}) {
  return render(
    <LoadoutPicker
      label="LOADOUT"
      selectedKey="alpha"
      selectedLabel="Alpha"
      options={[
        { key: 'alpha', name: 'Alpha', iconItemIds: [4151, 11832] },
        { key: 'beta', name: 'Beta', iconItemIds: [1333] },
      ]}
      blockedOptions={[
        {
          key: 'gamma',
          name: 'Gamma',
          iconItemIds: [4587],
          requirements: [{ stat: 'strength', level: 90, label: 'Strength' }],
        },
      ]}
      onSelect={vi.fn()}
      {...overrides}
    />,
  );
}

function enabledOptions(): HTMLElement[] {
  return screen.getAllByRole('option').filter((opt) => opt.getAttribute('aria-disabled') !== 'true');
}

/** The player's own sets: two saved-group tiles, one of them a shipped set for contrast. */
const withSavedSet = [
  { key: 'alpha', name: 'Alpha', iconItemIds: [4151] },
  { key: 'custom:1', name: 'My kit', iconItemIds: [4151], isCustom: true },
];

function savedHeading(): HTMLElement {
  return screen.getByRole('heading', { name: /^Saved/ });
}

function draft(overrides: Partial<LoadoutDraft> = {}): LoadoutDraft {
  return {
    naming: false,
    name: 'Alpha (custom)',
    revertName: 'Alpha',
    onNameChange: vi.fn(),
    onSave: vi.fn(),
    onCancelNaming: vi.fn(),
    onRevert: vi.fn(),
    ...overrides,
  };
}

function barIdentity(): HTMLElement {
  const element = document.querySelector<HTMLElement>('.loadout-bar-identity');
  if (!element) {
    throw new Error('loadout bar identity not found');
  }
  return element;
}

function barTools(): HTMLElement {
  const element = document.querySelector<HTMLElement>('.loadout-bar-tools');
  if (!element) {
    throw new Error('loadout bar actions not found');
  }
  return element;
}

describe('LoadoutPicker — the toolbar', () => {
  const transfer = <button type="button">Import</button>;

  it('names the worn set once, as the heading value, with the clipboard tools beside it', () => {
    renderPicker({ labelActions: transfer });

    // The set is named here and on its own tile, and nowhere else: a second readout on a row
    // below this one announced it twice, directly above the tile that already marks it.
    expect(document.querySelector('.loadout-bar-value')).toHaveTextContent('Alpha');
    expect(barIdentity()).toBeEmptyDOMElement();
    const importAction = screen.getByRole('button', { name: 'Import' });
    expect(barTools()).toContainElement(importAction);
    expect(barIdentity()).not.toContainElement(importAction);
  });

  it('opens the name field in the place of the readout it stands in for', () => {
    renderPicker({
      selectedKey: '__custom__',
      selectedLabel: 'Custom',
      draft: draft({ naming: true }),
      labelActions: transfer,
    });

    expect(barIdentity()).toContainElement(screen.getByLabelText('Preset name'));
    expect(barTools()).not.toContainElement(screen.getByLabelText('Preset name'));
    const name = screen.getByRole('textbox', { name: 'Preset name' }) as HTMLInputElement;
    expect(name.labels?.[0]).toHaveTextContent('Preset name');
    expect(name.labels?.[0]).toBeVisible();
  });

  it('gives draft answers their own row below the stable transfer tools', () => {
    renderPicker({ selectedKey: '__custom__', selectedLabel: 'Custom', draft: draft(), labelActions: transfer });

    const save = screen.getByRole('button', { name: 'Save preset' });
    const importAction = screen.getByRole('button', { name: 'Import' });
    const actions = document.querySelector('.loadout-bar-actions');
    expect(actions).toContainElement(save);
    expect(actions).not.toContainElement(importAction);
    expect(barTools()).toContainElement(importAction);
    expect(screen.getByText('Loadout not saved as a preset.')).toBeVisible();
  });
});

describe('LoadoutPicker — keyboard roving', () => {
  it('moves focus to the next enabled option on ArrowDown/ArrowRight', () => {
    renderPicker();
    const [first, second] = enabledOptions();
    first.focus();

    fireEvent.keyDown(screen.getByRole('listbox'), { key: 'ArrowDown' });
    expect(document.activeElement).toBe(second);

    second.focus();
    fireEvent.keyDown(screen.getByRole('listbox'), { key: 'ArrowRight' });
    // wraps past the end, skipping the locked row
    expect(document.activeElement).toBe(first);
  });

  it('moves focus backwards with wrap-around on ArrowUp/ArrowLeft, skipping locked rows', () => {
    renderPicker();
    const [first, second] = enabledOptions();
    first.focus();

    fireEvent.keyDown(screen.getByRole('listbox'), { key: 'ArrowUp' });
    // wraps from the first enabled option to the last enabled one — never the locked row
    expect(document.activeElement).toBe(second);

    fireEvent.keyDown(screen.getByRole('listbox'), { key: 'ArrowLeft' });
    expect(document.activeElement).toBe(first);
  });

  it('never lands on a tile action, because an action is not one of the sets', () => {
    renderPicker({ options: withSavedSet, blockedOptions: [], selectedKey: 'custom:1', onDeleteCustom: vi.fn() });
    const [stockTile, savedTile] = enabledOptions();
    stockTile.focus();

    // Wrapping backwards from the first set lands on the last SET, not on the action that
    // sits under it: an action must never take a turn in the option ring.
    fireEvent.keyDown(screen.getByRole('listbox'), { key: 'ArrowUp' });
    expect(document.activeElement).toBe(savedTile);
    expect(document.activeElement).not.toBe(screen.getByRole('button', { name: 'Delete My kit' }));
  });

  it('moves directly from presets to saved tiles without opening a group', () => {
    renderPicker({ options: withSavedSet, blockedOptions: [] });
    const [stockTile, savedTile] = enabledOptions();
    stockTile.focus();
    fireEvent.keyDown(screen.getByRole('listbox'), { key: 'ArrowDown' });
    expect(document.activeElement).toBe(savedTile);
  });
});

/** Two main presets plus a named section: the specialist shelf under the group's own sets. */
const withSection = [
  { key: 'alpha', name: 'Alpha', iconItemIds: [4151] },
  { key: 'beta', name: 'Beta', iconItemIds: [1333] },
  { key: 'run-a', name: 'Run A', iconItemIds: [20997], section: 'Speedrun' },
  { key: 'run-b', name: 'Run B', iconItemIds: [22325], section: 'Speedrun' },
];

const sectionBlocked = [
  {
    key: 'run-c',
    name: 'Run C',
    iconItemIds: [4587],
    section: 'Speedrun',
    requirements: [{ stat: 'ranged', level: 95, label: 'Ranged' }],
  },
];

function sectionToggle(): HTMLElement {
  return screen.getByRole('button', { name: /^Speedrun/ });
}

describe('LoadoutPicker — named sections', () => {
  it('folds a named section away by default and leaves the main presets in the open', () => {
    renderPicker({ options: withSection, blockedOptions: sectionBlocked });

    expect(sectionToggle()).toHaveAttribute('aria-expanded', 'false');
    expect(sectionToggle()).toHaveAccessibleName('Speedrun (3)');
    expect(screen.queryByRole('option', { name: 'Run A' })).toBeNull();
    expect(screen.queryByRole('option', { name: /Run C/ })).toBeNull();

    // The group's own sets never move behind the fold.
    expect(screen.getByRole('option', { name: 'Alpha' })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'Beta' })).toBeInTheDocument();
    expect(screen.getByRole('listbox')).not.toHaveAttribute('aria-owns');
  });

  it('opens the section on a press, with its locked sets listed inside it', () => {
    renderPicker({ options: withSection, blockedOptions: sectionBlocked });
    fireEvent.click(sectionToggle());

    expect(sectionToggle()).toHaveAttribute('aria-expanded', 'true');
    const group = screen.getByRole('group', { name: 'Speedrun (3)' });
    expect(within(group).getByRole('option', { name: 'Run A' })).toBeInTheDocument();
    expect(within(group).getByRole('option', { name: 'Run B' })).toBeInTheDocument();
    expect(within(group).getByRole('option', { name: /Run C/ })).toHaveAttribute('aria-disabled', 'true');
    expect(within(group).queryByRole('option', { name: 'Alpha' })).toBeNull();

    // An optgroup of the one listbox, owned by id so the header button stays outside it.
    expect(sectionToggle()).toHaveAttribute('aria-controls', group.id);
    expect(screen.getByRole('listbox')).toHaveAttribute('aria-owns', group.id);
    expect(screen.getByRole('listbox')).not.toContainElement(sectionToggle());
    expect(screen.getAllByRole('listbox')).toHaveLength(1);

    fireEvent.click(sectionToggle());
    expect(screen.queryByRole('option', { name: 'Run A' })).toBeNull();
  });

  it('closes again on a second press, and the header is never one of the sets', () => {
    renderPicker({ options: withSection, blockedOptions: [] });
    fireEvent.click(sectionToggle());

    expect(sectionToggle()).not.toHaveAttribute('role', 'option');
    expect(enabledOptions().map((opt) => opt.textContent)).toEqual(['Alpha', 'Beta', 'Run A', 'Run B']);
  });

  it('shows the section open when it holds the worn set, so the selection is never folded away', () => {
    renderPicker({
      options: withSection,
      blockedOptions: sectionBlocked,
      selectedKey: 'run-b',
      selectedLabel: 'Run B',
    });

    expect(sectionToggle()).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByRole('option', { name: 'Run B' })).toHaveAttribute('aria-selected', 'true');
  });

  // The control still answers: forcing it open would leave a header that does nothing.
  it('lets the player close the section the selection opened, and reopens it for the next one', () => {
    const element = (selectedKey: string) => (
      <LoadoutPicker
        label="LOADOUT"
        selectedKey={selectedKey}
        selectedLabel={selectedKey}
        options={withSection}
        blockedOptions={[]}
        onSelect={vi.fn()}
      />
    );
    const { rerender } = render(element('run-a'));

    fireEvent.click(sectionToggle());
    expect(sectionToggle()).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByRole('option', { name: 'Run A' })).toBeNull();

    // Leaving for a main preset keeps it closed; an auto-switch back into it opens it again.
    rerender(element('alpha'));
    expect(sectionToggle()).toHaveAttribute('aria-expanded', 'false');
    rerender(element('run-b'));
    expect(sectionToggle()).toHaveAttribute('aria-expanded', 'true');
  });

  it('walks the section tiles with the arrow keys once it is open, and skips them while closed', () => {
    renderPicker({ options: withSection, blockedOptions: sectionBlocked });
    const [alpha, beta] = enabledOptions();
    beta.focus();
    fireEvent.keyDown(screen.getByRole('listbox'), { key: 'ArrowDown' });
    expect(document.activeElement).toBe(alpha);

    fireEvent.click(sectionToggle());
    const runA = screen.getByRole('option', { name: 'Run A' });
    screen.getByRole('option', { name: 'Beta' }).focus();
    fireEvent.keyDown(screen.getByRole('group', { name: 'Speedrun (3)' }), { key: 'ArrowDown' });
    expect(document.activeElement).toBe(runA);
  });

  it('draws no header at all for a group whose sets name no section', () => {
    renderPicker();

    expect(screen.queryByRole('button', { name: /^Speedrun/ })).toBeNull();
    expect(document.querySelector('.loadout-shelf')).toBeNull();
    expect(screen.getByRole('heading', { name: 'Presets' })).toBeInTheDocument();
    expect(screen.getByRole('listbox')).not.toHaveAttribute('aria-owns');
  });

  it('keeps the saved group owned alongside an open section, in the order they are drawn', () => {
    renderPicker({
      options: [...withSection, { key: 'custom:1', name: 'My kit', iconItemIds: [4151], isCustom: true }],
      blockedOptions: [],
    });
    fireEvent.click(sectionToggle());

    const section = screen.getByRole('group', { name: 'Speedrun (2)' });
    const saved = screen.getByRole('group', { name: 'Saved presets (1)' });
    expect(screen.getByRole('listbox')).toHaveAttribute('aria-owns', `${section.id} ${saved.id}`);
    // A saved set is the player's own, never filed under a shipped section.
    expect(within(section).queryByRole('option', { name: 'My kit' })).toBeNull();
  });
});

describe('LoadoutPicker — gear-sprite strip', () => {
  it('reserves the same decorative selection mark for stock and saved tiles in both states', () => {
    const options = [
      { key: 'atlatl', name: 'Atlatl / RCB (Eclipse)', iconItemIds: [9185] },
      { key: 'custom:1', name: 'My long named ranged loadout', iconItemIds: [9185], isCustom: true },
    ];
    const onSelect = vi.fn();
    const props = { label: 'Loadout', options, blockedOptions: [], onSelect };
    const { rerender } = render(
      <LoadoutPicker {...props} selectedKey="atlatl" selectedLabel="Atlatl / RCB (Eclipse)" />,
    );
    const stock = screen.getByRole('option', { name: options[0].name });
    const saved = screen.getByRole('option', { name: options[1].name });
    const stockMark = stock.querySelector('.loadout-tile-check');
    const savedMark = saved.querySelector('.loadout-tile-check');
    for (const mark of [stockMark, savedMark]) {
      expect(mark).toHaveAttribute('width', '12');
      expect(mark).toHaveAttribute('height', '12');
      expect(mark).toHaveAttribute('aria-hidden', 'true');
    }
    expect(stockMark).toHaveAttribute('visibility', 'visible');
    expect(savedMark).toHaveAttribute('visibility', 'hidden');

    fireEvent.click(saved);
    expect(onSelect).toHaveBeenCalledWith('custom:1');
    rerender(<LoadoutPicker {...props} selectedKey="custom:1" selectedLabel={options[1].name} />);

    // Only the mark's ink changes. Its node and intrinsic dimensions stay in layout.
    expect(stock.querySelector('.loadout-tile-check')).toBe(stockMark);
    expect(saved.querySelector('.loadout-tile-check')).toBe(savedMark);
    expect(stockMark).toHaveAttribute('visibility', 'hidden');
    expect(savedMark).toHaveAttribute('visibility', 'visible');
    expect(stock).toHaveAttribute('aria-selected', 'false');
    expect(saved).toHaveAttribute('aria-selected', 'true');
    expect(stock.querySelector('.loadout-tile-name')).toHaveTextContent(options[0].name);
    expect(saved.querySelector('.loadout-tile-name')).toHaveTextContent(options[1].name);
  });

  it('renders one representative sprite per compact preset', () => {
    renderPicker();
    const alpha = screen.getByRole('option', { name: 'Alpha' });
    const sprites = Array.from(alpha.querySelectorAll('.loadout-tile-icon canvas'));
    expect(sprites.map((canvas) => canvas.getAttribute('data-src'))).toEqual([expect.stringContaining('/4151.png')]);
  });

  it('renders a single empty box when a set has no identifying gear', () => {
    renderPicker({
      options: [{ key: 'none', name: 'No Equipment', iconItemIds: [] }],
      blockedOptions: [],
      selectedKey: 'none',
      selectedLabel: 'No Equipment',
    });
    const option = screen.getByRole('option', { name: 'No Equipment' });
    expect(option.querySelectorAll('.loadout-tile-icon')).toHaveLength(1);
    expect(option.querySelectorAll('.loadout-tile-icon canvas')).toHaveLength(0);
  });

  it('renders the locked row sprites alongside the requirement chips', () => {
    renderPicker();
    const gamma = screen.getByRole('option', { name: /Gamma/ });
    expect(gamma.querySelectorAll('.loadout-tile-icon canvas')).toHaveLength(1);
    expect(gamma.querySelectorAll('.loadout-req-chip')).toHaveLength(1);
    expect(gamma).toHaveTextContent('90');
  });
});

describe('LoadoutPicker — saved sets', () => {
  it('shows saved sets immediately under a counted heading', () => {
    renderPicker({ options: withSavedSet, blockedOptions: [] });
    expect(savedHeading()).toHaveTextContent('Saved presets (1)');
    expect(screen.queryByRole('button', { name: /^Saved/ })).not.toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'My kit' }).closest('[inert]')).toBeNull();
  });

  it('selects a saved set directly from the kit-selection area', () => {
    const onSelect = vi.fn();
    renderPicker({ options: withSavedSet, blockedOptions: [], onSelect });
    fireEvent.click(screen.getByRole('option', { name: 'My kit' }));
    expect(onSelect).toHaveBeenCalledWith('custom:1');
  });

  it("keeps the player's own sets in their own labeled group", () => {
    renderPicker({ options: withSavedSet, blockedOptions: [], onDeleteCustom: vi.fn() });

    const saved = screen.getByRole('group', { name: 'Saved presets (1)' });
    expect(within(saved).getByRole('option', { name: 'My kit' })).toBeInTheDocument();
    expect(within(saved).queryByRole('option', { name: 'Alpha' })).toBeNull();
  });

  it('keeps the group an optgroup of the one listbox, not a listbox of its own', () => {
    renderPicker({ options: withSavedSet, blockedOptions: [] });

    // Delete actions remain outside the listbox, which owns the saved optgroup by ID.
    const group = screen.getByRole('group', { name: 'Saved presets (1)' });
    expect(screen.getByRole('listbox')).toHaveAttribute('aria-owns', group.id);
    expect(screen.getByRole('listbox')).not.toContainElement(savedHeading());
    expect(screen.getAllByRole('listbox')).toHaveLength(1);
  });

  it('says what the group is and how much is in it, and never a second copy of the active name', () => {
    renderPicker({ options: withSavedSet, blockedOptions: [], selectedKey: 'custom:1', selectedLabel: 'My kit' });

    // The toolbar is the one readout of what is worn; naming it here too put the same name in
    // three places at once.
    expect(savedHeading()).toHaveAccessibleName('Saved presets (1)');
    expect(savedHeading()).not.toHaveTextContent('My kit');
    expect(document.querySelector('.loadout-saved-current')).toBeNull();

    expect(savedHeading()).toHaveAccessibleName('Saved presets (1)');
    expect(screen.getByRole('option', { name: 'My kit' })).toHaveAttribute('aria-selected', 'true');
  });

  // Never a second press of the corner control: that press landed on a ✕ that had turned into a
  // ✓, with nothing on screen inviting it and no way to decline but to aim away from it.
  it('answers the delete with two labeled controls, neither of them the one that opened it', () => {
    const onDeleteCustom = vi.fn();
    renderPicker({ options: withSavedSet, blockedOptions: [], selectedKey: 'custom:1', onDeleteCustom });

    fireEvent.click(screen.getByRole('button', { name: 'Delete My kit' }));
    expect(onDeleteCustom).not.toHaveBeenCalled();

    const confirm = screen.getByRole('group', { name: 'Delete My kit?' });
    expect(screen.getByRole('button', { name: 'Delete My kit' })).toHaveAttribute('aria-expanded', 'true');
    fireEvent.click(screen.getByRole('button', { name: 'Delete My kit' }));
    expect(onDeleteCustom).not.toHaveBeenCalled();
    expect(confirm).toHaveTextContent('My kit');

    fireEvent.click(within(confirm).getByRole('button', { name: 'Delete' }));
    expect(onDeleteCustom).toHaveBeenCalledWith('custom:1');
  });

  // The safe answer, because a stray Enter arrives on whatever holds focus.
  it('opens the confirm on Keep, and Keep puts the player back on the control they pressed', () => {
    const onDeleteCustom = vi.fn();
    renderPicker({ options: withSavedSet, blockedOptions: [], selectedKey: 'custom:1', onDeleteCustom });

    fireEvent.click(screen.getByRole('button', { name: 'Delete My kit' }));
    const keep = screen.getByRole('button', { name: 'Keep' });
    expect(document.activeElement).toBe(keep);

    fireEvent.click(keep);
    expect(onDeleteCustom).not.toHaveBeenCalled();
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Delete My kit' }));
  });

  it('closes the confirm on Escape, and never on a pointer that drifts off it', () => {
    const onDeleteCustom = vi.fn();
    renderPicker({ options: withSavedSet, blockedOptions: [], selectedKey: 'custom:1', onDeleteCustom });

    fireEvent.click(screen.getByRole('button', { name: 'Delete My kit' }));
    const confirm = screen.getByRole('group', { name: 'Delete My kit?' });
    // A one-pixel drift must not cancel silently between the two presses it demands in a row.
    fireEvent.mouseLeave(confirm);
    expect(screen.getByRole('group', { name: 'Delete My kit?' })).toBeInTheDocument();

    fireEvent.keyDown(confirm, { key: 'Escape' });
    expect(screen.getByRole('button', { name: 'Delete My kit' })).toBeInTheDocument();
    expect(onDeleteCustom).not.toHaveBeenCalled();
  });

  // The confirm sits inside the list's roving arrow handler, which would answer an arrow key by
  // throwing focus onto a tile and leaving the confirm open behind it.
  it('keeps the arrow keys inside an open confirm', () => {
    renderPicker({ options: withSavedSet, blockedOptions: [], selectedKey: 'custom:1', onDeleteCustom: vi.fn() });

    fireEvent.click(screen.getByRole('button', { name: 'Delete My kit' }));
    const keep = screen.getByRole('button', { name: 'Keep' });
    fireEvent.keyDown(keep, { key: 'ArrowDown' });

    expect(document.activeElement).toBe(keep);
  });

  it('disarms a delete the selection moved away from', () => {
    const onDeleteCustom = vi.fn();
    const { rerender } = renderPicker({
      options: withSavedSet,
      blockedOptions: [],
      selectedKey: 'custom:1',
      onDeleteCustom,
    });
    fireEvent.click(screen.getByRole('button', { name: 'Delete My kit' }));

    // An auto-switch takes the action row away with the selection; the arm must not lie in
    // wait for the tile to come back.
    rerender(
      <LoadoutPicker
        label="LOADOUT"
        selectedKey="alpha"
        selectedLabel="Alpha"
        options={withSavedSet}
        blockedOptions={[]}
        onSelect={vi.fn()}
        onDeleteCustom={onDeleteCustom}
      />,
    );
    rerender(
      <LoadoutPicker
        label="LOADOUT"
        selectedKey="custom:1"
        selectedLabel="My kit"
        options={withSavedSet}
        blockedOptions={[]}
        onSelect={vi.fn()}
        onDeleteCustom={onDeleteCustom}
      />,
    );

    expect(screen.getByRole('button', { name: 'Delete My kit' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Confirm deleting My kit' })).toBeNull();
  });

  it('drops the whole group when the last saved set is deleted', () => {
    const { rerender } = renderPicker({ options: withSavedSet, blockedOptions: [], onDeleteCustom: vi.fn() });

    rerender(
      <LoadoutPicker
        label="LOADOUT"
        selectedKey="alpha"
        selectedLabel="Alpha"
        options={[{ key: 'alpha', name: 'Alpha', iconItemIds: [4151] }]}
        blockedOptions={[]}
        onSelect={vi.fn()}
        onDeleteCustom={vi.fn()}
      />,
    );

    expect(screen.queryByRole('heading', { name: /^Saved/ })).toBeNull();
    expect(screen.queryByRole('group')).toBeNull();
    // No dangling ownership left pointing at a group that no longer exists.
    expect(screen.getByRole('listbox')).not.toHaveAttribute('aria-owns');
  });
});

describe('LoadoutPicker — saved tiles', () => {
  it('identifies the delete action on pointer hover and dismisses the hint on press', async () => {
    renderPicker({ options: withSavedSet, blockedOptions: [], onDeleteCustom: vi.fn() });
    const remove = screen.getByRole('button', { name: 'Delete My kit' });
    expect(remove).toHaveAttribute('title', '');
    expect(remove.querySelector('svg')).toHaveAttribute('aria-hidden', 'true');
    fireEvent.pointerEnter(remove, { pointerType: 'mouse' });
    expect(await screen.findByRole('tooltip')).toHaveTextContent('Delete My kit');
    fireEvent.pointerDown(remove, { pointerType: 'mouse' });
    expect(screen.queryByRole('tooltip')).toBeNull();
  });

  it('preserves the same single representative item for saved and stock presets', () => {
    renderPicker({
      options: [
        { key: 'alpha', name: 'Alpha', iconItemIds: [4151, 11832] },
        { key: 'custom:1', name: 'My kit', iconItemIds: [4151, 11832], isCustom: true },
      ],
      blockedOptions: [],
      onDeleteCustom: vi.fn(),
    });
    expect(screen.getByRole('option', { name: 'Alpha' }).querySelectorAll('.loadout-tile-icon canvas')).toHaveLength(1);
    const saved = screen.getByRole('option', { name: 'My kit' });
    expect(saved.querySelectorAll('.loadout-tile-icon canvas')).toHaveLength(1);
    expect(saved.querySelector('canvas')).toHaveAttribute('data-src', expect.stringContaining('/4151.png'));
    expect(saved.querySelector('button')).toBeNull();
  });

  const twoSaved = [
    { key: 'alpha', name: 'Alpha', iconItemIds: [4151] },
    { key: 'custom:1', name: 'My kit', iconItemIds: [4151], isCustom: true },
    { key: 'custom:2', name: 'Spare kit', iconItemIds: [1333], isCustom: true },
  ];

  it('offers no way to customize a set, because gear is edited in the diagram', () => {
    renderPicker({ options: withSavedSet, blockedOptions: [], onDeleteCustom: vi.fn() });

    expect(screen.queryByRole('button', { name: /^Customize/ })).toBeNull();
    expect(screen.queryByRole('button', { name: /scratch|blank|new loadout/i })).toBeNull();
    expect(document.querySelector('.loadout-new')).toBeNull();
  });

  it('keeps previews and selection on the tiles, with deletion as a sibling control', () => {
    renderPicker({ options: twoSaved, blockedOptions: [], selectedKey: 'custom:1', onDeleteCustom: vi.fn() });

    const worn = screen.getByRole('option', { name: 'My kit' });
    expect(worn.querySelectorAll('.loadout-tile-icon canvas')).toHaveLength(1);
    expect(worn).toHaveAttribute('aria-selected', 'true');
    const deleteButton = screen.getByRole('button', { name: 'Delete My kit' });
    expect(worn).not.toContainElement(deleteButton);
    expect(worn.parentElement).toContainElement(deleteButton);
    // The selected language is the section's own commitment tokens, not a second vocabulary:
    // accent border and tinted fill, exactly as the shipped tile wears them.
    expect(worn).toHaveClass('loadout-tile--selected');
    expect(screen.getByRole('option', { name: 'Spare kit' })).not.toHaveClass('loadout-tile--selected');
  });

  it('uses the preset tile presentation for saved sets while keeping deletion separate', () => {
    renderPicker({ options: twoSaved, blockedOptions: [], selectedKey: 'alpha', onDeleteCustom: vi.fn() });

    const alpha = screen.getByRole('option', { name: 'Alpha' });
    const saved = screen.getByRole('option', { name: 'My kit' });
    expect(alpha).toHaveClass('loadout-tile');
    expect(saved).toHaveClass('loadout-tile');
    expect(saved.querySelector('.loadout-tile-icons')).not.toBeNull();
    expect(saved.querySelector('.loadout-tile-name')).toHaveTextContent('My kit');
    expect(saved.querySelector('button')).toBeNull();
    expect(saved.parentElement?.parentElement).toHaveClass('loadout-grid-tiles');
    expect(document.querySelectorAll('.loadout-tile--saved')).toHaveLength(2);
  });

  it('offers a named delete on every saved tile without a detached selection action', () => {
    renderPicker({ options: twoSaved, blockedOptions: [], selectedKey: 'custom:1', onDeleteCustom: vi.fn() });

    expect(screen.getByRole('button', { name: 'Delete My kit' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Delete Spare kit' })).toBeInTheDocument();
    expect(screen.queryByText('Delete selected')).toBeNull();
    expect(screen.queryByText('Delete saved')).toBeNull();
  });

  it('leaves the preview visible during confirmation and deletes only the named selection', () => {
    const onDeleteCustom = vi.fn();
    renderPicker({ options: twoSaved, blockedOptions: [], selectedKey: 'custom:1', onDeleteCustom });

    fireEvent.click(screen.getByRole('button', { name: 'Delete My kit' }));
    expect(onDeleteCustom).not.toHaveBeenCalled();
    expect(screen.getByRole('option', { name: 'My kit' })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByRole('option', { name: 'My kit' }).closest('[inert]')).toBeNull();

    const confirm = screen.getByRole('group', { name: 'Delete My kit?' });
    fireEvent.click(within(confirm).getByRole('button', { name: 'Delete' }));
    expect(onDeleteCustom).toHaveBeenCalledWith('custom:1');
  });

  it('can delete an unselected set without putting it on first', () => {
    const onSelect = vi.fn();
    const onDeleteCustom = vi.fn();
    renderPicker({ options: twoSaved, blockedOptions: [], selectedKey: 'custom:1', onSelect, onDeleteCustom });
    fireEvent.click(screen.getByRole('button', { name: 'Delete Spare kit' }));
    fireEvent.click(
      within(screen.getByRole('group', { name: 'Delete Spare kit?' })).getByRole('button', { name: 'Delete' }),
    );
    expect(onSelect).not.toHaveBeenCalled();
    expect(onDeleteCustom).toHaveBeenCalledWith('custom:2');
  });

  it('retains the saved original as the delete subject while editing without selecting its old gear', () => {
    const onDeleteCustom = vi.fn();
    renderPicker({
      options: twoSaved,
      blockedOptions: [],
      selectedKey: '__custom__',
      draft: draft({ onUpdate: vi.fn() }),
      onDeleteCustom,
    });
    const remove = screen.getByRole('button', { name: 'Delete My kit' });
    expect(screen.getByRole('option', { name: 'My kit' })).toHaveAttribute('aria-selected', 'false');
    fireEvent.click(remove);
    fireEvent.click(screen.getByRole('button', { name: 'Keep' }));
    expect(onDeleteCustom).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'Update preset' })).toBeInTheDocument();
  });

  it('carries no delete at all when deleting is not wired', () => {
    renderPicker({ options: twoSaved, blockedOptions: [], selectedKey: 'custom:1' });

    expect(screen.queryByRole('button', { name: /^Delete/ })).toBeNull();
    expect(document.querySelectorAll('.loadout-tile--saved')).toHaveLength(2);
  });
});

describe('LoadoutPicker — the draft is answered in the bar', () => {
  it('offers explicit update and save-as-new answers only for a saved-set edit', () => {
    const onUpdate = vi.fn();
    const onSave = vi.fn();
    renderPicker({
      selectedKey: '__custom__',
      selectedLabel: 'My kit (unsaved changes)',
      draft: draft({ onUpdate, onSave }),
    });
    fireEvent.click(screen.getByRole('button', { name: 'Update preset' }));
    expect(onUpdate).toHaveBeenCalledTimes(1);
    expect(onSave).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Save new preset' }));
    expect(onSave).toHaveBeenCalledTimes(1);
  });

  it('does not offer update while naming a separate copy', () => {
    renderPicker({ draft: draft({ naming: true, onUpdate: vi.fn() }) });
    expect(screen.queryByRole('button', { name: 'Update preset' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Save new preset' })).toBeNull();
    expect(screen.getByRole('button', { name: 'Save preset' })).toBeInTheDocument();
  });

  it('stands nothing in the bar while the loadout matches a set', () => {
    renderPicker();

    expect(screen.queryByRole('button', { name: /^Save/ })).toBeNull();
    expect(screen.queryByRole('button', { name: /^Revert/ })).toBeNull();
    expect(document.querySelector('.loadout-bar-action')).toBeNull();
  });

  it('answers a draft in the row that already reads the selection back', () => {
    const onSave = vi.fn();
    const onRevert = vi.fn();
    renderPicker({ selectedKey: '__custom__', selectedLabel: 'Custom', draft: draft({ onSave, onRevert }) });

    // One row, no new section: the readout, the way back, and the way to keep it.
    const bar = document.querySelector<HTMLElement>('.loadout-bar');
    if (!bar) {
      throw new Error('loadout bar not found');
    }
    expect(bar).toHaveTextContent('Custom');
    expect(within(bar).getByRole('button', { name: 'Revert to Alpha' })).toBeInTheDocument();
    const save = within(bar).getByRole('button', { name: 'Save preset' });
    expect(save).toBeInTheDocument();
    // The pair carries the footer's shape language: the way back is the default button, the
    // way to keep it is the commitment. Neither is left in the tiles' quiet action voice.
    const revert = screen.getByRole('button', { name: 'Revert to Alpha' });
    expect(save).toHaveClass('loadout-bar-save');
    expect(revert).toHaveClass('loadout-bar-back');
    expect(revert).not.toHaveClass('loadout-bar-save');
    // The verb is all it shows; the set it puts back is its accessible name.
    expect(revert).toHaveTextContent('Revert');
    expect(revert).not.toHaveTextContent('Alpha');

    fireEvent.click(screen.getByRole('button', { name: 'Revert to Alpha' }));
    fireEvent.click(screen.getByRole('button', { name: 'Save preset' }));
    expect(onRevert).toHaveBeenCalledTimes(1);
    expect(onSave).toHaveBeenCalledTimes(1);
  });

  it('leaves the way back out when the loadout never matched a set', () => {
    renderPicker({ selectedKey: '__custom__', selectedLabel: 'Custom', draft: draft({ revertName: null }) });

    expect(screen.queryByRole('button', { name: /^Revert/ })).toBeNull();
    expect(screen.getByRole('button', { name: 'Save preset' })).toBeInTheDocument();
  });

  it('asks for the name in place of the readout, focused and offered up for replacement', () => {
    const onNameChange = vi.fn();
    const onSave = vi.fn();
    const onCancelNaming = vi.fn();
    renderPicker({
      selectedKey: '__custom__',
      selectedLabel: 'Custom',
      draft: draft({ naming: true, onNameChange, onSave, onCancelNaming }),
    });

    const name = screen.getByLabelText('Preset name');
    expect(name).toHaveValue('Alpha (custom)');
    expect(document.activeElement).toBe(name);
    // The name IS the readout while it is being typed, so nothing doubles up beside it.
    expect(document.querySelector('.loadout-current')).toBeNull();
    expect(screen.queryByRole('button', { name: /^Revert/ })).toBeNull();

    fireEvent.change(name, { target: { value: 'Yama mage' } });
    expect(onNameChange).toHaveBeenCalledWith('Yama mage');

    fireEvent.keyDown(name, { key: 'Enter' });
    expect(onSave).toHaveBeenCalledTimes(1);

    fireEvent.keyDown(name, { key: 'Escape' });
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(onCancelNaming).toHaveBeenCalledTimes(2);
  });

  it('tells a refused save apart from a completed one, under the bar it happened in', () => {
    const { rerender } = renderPicker({ status: { kind: 'success', message: 'Saved preset: My kit.' } });

    expect(screen.getByRole('status')).not.toHaveClass('loadout-status--error');
    expect(screen.getByRole('status').querySelector('.loadout-status-icon--success')).not.toBeNull();

    rerender(
      <LoadoutPicker
        label="LOADOUT"
        selectedKey="alpha"
        selectedLabel="Alpha"
        options={[{ key: 'alpha', name: 'Alpha', iconItemIds: [4151] }]}
        blockedOptions={[]}
        onSelect={vi.fn()}
        status={{ kind: 'error', message: 'Enter a preset name.' }}
      />,
    );

    expect(screen.getByRole('status')).toHaveClass('loadout-status--error');
    expect(screen.getByRole('status').querySelector('.loadout-status-icon--error')).not.toBeNull();
    expect(screen.getByRole('status')).toHaveTextContent('Enter a preset name.');
  });
});
