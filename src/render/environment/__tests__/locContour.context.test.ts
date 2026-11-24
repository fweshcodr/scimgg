import { describe, expect, it } from 'vitest';
import { PositiveModelHeight } from '../../../rs/config/loctype/LocModelLoader';
import { getTerrainHeight } from '../../shared/renderUtils';
import { contourLocPositions } from '../locContour';

function contourAt(vertexX: number, vertexZ: number, targetX: number, targetY: number, targetHeight: number): number {
  const terrain = Array.from({ length: 77 }, () => new Int32Array(77));
  terrain[64][64] = 640;
  terrain[69][69] = 0;
  terrain[targetX][targetY] = targetHeight;
  const positions = new Float32Array([vertexX, 0, vertexZ, vertexX, 0, vertexZ, vertexX, -128, vertexZ]);

  const contoured = contourLocPositions({
    positions,
    terrainHeights: terrain,
    localX: 69,
    localY: 69,
    footprint: { sizeX: 1, sizeY: 1 },
    contouredGround: 0,
    modelHeight: PositiveModelHeight.fromBounds(128),
  });

  return contoured[1] ?? 0;
}

describe('LOC contour terrain-context bounds', () => {
  it('preserves 65x65 edge clamping', () => {
    const terrain = Array.from({ length: 65 }, () => new Int32Array(65));
    terrain[64][64] = 640;

    expect(getTerrainHeight(terrain, 70, 70)).toBe(640);
  });

  it('samples the east neighbor at context index 70 instead of square edge 64', () => {
    expect(contourAt(64, -64, 70, 69, 400)).toBe(300);
  });

  it('samples the north neighbor at context index 70 instead of square edge 64', () => {
    expect(contourAt(-64, 64, 69, 70, 800)).toBe(600);
  });

  it('samples the diagonal neighbor at context indices 70,70', () => {
    expect(contourAt(64, 64, 70, 70, 1200)).toBe(900);
  });
});
