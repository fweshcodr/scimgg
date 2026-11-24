import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { describe, expect, it } from 'vitest';
import { CollisionFlag } from '../../../rs/collision/CollisionFlag';
import { readCacheZipFiles } from '../../../test/helpers/cacheZipFiles';
import { setupOutputPath, skipWithoutSetup } from '../../../test/helpers/setupAssets';
import { INFERNO_ARENA_BOUNDS } from '../constants';
import { INFERNO_DESTROYED_PILLAR_KEYS, INFERNO_START_WAVE_KEY } from '../controls';
import { InfernoEncounter } from '../InfernoEncounter';
import { INFERNO_PILLARS, pillarFootprint } from '../pillars';
import { validateInfernoStartTile } from '../startTile';
import { bakeInfernoArena } from './bakeInfernoArena';
import { INFERNO_ARENA_FIXTURE, loadInfernoArena, serializeInfernoArena } from './infernoArenaFixture';

/**
 * SHA-256 of the reviewed arena serialization (`inferno-arena.json.gz`, gunzipped). The pinned
 * cache bakes the same bytes, so a change to the bake or the pin shows here first.
 */
const COMMITTED_ARENA_SHA256 = 'f2d3b7e1c82a1b452ae715d3850f15a7b2b3c53df5d6719e7bc1b03f413c4e9c';

const sha256 = (text: string) => createHash('sha256').update(text).digest('hex');

describe.skipIf(skipWithoutSetup('infernoArena'))('Inferno arena fixture', () => {
  it('is the pinned arena', () => {
    expect(sha256(gunzipSync(readFileSync(INFERNO_ARENA_FIXTURE)).toString('utf8'))).toBe(COMMITTED_ARENA_SHA256);
  });

  it('has the pillars and a closed arena floor', () => {
    const arena = loadInfernoArena();
    expect(arena.walkableTiles?.has('30,32')).toBe(true);
    for (const pillar of INFERNO_PILLARS) {
      for (const [x, y] of pillarFootprint(pillar)) {
        expect(arena.collisionMap?.hasFlag(x, y, CollisionFlag.OBJECT), `${pillar.key} ${x},${y}`).toBe(true);
      }
    }
    expect(arena.walkableTiles?.has('16,16')).toBe(false);
    expect(arena.walkableTiles?.size).toBe(29 * 30 - 3 * 9);
  });

  it('opens every start tile the setup accepts without terrain, for each wave regime and pillar choice', () => {
    // A cold load validates the saved start tile before the cache bake, pillars only; the run then
    // opens on it in the production arena, so every such tile must be open floor there.
    const base = loadInfernoArena();
    const { minX, maxX, minY, maxY } = INFERNO_ARENA_BOUNDS;
    const closed: string[] = [];
    let accepted = 0;
    for (const startWave of [2, 66, 67, 68]) {
      for (let mask = 0; mask < 8; mask++) {
        const destroyedPillars = { west: (mask & 1) !== 0, south: (mask & 2) !== 0, northEast: (mask & 4) !== 0 };
        const encounter = new InfernoEncounter(7);
        encounter.configureRunStart({
          [INFERNO_START_WAVE_KEY]: String(startWave),
          ...Object.fromEntries(
            Object.entries(INFERNO_DESTROYED_PILLAR_KEYS).map(([pillar, key]) => [
              key,
              destroyedPillars[pillar as keyof typeof destroyedPillars],
            ]),
          ),
        });
        const arena = encounter.refineArenaConfig(base);
        for (let x = minX; x <= maxX; x++) {
          for (let y = minY; y <= maxY; y++) {
            if (!validateInfernoStartTile([x, y], { startWave, destroyedPillars }).ok) continue;
            accepted++;
            const open =
              arena.walkableTiles?.has(`${x},${y}`) === true &&
              arena.collisionMap?.hasFlag(x, y, CollisionFlag.OBJECT | CollisionFlag.FLOOR_BLOCKED) !== true;
            if (!open) closed.push(`wave ${startWave} mask ${mask}: ${x},${y}`);
          }
        }
      }
    }
    expect(closed).toEqual([]);
    // The whole 29x30 floor, less each standing pillar's 9 tiles (12 standing across the masks) on 2 and 66.
    expect(accepted).toBe(4 * 8 * 29 * 30 - 2 * 12 * 9);
  });

  // `npm run setup` writes the fixture from the pinned cache; this re-bakes it to prove it still bakes the same.
  it.skipIf(skipWithoutSetup('fullCache'))(
    'matches the production bake from the pinned cache',
    async () => {
      const baked = serializeInfernoArena(
        await bakeInfernoArena(await readCacheZipFiles(setupOutputPath('fullCache'))),
      );
      expect(sha256(baked)).toBe(COMMITTED_ARENA_SHA256);
    },
    120_000,
  );
});
