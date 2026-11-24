/**
 * The client's ground-item pile model.
 *
 * A tile holds one pile, not one entity per item, and the client draws at most
 * THREE models for it — `bottom`, `middle`, `top` — all at the same point. That
 * shape is still current: RuneLite's modern `ItemLayer` API exposes exactly
 * `getBottom()` / `getMiddle()` / `getTop()` and, being a `TileObject`, carries a
 * single location for the whole pile.
 *
 * The selection policy below is unsourced and unmeasured:
 *
 *   - `top` is the most valuable obj, scored `cost`, multiplied by `count + 1`
 *     when the obj is stackable.
 *   - `bottom` is the first remaining obj with a DIFFERENT id to `top`.
 *   - `middle` is the next one differing from both.
 *
 * So three piles of the same id draw one model, not three, and everything past
 * the third distinct id is invisible while still being listed in the menu.
 */

export interface GroundItemPileEntry {
  readonly id: string;
  readonly itemId: number;
  readonly quantity: number;
}

export interface GroundItemPileSelection<T extends GroundItemPileEntry> {
  /** Drawn first, so it ends up under the others. */
  readonly bottom: T | null;
  readonly middle: T | null;
  /** The most valuable obj: drawn last, and the one a left-click takes. */
  readonly top: T;
}

export type GroundItemValuer = (itemId: number, quantity: number) => number;

/**
 * `piles` must be in drop order because the unsourced strict comparison resolves value ties
 * to the earliest entry.
 */
export function selectGroundItemPile<T extends GroundItemPileEntry>(
  piles: readonly T[],
  scoreOf: GroundItemValuer,
): GroundItemPileSelection<T> | null {
  if (piles.length === 0) return null;

  let top = piles[0] as T;
  let topValue = scoreOf(top.itemId, top.quantity);
  for (const pile of piles.slice(1)) {
    const value = scoreOf(pile.itemId, pile.quantity);
    if (value > topValue) {
      topValue = value;
      top = pile;
    }
  }

  let bottom: T | null = null;
  let middle: T | null = null;
  for (const pile of piles) {
    if (pile.itemId === top.itemId) continue;
    if (bottom === null) {
      bottom = pile;
      continue;
    }
    if (pile.itemId !== bottom.itemId) {
      middle = pile;
      break;
    }
  }

  return { bottom, middle, top };
}

/** Piles keyed by tile, each list keeping drop order. */
export function groupGroundItemsByTile<T extends { readonly position: readonly [number, number] }>(
  groundItems: readonly T[],
): Map<string, T[]> {
  const byTile = new Map<string, T[]>();
  for (const item of groundItems) {
    const key = `${item.position[0]},${item.position[1]}`;
    const existing = byTile.get(key);
    if (existing) {
      existing.push(item);
    } else {
      byTile.set(key, [item]);
    }
  }
  return byTile;
}
