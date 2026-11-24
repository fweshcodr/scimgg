import { describe, expect, it } from 'vitest';
import { ModelData } from '../../../rs/model/ModelData';
import { VERTEX_NORMAL_STRIDE } from '../../../rs/model/VertexNormal';
import { mergeStagedLocNormals, type StagedStaticLoc } from '../staticLocNormals';

type SourceCategory = 'boundary' | 'large' | 'floor';
type ParityStagedLoc = StagedStaticLoc & {
  readonly sourceCategory: SourceCategory;
  readonly terrainHeightPlanes: Int32Array[][];
  readonly mapSquareOffsetX: number;
  readonly mapSquareOffsetY: number;
  readonly terrainContextOriginX: number;
  readonly terrainContextOriginY: number;
};

/** How many normals vertex 0's merged normal sums, or undefined when the model merged none. */
function mergedCount(model: ModelData, vertex = 0): number | undefined {
  return model.mergedNormals?.sums[vertex * VERTEX_NORMAL_STRIDE + 3];
}

function face(): ModelData {
  const model = new ModelData();
  model.verticesCount = 3;
  model.usedVertexCount = 3;
  model.faceCount = 1;
  model.verticesX = new Int32Array([-64, -64, -64]);
  model.verticesY = new Int32Array([0, -128, 0]);
  model.verticesZ = new Int32Array([-64, -64, 64]);
  model.indices1 = new Int32Array([0]);
  model.indices2 = new Int32Array([1]);
  model.indices3 = new Int32Array([2]);
  model.faceColors = new Uint16Array([500]);
  return model;
}

function flatTerrain(): Int32Array[][] {
  return [Array.from({ length: 77 }, () => new Int32Array(77)), Array.from({ length: 77 }, () => new Int32Array(77))];
}

function staged(
  model: ModelData,
  sourceCategory: SourceCategory,
  overrides: Partial<Omit<ParityStagedLoc, 'model' | 'sourceCategory'>> = {},
): ParityStagedLoc {
  return {
    objectIndex: 0,
    partIndex: 0,
    sourceCategory,
    level: 0,
    tileX: 10,
    tileY: 10,
    sizeX: 1,
    sizeY: 1,
    sceneOffsetX: 0,
    sceneOffsetY: 0,
    terrainHeightPlanes: flatTerrain(),
    mapSquareOffsetX: 0,
    mapSquareOffsetY: 0,
    terrainContextOriginX: 0,
    terrainContextOriginY: 0,
    model,
    ...overrides,
  };
}

describe('viewer source-category normal traversal', () => {
  it('does not merge a floor decoration against a boundary wall', () => {
    const floor = face();
    floor.translate(128, 0, 0);
    const wall = face();

    mergeStagedLocNormals([staged(floor, 'floor'), staged(wall, 'boundary', { objectIndex: 1, tileX: 11 })]);

    expect(floor.mergedNormals).toBeUndefined();
  });

  it('does not merge a floor decoration against an upper-level floor', () => {
    const lower = face();
    const upper = face();

    mergeStagedLocNormals([staged(lower, 'floor'), staged(upper, 'floor', { objectIndex: 1, level: 1 })]);

    expect(lower.mergedNormals).toBeUndefined();
  });

  it('merges a boundary wall against an adjacent large LOC', () => {
    const wall = face();
    wall.translate(128, 0, 0);
    const large = face();

    mergeStagedLocNormals([staged(wall, 'boundary'), staged(large, 'large', { objectIndex: 1, tileX: 11 })]);

    expect(mergedCount(wall)).toBe(2);
  });

  it('uses candidate traversal-tile height for a sloped 2xN large LOC', () => {
    const terrain = flatTerrain();
    terrain[0]?.[12]?.fill(32, 10, 12);
    terrain[0]?.[13]?.fill(32, 10, 12);
    const large = face();
    large.translate(192, 32, -64);
    const wall = face();

    mergeStagedLocNormals([
      staged(large, 'large', { sizeX: 2, sizeY: 2, terrainHeightPlanes: terrain }),
      staged(wall, 'boundary', { objectIndex: 1, tileX: 12, terrainHeightPlanes: terrain }),
    ]);

    expect(mergedCount(large)).toBe(2);
  });

  it('repeats a viewer merge when one candidate occupies multiple traversed tiles', () => {
    const wall = face();
    wall.translate(192, 0, 64);
    const large = face();

    mergeStagedLocNormals([
      staged(wall, 'boundary'),
      staged(large, 'large', { objectIndex: 1, tileX: 11, sizeX: 2, sizeY: 2 }),
    ]);

    expect(mergedCount(wall)).toBe(3);
  });
});

describe('staged ModelData ownership', () => {
  it('does not mutate cached render types or inherit cached merged normals', () => {
    const base = face();
    base.faceRenderTypes = new Int8Array([0]);
    base.mergedNormals = { sums: new Int32Array(3 * VERTEX_NORMAL_STRIDE) };
    base.mergedNormals.sums[3] = 7;
    const first = ModelData.copyFrom(base, false, false, false, false);
    first.translate(128, 0, 0);
    const second = ModelData.copyFrom(base, false, false, false, false);

    mergeStagedLocNormals([staged(first, 'boundary'), staged(second, 'boundary', { objectIndex: 1, tileX: 11 })]);

    expect(base.faceRenderTypes[0]).toBe(0);
    expect(first.faceRenderTypes).not.toBe(base.faceRenderTypes);
    expect(second.faceRenderTypes).not.toBe(base.faceRenderTypes);
    expect(mergedCount(base)).toBe(7);
    expect(mergedCount(first)).toBe(2);
  });
});
