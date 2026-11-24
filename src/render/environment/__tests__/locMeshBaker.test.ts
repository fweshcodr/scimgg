import { describe, expect, it } from 'vitest';
import { type LocMeshData, PositiveModelHeight } from '../../../rs/config/loctype/LocModelLoader';
import { bakeLocFrameGeometry, placeLocFrameGeometry } from '../locMeshBaker';
import { buildLocModelMatrix, type LocFootprint, resolveLocPlacement } from '../locPlacement';

function makeTerrainHeights(): Int32Array[] {
  const heights: Int32Array[] = [];
  for (let x = 0; x <= 64; x++) {
    heights[x] = new Int32Array(65);
  }
  const column = heights[10];
  const eastColumn = heights[11];
  if (column && eastColumn) {
    column[10] = 0;
    eastColumn[10] = 128;
    column[11] = 256;
    eastColumn[11] = 384;
  }
  return heights;
}

function makeMixedFrame(): LocMeshData {
  return {
    mesh: {
      positions: new Float32Array([-64, 0, -64, 64, 0, -64, -64, 0, 64, -64, 0, -64, 64, 0, -64, 64, 0, 64]),
      normals: new Float32Array([0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0]),
    },
    hslColors: new Float32Array([101, 102, 103, 201, 202, 203]),
    alphas: new Float32Array([1, 1, 1, 0.25, 0.25, 0.25]),
    faceBias: new Float32Array([3, 3, 3, 9, 9, 9]),
    hasTransparency: true,
    modelHeight: PositiveModelHeight.fromBounds(128),
  };
}

function makeContourFrame(positions: readonly [number, number, number], modelHeight: number): LocMeshData {
  return {
    mesh: {
      positions: new Float32Array([...positions, ...positions, ...positions]),
      normals: new Float32Array([0, 1, 0, 0, 1, 0, 0, 1, 0]),
    },
    hslColors: new Float32Array([100, 100, 100]),
    alphas: new Float32Array([1, 1, 1]),
    hasTransparency: false,
    modelHeight: PositiveModelHeight.fromBounds(modelHeight),
  };
}

function setTerrainHeight(terrainHeights: Int32Array[], x: number, y: number, height: number): void {
  const column = terrainHeights[x];
  if (column) column[y] = height;
}

function bakeContourFrame(
  frame: LocMeshData,
  terrainHeights: Int32Array[],
  sizeX: number,
  sizeY: number,
  contouredGround: number,
): Float32Array {
  const placement = resolveLocPlacement({ type: 10, rotation: 0, sizeX, sizeY, boundaryDisplacement: 16 });
  const frames = bakeLocFrameGeometry({
    frames: [frame],
    locKey: 'contour-fixture',
    contour: contourAt(10, 10, terrainHeights, placement.terrainFootprint, contouredGround),
  });
  return frames[0]?.[0]?.positions ?? new Float32Array();
}

function contourAt(
  terrainLocalX: number,
  terrainLocalY: number,
  terrainHeights: Int32Array[],
  footprint: LocFootprint,
  contouredGround: number,
) {
  return { terrainHeights, terrainLocalX, terrainLocalY, footprint, contouredGround };
}

const PLACEMENT = resolveLocPlacement({ type: 10, rotation: 0, sizeX: 1, sizeY: 1, boundaryDisplacement: 16 });

function matrixAt(localX: number, localY: number): Float32Array {
  return buildLocModelMatrix({
    placement: PLACEMENT,
    localX,
    localY,
    terrainLocalX: localX,
    terrainLocalY: localY,
    terrainHeights: null,
    animationHeightOffset: 0,
  });
}

describe('bakeLocFrameGeometry', () => {
  it('splits opaque and transparent parts with their render fields, and placement adds matrix, zIndex and bias', () => {
    const geometry = bakeLocFrameGeometry({
      frames: [makeMixedFrame()],
      locKey: 'loc-test',
      contour: contourAt(10, 10, makeTerrainHeights(), PLACEMENT.terrainFootprint, 0),
    });
    const modelMatrix = matrixAt(10, 10);
    const frames = placeLocFrameGeometry(geometry, { modelMatrix, zIndex: 1, depthBias: 0.00001 });

    expect(frames).toHaveLength(1);
    const [opaque, transparent] = frames[0] ?? [];
    expect(opaque?.meshId).toBe('loc-test-frame-0-opaque');
    expect(transparent?.meshId).toBe('loc-test-frame-0-transparent');
    expect(Array.from(opaque?.positions ?? [])).toEqual([-64, -192, -64, 64, -64, -64, -64, 64, 64]);
    expect(Array.from(opaque?.perVertexFaceBias ?? [])).toEqual([3, 3, 3]);
    expect(Array.from(transparent?.perVertexFaceBias ?? [])).toEqual([9, 9, 9]);
    expect(opaque?.cullFace).toBe('back');
    expect(transparent?.cullFace).toBe('back');
    expect(transparent?.depth).toBe('read');
    expect(transparent?.blend).toBe('normal');
    for (const command of [opaque, transparent]) {
      expect(command?.modelMatrix).toBe(modelMatrix);
      expect(command?.zIndex).toBe(1);
      expect(command?.depthBias).toBe(0.00001);
    }
  });

  it('places one un-contoured bake at several placements without copying its arrays', () => {
    const geometry = bakeLocFrameGeometry({ frames: [makeMixedFrame()], locKey: 'shared' });
    const left = placeLocFrameGeometry(geometry, { modelMatrix: matrixAt(10, 10), zIndex: 1 });
    const right = placeLocFrameGeometry(geometry, { modelMatrix: matrixAt(12, 10), zIndex: 1 });

    expect(left[0]?.[0]?.positions).toBe(right[0]?.[0]?.positions);
    expect(left[0]?.[0]?.positions).toBe(geometry[0]?.[0]?.positions);
    expect(left[0]?.[0]?.meshId).toBe('shared-frame-0-opaque');
    expect(left[0]?.[0]?.depthBias).toBeUndefined();
    expect(left[0]?.[0]?.modelMatrix[12]).toBe(10.5);
    expect(right[0]?.[0]?.modelMatrix[12]).toBe(12.5);
  });

  it('contours type 1 when uneven terrain has a zero midpoint average', () => {
    const terrainHeights = makeTerrainHeights();
    setTerrainHeight(terrainHeights, 10, 10, -128);
    setTerrainHeight(terrainHeights, 11, 10, 128);
    setTerrainHeight(terrainHeights, 10, 11, -128);
    setTerrainHeight(terrainHeights, 11, 11, 128);

    const positions = bakeContourFrame(makeContourFrame([-64, 0, -64], 128), terrainHeights, 1, 1, 0);

    expect(positions[1]).toBe(-128);
  });

  it('uses model vertical height for type 2 independently of absolute terrain height', () => {
    const terrainA = makeTerrainHeights();
    const terrainB = makeTerrainHeights();
    for (let x = 0; x < terrainA.length; x++) {
      const columnA = terrainA[x];
      const columnB = terrainB[x];
      if (columnA && columnB) {
        for (let y = 0; y < columnA.length; y++) columnB[y] = columnA[y] + 128;
      }
    }
    const frame = makeContourFrame([-64, -64, -64], 128);

    const positionsA = bakeContourFrame(frame, terrainA, 1, 1, 49152);
    const positionsB = bakeContourFrame(frame, terrainB, 1, 1, 49152);

    expect(positionsA[1]).toBe(-128);
    expect(positionsB[1]).toBe(-128);
  });

  it('subtracts the canonical footprint midpoint rather than the outer-corner average', () => {
    const terrainHeights = makeTerrainHeights();
    setTerrainHeight(terrainHeights, 10, 10, 0);
    setTerrainHeight(terrainHeights, 12, 10, 0);
    setTerrainHeight(terrainHeights, 10, 12, 0);
    setTerrainHeight(terrainHeights, 12, 12, 0);
    setTerrainHeight(terrainHeights, 11, 11, 256);

    const positions = bakeContourFrame(makeContourFrame([-128, 0, -128], 128), terrainHeights, 2, 2, 0);

    expect(positions[1]).toBe(-256);
  });
});
