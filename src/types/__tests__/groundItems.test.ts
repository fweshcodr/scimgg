import { describe, expect, it } from 'vitest';
import { type GroundItem, groundItemsAtTile } from '../groundItems';

function pile(id: string, itemId: number, position: [number, number], droppedTick: number): GroundItem {
  return { id, itemId, quantity: 1, position, droppedTick };
}

describe('groundItemsAtTile', () => {
  it('returns only the piles on the requested tile', () => {
    const piles = [
      pile('a', 385, [10, 10], 1),
      pile('b', 995, [11, 10], 2),
      pile('c', 4151, [10, 10], 3),
      pile('d', 20997, [10, 11], 4),
    ];

    expect(groundItemsAtTile(piles, [10, 10]).map((item) => item.id)).toEqual(['c', 'a']);
  });

  it('lists the most recently dropped first', () => {
    const piles = [pile('old', 385, [5, 5], 10), pile('newest', 995, [5, 5], 40), pile('mid', 4151, [5, 5], 25)];

    expect(groundItemsAtTile(piles, [5, 5]).map((item) => item.id)).toEqual(['newest', 'mid', 'old']);
  });

  it('still lists newest-first when several piles share a drop tick', () => {
    // processDropActions stamps every drop queued in one tick with that tick, and
    // the world array holds them oldest-first, so the tick alone cannot order them.
    const piles = [pile('first', 385, [5, 5], 7), pile('second', 995, [5, 5], 7), pile('third', 4151, [5, 5], 7)];

    expect(groundItemsAtTile(piles, [5, 5]).map((item) => item.id)).toEqual(['third', 'second', 'first']);
  });

  it('returns nothing for a bare tile', () => {
    expect(groundItemsAtTile([pile('a', 385, [1, 1], 1)], [2, 2])).toEqual([]);
  });

  it('does not mutate or reorder the source array', () => {
    const piles = [pile('a', 385, [5, 5], 10), pile('b', 995, [5, 5], 40)];

    groundItemsAtTile(piles, [5, 5]);

    expect(piles.map((item) => item.id)).toEqual(['a', 'b']);
  });
});
