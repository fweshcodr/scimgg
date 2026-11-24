import type { Camera3D } from '../core/camera';
import type { MeshBounds } from '../core/meshSource';

/**
 * Whether a spotanim's draw can be left out because nothing of it reaches the viewport.
 *
 * Only the four side planes are tested (`x < -w`, `x > w`, `y < -w`, `y > w` in clip space). The
 * GPU clips in homogeneous coordinates, linearly, so a draw whose every vertex lies strictly outside
 * one side plane has no coverage, whatever the sign of `w`. The scene vertex shaders bias clip `z`
 * (depth and face bias) but never change `x`, `y` or `w`, which is why near and far are never used.
 * Every vertex of a part lies within its bounds, so the bounds' eight corners suffice.
 */

/** `projection × view`, column-major: the matrix `PicoGLRenderer.render` multiplies every model by. */
export function writeViewProjection(
  camera: Pick<Camera3D, 'viewMatrix' | 'projectionMatrix'>,
  out: Float64Array,
): boolean {
  const view = camera.viewMatrix();
  const proj = camera.projectionMatrix();
  for (let col = 0; col < 4; col++) {
    for (let row = 0; row < 4; row++) {
      const value =
        proj[row] * view[col * 4] +
        proj[4 + row] * view[col * 4 + 1] +
        proj[8 + row] * view[col * 4 + 2] +
        proj[12 + row] * view[col * 4 + 3];
      if (!Number.isFinite(value)) return false;
      out[col * 4 + row] = value;
    }
  }
  return true;
}

/**
 * True only when every corner of `bounds` (model space), placed by `model`, lies strictly outside the
 * same side plane of `viewProjection`. The margin absorbs float32 rounding on the GPU; a non-finite
 * corner fails every comparison and so keeps the draw, as do missing bounds.
 */
export function isBoundsOutsideView(
  viewProjection: Float64Array,
  model: Float32Array,
  bounds: MeshBounds | null,
): boolean {
  if (!bounds) return false;
  let left = true;
  let right = true;
  let bottom = true;
  let top = true;
  for (let corner = 0; corner < 8; corner++) {
    const mx = corner & 1 ? bounds.maxX : bounds.minX;
    const my = corner & 2 ? bounds.maxY : bounds.minY;
    const mz = corner & 4 ? bounds.maxZ : bounds.minZ;
    const wx = model[0] * mx + model[4] * my + model[8] * mz + model[12];
    const wy = model[1] * mx + model[5] * my + model[9] * mz + model[13];
    const wz = model[2] * mx + model[6] * my + model[10] * mz + model[14];
    const x = viewProjection[0] * wx + viewProjection[4] * wy + viewProjection[8] * wz + viewProjection[12];
    const y = viewProjection[1] * wx + viewProjection[5] * wy + viewProjection[9] * wz + viewProjection[13];
    const w = viewProjection[3] * wx + viewProjection[7] * wy + viewProjection[11] * wz + viewProjection[15];
    const margin = 1e-4 * (Math.abs(x) + Math.abs(y) + Math.abs(w)) + 1e-6;
    if (!(x + w < -margin)) left = false;
    if (!(w - x < -margin)) right = false;
    if (!(y + w < -margin)) bottom = false;
    if (!(w - y < -margin)) top = false;
    if (!left && !right && !bottom && !top) return false;
  }
  return left || right || bottom || top;
}
