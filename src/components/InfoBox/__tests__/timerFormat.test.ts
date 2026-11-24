import { describe, expect, it } from 'vitest';
import { formatSecondsClock, formatTicksToClock, ticksToWholeSeconds } from '../timerFormat';

describe('ticksToWholeSeconds', () => {
  it('ceils, so a timer never reads 0:00 while time remains', () => {
    expect(ticksToWholeSeconds(1)).toBe(1);
    expect(ticksToWholeSeconds(0.1)).toBe(1);
    expect(ticksToWholeSeconds(0)).toBe(0);
  });

  it('clamps negatives to zero', () => {
    expect(ticksToWholeSeconds(-3)).toBe(0);
  });

  it('converts whole ticks at 0.6s each', () => {
    expect(ticksToWholeSeconds(10)).toBe(6);
    expect(ticksToWholeSeconds(100)).toBe(60);
  });

  it('holds every displayed second for exactly one second of simulation time', () => {
    const runs: { value: number; durationMs: number }[] = [];
    let current: number | null = null;
    let runStartMs = 0;

    for (let ms = 0; ms <= 6000; ms += 10) {
      const remainingTicks = (6000 - ms) / 1000 / 0.6;
      const value = ticksToWholeSeconds(remainingTicks);
      if (value !== current) {
        if (current !== null) runs.push({ value: current, durationMs: ms - runStartMs });
        current = value;
        runStartMs = ms;
      }
    }

    expect(runs.map((r) => r.value)).toEqual([6, 5, 4, 3, 2, 1]);
    for (const run of runs) {
      expect(run.durationMs).toBe(1000);
    }
  });
});

describe('formatSecondsClock', () => {
  it('formats as M:SS', () => {
    expect(formatSecondsClock(0)).toBe('0:00');
    expect(formatSecondsClock(6)).toBe('0:06');
    expect(formatSecondsClock(59)).toBe('0:59');
    expect(formatSecondsClock(60)).toBe('1:00');
    expect(formatSecondsClock(200)).toBe('3:20');
  });

  it('clamps negatives', () => {
    expect(formatSecondsClock(-5)).toBe('0:00');
  });
});

describe('formatTicksToClock', () => {
  it('is the un-interpolated fallback used by tooltips', () => {
    expect(formatTicksToClock(10)).toBe('0:06');
    expect(formatTicksToClock(1)).toBe('0:01');
    expect(formatTicksToClock(0)).toBe('0:00');
  });
});
