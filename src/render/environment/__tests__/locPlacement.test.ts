import { describe, expect, it } from 'vitest';
import {
  buildBoundaryDisplacementIndex,
  buildLocModelMatrix,
  type CardinalRotation,
  LOC_MAP_TYPES,
  type LocMapType,
  type LocModelRequest,
  parseCardinalRotation,
  parseLocMapType,
  resolveBoundaryDisplacement,
  resolveLocPlacement,
  sampleLocTerrainHeight,
} from '../locPlacement';

const ALL_TYPE_REQUESTS = [
  [0, [{ modelType: 0, rotation: 1 }]],
  [1, [{ modelType: 1, rotation: 1 }]],
  [
    2,
    [
      { modelType: 2, rotation: 5 },
      { modelType: 2, rotation: 2 },
    ],
  ],
  [3, [{ modelType: 3, rotation: 1 }]],
  [4, [{ modelType: 4, rotation: 1 }]],
  [5, [{ modelType: 4, rotation: 1 }]],
  [6, [{ modelType: 4, rotation: 5 }]],
  [7, [{ modelType: 4, rotation: 7 }]],
  [
    8,
    [
      { modelType: 4, rotation: 5 },
      { modelType: 4, rotation: 7 },
    ],
  ],
  [9, [{ modelType: 9, rotation: 1 }]],
  [10, [{ modelType: 10, rotation: 1 }]],
  [11, [{ modelType: 10, rotation: 5 }]],
  [12, [{ modelType: 12, rotation: 1 }]],
  [13, [{ modelType: 13, rotation: 1 }]],
  [14, [{ modelType: 14, rotation: 1 }]],
  [15, [{ modelType: 15, rotation: 1 }]],
  [16, [{ modelType: 16, rotation: 1 }]],
  [17, [{ modelType: 17, rotation: 1 }]],
  [18, [{ modelType: 18, rotation: 1 }]],
  [19, [{ modelType: 19, rotation: 1 }]],
  [20, [{ modelType: 20, rotation: 1 }]],
  [21, [{ modelType: 21, rotation: 1 }]],
  [22, [{ modelType: 22, rotation: 1 }]],
] satisfies readonly (readonly [LocMapType, readonly LocModelRequest[]])[];

function placement(type: LocMapType, rotation: CardinalRotation, boundaryDisplacement = 16) {
  return resolveLocPlacement({ type, rotation, sizeX: 5, sizeY: 2, boundaryDisplacement });
}

function makeTerrain(size: number, heightAt: (x: number, y: number) => number): Int32Array[] {
  return Array.from({ length: size }, (_, x) => Int32Array.from({ length: size }, (_, y) => heightAt(x, y)));
}

describe('resolveLocPlacement', () => {
  it('parses only canonical map types and cardinal rotations', () => {
    expect(LOC_MAP_TYPES.map(parseLocMapType)).toEqual(LOC_MAP_TYPES);
    expect(parseLocMapType(23)).toBeNull();
    expect([0, 1, 2, 3].map(parseCardinalRotation)).toEqual([0, 1, 2, 3]);
    expect(parseCardinalRotation(4)).toBeNull();
  });

  it.each(ALL_TYPE_REQUESTS)('maps LOC type %i to its canonical model request', (type, expectedRequests) => {
    const descriptor = placement(type, 1);

    expect(descriptor.modelRequests).toEqual(expectedRequests);
    expect(descriptor.sceneAngle).toBe(0);
  });

  it('uses both canonical extended rotations for compound types at rotation 3', () => {
    expect(placement(2, 3).modelRequests).toEqual([
      { modelType: 2, rotation: 7 },
      { modelType: 2, rotation: 0 },
    ]);
    expect(placement(8, 3).modelRequests).toEqual([
      { modelType: 4, rotation: 7 },
      { modelType: 4, rotation: 5 },
    ]);
  });

  it('separates the rotated terrain footprint from scene anchoring', () => {
    const normal = placement(10, 1);
    const wall = placement(0, 1);

    expect(normal.terrainFootprint).toEqual({ sizeX: 2, sizeY: 5 });
    expect(normal.sceneFootprint).toEqual({ sizeX: 2, sizeY: 5 });
    expect(wall.terrainFootprint).toEqual({ sizeX: 2, sizeY: 5 });
    expect(wall.sceneFootprint).toEqual({ sizeX: 1, sizeY: 1 });
  });

  it.each([
    [0, [16, 0], [8, -8]],
    [1, [0, -16], [-8, -8]],
    [2, [-16, 0], [-8, 8]],
    [3, [0, 16], [8, 8]],
  ] satisfies readonly (readonly [
    CardinalRotation,
    readonly [number, number],
    readonly [number, number],
  ])[])('resolves wall-decoration displacement vectors at rotation %i', (rotation, full, half) => {
    expect(placement(5, rotation).sceneOffset).toEqual({ x: full[0], y: full[1] });
    expect(placement(6, rotation).sceneOffset).toEqual({ x: half[0], y: half[1] });
    expect(placement(8, rotation).sceneOffset).toEqual({ x: half[0], y: half[1] });
  });

  it('truncates half wall displacement with integer division', () => {
    expect(placement(6, 0, 15).sceneOffset).toEqual({ x: 7, y: -7 });
  });
});

describe('boundary displacement index', () => {
  it('pre-indexes boundary types by plane and tile independent of source order', () => {
    const index = buildBoundaryDisplacementIndex([
      { location: { level: 0, localX: 12, localY: 9, type: 5 }, locType: { decorDisplacement: 99 } },
      { location: { level: 1, localX: 12, localY: 9, type: 2 }, locType: { decorDisplacement: 28 } },
      { location: { level: 0, localX: 12, localY: 9, type: 0 }, locType: { decorDisplacement: 20 } },
    ]);

    expect(resolveBoundaryDisplacement(index, { level: 0, localX: 12, localY: 9 })).toBe(20);
    expect(resolveBoundaryDisplacement(index, { level: 1, localX: 12, localY: 9 })).toBe(28);
    expect(resolveBoundaryDisplacement(index, { level: 2, localX: 12, localY: 9 })).toBe(16);
  });
});

describe('sampleLocTerrainHeight', () => {
  const terrain = makeTerrain(8, (x, y) => x * 100 + y * 10);

  it('samples canonical odd and even footprint midpoints', () => {
    expect(
      sampleLocTerrainHeight({
        terrainHeights: terrain,
        localX: 1,
        localY: 1,
        footprint: { sizeX: 5, sizeY: 1 },
      }),
    ).toBe(365);
    expect(
      sampleLocTerrainHeight({
        terrainHeights: terrain,
        localX: 1,
        localY: 1,
        footprint: { sizeX: 2, sizeY: 2 },
      }),
    ).toBe(220);
  });

  it('uses the edge fallback when a footprint crosses the height grid edge', () => {
    expect(
      sampleLocTerrainHeight({
        terrainHeights: terrain,
        localX: 6,
        localY: 6,
        footprint: { sizeX: 2, sizeY: 2 },
      }),
    ).toBe(715);
    expect(
      sampleLocTerrainHeight({
        terrainHeights: null,
        localX: 6,
        localY: 6,
        footprint: { sizeX: 2, sizeY: 2 },
      }),
    ).toBe(0);
  });
});

describe('buildLocModelMatrix', () => {
  it('applies 1x1 and multi-tile scene anchors independently from terrain sampling', () => {
    const terrain = makeTerrain(8, () => -128);
    const wall = buildLocModelMatrix({
      placement: placement(0, 1),
      localX: 10,
      localY: 20,
      terrainLocalX: 1,
      terrainLocalY: 1,
      terrainHeights: terrain,
      animationHeightOffset: 0,
    });
    const normal = buildLocModelMatrix({
      placement: placement(10, 1),
      localX: 10,
      localY: 20,
      terrainLocalX: 1,
      terrainLocalY: 1,
      terrainHeights: terrain,
      animationHeightOffset: 0,
    });
    const decoration = buildLocModelMatrix({
      placement: placement(5, 0, 32),
      localX: 10,
      localY: 20,
      terrainLocalX: 1,
      terrainLocalY: 1,
      terrainHeights: terrain,
      animationHeightOffset: 0,
    });

    expect(Array.from(wall.slice(12, 15))).toEqual([10.5, 20.5, 1]);
    expect(Array.from(normal.slice(12, 15))).toEqual([11, 22.5, 1]);
    expect(Array.from(decoration.slice(12, 15))).toEqual([10.75, 20.5, 1]);
  });

  it('applies OSRS-unit scene offsets, terrain Z, and animation height offset', () => {
    const terrain = makeTerrain(8, () => -256);
    const matrix = buildLocModelMatrix({
      placement: placement(10, 0),
      localX: 10,
      localY: 20,
      terrainLocalX: 1,
      terrainLocalY: 1,
      terrainHeights: terrain,
      animationHeightOffset: 32,
    });

    expect(matrix[0]).toBeCloseTo(1 / 128);
    expect(matrix[1]).toBeCloseTo(0);
    expect(matrix[8]).toBeCloseTo(0);
    expect(matrix[9]).toBeCloseTo(1 / 128);
    expect(Array.from(matrix.slice(12, 15))).toEqual([12.5, 21, 2.25]);
  });
});
