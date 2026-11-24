import { describe, expect, it, vi } from 'vitest';
import type { CacheIndex } from '../../cache/CacheIndex';
import { generateHeight } from '../../util/HeightCalc';
import {
  getMapSquareId,
  type LocationData,
  MAP_SQUARE_SIZE,
  MAX_LEVELS,
  MapLoader,
  type MapSquareLocations,
  type MapSquareNpcSpawns,
  type NpcSpawnData,
  worldToMapSquare,
} from '../MapLoader';

describe('MapLoader', () => {
  it('deduplicates in-flight terrain decoding and clears the result cache explicitly', async () => {
    const getFile = vi.fn(async () => ({ data: new Int8Array(MAX_LEVELS * MAP_SQUARE_SIZE * MAP_SQUARE_SIZE * 2) }));
    const index = {
      table: { named: false },
      archiveExists: () => true,
      getFile,
    } as unknown as CacheIndex;
    const loader = new MapLoader(index, 239);

    const [first, second] = await Promise.all([loader.loadMapSquare(1, 2), loader.loadMapSquare(1, 2)]);

    expect(first).toBe(second);
    expect(getFile).toHaveBeenCalledTimes(1);
    loader.clearMapSquareCache();
    await loader.loadMapSquare(1, 2);
    expect(getFile).toHaveBeenCalledTimes(2);
  });

  it('evicts a rejected terrain decode so the next request can retry', async () => {
    const terrainData = new Int8Array(MAX_LEVELS * MAP_SQUARE_SIZE * MAP_SQUARE_SIZE * 2);
    const getFile = vi
      .fn()
      .mockRejectedValueOnce(new Error('temporary cache read failure'))
      .mockResolvedValueOnce({ data: terrainData });
    const index = {
      table: { named: false },
      archiveExists: () => true,
      getFile,
    } as unknown as CacheIndex;
    const loader = new MapLoader(index, 239);

    await expect(loader.loadMapSquare(1, 2)).rejects.toThrow('temporary cache read failure');
    await expect(loader.loadMapSquare(1, 2)).resolves.not.toBeNull();
    expect(getFile).toHaveBeenCalledTimes(2);
  });

  describe('getMapSquareId', () => {
    it('calculates map square ID correctly', () => {
      expect(getMapSquareId(23, 157)).toBe((23 << 8) + 157);
      expect(getMapSquareId(0, 0)).toBe(0);
      expect(getMapSquareId(255, 255)).toBe((255 << 8) + 255);
    });
  });

  describe('worldToMapSquare', () => {
    it('converts world coordinates to map square', () => {
      const result = worldToMapSquare(1504, 10078);
      expect(result.mapX).toBe(23);
      expect(result.mapY).toBe(157);
    });

    it('handles edge cases', () => {
      expect(worldToMapSquare(0, 0)).toEqual({ mapX: 0, mapY: 0 });
      expect(worldToMapSquare(63, 63)).toEqual({ mapX: 0, mapY: 0 });
      expect(worldToMapSquare(64, 64)).toEqual({ mapX: 1, mapY: 1 });
    });
  });

  describe('constants', () => {
    it('has correct map square size', () => {
      expect(MAP_SQUARE_SIZE).toBe(64);
    });

    it('has correct max levels', () => {
      expect(MAX_LEVELS).toBe(4);
    });
  });
});

describe('generateHeight', () => {
  it('generates consistent height for same coordinates', () => {
    const height1 = generateHeight(1504, 10078);
    const height2 = generateHeight(1504, 10078);
    expect(height1).toBe(height2);
  });

  it('generates different heights for different coordinates', () => {
    const height1 = generateHeight(1504, 10078);
    const height2 = generateHeight(1505, 10078);
    expect(height1).not.toBe(height2);
  });

  it('returns height within expected range', () => {
    for (let i = 0; i < 100; i++) {
      const x = Math.floor(Math.random() * 10000);
      const y = Math.floor(Math.random() * 10000);
      const height = generateHeight(x, y);
      expect(height).toBeGreaterThanOrEqual(10);
      expect(height).toBeLessThanOrEqual(60);
    }
  });
});

describe('LocationData interface', () => {
  it('has correct structure for location data', () => {
    const location: LocationData = {
      id: 12345,
      localX: 32,
      localY: 30,
      level: 0,
      type: 10,
      rotation: 2,
    };

    expect(location.id).toBe(12345);
    expect(location.localX).toBeGreaterThanOrEqual(0);
    expect(location.localX).toBeLessThan(64);
    expect(location.localY).toBeGreaterThanOrEqual(0);
    expect(location.localY).toBeLessThan(64);
    expect(location.level).toBeGreaterThanOrEqual(0);
    expect(location.level).toBeLessThan(4);
    expect(location.type).toBeGreaterThanOrEqual(0);
    expect(location.type).toBeLessThanOrEqual(22);
    expect(location.rotation).toBeGreaterThanOrEqual(0);
    expect(location.rotation).toBeLessThanOrEqual(3);
  });
});

describe('MapSquareLocations interface', () => {
  it('has correct structure for map square locations', () => {
    const locations: MapSquareLocations = {
      mapX: 23,
      mapY: 157,
      locations: [
        { id: 1, localX: 0, localY: 0, level: 0, type: 10, rotation: 0 },
        { id: 2, localX: 63, localY: 63, level: 3, type: 22, rotation: 3 },
      ],
    };

    expect(locations.mapX).toBe(23);
    expect(locations.mapY).toBe(157);
    expect(locations.locations).toHaveLength(2);
    expect(locations.locations[0].id).toBe(1);
    expect(locations.locations[1].level).toBe(3);
  });
});

describe('NpcSpawnData interface', () => {
  it('has correct structure for NPC spawn data', () => {
    const spawn: NpcSpawnData = {
      id: 14176,
      x: 1504,
      y: 10078,
      level: 0,
    };

    expect(spawn.id).toBe(14176);
    expect(spawn.x).toBe(1504);
    expect(spawn.y).toBe(10078);
    expect(spawn.level).toBe(0);
  });
});

describe('MapSquareNpcSpawns interface', () => {
  it('has correct structure for map square NPC spawns', () => {
    const npcSpawns: MapSquareNpcSpawns = {
      mapX: 23,
      mapY: 157,
      spawns: [
        { id: 14176, x: 1504, y: 10078, level: 0 },
        { id: 14177, x: 1505, y: 10079, level: 0 },
      ],
    };

    expect(npcSpawns.mapX).toBe(23);
    expect(npcSpawns.mapY).toBe(157);
    expect(npcSpawns.spawns).toHaveLength(2);
    expect(npcSpawns.spawns[0].id).toBe(14176);
    expect(npcSpawns.spawns[1].x).toBe(1505);
  });
});
