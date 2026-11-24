const MODEL_SCALE = 1 / 128;

export interface GroundItemMatrixInput {
  readonly position: readonly [number, number];
  readonly terrainHeight: number;
}

/**
 * The canonical OSRS model matrix, anchored at the CENTER of the tile.
 *
 * Every model in a pile shares this transform with no visual separation; RuneLite's
 * `ItemLayer` likewise carries one location for the whole pile.
 */
export function buildGroundItemModelMatrix(input: GroundItemMatrixInput): Float32Array {
  return new Float32Array([
    MODEL_SCALE,
    0,
    0,
    0,
    0,
    0,
    -MODEL_SCALE,
    0,
    0,
    MODEL_SCALE,
    0,
    0,
    input.position[0] + 0.5,
    input.position[1] + 0.5,
    input.terrainHeight,
    1,
  ]);
}
