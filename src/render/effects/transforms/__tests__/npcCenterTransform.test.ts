import { describe, expect, it } from 'vitest';
import { createNpcCenterTransformSource } from '../npcCenterTransform';

function createTerrainHeights(): Int32Array[] {
  const heights: Int32Array[] = [];
  for (let x = 0; x <= 64; x++) {
    const column = new Int32Array(65);
    for (let y = 0; y <= 64; y++) {
      column[y] = x * 100 + y;
    }
    heights.push(column);
  }
  return heights;
}

describe('createNpcCenterTransformSource', () => {
  it('samples the full NPC footprint corners for center height', () => {
    const terrainHeights = createTerrainHeights();
    const source = createNpcCenterTransformSource({
      getState: () => ({ swX: 10, swY: 20, size: 3 }),
    });
    if (source.kind !== 'dynamic') {
      throw new TypeError('Expected dynamic transform source');
    }

    const transform = source.resolve(7, 7.5, terrainHeights);

    // Then: the transform uses the footprint center and averaged footprint-corner Z.
    expect(transform?.position).toEqual([11.5, 21.5, -1171.5 / 128]);
  });

  it('reads NPC state dynamically for each frame', () => {
    let swX = 4;
    const source = createNpcCenterTransformSource({
      getState: (currentTick, interpolatedTick) => ({
        swX: swX + currentTick,
        swY: interpolatedTick,
        size: 2,
      }),
    });
    if (source.kind !== 'dynamic') {
      throw new TypeError('Expected dynamic transform source');
    }

    const first = source.resolve(1, 1.25, null);
    swX = 8;
    const second = source.resolve(2, 2.5, null);

    // Then: each frame reflects the current state instead of a cached position.
    expect(first?.position).toEqual([6, 2.25, 0]);
    expect(second?.position).toEqual([11, 3.5, 0]);
  });

  it('returns null when NPC state is unavailable', () => {
    const source = createNpcCenterTransformSource({
      getState: () => null,
    });
    if (source.kind !== 'dynamic') {
      throw new TypeError('Expected dynamic transform source');
    }

    const transform = source.resolve(12, 12.5, createTerrainHeights());

    expect(transform).toBeNull();
  });

  it('propagates yaw2048 when provided by state', () => {
    const source = createNpcCenterTransformSource({
      getState: () => ({ swX: 2, swY: 4, size: 1, yaw2048: 1536 }),
    });
    if (source.kind !== 'dynamic') {
      throw new TypeError('Expected dynamic transform source');
    }

    const transform = source.resolve(0, 0, null);

    expect(transform?.yaw2048).toBe(1536);
  });

  it('adds zOffset after terrain height sampling', () => {
    const source = createNpcCenterTransformSource({
      getState: () => ({ swX: 1, swY: 2, size: 2 }),
      zOffset: 0.75,
    });
    if (source.kind !== 'dynamic') {
      throw new TypeError('Expected dynamic transform source');
    }

    const transform = source.resolve(0, 0, createTerrainHeights());

    expect(transform?.position).toEqual([2, 3, -203 / 128 + 0.75]);
  });

  it('uses explicit visual actor Z when provided by state', () => {
    const source = createNpcCenterTransformSource({
      getState: () => ({ swX: 10.25, swY: 20.5, size: 5, z: -1.25 }),
      zOffset: 0.25,
    });
    if (source.kind !== 'dynamic') {
      throw new TypeError('Expected dynamic transform source');
    }

    const transform = source.resolve(0, 0, createTerrainHeights());

    // Then: actor-provided visual Z is authoritative, with zOffset stacked after it.
    expect(transform?.position).toEqual([12.75, 23, -1]);
  });

  it('creates a dynamic transform source', () => {
    const source = createNpcCenterTransformSource({
      getState: () => ({ swX: 0, swY: 0, size: 1 }),
    });

    // When/Then: SpotAnimRenderer will resolve it every frame.
    expect(source.kind).toBe('dynamic');
  });
});
