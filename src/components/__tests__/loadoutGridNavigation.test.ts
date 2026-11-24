import { describe, expect, it } from 'vitest';
import { type GridCell, nextGridCellIndex } from '../loadoutGridNavigation';

/**
 * The equipment cross, minus ammunition: the ten cells the arrow keys actually travel
 * between. It is sparse in both directions, which is the whole reason this is not index math.
 */
const CROSS: readonly GridCell[] = [
  { row: 1, col: 2 }, // 0 head
  { row: 2, col: 1 }, // 1 cape
  { row: 2, col: 2 }, // 2 amulet
  { row: 3, col: 1 }, // 3 weapon
  { row: 3, col: 2 }, // 4 body
  { row: 3, col: 3 }, // 5 shield
  { row: 4, col: 1 }, // 6 hands
  { row: 4, col: 2 }, // 7 legs
  { row: 4, col: 3 }, // 8 ring
  { row: 5, col: 2 }, // 9 boots
];

/** The inventory's dense 4x7. */
const INVENTORY: readonly GridCell[] = Array.from({ length: 28 }, (_, index) => ({
  row: Math.floor(index / 4) + 1,
  col: (index % 4) + 1,
}));

describe('nextGridCellIndex — the equipment cross', () => {
  it('keeps the column when the column continues', () => {
    expect(nextGridCellIndex(CROSS, 0, 'down')).toBe(2); // head -> amulet
    expect(nextGridCellIndex(CROSS, 4, 'up')).toBe(2); // body -> amulet
    expect(nextGridCellIndex(CROSS, 9, 'up')).toBe(7); // boots -> legs
  });

  it('hands focus on when the column runs out rather than trapping it', () => {
    // Nothing sits under hands or ring, so down takes the nearest cell in the next row
    // instead of refusing to move.
    expect(nextGridCellIndex(CROSS, 6, 'down')).toBe(9); // hands -> boots
    expect(nextGridCellIndex(CROSS, 8, 'down')).toBe(9); // ring -> boots
  });

  it('skips the row the eye skips, because ammunition is not in the list', () => {
    // Right of the amulet is the ammunition cell, which opens nothing and is therefore not a
    // cell here at all. The row simply ends.
    expect(nextGridCellIndex(CROSS, 2, 'right')).toBe(2);
    expect(nextGridCellIndex(CROSS, 1, 'right')).toBe(2); // cape -> amulet
  });

  it('stays inside its row on a horizontal move', () => {
    // Head is alone on row 1: left and right hold rather than dropping into row 2.
    expect(nextGridCellIndex(CROSS, 0, 'left')).toBe(0);
    expect(nextGridCellIndex(CROSS, 0, 'right')).toBe(0);
    expect(nextGridCellIndex(CROSS, 5, 'left')).toBe(4); // shield -> body
  });

  it('holds at the edges instead of wrapping', () => {
    expect(nextGridCellIndex(CROSS, 0, 'up')).toBe(0);
    expect(nextGridCellIndex(CROSS, 9, 'down')).toBe(9);
  });
});

describe('nextGridCellIndex — the inventory', () => {
  it('moves by one across a row and by a row up or down', () => {
    expect(nextGridCellIndex(INVENTORY, 0, 'right')).toBe(1);
    expect(nextGridCellIndex(INVENTORY, 5, 'left')).toBe(4);
    expect(nextGridCellIndex(INVENTORY, 0, 'down')).toBe(4);
    expect(nextGridCellIndex(INVENTORY, 27, 'up')).toBe(23);
  });

  it('does not run off the end of a row into the next one', () => {
    expect(nextGridCellIndex(INVENTORY, 3, 'right')).toBe(3);
    expect(nextGridCellIndex(INVENTORY, 4, 'left')).toBe(4);
  });

  it('holds at the top and bottom rows', () => {
    expect(nextGridCellIndex(INVENTORY, 2, 'up')).toBe(2);
    expect(nextGridCellIndex(INVENTORY, 26, 'down')).toBe(26);
  });
});

describe('nextGridCellIndex — nothing to move from', () => {
  it('returns the index it was given when it names no cell', () => {
    expect(nextGridCellIndex(CROSS, -1, 'down')).toBe(-1);
    expect(nextGridCellIndex([], 0, 'up')).toBe(0);
  });
});

describe('nextGridCellIndex — two sub-grids in one space', () => {
  // The frame: the cross in columns 1-3, the inventory in 4-7, both starting at row 1.
  const FRAME: readonly GridCell[] = [
    ...CROSS.map((cell) => ({ ...cell, section: 'equipment' })),
    ...INVENTORY.map((cell) => ({ ...cell, col: cell.col + 3, section: 'inventory' })),
  ];
  const INVENTORY_AT = (slot: number) => CROSS.length + slot - 1;

  it('crosses sideways, because the two sit side by side', () => {
    expect(nextGridCellIndex(FRAME, 5, 'right')).toBe(INVENTORY_AT(9)); // shield -> row 3, first column
    expect(nextGridCellIndex(FRAME, INVENTORY_AT(9), 'left')).toBe(5);
    expect(nextGridCellIndex(FRAME, 0, 'right')).toBe(INVENTORY_AT(1)); // head -> row 1, first column
  });

  it('keeps each side its own vertical', () => {
    // Boots is the foot of the cross; below it the inventory still has two rows to go, and
    // dropping into the middle of them is not what down means.
    expect(nextGridCellIndex(FRAME, 9, 'down')).toBe(9);
    // And an inventory column never climbs out into the diagram beside it.
    expect(nextGridCellIndex(FRAME, INVENTORY_AT(5), 'up')).toBe(INVENTORY_AT(1));
  });

  it('holds where the rows do not line up', () => {
    // The inventory is seven rows deep and the cross is five, so its last two rows have
    // nothing to their left.
    expect(nextGridCellIndex(FRAME, INVENTORY_AT(25), 'left')).toBe(INVENTORY_AT(25));
  });
});
