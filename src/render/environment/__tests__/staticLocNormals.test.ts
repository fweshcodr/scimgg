import { describe, expect, it } from 'vitest';
import { ModelData } from '../../../rs/model/ModelData';
import { VERTEX_NORMAL_STRIDE } from '../../../rs/model/VertexNormal';
import { contourStaticLocModel, mergeStagedLocNormals, type StagedStaticLoc } from '../staticLocNormals';

/** How many normals vertex 0's merged normal sums, or undefined when the model merged none. */
function mergedCount(model: ModelData, vertex = 0): number | undefined {
  return model.mergedNormals?.sums[vertex * VERTEX_NORMAL_STRIDE + 3];
}

function triangle(vertices: readonly (readonly [number, number, number])[]): ModelData {
  const model = new ModelData();
  model.verticesCount = vertices.length;
  model.usedVertexCount = vertices.length;
  model.faceCount = 1;
  model.verticesX = Int32Array.from(vertices.map(([x]) => x));
  model.verticesY = Int32Array.from(vertices.map(([, y]) => y));
  model.verticesZ = Int32Array.from(vertices.map(([, , z]) => z));
  model.indices1 = new Int32Array([0]);
  model.indices2 = new Int32Array([1]);
  model.indices3 = new Int32Array([2]);
  model.faceColors = new Uint16Array([500]);
  return model;
}

function staged(model: ModelData, overrides: Partial<Omit<StagedStaticLoc, 'model'>> = {}): StagedStaticLoc {
  const terrain = [
    Array.from({ length: 77 }, () => new Int32Array(77)),
    Array.from({ length: 77 }, () => new Int32Array(77)),
  ];
  return {
    objectIndex: 0,
    partIndex: 0,
    sourceCategory: 'boundary',
    level: 0,
    tileX: 10,
    tileY: 10,
    sizeX: 1,
    sizeY: 1,
    sceneOffsetX: 0,
    sceneOffsetY: 0,
    terrainHeightPlanes: terrain,
    mapSquareOffsetX: 0,
    mapSquareOffsetY: 0,
    terrainContextOriginX: 0,
    terrainContextOriginY: 0,
    model,
    ...overrides,
  };
}

function exactFace(): ModelData {
  return triangle([
    [-64, 0, -64],
    [-64, -128, -64],
    [-64, 0, 64],
  ]);
}

describe('static LOC normal staging', () => {
  it('blends shared vertex normals for adjacent same-level models before lighting', () => {
    const west = triangle([
      [64, 0, -64],
      [64, -128, -64],
      [64, 0, 64],
    ]);
    const east = triangle([
      [-64, 0, -64],
      [-64, 0, 64],
      [0, -128, -64],
    ]);

    mergeStagedLocNormals([staged(west), staged(east, { objectIndex: 1, tileX: 11 })]);

    expect(mergedCount(west)).toBe(2);
    expect(mergedCount(east)).toBe(2);
  });

  it('hides exact coincident shared faces on the viewer same-level pass', () => {
    const west = exactFace();
    west.translate(128, 0, 0);
    const east = exactFace();

    mergeStagedLocNormals([staged(west), staged(east, { objectIndex: 1, tileX: 11 })]);

    expect(west.faceRenderTypes?.[0]).toBe(2);
    expect(east.faceRenderTypes?.[0]).toBe(2);
  });

  it('does not hide exact coincident faces during next-level smoothing', () => {
    const lower = exactFace();
    const upper = exactFace();

    mergeStagedLocNormals([staged(lower), staged(upper, { objectIndex: 1, level: 1 })]);

    expect(mergedCount(lower)).toBe(2);
    expect(lower.faceRenderTypes?.[0] ?? 0).toBe(0);
    expect(upper.faceRenderTypes?.[0] ?? 0).toBe(0);
  });

  it('merges compound wall halves at one tile without hiding either face', () => {
    const first = exactFace();
    const second = exactFace();

    mergeStagedLocNormals([staged(first), staged(second, { partIndex: 1 })]);

    expect(mergedCount(first)).toBe(2);
    expect(first.faceRenderTypes?.[0] ?? 0).toBe(0);
    expect(second.faceRenderTypes?.[0] ?? 0).toBe(0);
  });

  it('uses traversal-tile height deltas when matching vertices on adjacent terrain', () => {
    const west = exactFace();
    west.translate(128, 32, 0);
    const east = exactFace();
    const terrain = [Array.from({ length: 77 }, () => new Int32Array(77))];
    terrain[0]?.[12]?.fill(64, 10, 12);

    mergeStagedLocNormals([
      staged(west, { terrainHeightPlanes: terrain }),
      staged(east, { objectIndex: 1, tileX: 11, terrainHeightPlanes: terrain }),
    ]);

    expect(mergedCount(west)).toBe(2);
  });
});

describe('static LOC ModelData contouring', () => {
  it('uses neighbor midpoint and contour samples for a boundary-crossing footprint', () => {
    const model = triangle([
      [-128, 0, -128],
      [128, 0, -128],
      [-128, -128, 128],
    ]);
    const terrain = Array.from({ length: 77 }, () => new Int32Array(77));
    terrain[70][68] = 256;
    terrain[70][69] = 256;

    const sceneHeight = contourStaticLocModel({
      model,
      terrainHeights: terrain,
      terrainLocalX: 69,
      terrainLocalY: 68,
      footprint: { sizeX: 2, sizeY: 1 },
      contouredGround: 0,
    });

    expect(sceneHeight).toBe(256);
    expect(model.contourVerticesY).toBeDefined();
    expect(Array.from(model.contourVerticesY ?? [])).not.toEqual(Array.from(model.verticesY));
  });
});
