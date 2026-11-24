import { describe, expect, it } from 'vitest';
import { OverlayType } from '../../../rs/config/flotype/FloType';
import { MAX_LEVELS, type MapSquareData } from '../../../rs/map/MapLoader';
import { createTerrainContext } from '../../../rs/map/mapSquareBlock';
import { TerrainBuilder } from '../../backends/picogl/TerrainBuilder';
import { SceneSurfaceHeightResolver } from '../SceneSurfaceHeightResolver';

function createSquare(mapX = 50, mapY = 60): MapSquareData {
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

function terrainSquare(map: MapSquareData, tileOffsetX = 0, tileOffsetY = 0) {
  return {
    terrain: createTerrainContext(map, (mapX, mapY) => (mapX === map.mapX && mapY === map.mapY ? map : undefined)),
    tileOffsetX,
    tileOffsetY,
  };
}

describe('SceneSurfaceHeightResolver', () => {
  it.each([
    { underlay: 1, overlay: 0, expected: 0 },
    { underlay: 0, overlay: 1, expected: 0 },
    { underlay: 0, overlay: 0, expected: 32 },
  ])('samples paint rather than bilinear when underlay=$underlay overlay=$overlay', ({
    underlay,
    overlay,
    expected,
  }) => {
    const map = createSquare();
    map.tileHeights[0][11][21] = 128;
    map.tileUnderlays[0][10][20] = underlay;
    map.tileOverlays[0][10][20] = overlay;
    const resolver = new SceneSurfaceHeightResolver();
    resolver.setTerrain([terrainSquare(map)]);

    expect(resolver.resolve(10.5, 20.5)).toBe(expected);
  });

  it.each([0, 1, 2, 3])('matches the terrain mesh when paint rotation is %s', (rotation) => {
    const map = createSquare();
    map.tileHeights[0][11][21] = -128;
    map.tileOverlays[0][10][20] = 1;
    map.tileRotations[0][10][20] = rotation;
    const resolver = new SceneSurfaceHeightResolver();
    resolver.setTerrain([terrainSquare(map)]);
    const overlay = new OverlayType(0, {
      name: 'test',
      game: 'oldschool',
      environment: 'test',
      revision: 0,
      timestamp: '1970-01-01T00:00:00.000Z',
      size: 0,
    });
    const mesh = new TerrainBuilder().buildMesh(map, 0, 10, 20, 1, 1, {
      overlayLoader: { load: () => overlay, getCount: () => 1, clearCache() {} },
    });

    const height = resolver.resolve(10.5, 20.5);

    expect(mesh.vertexCount).toBe(6);
    expect(height).toBe((mesh.vertices[1] + mesh.vertices[2 * mesh.stride + 1]) / 2);
    expect(height).toBe(rotation % 2 === 0 ? 0 : -64);
  });

  it.each([
    [0, 0.5, 0.75, 384],
    [1, 0.75, 0.5, 192],
    [2, 0.5, 0.25, 64],
    [3, 0.25, 0.5, 256],
  ])('samples shaped interior vertices with rotation %s', (rotation, x, y, expected) => {
    const map = createSquare();
    map.tileHeights[0][11][20] = 128;
    map.tileHeights[0][11][21] = 256;
    map.tileHeights[0][10][21] = 512;
    map.tileOverlays[0][10][20] = 1;
    map.tileShapes[0][10][20] = 9;
    map.tileRotations[0][10][20] = rotation;
    const resolver = new SceneSurfaceHeightResolver();
    resolver.setTerrain([terrainSquare(map)]);

    expect(resolver.resolve(10 + x, 20 + y)).toBe(expected);
  });

  it('retains geometry when the overlay has no renderable color or loader', () => {
    const map = createSquare();
    map.tileHeights[0][11][21] = 128;
    map.tileOverlays[0][10][20] = 1;
    map.tileShapes[0][10][20] = 11;
    const resolver = new SceneSurfaceHeightResolver();
    resolver.setTerrain([terrainSquare(map)]);

    expect(resolver.resolve(10.25, 20.25)).toBe(0);
  });

  it('truncates negative surface samples toward zero', () => {
    const map = createSquare();
    map.tileHeights[0][11][21] = -3;
    map.tileUnderlays[0][10][20] = 1;
    const resolver = new SceneSurfaceHeightResolver();
    resolver.setTerrain([terrainSquare(map)]);

    expect(resolver.resolve(10.75, 20.75)).toBe(-1);
  });

  it('rounds signed bilinear interpolation in two integer stages', () => {
    const map = createSquare();
    map.tileHeights[0][11][20] = -1;
    map.tileHeights[0][10][21] = -1;
    map.tileHeights[0][11][21] = -2;
    const resolver = new SceneSurfaceHeightResolver();
    resolver.setTerrain([terrainSquare(map)]);

    expect(resolver.resolve(10.5, 20.5)).toBe(-2);
  });

  it.each([0, 1, 2, 3])('uses raw plane %s without bridge flags', (plane) => {
    const map = createSquare();
    for (let level = 0; level < 4; level++) map.tileHeights[level][10][20] = -100 * (level + 1);
    const resolver = new SceneSurfaceHeightResolver();
    resolver.setTerrain([terrainSquare(map)]);

    expect(resolver.resolve(10, 20, plane)).toBe(-100 * (plane + 1));
  });

  it.each([0, 1, 2, 3])('uses the bridge raw plane without exceeding plane 3 for scene plane %s', (plane) => {
    const map = createSquare();
    map.tileRenderFlags[1][10][20] = 2;
    for (let level = 0; level < 4; level++) map.tileHeights[level][10][20] = -100 * (level + 1);
    const resolver = new SceneSurfaceHeightResolver();
    resolver.setTerrain([terrainSquare(map)]);
    resolver.setGroundDecorations([
      { x: 10, y: 20, plane: 0, raise: 1 },
      { x: 10, y: 20, plane: 1, raise: 10 },
      { x: 10, y: 20, plane: 2, raise: 20 },
      { x: 10, y: 20, plane: 3, raise: 30 },
    ]);

    expect(resolver.resolve(10, 20, plane)).toBe([-210, -320, -430, -400][plane]);
  });

  it('uses only terrain fallback in the top scene slot cleared by bridge linking', () => {
    const map = createSquare();
    map.tileRenderFlags[1][10][20] = 2;
    map.tileHeights[3][11][21] = 128;
    map.tileUnderlays[3][10][20] = 1;
    const resolver = new SceneSurfaceHeightResolver();
    resolver.setTerrain([terrainSquare(map)]);
    resolver.setGroundDecorations([{ x: 10, y: 20, plane: 3, raise: 7 }]);

    expect(resolver.resolve(10.5, 20.5, 2)).toBe(-7);
    expect(resolver.resolve(10.5, 20.5, 3)).toBe(32);
    expect(resolver.resolve(10.5, 20.5, 2)).toBe(-7);
  });

  it.each([0, 17, 255])('subtracts an unscaled raise of %s after a successful zero-height surface', (raise) => {
    const map = createSquare();
    map.tileHeights[0][11][21] = 128;
    map.tileUnderlays[0][10][20] = 1;
    const resolver = new SceneSurfaceHeightResolver();
    resolver.setTerrain([terrainSquare(map)]);
    resolver.setGroundDecorations([{ x: 10, y: 20, plane: 0, raise }]);

    expect(resolver.resolve(10.5, 20.5)).toBe(0 - raise);
  });

  it.each([
    [10.25, 20.75, 0, -17],
    [11, 20.75, 0, 0],
    [10.25, 21, 0, 0],
    [10.25, 20.75, 1, 0],
  ])('limits raises to the owning tile and raw plane at %s,%s,%s', (x, y, plane, expected) => {
    const resolver = new SceneSurfaceHeightResolver();
    resolver.setTerrain([terrainSquare(createSquare())]);
    resolver.setGroundDecorations([{ x: 10, y: 20, plane: 0, raise: 17 }]);

    expect(resolver.resolve(x, y, plane)).toBe(expected);
  });

  it('samples stitched border heights at arbitrary negative map offsets', () => {
    const center = createSquare();
    const east = createSquare(51, 60);
    center.tileUnderlays[0][63][20] = 1;
    east.tileHeights[0][0][20] = -128;
    east.tileHeights[0][0][21] = -128;
    const terrain = createTerrainContext(center, (mapX, mapY) =>
      [center, east].find((map) => map.mapX === mapX && map.mapY === mapY),
    );
    const resolver = new SceneSurfaceHeightResolver();
    resolver.setTerrain([{ terrain, tileOffsetX: -97, tileOffsetY: 133 }]);
    resolver.setGroundDecorations([{ x: -34, y: 153, plane: 0, raise: 7 }]);

    expect(resolver.resolve(-33.5, 153.5)).toBe(-71);
  });

  it.each([
    [-0.9 / 128, -100],
    [-1.1 / 128, 0],
    [0.9 / 128, -100],
    [1.9 / 128, -99],
  ])('truncates local coordinates before floor tile ownership at x=%s', (x, expected) => {
    const map = createSquare();
    map.tileHeights[0][0][20] = -100;
    map.tileHeights[0][0][21] = -100;
    map.tileUnderlays[0][0][20] = 1;
    const resolver = new SceneSurfaceHeightResolver();
    resolver.setTerrain([terrainSquare(map)]);

    expect(resolver.resolve(x, 20.5)).toBe(expected);
  });

  it.each([
    [-1, 20],
    [64, 20],
    [10, -1],
    [10, 64],
  ])('returns zero outside core squares at %s,%s', (x, y) => {
    const resolver = new SceneSurfaceHeightResolver();
    resolver.setTerrain([terrainSquare(createSquare())]);
    resolver.setGroundDecorations([{ x, y, plane: 0, raise: 255 }]);

    expect(resolver.resolve(x, y)).toBe(0);
  });

  it('chooses the first owning square when core bounds overlap', () => {
    const first = createSquare();
    const second = createSquare();
    first.tileHeights[0][10][20] = -100;
    second.tileHeights[0][10][20] = -200;
    const resolver = new SceneSurfaceHeightResolver();
    resolver.setTerrain([terrainSquare(first), terrainSquare(second)]);

    expect(resolver.resolve(10, 20)).toBe(-100);
  });

  it('replaces cached geometry while preserving asynchronously loaded raises', () => {
    const first = createSquare();
    first.tileUnderlays[0][10][20] = 1;
    const second = createSquare();
    second.tileHeights[0][11][21] = 128;
    second.tileUnderlays[0][10][20] = 1;
    const resolver = new SceneSurfaceHeightResolver();
    resolver.setGroundDecorations([{ x: 10, y: 20, plane: 0, raise: 17 }]);
    resolver.setTerrain([terrainSquare(first)]);
    expect(resolver.resolve(10.75, 20.75)).toBe(-17);

    resolver.setTerrain([terrainSquare(second)]);

    expect(resolver.resolve(10.75, 20.75)).toBe(47);
  });

  it('replaces raises without discarding cached terrain', () => {
    const map = createSquare();
    map.tileHeights[0][10][20] = -100;
    const resolver = new SceneSurfaceHeightResolver();
    resolver.setTerrain([terrainSquare(map)]);
    resolver.setGroundDecorations([{ x: 10, y: 20, plane: 0, raise: 17 }]);
    expect(resolver.resolve(10, 20)).toBe(-117);

    resolver.setGroundDecorations([{ x: 11, y: 20, plane: 0, raise: 23 }]);

    expect(resolver.resolve(10, 20)).toBe(-100);
    expect(resolver.resolve(11, 20)).toBe(-23);
    expect(resolver.hasTerrain).toBe(true);
  });

  it('clears raises when an empty replacement is loaded', () => {
    const resolver = new SceneSurfaceHeightResolver();
    resolver.setTerrain([terrainSquare(createSquare())]);
    resolver.setGroundDecorations([{ x: 10, y: 20, plane: 0, raise: 17 }]);

    resolver.setGroundDecorations([]);

    expect(resolver.resolve(10, 20)).toBe(0);
  });

  it('reports availability for nonempty terrain even without surfaces', () => {
    const resolver = new SceneSurfaceHeightResolver();
    expect(resolver.hasTerrain).toBe(false);

    resolver.setTerrain([terrainSquare(createSquare())]);

    expect(resolver.hasTerrain).toBe(true);
  });

  it('removes terrain but preserves raises when terrain becomes empty', () => {
    const square = terrainSquare(createSquare());
    const resolver = new SceneSurfaceHeightResolver();
    resolver.setTerrain([square]);
    resolver.setGroundDecorations([{ x: 10, y: 20, plane: 0, raise: 17 }]);

    resolver.setTerrain([]);

    expect(resolver.hasTerrain).toBe(false);
    expect(resolver.resolve(10, 20)).toBe(0);
    resolver.setTerrain([square]);
    expect(resolver.resolve(10, 20)).toBe(-17);
  });

  it('clears terrain and raises together', () => {
    const square = terrainSquare(createSquare());
    const resolver = new SceneSurfaceHeightResolver();
    resolver.setTerrain([square]);
    resolver.setGroundDecorations([{ x: 10, y: 20, plane: 0, raise: 17 }]);

    resolver.clear();

    expect(resolver.hasTerrain).toBe(false);
    expect(resolver.resolve(10, 20)).toBe(0);
    resolver.setTerrain([square]);
    expect(resolver.resolve(10, 20)).toBe(0);
  });
});
