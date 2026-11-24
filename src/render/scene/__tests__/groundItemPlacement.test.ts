import { describe, expect, it } from 'vitest';
import { type GroundItemPileEntry, groupGroundItemsByTile, selectGroundItemPile } from '../groundItemPile';
import { buildGroundItemModelMatrix } from '../groundItemPlacement';

const SHARK = { id: 'a', itemId: 385, quantity: 1 };
const WHIP = { id: 'b', itemId: 4151, quantity: 1 };
const BOW = { id: 'c', itemId: 20997, quantity: 1 };
const COINS = { id: 'd', itemId: 995, quantity: 500 };

/** Stand-in for the cache: cost, times count + 1 when stackable, as groundItemPile.ts scores it. */
const VALUES: Record<number, { cost: number; stackable: boolean }> = {
  385: { cost: 1000, stackable: false },
  4151: { cost: 2_000_000, stackable: false },
  20997: { cost: 1_000_000_000, stackable: false },
  995: { cost: 1, stackable: true },
};
const scoreOf = (itemId: number, quantity: number): number => {
  const entry = VALUES[itemId];
  if (!entry) return 0;
  return entry.stackable ? entry.cost * (quantity + 1) : entry.cost;
};

describe('ground item placement', () => {
  it('Given a terrain-anchored pile When its matrix is built Then it sits at the tile center', () => {
    const matrix = buildGroundItemModelMatrix({ position: [10, 20], terrainHeight: -1.5 });

    expect([...matrix]).toEqual([1 / 128, 0, 0, 0, 0, 0, -1 / 128, 0, 0, 1 / 128, 0, 0, 10.5, 20.5, -1.5, 1]);
  });

  it('Given two piles on one tile When their matrices are built Then both share the same point', () => {
    const first = buildGroundItemModelMatrix({ position: [10, 20], terrainHeight: 0 });
    const second = buildGroundItemModelMatrix({ position: [10, 20], terrainHeight: 0 });

    // The client gives an obj stack one position; nothing is spread across the tile.
    expect([...first]).toEqual([...second]);
  });
});

describe('selectGroundItemPile', () => {
  it('puts the most valuable obj on top', () => {
    const selection = selectGroundItemPile([SHARK, BOW, WHIP], scoreOf);

    expect(selection?.top).toBe(BOW);
  });

  it('scales a stackable by its count, so a big cheap stack can head the pile', () => {
    expect(selectGroundItemPile([SHARK, COINS], scoreOf)?.top).toBe(SHARK);
    const bigStack = { id: 'e', itemId: 995, quantity: 5000 };
    expect(selectGroundItemPile([SHARK, bigStack], scoreOf)?.top).toBe(bigStack);
  });

  it('fills bottom and middle with the next two DISTINCT ids', () => {
    const selection = selectGroundItemPile([SHARK, WHIP, BOW], scoreOf);

    expect(selection?.top).toBe(BOW);
    expect(selection?.bottom).toBe(SHARK);
    expect(selection?.middle).toBe(WHIP);
  });

  it('draws one model for several piles of the same id', () => {
    const secondShark = { id: 'a2', itemId: 385, quantity: 1 };
    const thirdShark = { id: 'a3', itemId: 385, quantity: 1 };

    const selection = selectGroundItemPile([SHARK, secondShark, thirdShark], scoreOf);

    expect(selection?.top).toBe(SHARK);
    expect(selection?.bottom).toBeNull();
    expect(selection?.middle).toBeNull();
  });

  it('shows only three distinct ids, however many piles the tile holds', () => {
    const extra = { id: 'e', itemId: 13441, quantity: 1 };
    const selection = selectGroundItemPile([SHARK, WHIP, BOW, extra], scoreOf);

    const drawn = [selection?.bottom, selection?.middle, selection?.top].filter(Boolean);
    expect(drawn).toHaveLength(3);
    expect(drawn).not.toContain(extra);
  });

  it('returns nothing for an empty tile', () => {
    expect(selectGroundItemPile([] as GroundItemPileEntry[], scoreOf)).toBeNull();
  });
});

describe('groupGroundItemsByTile', () => {
  it('keeps drop order within each tile', () => {
    const items = [
      { id: 'a', position: [1, 1] as const },
      { id: 'b', position: [2, 2] as const },
      { id: 'c', position: [1, 1] as const },
    ];

    const grouped = groupGroundItemsByTile(items);

    expect(grouped.get('1,1')?.map((item) => item.id)).toEqual(['a', 'c']);
    expect(grouped.get('2,2')?.map((item) => item.id)).toEqual(['b']);
  });
});
