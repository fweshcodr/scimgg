import { PositiveModelHeight } from '../../rs/config/loctype/LocModelLoader';
import { ModelData } from '../../rs/model/ModelData';
import { getTerrainHeight } from '../shared/renderUtils';
import { contourLocPositions } from './locContour';
import { type LocFootprint, type LocMapType, sampleLocTerrainHeight } from './locPlacement';

export type StagedLocSourceCategory = 'boundary' | 'large' | 'floor';

export type StagedStaticLoc = {
  readonly objectIndex: number;
  readonly partIndex: number;
  readonly sourceCategory: StagedLocSourceCategory;
  readonly level: number;
  readonly tileX: number;
  readonly tileY: number;
  readonly sizeX: number;
  readonly sizeY: number;
  readonly sceneOffsetX: number;
  readonly sceneOffsetY: number;
  readonly terrainHeightPlanes: Int32Array[][];
  readonly mapSquareOffsetX: number;
  readonly mapSquareOffsetY: number;
  readonly terrainContextOriginX: number;
  readonly terrainContextOriginY: number;
  readonly model: ModelData;
};

export type ContourStaticLocModelInput = {
  readonly model: ModelData;
  readonly terrainHeights: Int32Array[] | null;
  readonly terrainLocalX: number;
  readonly terrainLocalY: number;
  readonly footprint: LocFootprint;
  readonly contouredGround: number;
};

function tileKey(level: number, tileX: number, tileY: number): string {
  return `${level}:${tileX}:${tileY}`;
}

function pairKey(first: number, second: number): string {
  return first < second ? `${first}:${second}` : `${second}:${first}`;
}

function centerX(loc: StagedStaticLoc): number {
  return loc.tileX * 128 + loc.sizeX * 64 + loc.sceneOffsetX;
}

function centerZ(loc: StagedStaticLoc): number {
  return loc.tileY * 128 + loc.sizeY * 64 + loc.sceneOffsetY;
}

function assertNever(value: never): never {
  throw new RangeError(`Unexpected LOC source type: ${value}`);
}

export function getStagedLocSourceCategory(sourceType: LocMapType): StagedLocSourceCategory | null {
  switch (sourceType) {
    case 0:
    case 1:
    case 2:
    case 3:
      return 'boundary';
    case 4:
    case 5:
    case 6:
    case 7:
    case 8:
      return null;
    case 9:
    case 10:
    case 11:
    case 12:
    case 13:
    case 14:
    case 15:
    case 16:
    case 17:
    case 18:
    case 19:
    case 20:
    case 21:
      return 'large';
    case 22:
      return 'floor';
    default:
      return assertNever(sourceType);
  }
}

function tileCenterHeight(loc: StagedStaticLoc, level: number, tileX: number, tileY: number): number {
  const heights = loc.terrainHeightPlanes[level] ?? null;
  const localX = tileX - loc.mapSquareOffsetX + loc.terrainContextOriginX;
  const localY = tileY - loc.mapSquareOffsetY + loc.terrainContextOriginY;
  return (
    (getTerrainHeight(heights, localX, localY) +
      getTerrainHeight(heights, localX, localY + 1) +
      getTerrainHeight(heights, localX + 1, localY) +
      getTerrainHeight(heights, localX + 1, localY + 1)) >>
    2
  );
}

function mergePair(
  source: StagedStaticLoc,
  neighbor: StagedStaticLoc,
  offsetY: number,
  hideOccludedFaces: boolean,
): void {
  source.model.calculateBounds();
  neighbor.model.calculateBounds();
  const offsetX = centerX(neighbor) - centerX(source);
  const offsetZ = centerZ(neighbor) - centerZ(source);
  if (
    source.model.maxX - offsetX < neighbor.model.minX ||
    source.model.minX - offsetX > neighbor.model.maxX ||
    source.model.maxY - offsetY < neighbor.model.minY ||
    source.model.minY - offsetY > neighbor.model.maxY ||
    source.model.maxZ - offsetZ < neighbor.model.minZ ||
    source.model.minZ - offsetZ > neighbor.model.maxZ
  ) {
    return;
  }
  ModelData.mergeNormals(source.model, neighbor.model, offsetX, offsetY, offsetZ, hideOccludedFaces);
}

function isolateModels(staged: readonly StagedStaticLoc[]): void {
  for (const loc of staged) {
    if (loc.model.faceRenderTypes) loc.model.faceRenderTypes = new Int8Array(loc.model.faceRenderTypes);
    loc.model.mergedNormals = undefined;
  }
}

export function contourStaticLocModel(input: ContourStaticLocModelInput): number {
  const sceneHeight = sampleLocTerrainHeight({
    terrainHeights: input.terrainHeights,
    localX: input.terrainLocalX,
    localY: input.terrainLocalY,
    footprint: input.footprint,
  });
  if (input.contouredGround < 0 || !input.terrainHeights) return sceneHeight;

  input.model.calculateBounds();
  const positions = new Float32Array(input.model.usedVertexCount * 3);
  for (let vertex = 0; vertex < input.model.usedVertexCount; vertex++) {
    positions[vertex * 3] = input.model.verticesX[vertex];
    positions[vertex * 3 + 1] = input.model.verticesY[vertex];
    positions[vertex * 3 + 2] = input.model.verticesZ[vertex];
  }
  const contoured = contourLocPositions({
    positions,
    terrainHeights: input.terrainHeights,
    localX: input.terrainLocalX,
    localY: input.terrainLocalY,
    footprint: input.footprint,
    contouredGround: input.contouredGround,
    modelHeight: PositiveModelHeight.fromBounds(input.model.height),
  });
  if (contoured === positions) return sceneHeight;

  input.model.contourVerticesY = new Int32Array(input.model.usedVertexCount);
  for (let vertex = 0; vertex < input.model.usedVertexCount; vertex++) {
    input.model.contourVerticesY[vertex] = contoured[vertex * 3 + 1] ?? 0;
  }
  input.model.invalidate();
  return sceneHeight;
}

export function mergeStagedLocNormals(staged: readonly StagedStaticLoc[]): void {
  isolateModels(staged);
  const spatialIndex = new Map<string, number[]>();
  for (let index = 0; index < staged.length; index++) {
    const loc = staged[index];
    if (!loc) continue;
    for (let tileX = loc.tileX; tileX < loc.tileX + loc.sizeX; tileX++) {
      for (let tileY = loc.tileY; tileY < loc.tileY + loc.sizeY; tileY++) {
        const key = tileKey(loc.level, tileX, tileY);
        const occupants = spatialIndex.get(key) ?? [];
        occupants.push(index);
        spatialIndex.set(key, occupants);
      }
    }
  }

  const mergedOccurrences = new Set<string>();
  for (let sourceIndex = 0; sourceIndex < staged.length; sourceIndex++) {
    const source = staged[sourceIndex];
    if (!source) continue;
    const sourceHeight = tileCenterHeight(source, source.level, source.tileX, source.tileY);
    const isFloor = source.sourceCategory === 'floor';
    let startX = source.tileX;
    const endX = source.tileX + (isFloor ? 1 : source.sizeX);
    const startY = source.tileY - 1;
    const endY = source.tileY + (isFloor ? 1 : source.sizeY);
    const endLevel = isFloor ? source.level : source.level + 1;
    for (let level = source.level; level <= endLevel; level++) {
      const hideOccludedFaces = level === source.level;
      for (let tileX = startX; tileX <= endX; tileX++) {
        for (let tileY = startY; tileY <= endY; tileY++) {
          const qualifies = isFloor
            ? tileX >= endX || tileY >= endY
            : !hideOccludedFaces || tileX >= endX || tileY >= endY || (tileY < source.tileY && source.tileX !== tileX);
          if (!qualifies) continue;
          const occupants = spatialIndex.get(tileKey(level, tileX, tileY));
          if (!occupants) continue;
          const offsetY = tileCenterHeight(source, level, tileX, tileY) - sourceHeight;
          for (const neighborIndex of occupants) {
            const neighbor = staged[neighborIndex];
            if (!neighbor || neighborIndex === sourceIndex || neighbor.objectIndex === source.objectIndex) continue;
            if (isFloor ? neighbor.sourceCategory !== 'floor' : neighbor.sourceCategory === 'floor') continue;
            const occurrence = `${pairKey(sourceIndex, neighborIndex)}:${level}:${tileX}:${tileY}`;
            if (mergedOccurrences.has(occurrence)) continue;
            mergedOccurrences.add(occurrence);
            mergePair(source, neighbor, offsetY, hideOccludedFaces);
          }
        }
      }
      startX--;
    }
  }

  const compoundParts = new Map<number, number[]>();
  for (let index = 0; index < staged.length; index++) {
    const loc = staged[index];
    if (!loc) continue;
    const parts = compoundParts.get(loc.objectIndex) ?? [];
    parts.push(index);
    compoundParts.set(loc.objectIndex, parts);
  }
  for (const parts of compoundParts.values()) {
    for (let first = 0; first < parts.length; first++) {
      for (let second = first + 1; second < parts.length; second++) {
        const source = staged[parts[first] ?? -1];
        const neighbor = staged[parts[second] ?? -1];
        if (source && neighbor && source.sourceCategory === 'boundary' && neighbor.sourceCategory === 'boundary') {
          mergePair(source, neighbor, 0, false);
        }
      }
    }
  }
}
