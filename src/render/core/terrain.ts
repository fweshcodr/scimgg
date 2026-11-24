export interface TerrainVertex {
  x: number;
  y: number;
  z: number;
  nx: number;
  ny: number;
  nz: number;
  u: number;
  v: number;
  textureId: number;
  hslColor: number;
  overlayId: number;
}

export interface TerrainMesh {
  vertices: Float32Array;
  vertexCount: number;
  stride: number;
}

export const TILE_SIZE = 128;
export const HALF_TILE_SIZE = TILE_SIZE / 2;
export const QUARTER_TILE_SIZE = TILE_SIZE / 4;
export const THREE_QTR_TILE_SIZE = (TILE_SIZE * 3) / 4;
export const VERTEX_STRIDE = 12;
export const MAX_VERTICES_PER_TILE = 18;
