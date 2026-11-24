import { HALF_TILE_SIZE, QUARTER_TILE_SIZE, THREE_QTR_TILE_SIZE, TILE_SIZE } from './terrain';

export type TileCornerHeights = readonly [southwest: number, southeast: number, northeast: number, northwest: number];

type TileSurfaceVertex = {
  readonly x: number;
  readonly y: number;
  readonly height: number;
  readonly cornerA: number;
  readonly cornerB: number;
};

type TileSurfaceFace = {
  readonly isOverlay: boolean;
  readonly a: number;
  readonly b: number;
  readonly c: number;
};

export type ClassicTileSurface = {
  readonly vertices: readonly TileSurfaceVertex[];
  readonly faces: readonly TileSurfaceFace[];
};

const TILE_SHAPE_VERTEX_INDICES = [
  [1, 3, 5, 7],
  [1, 3, 5, 7],
  [1, 3, 5, 7],
  [1, 3, 5, 7, 6],
  [1, 3, 5, 7, 6],
  [1, 3, 5, 7, 6],
  [1, 3, 5, 7, 6],
  [1, 3, 5, 7, 2, 6],
  [1, 3, 5, 7, 2, 8],
  [1, 3, 5, 7, 2, 8],
  [1, 3, 5, 7, 11, 12],
  [1, 3, 5, 7, 11, 12],
  [1, 3, 5, 7, 13, 14],
] as const;

const TILE_SHAPE_FACES = [
  [0, 1, 2, 3, 0, 0, 1, 3],
  [1, 1, 2, 3, 1, 0, 1, 3],
  [0, 1, 2, 3, 1, 0, 1, 3],
  [0, 0, 1, 2, 0, 0, 2, 4, 1, 0, 4, 3],
  [0, 0, 1, 4, 0, 0, 4, 3, 1, 1, 2, 4],
  [0, 0, 4, 3, 1, 0, 1, 2, 1, 0, 2, 4],
  [0, 1, 2, 4, 1, 0, 1, 4, 1, 0, 4, 3],
  [0, 4, 1, 2, 0, 4, 2, 5, 1, 0, 4, 5, 1, 0, 5, 3],
  [0, 4, 1, 2, 0, 4, 2, 3, 0, 4, 3, 5, 1, 0, 4, 5],
  [0, 0, 4, 5, 1, 4, 1, 2, 1, 4, 2, 3, 1, 4, 3, 5],
  [0, 0, 1, 5, 0, 1, 4, 5, 0, 1, 2, 4, 1, 0, 5, 3, 1, 5, 4, 3, 1, 4, 2, 3],
  [1, 0, 1, 5, 1, 1, 4, 5, 1, 1, 2, 4, 0, 0, 5, 3, 0, 5, 4, 3, 0, 4, 2, 3],
  [1, 0, 5, 4, 1, 0, 1, 5, 0, 0, 4, 3, 0, 4, 5, 3, 0, 5, 2, 3, 0, 1, 2, 5],
] as const;

const VERTEX_SAMPLES = [
  [0, 0, 0, 0],
  [HALF_TILE_SIZE, 0, 1, 0],
  [TILE_SIZE, 0, 1, 1],
  [TILE_SIZE, HALF_TILE_SIZE, 1, 2],
  [TILE_SIZE, TILE_SIZE, 2, 2],
  [HALF_TILE_SIZE, TILE_SIZE, 3, 2],
  [0, TILE_SIZE, 3, 3],
  [0, HALF_TILE_SIZE, 3, 0],
  [HALF_TILE_SIZE, QUARTER_TILE_SIZE, 1, 0],
  [THREE_QTR_TILE_SIZE, HALF_TILE_SIZE, 1, 2],
  [HALF_TILE_SIZE, THREE_QTR_TILE_SIZE, 3, 2],
  [QUARTER_TILE_SIZE, HALF_TILE_SIZE, 3, 0],
  [QUARTER_TILE_SIZE, QUARTER_TILE_SIZE, 0, 0],
  [THREE_QTR_TILE_SIZE, QUARTER_TILE_SIZE, 1, 1],
  [THREE_QTR_TILE_SIZE, THREE_QTR_TILE_SIZE, 2, 2],
  [QUARTER_TILE_SIZE, THREE_QTR_TILE_SIZE, 3, 3],
] as const;

export function createClassicTileSurface(
  shape: number,
  rotation: number,
  heights: TileCornerHeights,
): ClassicTileSurface {
  const vertices = TILE_SHAPE_VERTEX_INDICES[shape].map((code) => {
    let rotatedCode: number = code;
    if ((code & 1) === 0 && code <= 8) rotatedCode = ((code - rotation * 2 - 1) & 7) + 1;
    if (code > 8 && code <= 12) rotatedCode = ((code - 9 - rotation) & 3) + 9;
    if (code > 12) rotatedCode = ((code - 13 - rotation) & 3) + 13;
    const [x, y, cornerA, cornerB] = VERTEX_SAMPLES[rotatedCode - 1];
    const height = cornerA === cornerB ? heights[cornerA] : (heights[cornerA] + heights[cornerB]) >> 1;
    return { x, y, height, cornerA, cornerB };
  });
  const faceIndices = TILE_SHAPE_FACES[shape];
  const faces: TileSurfaceFace[] = [];
  for (let index = 0; index < faceIndices.length; index += 4) {
    const cornerA = faceIndices[index + 1];
    const cornerB = faceIndices[index + 2];
    const cornerC = faceIndices[index + 3];
    faces.push({
      isOverlay: faceIndices[index] === 1,
      a: cornerA < 4 ? (cornerA - rotation) & 3 : cornerA,
      b: cornerB < 4 ? (cornerB - rotation) & 3 : cornerB,
      c: cornerC < 4 ? (cornerC - rotation) & 3 : cornerC,
    });
  }
  return { vertices, faces };
}

export function sampleClassicTileSurface(surface: ClassicTileSurface, x: number, y: number): number | undefined {
  for (const face of surface.faces) {
    const first = surface.vertices[face.a];
    const second = surface.vertices[face.b];
    const third = surface.vertices[face.c];
    const denominator = (second.y - third.y) * (first.x - third.x) + (third.x - second.x) * (first.y - third.y);
    const numeratorA = (second.y - third.y) * (x - third.x) + (third.x - second.x) * (y - third.y);
    const numeratorB = (third.y - first.y) * (x - third.x) + (first.x - third.x) * (y - third.y);
    const numeratorC = denominator - numeratorA - numeratorB;
    if (
      denominator < 0
        ? numeratorA > 0 || numeratorB > 0 || numeratorC > 0
        : numeratorA < 0 || numeratorB < 0 || numeratorC < 0
    )
      continue;
    const weightA = Math.fround(numeratorA / denominator);
    const weightB = Math.fround(numeratorB / denominator);
    const weightC = Math.fround(Math.fround(1 - weightA) - weightB);
    const height = Math.fround(
      Math.fround(Math.fround(weightA * first.height) + Math.fround(weightB * second.height)) +
        Math.fround(weightC * third.height),
    );
    return height | 0;
  }
  return undefined;
}
