import { describe, expect, it } from 'vitest';
import type { PrayerFlickWindow } from '../prayerFlick';
import { isPrayerFlickOrbVisible, prayerFlickOrbSweep, prayerFlickTickProgress } from '../prayerFlickOrb';

/** The orb circle this ships against (ORB_CIRCLE_SIZE in minimapOrbGeometry.ts). */
const SIZE = 26;

function window(durationMs: number, startTime = 1_000): PrayerFlickWindow {
  return { tick: 7, startTime, durationMs };
}

describe('prayerFlickOrbSweep — RuneLite PrayerFlickOverlay.java:82-96', () => {
  it('starts at the orb left edge with no line to draw', () => {
    const sweep = prayerFlickOrbSweep(0, SIZE);
    expect(sweep.x).toBe(0);
    expect(sweep.height).toBe(0);
  });

  it('crosses the orb center at mid-tick, spanning the full diameter', () => {
    const sweep = prayerFlickOrbSweep(0.5, SIZE);
    expect(sweep.x).toBe(SIZE / 2);
    expect(sweep.height).toBe(SIZE);
    expect(sweep.y).toBe(0);
  });

  it('finishes at the orb right edge with no line to draw', () => {
    const sweep = prayerFlickOrbSweep(1, SIZE);
    expect(sweep.x).toBe(SIZE);
    expect(sweep.height).toBe(0);
  });

  it('sweeps strictly left to right', () => {
    let previous = -1;
    for (let step = 0; step <= 100; step++) {
      const { x } = prayerFlickOrbSweep(step / 100, SIZE);
      expect(x).toBeGreaterThanOrEqual(previous);
      previous = x;
    }
    expect(previous).toBe(SIZE);
  });

  it('matches RuneLite at the quarter points, chord and all', () => {
    // Hand-worked from PrayerFlickOverlay.java at t = pi/4 on a 26px orb:
    //   x      = (int)(-cos(t) * 26 / 2) + 26 / 2 = -9 + 13 = 4
    //   height = (int)(sin(t) * 26)              = 18
    //   y      = 26 / 2 - 18 / 2                 = 4
    expect(prayerFlickOrbSweep(0.25, SIZE)).toEqual({ x: 4, y: 4, height: 18 });
    expect(prayerFlickOrbSweep(0.75, SIZE)).toEqual({ x: 22, y: 4, height: 18 });
  });

  it('is symmetric about mid-tick, because the orb is a circle', () => {
    for (let step = 0; step <= 50; step++) {
      const early = prayerFlickOrbSweep(step / 100, SIZE);
      const late = prayerFlickOrbSweep(1 - step / 100, SIZE);
      expect(late.x).toBe(SIZE - early.x);
      expect(late.height).toBe(early.height);
      expect(late.y).toBe(early.y);
    }
  });

  it('grows to the full diameter at the center and only there', () => {
    let previous = -1;
    for (let step = 0; step <= 50; step++) {
      const { height } = prayerFlickOrbSweep(step / 100, SIZE);
      expect(height).toBeGreaterThanOrEqual(previous);
      if (step < 50) expect(height).toBeLessThan(SIZE);
      previous = height;
    }
    expect(previous).toBe(SIZE);
  });

  it('keeps the line centered on the orb axis and inside the circle box', () => {
    for (let step = 0; step <= 100; step++) {
      const { y, height } = prayerFlickOrbSweep(step / 100, SIZE);
      expect(y).toBeGreaterThanOrEqual(0);
      expect(y + height).toBeLessThanOrEqual(SIZE);
      // Equal gap top and bottom, allowing the odd-height truncation.
      expect(Math.abs(y - (SIZE - (y + height)))).toBeLessThanOrEqual(1);
    }
  });

  it('uses the size for both axes, so a bigger orb scales in both directions', () => {
    const sweep = prayerFlickOrbSweep(0.5, 52);
    expect(sweep.x).toBe(26);
    expect(sweep.height).toBe(52);
  });
});

describe('prayerFlickTickProgress — RuneLite PrayerPlugin.java:315-321', () => {
  it('is 0 on the tick boundary and 0.5 half a tick later', () => {
    const tickWindow = window(600);
    expect(prayerFlickTickProgress(1_000, tickWindow)).toBe(0);
    expect(prayerFlickTickProgress(1_300, tickWindow)).toBeCloseTo(0.5, 10);
  });

  it('is speed-scaled by the window duration', () => {
    const normal = window(600);
    const doubleSpeed = window(300);
    expect(prayerFlickTickProgress(1_150, normal)).toBeCloseTo(0.25, 10);
    expect(prayerFlickTickProgress(1_150, doubleSpeed)).toBeCloseTo(0.5, 10);

    expect(prayerFlickOrbSweep(prayerFlickTickProgress(1_150, doubleSpeed), SIZE).x).toBe(SIZE / 2);
    expect(prayerFlickOrbSweep(prayerFlickTickProgress(1_150, normal), SIZE).x).toBeLessThan(SIZE / 2);
  });

  it('pins at the end of the tick instead of wrapping, so a stalled clock cannot fake ticks', () => {
    // RuneLite wraps here because its client always has a tick running. A paused,
    // stopped, or replay-scrubbed fight stops publishing windows, and a wrapping
    // sweep would keep crossing the orb as though ticks were still passing.
    expect(prayerFlickTickProgress(1_900, window(600))).toBe(1);
    expect(prayerFlickTickProgress(60_000, window(600))).toBe(1);
  });

  it('draws nothing once pinned, since the chord is zero-height at both ends', () => {
    // Also why a frame or two of overshoot before the next window arrives is
    // visually identical to landing on the boundary exactly.
    expect(prayerFlickOrbSweep(prayerFlickTickProgress(1_900, window(600)), SIZE).height).toBe(0);
  });

  it('reads as the start of the tick before the window opens or without a duration', () => {
    expect(prayerFlickTickProgress(900, window(600))).toBe(0);
    expect(prayerFlickTickProgress(1_300, window(0))).toBe(0);
  });
});

describe('isPrayerFlickOrbVisible — RuneLite PrayerFlickOverlay.java:57-63', () => {
  const base = {
    prayerPluginEnabled: true,
    orbEnabled: true,
    prayersCommitted: false,
    prayersPredicted: false,
    alwaysOn: false,
  };

  it.each([
    { prayersCommitted: true, alwaysOn: true, expected: true },
    { prayersCommitted: true, alwaysOn: false, expected: true },
    { prayersCommitted: false, alwaysOn: true, expected: true },
    { prayersCommitted: false, alwaysOn: false, expected: false },
  ])('prayers $prayersCommitted x alwaysOn $alwaysOn -> $expected', ({ prayersCommitted, alwaysOn, expected }) => {
    expect(isPrayerFlickOrbVisible({ ...base, prayersCommitted, alwaysOn })).toBe(expected);
  });

  it('lights up on the click that turns a prayer on, before the tick commits it', () => {
    expect(isPrayerFlickOrbVisible({ ...base, prayersCommitted: false, prayersPredicted: true })).toBe(true);
  });

  it('stays lit through a flick, where the prediction dips but the prayer never goes out', () => {
    // A flick is an off-click and an on-click inside ONE tick. Between the two,
    // the client prediction reads "no prayer" while the engine still has it
    // burning for the rest of the tick — the sweep must not blink there.
    expect(isPrayerFlickOrbVisible({ ...base, prayersCommitted: true, prayersPredicted: false })).toBe(true);
  });

  it('hides only once BOTH the committed and predicted states are empty', () => {
    expect(isPrayerFlickOrbVisible({ ...base, prayersCommitted: false, prayersPredicted: false })).toBe(false);
  });

  it('stays hidden when the Prayer plugin is off, whatever the other settings say', () => {
    expect(
      isPrayerFlickOrbVisible({ ...base, prayerPluginEnabled: false, prayersCommitted: true, alwaysOn: true }),
    ).toBe(false);
  });

  it('stays hidden when the flick-helper setting is off, whatever the state', () => {
    expect(isPrayerFlickOrbVisible({ ...base, orbEnabled: false, prayersCommitted: true, alwaysOn: true })).toBe(false);
  });
});
