import type { Coordinate } from './simulation';

/**
 * Ground items here do NOT despawn.
 *
 * The overworld rule is 200 ticks — 100 private to the dropper then 100 public
 * (rsmod: `lootdrop_duration = 200` in api/config/.../Constants.kt,
 * `DEFAULT_REVEAL_DELAY = 100` in api/repo/.../ObjRepository.kt). But every
 * encounter in this simulator is an instance, where that timer effectively does
 * not apply, and a run is far shorter than it anyway. Modeling it would only
 * delete a player's items mid-practice.
 *
 * Left unimplemented on purpose rather than stubbed: no despawn field to keep in
 * sync, and nothing to mislead a reader into thinking expiry is handled.
 */

/**
 * One pile on one tile.
 *
 * A tile holds any number of these. Stackable ids merge into a single entry with a
 * combined quantity, exactly as they do in game; every non-stackable drop gets its
 * own entry, so four dropped sharks are four piles rather than one stack of four.
 */
export interface GroundItem {
  /**
   * Stable for the life of the pile. Pickup targets this rather than
   * `(tile, itemId)`, which is ambiguous once a tile holds two piles of the same id.
   */
  readonly id: string;
  readonly itemId: number;
  /** Always >= 1. Non-stackable piles are always exactly 1. */
  readonly quantity: number;
  readonly position: Coordinate;
  /** Orders stacked piles in a right-click menu, newest first. */
  readonly droppedTick: number;
}

/**
 * Piles on `tile`, most recently dropped first — the order OSRS lists them in a menu.
 *
 * Several drops can share a tick, and the world array holds them oldest-first, so
 * `droppedTick` alone leaves same-tick piles in the wrong order under a stable sort.
 * Array position breaks the tie.
 */
export function groundItemsAtTile(groundItems: readonly GroundItem[], tile: Coordinate): GroundItem[] {
  return groundItems
    .map((item, index) => ({ item, index }))
    .filter(({ item }) => item.position[0] === tile[0] && item.position[1] === tile[1])
    .sort((left, right) => right.item.droppedTick - left.item.droppedTick || right.index - left.index)
    .map(({ item }) => item);
}
