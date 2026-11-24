import { MAP_SQUARE_SIZE, type MapSquareData } from './MapLoader';

export interface MapSquareBlockEntry {
  readonly dx: number;
  readonly dy: number;
  readonly tileOffsetX: number;
  readonly tileOffsetY: number;
}

export interface MapSquareOffset {
  readonly dx: number;
  readonly dy: number;
}

export type MapSquareOffsets = readonly [MapSquareOffset, ...MapSquareOffset[]];

export interface TerrainContext extends MapSquareData {
  readonly coreOriginX: number;
  readonly coreOriginY: number;
}

export type MapSquareLookup = (mapX: number, mapY: number) => MapSquareData | undefined;

const CENTER_MAP_SQUARE: MapSquareOffsets = [{ dx: 0, dy: 0 }];
export const TERRAIN_CONTEXT_BORDER = 6;

export function getMapSquareBlock(offsets: MapSquareOffsets = CENTER_MAP_SQUARE): readonly MapSquareBlockEntry[] {
  return offsets.map(({ dx, dy }) => ({
    dx,
    dy,
    tileOffsetX: dx * MAP_SQUARE_SIZE,
    tileOffsetY: dy * MAP_SQUARE_SIZE,
  }));
}

export function getTerrainContextLoadOffsets(renderedOffsets: MapSquareOffsets): MapSquareOffsets {
  const seen = new Set<string>();
  const result: MapSquareOffset[] = [];
  for (const rendered of renderedOffsets) {
    for (let dx = rendered.dx - 1; dx <= rendered.dx + 1; dx++) {
      for (let dy = rendered.dy - 1; dy <= rendered.dy + 1; dy++) {
        const key = `${dx},${dy}`;
        if (seen.has(key)) continue;
        seen.add(key);
        result.push({ dx, dy });
      }
    }
  }
  const first = result[0];
  if (!first) return CENTER_MAP_SQUARE;
  return [first, ...result.slice(1)];
}

export function createTerrainContext(center: MapSquareData, lookup: MapSquareLookup): TerrainContext {
  const tileSize = MAP_SQUARE_SIZE + TERRAIN_CONTEXT_BORDER * 2;
  const vertexSize = tileSize + 1;
  const levels = center.tileHeights.length;
  const tileHeights: Int32Array[][] = Array.from({ length: levels }, () =>
    Array.from({ length: vertexSize }, () => new Int32Array(vertexSize)),
  );
  const tileUnderlays: Uint16Array[][] = Array.from({ length: levels }, () =>
    Array.from({ length: tileSize }, () => new Uint16Array(tileSize)),
  );
  const tileOverlays: Int16Array[][] = Array.from({ length: levels }, () =>
    Array.from({ length: tileSize }, () => new Int16Array(tileSize)),
  );
  const tileShapes: Uint8Array[][] = Array.from({ length: levels }, () =>
    Array.from({ length: tileSize }, () => new Uint8Array(tileSize)),
  );
  const tileRotations: Uint8Array[][] = Array.from({ length: levels }, () =>
    Array.from({ length: tileSize }, () => new Uint8Array(tileSize)),
  );
  const tileRenderFlags: Uint8Array[][] = Array.from({ length: levels }, () =>
    Array.from({ length: tileSize }, () => new Uint8Array(tileSize)),
  );
  const tileLightOcclusions: Uint8Array[][] = Array.from({ length: levels }, () =>
    Array.from({ length: vertexSize }, () => new Uint8Array(vertexSize)),
  );

  for (let level = 0; level < levels; level++) {
    for (let contextX = 0; contextX < tileSize; contextX++) {
      const relativeX = contextX - TERRAIN_CONTEXT_BORDER;
      const squareDx = Math.floor(relativeX / MAP_SQUARE_SIZE);
      const sourceX = relativeX - squareDx * MAP_SQUARE_SIZE;
      for (let contextY = 0; contextY < tileSize; contextY++) {
        const relativeY = contextY - TERRAIN_CONTEXT_BORDER;
        const squareDy = Math.floor(relativeY / MAP_SQUARE_SIZE);
        const sourceY = relativeY - squareDy * MAP_SQUARE_SIZE;
        const source = lookup(center.mapX + squareDx, center.mapY + squareDy);
        if (!source) continue;
        tileUnderlays[level][contextX][contextY] = source.tileUnderlays[level]?.[sourceX]?.[sourceY] ?? 0;
        tileOverlays[level][contextX][contextY] = source.tileOverlays[level]?.[sourceX]?.[sourceY] ?? 0;
        tileShapes[level][contextX][contextY] = source.tileShapes[level]?.[sourceX]?.[sourceY] ?? 0;
        tileRotations[level][contextX][contextY] = source.tileRotations[level]?.[sourceX]?.[sourceY] ?? 0;
        tileRenderFlags[level][contextX][contextY] = source.tileRenderFlags[level]?.[sourceX]?.[sourceY] ?? 0;
      }
    }

    for (let contextX = 0; contextX < vertexSize; contextX++) {
      const relativeX = contextX - TERRAIN_CONTEXT_BORDER;
      const squareDx = Math.floor(relativeX / MAP_SQUARE_SIZE);
      const sourceX = relativeX - squareDx * MAP_SQUARE_SIZE;
      for (let contextY = 0; contextY < vertexSize; contextY++) {
        const relativeY = contextY - TERRAIN_CONTEXT_BORDER;
        const squareDy = Math.floor(relativeY / MAP_SQUARE_SIZE);
        const sourceY = relativeY - squareDy * MAP_SQUARE_SIZE;
        const source = lookup(center.mapX + squareDx, center.mapY + squareDy);
        if (!source) continue;
        tileHeights[level][contextX][contextY] = source.tileHeights[level]?.[sourceX]?.[sourceY] ?? 0;
        tileLightOcclusions[level][contextX][contextY] = source.tileLightOcclusions[level]?.[sourceX]?.[sourceY] ?? 0;
      }
    }
  }

  return {
    mapX: center.mapX,
    mapY: center.mapY,
    coreOriginX: TERRAIN_CONTEXT_BORDER,
    coreOriginY: TERRAIN_CONTEXT_BORDER,
    tileHeights,
    tileUnderlays,
    tileOverlays,
    tileShapes,
    tileRotations,
    tileRenderFlags,
    tileLightOcclusions,
  };
}
