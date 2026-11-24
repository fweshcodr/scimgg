import { profiler } from '../../util/Profiler';
import type { CacheIndex } from '../cache/CacheIndex';
import { ByteBuffer } from '../io/ByteBuffer';
import { generateHeight } from '../util/HeightCalc';

export const MAP_SQUARE_SIZE = 64;
export const MAX_LEVELS = 4;
export const UNITS_LEVEL_HEIGHT = 240;
export const UNITS_TILE_HEIGHT_BASIS = 8;

export interface MapSquareData {
  mapX: number;
  mapY: number;
  tileHeights: Int32Array[][];
  tileUnderlays: Uint16Array[][];
  tileOverlays: Int16Array[][];
  tileShapes: Uint8Array[][];
  tileRotations: Uint8Array[][];
  tileRenderFlags: Uint8Array[][];
  tileLightOcclusions: Uint8Array[][];
}

export interface MapSquareLoader {
  loadMapSquare(mapX: number, mapY: number, xteas?: number[]): Promise<MapSquareData | null>;
}

export interface LocationData {
  id: number;
  localX: number;
  localY: number;
  level: number;
  type: number;
  rotation: number;
}

export interface MapSquareLocations {
  mapX: number;
  mapY: number;
  locations: LocationData[];
}

export interface NpcSpawnData {
  id: number;
  x: number;
  y: number;
  level: number;
}

export interface MapSquareNpcSpawns {
  mapX: number;
  mapY: number;
  spawns: NpcSpawnData[];
}

function readTerrainValue(buffer: ByteBuffer, newFormat: boolean): number {
  return newFormat ? buffer.readUnsignedShort() : buffer.readUnsignedByte();
}

function createTerrainArrays(): {
  tileHeights: Int32Array[][];
  tileUnderlays: Uint16Array[][];
  tileOverlays: Int16Array[][];
  tileShapes: Uint8Array[][];
  tileRotations: Uint8Array[][];
  tileRenderFlags: Uint8Array[][];
  tileLightOcclusions: Uint8Array[][];
} {
  const tileHeights: Int32Array[][] = new Array(MAX_LEVELS);
  const tileUnderlays: Uint16Array[][] = new Array(MAX_LEVELS);
  const tileOverlays: Int16Array[][] = new Array(MAX_LEVELS);
  const tileShapes: Uint8Array[][] = new Array(MAX_LEVELS);
  const tileRotations: Uint8Array[][] = new Array(MAX_LEVELS);
  const tileRenderFlags: Uint8Array[][] = new Array(MAX_LEVELS);
  const tileLightOcclusions: Uint8Array[][] = new Array(MAX_LEVELS);

  for (let level = 0; level < MAX_LEVELS; level++) {
    tileHeights[level] = new Array(MAP_SQUARE_SIZE + 1);
    tileUnderlays[level] = new Array(MAP_SQUARE_SIZE);
    tileOverlays[level] = new Array(MAP_SQUARE_SIZE);
    tileShapes[level] = new Array(MAP_SQUARE_SIZE);
    tileRotations[level] = new Array(MAP_SQUARE_SIZE);
    tileRenderFlags[level] = new Array(MAP_SQUARE_SIZE);
    tileLightOcclusions[level] = new Array(MAP_SQUARE_SIZE + 1);

    for (let x = 0; x < MAP_SQUARE_SIZE; x++) {
      tileUnderlays[level][x] = new Uint16Array(MAP_SQUARE_SIZE);
      tileOverlays[level][x] = new Int16Array(MAP_SQUARE_SIZE);
      tileShapes[level][x] = new Uint8Array(MAP_SQUARE_SIZE);
      tileRotations[level][x] = new Uint8Array(MAP_SQUARE_SIZE);
      tileRenderFlags[level][x] = new Uint8Array(MAP_SQUARE_SIZE);
    }
    for (let x = 0; x <= MAP_SQUARE_SIZE; x++) {
      tileHeights[level][x] = new Int32Array(MAP_SQUARE_SIZE + 1);
      tileLightOcclusions[level][x] = new Uint8Array(MAP_SQUARE_SIZE + 1);
    }
  }

  return { tileHeights, tileUnderlays, tileOverlays, tileShapes, tileRotations, tileRenderFlags, tileLightOcclusions };
}

export class MapLoader {
  private newTerrainFormat: boolean;
  /** True when the map index uses named archives (m_X_Y / l_X_Y / n_X_Y). */
  private readonly namedIndex: boolean;
  private readonly mapSquareCache = new Map<string, Promise<MapSquareData | null>>();

  constructor(
    private readonly mapIndex: CacheIndex,
    revision: number = 232,
  ) {
    this.newTerrainFormat = revision >= 209;
    this.namedIndex = mapIndex.table.named;
  }

  /**
   * Compute the numeric map archive ID from coordinates.
   * Matches RuneLite's Region constructor: `regionId = (x << 8) | y`.
   */
  private static mapArchiveId(mapX: number, mapY: number): number {
    return (mapX << 8) | mapY;
  }

  getTerrainArchiveId(mapX: number, mapY: number): number {
    if (this.namedIndex) {
      return this.mapIndex.getArchiveId(`m${mapX}_${mapY}`);
    }
    const id = MapLoader.mapArchiveId(mapX, mapY);
    return this.mapIndex.archiveExists(id) ? id : -1;
  }

  getLocArchiveId(mapX: number, mapY: number): number {
    if (this.namedIndex) {
      return this.mapIndex.getArchiveId(`l${mapX}_${mapY}`);
    }
    // In unnamed format, locs are in the same archive as terrain
    const id = MapLoader.mapArchiveId(mapX, mapY);
    return this.mapIndex.archiveExists(id) ? id : -1;
  }

  getNpcSpawnArchiveId(mapX: number, mapY: number): number {
    if (this.namedIndex) {
      return this.mapIndex.getArchiveId(`n${mapX}_${mapY}`);
    }
    // In unnamed format, NPC spawns are in the same archive as terrain
    const id = MapLoader.mapArchiveId(mapX, mapY);
    return this.mapIndex.archiveExists(id) ? id : -1;
  }

  async loadMapSquare(mapX: number, mapY: number, _xteas?: number[]): Promise<MapSquareData | null> {
    const key = `${mapX},${mapY}`;
    const cached = this.mapSquareCache.get(key);
    if (cached) return cached;
    let pending: Promise<MapSquareData | null>;
    pending = this.decodeMapSquare(mapX, mapY).catch((error: unknown) => {
      if (this.mapSquareCache.get(key) === pending) this.mapSquareCache.delete(key);
      throw error;
    });
    this.mapSquareCache.set(key, pending);
    return pending;
  }

  clearMapSquareCache(): void {
    this.mapSquareCache.clear();
  }

  private async decodeMapSquare(mapX: number, mapY: number): Promise<MapSquareData | null> {
    profiler.start(`MapLoader.loadMapSquare(${mapX},${mapY})`);
    const archiveId = this.getTerrainArchiveId(mapX, mapY);
    if (archiveId === -1) {
      profiler.end(`MapLoader.loadMapSquare(${mapX},${mapY})`);
      return null;
    }

    const file = await this.mapIndex.getFile(archiveId, 0);
    if (!file?.data) {
      profiler.end(`MapLoader.loadMapSquare(${mapX},${mapY})`);
      return null;
    }

    const arrays = createTerrainArrays();
    const buffer = new ByteBuffer(file.data);
    const baseX = mapX * MAP_SQUARE_SIZE;
    const baseY = mapY * MAP_SQUARE_SIZE;

    for (let level = 0; level < MAX_LEVELS; level++) {
      for (let x = 0; x < MAP_SQUARE_SIZE; x++) {
        for (let y = 0; y < MAP_SQUARE_SIZE; y++) {
          this.decodeTerrainTile(buffer, arrays, level, x, y, baseX, baseY);
        }
      }
    }

    profiler.end(`MapLoader.loadMapSquare(${mapX},${mapY})`);
    return {
      mapX,
      mapY,
      ...arrays,
    };
  }

  private decodeTerrainTile(
    buffer: ByteBuffer,
    arrays: ReturnType<typeof createTerrainArrays>,
    level: number,
    x: number,
    y: number,
    baseX: number,
    baseY: number,
  ): void {
    const { tileHeights, tileUnderlays, tileOverlays, tileShapes, tileRotations, tileRenderFlags } = arrays;

    tileRenderFlags[level][x][y] = 0;

    while (true) {
      const v = readTerrainValue(buffer, this.newTerrainFormat);

      if (v === 0) {
        if (level === 0) {
          const worldX = baseX + x + 932731;
          const worldY = baseY + y + 556238;
          tileHeights[level][x][y] = -generateHeight(worldX, worldY) * UNITS_TILE_HEIGHT_BASIS;
        } else {
          tileHeights[level][x][y] = tileHeights[level - 1][x][y] - UNITS_LEVEL_HEIGHT;
        }
        break;
      }

      if (v === 1) {
        let height = buffer.readUnsignedByte();
        if (height === 1) {
          height = 0;
        }

        if (level === 0) {
          tileHeights[0][x][y] = -height * UNITS_TILE_HEIGHT_BASIS;
        } else {
          tileHeights[level][x][y] = tileHeights[level - 1][x][y] - height * UNITS_TILE_HEIGHT_BASIS;
        }
        break;
      }

      if (v <= 49) {
        tileOverlays[level][x][y] = readTerrainValue(buffer, this.newTerrainFormat);
        tileShapes[level][x][y] = ((v - 2) / 4) | 0;
        tileRotations[level][x][y] = (v - 2) & 3;
      } else if (v <= 81) {
        tileRenderFlags[level][x][y] = v - 49;
      } else {
        tileUnderlays[level][x][y] = v - 81;
      }
    }
  }

  async loadLocations(mapX: number, mapY: number, xteas?: number[]): Promise<MapSquareLocations | null> {
    profiler.start(`MapLoader.loadLocations(${mapX},${mapY})`);
    const archiveId = this.getLocArchiveId(mapX, mapY);
    if (archiveId === -1) {
      profiler.end(`MapLoader.loadLocations(${mapX},${mapY})`);
      return null;
    }

    // Named: separate archive per type, always file 0.
    // Unnamed: combined archive — terrain=file 0, locs=file 1 (RuneLite RegionLoader).
    const fileId = this.namedIndex ? 0 : 1;
    const file = await this.mapIndex.getFile(archiveId, fileId, xteas);
    if (!file?.data) {
      profiler.end(`MapLoader.loadLocations(${mapX},${mapY})`);
      return null;
    }

    const buffer = new ByteBuffer(file.data);
    const locations: LocationData[] = [];

    let id = -1;
    let idDelta = buffer.readSmart3();
    while (idDelta !== 0) {
      id += idDelta;

      let pos = 0;
      let posDelta = buffer.readUnsignedSmart();
      while (posDelta !== 0) {
        pos += posDelta - 1;

        const localX = (pos >> 6) & 0x3f;
        const localY = pos & 0x3f;
        const level = pos >> 12;

        const attributes = buffer.readUnsignedByte();
        const type = attributes >> 2;
        const rotation = attributes & 0x3;

        locations.push({
          id,
          localX,
          localY,
          level,
          type,
          rotation,
        });

        posDelta = buffer.readUnsignedSmart();
      }

      idDelta = buffer.readSmart3();
    }

    profiler.end(`MapLoader.loadLocations(${mapX},${mapY})`);
    return {
      mapX,
      mapY,
      locations,
    };
  }

  async loadNpcSpawns(mapX: number, mapY: number, xteas?: number[]): Promise<MapSquareNpcSpawns | null> {
    profiler.start(`MapLoader.loadNpcSpawns(${mapX},${mapY})`);
    const archiveId = this.getNpcSpawnArchiveId(mapX, mapY);

    if (archiveId === -1) {
      profiler.end(`MapLoader.loadNpcSpawns(${mapX},${mapY})`);
      return null;
    }

    // Named: separate archive, file 0. Unnamed: combined archive, file 2.
    const fileId = this.namedIndex ? 0 : 2;
    const file = await this.mapIndex.getFile(archiveId, fileId, xteas);
    if (!file?.data) {
      profiler.end(`MapLoader.loadNpcSpawns(${mapX},${mapY})`);
      return null;
    }

    const buffer = new ByteBuffer(file.data);
    const spawns: NpcSpawnData[] = [];

    const baseX = mapX * MAP_SQUARE_SIZE;
    const baseY = mapY * MAP_SQUARE_SIZE;

    while (buffer.remaining > 0) {
      const positionPacked = buffer.readUnsignedShort();
      const level = positionPacked >> 14;
      const x = (positionPacked >> 7) & 0x3f;
      const y = positionPacked & 0x3f;
      const id = buffer.readUnsignedShort();

      spawns.push({
        id,
        x: baseX + x,
        y: baseY + y,
        level,
      });
    }

    profiler.end(`MapLoader.loadNpcSpawns(${mapX},${mapY})`);
    return {
      mapX,
      mapY,
      spawns,
    };
  }
}

export function getMapSquareId(mapX: number, mapY: number): number {
  return (mapX << 8) + mapY;
}

export function worldToMapSquare(worldX: number, worldY: number): { mapX: number; mapY: number } {
  return {
    mapX: worldX >> 6,
    mapY: worldY >> 6,
  };
}

export interface LocTypeInfo {
  clipped: boolean;
  sizeX: number;
  sizeY: number;
}

export type LocTypeInfoLoader = (locId: number) => LocTypeInfo | undefined;

export function populateTileLightOcclusions(
  mapData: MapSquareData,
  locations: LocationData[],
  locTypeLoader: LocTypeInfoLoader,
): void {
  const { tileLightOcclusions } = mapData;

  for (const loc of locations) {
    const locType = locTypeLoader(loc.id);
    if (!locType || !locType.clipped) {
      continue;
    }

    const { type, rotation, localX, localY, level } = loc;
    const tileX = localX;
    const tileY = localY;

    if (level < 0 || level >= tileLightOcclusions.length) continue;
    const levelOcclusions = tileLightOcclusions[level];
    const levelWidth = levelOcclusions.length - 1;
    const levelHeight = (levelOcclusions[0]?.length ?? 1) - 1;
    if (tileX < 0 || tileX >= levelWidth || tileY < 0 || tileY >= levelHeight) continue;

    const setOcclusion = (x: number, y: number, value: number) => {
      if (x >= 0 && x < levelOcclusions.length && y >= 0 && y < levelOcclusions[x].length) {
        if (value > levelOcclusions[x][y]) {
          levelOcclusions[x][y] = value;
        }
      }
    };

    if (type === 0) {
      if (rotation === 0) {
        setOcclusion(tileX, tileY, 50);
        setOcclusion(tileX, tileY + 1, 50);
      } else if (rotation === 1) {
        setOcclusion(tileX, tileY + 1, 50);
        setOcclusion(tileX + 1, tileY + 1, 50);
      } else if (rotation === 2) {
        setOcclusion(tileX + 1, tileY, 50);
        setOcclusion(tileX + 1, tileY + 1, 50);
      } else if (rotation === 3) {
        setOcclusion(tileX, tileY, 50);
        setOcclusion(tileX + 1, tileY, 50);
      }
    } else if (type === 1) {
      if (rotation === 0) {
        setOcclusion(tileX, tileY + 1, 50);
      } else if (rotation === 1) {
        setOcclusion(tileX + 1, tileY + 1, 50);
      } else if (rotation === 2) {
        setOcclusion(tileX + 1, tileY, 50);
      } else if (rotation === 3) {
        setOcclusion(tileX, tileY, 50);
      }
    } else if (type === 3) {
      if (rotation === 0) {
        setOcclusion(tileX, tileY + 1, 50);
      } else if (rotation === 1) {
        setOcclusion(tileX + 1, tileY + 1, 50);
      } else if (rotation === 2) {
        setOcclusion(tileX + 1, tileY, 50);
      } else if (rotation === 3) {
        setOcclusion(tileX, tileY, 50);
      }
    } else if (type >= 10 && type <= 11) {
      const sizeX = locType.sizeX;
      const sizeY = locType.sizeY;
      const lightOcclusion = Math.min(30, 15);

      for (let sx = tileX; sx <= tileX + sizeX; sx++) {
        for (let sy = tileY; sy <= tileY + sizeY; sy++) {
          setOcclusion(sx, sy, lightOcclusion);
        }
      }
    }
  }
}
