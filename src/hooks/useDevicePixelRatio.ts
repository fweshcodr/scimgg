import { useEffect, useState } from 'react';

/**
 * Ceiling on the backing-buffer density used for WebGL/canvas surfaces.
 *
 * Rendering at the display's true density is what makes edges resolve instead
 * of arriving pre-blurred from a browser upscale, but the pixel count grows
 * with the square of the ratio. 2 is the point where the returns flatten on
 * desktop, and it matches the ceiling `ModelPreview` and `useEffectViewport`
 * already apply to their own surfaces.
 */
export const MAX_DEVICE_PIXEL_RATIO = 2;

export function clampDevicePixelRatio(raw: number, maxRatio: number = MAX_DEVICE_PIXEL_RATIO): number {
  if (!Number.isFinite(raw) || raw <= 0) return 1;
  return Math.min(raw, maxRatio);
}

function readRawDevicePixelRatio(): number {
  if (typeof window === 'undefined') return 1;
  return window.devicePixelRatio || 1;
}

/**
 * Clamped `window.devicePixelRatio`, kept current when the window moves to a
 * monitor with a different pixel density. The `(resolution: Ndppx)` query
 * stops matching the moment the ratio changes, which is the only reliable
 * change notification the platform offers.
 *
 * The raw ratio drives the media query while the clamped one is returned, so a
 * 3x display still gets a query that can fire. Pass `Infinity` for surfaces
 * where exact density matters more than pixel count (sprite resampling).
 */
export function useDevicePixelRatio(maxRatio: number = MAX_DEVICE_PIXEL_RATIO): number {
  const [rawDpr, setRawDpr] = useState<number>(readRawDevicePixelRatio);

  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return;
    const query = window.matchMedia(`(resolution: ${rawDpr}dppx)`);
    const onChange = () => setRawDpr(readRawDevicePixelRatio());
    query.addEventListener('change', onChange);
    return () => query.removeEventListener('change', onChange);
  }, [rawDpr]);

  return clampDevicePixelRatio(rawDpr, maxRatio);
}
