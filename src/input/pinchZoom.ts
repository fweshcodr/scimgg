/**
 * Pinch zoom as the zoom value's own scale: `zoomToLensStrength` doubles the lens every 256, so
 * spreading the fingers twice as far apart doubles what is on screen, from any starting zoom.
 * The zoom Speed setting (`cameraZoomIncrement`, the wheel's step) scales it, its default 25 being
 * one doubling per doubled spread.
 */
const ZOOM_PER_DOUBLING = 256;
const DEFAULT_ZOOM_INCREMENT = 25;

/** The zoom change for fingers `spread` times as far apart as when the pinch began (>1 = apart). */
export function pinchZoomDelta(spread: number, zoomIncrement: number): number {
  return Math.log2(spread) * ZOOM_PER_DOUBLING * (zoomIncrement / DEFAULT_ZOOM_INCREMENT);
}
