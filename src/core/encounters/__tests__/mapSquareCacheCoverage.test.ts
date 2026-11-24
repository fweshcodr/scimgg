import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { collectCacheRoots } from '../../../../scripts/cacheRoots';
import { discoverCacheUsage } from '../../../../scripts/discoverCacheUsage';
import { encounterRegistry } from '../../../encounters/registry';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../..');

/**
 * The production build keeps only the map squares in the cache roots. A square that exists
 * upstream but is not kept reads back as an empty archive and throws `Empty container` from
 * `decodeMapSquare` - terrain, locs, arena config and the minimap all fail together, and only
 * in a trimmed build.
 */
describe('encounter map squares survive the production cache trim', () => {
  it('roots every square the encounter registry declares, with the ring the renderer reads around it', async () => {
    const required = new Set<string>();
    for (const kind of encounterRegistry.getRegisteredKinds()) {
      const descriptor = encounterRegistry.getDescriptor(kind);
      const base = descriptor?.mapSquare;
      if (!base) continue;
      for (const offset of descriptor.mapSquareOffsets ?? [{ dx: 0, dy: 0 }]) {
        // The renderer also reads a +/-1 ring around every square it draws.
        for (let dx = -1; dx <= 1; dx++) {
          for (let dy = -1; dy <= 1; dy++) {
            required.add(`${base.x + offset.dx + dx},${base.y + offset.dy + dy}`);
          }
        }
      }
    }
    expect(required.size).toBeGreaterThan(0);

    const { mapSquares } = collectCacheRoots(await discoverCacheUsage(REPO_ROOT));

    expect([...required].filter((square) => !mapSquares.has(square))).toEqual([]);
  }, 60000);
});
