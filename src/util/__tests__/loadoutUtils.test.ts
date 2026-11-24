import { describe, expect, it } from 'vitest';
import type { PlayerEquipment } from '../../rs/model/PlayerModelLoader';
import { createEmptyInventory, INVENTORY_SIZE, type Inventory } from '../../types/inventory';
import { carryWornEquipment, cloneInventory } from '../loadoutUtils';

const HELM = 1;
const STAFF = 2;
const BOOK = 3;
const BOW = 4; // two-handed
const BLOWPIPE = 5; // two-handed
const RING = 6;
const OTHER_RING = 7;
const BREW = 8;

function inventoryOf(items: Record<number, number>): Inventory {
  const inventory = createEmptyInventory();
  for (const [index, id] of Object.entries(items)) inventory[Number(index)] = { id };
  return inventory;
}

/** Every item the loadout holds, worn or carried, sorted: what must neither be lost nor duplicated. */
function items(loadout: { equipment: PlayerEquipment; inventory: Inventory }): number[] {
  return [
    ...Object.values(loadout.equipment).filter((id): id is number => id !== undefined),
    ...loadout.inventory.flatMap((item) => (item ? [item.id] : [])),
  ].sort((a, b) => a - b);
}

describe('carryWornEquipment', () => {
  const equipment: PlayerEquipment = { head: HELM, weapon: STAFF, shield: BOOK, ring: RING };
  const inventory = inventoryOf({ 0: BOW, 1: BREW, 5: OTHER_RING });
  const configured = { equipment, inventory };

  it('is the configured loadout when the worn gear is unchanged', () => {
    expect(carryWornEquipment(configured, { ...equipment })).toEqual(configured);
  });

  it('swaps a worn item out of the inventory slot it came from, putting the displaced one there', () => {
    const carried = carryWornEquipment(configured, { ...equipment, ring: OTHER_RING });
    expect(carried.equipment).toEqual({ ...equipment, ring: OTHER_RING });
    expect(carried.inventory).toEqual(inventoryOf({ 0: BOW, 1: BREW, 5: RING }));
    expect(items(carried)).toEqual(items(configured));
  });

  it('moves the weapon and shield together for a two-handed weapon, either way', () => {
    // Staff and book off, bow on: the staff takes the bow's slot, the book the first free one.
    const twoHanded = carryWornEquipment(configured, { head: HELM, weapon: BOW, ring: RING });
    expect(twoHanded.equipment).toEqual({ head: HELM, weapon: BOW, ring: RING });
    expect(twoHanded.inventory).toEqual(inventoryOf({ 0: STAFF, 1: BREW, 2: BOOK, 5: OTHER_RING }));
    expect(items(twoHanded)).toEqual(items(configured));

    // Back from the bow: the bow returns to the staff's slot and the book's slot empties.
    const bowLoadout = { equipment: { weapon: BOW }, inventory: inventoryOf({ 3: STAFF, 7: BOOK }) };
    const oneHanded = carryWornEquipment(bowLoadout, { weapon: STAFF, shield: BOOK });
    expect(oneHanded.equipment).toEqual({ weapon: STAFF, shield: BOOK });
    expect(oneHanded.inventory).toEqual(inventoryOf({ 3: BOW }));
  });

  it('puts an item taken off (and maybe dropped) back in the first free slot, unworn', () => {
    const carried = carryWornEquipment(configured, { weapon: STAFF, shield: BOOK, ring: RING });
    expect(carried.equipment).toEqual({ weapon: STAFF, shield: BOOK, ring: RING });
    expect(carried.inventory).toEqual(inventoryOf({ 0: BOW, 1: BREW, 2: HELM, 5: OTHER_RING }));
    expect(items(carried)).toEqual(items(configured));
  });

  it('keeps a worn item the configured inventory lacks without taking anything for it', () => {
    const carried = carryWornEquipment(configured, { ...equipment, weapon: BLOWPIPE, shield: undefined });
    expect(carried.equipment).toEqual({ head: HELM, weapon: BLOWPIPE, ring: RING });
    expect(carried.inventory).toEqual(inventoryOf({ 0: BOW, 1: BREW, 2: STAFF, 3: BOOK, 5: OTHER_RING }));
  });

  it('keeps a slot group configured when what it displaces does not fit, and carries the rest', () => {
    // A full inventory: the ring swap frees its own slot, but the helm taken off has nowhere to go.
    const full = cloneInventory(inventory);
    for (let index = 0; index < INVENTORY_SIZE; index++) full[index] ??= { id: BREW };
    const carried = carryWornEquipment(
      { equipment, inventory: full },
      { weapon: STAFF, shield: BOOK, ring: OTHER_RING },
    );
    expect(carried.equipment).toEqual({ ...equipment, ring: OTHER_RING });
    expect(carried.inventory[5]).toEqual({ id: RING });
    expect(carried.inventory).toHaveLength(INVENTORY_SIZE);
    expect(items(carried)).toEqual(items({ equipment, inventory: full }));

    // The two-hander displaces two items through one freed slot: it stays a staff and book.
    const twoHanded = carryWornEquipment({ equipment, inventory: full }, { head: HELM, weapon: BOW, ring: RING });
    expect(twoHanded).toEqual({ equipment, inventory: full });
  });

  it('leaves its inputs unchanged', () => {
    const before = structuredClone(configured);
    carryWornEquipment(configured, { weapon: BOW });
    expect(configured).toEqual(before);
  });
});
