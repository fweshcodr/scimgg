import type { Viewport } from './camera';

export interface RasterDimensions {
  width: number;
  height: number;
}

export function getRasterDimensions(viewport: Viewport): RasterDimensions {
  // Floor matches WebGL backing-buffer integer coercion. Clamp to 1 so a
  // hidden or zero-sized viewport never poisons projection math (which
  // divides by these dimensions and computes `viewportZoom = floor(h * fov / 334)`).
  return {
    width: Math.max(1, Math.floor(viewport.width * viewport.dpr)),
    height: Math.max(1, Math.floor(viewport.height * viewport.dpr)),
  };
}

/**
 * The canvas's backing store: the raster at the size the canvas is painted on screen
 * (`Viewport.paintScale`). Projection stays on `getRasterDimensions`: clip space fills whatever
 * backing store it is drawn into, so a stretched store stretches the scene with the canvas, at
 * full resolution, without changing what it frames.
 */
export function getBackingStoreDimensions(viewport: Viewport): RasterDimensions {
  const paint = viewport.paintScale;
  if (!paint) return getRasterDimensions(viewport);
  return {
    width: Math.max(1, Math.floor(viewport.width * viewport.dpr * paint.x)),
    height: Math.max(1, Math.floor(viewport.height * viewport.dpr * paint.y)),
  };
}
