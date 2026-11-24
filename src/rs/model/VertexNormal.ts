/**
 * Smooth vertex normals as summed face normals, four entries per vertex: `x, y, z`, then how many
 * face normals were summed (its "magnitude"). Lighting divides by that count, so the sums
 * must stay exact. Every face normal component lies in [-256, 256], so a sum's components never
 * exceed 256 × its count: an Int32Array holds them exactly while the count stays at most
 * {@link MAX_INT32_NORMAL_COUNT}, and a Float64Array, like the JS numbers it replaces, beyond that.
 */
export type VertexNormalSums = Int32Array | Float64Array;

export const VERTEX_NORMAL_STRIDE = 4;

/** Largest summed count whose components (at most 256 each per summed normal) fit an Int32. */
export const MAX_INT32_NORMAL_COUNT = Math.floor(0x7fffffff / 256);

/** Zeroed sums for `vertexCount` vertices whose counts will not exceed `maxCount`. */
export function allocateVertexNormalSums(vertexCount: number, maxCount: number): VertexNormalSums {
  const length = vertexCount * VERTEX_NORMAL_STRIDE;
  return maxCount <= MAX_INT32_NORMAL_COUNT ? new Int32Array(length) : new Float64Array(length);
}

/**
 * Writes vertex `vertex`'s normal scaled to unit length into `out` at `offset`, or `(0, 1, 0)` when
 * the model has no normal for it. A zero or NaN magnitude divides by 1, so a degenerate normal is
 * written unscaled.
 */
export function writeUnitNormal(
  normals: VertexNormalSums | undefined,
  vertex: number,
  out: Float32Array | Float64Array,
  offset: number,
): void {
  const at = vertex * VERTEX_NORMAL_STRIDE;
  if (normals && at >= 0 && at < normals.length) {
    const x = normals[at];
    const y = normals[at + 1];
    const z = normals[at + 2];
    const magnitude = Math.sqrt(x * x + y * y + z * z) || 1;
    out[offset] = x / magnitude;
    out[offset + 1] = y / magnitude;
    out[offset + 2] = z / magnitude;
  } else {
    out[offset] = 0;
    out[offset + 1] = 1;
    out[offset + 2] = 0;
  }
}
