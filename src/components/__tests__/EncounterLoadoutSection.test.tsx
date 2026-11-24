// @vitest-environment happy-dom

import { act, fireEvent, render, renderHook, screen, waitFor, within } from '@testing-library/react';
import { useState } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { type CustomizableGearSlot, getGearCatalog } from '../../data/customEquipmentPresets';
import { findEquipmentCatalogItem } from '../../data/equipmentCatalog';
import { exportInventorySetup, importInventorySetup } from '../../data/inventorySetupIO';
import { EQUIPMENT_PRESETS } from '../../data/playerPresets';
import { SUPPORTED_RUNES } from '../../data/runePouch';
import { ESC_PRIORITY, useEscapeLayer } from '../../hooks/useEscapeLayer';
import { __resetKeyStateForTest, isKeyHeld } from '../../input/keyState';
import type { PlayerEquipment } from '../../rs/model/PlayerModelLoader';
import { type CombatSupplies, createEmptyCombatSupplies, type EncounterLoadout } from '../../types/encounterLoadout';
import type { Inventory } from '../../types/inventory';
import { createEmptyInventory } from '../../types/inventory';
import { DEFAULT_PLAYER_CONFIG, type EncounterPreset } from '../../types/player';
import { createDefaultStats, createStatsFromBaseLevels, type PlayerStats } from '../../types/playerState';
import { installInputModality } from '../../util/inputModality';
import { EncounterLoadoutSection } from '../EncounterLoadoutSection';

const maxMage = EQUIPMENT_PRESETS.yama_p3['max-mage'];
const melee = EQUIPMENT_PRESETS.yama_p3.melee;
const learnerMage = EQUIPMENT_PRESETS.yama_p3['learner-mage'];

function allLevels(level: number): PlayerStats {
  return createStatsFromBaseLevels({
    attack: level,
    strength: level,
    defence: level,
    ranged: level,
    magic: level,
    prayer: level,
    hitpoints: level,
    agility: 99,
  });
}

function wornName(slot: CustomizableGearSlot, itemId: number | undefined): string {
  return getGearCatalog(slot).find((item) => item.id === itemId)?.name ?? 'empty';
}

interface HarnessProps {
  stats: PlayerStats;
  initialLoadout: EncounterLoadout;
  presetsKey?: string;
  equipmentSpy?: (equipment: PlayerEquipment) => void;
  inventorySpy?: (inventory: Inventory) => void;
  loadoutSpy?: (loadout: EncounterLoadout) => void;
}

/** The complete loadout a preset ships; preset matching is complete-loadout identity. */
function presetLoadout(preset: EncounterPreset): EncounterLoadout {
  return {
    equipment: preset.equipment,
    inventory: preset.inventory,
    supplies: preset.supplies ?? createEmptyCombatSupplies(),
  };
}

function emptyLoadout(): EncounterLoadout {
  return { equipment: {}, inventory: createEmptyInventory(), supplies: createEmptyCombatSupplies() };
}

/**
 * One stateful complete loadout, mirroring the App's wiring: every edit lands through
 * onLoadoutChange and the spies read off it. A fixture that omits supplies would model a
 * loadout the app never has, and matching would silently disagree with the real panel.
 */
function Harness({
  stats,
  initialLoadout,
  presetsKey = 'yama_p3',
  equipmentSpy,
  inventorySpy,
  loadoutSpy,
}: HarnessProps) {
  const [loadout, setLoadout] = useState(initialLoadout);
  return (
    <EncounterLoadoutSection
      encounterKind={presetsKey}
      presetsKey={presetsKey}
      appearance={DEFAULT_PLAYER_CONFIG.appearance}
      stats={stats}
      encounterEquipment={loadout.equipment}
      inventory={loadout.inventory}
      supplies={loadout.supplies}
      onEquipmentChange={() => {}}
      onInventoryChange={() => {}}
      onLoadoutChange={(next) => {
        loadoutSpy?.(next);
        equipmentSpy?.(next.equipment);
        inventorySpy?.(next.inventory);
        setLoadout(next);
      }}
    />
  );
}

function currentLabel(): HTMLElement {
  const el = document.querySelector<HTMLElement>('.loadout-phone-summary strong');
  if (!el) {
    throw new Error('loadout readout not found');
  }
  return el;
}

function inventorySetupString(): string {
  const inventory = new Array(28).fill(null);
  inventory[0] = { id: 6685 };
  const equipment = new Array(14).fill(null);
  equipment[0] = { id: 21018 };
  equipment[3] = { id: 29594 };
  return JSON.stringify({
    setup: { name: 'RuneLite kit', inv: inventory, eq: equipment, sb: 3 },
    layout: [],
  });
}

function showPresets() {
  const change = screen.getByRole('button', { name: /^(Change|Done)$/ });
  if (change.getAttribute('aria-expanded') !== 'true') fireEvent.click(change);
}

function listbox(): HTMLElement {
  showPresets();
  return screen.getByRole('listbox', { name: 'Equipment loadout presets' });
}

function presetOption(name: string | RegExp) {
  showPresets();
  return screen.getByRole('option', { name });
}

describe('EncounterLoadoutSection — current loadout first', () => {
  afterEach(() => vi.restoreAllMocks());

  function inlinePreview(matches: () => boolean) {
    const matchMedia = window.matchMedia.bind(window);
    vi.spyOn(window, 'matchMedia').mockImplementation((query) => {
      const result = matchMedia(query);
      if (query === '(min-width: 721px) and (min-height: 541px)') {
        Object.defineProperty(result, 'matches', { value: matches() });
      }
      return result;
    });
  }

  it('keeps desktop alternatives open for repeated comparison without replacing the gear frame', () => {
    inlinePreview(() => true);
    const loadoutSpy = vi.fn();
    render(<Harness stats={createDefaultStats()} initialLoadout={presetLoadout(maxMage)} loadoutSpy={loadoutSpy} />);
    expect(screen.queryByRole('listbox', { name: 'Equipment loadout presets' })).toBeNull();
    expect(currentLabel()).toHaveTextContent('Max Mage');
    const frame = document.querySelector('.loadout-frame');
    fireEvent.click(presetOption('Melee'));
    expect(loadoutSpy).toHaveBeenLastCalledWith(presetLoadout(melee));
    expect(currentLabel()).toHaveTextContent('Melee');
    expect(screen.getByRole('button', { name: 'Done' })).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByRole('button', { name: /^Head:/ })).toHaveAccessibleName(
      `Head: ${wornName('head', melee.equipment.head)}`,
    );
    // No second Change press: alternatives and the updated kit remain available together.
    fireEvent.click(screen.getByRole('option', { name: 'Max Mage' }));
    expect(loadoutSpy).toHaveBeenLastCalledWith(presetLoadout(maxMage));
    expect(currentLabel()).toHaveTextContent('Max Mage');
    expect(document.querySelector('.loadout-frame')).toBe(frame);
    fireEvent.click(screen.getByRole('button', { name: 'Done' }));
    expect(loadoutSpy).toHaveBeenCalledTimes(2);
    expect(screen.getByRole('button', { name: 'Change' })).toHaveAttribute('aria-expanded', 'false');
  });

  it.each([
    ['phone', 390, 844],
    ['short landscape', 844, 390],
  ] as const)('closes the %s chooser after selecting a preset', (_name, width, height) => {
    inlinePreview(() => width > 720 && height > 540);
    render(<Harness stats={createDefaultStats()} initialLoadout={presetLoadout(maxMage)} />);
    fireEvent.click(presetOption('Melee'));
    expect(currentLabel()).toHaveTextContent('Melee');
    expect(screen.getByRole('button', { name: 'Change' })).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByRole('listbox', { name: 'Equipment loadout presets' })).toBeNull();
  });

  it('uses the current layout when a desktop chooser is resized to compact before selection', () => {
    let inline = true;
    inlinePreview(() => inline);
    render(<Harness stats={createDefaultStats()} initialLoadout={presetLoadout(maxMage)} />);
    fireEvent.click(presetOption('Melee'));
    expect(screen.getByRole('button', { name: 'Done' })).toHaveAttribute('aria-expanded', 'true');
    inline = false;
    fireEvent.click(screen.getByRole('option', { name: 'Max Mage' }));
    expect(screen.getByRole('button', { name: 'Change' })).toHaveAttribute('aria-expanded', 'false');
  });

  it('keeps draft saving visible with alternatives folded and explains what is not saved', () => {
    render(<Harness stats={createDefaultStats()} initialLoadout={{ ...presetLoadout(maxMage), equipment: {} }} />);
    expect(document.querySelector('.loadout-phone-summary')).toHaveTextContent(
      'This loadout is not saved as a preset. Starting the encounter will not save it.',
    );
    expect(screen.getByRole('button', { name: 'Save preset' })).toBeInTheDocument();
    expect(screen.queryByRole('listbox', { name: 'Equipment loadout presets' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Save preset' }));
    expect(screen.getByRole('textbox', { name: 'Preset name' })).toBeInTheDocument();
  });
});

describe('EncounterLoadoutSection — No Equipment fallback', () => {
  it('never offers No Equipment as a selectable row at full stats', () => {
    render(<Harness stats={createDefaultStats()} initialLoadout={presetLoadout(maxMage)} />);

    const list = listbox();
    expect(within(list).queryByText('No Equipment')).toBeNull();
    expect(within(list).getByText('Max Mage')).toBeInTheDocument();
  });

  it('parks on the No Equipment fallback (not a picker row) when every real set is blocked', async () => {
    render(<Harness stats={allLevels(40)} initialLoadout={presetLoadout(maxMage)} />);

    await waitFor(() => expect(currentLabel()).toHaveTextContent('No Equipment (fallback)'));
    expect(screen.getByRole('status')).toHaveTextContent('No Equipment');

    const list = listbox();
    expect(within(list).queryByText('No Equipment')).toBeNull();
    expect(within(list).getAllByRole('img', { name: 'Locked' }).length).toBeGreaterThan(0);
    expect(within(list).getByText('Max Mage')).toBeInTheDocument();
  });

  it('switches an incompatible real set to the first compatible real set in declaration order', async () => {
    const equipmentSpy = vi.fn();
    // attack 79 blocks Melee/Hybrid (need 80) but leaves Max Mage compatible (needs 75 Attack);
    // Max Mage is declared first, so it wins over the also-compatible Learner (Mage).
    const stats = createStatsFromBaseLevels({
      attack: 79,
      strength: 99,
      defence: 99,
      ranged: 99,
      magic: 99,
      prayer: 99,
      hitpoints: 99,
      agility: 99,
    });
    render(<Harness stats={stats} initialLoadout={presetLoadout(melee)} equipmentSpy={equipmentSpy} />);

    await waitFor(() => expect(currentLabel()).toHaveTextContent('Max Mage'));
    expect(screen.getByRole('status')).toHaveTextContent('Switched to Max Mage');
    expect(equipmentSpy).toHaveBeenCalledWith(maxMage.equipment);
  });

  it('recovers from the fallback to the first compatible real set once stats rise', async () => {
    const { rerender } = render(<Harness stats={allLevels(40)} initialLoadout={emptyLoadout()} />);

    await waitFor(() => expect(currentLabel()).toHaveTextContent('No Equipment (fallback)'));

    rerender(<Harness stats={createDefaultStats()} initialLoadout={emptyLoadout()} />);

    await waitFor(() => expect(currentLabel()).toHaveTextContent('Max Mage'));
    expect(currentLabel()).not.toHaveTextContent('fallback');
  });

  it('leaves a draft (non-preset) loadout untouched when stats drop', async () => {
    const equipmentSpy = vi.fn();
    const custom = { ...maxMage.equipment, weapon: 999999 };
    render(
      <Harness
        stats={allLevels(40)}
        initialLoadout={{ ...presetLoadout(maxMage), equipment: custom }}
        equipmentSpy={equipmentSpy}
      />,
    );

    // A draft matches no set at all, so the automatic switch has nothing to move off of:
    // an edit in progress is never rewritten out from under the player.
    await waitFor(() => expect(currentLabel()).toHaveTextContent('Custom'));
    expect(document.querySelector('.loadout-section--drafting')).not.toBeNull();
    expect(equipmentSpy).not.toHaveBeenCalled();
  });

  it('keeps a lobby-only No Equipment group selectable and never marks it a fallback', async () => {
    const equipmentSpy = vi.fn();
    render(
      <Harness stats={allLevels(40)} initialLoadout={emptyLoadout()} presetsKey="lobby" equipmentSpy={equipmentSpy} />,
    );

    expect(currentLabel()).toHaveTextContent('No Equipment');
    expect(currentLabel()).not.toHaveTextContent('fallback');

    const list = listbox();
    expect(within(list).getByText('No Equipment')).toBeInTheDocument();
    expect(equipmentSpy).not.toHaveBeenCalled();
  });
});

describe('EncounterLoadoutSection — complete loadout persistence', () => {
  it('persists equipment, inventory, and supplies together when a preset is auto-switched', async () => {
    // Given: stats block Melee (needs Attack 80) but allow Max Mage (needs Attack 75),
    // starting on Melee. Both sets need Strength 80, so Attack is what separates them.
    const loadoutSpy = vi.fn<(loadout: EncounterLoadout) => void>();
    const stats = createStatsFromBaseLevels({
      attack: 75,
      strength: 99,
      defence: 99,
      ranged: 99,
      magic: 99,
      prayer: 99,
      hitpoints: 99,
      agility: 99,
    });

    render(<Harness stats={stats} initialLoadout={presetLoadout(melee)} loadoutSpy={loadoutSpy} />);

    await waitFor(() =>
      expect(loadoutSpy).toHaveBeenCalledWith({
        equipment: maxMage.equipment,
        inventory: maxMage.inventory,
        supplies: maxMage.supplies ?? createEmptyCombatSupplies(),
      }),
    );
  });
});

describe('EncounterLoadoutSection — gear editing is direct', () => {
  afterEach(() => {
    // Saved loadouts live in module-global storage; a save here must not follow the suite.
    window.localStorage.removeItem('osrs-custom-equipment-presets');
  });

  function renderAtPreset(preset: typeof maxMage, equipmentSpy?: (equipment: PlayerEquipment) => void) {
    return render(
      <Harness stats={createDefaultStats()} initialLoadout={presetLoadout(preset)} equipmentSpy={equipmentSpy} />,
    );
  }

  const renderAtMelee = (equipmentSpy?: (equipment: PlayerEquipment) => void) => renderAtPreset(melee, equipmentSpy);

  /** The diagram cell for a slot. Its label names the slot AND what is worn in it. */
  function slotCell(label: string): HTMLElement {
    return screen.getByRole('button', { name: new RegExp(`^${label}: `) });
  }

  /** Strip the head slot: the shortest way to a loadout that matches no set. */
  function clearHead(): void {
    fireEvent.click(slotCell('Head'));
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Clear slot' }));
  }

  /** A saved set that is not what the panel is wearing, so its name is simply taken. */
  function seedSavedPreset(name: string): void {
    window.localStorage.setItem(
      'osrs-custom-equipment-presets',
      JSON.stringify({
        yama_p3: [
          {
            id: 'seeded',
            name,
            loadout: {
              equipment: {},
              inventory: createEmptyInventory(),
              supplies: createEmptyCombatSupplies(),
            },
          },
        ],
      }),
    );
  }

  function seedEditablePresets() {
    const first = { id: 'mine', name: 'My melee', loadout: presetLoadout(melee) };
    const second = { id: 'spare', name: 'Spare mage', loadout: presetLoadout(maxMage) };
    window.localStorage.setItem('osrs-custom-equipment-presets', JSON.stringify({ yama_p3: [first, second] }));
    return { first, second };
  }

  function storedPresets() {
    return JSON.parse(window.localStorage.getItem('osrs-custom-equipment-presets') ?? '{}').yama_p3;
  }

  it('explicitly updates a saved set in place with equipment, inventory and supplies edits', () => {
    const { first, second } = seedEditablePresets();
    renderAtMelee();
    clearHead();
    fireEvent.click(screen.getByRole('button', { name: /^Inventory slot 1:/ }));
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Clear slot' }));
    fireEvent.click(screen.getByRole('radio', { name: 'Ancient' }));

    expect(currentLabel()).toHaveTextContent('My melee');
    expect(document.querySelector('.loadout-bar .loadout-current-state')).toHaveTextContent(
      'Loadout not saved as a preset.',
    );
    expect(storedPresets()[0]).toEqual(first);
    expect(screen.getByRole('button', { name: 'Save new preset' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Update preset' }));

    const saved = storedPresets();
    expect(saved).toHaveLength(2);
    expect(saved[0]).toMatchObject({ id: 'mine', name: 'My melee' });
    expect(saved[0].loadout.equipment.head).toBeUndefined();
    expect(saved[0].loadout.inventory[0]).toBeNull();
    expect(saved[0].loadout.supplies.spellbook).toBe('ancient');
    expect(saved[1]).toEqual(second);
    expect(screen.getByRole('status')).toHaveTextContent('Updated preset: My melee.');
    expect(currentLabel()).toHaveTextContent('My melee');
    expect(currentLabel()).not.toHaveTextContent('unsaved');
    expect(presetOption('My melee')).toHaveAttribute('aria-selected', 'true');
    expect(screen.queryByRole('button', { name: 'Update preset' })).toBeNull();
    expect(document.querySelector('.loadout-current-state')).toBeNull();
  });

  it('can save a separate copy without changing the original and selects the copy', () => {
    const { first } = seedEditablePresets();
    renderAtMelee();
    clearHead();
    fireEvent.click(screen.getByRole('button', { name: 'Save new preset' }));
    fireEvent.change(screen.getByLabelText('Preset name'), { target: { value: 'New melee' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save preset' }));
    expect(storedPresets()).toHaveLength(3);
    expect(storedPresets()[0]).toEqual(first);
    expect(storedPresets()[2]).toMatchObject({ name: 'New melee' });
    expect(storedPresets()[2].id).not.toBe('mine');
    expect(presetOption('New melee')).toHaveAttribute('aria-selected', 'true');
    // Equal data must not redirect a second edit to the older saved set.
    fireEvent.click(screen.getByRole('radio', { name: 'Ancient' }));
    expect(currentLabel()).toHaveTextContent('New melee');
    expect(document.querySelector('.loadout-bar .loadout-current-state')).toHaveTextContent(
      'Loadout not saved as a preset.',
    );
  });

  it('cancels naming back to the edited set, and Revert discards all edits without saving', () => {
    const { first } = seedEditablePresets();
    renderAtMelee();
    clearHead();
    fireEvent.click(screen.getByRole('button', { name: 'Save new preset' }));
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(currentLabel()).toHaveTextContent('My melee');
    expect(document.querySelector('.loadout-bar .loadout-current-state')).toHaveTextContent(
      'Loadout not saved as a preset.',
    );
    expect(screen.getByRole('button', { name: 'Head: empty' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Update preset' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Revert to My melee' }));
    expect(screen.getByRole('button', { name: /^Head:/ })).toHaveAccessibleName(
      `Head: ${wornName('head', melee.equipment.head)}`,
    );
    expect(storedPresets()[0]).toEqual(first);
    expect(screen.queryByRole('button', { name: 'Update preset' })).toBeNull();
  });

  it('switches edit targets only when a different set is chosen', () => {
    const { first } = seedEditablePresets();
    renderAtMelee();
    clearHead();
    fireEvent.click(presetOption('Spare mage'));
    expect(screen.queryByRole('button', { name: 'Update preset' })).toBeNull();
    clearHead();
    expect(currentLabel()).toHaveTextContent('Spare mage');
    expect(document.querySelector('.loadout-bar .loadout-current-state')).toHaveTextContent(
      'Loadout not saved as a preset.',
    );
    fireEvent.click(screen.getByRole('button', { name: 'Update preset' }));
    expect(storedPresets()[0]).toEqual(first);
    expect(storedPresets()[1].loadout.equipment.head).toBeUndefined();
    fireEvent.click(presetOption('Melee'));
    clearHead();
    expect(screen.queryByRole('button', { name: 'Update preset' })).toBeNull();
    expect(screen.getByRole('button', { name: 'Save preset' })).toBeInTheDocument();
    expect(EQUIPMENT_PRESETS.yama_p3.melee).toBe(melee);
    expect(melee.equipment.head).toBe(first.loadout.equipment.head);
  });

  it('keeps the original update target when an edit matches another saved set', () => {
    const first = { id: 'mine', name: 'My melee', loadout: presetLoadout(melee) };
    const second = {
      id: 'spare',
      name: 'Ancient melee',
      loadout: {
        ...presetLoadout(melee),
        supplies: { ...presetLoadout(melee).supplies, spellbook: 'ancient' },
      },
    };
    window.localStorage.setItem('osrs-custom-equipment-presets', JSON.stringify({ yama_p3: [first, second] }));
    renderAtMelee();
    fireEvent.click(screen.getByRole('radio', { name: 'Ancient' }));
    expect(currentLabel()).toHaveTextContent('My melee');
    expect(document.querySelector('.loadout-bar .loadout-current-state')).toHaveTextContent(
      'Loadout not saved as a preset.',
    );
    fireEvent.click(screen.getByRole('button', { name: 'Update preset' }));
    expect(storedPresets()[0].loadout.supplies.spellbook).toBe('ancient');
    expect(storedPresets()[1]).toEqual(second);
    expect(presetOption('My melee')).toHaveAttribute('aria-selected', 'true');
  });

  it('keeps edits when deletion is declined and cannot update a deleted target', () => {
    seedEditablePresets();
    renderAtMelee();
    clearHead();
    showPresets();
    fireEvent.click(screen.getByRole('button', { name: 'Delete My melee' }));
    fireEvent.click(screen.getByRole('button', { name: 'Keep' }));
    expect(screen.getByRole('button', { name: 'Update preset' })).toBeInTheDocument();
    expect(storedPresets()).toHaveLength(2);
    showPresets();
    fireEvent.click(screen.getByRole('button', { name: 'Delete My melee' }));
    fireEvent.click(
      within(screen.getByRole('group', { name: 'Delete My melee?' })).getByRole('button', { name: 'Delete' }),
    );
    expect(storedPresets()).toHaveLength(1);
    expect(screen.getByRole('button', { name: 'Head: empty' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Update preset' })).toBeNull();
    expect(screen.queryByRole('button', { name: /^Revert/ })).toBeNull();
    expect(screen.getByRole('button', { name: 'Save preset' })).toBeInTheDocument();
  });

  it('opens a slot with nothing to enter first', () => {
    renderAtMelee();

    // No session, no mode, no permission to ask for: the cell that shows the piece is the
    // cell that changes it, and it says what it is holding.
    expect(slotCell('Weapon')).toHaveAccessibleName(`Weapon: ${wornName('weapon', melee.equipment.weapon)}`);

    fireEvent.click(slotCell('Weapon'));

    expect(screen.getByRole('listbox', { name: 'Weapon gear' })).toBeInTheDocument();
    expect(slotCell('Weapon')).toHaveAttribute('aria-pressed', 'true');
  });

  it('offers no Customize action anywhere, because editing is never off', () => {
    renderAtMelee();

    expect(screen.queryByRole('button', { name: /^Customize/ })).toBeNull();
    expect(screen.queryByRole('button', { name: /scratch|blank|new loadout/i })).toBeNull();
    // A shipped tile carries no action, so nothing but the sets themselves is in the grid.
    expect(screen.queryByRole('button', { name: /^Delete/ })).toBeNull();
  });

  it('puts a slot in hand when its cell is clicked, and puts it back down on the next click', () => {
    renderAtMelee();

    fireEvent.click(slotCell('Head'));

    expect(screen.getByRole('listbox', { name: 'Head gear' })).toBeInTheDocument();
    expect(slotCell('Head')).toHaveAttribute('aria-pressed', 'true');

    fireEvent.click(slotCell('Head'));

    expect(screen.queryByRole('listbox', { name: 'Head gear' })).toBeNull();
    expect(slotCell('Head')).toHaveAttribute('aria-pressed', 'false');
  });

  it('clears a slot to empty, and the two-handed rule shows up in the picture', () => {
    const equipmentSpy = vi.fn();
    renderAtMelee(equipmentSpy);

    clearHead();
    expect(screen.getByRole('button', { name: 'Head: empty' })).toBeInTheDocument();

    expect(slotCell('Shield')).toHaveAccessibleName(`Shield: ${wornName('shield', melee.equipment.shield)}`);
    fireEvent.click(slotCell('Weapon'));
    fireEvent.change(screen.getByRole('combobox', { name: 'Search supported weapon gear' }), {
      target: { value: 'toxic blowpipe' },
    });
    fireEvent.click(presetOption(/^Toxic blowpipe/));

    expect(equipmentSpy).toHaveBeenLastCalledWith(expect.objectContaining({ weapon: 12926 }));
    // The rule is not a message: the shield comes off in the picture.
    expect(screen.getByRole('button', { name: 'Shield: empty' })).toBeInTheDocument();
    // And the slot is put back down: the question was which item, and it has been answered.
    // The cell it opened from takes the focus back, so the keyboard is never left nowhere.
    expect(screen.queryByRole('listbox', { name: 'Weapon gear' })).toBeNull();
    expect(document.activeElement).toBe(slotCell('Weapon'));
  });

  it('opens the ammunition slot like every other cell', () => {
    renderAtMelee();

    // Ammo is edited from the same diagram as the gear; only where it is STORED differs.
    fireEvent.click(screen.getByRole('button', { name: /^Ammo/ }));

    expect(screen.getByRole('listbox', { name: 'Ammunition' })).toBeInTheDocument();
  });

  it('still says ammunition never runs out while the slot is empty', () => {
    renderAtMelee();

    expect(screen.getByRole('button', { name: /^Ammo/ })).toHaveAccessibleName(/Never runs out/);
    expect(screen.getByRole('img', { name: 'Unlimited' })).toBeInTheDocument();
  });

  it('reads as a draft the moment the loadout stops matching a set', () => {
    renderAtMelee();

    // Wearing a set, nothing in the panel may claim otherwise.
    expect(currentLabel()).toHaveTextContent('Melee');
    expect(document.querySelector('.loadout-section--drafting')).toBeNull();

    clearHead();

    // Now the panel is showing something that is not any set, and marks it in the bar and
    // on the frame — without spending the gold the selected slot already owns.
    expect(currentLabel()).toHaveTextContent('Custom loadout');
    expect(document.querySelector('.loadout-section--drafting')).not.toBeNull();
  });

  it('keeps Save out of the bar until there is a draft to keep', () => {
    renderAtMelee();

    expect(screen.queryByRole('button', { name: /^Save/ })).toBeNull();
    expect(screen.queryByRole('button', { name: /^Revert/ })).toBeNull();

    clearHead();

    expect(screen.getByRole('button', { name: 'Save preset' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Revert to Melee' })).toBeInTheDocument();
  });

  it('asks for the name at the press that saves, and keeps the draft under it', () => {
    renderAtMelee();
    clearHead();

    // Nothing holds a name field open; the save press is what opens it.
    expect(screen.queryByLabelText('Preset name')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Save preset' }));
    expect(screen.getByLabelText('Preset name')).toHaveValue('Melee (custom)');

    fireEvent.click(screen.getByRole('button', { name: 'Save preset' }));

    // The field opens on a name its own save accepts, so this never hits the duplicate
    // refusal — and the loadout now matches a set, so it is no longer a draft.
    expect(screen.getByRole('status')).toHaveTextContent('Saved preset: Melee (custom).');
    expect(currentLabel()).toHaveTextContent('Melee (custom)');
    expect(screen.queryByRole('button', { name: 'Save preset' })).toBeNull();
    expect(document.querySelector('.loadout-current-state')).toBeNull();
    showPresets();
    expect(screen.getByRole('heading', { name: /^Saved/ })).toHaveTextContent('Saved presets (1)');
  });

  it('refuses a duplicate or empty name without closing the field it happened in', () => {
    seedSavedPreset('Taken');
    renderAtMelee();
    clearHead();

    fireEvent.click(screen.getByRole('button', { name: 'Save preset' }));
    fireEvent.change(screen.getByLabelText('Preset name'), { target: { value: 'Taken' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save preset' }));

    // The refusal names the problem and leaves the recovery under the caret: the field is
    // still open, still holding what was typed, and the draft is still there to save.
    expect(screen.getByRole('status')).toHaveTextContent('A preset named Taken already exists.');
    expect(screen.getByLabelText('Preset name')).toHaveValue('Taken');

    fireEvent.change(screen.getByLabelText('Preset name'), { target: { value: '   ' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save preset' }));

    expect(screen.getByRole('status')).toHaveTextContent('Enter a preset name.');
    expect(screen.getByLabelText('Preset name')).toBeInTheDocument();
  });

  it('backs out of naming without touching the draft', () => {
    renderAtMelee();
    clearHead();

    fireEvent.click(screen.getByRole('button', { name: 'Save preset' }));
    fireEvent.keyDown(screen.getByLabelText('Preset name'), { key: 'Escape' });

    expect(screen.queryByLabelText('Preset name')).toBeNull();
    expect(currentLabel()).toHaveTextContent('Custom loadout');
    expect(screen.getByRole('button', { name: 'Save preset' })).toBeInTheDocument();
  });

  it('puts the last matched set back when the draft is reverted', () => {
    const equipmentSpy = vi.fn();
    renderAtMelee(equipmentSpy);
    clearHead();

    fireEvent.click(screen.getByRole('button', { name: 'Revert to Melee' }));

    // One press undoes every edit, which is what makes a stray click on a slot safe.
    expect(equipmentSpy).toHaveBeenLastCalledWith(melee.equipment);
    expect(currentLabel()).toHaveTextContent('Melee');
    expect(document.querySelector('.loadout-section--drafting')).toBeNull();
  });

  it('offers no way back when the loadout never matched a set', () => {
    render(
      <Harness
        stats={createDefaultStats()}
        initialLoadout={{ ...presetLoadout(maxMage), equipment: { ...maxMage.equipment, weapon: 999999 } }}
      />,
    );

    // Nothing was ever worn here, so there is nothing to name as the way back, and the
    // control is left out rather than inventing a target.
    expect(currentLabel()).toHaveTextContent('Custom loadout');
    expect(screen.getByRole('button', { name: 'Save preset' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^Revert/ })).toBeNull();
  });

  it('drops the loadout into a draft when the saved set it matches is deleted', () => {
    renderAtMelee();
    clearHead();
    fireEvent.click(screen.getByRole('button', { name: 'Save preset' }));
    fireEvent.click(screen.getByRole('button', { name: 'Save preset' }));

    showPresets();
    fireEvent.click(screen.getByRole('button', { name: 'Delete Melee (custom)' }));
    fireEvent.click(
      within(screen.getByRole('group', { name: 'Delete Melee (custom)?' })).getByRole('button', { name: 'Delete' }),
    );

    // The gear stays on; only the set it was filed under is gone. So the panel says what
    // it now is — a draft — and Save is right there to file it again.
    expect(screen.getByRole('status')).toHaveTextContent('Deleted preset: Melee (custom).');
    expect(currentLabel()).toHaveTextContent('Custom loadout');
    expect(screen.getByRole('button', { name: 'Save preset' })).toBeInTheDocument();
    // The way back named a set that no longer exists, so it is not offered.
    expect(screen.queryByRole('button', { name: /^Revert/ })).toBeNull();
  });

  it('takes a set chosen beside the draft, and that set becomes the loadout', () => {
    const equipmentSpy = vi.fn();
    renderAtMelee(equipmentSpy);
    clearHead();
    equipmentSpy.mockClear();

    fireEvent.click(presetOption('Max Mage'));

    expect(equipmentSpy).toHaveBeenLastCalledWith(maxMage.equipment);
    expect(currentLabel()).toHaveTextContent('Max Mage');
    expect(screen.queryByRole('button', { name: /^Save/ })).toBeNull();
  });

  it('keeps an untouched set selected, supplies included in the match', () => {
    renderAtMelee();

    // The Melee set ships its own supplies; wearing the complete set is not a draft.
    expect(currentLabel()).toHaveTextContent('Melee');
    expect(document.querySelector('.loadout-section--drafting')).toBeNull();
    expect(screen.queryByRole('button', { name: /^Save(?: loadout)?$/ })).toBeNull();
    expect(screen.queryByRole('button', { name: /^Revert/ })).toBeNull();
  });

  it('reads an ammo-only edit as a draft, and Revert puts the set back whole', () => {
    renderAtMelee();

    // Ammunition lives on supplies: this edit leaves gear and inventory exactly the set's own.
    fireEvent.click(screen.getByRole('button', { name: /^Ammo/ }));
    fireEvent.change(screen.getByRole('combobox', { name: 'Search supported ammunition' }), {
      target: { value: 'dragon arrow' },
    });
    fireEvent.click(screen.getAllByRole('option', { name: 'Dragon arrow' })[0]);

    expect(currentLabel()).toHaveTextContent('Custom loadout');
    expect(document.querySelector('.loadout-section--drafting')).not.toBeNull();
    expect(screen.getByRole('button', { name: 'Save preset' })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Revert to Melee' }));

    // Revert re-applies the SET, supplies included: the ammo cell reads empty again.
    expect(currentLabel()).toHaveTextContent('Melee');
    expect(document.querySelector('.loadout-section--drafting')).toBeNull();
    expect(screen.getByRole('button', { name: /^Ammo/ })).toHaveAccessibleName(/empty/);
  });

  it('saves a spellbook-only draft into a set the picker then shows as selected', () => {
    renderAtMelee();

    // The spellbook lives on supplies; flipping it changes nothing else in the loadout.
    fireEvent.click(screen.getByRole('radio', { name: 'Ancient' }));

    expect(currentLabel()).toHaveTextContent('Custom loadout');
    expect(document.querySelector('.loadout-section--drafting')).not.toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'Save preset' }));
    expect(screen.getByLabelText('Preset name')).toHaveValue('Melee (custom)');
    fireEvent.click(screen.getByRole('button', { name: 'Save preset' }));

    // The saved set matches on the same complete identity — spellbook included — so the
    // draft ends by being answered, exactly like a gear draft's save.
    expect(screen.getByRole('status')).toHaveTextContent('Saved preset: Melee (custom).');
    expect(currentLabel()).toHaveTextContent('Melee (custom)');
    expect(document.querySelector('.loadout-section--drafting')).toBeNull();
    expect(screen.queryByRole('button', { name: /^Save(?: loadout)?$/ })).toBeNull();
  });

  it('keeps a supplies-only draft when stats drop, exactly like a gear draft', () => {
    const loadoutSpy = vi.fn<(loadout: EncounterLoadout) => void>();
    const { rerender } = render(
      <Harness stats={createDefaultStats()} initialLoadout={presetLoadout(melee)} loadoutSpy={loadoutSpy} />,
    );

    fireEvent.click(screen.getByRole('radio', { name: 'Ancient' }));
    expect(currentLabel()).toHaveTextContent('Custom loadout');
    loadoutSpy.mockClear();

    rerender(<Harness stats={allLevels(40)} initialLoadout={presetLoadout(melee)} loadoutSpy={loadoutSpy} />);

    // The auto-switch only moves SETS; a draft — including a supplies-only one — is never
    // rewritten, so the spellbook edit survives the stats drop.
    expect(loadoutSpy).not.toHaveBeenCalled();
    expect(currentLabel()).toHaveTextContent('Custom loadout');
    expect(document.querySelector('.loadout-section--drafting')).not.toBeNull();
  });
});

describe('EncounterLoadoutSection — the picker opens on the slot', () => {
  const SARADOMIN_BREW = 6685;
  const SUPER_RESTORE = 3024;
  const ANGLERFISH = 13441;
  const TOXIC_BLOWPIPE = 12926;
  const UNSUPPORTED_ITEM = 999999;

  afterEach(() => {
    window.localStorage.removeItem('osrs-custom-equipment-presets');
  });

  /**
   * A set the player already saved. Unlike a shipped preset it can hold a saved stack count or
   * an item this build does not support, which is exactly what the picker has to
   * read back.
   */
  function stockedInventory(): Inventory {
    const inventory = createEmptyInventory();
    inventory[0] = { id: SARADOMIN_BREW, quantity: 3 };
    inventory[1] = { id: UNSUPPORTED_ITEM };
    return inventory;
  }

  function seedSavedKit(): void {
    window.localStorage.setItem(
      'osrs-custom-equipment-presets',
      JSON.stringify({
        yama_p3: [
          {
            id: 'field-kit',
            name: 'Field kit',
            loadout: { equipment: {}, inventory: stockedInventory(), supplies: createEmptyCombatSupplies() },
          },
        ],
      }),
    );
  }

  /** Wearing a saved set with a stocked inventory. Every cell of it is already live. */
  function renderSavedKit(inventorySpy?: (inventory: Inventory) => void) {
    seedSavedKit();
    return render(
      <Harness
        stats={createDefaultStats()}
        initialLoadout={{ equipment: {}, inventory: stockedInventory(), supplies: createEmptyCombatSupplies() }}
        inventorySpy={inventorySpy}
      />,
    );
  }

  function cell(name: RegExp | string): HTMLElement {
    return screen.getByRole('button', { name });
  }

  function picker(): HTMLElement {
    const element = document.querySelector<HTMLElement>('.slot-picker');
    if (!element) {
      throw new Error('picker not found');
    }
    return element;
  }

  function loadoutSection(): HTMLElement {
    const element = document.querySelector<HTMLElement>('.loadout-section');
    if (!element) {
      throw new Error('loadout section not found');
    }
    return element;
  }

  function anchorRect(element: HTMLElement, left: number, top: number) {
    element.getBoundingClientRect = () =>
      ({
        left,
        top,
        right: left + 44,
        bottom: top + 44,
        width: 44,
        height: 44,
        x: left,
        y: top,
        toJSON: () => ({}),
      }) as DOMRect;
  }

  it('opens on the cell that was clicked, in a layer above the panel', () => {
    renderSavedKit();
    const head = cell(/^Head: /);
    anchorRect(head, 300, 216);

    fireEvent.click(head);

    // Attached to that cell's box, not to the end of the column it lives in.
    expect(picker().style.left).toBe('300px');
    expect(picker().style.top).toBe('264px');
    expect(picker().parentElement).toBe(document.body);
  });

  it('costs the scrolling column nothing to open a slot', () => {
    renderSavedKit();
    const before = loadoutSection().querySelectorAll('*').length;

    fireEvent.click(cell(/^Head: /));

    // The picker is not in this column at all.
    expect(loadoutSection().querySelectorAll('*').length).toBe(before);
    expect(loadoutSection().querySelector('.slot-picker')).toBeNull();
  });

  it('opens the same picker for an inventory slot, holding what is in it', () => {
    renderSavedKit();

    fireEvent.click(cell('Inventory slot 1: Saradomin brew(4)'));

    expect(screen.getByRole('listbox', { name: 'Inventory items' })).toBeInTheDocument();
    expect(presetOption('Saradomin brew(4)')).toHaveAttribute('aria-selected', 'true');
    expect(cell('Inventory slot 1: Saradomin brew(4)')).toHaveAttribute('aria-pressed', 'true');
  });

  it('offers the consumables the engine simulates, and the gear a preset switches to', () => {
    renderSavedKit();
    fireEvent.click(cell('Inventory slot 3: empty'));
    const search = screen.getByRole('combobox', { name: 'Search supported inventory items' });

    fireEvent.change(search, { target: { value: 'anglerfish' } });
    expect(presetOption('Anglerfish')).toBeInTheDocument();

    fireEvent.change(search, { target: { value: 'toxic blowpipe' } });
    expect(presetOption(/^Toxic blowpipe/)).toBeInTheDocument();
  });

  it('swaps the item without carrying over the old slot\u2019s stack count', () => {
    const inventorySpy = vi.fn<(inventory: Inventory) => void>();
    renderSavedKit(inventorySpy);

    fireEvent.click(cell('Inventory slot 1: Saradomin brew(4)'));
    fireEvent.change(screen.getByRole('combobox', { name: 'Search supported inventory items' }), {
      target: { value: 'super restore(4)' },
    });
    fireEvent.click(presetOption('Super restore(4)'));

    // Stacks never deplete, so a loadout slot holds only an id.
    expect(inventorySpy.mock.lastCall?.[0][0]).toEqual({ id: SUPER_RESTORE });
  });

  it('fills an empty slot with the item id alone', () => {
    const inventorySpy = vi.fn<(inventory: Inventory) => void>();
    renderSavedKit(inventorySpy);

    fireEvent.click(cell('Inventory slot 3: empty'));
    fireEvent.change(screen.getByRole('combobox', { name: 'Search supported inventory items' }), {
      target: { value: 'anglerfish' },
    });
    fireEvent.click(presetOption('Anglerfish'));

    expect(inventorySpy.mock.lastCall?.[0][2]).toEqual({ id: ANGLERFISH });
  });

  it('clears an inventory slot back to empty', () => {
    const inventorySpy = vi.fn<(inventory: Inventory) => void>();
    renderSavedKit(inventorySpy);

    fireEvent.click(cell('Inventory slot 1: Saradomin brew(4)'));
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Clear slot' }));

    expect(inventorySpy.mock.lastCall?.[0][0]).toBeNull();
  });

  it('names an inventory item it cannot resolve rather than showing a bare id', () => {
    renderSavedKit();

    fireEvent.click(cell(/^Inventory slot 2: unsupported item/));

    expect(screen.getByRole('group', { name: 'Current item' })).toHaveTextContent('Unsupported item');
  });

  it('closes on Escape and hands the cell back its focus', () => {
    renderSavedKit();
    const head = cell(/^Head: /);
    fireEvent.click(head);

    fireEvent.keyDown(screen.getByRole('combobox', { name: 'Search supported head gear' }), { key: 'Escape' });

    expect(document.querySelector('.slot-picker')).toBeNull();
    expect(document.activeElement).toBe(head);
    expect(head).toHaveAttribute('aria-pressed', 'false');
  });

  it('closes on a press outside without stealing that press', () => {
    renderSavedKit();
    fireEvent.click(cell(/^Head: /));

    fireEvent.mouseDown(loadoutSection());

    expect(document.querySelector('.slot-picker')).toBeNull();
    expect(document.activeElement).not.toBe(cell(/^Head: /));
  });

  it('edits gear through the anchored picker, two-handed rule included', () => {
    const equipmentSpy = vi.fn<(equipment: PlayerEquipment) => void>();
    render(<Harness stats={createDefaultStats()} initialLoadout={presetLoadout(melee)} equipmentSpy={equipmentSpy} />);

    fireEvent.click(cell(/^Weapon: /));
    fireEvent.change(screen.getByRole('combobox', { name: 'Search supported weapon gear' }), {
      target: { value: 'toxic blowpipe' },
    });
    fireEvent.click(presetOption(/^Toxic blowpipe/));

    expect(equipmentSpy).toHaveBeenLastCalledWith(expect.objectContaining({ weapon: TOXIC_BLOWPIPE }));
    // The rule is not a message: the shield comes off in the picture.
    expect(cell('Shield: empty')).toBeInTheDocument();
  });

  it('puts the slot down when a whole set lands on top of it', () => {
    renderSavedKit();
    fireEvent.click(cell(/^Head: /));
    expect(document.querySelector('.slot-picker')).not.toBeNull();

    fireEvent.click(presetOption('Max Mage'));

    // The set replaces everything the picker was editing, so it takes the anchored layer
    // with it rather than leaving it pointed at a cell that has been redrawn.
    expect(document.querySelector('.slot-picker')).toBeNull();
  });
});

describe('EncounterLoadoutSection — the loadout is buildable from the keyboard', () => {
  function renderKit() {
    return render(<Harness stats={createDefaultStats()} initialLoadout={presetLoadout(melee)} />);
  }

  function cell(name: RegExp | string): HTMLElement {
    return screen.getByRole('button', { name });
  }

  function grid(label: string): HTMLElement {
    return screen.getByRole('group', { name: label });
  }

  it('crosses the equipment diagram with the arrow keys', () => {
    renderKit();
    const head = cell(/^Head: /);
    head.focus();

    fireEvent.keyDown(grid('Equipment'), { key: 'ArrowDown' });
    expect(document.activeElement).toBe(cell(/^Amulet: /));

    fireEvent.keyDown(grid('Equipment'), { key: 'ArrowLeft' });
    expect(document.activeElement).toBe(cell(/^Cape: /));

    // Nothing sits under the hands, so down still moves rather than refusing.

    cell(/^Hands: /).focus();
    fireEvent.keyDown(grid('Equipment'), { key: 'ArrowDown' });
    expect(document.activeElement).toBe(cell(/^Boots: /));
  });

  it('crosses the inventory by row and column', () => {
    renderKit();
    cell(/^Inventory slot 1: /).focus();

    fireEvent.keyDown(grid('Inventory'), { key: 'ArrowRight' });
    expect(document.activeElement).toBe(cell(/^Inventory slot 2: /));

    fireEvent.keyDown(grid('Inventory'), { key: 'ArrowDown' });
    expect(document.activeElement).toBe(cell(/^Inventory slot 6: /));
  });

  it('carries focus between the diagram and the inventory, but only sideways', () => {
    renderKit();

    // They sit side by side, so left and right are the axis between them.
    cell(/^Shield: /).focus();
    fireEvent.keyDown(grid('Equipment'), { key: 'ArrowRight' });
    expect(document.activeElement).toBe(cell(/^Inventory slot 9: /));

    fireEvent.keyDown(grid('Inventory'), { key: 'ArrowLeft' });
    expect(document.activeElement).toBe(cell(/^Shield: /));

    // Ammunition sits between the amulet and the inventory and is editable like the rest,
    // so the row stops on it on the way across rather than reading straight through.
    cell(/^Amulet: /).focus();
    fireEvent.keyDown(grid('Equipment'), { key: 'ArrowRight' });
    expect(document.activeElement).toBe(cell(/^Ammo: /));
    fireEvent.keyDown(grid('Equipment'), { key: 'ArrowRight' });
    expect(document.activeElement).toBe(cell(/^Inventory slot 5: /));
    fireEvent.keyDown(grid('Inventory'), { key: 'ArrowLeft' });
    expect(document.activeElement).toBe(cell(/^Ammo: /));

    // Down from the foot of the diagram must not drop into the middle of the inventory: each
    // side owns its own vertical.
    cell(/^Boots: /).focus();
    fireEvent.keyDown(grid('Equipment'), { key: 'ArrowDown' });
    expect(document.activeElement).toBe(cell(/^Boots: /));
  });

  it('spends one tab stop on the whole loadout instead of one per cell', () => {
    renderKit();

    // 10 gear cells and 28 inventory cells would be 38 tab presses to cross a loadout. They
    // are one arrow space, so they are one tab stop: only the cell the arrows last left.
    const stops = () =>
      Array.from(document.querySelectorAll<HTMLElement>('.loadout-frame [data-grid-cell]')).filter(
        (element) => element.tabIndex === 0,
      );
    expect(stops()).toEqual([cell(/^Head: /)]);

    // And the stop follows the arrows, so tabbing back in returns to where the player left off.
    cell(/^Head: /).focus();
    fireEvent.keyDown(grid('Equipment'), { key: 'ArrowDown' });
    expect(stops()).toEqual([cell(/^Amulet: /)]);
  });

  it('opens a slot, keeps the caret in the search field, and lands back on the cell', () => {
    const equipmentSpy = vi.fn<(equipment: PlayerEquipment) => void>();
    render(<Harness stats={createDefaultStats()} initialLoadout={presetLoadout(melee)} equipmentSpy={equipmentSpy} />);
    const weapon = cell(/^Weapon: /);
    weapon.focus();

    // Enter opens the picker on the focused cell, exactly as a click does.
    fireEvent.click(weapon);
    // The caret never leaves the field: down moves a cursor through the list, so the query
    // stays editable the whole time and left/right stay text editing.
    const search = () => screen.getByRole('combobox', { name: 'Search supported weapon gear' });
    fireEvent.keyDown(search(), { key: 'ArrowDown' });
    expect(document.activeElement).toBe(search());

    fireEvent.change(search(), { target: { value: 'blowpipe' } });
    expect(document.activeElement).toBe(search());

    // Empty heads a filtered list, so this is the one row a query can never move.
    fireEvent.click(screen.getByRole('button', { name: 'Clear slot' }));

    expect(equipmentSpy.mock.lastCall?.[0].weapon).toBeUndefined();
    expect(document.activeElement).toBe(cell(/^Weapon: /));
  });

  // The cells' focus mark is gated on keyboard input modality, and Tab cannot set it here: the
  // app swallows Tab and blurs. So the arrows themselves have to, or they move an invisible focus.
  it('shows where the arrows are after a slot is clicked, picked and handed back', () => {
    const uninstall = installInputModality();
    try {
      renderKit();
      const slot = cell(/^Inventory slot 1: /);
      fireEvent.pointerDown(slot, { pointerType: 'mouse' });
      slot.focus();
      fireEvent.click(slot);
      fireEvent.keyDown(screen.getByRole('combobox', { name: /^Search supported/ }), { key: 'Escape' });
      expect(document.activeElement).toBe(cell(/^Inventory slot 1: /));

      fireEvent.keyDown(cell(/^Inventory slot 1: /), { key: 'ArrowRight' });
      expect(document.activeElement).toBe(cell(/^Inventory slot 2: /));
      expect(document.documentElement.dataset.focusSource).toBe('keyboard');
    } finally {
      uninstall();
    }
  });
});

describe('EncounterLoadoutSection — a set lands in the frame that is already there', () => {
  it('groups supplies below the roving grids and labels the whole editor with shared guidance', () => {
    render(
      <EncounterLoadoutSection
        encounterKind="yama_p3"
        presetsKey="yama_p3"
        appearance={DEFAULT_PLAYER_CONFIG.appearance}
        stats={createDefaultStats()}
        encounterEquipment={melee.equipment}
        inventory={melee.inventory}
        supplies={melee.supplies ?? createEmptyCombatSupplies()}
        onEquipmentChange={vi.fn()}
        onInventoryChange={vi.fn()}
        onLoadoutChange={vi.fn()}
      />,
    );

    const editor = document.querySelector<HTMLElement>('.loadout-editor');
    const frame = document.querySelector<HTMLElement>('.loadout-frame');
    const runePouch = document.querySelector<HTMLElement>('.rune-pouch-row');
    const spellbook = document.querySelector<HTMLElement>('.spellbook-row');
    const footer = document.querySelector<HTMLElement>('.loadout-supplies');
    expect(editor).not.toBeNull();
    expect(runePouch).not.toBeNull();

    // Supply controls stay outside the equipment/inventory keyboard-navigation group.
    expect(frame).not.toContainElement(runePouch);
    expect(frame?.querySelector('.inventory-grid')).not.toBeNull();
    const guidance = document.querySelector<HTMLElement>('.loadout-editor-guidance');
    expect(Array.from(editor?.children ?? [])).toEqual([frame, footer]);
    expect(Array.from(footer?.children ?? [])).toEqual([spellbook, runePouch]);
    expect(frame?.lastElementChild).toBe(guidance);
    expect(document.querySelector('.loadout-equipment-column')).not.toContainElement(guidance);
  });

  it('redraws the loadout in place across rapid preset choices', () => {
    const equipmentSpy = vi.fn<(equipment: PlayerEquipment) => void>();
    render(<Harness stats={createDefaultStats()} initialLoadout={presetLoadout(melee)} equipmentSpy={equipmentSpy} />);
    const frame = document.querySelector('.loadout-frame');
    const inventoryGrid = document.querySelector('.inventory-grid');
    expect(frame).not.toBeNull();
    expect(inventoryGrid).not.toBeNull();

    // When: sets land back to back, faster than a player can look at any of them, and
    // including the one already on.
    for (const name of ['Max Mage', 'Melee', 'Max Mage', 'Max Mage', 'Learner (Mage)']) {
      fireEvent.click(presetOption(name));

      // Then: the same nodes are still on the page. Rebuilding them would throw away every
      // item image in the loadout on every click.
      expect(document.querySelector('.loadout-frame')).toBe(frame);
      expect(document.querySelector('.inventory-grid')).toBe(inventoryGrid);
    }

    expect(currentLabel()).toHaveTextContent('Learner (Mage)');
    expect(equipmentSpy).toHaveBeenLastCalledWith(learnerMage.equipment);
    expect(
      screen.getByRole('button', {
        name: `Weapon: ${wornName('weapon', learnerMage.equipment.weapon)}`,
      }),
    ).toBeInTheDocument();
  });
});

/**
 * The ammunition cell is the one in the cross that cannot be read from `equipment`:
 * PlayerEquipment has no ammo key, so it is fed from CombatSupplies instead. These lock
 * the wiring, because a cell sourced from the wrong object fails silently — it simply
 * renders empty, which is easy to miss.
 */
describe('EncounterLoadoutSection — ammunition slot', () => {
  const tbow = EQUIPMENT_PRESETS.zuk.max_tbow;
  const eclipse = EQUIPMENT_PRESETS.zuk.atlatl_eclipse;

  function renderZuk(supplies: EncounterLoadout['supplies'] | undefined) {
    return render(
      <EncounterLoadoutSection
        encounterKind="zuk"
        presetsKey="zuk"
        appearance={DEFAULT_PLAYER_CONFIG.appearance}
        stats={allLevels(99)}
        encounterEquipment={tbow.equipment}
        inventory={tbow.inventory}
        supplies={supplies}
        onEquipmentChange={() => {}}
        onInventoryChange={() => {}}
      />,
    );
  }

  const ammoCell = (view: ReturnType<typeof render>): HTMLElement => {
    const cell = view.container.querySelector<HTMLElement>('[aria-label^="Ammo:"]');
    if (!cell) throw new Error('no ammunition cell rendered');
    return cell;
  };

  it('names the worn ammunition rather than leaving the slot blank', () => {
    const view = renderZuk(eclipse.supplies);

    // Ruby bolts (e) — the id atlatl_eclipse wears.
    expect(ammoCell(view).getAttribute('aria-label')).toContain('Ruby bolts (e)');
    expect(ammoCell(view).querySelector('img')).not.toBeNull();
  });

  it('commits a picked round to supplies, not to equipment', () => {
    const loadoutSpy = vi.fn<(loadout: EncounterLoadout) => void>();
    render(
      <EncounterLoadoutSection
        encounterKind="zuk"
        presetsKey="zuk"
        appearance={DEFAULT_PLAYER_CONFIG.appearance}
        stats={allLevels(99)}
        encounterEquipment={tbow.equipment}
        inventory={tbow.inventory}
        supplies={tbow.supplies}
        onEquipmentChange={() => {}}
        onInventoryChange={() => {}}
        onLoadoutChange={loadoutSpy}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: /^Ammo:/ }));
    fireEvent.change(screen.getByRole('combobox', { name: 'Search supported ammunition' }), {
      target: { value: 'dragon arrow' },
    });
    // The catalog ships more than one entry under this name, and which is irrelevant:
    // what matters is that the pick lands in supplies.
    fireEvent.click(screen.getAllByRole('option', { name: 'Dragon arrow' })[0]);

    const committed = loadoutSpy.mock.calls.at(-1)?.[0];
    const chosen = committed?.supplies.equippedAmmo?.id;
    expect(chosen).toBeDefined();
    expect(findEquipmentCatalogItem(chosen ?? -1)?.name).toBe('Dragon arrow');
    // The gear is untouched: ammunition has no PlayerEquipment key to land in.
    expect(committed?.equipment).toEqual(tbow.equipment);
  });

  it('keeps the unlimited marker only when there is no ammunition to show', () => {
    const withAmmo = renderZuk(eclipse.supplies);
    expect(ammoCell(withAmmo).querySelector('.equip-slot-unlimited')).toBeNull();
    withAmmo.unmount();

    const without = renderZuk(undefined);
    expect(ammoCell(without).querySelector('.equip-slot-unlimited')).not.toBeNull();
    expect(ammoCell(without).getAttribute('aria-label')).toContain('empty');
  });
});

/**
 * Dizana's quiver is a second ammunition slot, so the cross grows a twelfth cell for it — and
 * only while the loadout actually owns one, worn or carried. That cell is the one cell that
 * comes and goes, which is what the tab-stop cases at the end are about.
 */
describe('EncounterLoadoutSection — the quiver ammunition cell', () => {
  const tbow = EQUIPMENT_PRESETS.zuk.max_tbow;
  const bowfa = EQUIPMENT_PRESETS.zuk.bowfa;
  const DIZANAS_QUIVER = 28951;
  const AVAS_ASSEMBLER = 22109;
  const DRAGON_ARROW = 11212;

  /** The whole loadout in one piece of state, so a cape change can open or close the cell. */
  function QuiverHarness({
    initialLoadout,
    loadoutSpy,
  }: {
    initialLoadout: EncounterLoadout;
    loadoutSpy?: (loadout: EncounterLoadout) => void;
  }) {
    const [loadout, setLoadout] = useState(initialLoadout);
    return (
      <EncounterLoadoutSection
        encounterKind="zuk"
        presetsKey="zuk"
        appearance={DEFAULT_PLAYER_CONFIG.appearance}
        stats={allLevels(99)}
        encounterEquipment={loadout.equipment}
        inventory={loadout.inventory}
        supplies={loadout.supplies}
        onEquipmentChange={() => {}}
        onInventoryChange={() => {}}
        onLoadoutChange={(next) => {
          loadoutSpy?.(next);
          setLoadout(next);
        }}
      />
    );
  }

  const tbowLoadout = (): EncounterLoadout => ({
    equipment: tbow.equipment,
    inventory: tbow.inventory,
    // The max-tbow preset ships an aliased dragon-arrow id; these behaviors are pinned to
    // the ordinary 11212 stack the assertions name.
    supplies: { ...(tbow.supplies ?? createEmptyCombatSupplies()), quiverAmmo: { id: DRAGON_ARROW } },
  });

  /** The Max Tbow kit with its quiver moved from the cape slot into the first inventory slot. */
  const carriedQuiverLoadout = (): EncounterLoadout => {
    const inventory = [...tbow.inventory];
    inventory[0] = { id: DIZANAS_QUIVER, quantity: 1 };
    return {
      equipment: { ...tbow.equipment, cape: AVAS_ASSEMBLER },
      inventory,
      supplies: { ...(tbow.supplies ?? createEmptyCombatSupplies()), quiverAmmo: null },
    };
  };

  function cell(name: RegExp | string): HTMLElement {
    return screen.getByRole('button', { name });
  }

  const quiverCell = () => screen.queryByRole('button', { name: /^Quiver: / });

  function grid(label: string): HTMLElement {
    return screen.getByRole('group', { name: label });
  }

  const stops = () =>
    Array.from(document.querySelectorAll<HTMLElement>('.loadout-frame [data-grid-cell]')).filter(
      (element) => element.tabIndex === 0,
    );

  function chooseCape(query: string, optionName: string): void {
    fireEvent.click(cell(/^Cape: /));
    fireEvent.change(screen.getByRole('combobox', { name: 'Search supported cape gear' }), {
      target: { value: query },
    });
    // Aliased ids share a name; which one lands is irrelevant to what the cell does next.
    fireEvent.click(screen.getAllByRole('option', { name: optionName })[0]);
  }

  it('sits beside the head slot while a quiver is worn, holding the stored stack', () => {
    render(<QuiverHarness initialLoadout={tbowLoadout()} />);

    const quiver = cell(/^Quiver: /);
    expect(quiver).toHaveAccessibleName('Quiver: Dragon arrow. Never runs out');
    // Directly right of Head, which is row 1, column 2 — not a badge inside the ammo cell.
    expect(quiver.style.gridRow).toBe('1');
    expect(quiver.style.gridColumn).toBe('3');
    expect(cell(/^Head: /).style.gridRow).toBe('1');
    expect(cell(/^Head: /).style.gridColumn).toBe('2');
    expect(quiver.querySelector('canvas[data-src]')?.getAttribute('data-src')).toContain(`${DRAGON_ARROW}`);
    expect(cell(/^Ammo: /)).toHaveAccessibleName("Ammo: Rada's blessing 4. Never runs out");
    expect(document.querySelector('.equip-slot-quiver')).toBeNull();
  });

  it('sits there while a quiver is only carried, and reads empty when nothing is stored', () => {
    render(<QuiverHarness initialLoadout={carriedQuiverLoadout()} />);

    const quiver = cell(/^Quiver: /);
    expect(quiver).toHaveAccessibleName('Quiver: empty. Never runs out');
    expect(quiver.querySelector('.equip-slot-unlimited')).not.toBeNull();
  });

  it('stays out of the cross without a quiver, whatever a stale stack in supplies says', () => {
    render(
      <QuiverHarness
        initialLoadout={{
          equipment: bowfa.equipment,
          inventory: bowfa.inventory,
          supplies: { ...(bowfa.supplies ?? createEmptyCombatSupplies()), quiverAmmo: { id: DRAGON_ARROW } },
        }}
      />,
    );

    expect(quiverCell()).toBeNull();
    expect(cell(/^Ammo: /)).not.toHaveAccessibleName(/Dragon arrow/);
    expect(document.querySelectorAll('.loadout-frame [data-grid-cell]')).toHaveLength(11 + 28);
  });

  it('leaves with the last quiver, keeping the stack it stored', () => {
    const loadoutSpy = vi.fn<(loadout: EncounterLoadout) => void>();
    render(<QuiverHarness initialLoadout={tbowLoadout()} loadoutSpy={loadoutSpy} />);

    chooseCape("ava's assembler", "Ava's assembler");

    expect(quiverCell()).toBeNull();
    // The slot is gone from the picture, not from the save: the stack is still there for
    // the next quiver.
    expect(loadoutSpy.mock.lastCall?.[0].supplies.quiverAmmo).toEqual({ id: DRAGON_ARROW });
  });

  it('stays while another quiver is still owned, and leaves with the last one', () => {
    const loadout = carriedQuiverLoadout();
    render(<QuiverHarness initialLoadout={{ ...loadout, equipment: tbow.equipment }} />);
    expect(quiverCell()).not.toBeNull();

    // Worn AND carried: taking the worn one off still leaves one in the bag.
    fireEvent.click(cell(/^Cape: /));
    fireEvent.click(screen.getByRole('button', { name: 'Clear slot' }));
    expect(cell(/^Cape: /)).toHaveAccessibleName('Cape: empty');
    expect(quiverCell()).not.toBeNull();

    fireEvent.click(cell("Inventory slot 1: Dizana's quiver"));
    fireEvent.click(screen.getByRole('button', { name: 'Clear slot' }));
    expect(quiverCell()).toBeNull();
  });

  it('edits the stored stack on its own, and the worn slot on its own', () => {
    const loadoutSpy = vi.fn<(loadout: EncounterLoadout) => void>();
    render(<QuiverHarness initialLoadout={tbowLoadout()} loadoutSpy={loadoutSpy} />);
    const committed = () => loadoutSpy.mock.lastCall?.[0].supplies;

    // Emptying the worn slot does not reach into the quiver.
    fireEvent.click(cell(/^Ammo: /));
    fireEvent.click(screen.getByRole('button', { name: 'Clear slot' }));
    expect(committed()?.equippedAmmo).toBeNull();
    expect(committed()?.quiverAmmo).toEqual({ id: DRAGON_ARROW });

    // Restocking the quiver does not reach into the worn slot.
    fireEvent.click(cell(/^Quiver: /));
    expect(screen.getByRole('listbox', { name: 'Quiver ammunition' })).toBeInTheDocument();
    // The stack it holds is pinned to the top of the list, ahead of the aliased ids that share its name.
    expect(screen.getAllByRole('option', { name: 'Dragon arrow' })[0]).toHaveAttribute('aria-selected', 'true');
    const search = () => screen.getByRole('combobox', { name: 'Search supported quiver ammunition' });
    // The worn slot takes blessings and atlatl darts; a quiver holds arrows and bolts only.
    fireEvent.change(search(), { target: { value: 'blessing' } });
    expect(screen.queryByRole('option', { name: /blessing/i })).toBeNull();
    fireEvent.change(search(), { target: { value: 'atlatl dart' } });
    expect(screen.queryByRole('option', { name: /atlatl dart/i })).toBeNull();
    fireEvent.change(search(), { target: { value: 'amethyst arrow' } });
    fireEvent.click(screen.getAllByRole('option', { name: 'Amethyst arrow' })[0]);
    expect(findEquipmentCatalogItem(committed()?.quiverAmmo?.id ?? -1)?.name).toBe('Amethyst arrow');
    expect(committed()?.equippedAmmo).toBeNull();
    expect(cell(/^Quiver: /)).toHaveAccessibleName('Quiver: Amethyst arrow. Never runs out');
    // The choice hands the slot back to its cell, like every other cell in the cross.
    expect(document.activeElement).toBe(cell(/^Quiver: /));

    // And it empties on its own too.
    fireEvent.click(cell(/^Quiver: /));
    fireEvent.click(screen.getByRole('button', { name: 'Clear slot' }));
    expect(committed()?.quiverAmmo).toBeNull();
    expect(cell(/^Quiver: /)).toHaveAccessibleName('Quiver: empty. Never runs out');
    // Ammunition has no PlayerEquipment key to land in, so the gear is exactly as it was.
    expect(loadoutSpy.mock.lastCall?.[0].equipment).toEqual(tbow.equipment);
  });

  it('is in the arrow space beside the head slot only while it is there', () => {
    const { unmount } = render(<QuiverHarness initialLoadout={tbowLoadout()} />);

    cell(/^Head: /).focus();
    fireEvent.keyDown(grid('Equipment'), { key: 'ArrowRight' });
    expect(document.activeElement).toBe(cell(/^Quiver: /));
    fireEvent.keyDown(grid('Equipment'), { key: 'ArrowDown' });
    expect(document.activeElement).toBe(cell(/^Ammo: /));
    fireEvent.keyDown(grid('Equipment'), { key: 'ArrowUp' });
    expect(document.activeElement).toBe(cell(/^Quiver: /));
    fireEvent.keyDown(grid('Equipment'), { key: 'ArrowRight' });
    expect(document.activeElement).toBe(cell(/^Inventory slot 1: /));
    fireEvent.keyDown(grid('Inventory'), { key: 'ArrowLeft' });
    expect(document.activeElement).toBe(cell(/^Quiver: /));
    unmount();

    // Without a quiver the row runs straight from the head slot into the inventory.
    render(
      <QuiverHarness
        initialLoadout={{
          equipment: bowfa.equipment,
          inventory: bowfa.inventory,
          supplies: bowfa.supplies ?? createEmptyCombatSupplies(),
        }}
      />,
    );
    cell(/^Head: /).focus();
    fireEvent.keyDown(grid('Equipment'), { key: 'ArrowRight' });
    expect(document.activeElement).toBe(cell(/^Inventory slot 1: /));
    cell(/^Ammo: /).focus();
    fireEvent.keyDown(grid('Equipment'), { key: 'ArrowUp' });
    expect(document.activeElement).toBe(cell(/^Head: /));
  });

  it('keeps the tab stop on the cell the arrows left while the quiver cell comes and goes', () => {
    render(<QuiverHarness initialLoadout={tbowLoadout()} />);
    cell(/^Head: /).focus();
    fireEvent.keyDown(grid('Equipment'), { key: 'ArrowDown' });
    fireEvent.keyDown(grid('Equipment'), { key: 'ArrowLeft' });
    expect(stops()).toEqual([cell(/^Cape: /)]);

    // The cape change closes the quiver cell, which sits before the cape in the group. The
    // stop stays on the cape rather than sliding onto whichever cell now holds its number.
    chooseCape("ava's assembler", "Ava's assembler");
    expect(quiverCell()).toBeNull();
    expect(stops()).toEqual([cell(/^Cape: /)]);

    // And back again.
    chooseCape('dizana', "Dizana's quiver");
    expect(quiverCell()).not.toBeNull();
    expect(stops()).toEqual([cell(/^Cape: /)]);
  });

  it('hands the tab stop to the head slot when the quiver cell itself goes', () => {
    render(<QuiverHarness initialLoadout={tbowLoadout()} />);
    act(() => cell(/^Quiver: /).focus());
    expect(stops()).toEqual([cell(/^Quiver: /)]);

    // A set without a quiver lands from outside the grid, so no cell takes the focus over.
    fireEvent.click(presetOption('Bowfa'));

    expect(quiverCell()).toBeNull();
    // Never nowhere: the loadout must still be one tab stop, and it is the first cell.
    expect(stops()).toEqual([cell(/^Head: /)]);
  });

  it('puts a quiver picker down when the cell it opened on goes', () => {
    const props = {
      encounterKind: 'zuk',
      presetsKey: 'zuk',
      appearance: DEFAULT_PLAYER_CONFIG.appearance,
      stats: allLevels(99),
      inventory: tbow.inventory,
      supplies: tbow.supplies,
      onEquipmentChange: () => {},
      onInventoryChange: () => {},
    };
    const { rerender } = render(<EncounterLoadoutSection {...props} encounterEquipment={tbow.equipment} />);
    fireEvent.click(cell(/^Quiver: /));
    expect(screen.getByRole('listbox', { name: 'Quiver ammunition' })).toBeInTheDocument();

    // The loadout changes under the open picker, from outside the section.
    rerender(<EncounterLoadoutSection {...props} encounterEquipment={{ ...tbow.equipment, cape: AVAS_ASSEMBLER }} />);

    expect(quiverCell()).toBeNull();
    expect(document.querySelector('.slot-picker')).toBeNull();
  });

  it('reads a quiver-only divergence from a set as a draft', () => {
    // tbowLoadout() is the Max Tbow set with ONLY supplies.quiverAmmo changed: gear and
    // inventory are byte-identical to the shipped preset.
    render(<QuiverHarness initialLoadout={tbowLoadout()} />);

    expect(currentLabel()).toHaveTextContent('Custom loadout');
    expect(document.querySelector('.loadout-section--drafting')).not.toBeNull();
    expect(screen.getByRole('button', { name: 'Save preset' })).toBeInTheDocument();
    // The set was never worn in this session, so there is no way back to name.
    expect(screen.queryByRole('button', { name: /^Revert/ })).toBeNull();
  });
});

describe('EncounterLoadoutSection — the rune pouch is editable', () => {
  afterEach(() => vi.restoreAllMocks());
  const DEATH = 560;
  const FIRE = 554;
  const BLOOD = 565;
  const AETHER = 30843;
  const WATER = 555;
  const LAW = 563;
  const DIVINE_POUCH = 27281;
  const POUCH_SLOT_LABEL = 'Inventory slot 28: Divine rune pouch';

  const maxMageSupplies = maxMage.supplies ?? createEmptyCombatSupplies();

  function loadoutWith(overrides: Partial<EncounterLoadout>): EncounterLoadout {
    return { equipment: maxMage.equipment, inventory: maxMage.inventory, supplies: maxMageSupplies, ...overrides };
  }

  function withPouch(runePouch: CombatSupplies['runePouch']): EncounterLoadout {
    return loadoutWith({ supplies: { ...maxMageSupplies, runePouch } });
  }

  function SuppliesHarness({
    initialLoadout,
    loadoutSpy,
  }: {
    initialLoadout: EncounterLoadout;
    loadoutSpy?: (loadout: EncounterLoadout) => void;
  }) {
    const [loadout, setLoadout] = useState(initialLoadout);
    return (
      <EncounterLoadoutSection
        encounterKind="yama_p3"
        presetsKey="yama_p3"
        appearance={DEFAULT_PLAYER_CONFIG.appearance}
        stats={createDefaultStats()}
        encounterEquipment={loadout.equipment}
        inventory={loadout.inventory}
        supplies={loadout.supplies}
        onEquipmentChange={vi.fn()}
        onInventoryChange={vi.fn()}
        onLoadoutChange={(next) => {
          loadoutSpy?.(next);
          setLoadout(next);
        }}
      />
    );
  }

  function renderPouch(initialLoadout: EncounterLoadout, loadoutSpy?: (loadout: EncounterLoadout) => void) {
    return render(<SuppliesHarness initialLoadout={initialLoadout} loadoutSpy={loadoutSpy} />);
  }

  function row(): HTMLElement {
    const element = document.querySelector<HTMLElement>('.rune-pouch-row');
    if (!element) {
      throw new Error('rune pouch row not found');
    }
    return element;
  }

  function runeSlot(index: number): HTMLElement {
    return screen.getByRole('button', { name: new RegExp(`^Rune pouch slot ${index}: `) });
  }

  function packedRunes(loadout: EncounterLoadout | undefined): (number | null)[] {
    return (loadout?.supplies.runePouch?.slots ?? []).map((slot) => slot?.id ?? null);
  }

  function pouchLabel(): HTMLElement | null {
    return row().querySelector('.rune-pouch-bar .section-label');
  }

  it('uses the compact pouch label while naming all four divine pouch slots', () => {
    renderPouch(loadoutWith({}));

    expect(pouchLabel()).toHaveTextContent(/^Rune pouch$/);
    expect(
      screen.getAllByRole('button', { name: /^Rune pouch slot / }).map((slot) => slot.getAttribute('aria-label')),
    ).toEqual([
      'Rune pouch slot 1: Death rune',
      'Rune pouch slot 2: Fire rune',
      'Rune pouch slot 3: Blood rune',
      'Rune pouch slot 4: Aether rune',
    ]);
    expect(runeSlot(1).querySelector('canvas[data-src]')).not.toBeNull();
    expect(runeSlot(1).querySelector('img')).toBeNull();
  });

  // Label left, cells right, because `.spellbook-row` beside it is: inverted, one kit's two
  // properties read as two inventions and the pouch's NAME sat in `.section-label`'s exact type.
  it('names the pouch once, on the left, in the voice its sibling row uses', () => {
    renderPouch(loadoutWith({}));

    const label = pouchLabel();
    expect(label).toHaveTextContent(/^Rune pouch$/);
    // A sprite here is a third statement of what this label and the inventory square above say.
    expect(row().querySelector('.rune-pouch-item-icon')).toBeNull();
    expect(row().querySelector(`canvas[data-src*="${DIVINE_POUCH}"]`)).toBeNull();
    expect(label?.compareDocumentPosition(row().querySelector('.rune-pouch-slots') as Node)).toBe(
      Node.DOCUMENT_POSITION_FOLLOWING,
    );
  });

  // The frame reads its contents as sprites, and a rune is a held item like any other. Printing
  // the position and the name inside the cell is what shrank the rune to a corner of its own
  // square and made this the one column of the diagram read as words.
  it('shows what a slot holds the way every other cell in the frame does, as a sprite alone', () => {
    renderPouch(loadoutWith({}));

    expect(runeSlot(1)).toHaveTextContent('');
    expect(runeSlot(1).querySelector('canvas[data-src]')?.getAttribute('data-src')).toContain(`${DEATH}`);
    expect(runeSlot(1)).toHaveAccessibleName('Rune pouch slot 1: Death rune');
    // The accessible name alone. A `title` repeating it added nothing but the browser's own
    // OS-drawn box, half a second after a hover, over a panel set in a pixel face.
    expect(runeSlot(1)).not.toHaveAttribute('title');
  });

  it('carries the pouch slots as cells of the same grid, so the two can never drift apart', () => {
    renderPouch(withPouch({ kind: 'standard', slots: [{ id: DEATH }, null, null] }));

    expect(runeSlot(1)).toHaveClass('inventory-slot', 'rune-pouch-slot', 'inventory-slot--filled');
    expect(runeSlot(2)).not.toHaveClass('inventory-slot--filled');

    // The selected treatment is the grid's own, glow included, rather than a second answer to
    // "this is the slot in hand" that reads quieter than the cell two inches away.
    fireEvent.click(runeSlot(1));
    expect(runeSlot(1)).toHaveClass('inventory-slot--selected');
  });

  it('shows a standard pouch as three slots under its own name', () => {
    renderPouch(withPouch({ kind: 'standard', slots: [{ id: DEATH }, null, null] }));

    expect(pouchLabel()).toHaveTextContent('Rune pouch');
    expect(screen.getAllByRole('button', { name: /^Rune pouch slot / })).toHaveLength(3);
    // An empty pouch slot is an empty square, exactly like an empty inventory square. The word
    // "Empty" painted in the cell was the only place in the frame that spelled a slot's vacancy.
    expect(runeSlot(2)).toHaveAccessibleName('Rune pouch slot 2: Empty');
    expect(runeSlot(2)).toBeEmptyDOMElement();
  });

  it('keeps an imported rune it cannot name rather than dropping it', () => {
    const loadoutSpy = vi.fn<(loadout: EncounterLoadout) => void>();
    renderPouch(withPouch({ kind: 'standard', slots: [{ id: 999_999 }, { id: FIRE }, null] }), loadoutSpy);

    expect(runeSlot(1)).toHaveAccessibleName('Rune pouch slot 1: Unsupported item');
    // The inventory's own badge, not a sentence typeset into the cell: the same condition two
    // inches away already had a designed answer.
    expect(runeSlot(1)).toHaveClass('inventory-slot--unverified');
    expect(runeSlot(1).querySelector('.loadout-slot-unverified')).not.toBeNull();
    expect(runeSlot(1)).not.toHaveAttribute('title');
    expect(loadoutSpy).not.toHaveBeenCalled();
  });

  it('groups the slots under the pouch name and marks each as opening the tray it owns', () => {
    renderPouch(loadoutWith({}));

    expect(within(row()).getByRole('group')).toHaveAccessibleName('Rune pouch');
    // `aria-controls`, not `aria-haspopup`: the runes open inside this row now, so a slot points
    // at a region it expands rather than announcing a dialog that arrives over the panel.
    expect(runeSlot(1)).toHaveAttribute('aria-expanded', 'false');
    expect(runeSlot(1).getAttribute('aria-controls')).toBe(document.querySelector('.rune-pouch-tray')?.id);
    expect(runeSlot(1)).not.toHaveAttribute('aria-haspopup');

    fireEvent.click(runeSlot(1));
    expect(runeSlot(1)).toHaveAttribute('aria-expanded', 'true');
    // Pressing the open slot again puts it down: the tray is the slot's own state, not a
    // separate surface that needs dismissing.
    fireEvent.click(runeSlot(1));
    expect(runeSlot(1)).toHaveAttribute('aria-expanded', 'false');
  });

  // A browser scaling a 1px OSRS outline at a fractional panel scale or DPR renders it 2px on
  // one edge and 3px on the other, which is why every pixel-art icon is resampled in a canvas.
  it('paints the rune icon through the resampling canvas rather than a raw image', () => {
    renderPouch(loadoutWith({}));

    const sprite = runeSlot(1).querySelector('canvas[data-src]');
    expect(sprite).not.toBeNull();
    expect(sprite?.getAttribute('data-src')).toContain(`${DEATH}`);
    expect(runeSlot(1).querySelector('img')).toBeNull();
  });

  it('leaves the row out when the kit carries no pouch, and when supplies cannot be persisted', () => {
    const { unmount } = renderPouch(withPouch(null));
    expect(document.querySelector('.rune-pouch-row')).toBeNull();
    unmount();

    render(
      <EncounterLoadoutSection
        encounterKind="yama_p3"
        presetsKey="yama_p3"
        appearance={DEFAULT_PLAYER_CONFIG.appearance}
        stats={createDefaultStats()}
        encounterEquipment={maxMage.equipment}
        inventory={maxMage.inventory}
        supplies={maxMageSupplies}
        onEquipmentChange={vi.fn()}
        onInventoryChange={vi.fn()}
      />,
    );
    expect(document.querySelector('.rune-pouch-row')).toBeNull();
  });

  it('offers the whole rune set at once, as the cells it is choosing between', () => {
    renderPouch(loadoutWith({}));

    fireEvent.click(runeSlot(2));

    // Twenty-one runes and the way back to empty. Offered as a list the set ran to 966px of
    // scroll in a 186px window — four rows at a time for a catalog that fits on the surface.
    // Twenty-one runes and the way back to empty, inside the row rather than on a card floating
    // over it: that card measured 256x208, nearly twice the area of the whole row it served.
    const grid = within(row()).getByRole('listbox', { name: /^Runes/ });
    expect(within(grid).getAllByRole('option')).toHaveLength(22);
    expect(within(grid).getByRole('option', { name: 'Fire rune' })).toHaveAttribute('aria-selected', 'true');
    expect(document.querySelector('.slot-picker')).toBeNull();
  });

  it('names the slot being filled and the rune under the cursor, beside the cells', () => {
    renderPouch(loadoutWith({}));

    fireEvent.click(runeSlot(2));

    // Not back into the bar: there the name of the rune under the cursor sat a row above the
    // cursor naming it, and 180px to its right.
    const caption = row().querySelector('.rune-pouch-tray-panel .rune-pouch-caption');
    expect(caption).toHaveTextContent('Slot 2');
    const readout = row().querySelector('.rune-pouch-readout');
    expect(readout).toHaveTextContent('Fire rune');

    fireEvent.pointerEnter(within(row()).getByRole('option', { name: 'Water rune' }));
    expect(readout).toHaveTextContent('Water rune');
  });

  it('walks the tray with the arrow keys, across families and along them', () => {
    const loadoutSpy = vi.fn<(loadout: EncounterLoadout) => void>();
    renderPouch(loadoutWith({}), loadoutSpy);

    fireEvent.click(runeSlot(2));
    const tray = within(row()).getByRole('listbox', { name: /^Runes/ });
    const optionNamed = (name: string) => within(tray).getByRole('option', { name });
    within(tray)
      .getAllByRole('option')
      .forEach((cell, index) => {
        vi.spyOn(cell, 'getBoundingClientRect').mockReturnValue(
          new DOMRect((index % 11) * 40, Math.floor(index / 11) * 40, 38, 38),
        );
      });
    const cursorId = () => tray.getAttribute('aria-activedescendant');

    // Opens on the rune the slot holds, wherever the catalog's own order puts it, so the
    // readout is never blank on arrival and the cells never move between one slot and the next.
    expect(cursorId()).toBe(optionNamed('Fire rune').id);
    // Right runs the flat list, so it leaves the elementals for the combinations beside them.
    fireEvent.keyDown(tray, { key: 'ArrowRight' });
    expect(cursorId()).toBe(optionNamed('Mist rune').id);
    // Down follows the rendered row even across catalog families.
    fireEvent.keyDown(tray, { key: 'ArrowDown' });
    expect(cursorId()).toBe(optionNamed('Law rune').id);
    fireEvent.keyDown(tray, { key: 'Enter' });
    expect(packedRunes(loadoutSpy.mock.lastCall?.[0])[1]).toBe(LAW);
  });

  it('navigates narrow grid rows and stops at vertical boundaries', () => {
    renderPouch(loadoutWith({}));
    fireEvent.click(runeSlot(2));
    const tray = within(row()).getByRole('listbox', { name: /^Runes/ });
    const options = within(tray).getAllByRole('option');
    options.forEach((cell, index) => {
      vi.spyOn(cell, 'getBoundingClientRect').mockReturnValue(
        new DOMRect((index % 5) * 44, Math.floor(index / 5) * 44, 42, 42),
      );
    });
    fireEvent.keyDown(tray, { key: 'Home' });
    fireEvent.keyDown(tray, { key: 'ArrowUp' });
    expect(tray).toHaveAttribute('aria-activedescendant', options[0].id);
    fireEvent.keyDown(tray, { key: 'ArrowDown' });
    expect(tray).toHaveAttribute('aria-activedescendant', options[5].id);
    fireEvent.keyDown(tray, { key: 'ArrowDown' });
    expect(tray).toHaveAttribute('aria-activedescendant', options[10].id);
    fireEvent.keyDown(tray, { key: 'End' });
    fireEvent.keyDown(tray, { key: 'ArrowDown' });
    expect(tray).toHaveAttribute('aria-activedescendant', options[21].id);
    fireEvent.keyDown(tray, { key: 'ArrowUp' });
    expect(tray).toHaveAttribute('aria-activedescendant', options[16].id);
  });

  it('lays every choice directly in one grid, retaining rune order with No rune first', () => {
    renderPouch(loadoutWith({}));

    fireEvent.click(runeSlot(2));

    // The same 22 cells in the same order for every slot: the popover this replaced pinned the
    // held rune to the front because only four of its rows were visible at a time, and a tray
    // showing all 22 that did the same would re-sort them under the eye already reading them.
    const tray = within(row()).getByRole('listbox', { name: /^Runes/ });
    expect([...tray.children].map((cell) => cell.getAttribute('aria-label'))).toEqual([
      'No rune',
      'Air rune',
      'Water rune',
      'Earth rune',
      'Fire rune',
      'Mist rune',
      'Dust rune',
      'Mud rune',
      'Smoke rune',
      'Steam rune',
      'Lava rune',
      'Mind rune',
      'Body rune',
      'Cosmic rune',
      'Chaos rune',
      'Nature rune',
      'Law rune',
      'Death rune, in slot 1',
      'Blood rune, in slot 3',
      'Soul rune',
      'Wrath rune',
      'Aether rune, in slot 4',
    ]);
    expect([...tray.children].every((cell) => cell.getAttribute('role') === 'option')).toBe(true);
  });

  // The pouch resolves a rune type once, so a second copy of one is capacity the kit never gets
  // back. That is what this refusal is for; it is not a restriction the picker invented.
  it('refuses a rune another slot already holds, and says which slot has it', () => {
    const loadoutSpy = vi.fn<(loadout: EncounterLoadout) => void>();
    renderPouch(loadoutWith({}), loadoutSpy);

    fireEvent.click(runeSlot(2));
    const taken = within(row()).getByRole('option', { name: 'Death rune, in slot 1' });
    expect(taken).toHaveAttribute('aria-disabled', 'true');
    expect(taken).toHaveClass('rune-pouch-choice--taken');
    // No corner numeral saying which slot holds it, which would be ornament: the cell's
    // own accessible name and the caption readout carry that fact, in words, where it is read.
    expect(taken.querySelector('.rune-pouch-holder')).toBeNull();

    fireEvent.pointerEnter(taken);
    expect(row().querySelector('.rune-pouch-readout')).toHaveTextContent('Death rune, in slot 1');

    fireEvent.click(taken);
    fireEvent.keyDown(within(row()).getByRole('listbox', { name: /^Runes/ }), { key: 'Enter' });
    expect(loadoutSpy).not.toHaveBeenCalled();
    expect(runeSlot(2)).toHaveAccessibleName('Rune pouch slot 2: Fire rune');
  });

  // Why "taken" is `holder !== openSlotIndex` and not simply `holder !== undefined`: the latter
  // shows the open slot its own contents as unavailable.
  it('still offers the rune the open slot itself is holding', () => {
    renderPouch(loadoutWith({}));

    fireEvent.click(runeSlot(2));
    const held = within(row()).getByRole('option', { name: 'Fire rune' });

    expect(held).toHaveAttribute('aria-selected', 'true');
    expect(held).not.toHaveAttribute('aria-disabled');
    expect(held.querySelector('.rune-pouch-holder')).toBeNull();
  });

  it('closes the tray on Escape without answering the slot it was opened from', () => {
    const loadoutSpy = vi.fn<(loadout: EncounterLoadout) => void>();
    renderPouch(loadoutWith({}), loadoutSpy);

    fireEvent.click(runeSlot(2));
    expect(runeSlot(2)).toHaveAttribute('aria-expanded', 'true');

    fireEvent.keyDown(within(row()).getByRole('listbox', { name: /^Runes/ }), { key: 'Escape' });
    expect(runeSlot(2)).toHaveAttribute('aria-expanded', 'false');
    expect(loadoutSpy).not.toHaveBeenCalled();
  });

  it('carries no ornamental mark on the transfer labels, keeping the explanation on hover', () => {
    renderPouch(loadoutWith({}));

    for (const name of [/^Import Inventory Setup/, /^Export .* as an Inventory Setup/]) {
      const button = screen.getByRole('button', { name });
      // No superscript ?, which would be ornament: the label names the action and
      // the hover card explains it, so nothing on the word itself announces a footnote.
      expect(button.querySelector('.info-hint')).toBeNull();
    }
  });

  // Nothing is lost by dropping the mark, and only because of the assertion here: the button's
  // own name already carries the noun the card explains.
  it('keeps the noun the card explains on the button itself', () => {
    renderPouch(loadoutWith({}));

    const button = screen.getByRole('button', { name: /^Import Inventory Setup/ });
    expect(button).toHaveAccessibleName('Import Inventory Setup from the clipboard');
  });

  // The mark rides INSIDE a control here, which is what makes this pair different from every
  // other hint in the app: the region the card opens from is a focusable button, so a press on
  // it hands the card a second reason to stay up that the pointer leaving cannot take away.
  it.each([
    ['Import', /^Import Inventory Setup/],
    ['Export', /^Export .* as an Inventory Setup/],
  ] as const)('puts the %s hint down when the pointer leaves the button it pressed', (_label, name) => {
    vi.useFakeTimers();
    try {
      renderPouch(loadoutWith({}));
      const button = screen.getByRole('button', { name });

      fireEvent.pointerEnter(button, { pointerType: 'mouse' });
      act(() => {
        vi.advanceTimersToNextTimer();
      });
      expect(document.querySelector('[role="tooltip"]')).not.toBeNull();

      fireEvent.pointerDown(button, { pointerType: 'mouse' });
      button.focus();
      fireEvent.pointerLeave(button, { pointerType: 'mouse' });
      act(() => {
        vi.advanceTimersByTime(1000);
      });
      expect(document.querySelector('[role="tooltip"]')).toBeNull();
    } finally {
      vi.useRealTimers();
    }
  });

  it('still opens the hint on a keyboard focus, which no press preceded', () => {
    renderPouch(loadoutWith({}));
    const button = screen.getByRole('button', { name: /^Import Inventory Setup/ });

    // The guard the test above installs is spent on the pointer's own focus and nothing else:
    // armed on blur instead, it would swallow the user's next Tab into the control.
    act(() => {
      button.focus();
    });
    expect(document.querySelector('[role="tooltip"]')).not.toBeNull();

    act(() => {
      button.blur();
    });
    expect(document.querySelector('[role="tooltip"]')).toBeNull();
  });

  it('leaves the gear catalogs their search-led picker, which is what they need', () => {
    renderPouch(loadoutWith({}));

    // Same panel, 3,605 items: there the field is the only way through, so it stays a popover.
    fireEvent.click(screen.getByRole('button', { name: /^Inventory slot 1: / }));

    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(screen.getByRole('combobox', { name: 'Search supported inventory items' })).toBeInTheDocument();
  });

  it('packs the chosen rune, touching nothing but the pouch', () => {
    const loadoutSpy = vi.fn<(loadout: EncounterLoadout) => void>();
    renderPouch(loadoutWith({}), loadoutSpy);

    fireEvent.click(runeSlot(2));
    fireEvent.click(within(row()).getByRole('option', { name: 'Water rune' }));

    const last = loadoutSpy.mock.lastCall?.[0];
    expect(packedRunes(last)).toEqual([DEATH, WATER, BLOOD, AETHER]);
    expect(last?.equipment).toBe(maxMage.equipment);
    expect(last?.inventory).toBe(maxMage.inventory);
    expect(last?.supplies.spellbook).toBe(maxMageSupplies.spellbook);
    expect(runeSlot(2)).toHaveAccessibleName('Rune pouch slot 2: Water rune');
  });

  it('empties a slot without collapsing the pouch', () => {
    const loadoutSpy = vi.fn<(loadout: EncounterLoadout) => void>();
    renderPouch(loadoutWith({}), loadoutSpy);

    fireEvent.click(runeSlot(4));
    fireEvent.click(within(row()).getByRole('option', { name: 'No rune' }));

    expect(packedRunes(loadoutSpy.mock.lastCall?.[0])).toEqual([DEATH, FIRE, BLOOD, null]);
  });

  it('reads a repacked pouch as a draft, and puts the whole set back on Revert', () => {
    const loadoutSpy = vi.fn<(loadout: EncounterLoadout) => void>();
    renderPouch(loadoutWith({}), loadoutSpy);
    expect(currentLabel()).toHaveTextContent('Max Mage');

    fireEvent.click(runeSlot(1));
    fireEvent.click(within(row()).getByRole('option', { name: 'No rune' }));

    expect(currentLabel()).toHaveTextContent('Custom loadout');
    expect(document.querySelector('.loadout-section--drafting')).not.toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'Revert to Max Mage' }));

    expect(loadoutSpy.mock.lastCall?.[0].supplies).toEqual(maxMageSupplies);
    expect(currentLabel()).toHaveTextContent('Max Mage');
  });

  it('treats a spellbook change as a complete-loadout draft', () => {
    renderPouch(loadoutWith({}));

    fireEvent.click(screen.getByRole('radio', { name: 'Ancient' }));

    expect(currentLabel()).toHaveTextContent('Custom loadout');
    expect(document.querySelector('.loadout-section--drafting')).not.toBeNull();
  });

  it('follows the pouch item: downgrading it in the inventory keeps the first three runes', () => {
    const loadoutSpy = vi.fn<(loadout: EncounterLoadout) => void>();
    renderPouch(loadoutWith({}), loadoutSpy);

    fireEvent.click(screen.getByRole('button', { name: POUCH_SLOT_LABEL }));
    fireEvent.change(screen.getByRole('combobox', { name: 'Search supported inventory items' }), {
      target: { value: 'rune pouch' },
    });
    fireEvent.click(presetOption('Rune pouch'));

    const last = loadoutSpy.mock.lastCall?.[0];
    expect(last?.supplies.runePouch?.kind).toBe('standard');
    expect(packedRunes(last)).toEqual([DEATH, FIRE, BLOOD]);
    expect(pouchLabel()).toHaveTextContent('Rune pouch');
  });

  it('closes an open fourth slot when the pouch is downgraded to three slots', () => {
    renderPouch(loadoutWith({}));
    fireEvent.click(runeSlot(4));
    expect(row()).toHaveClass('rune-pouch-row--open');

    fireEvent.click(screen.getByRole('button', { name: POUCH_SLOT_LABEL }));
    fireEvent.change(screen.getByRole('combobox', { name: 'Search supported inventory items' }), {
      target: { value: 'rune pouch' },
    });
    fireEvent.click(presetOption('Rune pouch'));

    expect(screen.getAllByRole('button', { name: /^Rune pouch slot / })).toHaveLength(3);
    expect(row()).not.toHaveClass('rune-pouch-row--open');
  });

  it('follows the pouch item: removing it takes the pouch and its row away', () => {
    const loadoutSpy = vi.fn<(loadout: EncounterLoadout) => void>();
    renderPouch(loadoutWith({}), loadoutSpy);

    fireEvent.click(screen.getByRole('button', { name: POUCH_SLOT_LABEL }));
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Clear slot' }));

    expect(loadoutSpy.mock.lastCall?.[0].supplies.runePouch).toBeNull();
    expect(document.querySelector('.rune-pouch-row')).toBeNull();
  });

  it('does not revive an open rune tray when a removed pouch is added again', () => {
    renderPouch(loadoutWith({}));
    fireEvent.click(runeSlot(4));

    fireEvent.click(screen.getByRole('button', { name: POUCH_SLOT_LABEL }));
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Clear slot' }));
    expect(document.querySelector('.rune-pouch-row')).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'Inventory slot 28: empty' }));
    fireEvent.change(screen.getByRole('combobox', { name: 'Search supported inventory items' }), {
      target: { value: 'divine rune pouch' },
    });
    fireEvent.click(presetOption('Divine rune pouch'));

    expect(row()).not.toHaveClass('rune-pouch-row--open');
    expect(runeSlot(4)).toHaveAttribute('aria-expanded', 'false');
  });

  it('closes slot four when a whole preset with a standard pouch lands', () => {
    const maxTbow = EQUIPMENT_PRESETS.zuk.max_tbow;
    render(<Harness stats={createDefaultStats()} presetsKey="zuk" initialLoadout={presetLoadout(maxTbow)} />);
    fireEvent.click(runeSlot(4));
    expect(row()).toHaveClass('rune-pouch-row--open');

    fireEvent.click(within(listbox()).getByRole('option', { name: 'Atlatl / RCB (Eclipse)' }));

    expect(screen.getAllByRole('button', { name: /^Rune pouch slot / })).toHaveLength(3);
    expect(row()).not.toHaveClass('rune-pouch-row--open');
  });

  it('follows the pouch item: adding one to an empty inventory slot opens an empty pouch', () => {
    const loadoutSpy = vi.fn<(loadout: EncounterLoadout) => void>();
    const inventory = maxMage.inventory.map((slot, index) => (index === 27 ? null : slot));
    renderPouch(loadoutWith({ inventory, supplies: { ...maxMageSupplies, runePouch: null } }), loadoutSpy);

    fireEvent.click(screen.getByRole('button', { name: 'Inventory slot 28: empty' }));
    fireEvent.change(screen.getByRole('combobox', { name: 'Search supported inventory items' }), {
      target: { value: 'divine rune pouch' },
    });
    fireEvent.click(presetOption('Divine rune pouch'));

    expect(packedRunes(loadoutSpy.mock.lastCall?.[0])).toEqual([null, null, null, null]);
    expect(pouchLabel()).toHaveTextContent(/^Rune pouch$/);
  });

  it('leaves an imported pouch alone when the edit is nowhere near a pouch item', () => {
    // An Inventory Setup can carry `rp` contents with no pouch item in the inventory at all.
    // Syncing on every edit would silently delete those runes on the next unrelated swap.
    const loadoutSpy = vi.fn<(loadout: EncounterLoadout) => void>();
    const inventory = maxMage.inventory.map((slot, index) => (index === 27 ? null : slot));
    renderPouch(loadoutWith({ inventory }), loadoutSpy);

    fireEvent.click(screen.getByRole('button', { name: /^Inventory slot 1: / }));
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Clear slot' }));

    expect(packedRunes(loadoutSpy.mock.lastCall?.[0])).toEqual([DEATH, FIRE, BLOOD, AETHER]);
    expect(runeSlot(1)).toHaveAccessibleName('Rune pouch slot 1: Death rune');
  });

  it('offers every rune under its game name, and offers nothing that is not one', () => {
    renderPouch(loadoutWith({}));

    fireEvent.click(runeSlot(1));
    const grid = within(row()).getByRole('listbox', { name: /^Runes/ });

    expect(within(grid).getByRole('option', { name: 'Wrath rune' })).toBeInTheDocument();
    expect(within(grid).queryByRole('option', { name: /^Toxic blowpipe/ })).toBeNull();
    // Membership, where the row test above pins the order: `RUNE_GROUPS` is hand-written, so a
    // rune left out of all three families would silently stop being packable at all.
    expect(
      new Set(
        within(grid)
          .getAllByRole('option')
          .map((cell) => cell.getAttribute('aria-label')?.replace(/, in slot \d+$/, '')),
      ),
    ).toEqual(new Set(['No rune', ...SUPPORTED_RUNES.map((rune) => rune.name)]));
  });

  it('names the pouch items themselves rather than marking them unsupported', () => {
    renderPouch(loadoutWith({}));

    const pouchCell = screen.getByRole('button', { name: POUCH_SLOT_LABEL });
    expect(pouchCell).not.toHaveClass('inventory-slot--unverified');
    expect(pouchCell.querySelector('.loadout-slot-unverified')).toBeNull();
  });

  it('packs the runes in one row under the pouch, in the order the pouch holds them', () => {
    renderPouch(loadoutWith({}));

    const slots = screen.getAllByRole('button', { name: /^Rune pouch slot / });
    expect(slots.map((slot) => slot.querySelector('canvas[data-src]')?.getAttribute('data-src'))).toEqual(
      [DEATH, FIRE, BLOOD, AETHER].map((id) => `/assets/items/${id}.png`),
    );
    expect(runeSlot(1).closest('.rune-pouch-slots')).not.toBeNull();
  });
});

describe('EncounterLoadoutSection — Inventory Setup import', () => {
  afterEach(() => {
    window.localStorage.removeItem('osrs-custom-equipment-presets');
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('carries the import action as a labeled control in the bar it acts from', () => {
    render(<Harness stats={createDefaultStats()} initialLoadout={presetLoadout(melee)} />);

    const importButton = screen.getByRole('button', { name: /^Import Inventory Setup/ });
    expect(importButton.closest('.loadout-bar-tools')).not.toBeNull();
    expect(importButton.querySelector('.loadout-io-icon')).not.toBeNull();
    // Going back to a bare mark puts what these do inside a card that only exists while the
    // pointer is on it.
    expect(importButton).toHaveTextContent('Import');
    expect(document.querySelector('.loadout-io-btn--export')).toHaveTextContent('Export');
    expect(screen.queryByRole('tooltip')).toBeNull();
  });

  it('imports an inventory setup as a draft that must be saved', async () => {
    const readText = vi.fn<() => Promise<string>>().mockResolvedValue(inventorySetupString());
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { readText } });
    render(<Harness stats={createDefaultStats()} initialLoadout={presetLoadout(melee)} />);

    fireEvent.click(screen.getByRole('button', { name: /^Import Inventory Setup/ }));

    await waitFor(() => expect(document.querySelector('.loadout-section--drafting')).not.toBeNull());
    // A clean import reports nothing: the four signals asserted below are the confirmation,
    // and unlike a timed line none of them expires while the draft they describe is still open.
    expect(screen.queryByRole('status')).toBeNull();
    expect(document.querySelector('.loadout-section--drafting')).not.toBeNull();
    expect(currentLabel()).toHaveTextContent('Custom loadout');
    expect(screen.queryByRole('heading', { name: /^Saved/ })).toBeNull();
    expect(screen.getByRole('button', { name: 'Save preset' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Head: Ancestral hat' })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Save preset' }));
    expect(screen.getByLabelText('Preset name')).toHaveValue('RuneLite kit');
    fireEvent.click(screen.getByRole('button', { name: 'Save preset' }));

    expect(currentLabel()).toHaveTextContent('RuneLite kit');
    showPresets();
    expect(screen.getByRole('heading', { name: /^Saved/ })).toHaveTextContent('Saved presets (1)');
  });

  it('does not let a delayed import overwrite a newer preset selection', async () => {
    let resolveRead: ((value: string) => void) | undefined;
    const readText = vi.fn(
      () =>
        new Promise<string>((resolve) => {
          resolveRead = resolve;
        }),
    );
    const loadoutSpy = vi.fn<(loadout: EncounterLoadout) => void>();
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { readText } });
    render(<Harness stats={createDefaultStats()} initialLoadout={presetLoadout(maxMage)} loadoutSpy={loadoutSpy} />);

    fireEvent.click(screen.getByRole('button', { name: /^Import Inventory Setup/ }));
    await waitFor(() => expect(readText).toHaveBeenCalledOnce());
    fireEvent.click(within(listbox()).getByRole('option', { name: melee.name }));
    expect(currentLabel()).toHaveTextContent(melee.name);
    const callsAfterSelection = loadoutSpy.mock.calls.length;

    await act(async () => {
      resolveRead?.(inventorySetupString());
    });

    expect(loadoutSpy).toHaveBeenCalledTimes(callsAfterSelection);
    expect(currentLabel()).toHaveTextContent(melee.name);
    expect(screen.queryByRole('button', { name: 'Head: Ancestral hat' })).toBeNull();
  });

  it('does not let a delayed import overwrite a newer slot edit', async () => {
    let resolveRead: ((value: string) => void) | undefined;
    const readText = vi.fn(
      () =>
        new Promise<string>((resolve) => {
          resolveRead = resolve;
        }),
    );
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { readText } });
    render(<Harness stats={createDefaultStats()} initialLoadout={presetLoadout(melee)} />);

    fireEvent.click(screen.getByRole('button', { name: /^Import Inventory Setup/ }));
    await waitFor(() => expect(readText).toHaveBeenCalledOnce());
    fireEvent.click(screen.getByRole('button', { name: /^Inventory slot 1:/ }));
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Clear slot' }));
    expect(screen.getByRole('button', { name: 'Inventory slot 1: empty' })).toBeInTheDocument();

    await act(async () => {
      resolveRead?.(inventorySetupString());
    });

    expect(screen.getByRole('button', { name: 'Inventory slot 1: empty' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Head: Ancestral hat' })).toBeNull();
  });

  it('lets a newer import win when an older clipboard read resolves last', async () => {
    let resolveFirst: ((value: string) => void) | undefined;
    const older = new Promise<string>((resolve) => {
      resolveFirst = resolve;
    });
    const readText = vi
      .fn<() => Promise<string>>()
      .mockImplementationOnce(() => older)
      .mockResolvedValueOnce(inventorySetupString());
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { readText } });
    render(<Harness stats={createDefaultStats()} initialLoadout={presetLoadout(melee)} />);

    fireEvent.click(screen.getByRole('button', { name: /^Import Inventory Setup/ }));
    await waitFor(() => expect(readText).toHaveBeenCalledOnce());
    fireEvent.click(screen.getByRole('button', { name: /^Import Inventory Setup/ }));
    await waitFor(() => expect(screen.getByRole('button', { name: 'Head: Ancestral hat' })).toBeInTheDocument());

    const olderSetup = JSON.parse(inventorySetupString());
    olderSetup.setup.eq[0] = { id: 28254 };
    await act(async () => {
      resolveFirst?.(JSON.stringify(olderSetup));
    });

    expect(screen.getByRole('button', { name: 'Head: Ancestral hat' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Head: Sanguine torva full helm/ })).toBeNull();
  });

  it('does not apply a clipboard read after the loadout editor unmounts', async () => {
    let resolveRead: ((value: string) => void) | undefined;
    const readText = vi.fn(
      () =>
        new Promise<string>((resolve) => {
          resolveRead = resolve;
        }),
    );
    const loadoutSpy = vi.fn<(loadout: EncounterLoadout) => void>();
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { readText } });
    const { unmount } = render(
      <Harness stats={createDefaultStats()} initialLoadout={presetLoadout(melee)} loadoutSpy={loadoutSpy} />,
    );

    fireEvent.click(screen.getByRole('button', { name: /^Import Inventory Setup/ }));
    await waitFor(() => expect(readText).toHaveBeenCalledOnce());
    unmount();
    await act(async () => {
      resolveRead?.(inventorySetupString());
    });

    expect(loadoutSpy).not.toHaveBeenCalled();
  });

  it('offers a conflict-free name when an imported setup is saved', async () => {
    window.localStorage.setItem(
      'osrs-custom-equipment-presets',
      JSON.stringify({
        yama_p3: [
          {
            id: 'existing',
            name: 'RuneLite kit',
            loadout: {
              equipment: {},
              inventory: createEmptyInventory(),
              supplies: createEmptyCombatSupplies(),
            },
          },
        ],
      }),
    );
    const readText = vi.fn<() => Promise<string>>().mockResolvedValue(inventorySetupString());
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { readText } });
    render(<Harness stats={createDefaultStats()} initialLoadout={presetLoadout(melee)} />);

    fireEvent.click(screen.getByRole('button', { name: /^Import Inventory Setup/ }));
    await waitFor(() => expect(currentLabel()).toHaveTextContent('Custom loadout'));
    fireEvent.click(screen.getByRole('button', { name: 'Save preset' }));

    expect(screen.getByLabelText('Preset name')).toHaveValue('RuneLite kit 2');
  });

  it('cleanly retires transient import feedback after a few moments', async () => {
    vi.useFakeTimers();
    const readText = vi.fn<() => Promise<string>>().mockResolvedValue('not an inventory setup');
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { readText } });
    render(<Harness stats={createDefaultStats()} initialLoadout={presetLoadout(melee)} />);

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /^Import Inventory Setup/ }));
      await Promise.resolve();
    });
    // On the button, in one word, and in a card that costs the column no height. The row this
    // replaced animated 19.5px of text plus an 8px margin in and out again under the bar.
    const importAction = screen.getByRole('button', { name: /^Import Inventory Setup/ });
    expect(importAction).toHaveTextContent('Failed');
    expect(importAction).toHaveClass('loadout-io-btn--failed');
    expect(screen.queryByRole('status')).toBeNull();
    expect(document.querySelector('.loadout-status')).toBeNull();
    // A refusal opens its own reason: its recovery is the next thing the player needs.
    expect(screen.getByRole('tooltip')).toHaveTextContent('Paste a valid Inventory Setup');

    act(() => {
      vi.advanceTimersByTime(6_000);
    });

    expect(importAction).toHaveTextContent('Import');
    expect(importAction).not.toHaveClass('loadout-io-btn--failed');
    expect(screen.queryByRole('tooltip')).toBeNull();
  });

  it('retires import feedback once the loadout is edited', async () => {
    // An import that drops something is the only kind that still reports, so it is the only
    // kind that has feedback to retire.
    const portable = JSON.parse(inventorySetupString());
    portable.setup.eq[4] = { id: 999_999 };
    const readText = vi.fn<() => Promise<string>>().mockResolvedValue(JSON.stringify(portable));
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { readText } });
    render(<Harness stats={createDefaultStats()} initialLoadout={presetLoadout(melee)} />);

    const importAction = screen.getByRole('button', { name: /^Import Inventory Setup/ });
    fireEvent.click(importAction);
    await waitFor(() => expect(importAction).toHaveClass('loadout-io-btn--confirmed'));

    fireEvent.click(screen.getByRole('button', { name: /^Inventory slot 1:/ }));
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Clear slot' }));

    expect(importAction).toHaveTextContent('Import');
    expect(document.querySelector('.loadout-io-sr-status')).toHaveTextContent('');
  });

  it('explains unverified equipment when its warning badge is hovered', async () => {
    // The Dragon pickaxe: checked, and short of verified by one known gap.
    const unverifiedWeapon = getGearCatalog('weapon').find((item) => item.id === 11920);
    if (!unverifiedWeapon || unverifiedWeapon.verified) {
      throw new Error('expected the Dragon pickaxe to be an unverified catalog weapon');
    }
    const portable = JSON.parse(inventorySetupString());
    portable.setup.name = 'Needs review';
    portable.setup.eq[3] = { id: unverifiedWeapon.id };
    portable.setup.eq[4] = { id: 999_999 };
    portable.setup.inv[0] = { id: unverifiedWeapon.id };
    const readText = vi.fn<() => Promise<string>>().mockResolvedValue(JSON.stringify(portable));
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { readText } });

    render(<Harness stats={createDefaultStats()} initialLoadout={presetLoadout(melee)} />);
    fireEvent.click(screen.getByRole('button', { name: /^Import Inventory Setup/ }));

    const weaponSlot = await screen.findByRole('button', {
      name: new RegExp(`Weapon: ${unverifiedWeapon.name}.*unverified`, 'i'),
    });
    const inventorySlot = screen.getByRole('button', {
      name: new RegExp(`Inventory slot 1: ${unverifiedWeapon.name}.*unverified`, 'i'),
    });
    const weaponTrigger = weaponSlot.querySelector('.loadout-unverified-item');
    const inventoryTrigger = inventorySlot.querySelector('.loadout-unverified-item');
    expect(weaponTrigger?.querySelector('img')).not.toBeNull();
    expect(weaponTrigger?.querySelector('.loadout-slot-unverified')).not.toBeNull();
    expect(inventoryTrigger?.querySelector('canvas')).not.toBeNull();
    expect(inventoryTrigger?.querySelector('.loadout-slot-unverified')).not.toBeNull();

    // The import resolved outside act, so the passive effect that binds the card's pointer
    // listeners has not flushed yet. Hovering before it does silently fires into nothing.
    await act(async () => {});

    // The shared card opens on a pointer dwell, not on the first mouse event over the slot: a
    // mouseOver alone is the pointer merely passing, which is what the dwell exists to ignore.
    fireEvent.pointerEnter(weaponSlot, { pointerType: 'mouse' });
    expect(screen.queryByRole('tooltip')).toBeNull();
    const tooltip = await screen.findByRole('tooltip', {}, { timeout: 2000 });
    expect(tooltip).toHaveClass('hover-card', 'loadout-unverified-card');
    // The item leads. Which item is the only thing the badge on the slot cannot already say, so
    // a generic heading above it spends the card's first line saying nothing.
    expect(tooltip.querySelector('.loadout-unverified-card-title')).toHaveTextContent(unverifiedWeapon.name);
    // What is known to be wrong with it, one reason a line, rather than a generic warning.
    expect(
      [...tooltip.querySelectorAll('.loadout-unverified-card-reasons li')].map((reason) => reason.textContent),
    ).toEqual(['Special attack not implemented.']);
    expect(tooltip).not.toHaveTextContent('Unverified item');
    expect(tooltip.querySelector('.hover-card-caret')).not.toBeNull();
    fireEvent.pointerLeave(weaponSlot, { pointerType: 'mouse' });
    await waitFor(() => expect(screen.queryByRole('tooltip')).toBeNull());
    // A partial success does not open its own card — it waits to be asked — so what it left out
    // reaches a reader through the live region rather than by being forced on screen.
    expect(document.querySelector('.loadout-io-sr-status')).toHaveTextContent('1 unsupported item was left out');
  });

  it('marks a verified weapon with a known limitation in gray, not with the unverified warning', async () => {
    const ECLIPSE_ATLATL = 29000;
    const SARACHNIS_CUDGEL = 23528;
    const portable = JSON.parse(inventorySetupString());
    portable.setup.eq[3] = { id: ECLIPSE_ATLATL };
    portable.setup.inv[0] = { id: ECLIPSE_ATLATL };
    portable.setup.inv[1] = { id: SARACHNIS_CUDGEL };
    const readText = vi.fn<() => Promise<string>>().mockResolvedValue(JSON.stringify(portable));
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { readText } });

    render(<Harness stats={createDefaultStats()} initialLoadout={presetLoadout(melee)} />);
    fireEvent.click(screen.getByRole('button', { name: /^Import Inventory Setup/ }));

    // The note follows the item, and nothing calls the item itself unverified.
    const weaponSlot = await screen.findByRole('button', {
      name: 'Weapon: Eclipse atlatl. Special attack unavailable.',
    });
    const inventorySlot = screen.getByRole('button', {
      name: 'Inventory slot 1: Eclipse atlatl. Special attack unavailable.',
    });
    for (const slot of [weaponSlot, inventorySlot]) {
      expect(slot.querySelector('.loadout-slot-note')).not.toBeNull();
      expect(slot.querySelector('.loadout-slot-unverified')).toBeNull();
      expect(slot).not.toHaveClass('equip-slot--unverified');
      expect(slot).not.toHaveClass('inventory-slot--unverified');
    }
    // A fully verified weapon with nothing to note carries no mark at all.
    const cudgelSlot = screen.getByRole('button', { name: 'Inventory slot 2: Sarachnis cudgel' });
    expect(cudgelSlot.querySelector('.loadout-slot-note, .loadout-slot-unverified')).toBeNull();

    await act(async () => {});

    // Keyboard focus opens the same card the pointer does, and says only the limitation.
    act(() => weaponSlot.focus());
    const tooltip = await screen.findByRole('tooltip');
    expect(tooltip).toHaveClass('loadout-unverified-card', 'loadout-unverified-card--note');
    expect(tooltip.querySelector('.loadout-unverified-card-title')).toHaveTextContent('Eclipse atlatl');
    expect(
      [...tooltip.querySelectorAll('.loadout-unverified-card-reasons li')].map((reason) => reason.textContent),
    ).toEqual(['Special attack unavailable.']);
    expect(tooltip).not.toHaveTextContent(/verified/i);
    // Still the same button: the card did not remount the slot out from under the focus.
    expect(document.activeElement).toBe(weaponSlot);
  });

  it('notes in gray that both verified blowpipes always use dragon darts', async () => {
    const portable = JSON.parse(inventorySetupString());
    portable.setup.eq[3] = { id: 12926 }; // Toxic blowpipe
    portable.setup.inv[0] = { id: 28688 }; // Blazing blowpipe
    portable.setup.inv[1] = { id: 30374 }; // Drygore blowpipe: unverified
    const readText = vi.fn<() => Promise<string>>().mockResolvedValue(JSON.stringify(portable));
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { readText } });

    render(<Harness stats={createDefaultStats()} initialLoadout={presetLoadout(melee)} />);
    fireEvent.click(screen.getByRole('button', { name: /^Import Inventory Setup/ }));

    const weaponSlot = await screen.findByRole('button', { name: 'Weapon: Toxic blowpipe. Always uses dragon darts.' });
    const inventorySlot = screen.getByRole('button', {
      name: 'Inventory slot 1: Blazing blowpipe. Always uses dragon darts.',
    });
    for (const slot of [weaponSlot, inventorySlot]) {
      expect(slot.querySelector('.loadout-slot-note')).not.toBeNull();
      expect(slot.querySelector('.loadout-slot-unverified')).toBeNull();
    }
    // Another blowpipe keeps the amber warning, and gets no gray note beside it.
    const otherSlot = screen.getByRole('button', { name: /^Inventory slot 2: Drygore blowpipe.*unverified/i });
    expect(otherSlot.querySelector('.loadout-slot-unverified')).not.toBeNull();
    expect(otherSlot.querySelector('.loadout-slot-note')).toBeNull();
    expect(otherSlot).not.toHaveAccessibleName(/dragon darts/);

    await act(async () => {});

    act(() => inventorySlot.focus());
    const tooltip = await screen.findByRole('tooltip');
    expect(tooltip).toHaveClass('loadout-unverified-card--note');
    expect(tooltip.querySelector('.loadout-unverified-card-title')).toHaveTextContent('Blazing blowpipe');
    expect(
      [...tooltip.querySelectorAll('.loadout-unverified-card-reasons li')].map((reason) => reason.textContent),
    ).toEqual(['Always uses dragon darts.']);
    expect(document.activeElement).toBe(inventorySlot);
  });
});

describe('EncounterLoadoutSection — Inventory Setup export', () => {
  afterEach(() => {
    window.localStorage.removeItem('osrs-custom-equipment-presets');
    vi.restoreAllMocks();
  });

  function mockWriteText(): ReturnType<typeof vi.fn<(text: string) => Promise<void>>> {
    const writeText = vi.fn<(text: string) => Promise<void>>().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText } });
    return writeText;
  }

  it('offers exactly one export action, in the loadout frame rather than on the tiles', () => {
    render(<Harness stats={createDefaultStats()} initialLoadout={presetLoadout(maxMage)} />);

    const pair = document.querySelector('.loadout-io');
    const buttons = [...(pair?.querySelectorAll('.loadout-io-btn') ?? [])];
    expect(buttons.map((b) => b.getAttribute('aria-label'))).toEqual([
      'Import Inventory Setup from the clipboard',
      `Export ${maxMage.name} as an Inventory Setup`,
    ]);
    expect(document.querySelector('.loadout-bar-tools')?.contains(pair ?? null)).toBe(true);
    expect(document.querySelector('.loadout-bar-identity')?.querySelector('.loadout-io')).toBeNull();
    expect(document.querySelector('.loadout-frame')?.querySelector('.loadout-io')).toBeNull();
  });

  it('states the recovery on the control itself while Export is off', async () => {
    const readText = vi.fn<() => Promise<string>>().mockResolvedValue(inventorySetupString());
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { readText } });
    render(<Harness stats={createDefaultStats()} initialLoadout={presetLoadout(melee)} />);

    fireEvent.click(screen.getByRole('button', { name: /^Import Inventory Setup/ }));
    const exportButton = document.querySelector('.loadout-io-btn--export');
    await waitFor(() =>
      expect(exportButton).toHaveAttribute('aria-label', 'Export Inventory Setup, save a preset first'),
    );

    // Moving the recovery into a hover card again hides it from every pointer that never
    // dwells and from the keyboard entirely.
    expect(exportButton).toHaveAttribute('aria-label', 'Export Inventory Setup, save a preset first');
    expect(exportButton).toHaveAttribute('title', 'Save a preset to export this loadout');
    expect(exportButton).toHaveTextContent('Export');
    expect(screen.queryByRole('tooltip')).toBeNull();
  });

  it('keeps both halves of the pair mounted while a draft is open', async () => {
    const readText = vi.fn<() => Promise<string>>().mockResolvedValue(inventorySetupString());
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { readText } });
    render(<Harness stats={createDefaultStats()} initialLoadout={presetLoadout(melee)} />);

    fireEvent.click(screen.getByRole('button', { name: /^Import Inventory Setup/ }));
    await waitFor(() => expect(document.querySelector('.loadout-section--drafting')).not.toBeNull());

    // Importing opens a draft, and the control that did it must stay mounted for the whole life
    // of that state, or the pair would vanish at the moment it is most likely to be reached for.
    expect(document.querySelectorAll('.loadout-io-btn')).toHaveLength(2);
    // Either of its two names: the mark reads "Imported" for a moment after it succeeds.
    expect(screen.getByRole('button', { name: /^Import(ed)? Inventory Setup/ })).toBeInTheDocument();
  });

  it('confirms an import on the mark and traces the frame the set landed in', async () => {
    const readText = vi.fn<() => Promise<string>>().mockResolvedValue(inventorySetupString());
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { readText } });
    render(<Harness stats={createDefaultStats()} initialLoadout={presetLoadout(melee)} />);

    const mark = document.querySelector('.loadout-io-btn') as HTMLElement;
    expect(mark).not.toHaveClass('loadout-io-btn--confirmed');
    expect(document.querySelector('.loadout-editor-settle')).toBeNull();

    fireEvent.click(mark);
    await waitFor(() => expect(mark).toHaveClass('loadout-io-btn--confirmed'));

    expect(mark).toHaveClass('loadout-io-btn--confirmed');
    expect(mark).toHaveTextContent('Imported');
    expect(document.querySelector('.loadout-editor-settle')).not.toBeNull();
  });

  it('leaves one tick in the pair, because the newer transfer settles what the older one said', async () => {
    // A copy landing inside the import's confirmation must not light both marks at once, which
    // would claim the clipboard held two different things.
    const readText = vi.fn<() => Promise<string>>().mockResolvedValue(
      exportInventorySetup('Max Mage', {
        equipment: maxMage.equipment,
        inventory: maxMage.inventory,
        supplies: maxMage.supplies ?? createEmptyCombatSupplies(),
      }),
    );
    const writeText = vi.fn<(text: string) => Promise<void>>().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { readText, writeText } });
    render(<Harness stats={createDefaultStats()} initialLoadout={presetLoadout(melee)} />);

    const importMark = document.querySelector('.loadout-io-btn') as HTMLElement;
    const exportMark = document.querySelector('.loadout-io-btn--export') as HTMLElement;

    // Importing a set that already exists selects it rather than drafting, which is what leaves
    // Export enabled and makes the two confirmations reachable inside one dwell.
    fireEvent.click(importMark);
    await waitFor(() => expect(importMark).toHaveClass('loadout-io-btn--confirmed'));

    fireEvent.click(exportMark);
    await waitFor(() => expect(exportMark).toHaveClass('loadout-io-btn--confirmed'));

    expect(importMark).toHaveTextContent('Import');
    expect(importMark).not.toHaveClass('loadout-io-btn--confirmed');
    expect(document.querySelectorAll('.loadout-io-btn--confirmed')).toHaveLength(1);
  });

  it('takes the tick down when the newer transfer refuses', async () => {
    const readText = vi.fn<() => Promise<string>>().mockResolvedValue(inventorySetupString());
    const writeText = vi.fn<(text: string) => Promise<void>>().mockRejectedValue(new Error('denied'));
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { readText, writeText } });
    render(<Harness stats={createDefaultStats()} initialLoadout={presetLoadout(melee)} />);

    const importMark = document.querySelector('.loadout-io-btn') as HTMLElement;
    fireEvent.click(importMark);
    await waitFor(() => expect(importMark).toHaveClass('loadout-io-btn--confirmed'));

    // Export refuses from a draft before it reaches the clipboard, so the import is undone first
    // to leave a saved set the export can actually be attempted from.
    fireEvent.click(screen.getByRole('button', { name: /^Revert to / }));
    fireEvent.click(document.querySelector('.loadout-io-btn--export') as HTMLElement);

    const exportAction = document.querySelector('.loadout-io-btn--export') as HTMLElement;
    await waitFor(() => expect(exportAction).toHaveClass('loadout-io-btn--failed'));
    expect(exportAction).toHaveTextContent('Failed');
    // One channel, so the newer press takes the older one's tick with it rather than leaving the
    // bar confirming and refusing at once.
    expect(document.querySelectorAll('.loadout-io-btn--confirmed')).toHaveLength(0);
  });

  it('selects an existing set rather than drafting a second copy of it', async () => {
    // The exact loadout of a shipped set, which is what a player re-importing their own export
    // hands back. Drafting it offered Save, and saving left two entries for one loadout.
    const portable = JSON.parse(
      exportInventorySetup('Max Mage', {
        equipment: maxMage.equipment,
        inventory: maxMage.inventory,
        supplies: maxMage.supplies ?? createEmptyCombatSupplies(),
      }),
    );
    const readText = vi.fn<() => Promise<string>>().mockResolvedValue(JSON.stringify(portable));
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { readText } });
    render(<Harness stats={createDefaultStats()} initialLoadout={presetLoadout(melee)} />);

    fireEvent.click(document.querySelector('.loadout-io-btn') as HTMLElement);
    await waitFor(() =>
      expect(document.querySelector('.loadout-io-sr-status')).toHaveTextContent(
        `This setup matches ${maxMage.name}, now selected.`,
      ),
    );

    expect(currentLabel()).toHaveTextContent(maxMage.name);
    expect(screen.queryByRole('button', { name: 'Save preset' })).toBeNull();
    expect(document.querySelector('.loadout-section--drafting')).toBeNull();
    expect(document.querySelector('.loadout-io-sr-status')).toHaveTextContent(
      `This setup matches ${maxMage.name}, now selected.`,
    );
  });

  it('names the set an import landed on when it is the set already selected', async () => {
    // Re-importing the loadout the frame is already showing repaints it to itself: no draft,
    // no readout change, no slot moves. Without the line, the tick on the mark is the entire
    // outcome of the press, and it reads as an import that did nothing.
    const readText = vi.fn<() => Promise<string>>().mockResolvedValue(
      exportInventorySetup('My Yama kit', {
        equipment: maxMage.equipment,
        inventory: maxMage.inventory,
        supplies: maxMage.supplies ?? createEmptyCombatSupplies(),
      }),
    );
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { readText } });
    render(<Harness stats={createDefaultStats()} initialLoadout={presetLoadout(maxMage)} />);

    fireEvent.click(document.querySelector('.loadout-io-btn') as HTMLElement);
    await waitFor(() =>
      expect(document.querySelector('.loadout-io-sr-status')).toHaveTextContent(
        `This setup matches ${maxMage.name}, now selected.`,
      ),
    );

    expect(document.querySelector('.loadout-io-sr-status')).toHaveTextContent(
      `This setup matches ${maxMage.name}, now selected.`,
    );
    expect(currentLabel()).toHaveTextContent(maxMage.name);
    expect(document.querySelector('.loadout-section--drafting')).toBeNull();
  });

  it('refuses a name a shipped set already holds', async () => {
    const readText = vi.fn<() => Promise<string>>().mockResolvedValue(inventorySetupString());
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { readText } });
    render(<Harness stats={createDefaultStats()} initialLoadout={presetLoadout(melee)} />);

    fireEvent.click(document.querySelector('.loadout-io-btn') as HTMLElement);
    await screen.findByRole('button', { name: 'Save preset' });

    fireEvent.click(screen.getByRole('button', { name: 'Save preset' }));
    fireEvent.change(screen.getByLabelText('Preset name'), { target: { value: maxMage.name } });
    fireEvent.click(screen.getByRole('button', { name: 'Save preset' }));

    expect(screen.getByRole('status')).toHaveTextContent(`A preset named ${maxMage.name} already exists`);
    expect(screen.queryByRole('heading', { name: /^Saved/ })).toBeNull();
  });

  it('turns Export off while the loadout matches no set, and back on once it is saved', async () => {
    const readText = vi.fn<() => Promise<string>>().mockResolvedValue(inventorySetupString());
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { readText } });
    render(<Harness stats={createDefaultStats()} initialLoadout={presetLoadout(melee)} />);

    const exportAt = () => document.querySelector('.loadout-io-btn--export');
    expect(exportAt()).not.toHaveAttribute('aria-disabled');

    fireEvent.click(screen.getByRole('button', { name: /^Import Inventory Setup/ }));
    await waitFor(() => expect(exportAt()).toHaveAttribute('aria-disabled', 'true'));

    expect(exportAt()).toHaveAttribute('aria-disabled', 'true');
    // Export requires a preset, unlike Start, so its accessible name explains that recovery.
    expect(exportAt()).toHaveAttribute('aria-label', 'Export Inventory Setup, save a preset first');

    fireEvent.click(screen.getByRole('button', { name: 'Save preset' }));
    fireEvent.click(screen.getByRole('button', { name: 'Save preset' }));

    expect(exportAt()).not.toHaveAttribute('aria-disabled');
  });

  it('refuses the copy while Export is off', async () => {
    const writeText = mockWriteText();
    const readText = vi.fn<() => Promise<string>>().mockResolvedValue(inventorySetupString());
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { readText, writeText } });
    render(<Harness stats={createDefaultStats()} initialLoadout={presetLoadout(melee)} />);

    fireEvent.click(screen.getByRole('button', { name: /^Import Inventory Setup/ }));
    const exportButton = document.querySelector('.loadout-io-btn--export');
    await waitFor(() => expect(exportButton).toHaveAttribute('aria-disabled', 'true'));
    fireEvent.click(exportButton as HTMLElement);

    // aria-disabled is advisory: the browser still dispatches the click, so the handler is
    // what actually has to refuse it.
    expect(writeText).not.toHaveBeenCalled();
  });

  it('copies the worn set as an Inventory Setup the importer round-trips', async () => {
    const writeText = mockWriteText();
    render(<Harness stats={createDefaultStats()} initialLoadout={presetLoadout(maxMage)} />);

    fireEvent.click(screen.getByRole('button', { name: `Export ${maxMage.name} as an Inventory Setup` }));

    await waitFor(() => expect(writeText).toHaveBeenCalledOnce());
    const round = importInventorySetup(writeText.mock.calls[0]?.[0] ?? '');
    if (round.kind !== 'success') {
      throw new Error(`expected the exported string to import, got: ${round.message}`);
    }
    expect(round.name).toBe(maxMage.name);
    expect(round.loadout.equipment).toEqual(maxMage.equipment);
  });

  it('confirms a copy on the button itself, leaving the column unmoved', async () => {
    const writeText = mockWriteText();
    render(<Harness stats={createDefaultStats()} initialLoadout={presetLoadout(maxMage)} />);

    const action = screen.getByRole('button', { name: `Export ${maxMage.name} as an Inventory Setup` });
    const label = action.querySelector('.loadout-io-label');
    expect(action).not.toHaveClass('loadout-io-btn--confirmed');
    expect(action).toHaveTextContent('Export');

    fireEvent.click(action);
    await waitFor(() => expect(writeText).toHaveBeenCalledOnce());

    // On the control, not in a row elsewhere in the section, and nothing moves to make space:
    // the confirmation repaints the one label box rather than swapping in a second one.
    await waitFor(() => expect(action).toHaveClass('loadout-io-btn--confirmed'));
    expect(action).toHaveTextContent('Copied');
    expect(action.querySelector('.loadout-io-label')).toBe(label);
    expect(action).toHaveAttribute('aria-label', `Copied ${maxMage.name} as an Inventory Setup`);
    expect(screen.queryByRole('status')).toBeNull();
    expect(document.querySelector('.loadout-status')).toBeNull();
    // A repainted label is silent to a screen reader, so the announcement moves here.
    expect(document.querySelector('.loadout-io-sr-status')).toHaveTextContent(
      `Copied ${maxMage.name} as an Inventory Setup.`,
    );
  });

  /**
   * `resolveSelectedPresetKey` never reads supplies, so the worn set keeps its tile selected
   * across a spellbook change. Export has to follow the panel, not the shipped copy.
   */
  it('exports the live loadout for the set that is currently worn', async () => {
    const writeText = mockWriteText();

    function SuppliesHarness() {
      const [loadout, setLoadout] = useState<EncounterLoadout>({
        equipment: maxMage.equipment,
        inventory: maxMage.inventory,
        supplies: maxMage.supplies ?? createEmptyCombatSupplies(),
      });
      return (
        <EncounterLoadoutSection
          encounterKind="yama_p3"
          presetsKey="yama_p3"
          appearance={DEFAULT_PLAYER_CONFIG.appearance}
          stats={createDefaultStats()}
          encounterEquipment={loadout.equipment}
          inventory={loadout.inventory}
          supplies={loadout.supplies}
          onEquipmentChange={vi.fn()}
          onInventoryChange={vi.fn()}
          onLoadoutChange={setLoadout}
        />
      );
    }
    render(<SuppliesHarness />);

    fireEvent.click(screen.getByRole('radio', { name: 'Ancient' }));
    fireEvent.click(screen.getByRole('button', { name: 'Save preset' }));
    fireEvent.click(screen.getByRole('button', { name: 'Save preset' }));
    fireEvent.click(screen.getByRole('button', { name: `Export ${maxMage.name} (custom) as an Inventory Setup` }));

    await waitFor(() => expect(writeText).toHaveBeenCalledOnce());
    const round = importInventorySetup(writeText.mock.calls[0]?.[0] ?? '');
    if (round.kind !== 'success') {
      throw new Error(`expected the exported string to import, got: ${round.message}`);
    }
    expect(round.loadout.supplies.spellbook).toBe('ancient');
  });

  it('reports a refused clipboard instead of claiming a copy', async () => {
    const writeText = vi.fn<(text: string) => Promise<void>>().mockRejectedValue(new Error('denied'));
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText } });
    render(<Harness stats={createDefaultStats()} initialLoadout={presetLoadout(melee)} />);

    fireEvent.click(screen.getByRole('button', { name: `Export ${melee.name} as an Inventory Setup` }));

    const exportAction = document.querySelector('.loadout-io-btn--export') as HTMLElement;
    await waitFor(() => expect(exportAction).toHaveClass('loadout-io-btn--failed'));
    expect(screen.getByRole('tooltip')).toHaveTextContent('refused clipboard access');
    expect(document.querySelector('.loadout-status')).toBeNull();
  });
});

describe('EncounterLoadoutSection — inventory slots are rearranged by dragging', () => {
  const SARADOMIN_BREW = 6685;
  const ANGLERFISH = 13441;

  /** Where the grid and its cells are, since the test DOM measures everything as zero. */
  const GRID_ORIGIN = { x: 100, y: 100 };
  const CELL_PITCH = 40;
  const CELL_SIZE = 38;
  const COLUMNS = 4;
  const ROWS = 7;

  let rafCallbacks: Map<number, FrameRequestCallback>;
  let nextRafId: number;

  beforeEach(() => {
    rafCallbacks = new Map();
    nextRafId = 1;
    vi.stubGlobal(
      'requestAnimationFrame',
      vi.fn((callback: FrameRequestCallback) => {
        const id = nextRafId++;
        rafCallbacks.set(id, callback);
        return id;
      }),
    );
    vi.stubGlobal(
      'cancelAnimationFrame',
      vi.fn((id: number) => {
        rafCallbacks.delete(id);
      }),
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    __resetKeyStateForTest();
  });

  function flushRaf(): void {
    const callbacks = Array.from(rafCallbacks.values());
    rafCallbacks.clear();
    for (const callback of callbacks) callback(0);
  }

  function rect(left: number, top: number, width: number, height: number): DOMRect {
    return {
      left,
      top,
      width,
      height,
      right: left + width,
      bottom: top + height,
      x: left,
      y: top,
      toJSON: () => ({}),
    } as DOMRect;
  }

  /** A kit with something to move and somewhere empty to move it to. */
  function draggableInventory(): Inventory {
    const inventory = createEmptyInventory();
    inventory[0] = { id: SARADOMIN_BREW, quantity: 3 };
    inventory[3] = { id: ANGLERFISH, quantity: 1 };
    return inventory;
  }

  /**
   * Lay the grid out with its top-left at `origin`. The drag measures the grid and its cells,
   * and every box in a test DOM is the origin with no size, so without this every drop lands on
   * slot 1. Laying it out again elsewhere is the panel scrolling under the pointer.
   */
  function layOutGrid(origin = GRID_ORIGIN): void {
    const grid = document.querySelector<HTMLElement>('.inventory-grid');
    if (!grid) throw new Error('inventory grid not found');
    grid.getBoundingClientRect = () => rect(origin.x, origin.y, COLUMNS * CELL_PITCH, ROWS * CELL_PITCH);
    for (const cell of grid.querySelectorAll<HTMLElement>('[data-inventory-index]')) {
      const index = Number(cell.getAttribute('data-inventory-index'));
      const { x, y } = slotCentre(index, origin);
      cell.getBoundingClientRect = () => rect(x - CELL_SIZE / 2, y - CELL_SIZE / 2, CELL_SIZE, CELL_SIZE);
    }
  }

  function slotCentre(index: number, origin = GRID_ORIGIN): { x: number; y: number } {
    return {
      x: origin.x + (index % COLUMNS) * CELL_PITCH + CELL_PITCH / 2,
      y: origin.y + Math.floor(index / COLUMNS) * CELL_PITCH + CELL_PITCH / 2,
    };
  }

  function slotCell(index: number): HTMLElement {
    const cell = document.querySelector<HTMLElement>(`[data-inventory-index="${index}"]`);
    if (!cell) throw new Error(`inventory cell ${index} not found`);
    return cell;
  }

  /** Press slot `from`, travel to `to`, and release there. `to` may be a point off the grid. */
  function dragSlot(from: number, to: number | { x: number; y: number }, options: { escape?: boolean } = {}): void {
    const start = slotCentre(from);
    const end = typeof to === 'number' ? slotCentre(to) : to;
    fireEvent.mouseDown(slotCell(from), { button: 0, clientX: start.x, clientY: start.y });
    act(() => {
      fireEvent.mouseMove(window, { clientX: end.x, clientY: end.y, buttons: 1 });
      flushRaf();
    });
    if (options.escape) {
      // At the focused element, as a real key press is, so it travels the whole capture path.
      fireEvent.keyDown(document.activeElement ?? document.body, { key: 'Escape', code: 'Escape' });
    }
    fireEvent.mouseUp(window, { clientX: end.x, clientY: end.y });
  }

  function renderDraggable(inventorySpy?: (inventory: Inventory) => void) {
    const view = render(
      <Harness
        stats={createDefaultStats()}
        initialLoadout={{
          equipment: {},
          inventory: draggableInventory(),
          supplies: createEmptyCombatSupplies(),
        }}
        inventorySpy={inventorySpy}
      />,
    );
    layOutGrid();
    return view;
  }

  it('trades two filled slots when one is dragged onto the other', () => {
    const inventorySpy = vi.fn<(inventory: Inventory) => void>();
    renderDraggable(inventorySpy);

    dragSlot(0, 3);

    const inventory = inventorySpy.mock.lastCall?.[0];
    expect(inventory?.[0]).toEqual({ id: ANGLERFISH, quantity: 1 });
    expect(inventory?.[3]).toEqual({ id: SARADOMIN_BREW, quantity: 3 });
    // The whole stack travels, not just the item: a rearranged kit is the same kit.
    expect(screen.getByRole('button', { name: 'Inventory slot 4: Saradomin brew(4)' })).toBeInTheDocument();
  });

  it('moves an item into an empty slot, leaving the one it came from empty', () => {
    const inventorySpy = vi.fn<(inventory: Inventory) => void>();
    renderDraggable(inventorySpy);

    dragSlot(0, 9);

    const inventory = inventorySpy.mock.lastCall?.[0];
    expect(inventory?.[9]).toEqual({ id: SARADOMIN_BREW, quantity: 3 });
    expect(inventory?.[0]).toBeNull();
  });

  it('leaves a press that never travels to the picker', () => {
    const inventorySpy = vi.fn<(inventory: Inventory) => void>();
    renderDraggable(inventorySpy);
    const cell = slotCell(0);
    const { x, y } = slotCentre(0);

    fireEvent.mouseDown(cell, { button: 0, clientX: x, clientY: y });
    act(() => {
      // Inside the threshold: a hand resting on the button, not a drag.
      fireEvent.mouseMove(window, { clientX: x + 2, clientY: y + 1, buttons: 1 });
      flushRaf();
    });
    fireEvent.mouseUp(window, { clientX: x + 2, clientY: y + 1 });
    fireEvent.click(cell);

    expect(screen.getByRole('listbox', { name: 'Inventory items' })).toBeInTheDocument();
    expect(inventorySpy).not.toHaveBeenCalled();
  });

  it('swallows the click a completed drag also produces, so no picker opens on the drop', () => {
    renderDraggable();

    dragSlot(0, 3);
    // A mouse's click counts its presses; only a keyboard's is 0.
    fireEvent.click(slotCell(3), { detail: 1 });

    expect(screen.queryByRole('listbox', { name: 'Inventory items' })).toBeNull();
  });

  it("leaves the next keyboard activation alone when the drag's click landed on the grid around the cells", () => {
    renderDraggable();

    dragSlot(0, 3);
    // A drag across cells clicks the element both ends share, which no cell's guard sees.
    const grid = document.querySelector<HTMLElement>('.inventory-grid');
    if (!grid) throw new Error('inventory grid not found');
    fireEvent.click(grid, { detail: 1 });
    fireEvent.click(slotCell(3), { detail: 0 });

    expect(screen.getByRole('listbox', { name: 'Inventory items' })).toBeInTheDocument();
  });

  it("stops guarding against the drag's click once the release is over", async () => {
    renderDraggable();

    dragSlot(0, 3);
    // The release's click comes with the release; one in a later task is someone else's.
    await act(() => new Promise((resolve) => setTimeout(resolve, 0)));
    fireEvent.click(slotCell(3), { detail: 1 });

    expect(screen.getByRole('listbox', { name: 'Inventory items' })).toBeInTheDocument();
  });

  it('puts the item back when Escape interrupts the drag', () => {
    const inventorySpy = vi.fn<(inventory: Inventory) => void>();
    renderDraggable(inventorySpy);

    dragSlot(0, 3, { escape: true });

    expect(inventorySpy).not.toHaveBeenCalled();
    expect(document.querySelector('.inventory-drag-ghost')).toBeNull();
    expect(screen.getByRole('button', { name: 'Inventory slot 1: Saradomin brew(4)' })).toBeInTheDocument();
  });

  it('spends the whole Escape press on the drag, and leaves the next one to the layer underneath', () => {
    // Tracking from before the press, as in the app, so the tracker sees every key event.
    expect(isKeyHeld('Escape')).toBe(false);
    const inventorySpy = vi.fn<(inventory: Inventory) => void>();
    renderDraggable(inventorySpy);
    // The panel the editor sits in, which Escape would otherwise close.
    const closeLayer = vi.fn();
    renderHook(() => useEscapeLayer(ESC_PRIORITY.SIDE_PANEL, true, closeLayer));
    const start = slotCentre(0);
    const over = slotCentre(3);
    const escapeKey = { key: 'Escape', code: 'Escape' };

    fireEvent.mouseDown(slotCell(0), { button: 0, clientX: start.x, clientY: start.y });
    act(() => {
      fireEvent.mouseMove(window, { clientX: over.x, clientY: over.y, buttons: 1 });
      flushRaf();
    });
    expect(document.querySelector('.inventory-drag-ghost')).not.toBeNull();

    fireEvent.keyDown(slotCell(0), escapeKey);
    expect(document.querySelector('.inventory-drag-ghost')).toBeNull();
    expect(closeLayer).not.toHaveBeenCalled();
    expect(isKeyHeld('Escape')).toBe(false);

    // The key's auto-repeat belongs to the same press: refused before anything sees it.
    const repeatReached = fireEvent.keyDown(slotCell(0), { ...escapeKey, repeat: true });
    expect(repeatReached).toBe(false);
    expect(closeLayer).not.toHaveBeenCalled();
    expect(isKeyHeld('Escape')).toBe(false);

    fireEvent.mouseUp(window, { clientX: over.x, clientY: over.y });
    expect(inventorySpy).not.toHaveBeenCalled();

    fireEvent.keyUp(slotCell(0), escapeKey);
    fireEvent.keyDown(slotCell(0), escapeKey);
    expect(closeLayer).toHaveBeenCalledOnce();
  });

  it('does not leave the Escape that canceled a drag held for anything polling keys', () => {
    // Tracking from before the press, as in the app, so the tracker sees the key go down.
    expect(isKeyHeld('Escape')).toBe(false);
    renderDraggable();

    dragSlot(0, 3, { escape: true });

    expect(isKeyHeld('Escape')).toBe(false);
  });

  /** Lift slot 1's item, then scroll the panel body under it. Returns where the grid went. */
  function liftThenScroll(): { x: number; y: number } {
    const start = slotCentre(0);
    fireEvent.mouseDown(slotCell(0), { button: 0, clientX: start.x, clientY: start.y });
    act(() => {
      fireEvent.mouseMove(window, { clientX: start.x + 20, clientY: start.y, buttons: 1 });
      flushRaf();
    });
    const scrolled = { x: GRID_ORIGIN.x, y: GRID_ORIGIN.y + 400 };
    layOutGrid(scrolled);
    return scrolled;
  }

  function moveAndRelease({ x, y }: { x: number; y: number }): void {
    act(() => {
      fireEvent.mouseMove(window, { clientX: x, clientY: y, buttons: 1 });
      flushRaf();
    });
    fireEvent.mouseUp(window, { clientX: x, clientY: y });
  }

  it('drops nothing where a slot was before the panel scrolled away under the item', () => {
    const inventorySpy = vi.fn<(inventory: Inventory) => void>();
    renderDraggable(inventorySpy);

    liftThenScroll();
    // Off the grid now that it has moved.
    moveAndRelease(slotCentre(3));

    expect(inventorySpy).not.toHaveBeenCalled();
  });

  it('drops onto the slot under the pointer after the panel scrolled under the item', () => {
    const inventorySpy = vi.fn<(inventory: Inventory) => void>();
    renderDraggable(inventorySpy);

    const scrolled = liftThenScroll();
    moveAndRelease(slotCentre(3, scrolled));

    const inventory = inventorySpy.mock.lastCall?.[0];
    expect(inventory?.[3]).toEqual({ id: SARADOMIN_BREW, quantity: 3 });
    expect(inventory?.[0]).toEqual({ id: ANGLERFISH, quantity: 1 });
  });

  it('changes nothing when the item is dropped outside the grid', () => {
    const inventorySpy = vi.fn<(inventory: Inventory) => void>();
    renderDraggable(inventorySpy);

    dragSlot(0, { x: GRID_ORIGIN.x - 80, y: GRID_ORIGIN.y - 80 });

    expect(inventorySpy).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'Inventory slot 1: Saradomin brew(4)' })).toBeInTheDocument();
  });

  it('picks nothing up from an empty slot', () => {
    const inventorySpy = vi.fn<(inventory: Inventory) => void>();
    renderDraggable(inventorySpy);

    dragSlot(9, 0);

    expect(inventorySpy).not.toHaveBeenCalled();
    expect(document.querySelector('.inventory-drag-ghost')).toBeNull();
    expect(screen.getByRole('button', { name: 'Inventory slot 1: Saradomin brew(4)' })).toBeInTheDocument();
  });

  it('marks the slot the item left and the slot it would land in while it is in hand', () => {
    renderDraggable();
    const start = slotCentre(0);
    const over = slotCentre(3);

    fireEvent.mouseDown(slotCell(0), { button: 0, clientX: start.x, clientY: start.y });
    act(() => {
      fireEvent.mouseMove(window, { clientX: over.x, clientY: over.y, buttons: 1 });
      flushRaf();
    });

    expect(slotCell(0)).toHaveClass('inventory-slot--carried');
    expect(slotCell(3)).toHaveClass('inventory-slot--drop');
    expect(document.querySelector('.inventory-drag-ghost')).not.toBeNull();

    fireEvent.mouseUp(window, { clientX: over.x, clientY: over.y });

    expect(document.querySelector('.inventory-slot--carried')).toBeNull();
    expect(document.querySelector('.inventory-drag-ghost')).toBeNull();
  });

  it('puts an open picker down when an item is lifted', () => {
    renderDraggable();
    fireEvent.click(slotCell(0));
    expect(screen.getByRole('listbox', { name: 'Inventory items' })).toBeInTheDocument();

    dragSlot(0, 3);

    expect(screen.queryByRole('listbox', { name: 'Inventory items' })).toBeNull();
  });

  it('commits through the inventory callback when there is no whole-loadout handler', () => {
    const onInventoryChange = vi.fn<(inventory: Inventory) => void>();
    render(
      <EncounterLoadoutSection
        encounterKind="yama_p3"
        presetsKey="yama_p3"
        appearance={DEFAULT_PLAYER_CONFIG.appearance}
        stats={createDefaultStats()}
        encounterEquipment={{}}
        inventory={draggableInventory()}
        onEquipmentChange={() => {}}
        onInventoryChange={onInventoryChange}
      />,
    );
    layOutGrid();

    dragSlot(0, 3);

    expect(onInventoryChange.mock.lastCall?.[0][3]).toEqual({ id: SARADOMIN_BREW, quantity: 3 });
  });

  describe('when the inventory is handed over again mid-drag', () => {
    function renderControlled(onInventoryChange: (inventory: Inventory) => void) {
      const section = (inventory: Inventory) => (
        <EncounterLoadoutSection
          encounterKind="yama_p3"
          presetsKey="yama_p3"
          appearance={DEFAULT_PLAYER_CONFIG.appearance}
          stats={createDefaultStats()}
          encounterEquipment={{}}
          inventory={inventory}
          onEquipmentChange={() => {}}
          onInventoryChange={onInventoryChange}
        />
      );
      const view = render(section(draggableInventory()));
      layOutGrid();
      return (inventory: Inventory) => {
        view.rerender(section(inventory));
        layOutGrid();
      };
    }

    function liftSlotZeroOverSlotThree(): { x: number; y: number } {
      const start = slotCentre(0);
      const over = slotCentre(3);
      fireEvent.mouseDown(slotCell(0), { button: 0, clientX: start.x, clientY: start.y });
      act(() => {
        fireEvent.mouseMove(window, { clientX: over.x, clientY: over.y, buttons: 1 });
        flushRaf();
      });
      expect(document.querySelector('.inventory-drag-ghost')).not.toBeNull();
      return over;
    }

    it('puts the item back when different contents replace the ones it was lifted from', () => {
      const onInventoryChange = vi.fn<(inventory: Inventory) => void>();
      const rerender = renderControlled(onInventoryChange);
      const over = liftSlotZeroOverSlotThree();

      // An imported setup lands while the item is in hand.
      const imported = createEmptyInventory();
      imported[0] = { id: ANGLERFISH, quantity: 1 };
      rerender(imported);
      expect(document.querySelector('.inventory-drag-ghost')).toBeNull();
      fireEvent.mouseUp(window, { clientX: over.x, clientY: over.y });

      expect(onInventoryChange).not.toHaveBeenCalled();
      expect(document.querySelector('.inventory-slot--carried')).toBeNull();
    });

    it.each([
      ['item', { id: SARADOMIN_BREW, quantity: 1 }],
      ['quantity', { id: ANGLERFISH, quantity: 2 }],
    ])('puts the item back when only the slot it is aimed at changes its %s', (_, replacement) => {
      const onInventoryChange = vi.fn<(inventory: Inventory) => void>();
      const rerender = renderControlled(onInventoryChange);
      const over = liftSlotZeroOverSlotThree();

      // The slot the item came from is untouched; only its destination differs.
      const changed = draggableInventory();
      changed[3] = replacement;
      rerender(changed);
      expect(document.querySelector('.inventory-drag-ghost')).toBeNull();
      fireEvent.mouseUp(window, { clientX: over.x, clientY: over.y });

      expect(onInventoryChange).not.toHaveBeenCalled();
    });

    it('keeps the drag through an equal copy of the same inventory', () => {
      const onInventoryChange = vi.fn<(inventory: Inventory) => void>();
      const rerender = renderControlled(onInventoryChange);
      const over = liftSlotZeroOverSlotThree();

      rerender(draggableInventory());
      expect(document.querySelector('.inventory-drag-ghost')).not.toBeNull();
      fireEvent.mouseUp(window, { clientX: over.x, clientY: over.y });

      expect(onInventoryChange.mock.lastCall?.[0][3]).toEqual({ id: SARADOMIN_BREW, quantity: 3 });
    });
  });
});
