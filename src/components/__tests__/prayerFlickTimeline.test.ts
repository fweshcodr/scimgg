import { beforeEach, describe, expect, it, vi } from 'vitest';
import { buildPrayerFlickTimeline, PRAYER_FLICK_BARS } from '../prayerFlick';
import { PrayerFlickTimelineStore } from '../prayerFlickTimeline';

const START = 10_000;
const TICK_MS = 600;

describe('PrayerFlickTimelineStore', () => {
  let store: PrayerFlickTimelineStore;

  beforeEach(() => {
    store = new PrayerFlickTimelineStore();
  });

  it('starts with no tick window and no clicks', () => {
    expect(store.getSnapshot()).toEqual({ window: null, clicks: [] });
  });

  it('returns a stable snapshot reference between reads (useSyncExternalStore-safe)', () => {
    store.recordTickWindow(10, START, TICK_MS);
    store.recordClick('on', START + 150, START + 300);

    expect(store.getSnapshot()).toBe(store.getSnapshot());
  });

  it('notifies subscribers when a tick window or a click lands', () => {
    const listener = vi.fn();
    store.subscribe(listener);

    store.recordTickWindow(10, START, TICK_MS);
    store.recordClick('off', START + 150, START + 300);

    expect(listener).toHaveBeenCalledTimes(2);
    expect(store.getSnapshot().window).toEqual({ tick: 10, startTime: START, durationMs: TICK_MS });
  });

  it('stops notifying an unsubscribed listener', () => {
    const listener = vi.fn();
    const unsubscribe = store.subscribe(listener);

    unsubscribe();
    store.recordTickWindow(10, START, TICK_MS);

    expect(listener).not.toHaveBeenCalled();
  });

  it('gives each click a distinct id so both halves of a slip can be paired', () => {
    store.recordClick('on', START, START);
    store.recordClick('off', START + 50, START + 50);

    expect(store.getSnapshot().clicks.map((click) => click.id)).toEqual([1, 2]);
  });

  it('never lets an arrival precede the click that produced it', () => {
    store.recordClick('on', START, START - 100);

    expect(store.getSnapshot().clicks[0]?.arrivalTime).toBe(START);
  });

  it('drops clicks that scrolled past the visible bars once a later tick lands', () => {
    store.recordTickWindow(10, START, TICK_MS);
    store.recordClick('on', START + 150, START + 150);

    store.recordTickWindow(10 + PRAYER_FLICK_BARS, START + TICK_MS * PRAYER_FLICK_BARS, TICK_MS);

    expect(store.getSnapshot().clicks).toEqual([]);
  });

  it('keeps the real starts of the ticks behind, so a late tick does not shift a click into the wrong bar', () => {
    store.recordTickWindow(1, 600, TICK_MS);
    store.recordClick('on', 700, 700);
    store.recordTickWindow(2, 1400, TICK_MS);

    const { window, clicks } = store.getSnapshot();
    expect(window?.previousStartTimes).toEqual([600]);
    expect(clicks).toHaveLength(1);
    const bars = buildPrayerFlickTimeline(clicks, window);
    expect(bars.bars.map((bar) => [bar.tick, bar.marks.length])).toEqual([
      [2, 0],
      [1, 1],
      [0, 0],
    ]);
    expect(bars.bars[1]?.marks[0]?.clickFraction).toBe(100 / 800);
  });

  it('keeps tick starts across a speed change, and only for as many ticks as are drawn', () => {
    for (const [tick, startTime] of [
      [1, 600],
      [2, 1200],
      [3, 1500],
      [4, 1800],
      [5, 2100],
    ] as const)
      store.recordTickWindow(tick, startTime, tick <= 2 ? TICK_MS : TICK_MS / 2);

    expect(store.getSnapshot().window).toEqual({
      tick: 5,
      startTime: 2100,
      durationMs: TICK_MS / 2,
      previousStartTimes: [1800, 1500, 1200].slice(0, PRAYER_FLICK_BARS),
    });
  });

  it('starts the history over when the tick numbers jump', () => {
    store.recordTickWindow(10, START, TICK_MS);
    store.recordTickWindow(1, START + 5000, TICK_MS);

    expect(store.getSnapshot().window?.previousStartTimes).toBeUndefined();
  });

  it('clears everything on reset', () => {
    const listener = vi.fn();
    store.recordTickWindow(10, START, TICK_MS);
    store.recordClick('on', START + 150, START + 300);
    store.subscribe(listener);

    store.reset();

    expect(store.getSnapshot()).toEqual({ window: null, clicks: [] });
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it('does not notify when resetting an already empty store', () => {
    const listener = vi.fn();
    store.subscribe(listener);

    store.reset();

    expect(listener).not.toHaveBeenCalled();
  });
});
