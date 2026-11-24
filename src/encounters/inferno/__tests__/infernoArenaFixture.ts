import { readFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import type { ArenaConfig } from '../../../core/arena/ArenaConfig';
import type { CollisionMap } from '../../../rs/collision/WalkabilityAnalyzer';

/**
 * The Inferno arena exactly as the app bakes it (`useEncounterManager` -> `CacheManager.buildArenaConfig`
 * with the descriptor's seed and pillar locs), kept as a fixture so capture replays get real terrain
 * and LoS without loading the 160 MB cache. `infernoArena.test.ts` re-bakes and compares it when the cache exists.
 */
export const INFERNO_ARENA_FIXTURE = 'src/encounters/inferno/__tests__/fixtures/inferno-arena.json.gz';

/** Every flagged tile of the baked block lies in these local bounds (the block spans -64..127). */
const BLOCK_ORIGIN = -64;
const BLOCK_SIZE = 192;

interface ArenaFixture {
  readonly bounds: NonNullable<ArenaConfig['bounds']>;
  readonly walkableTiles: readonly string[];
  /** `[x, y, flags]` for every non-zero tile of the collision block. */
  readonly flags: readonly (readonly [number, number, number])[];
}

export function serializeInfernoArena(arena: ArenaConfig): string {
  if (!arena.bounds || !arena.walkableTiles || !arena.collisionMap)
    throw new TypeError('Incomplete Inferno arena bake');
  const flags: [number, number, number][] = [];
  for (let y = BLOCK_ORIGIN; y < BLOCK_ORIGIN + BLOCK_SIZE; y++) {
    for (let x = BLOCK_ORIGIN; x < BLOCK_ORIGIN + BLOCK_SIZE; x++) {
      const flag = arena.collisionMap.getFlag(x, y);
      if (flag > 0) flags.push([x, y, flag]);
    }
  }
  const walkableTiles = [...arena.walkableTiles].sort();
  return JSON.stringify({ bounds: arena.bounds, walkableTiles, flags } satisfies ArenaFixture);
}

function blockCollisionMap(entries: ArenaFixture['flags']): CollisionMap {
  const flags = new Int32Array(BLOCK_SIZE * BLOCK_SIZE);
  const index = (x: number, y: number): number | null => {
    const localX = x - BLOCK_ORIGIN;
    const localY = y - BLOCK_ORIGIN;
    return localX >= 0 && localX < BLOCK_SIZE && localY >= 0 && localY < BLOCK_SIZE
      ? localX + localY * BLOCK_SIZE
      : null;
  };
  for (const [x, y, flag] of entries) flags[index(x, y)!] = flag;
  return {
    sizeX: BLOCK_SIZE,
    sizeY: BLOCK_SIZE,
    flags,
    getFlag(x, y) {
      const offset = index(x, y);
      return offset === null ? -1 : flags[offset]!;
    },
    hasFlag(x, y, flag) {
      const value = this.getFlag(x, y);
      return value !== -1 && (value & flag) !== 0;
    },
    flag(x, y, flag) {
      const offset = index(x, y);
      if (offset !== null) flags[offset]! |= flag;
    },
    unflag(x, y, flag) {
      const offset = index(x, y);
      if (offset !== null) flags[offset]! &= ~flag;
    },
  };
}

/** A fresh, mutable arena from the fixture (each engine composes pillars onto its own copy). */
export function loadInfernoArena(): ArenaConfig {
  const fixture = JSON.parse(gunzipSync(readFileSync(INFERNO_ARENA_FIXTURE)).toString('utf8')) as ArenaFixture;
  return {
    bounds: { ...fixture.bounds },
    walkableTiles: new Set(fixture.walkableTiles),
    collisionMap: blockCollisionMap(fixture.flags),
  };
}
