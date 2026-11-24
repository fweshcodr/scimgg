import { describe, expect, it } from 'vitest';
import { osrsSoundVolume } from '../attenuation';

const LISTENER = [30, 30] as const;

describe('osrsSoundVolume', () => {
  it.each([
    // One tile is forgiven before falloff, so a source 5 east is distance 4 — the inner radius.
    { what: 'inside the inner radius', source: [35, 30], volume: 1 },
    { what: 'partway down the falloff', source: [38, 30], volume: (10 - 7) / (10 - 4) },
    { what: 'one tile inside the cutoff', source: [40, 30], volume: (10 - 9) / (10 - 4) },
    { what: 'exactly at the outer range', source: [41, 30], volume: 0 },
    { what: 'beyond the outer range', source: [50, 30], volume: 0 },
  ])('is $what', ({ source, volume }) => {
    expect(osrsSoundVolume(source as unknown as [number, number], LISTENER, 10, 5)).toBeCloseTo(volume, 10);
  });

  it('measures distance as manhattan, not euclidean', () => {
    expect(osrsSoundVolume([35, 35], LISTENER, 10, 0)).toBeCloseTo((10 - 9) / 10, 10);
    expect(osrsSoundVolume([36, 36], LISTENER, 10, 0)).toBe(0);
  });

  it('defaults to a zero inner radius, which is what area sounds carry', () => {
    expect(osrsSoundVolume([35, 30], LISTENER, 10)).toBeCloseTo((10 - 4) / 10, 10);
    expect(osrsSoundVolume([35, 30], LISTENER, 10, 0)).toBeCloseTo((10 - 4) / 10, 10);
  });

  it('ignores the high bits of retain, which are not part of the inner radius', () => {
    // retain 37 is inner 4 (37 & 31 = 5, minus one), NOT 36.
    expect(osrsSoundVolume([30, 30], LISTENER, 10, 37)).toBe(1);
    expect(osrsSoundVolume([36, 30], LISTENER, 10, 37)).toBeCloseTo((10 - 5) / (10 - 4), 10);
  });

  it('stays at full volume when the inner radius reaches the outer one', () => {
    expect(osrsSoundVolume([38, 30], LISTENER, 10, 31)).toBe(1);
    expect(osrsSoundVolume([41, 30], LISTENER, 10, 31)).toBe(0);
  });

  it('is full volume on the listener tile and never leaves 0..1', () => {
    for (const range of [1, 5, 10, 20]) {
      expect(osrsSoundVolume(LISTENER, LISTENER, range)).toBe(1);
      for (let d = 0; d <= range + 2; d++) {
        const v = osrsSoundVolume([30 + d, 30], LISTENER, range);
        expect(v).toBeGreaterThanOrEqual(0);
        expect(v).toBeLessThanOrEqual(1);
      }
    }
  });
});
