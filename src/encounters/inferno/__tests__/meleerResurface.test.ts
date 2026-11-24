import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { setArenaConfig } from '../../../core/constants';
import { meleerResurfacePosition } from '../../../npcs/inferno/meleer';
import { skipWithoutSetup } from '../../../test/helpers/setupAssets';
import type { Coordinate } from '../../../types/simulation';
import { composePillarArena, type PillarKey } from '../pillars';
import { loadInfernoArena } from './infernoArenaFixture';

afterEach(() => {
  setArenaConfig({ bounds: null, walkableTiles: null, collisionMap: null }, true);
});

const ALL: readonly PillarKey[] = ['west', 'south', 'northEast'];
const NO_SOUTH: readonly PillarKey[] = ['west', 'northEast'];
const NE_ONLY: readonly PillarKey[] = ['northEast'];

/**
 * Every captured Jal-ImKot telejump in P and Q: dig-down tick, its packet line, the player's tile at
 * the start of that tick, the resurfaced SW tile and the standing pillars. The up-tick tile instead
 * misses P t3017, t8079, t9074 and Q t1654 (P:45573-45640, P:147761-147814, P:164646-164712,
 * Q:37209-37300).
 */
const CAPTURED_DIGS: readonly (readonly [string, number, number, Coordinate, Coordinate, readonly PillarKey[]])[] = [
  ['P', 1145, 11209, [36, 44], [35, 43], ALL],
  ['P', 1538, 18154, [32, 42], [29, 39], ALL],
  ['P', 2634, 38256, [33, 41], [30, 38], ALL],
  ['P', 2855, 42362, [36, 42], [36, 42], ALL],
  ['P', 3017, 45580, [27, 40], [24, 37], ALL],
  ['P', 3066, 46406, [27, 22], [24, 19], ALL],
  ['P', 3174, 48371, [33, 42], [30, 39], ALL],
  ['P', 4286, 73442, [33, 36], [30, 33], ALL],
  ['P', 4426, 76104, [33, 40], [30, 37], ALL],
  ['P', 4614, 80377, [34, 42], [34, 42], ALL],
  ['P', 4867, 85339, [33, 40], [30, 37], ALL],
  ['P', 4916, 86098, [34, 43], [34, 43], ALL],
  ['P', 5125, 90453, [36, 42], [36, 42], ALL],
  ['P', 5545, 98150, [37, 41], [37, 41], ALL],
  ['P', 5545, 98153, [37, 41], [37, 41], ALL],
  ['P', 5597, 99237, [33, 40], [30, 37], ALL],
  ['P', 5602, 99297, [33, 42], [30, 39], ALL],
  ['P', 7249, 131737, [33, 41], [30, 38], ALL],
  ['P', 8079, 147768, [41, 39], [38, 36], ALL],
  ['P', 8393, 152776, [33, 41], [30, 38], ALL],
  ['P', 8509, 155659, [34, 43], [34, 43], ALL],
  ['P', 8806, 159829, [35, 42], [35, 42], ALL],
  ['P', 9074, 164646, [36, 42], [36, 42], ALL],
  ['P', 9120, 165768, [33, 40], [30, 37], ALL],
  ['P', 9130, 166042, [33, 41], [30, 38], ALL],
  ['P', 9171, 166614, [34, 43], [34, 43], ALL],
  ['P', 9184, 166808, [33, 40], [30, 37], ALL],
  ['P', 9236, 167514, [33, 40], [30, 37], ALL],
  ['Q', 1336, 30562, [33, 42], [30, 39], ALL],
  ['Q', 1471, 33419, [33, 43], [30, 40], ALL],
  ['Q', 1554, 35166, [36, 42], [36, 42], ALL],
  ['Q', 1654, 37209, [28, 41], [25, 38], ALL],
  ['Q', 1835, 41201, [37, 41], [37, 41], ALL],
  ['Q', 1884, 42299, [32, 43], [29, 40], ALL],
  ['Q', 2015, 45004, [33, 42], [30, 39], ALL],
  ['Q', 3133, 68251, [36, 42], [36, 42], NO_SOUTH],
  ['Q', 3246, 70565, [36, 42], [36, 42], NO_SOUTH],
  ['Q', 3554, 76273, [33, 42], [30, 39], NO_SOUTH],
  ['Q', 3844, 81774, [33, 41], [30, 38], NO_SOUTH],
  ['Q', 3984, 84591, [36, 42], [36, 42], NE_ONLY],
  ['Q', 4371, 92046, [34, 46], [31, 43], NE_ONLY],
  ['Q', 4423, 93031, [34, 42], [34, 42], NE_ONLY],
];

describe.skipIf(skipWithoutSetup('infernoArena'))('Jal-ImKot resurface placement on the baked arena', () => {
  let arena: ReturnType<typeof loadInfernoArena>;
  beforeAll(() => {
    arena = loadInfernoArena();
  });

  it.each(
    CAPTURED_DIGS,
  )('%s t%i (line %i): player %j at dig-down -> SW %j', (_, _tick, _line, player, tile, pillars) => {
    setArenaConfig(composePillarArena(arena, new Set(pillars)), true);
    expect(meleerResurfacePosition({ position: [0, 0] }, player)).toEqual(tile);
  });

  it('puts the player on the NE corner 25 times, the SW corner 16 times and (1,1) once', () => {
    const corners = new Map<string, number>();
    for (const [, , , player, tile] of CAPTURED_DIGS) {
      const key = `${player[0] - tile[0]},${player[1] - tile[1]}`;
      corners.set(key, (corners.get(key) ?? 0) + 1);
    }
    expect(Object.fromEntries(corners)).toEqual({ '3,3': 25, '0,0': 16, '1,1': 1 });
  });
});
