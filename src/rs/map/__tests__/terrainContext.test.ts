import { describe, expect, it } from 'vitest';
import { MAP_SQUARE_SIZE, MAX_LEVELS, type MapSquareData } from '../MapLoader';
import { createTerrainContext, getTerrainContextLoadOffsets, TERRAIN_CONTEXT_BORDER } from '../mapSquareBlock';

function createSquare(mapX: number, mapY: number): MapSquareData {
  return {
    mapX,
    mapY,
    tileHeights: Array.from({ length: MAX_LEVELS }, () =>
      Array.from({ length: MAP_SQUARE_SIZE + 1 }, () => new Int32Array(MAP_SQUARE_SIZE + 1)),
    ),
    tileUnderlays: Array.from({ length: MAX_LEVELS }, () =>
      Array.from({ length: MAP_SQUARE_SIZE }, () => new Uint16Array(MAP_SQUARE_SIZE)),
    ),
    tileOverlays: Array.from({ length: MAX_LEVELS }, () =>
      Array.from({ length: MAP_SQUARE_SIZE }, () => new Int16Array(MAP_SQUARE_SIZE)),
    ),
    tileShapes: Array.from({ length: MAX_LEVELS }, () =>
      Array.from({ length: MAP_SQUARE_SIZE }, () => new Uint8Array(MAP_SQUARE_SIZE)),
    ),
    tileRotations: Array.from({ length: MAX_LEVELS }, () =>
      Array.from({ length: MAP_SQUARE_SIZE }, () => new Uint8Array(MAP_SQUARE_SIZE)),
    ),
    tileRenderFlags: Array.from({ length: MAX_LEVELS }, () =>
      Array.from({ length: MAP_SQUARE_SIZE }, () => new Uint8Array(MAP_SQUARE_SIZE)),
    ),
    tileLightOcclusions: Array.from({ length: MAX_LEVELS }, () =>
      Array.from({ length: MAP_SQUARE_SIZE + 1 }, () => new Uint8Array(MAP_SQUARE_SIZE + 1)),
    ),
  };
}

function setTerrainSample(square: MapSquareData, level: number, x: number, y: number, value: number): void {
  square.tileHeights[level][x][y] = value;
  square.tileUnderlays[level][x][y] = value;
  square.tileOverlays[level][x][y] = value;
  square.tileShapes[level][x][y] = value;
  square.tileRotations[level][x][y] = value;
  square.tileRenderFlags[level][x][y] = value;
  square.tileLightOcclusions[level][x][y] = value;
}

function lookup(squares: readonly MapSquareData[]): (mapX: number, mapY: number) => MapSquareData | undefined {
  return (mapX, mapY) => squares.find((square) => square.mapX === mapX && square.mapY === mapY);
}

describe('terrain map-square context', () => {
  it.each([
    ['west', -1, 0, 58, 20, 0, 26],
    ['east', 1, 0, 5, 20, 75, 26],
    ['south', 0, -1, 20, 58, 26, 0],
    ['north', 0, 1, 20, 5, 26, 75],
  ] as const)('copies the full six-tile %s apron', (_name, dx, dy, sourceX, sourceY, contextX, contextY) => {
    const center = createSquare(50, 60);
    const neighbor = createSquare(center.mapX + dx, center.mapY + dy);
    setTerrainSample(neighbor, 0, sourceX, sourceY, 17);

    const context = createTerrainContext(center, lookup([center, neighbor]));

    expect(context.tileHeights[0][contextX][contextY]).toBe(17);
    expect(context.tileUnderlays[0][contextX][contextY]).toBe(17);
    expect(context.tileOverlays[0][contextX][contextY]).toBe(17);
    expect(context.tileShapes[0][contextX][contextY]).toBe(17);
    expect(context.tileRotations[0][contextX][contextY]).toBe(17);
    expect(context.tileRenderFlags[0][contextX][contextY]).toBe(17);
    expect(context.tileLightOcclusions[0][contextX][contextY]).toBe(17);
  });

  it('copies northeast corner data from the diagonal square', () => {
    const center = createSquare(50, 60);
    const northeast = createSquare(51, 61);
    setTerrainSample(northeast, 0, 0, 0, 23);

    const context = createTerrainContext(center, lookup([center, northeast]));

    const boundary = TERRAIN_CONTEXT_BORDER + MAP_SQUARE_SIZE;
    expect(context.tileHeights[0][boundary][boundary]).toBe(23);
    expect(context.tileUnderlays[0][boundary][boundary]).toBe(23);
  });

  it('keeps deterministic zero defaults when a true outer neighbor is missing', () => {
    const center = createSquare(50, 60);

    const context = createTerrainContext(center, lookup([center]));

    expect(context.tileHeights[0][0][0]).toBe(0);
    expect(context.tileUnderlays[0][0][0]).toBe(0);
    expect(context.tileLightOcclusions[0][0][0]).toBe(0);
  });

  it('copies neighboring terrain on every configured cache plane', () => {
    const center = createSquare(50, 60);
    const east = createSquare(51, 60);
    for (let level = 0; level < MAX_LEVELS; level++) {
      setTerrainSample(east, level, 0, 12, level + 1);
    }

    const context = createTerrainContext(center, lookup([center, east]));

    const eastBoundary = TERRAIN_CONTEXT_BORDER + MAP_SQUARE_SIZE;
    expect(context.tileHeights.map((plane) => plane[eastBoundary][12 + TERRAIN_CONTEXT_BORDER])).toEqual([1, 2, 3, 4]);
    expect(context.tileUnderlays.map((plane) => plane[eastBoundary][12 + TERRAIN_CONTEXT_BORDER])).toEqual([
      1, 2, 3, 4,
    ]);
  });

  it('does not mutate cached source squares while constructing or editing a context', () => {
    const center = createSquare(50, 60);
    const east = createSquare(51, 60);
    setTerrainSample(center, 0, 63, 10, 31);
    setTerrainSample(east, 0, 0, 10, 37);

    const context = createTerrainContext(center, lookup([center, east]));
    context.tileHeights[0][TERRAIN_CONTEXT_BORDER + MAP_SQUARE_SIZE][TERRAIN_CONTEXT_BORDER + 10] = 99;
    context.tileUnderlays[0][TERRAIN_CONTEXT_BORDER + 63][TERRAIN_CONTEXT_BORDER + 10] = 99;

    expect(center.tileHeights[0][63][10]).toBe(31);
    expect(center.tileUnderlays[0][63][10]).toBe(31);
    expect(east.tileHeights[0][0][10]).toBe(37);
    expect(east.tileUnderlays[0][0][10]).toBe(37);
  });

  it('deduplicates the one-square load halo shared by adjacent rendered squares', () => {
    const offsets = getTerrainContextLoadOffsets([
      { dx: 0, dy: 0 },
      { dx: 1, dy: 0 },
    ]);

    expect(offsets).toHaveLength(12);
    expect(new Set(offsets.map(({ dx, dy }) => `${dx},${dy}`)).size).toBe(12);
  });
});
