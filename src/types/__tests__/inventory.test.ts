import { describe, expect, it } from 'vitest';
import type { ObjTypeLoader } from '../../rs/config/objtype/ObjTypeLoader';
import type { Inventory } from '../inventory';
import {
  addItemToInventory,
  createEmptyInventory,
  INVENTORY_SIZE,
  isStackableItem,
  parseInventoryFromSetup,
  removeInventorySlot,
} from '../inventory';

const SHARK = 385;
const COINS = 995;

describe('addItemToInventory', () => {
  it('puts a non-stackable item in the first free slot', () => {
    const inventory = createEmptyInventory();
    inventory[0] = { id: COINS };

    const next = addItemToInventory(inventory, SHARK, 1, false);

    expect(next?.[1]).toEqual({ id: SHARK });
  });

  it('merges a stackable into an existing stack of the same id, wherever it sits', () => {
    const inventory = createEmptyInventory();
    inventory[5] = { id: COINS, quantity: 40 };

    const next = addItemToInventory(inventory, COINS, 60, true);

    expect(next?.[5]).toEqual({ id: COINS, quantity: 100 });
    expect(next?.[0]).toBeNull();
  });

  it('treats a stack with no explicit quantity as one', () => {
    const inventory = createEmptyInventory();
    inventory[0] = { id: COINS };

    const next = addItemToInventory(inventory, COINS, 5, true);

    expect(next?.[0]).toEqual({ id: COINS, quantity: 6 });
  });

  it('opens a new slot for a stackable the inventory does not already hold', () => {
    const next = addItemToInventory(createEmptyInventory(), COINS, 25, true);

    expect(next?.[0]).toEqual({ id: COINS, quantity: 25 });
  });

  it('returns null when a non-stackable will not fit', () => {
    const full = createEmptyInventory().map(() => ({ id: SHARK }));

    expect(addItemToInventory(full, COINS, 1, false)).toBeNull();
  });

  it('still merges a stackable into a full inventory that already holds it', () => {
    const full: Inventory = createEmptyInventory().map(() => ({ id: SHARK }));
    full[3] = { id: COINS, quantity: 10 };

    const next = addItemToInventory(full, COINS, 5, true);

    expect(next?.[3]).toEqual({ id: COINS, quantity: 15 });
  });

  it('does not mutate the inventory it was given', () => {
    const inventory = createEmptyInventory();
    inventory[0] = { id: COINS, quantity: 10 };

    addItemToInventory(inventory, COINS, 5, true);

    expect(inventory[0]).toEqual({ id: COINS, quantity: 10 });
  });

  it('keeps a quantity on a non-stackable drop of more than one', () => {
    const next = addItemToInventory(createEmptyInventory(), SHARK, 3, false);

    expect(next?.[0]).toEqual({ id: SHARK, quantity: 3 });
  });
});

describe('removeInventorySlot', () => {
  it('empties the slot without touching the rest', () => {
    const inventory = createEmptyInventory();
    inventory[2] = { id: SHARK };
    inventory[3] = { id: COINS, quantity: 5 };

    const next = removeInventorySlot(inventory, 2);

    expect(next[2]).toBeNull();
    expect(next[3]).toEqual({ id: COINS, quantity: 5 });
    expect(next).toHaveLength(INVENTORY_SIZE);
  });

  it('returns the same array untouched when the slot is already empty', () => {
    const inventory = createEmptyInventory();

    expect(removeInventorySlot(inventory, 4)).toBe(inventory);
  });

  it('does not mutate the inventory it was given', () => {
    const inventory = createEmptyInventory();
    inventory[1] = { id: SHARK };

    removeInventorySlot(inventory, 1);

    expect(inventory[1]).toEqual({ id: SHARK });
  });
});

describe('isStackableItem', () => {
  const loader = {
    load: (id: number) => {
      if (id === SHARK) return { stackable: false };
      if (id === COINS) return { stackable: true };
      throw new Error('not in cache');
    },
  } as unknown as ObjTypeLoader;

  it('follows the cache flag regardless of quantity', () => {
    expect(isStackableItem(COINS, undefined, loader)).toBe(true);
    expect(isStackableItem(SHARK, 3, loader)).toBe(false);
  });

  it('falls back to quantity > 1 without a cache or for an id it cannot load', () => {
    expect(isStackableItem(COINS, undefined, undefined)).toBe(false);
    expect(isStackableItem(COINS, 2, null)).toBe(true);
    expect(isStackableItem(1, 5, loader)).toBe(true);
    expect(isStackableItem(1, 1, loader)).toBe(false);
  });
});

describe('parseInventoryFromSetup', () => {
  it('drops a stored stack count, since loadout stacks model presence only', () => {
    const inventory = parseInventoryFromSetup([{ id: COINS, q: 500 }, null, { id: SHARK }]);

    expect(inventory.slice(0, 3)).toEqual([{ id: COINS }, null, { id: SHARK }]);
    expect(inventory).toHaveLength(INVENTORY_SIZE);
  });
});
