import { describe, expect, it, vi } from 'vitest';
import type { PlayerEquipment } from '../../../rs/model/PlayerModelLoader';
import { createEmptyInventory } from '../../../types/inventory';
import {
  type EncounterSetupContext,
  type EncounterSetupNoteRule,
  loadoutHasItem,
  resolveSetupNotes,
} from '../setupNotes';

const context: EncounterSetupContext = {
  equipment: {},
  inventory: createEmptyInventory(),
  modifiers: {},
};

describe('resolveSetupNotes', () => {
  it('returns only matching notes in rule order, without their predicates', () => {
    const applies = vi.fn(() => true);
    const rules: readonly EncounterSetupNoteRule[] = [
      { id: 'first', message: 'First note', applies },
      { id: 'hidden', message: 'Hidden note', applies: () => false },
      { id: 'last', message: 'Last note', applies: () => true },
    ];

    expect(resolveSetupNotes(rules, context)).toEqual([
      { id: 'first', message: 'First note' },
      { id: 'last', message: 'Last note' },
    ]);
    expect(applies).toHaveBeenCalledExactlyOnceWith(context);
  });

  it.each([undefined, []])('returns no notes for absent or empty rules (%j)', (rules) => {
    expect(resolveSetupNotes(rules, context)).toEqual([]);
  });
});

describe('loadoutHasItem', () => {
  it.each<keyof PlayerEquipment>([
    'head',
    'cape',
    'amulet',
    'weapon',
    'body',
    'shield',
    'legs',
    'hands',
    'boots',
    'ring',
  ])('finds a matching item equipped in the %s slot', (slot) => {
    expect(loadoutHasItem({ ...context, equipment: { [slot]: 29796 } }, [1, 29796])).toBe(true);
  });

  it('finds an inventory item among empty slots', () => {
    const inventory = createEmptyInventory();
    inventory[7] = { id: 29796, quantity: 1 };
    expect(loadoutHasItem({ ...context, inventory }, [29796])).toBe(true);
  });

  it('returns false when no equipped or inventory item matches', () => {
    const inventory = createEmptyInventory();
    inventory[0] = { id: 4151 };
    expect(loadoutHasItem({ ...context, equipment: { weapon: 4151 }, inventory }, [29796])).toBe(false);
    expect(loadoutHasItem(context, [29796])).toBe(false);
    expect(loadoutHasItem({ ...context, equipment: { weapon: 29796 } }, [])).toBe(false);
  });

  it('handles undefined inventory, with or without an equipped match', () => {
    expect(loadoutHasItem({ ...context, inventory: undefined }, [29796])).toBe(false);
    expect(loadoutHasItem({ ...context, equipment: { weapon: 29796 }, inventory: undefined }, [29796])).toBe(true);
  });
});
