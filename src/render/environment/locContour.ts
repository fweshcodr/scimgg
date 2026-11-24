import type { PositiveModelHeight } from '../../rs/config/loctype/LocModelLoader';
import { getTerrainHeight } from '../shared/renderUtils';
import { type LocFootprint, sampleLocTerrainHeight } from './locPlacement';

export type ContourLocPositionsInput = {
  readonly positions: Float32Array;
  readonly terrainHeights: Int32Array[] | null;
  readonly localX: number;
  readonly localY: number;
  readonly footprint: LocFootprint;
  readonly contouredGround: number;
  readonly modelHeight: PositiveModelHeight;
};

export function contourLocPositions(input: ContourLocPositionsInput): Float32Array {
  if (!input.terrainHeights) return input.positions;

  const sceneHeight = sampleLocTerrainHeight({
    terrainHeights: input.terrainHeights,
    localX: input.localX,
    localY: input.localY,
    footprint: input.footprint,
  });
  const h1 = getTerrainHeight(input.terrainHeights, input.localX, input.localY);
  const h2 = getTerrainHeight(input.terrainHeights, input.localX + input.footprint.sizeX, input.localY);
  const h3 = getTerrainHeight(
    input.terrainHeights,
    input.localX + input.footprint.sizeX,
    input.localY + input.footprint.sizeY,
  );
  const h4 = getTerrainHeight(input.terrainHeights, input.localX, input.localY + input.footprint.sizeY);
  if (sceneHeight === h1 && sceneHeight === h2 && sceneHeight === h3 && sceneHeight === h4) {
    return input.positions;
  }

  const xOffset = input.localX * 128 + input.footprint.sizeX * 64;
  const zOffset = input.localY * 128 + input.footprint.sizeY * 64;
  const contoured = new Float32Array(input.positions);
  const vertexCount = (contoured.length / 3) | 0;

  for (let vertex = 0; vertex < vertexCount; vertex++) {
    const index = vertex * 3;
    const originalX = input.positions[index] ?? 0;
    const originalY = input.positions[index + 1] ?? 0;
    const originalZ = input.positions[index + 2] ?? 0;
    const yRatio = ((originalY << 16) / -input.modelHeight.value) | 0;
    if (input.contouredGround > 0 && yRatio >= input.contouredGround) continue;

    const worldX = xOffset + originalX;
    const worldZ = zOffset + originalZ;
    const tileX = worldX >> 7;
    const tileZ = worldZ >> 7;
    const fractionX = worldX & 127;
    const fractionZ = worldZ & 127;
    const southHeight =
      (getTerrainHeight(input.terrainHeights, tileX, tileZ) * (128 - fractionX) +
        getTerrainHeight(input.terrainHeights, tileX + 1, tileZ) * fractionX) >>
      7;
    const northHeight =
      (getTerrainHeight(input.terrainHeights, tileX, tileZ + 1) * (128 - fractionX) +
        getTerrainHeight(input.terrainHeights, tileX + 1, tileZ + 1) * fractionX) >>
      7;
    const terrainHeight = (southHeight * (128 - fractionZ) + northHeight * fractionZ) >> 7;

    contoured[index + 1] =
      input.contouredGround === 0
        ? originalY + terrainHeight - sceneHeight
        : (originalY + ((terrainHeight - sceneHeight) * (input.contouredGround - yRatio)) / input.contouredGround) | 0;
  }

  return contoured;
}
