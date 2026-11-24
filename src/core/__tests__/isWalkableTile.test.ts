import { beforeEach, describe, expect, it } from 'vitest';
import { isWalkableTile, setArenaConfig, setWalkableTiles } from '../constants';

/**
 * `isWalkableTile` is the pathfinder's inner-loop probe, answering from a
 * packed-integer mirror of the walkable set. These tests pin the wiring around
 * that cache: results must track the installed set, and swapping or resizing
 * the set must invalidate the mirror.
 */

function tiles(coords: [number, number][]): Set<string> {
  return new Set(coords.map(([x, y]) => `${x},${y}`));
}

describe('isWalkableTile', () => {
  beforeEach(() => {
    setArenaConfig({ bounds: null, walkableTiles: null, collisionMap: null }, false);
  });

  it('falls back to the unbounded flag when no walkable set is installed', () => {
    setArenaConfig({ bounds: null, walkableTiles: null, collisionMap: null }, true);
    expect(isWalkableTile(5, 5)).toBe(true);

    setArenaConfig({ bounds: null, walkableTiles: null, collisionMap: null }, false);
    expect(isWalkableTile(5, 5)).toBe(false);
  });

  it('answers membership for the installed set', () => {
    setWalkableTiles(
      tiles([
        [31, 25],
        [32, 25],
      ]),
    );

    expect(isWalkableTile(31, 25)).toBe(true);
    expect(isWalkableTile(32, 25)).toBe(true);
    expect(isWalkableTile(33, 25)).toBe(false);
    expect(isWalkableTile(25, 31)).toBe(false);
  });

  it('invalidates when the walkable set is replaced', () => {
    setWalkableTiles(tiles([[10, 10]]));
    expect(isWalkableTile(10, 10)).toBe(true);
    expect(isWalkableTile(20, 20)).toBe(false);

    setWalkableTiles(tiles([[20, 20]]));
    expect(isWalkableTile(20, 20)).toBe(true);
    expect(isWalkableTile(10, 10)).toBe(false);
  });

  it('invalidates when a same-identity set changes size', () => {
    const set = tiles([[1, 1]]);
    setWalkableTiles(set);
    expect(isWalkableTile(4, 4)).toBe(false);

    set.add('4,4');
    expect(isWalkableTile(4, 4)).toBe(true);

    set.delete('1,1');
    expect(isWalkableTile(1, 1)).toBe(false);
  });

  it('invalidates when installed through setArenaConfig', () => {
    setArenaConfig({ bounds: null, walkableTiles: tiles([[7, 7]]), collisionMap: null }, false);
    expect(isWalkableTile(7, 7)).toBe(true);

    setArenaConfig({ bounds: null, walkableTiles: tiles([[8, 8]]), collisionMap: null }, false);
    expect(isWalkableTile(7, 7)).toBe(false);
    expect(isWalkableTile(8, 8)).toBe(true);
  });

  it('handles negative and non-integer probes like the string set did', () => {
    setWalkableTiles(
      tiles([
        [-3, 4],
        [2, 3],
      ]),
    );

    expect(isWalkableTile(-3, 4)).toBe(true);
    expect(isWalkableTile(3, -4)).toBe(false);
    expect(isWalkableTile(2.5, 3)).toBe(false);
    expect(isWalkableTile(Number.NaN, 3)).toBe(false);
  });

  it('does not confuse tiles whose coordinates concatenate to the same string', () => {
    setWalkableTiles(tiles([[1, 23]]));

    expect(isWalkableTile(1, 23)).toBe(true);
    expect(isWalkableTile(12, 3)).toBe(false);
    expect(isWalkableTile(123, 0)).toBe(false);
  });
});
