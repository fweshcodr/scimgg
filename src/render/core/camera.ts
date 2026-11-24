import type { TileCoord, Vec2, Vec3 } from './types';

export interface Viewport {
  width: number;
  height: number;
  dpr: number;
  /**
   * Viewport height in the CLIENT's own pixels, when that differs from `height`.
   *
   * Only the world-space camera distance uses it. A fixed client drawn at 2x is
   * the same 765x503 client magnified, not a taller viewport showing more world
   * — but its CSS height is 668, which pushes the 256->320 camera-size blend to
   * its far end and moves the camera 25% further out purely because the UI got
   * bigger. Defaults to `height`, which is right for the resizable layouts.
   */
  logicalHeight?: number;
  /**
   * How much larger than `width` x `height` the canvas is drawn on screen, per axis: Fixed's
   * Stretch to Window stretches the laid-out frame with a CSS transform. Only the backing store
   * follows it (`getBackingStoreDimensions`), so the stretched scene stays sharp; projection keeps
   * the layout raster, so framing and aspect do not change. Defaults to 1 x 1.
   */
  paintScale?: { readonly x: number; readonly y: number };
}

export interface Projection2D {
  tileToScreen(tile: TileCoord): Vec2 | null;
  tileDeltaToScreen(delta: Vec2): Vec2 | null;
  screenToTile(screenPx: Vec2): TileCoord | null;
  tilePolygonScreen(tile: TileCoord): Vec2[];
}

export interface Camera3D {
  viewport: Viewport;
  viewMatrix(): Float32Array;
  projectionMatrix(): Float32Array;
  tileToWorld(tile: TileCoord): Vec3;
}

export type Camera = { kind: '2d'; projection: Projection2D; viewport: Viewport } | { kind: '3d'; camera: Camera3D };

export function createCamera2D(projection: Projection2D, viewport: Viewport): Camera {
  return { kind: '2d', projection, viewport };
}

export function createCamera3D(camera: Camera3D): Camera {
  return { kind: '3d', camera };
}
