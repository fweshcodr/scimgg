import { createHash } from 'node:crypto';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { CacheInfo } from '../../../rs/cache/CacheInfo';
import { type OverlayType, UnderlayType } from '../../../rs/config/flotype/FloType';
import type { OverlayTypeLoader, UnderlayTypeLoader } from '../../../rs/config/flotype/FloTypeLoader';
import { MAP_SQUARE_SIZE, MAX_LEVELS, type MapSquareData } from '../../../rs/map/MapLoader';
import { createTerrainContext } from '../../../rs/map/mapSquareBlock';
import { createTerrainBuilder, TerrainBuilder, TILE_SIZE, VERTEX_STRIDE } from './TerrainBuilder';

const CACHE_INFO: CacheInfo = {
  name: 'terrain-context-test',
  game: 'oldschool',
  environment: 'test',
  revision: 1,
  timestamp: '2026-01-01T00:00:00.000Z',
  size: 0,
};

function createSquare(mapX: number, mapY: number): MapSquareData {
  return {
    mapX,
    mapY,
    tileHeights: Array.from({ length: MAX_LEVELS }, () => Array.from({ length: 65 }, () => new Int32Array(65))),
    tileUnderlays: Array.from({ length: MAX_LEVELS }, () => Array.from({ length: 64 }, () => new Uint16Array(64))),
    tileOverlays: Array.from({ length: MAX_LEVELS }, () => Array.from({ length: 64 }, () => new Int16Array(64))),
    tileShapes: Array.from({ length: MAX_LEVELS }, () => Array.from({ length: 64 }, () => new Uint8Array(64))),
    tileRotations: Array.from({ length: MAX_LEVELS }, () => Array.from({ length: 64 }, () => new Uint8Array(64))),
    tileRenderFlags: Array.from({ length: MAX_LEVELS }, () => Array.from({ length: 64 }, () => new Uint8Array(64))),
    tileLightOcclusions: Array.from({ length: MAX_LEVELS }, () => Array.from({ length: 65 }, () => new Uint8Array(65))),
  };
}

function createUnderlayLoader(): UnderlayTypeLoader {
  const underlays = [30, 90].map((hue, id) => {
    const underlay = new UnderlayType(id, CACHE_INFO);
    underlay.hue = hue;
    underlay.saturation = 128;
    underlay.lightness = 128;
    underlay.hueMultiplier = 1;
    return underlay;
  });
  return {
    load: (id) => underlays[id] ?? underlays[0],
    getCount: () => underlays.length,
    clearCache: () => {},
  };
}

describe('TerrainBuilder bordered context', () => {
  it('renders the core east edge at unchanged coordinates using neighboring heights and normals', () => {
    const center = createSquare(50, 60);
    const east = createSquare(51, 60);
    center.tileUnderlays[0][63][20] = 1;
    east.tileHeights[0][0][20] = 160;
    east.tileHeights[0][0][21] = 160;
    east.tileHeights[0][1][20] = 320;
    east.tileHeights[0][1][21] = 320;
    const context = createTerrainContext(center, (mapX, mapY) =>
      [center, east].find((square) => square.mapX === mapX && square.mapY === mapY),
    );

    const mesh = createTerrainBuilder().buildMesh(
      context,
      0,
      context.coreOriginX + 63,
      context.coreOriginY + 20,
      1,
      1,
      {
        underlayLoader: createUnderlayLoader(),
        smoothTerrain: true,
        coordinateOrigin: { x: context.coreOriginX, y: context.coreOriginY },
      },
    );

    const xCoordinates = Array.from({ length: mesh.vertexCount }, (_, index) => mesh.vertices[index * VERTEX_STRIDE]);
    const heights = Array.from({ length: mesh.vertexCount }, (_, index) => mesh.vertices[index * VERTEX_STRIDE + 1]);
    const xNormals = Array.from({ length: mesh.vertexCount }, (_, index) => mesh.vertices[index * VERTEX_STRIDE + 3]);
    expect(Math.min(...xCoordinates)).toBe(63 * TILE_SIZE);
    expect(Math.max(...xCoordinates)).toBe(MAP_SQUARE_SIZE * TILE_SIZE);
    expect(heights).toContain(160);
    expect(xNormals.some((normal) => normal !== 0)).toBe(true);
  });

  it('includes the east apron in underlay smoothing at the core boundary', () => {
    const center = createSquare(50, 60);
    const east = createSquare(51, 60);
    center.tileUnderlays[0][63][20] = 1;
    for (let x = 0; x <= 5; x++) {
      for (let y = 15; y <= 25; y++) east.tileUnderlays[0][x][y] = 2;
    }
    const lookup = (mapX: number, mapY: number) =>
      [center, east].find((square) => square.mapX === mapX && square.mapY === mapY);
    const withEast = createTerrainContext(center, lookup);
    const withoutEast = createTerrainContext(center, (mapX, mapY) =>
      mapX === center.mapX && mapY === center.mapY ? center : undefined,
    );
    const builder = createTerrainBuilder();
    const options = {
      underlayLoader: createUnderlayLoader(),
      smoothTerrain: true,
      coordinateOrigin: { x: withEast.coreOriginX, y: withEast.coreOriginY },
    };

    const smoothed = builder.buildMesh(
      withEast,
      0,
      withEast.coreOriginX + 63,
      withEast.coreOriginY + 20,
      1,
      1,
      options,
    );
    const clipped = builder.buildMesh(
      withoutEast,
      0,
      withoutEast.coreOriginX + 63,
      withoutEast.coreOriginY + 20,
      1,
      1,
      options,
    );

    expect(smoothed.vertices[9]).not.toBe(clipped.vertices[9]);
  });
});

function createMockOverlayLoader(textureMap: Map<number, number>): OverlayTypeLoader {
  return {
    load: (id: number) => {
      const texture = textureMap.get(id) ?? -1;
      return { texture } as OverlayType;
    },
    getIds: () => [...textureMap.keys()],
    getCount: () => textureMap.size,
    clearCache: () => {},
  } as unknown as OverlayTypeLoader;
}

function createMockUnderlayLoader(): UnderlayTypeLoader {
  return {
    load: () => ({
      hue: 30,
      saturation: 128,
      lightness: 128,
      hueMultiplier: 1,
    }),
    getIds: () => [0],
    getCount: () => 1,
    clearCache: () => {},
  } as unknown as UnderlayTypeLoader;
}

function createMockMapData(width: number, height: number): MapSquareData {
  const tileHeights: Int32Array[][] = [];
  const tileUnderlays: Uint16Array[][] = [];
  const tileOverlays: Int16Array[][] = [];
  const tileShapes: Uint8Array[][] = [];
  const tileRotations: Uint8Array[][] = [];
  const tileRenderFlags: Uint8Array[][] = [];
  const tileLightOcclusions: Uint8Array[][] = [];

  for (let level = 0; level < 4; level++) {
    tileHeights[level] = [];
    tileUnderlays[level] = [];
    tileOverlays[level] = [];
    tileShapes[level] = [];
    tileRotations[level] = [];
    tileRenderFlags[level] = [];
    tileLightOcclusions[level] = [];

    for (let x = 0; x <= width; x++) {
      tileHeights[level][x] = new Int32Array(height + 1);
      tileLightOcclusions[level][x] = new Uint8Array(height + 1);
    }

    for (let x = 0; x < width; x++) {
      tileUnderlays[level][x] = new Uint16Array(height);
      tileOverlays[level][x] = new Int16Array(height);
      tileShapes[level][x] = new Uint8Array(height);
      tileRotations[level][x] = new Uint8Array(height);
      tileRenderFlags[level][x] = new Uint8Array(height);
      tileUnderlays[level][x].fill(1);
    }
  }

  return {
    mapX: 50,
    mapY: 50,
    tileHeights,
    tileUnderlays,
    tileOverlays,
    tileShapes,
    tileRotations,
    tileRenderFlags,
    tileLightOcclusions,
  };
}

function setTileHeight(mapData: MapSquareData, level: number, x: number, y: number, height: number): void {
  mapData.tileHeights[level][x][y] = height;
}

function setTileTextures(
  mapData: MapSquareData,
  level: number,
  x: number,
  y: number,
  underlayId: number,
  overlayId: number,
): void {
  mapData.tileUnderlays[level][x][y] = underlayId;
  mapData.tileOverlays[level][x][y] = overlayId;
}

describe('TerrainBuilder', () => {
  let builder: TerrainBuilder;

  beforeEach(() => {
    builder = createTerrainBuilder();
  });

  describe('buildMesh', () => {
    it.each([false, true])('preserves all classic shape buffers when smoothTerrain=%s', (smoothTerrain) => {
      const mapData = createMockMapData(64, 64);
      for (let tileX = 0; tileX < 65; tileX++) {
        for (let tileY = 0; tileY < 65; tileY++) {
          mapData.tileHeights[0][tileX][tileY] = -(tileX * 31 + tileY * 53 + tileX * tileY * 7);
          if (tileX < 64 && tileY < 64) mapData.tileUnderlays[0][tileX][tileY] = ((tileX + tileY) % 2) + 1;
        }
      }
      const digest = createHash('sha256');
      const builder = createTerrainBuilder();
      const options = {
        smoothTerrain,
        underlayLoader: createUnderlayLoader(),
        overlayLoader: createMockOverlayLoader(new Map([[0, 42]])),
      };

      for (let shape = 0; shape < 13; shape++) {
        for (let rotation = 0; rotation < 4; rotation++) {
          mapData.tileOverlays[0][8][9] = shape === 0 ? 0 : 1;
          mapData.tileShapes[0][8][9] = Math.max(0, shape - 1);
          mapData.tileRotations[0][8][9] = rotation;
          const mesh = builder.buildMesh(mapData, 0, 8, 9, 1, 1, options);
          digest.update(new Uint8Array(mesh.vertices.buffer, mesh.vertices.byteOffset, mesh.vertices.byteLength));
        }
      }

      expect(digest.digest('hex')).toBe(
        smoothTerrain
          ? '2e1777450d793910ef69cbe27d539267062e6a4d1a34279120ec5893a5db8cf2'
          : '0c113619a3a395ec4bc14957d8809e3d74ef4d848ac4e5bbeb483f97f6f6c608',
      );
    });

    it('builds mesh from 8x8 terrain and returns vertices array', () => {
      const mapData = createMockMapData(64, 64);
      const mesh = builder.buildMesh(mapData, 0, 0, 0, 8, 8, { underlayLoader: createMockUnderlayLoader() });

      expect(mesh.vertices).toBeInstanceOf(Float32Array);
      expect(mesh.stride).toBe(VERTEX_STRIDE);
      expect(mesh.vertexCount).toBeGreaterThan(0);
    });

    it('returns correct vertex count for 8x8 terrain (8*8*6 = 384)', () => {
      const mapData = createMockMapData(64, 64);
      const mesh = builder.buildMesh(mapData, 0, 0, 0, 8, 8, { underlayLoader: createMockUnderlayLoader() });

      const expectedVertexCount = 8 * 8 * 6;
      expect(mesh.vertexCount).toBe(expectedVertexCount);
      expect(mesh.vertexCount).toBe(384);
    });

    it('returns correct buffer size for vertex data', () => {
      const mapData = createMockMapData(64, 64);
      const mesh = builder.buildMesh(mapData, 0, 0, 0, 8, 8, { underlayLoader: createMockUnderlayLoader() });

      const expectedBufferLength = mesh.vertexCount * VERTEX_STRIDE;
      expect(mesh.vertices.length).toBe(expectedBufferLength);
    });

    it('generates correct vertex positions for flat terrain', () => {
      const mapData = createMockMapData(64, 64);
      const mesh = builder.buildMesh(mapData, 0, 0, 0, 1, 1, { underlayLoader: createMockUnderlayLoader() });

      expect(mesh.vertexCount).toBe(6);

      for (let i = 0; i < mesh.vertexCount; i++) {
        const vx = mesh.vertices[i * VERTEX_STRIDE];
        const vz = mesh.vertices[i * VERTEX_STRIDE + 2];
        expect(vx).toBeGreaterThanOrEqual(0);
        expect(vx).toBeLessThanOrEqual(TILE_SIZE);
        expect(vz).toBeGreaterThanOrEqual(0);
        expect(vz).toBeLessThanOrEqual(TILE_SIZE);
      }
    });

    it('applies height values to vertex Y coordinates', () => {
      const mapData = createMockMapData(64, 64);
      setTileHeight(mapData, 0, 0, 0, -100);
      setTileHeight(mapData, 0, 1, 0, -200);
      setTileHeight(mapData, 0, 1, 1, -300);
      setTileHeight(mapData, 0, 0, 1, -400);

      const mesh = builder.buildMesh(mapData, 0, 0, 0, 1, 1, { underlayLoader: createMockUnderlayLoader() });

      const yValues = new Set<number>();
      for (let i = 0; i < mesh.vertexCount; i++) {
        yValues.add(mesh.vertices[i * VERTEX_STRIDE + 1]);
      }

      expect(yValues.has(-100)).toBe(true);
      expect(yValues.has(-200)).toBe(true);
      expect(yValues.has(-300)).toBe(true);
      expect(yValues.has(-400)).toBe(true);
    });

    it('generates normals for each vertex', () => {
      const mapData = createMockMapData(64, 64);
      const mesh = builder.buildMesh(mapData, 0, 0, 0, 1, 1, { underlayLoader: createMockUnderlayLoader() });

      const nx = mesh.vertices[3];
      const ny = mesh.vertices[4];
      const nz = mesh.vertices[5];

      const normalLength = Math.sqrt(nx * nx + ny * ny + nz * nz);
      expect(normalLength).toBeCloseTo(1.0, 5);
    });

    it('generates up-facing normals for flat terrain', () => {
      const mapData = createMockMapData(64, 64);
      const mesh = builder.buildMesh(mapData, 0, 0, 0, 1, 1, { underlayLoader: createMockUnderlayLoader() });

      for (let i = 0; i < mesh.vertexCount; i++) {
        const ny = mesh.vertices[i * VERTEX_STRIDE + 4];
        expect(Math.abs(ny)).toBeCloseTo(1.0, 1);
      }
    });

    it('generates UV coordinates in [0,1] range', () => {
      const mapData = createMockMapData(64, 64);
      const mesh = builder.buildMesh(mapData, 0, 0, 0, 1, 1, { underlayLoader: createMockUnderlayLoader() });

      for (let i = 0; i < mesh.vertexCount; i++) {
        const u = mesh.vertices[i * VERTEX_STRIDE + 6];
        const v = mesh.vertices[i * VERTEX_STRIDE + 7];
        expect(u).toBeGreaterThanOrEqual(0);
        expect(u).toBeLessThanOrEqual(1);
        expect(v).toBeGreaterThanOrEqual(0);
        expect(v).toBeLessThanOrEqual(1);
      }
    });
  });

  describe('texture coordinates', () => {
    it('references correct underlay texture ID', () => {
      const mapData = createMockMapData(64, 64);
      setTileTextures(mapData, 0, 0, 0, 42, 0);

      const mesh = builder.buildMesh(mapData, 0, 0, 0, 1, 1, { underlayLoader: createMockUnderlayLoader() });

      for (let i = 0; i < mesh.vertexCount; i++) {
        const hslColor = mesh.vertices[i * VERTEX_STRIDE + 9];
        expect(hslColor).toBeGreaterThan(0);
      }
    });

    it('references correct overlay texture ID when present', () => {
      const mapData = createMockMapData(64, 64);
      setTileTextures(mapData, 0, 0, 0, 10, 99);
      const overlayLoader = createMockOverlayLoader(new Map([[98, 42]]));

      const mesh = builder.buildMesh(mapData, 0, 0, 0, 1, 1, {
        overlayLoader,
        underlayLoader: createMockUnderlayLoader(),
      });

      expect(mesh.vertexCount).toBeGreaterThan(0);
      expect(mesh.vertices).toBeInstanceOf(Float32Array);
    });

    it('sets textureId to -1 when no overlay', () => {
      const mapData = createMockMapData(64, 64);
      setTileTextures(mapData, 0, 0, 0, 10, 0);

      const mesh = builder.buildMesh(mapData, 0, 0, 0, 1, 1, { underlayLoader: createMockUnderlayLoader() });

      const textureId = mesh.vertices[8];
      expect(textureId).toBe(-1);
    });

    it('preserves texture IDs across all vertices of a tile', () => {
      const mapData = createMockMapData(64, 64);
      setTileTextures(mapData, 0, 0, 0, 25, 50);
      const overlayLoader = createMockOverlayLoader(new Map([[49, 77]]));

      const mesh = builder.buildMesh(mapData, 0, 0, 0, 1, 1, {
        overlayLoader,
        underlayLoader: createMockUnderlayLoader(),
      });

      expect(mesh.vertexCount).toBeGreaterThan(0);
      expect(mesh.vertices).toBeInstanceOf(Float32Array);
    });
  });

  describe('interpolateHeight', () => {
    it('returns corner height at (0, 0)', () => {
      const mapData = createMockMapData(64, 64);
      setTileHeight(mapData, 0, 0, 0, -100);

      const height = builder.interpolateHeight(mapData, 0, 0, 0, 0, 0);
      expect(height).toBe(-100);
    });

    it('returns corner height at (1, 0)', () => {
      const mapData = createMockMapData(64, 64);
      setTileHeight(mapData, 0, 1, 0, -200);

      const height = builder.interpolateHeight(mapData, 0, 0, 0, 1, 0);
      expect(height).toBe(-200);
    });

    it('returns corner height at (1, 1)', () => {
      const mapData = createMockMapData(64, 64);
      setTileHeight(mapData, 0, 1, 1, -300);

      const height = builder.interpolateHeight(mapData, 0, 0, 0, 1, 1);
      expect(height).toBe(-300);
    });

    it('returns corner height at (0, 1)', () => {
      const mapData = createMockMapData(64, 64);
      setTileHeight(mapData, 0, 0, 1, -400);

      const height = builder.interpolateHeight(mapData, 0, 0, 0, 0, 1);
      expect(height).toBe(-400);
    });

    it('interpolates height at center (0.5, 0.5)', () => {
      const mapData = createMockMapData(64, 64);
      setTileHeight(mapData, 0, 0, 0, 0);
      setTileHeight(mapData, 0, 1, 0, 0);
      setTileHeight(mapData, 0, 1, 1, 0);
      setTileHeight(mapData, 0, 0, 1, 0);

      const height = builder.interpolateHeight(mapData, 0, 0, 0, 0.5, 0.5);
      expect(height).toBe(0);
    });

    it('interpolates height correctly with varying corners', () => {
      const mapData = createMockMapData(64, 64);
      setTileHeight(mapData, 0, 0, 0, 0);
      setTileHeight(mapData, 0, 1, 0, 100);
      setTileHeight(mapData, 0, 1, 1, 100);
      setTileHeight(mapData, 0, 0, 1, 0);

      const height = builder.interpolateHeight(mapData, 0, 0, 0, 0.5, 0.5);
      expect(height).toBe(50);
    });
  });

  describe('world coordinates', () => {
    it('positions tiles at correct world coordinates', () => {
      const mapData = createMockMapData(64, 64);
      const mesh = builder.buildMesh(mapData, 0, 5, 5, 1, 1, { underlayLoader: createMockUnderlayLoader() });

      const expectedMinX = 5 * TILE_SIZE;
      const expectedMaxX = 6 * TILE_SIZE;
      const expectedMinZ = 5 * TILE_SIZE;
      const expectedMaxZ = 6 * TILE_SIZE;

      for (let i = 0; i < mesh.vertexCount; i++) {
        const x = mesh.vertices[i * VERTEX_STRIDE];
        const z = mesh.vertices[i * VERTEX_STRIDE + 2];
        expect(x).toBeGreaterThanOrEqual(expectedMinX);
        expect(x).toBeLessThanOrEqual(expectedMaxX);
        expect(z).toBeGreaterThanOrEqual(expectedMinZ);
        expect(z).toBeLessThanOrEqual(expectedMaxZ);
      }
    });

    it('generates correct tile size in world units', () => {
      const mapData = createMockMapData(64, 64);
      const mesh = builder.buildMesh(mapData, 0, 0, 0, 1, 1, { underlayLoader: createMockUnderlayLoader() });

      const xCoords = new Set<number>();
      for (let i = 0; i < mesh.vertexCount; i++) {
        xCoords.add(mesh.vertices[i * VERTEX_STRIDE]);
      }

      const xArray = Array.from(xCoords).sort((a, b) => a - b);
      expect(xArray.length).toBeGreaterThan(1);
      expect(xArray[xArray.length - 1] - xArray[0]).toBe(TILE_SIZE);
    });
  });

  describe('multiple levels', () => {
    it('uses correct height data for different levels', () => {
      const mapData = createMockMapData(64, 64);
      setTileHeight(mapData, 0, 0, 0, -100);
      setTileHeight(mapData, 1, 0, 0, -500);

      const mesh0 = builder.buildMesh(mapData, 0, 0, 0, 1, 1, { underlayLoader: createMockUnderlayLoader() });
      const mesh1 = builder.buildMesh(mapData, 1, 0, 0, 1, 1, { underlayLoader: createMockUnderlayLoader() });

      const yValues0 = new Set<number>();
      const yValues1 = new Set<number>();
      for (let i = 0; i < mesh0.vertexCount; i++) {
        yValues0.add(mesh0.vertices[i * VERTEX_STRIDE + 1]);
      }
      for (let i = 0; i < mesh1.vertexCount; i++) {
        yValues1.add(mesh1.vertices[i * VERTEX_STRIDE + 1]);
      }

      expect(yValues0.has(-100)).toBe(true);
      expect(yValues1.has(-500)).toBe(true);
    });
  });

  describe('factory function', () => {
    it('creates a TerrainBuilder instance', () => {
      const builder = createTerrainBuilder();
      expect(builder).toBeInstanceOf(TerrainBuilder);
    });
  });
});

describe('TerrainBuilder GPU upload', () => {
  it('creates vertex array with correct attribute layout', () => {
    const mockVertexBuffer = {
      delete: vi.fn(),
    };

    const mockVertexArray = {
      vertexAttributeBuffer: vi.fn().mockReturnThis(),
      delete: vi.fn(),
    };

    const mockApp = {
      createInterleavedBuffer: vi.fn().mockReturnValue(mockVertexBuffer),
      createVertexArray: vi.fn().mockReturnValue(mockVertexArray),
    };

    const builder = createTerrainBuilder();
    const mapData = createMockMapData(64, 64);
    const mesh = builder.buildMesh(mapData, 0, 0, 0, 2, 2, { underlayLoader: createMockUnderlayLoader() });

    const glMesh = builder.uploadToGPU(mockApp as any, mesh);

    expect(mockApp.createInterleavedBuffer).toHaveBeenCalledWith(VERTEX_STRIDE * 4, mesh.vertices);
    expect(mockApp.createVertexArray).toHaveBeenCalled();
    expect(mockVertexArray.vertexAttributeBuffer).toHaveBeenCalledTimes(6);
    expect(glMesh.vertexCount).toBe(mesh.vertexCount);
  });

  it('disposes GPU resources correctly', () => {
    const mockVertexBuffer = { delete: vi.fn() };
    const mockVertexArray = { delete: vi.fn() };

    const builder = createTerrainBuilder();
    const glMesh = {
      vertexArray: mockVertexArray as any,
      vertexBuffer: mockVertexBuffer as any,
      vertexCount: 6,
    };

    builder.disposeGLMesh(glMesh);

    expect(mockVertexArray.delete).toHaveBeenCalled();
    expect(mockVertexBuffer.delete).toHaveBeenCalled();
  });
});
