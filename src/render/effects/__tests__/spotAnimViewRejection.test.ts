import { describe, expect, it } from 'vitest';
import type { MeshBounds } from '../../core/meshSource';
import { createProjection3D } from '../../projections/Projection3D';
import { isBoundsOutsideView, writeViewProjection } from '../spotAnimViewRejection';

const IDENTITY = new Float32Array([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]);
/** Clip space equals world space with w = 1, so the side planes are x = ±1 and y = ±1. */
const CLIP_IS_WORLD = new Float64Array(IDENTITY);

const box = (minX: number, maxX: number, minY = -0.5, maxY = 0.5, minZ = -0.5, maxZ = 0.5): MeshBounds => ({
  minX,
  maxX,
  minY,
  maxY,
  minZ,
  maxZ,
});

/** Column-major model: rotate by `angle` about z, scale uniformly, then translate. */
function model(translateX: number, translateY = 0, scale = 1, angle = 0): Float32Array {
  const c = Math.cos(angle) * scale;
  const s = Math.sin(angle) * scale;
  return new Float32Array([c, s, 0, 0, -s, c, 0, 0, 0, 0, scale, 0, translateX, translateY, 0, 1]);
}

describe('writeViewProjection', () => {
  it('multiplies projection by view in column-major order, as the renderer does', () => {
    const view = new Float32Array(16).map((_, index) => (index * 7) % 5);
    const proj = new Float32Array(16).map((_, index) => (index * 3) % 7);
    const out = new Float64Array(16);
    expect(writeViewProjection({ viewMatrix: () => view, projectionMatrix: () => proj }, out)).toBe(true);
    for (let col = 0; col < 4; col++) {
      for (let row = 0; row < 4; row++) {
        let sum = 0;
        for (let k = 0; k < 4; k++) sum += proj[k * 4 + row] * view[col * 4 + k];
        expect(out[col * 4 + row]).toBe(sum);
      }
    }
  });

  it('refuses a non-finite camera', () => {
    const view = new Float32Array(IDENTITY);
    view[12] = Number.NaN;
    expect(
      writeViewProjection({ viewMatrix: () => view, projectionMatrix: () => IDENTITY }, new Float64Array(16)),
    ).toBe(false);
  });
});

describe('isBoundsOutsideView', () => {
  it('rejects bounds wholly past one side plane, on every side', () => {
    expect(isBoundsOutsideView(CLIP_IS_WORLD, model(3), box(-0.5, 0.5))).toBe(true);
    expect(isBoundsOutsideView(CLIP_IS_WORLD, model(-3), box(-0.5, 0.5))).toBe(true);
    expect(isBoundsOutsideView(CLIP_IS_WORLD, model(0, 3), box(-0.5, 0.5))).toBe(true);
    expect(isBoundsOutsideView(CLIP_IS_WORLD, model(0, -3), box(-0.5, 0.5))).toBe(true);
  });

  it('keeps bounds inside, partly inside, or touching the plane', () => {
    expect(isBoundsOutsideView(CLIP_IS_WORLD, model(0), box(-0.5, 0.5))).toBe(false);
    expect(isBoundsOutsideView(CLIP_IS_WORLD, model(1), box(-0.5, 0.5))).toBe(false);
    // The nearest corner exactly on x = w, then just past the margin.
    expect(isBoundsOutsideView(CLIP_IS_WORLD, model(1.5), box(-0.5, 0.5))).toBe(false);
    expect(isBoundsOutsideView(CLIP_IS_WORLD, model(1.51), box(-0.5, 0.5))).toBe(true);
  });

  it('keeps bounds no single side plane excludes, even when they miss the view', () => {
    // Straddling x = w but wholly past y = w: one plane suffices.
    expect(isBoundsOutsideView(CLIP_IS_WORLD, model(0), box(0.5, 3, 1.2, 3))).toBe(true);
    // Covering the whole view.
    expect(isBoundsOutsideView(CLIP_IS_WORLD, model(0), box(-3, 3, -3, 3))).toBe(false);
    // A thin box turned to lie along x + y = 3.2, past the view's top-right corner: it misses the
    // view, but each of the two planes it crosses has a corner in front, so it stays.
    expect(isBoundsOutsideView(CLIP_IS_WORLD, model(1.6, 1.6, 1, -Math.PI / 4), box(-1, 1, -0.05, 0.05))).toBe(false);
  });

  it('places the bounds by the model matrix, rotation and scale included', () => {
    // Unrotated, the box [1.2, 2] lies past x = 1; turned half a circle it lands on [-2, -1.2].
    expect(isBoundsOutsideView(CLIP_IS_WORLD, model(0), box(1.2, 2))).toBe(true);
    expect(isBoundsOutsideView(CLIP_IS_WORLD, model(0, 0, 1, Math.PI), box(1.2, 2))).toBe(true);
    // Turned a quarter, it spans y in [1.2, 2] around x = 0: outside through the top plane.
    expect(isBoundsOutsideView(CLIP_IS_WORLD, model(0, 0, 1, Math.PI / 2), box(1.2, 2, -0.1, 0.1))).toBe(true);
    // Scaled down to [0.6, 1], the same box reaches into the view.
    expect(isBoundsOutsideView(CLIP_IS_WORLD, model(0, 0, 0.5), box(1.2, 2))).toBe(false);
    // Scaled up from the origin, a box that started inside reaches out past the plane, so it stays.
    expect(isBoundsOutsideView(CLIP_IS_WORLD, model(0, 0, 4), box(0.2, 0.6))).toBe(false);
  });

  it('judges in homogeneous coordinates, keeping draws that cross w = 0 unless one side plane excludes them', () => {
    // w = z: the box spans w from -1 to 1, i.e. it crosses the camera plane.
    const wFromZ = new Float64Array([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0]);
    // x <= -3 and w <= 1 everywhere, so x + w < 0: no part of it survives clipping.
    expect(isBoundsOutsideView(wFromZ, model(0), box(-4, -3, -0.5, 0.5, -1, 1))).toBe(true);
    // Wholly behind the camera (w < 0), which only the unused near plane could prove: it stays.
    expect(isBoundsOutsideView(wFromZ, model(0), box(-3, 3, -3, 3, -2, -1))).toBe(false);
  });

  it('keeps a draw with missing or non-finite bounds or placement', () => {
    expect(isBoundsOutsideView(CLIP_IS_WORLD, model(3), null)).toBe(false);
    expect(isBoundsOutsideView(CLIP_IS_WORLD, model(Number.NaN), box(-0.5, 0.5))).toBe(false);
    expect(isBoundsOutsideView(CLIP_IS_WORLD, model(3), box(-0.5, Number.POSITIVE_INFINITY))).toBe(false);
    const nanView = new Float64Array(CLIP_IS_WORLD);
    nanView[15] = Number.NaN;
    expect(isBoundsOutsideView(nanView, model(3), box(-0.5, 0.5))).toBe(false);
  });

  it('rejects against a real portrait camera only what lies beyond its sides', () => {
    // Sol's default camera on a 393 × 852 portrait viewport, looking at tile (30, 30).
    const projection = createProjection3D(
      { width: 393, height: 852, dpr: 3 },
      { pitch: (-181 * 360) / 2048, yaw: 0, targetX: 30.5, targetY: 30.5, targetZ: 0 },
    );
    const viewProjection = new Float64Array(16);
    expect(writeViewProjection(projection, viewProjection)).toBe(true);
    // A tile-sized box (world units: tiles, z up) at the target, beside it, and well off each side.
    const tile = box(-0.6, 0.6, -0.6, 0.6, -0.2, 1);
    const at = (x: number, y: number) => new Float32Array([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, x, y, 0, 1]);
    expect(isBoundsOutsideView(viewProjection, at(30.5, 30.5), tile)).toBe(false);
    expect(isBoundsOutsideView(viewProjection, at(31.5, 30.5), tile)).toBe(false);
    expect(isBoundsOutsideView(viewProjection, at(45, 30.5), tile)).toBe(true);
    expect(isBoundsOutsideView(viewProjection, at(16, 30.5), tile)).toBe(true);
    // Straight ahead of the camera, however far, the portrait view keeps it in its height.
    expect(isBoundsOutsideView(viewProjection, at(30.5, 36), tile)).toBe(false);
  });
});
