import { afterEach, describe, expect, it, vi } from 'vitest';
import { BackgroundClock } from '../BackgroundClock';

afterEach(() => vi.restoreAllMocks());

describe('BackgroundClock', () => {
  it('maps historical timestamps across repeated pauses without losing the pre-pause fraction', () => {
    const clock = new BackgroundClock();
    const now = vi.spyOn(performance, 'now').mockReturnValue(450);
    clock.setSuspended(true);
    now.mockReturnValue(60_450);
    expect(clock.now()).toBe(450);
    clock.setSuspended(false);
    now.mockReturnValue(60_500);
    clock.setSuspended(true);
    now.mockReturnValue(180_500);
    clock.setSuspended(false);

    const timestamps = [400, 450, 30_000, 60_450, 60_475, 60_500, 120_000, 180_500, 180_600];
    expect(timestamps.map((timestamp) => clock.now(timestamp))).toEqual([400, 450, 450, 450, 475, 500, 500, 500, 600]);
  });

  it('ignores duplicate policy notifications and resets when its session ends', () => {
    const clock = new BackgroundClock();
    const now = vi.spyOn(performance, 'now').mockReturnValue(450);
    clock.setSuspended(false);
    clock.setSuspended(true);
    now.mockReturnValue(1000);
    clock.setSuspended(true);
    now.mockReturnValue(60_450);
    clock.setSuspended(false);
    now.mockReturnValue(60_500);
    clock.setSuspended(false);
    expect(clock.now()).toBe(500);

    clock.reset();
    expect(clock.now()).toBe(60_500);
  });
});
