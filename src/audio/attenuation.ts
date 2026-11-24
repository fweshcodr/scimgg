import type { Coordinate } from '../types/simulation';

/**
 * Linear Manhattan-distance attenuation with one tile forgiven. `range` is the per-sound
 * outer radius and `retain` the full-volume inner radius; area sounds use retain 0. The curve
 * is unsourced and unmeasured, so do not replace it with Euclidean distance without evidence.
 */
export function osrsSoundVolume(
  source: Readonly<Coordinate>,
  listener: Readonly<Coordinate>,
  range: number,
  retain = 0,
): number {
  const distance = Math.max(Math.abs(source[0] - listener[0]) + Math.abs(source[1] - listener[1]) - 1, 0);
  if (distance >= range) return 0;

  const inner = Math.max((retain & 31) - 1, 0);
  if (inner >= range) return 1;

  return Math.min(Math.max((range - distance) / (range - inner), 0), 1);
}
