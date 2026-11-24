import { describe, expect, it } from 'vitest';
import {
  buildPrayerFlickTimeline,
  locatePrayerFlickTime,
  PRAYER_FLICK_BARS,
  type PrayerFlickClick,
  type PrayerFlickInputKind,
  type PrayerFlickWindow,
  prunePrayerFlickClicks,
} from '../prayerFlick';

/** Wall-clock origin of the running tick. Arbitrary; only offsets from it matter. */
const START = 10_000;
/** One tick at 1x speed. */
const TICK_MS = 600;
const CURRENT_TICK = 100;

function tickWindow(overrides: Partial<PrayerFlickWindow> = {}): PrayerFlickWindow {
  return { tick: CURRENT_TICK, startTime: START, durationMs: TICK_MS, ...overrides };
}

function click(
  id: number,
  clickOffset: number,
  arrivalOffset: number = clickOffset,
  kind: PrayerFlickInputKind = 'on',
): PrayerFlickClick {
  return { id, kind, clickTime: START + clickOffset, arrivalTime: START + arrivalOffset };
}

describe('locatePrayerFlickTime', () => {
  it('reads a time inside the window as a fraction of the tick', () => {
    expect(locatePrayerFlickTime(START + 150, tickWindow())).toEqual({ tick: CURRENT_TICK, fraction: 0.25 });
  });

  it('carries a time past the boundary onto the next tick', () => {
    expect(locatePrayerFlickTime(START + 750, tickWindow())).toEqual({ tick: CURRENT_TICK + 1, fraction: 0.25 });
  });

  it('reads a time before the window as the tail of an earlier tick', () => {
    expect(locatePrayerFlickTime(START - 150, tickWindow())).toEqual({ tick: CURRENT_TICK - 1, fraction: 0.75 });
  });

  it('measures in fractions of a tick, not milliseconds, when the sim runs at 2x', () => {
    const fast = tickWindow({ durationMs: TICK_MS / 2 });

    expect(locatePrayerFlickTime(START + 150, fast)).toEqual({ tick: CURRENT_TICK, fraction: 0.5 });
    expect(locatePrayerFlickTime(START + 375, fast)).toEqual({ tick: CURRENT_TICK + 1, fraction: 0.25 });
  });

  it('places earlier times by the real starts of the ticks behind, not by equal steps', () => {
    // Tick 1 ran at 600 and tick 2 ran late, at 1400: tick 1 lasted 800 ms.
    const late = { tick: 2, startTime: 1400, durationMs: TICK_MS, previousStartTimes: [600] };

    expect(locatePrayerFlickTime(700, late)).toEqual({ tick: 1, fraction: 100 / 800 });
    expect(locatePrayerFlickTime(1399, late)).toEqual({ tick: 1, fraction: 799 / 800 });
    // The running tick has not finished, so it and anything after are measured in whole ticks.
    expect(locatePrayerFlickTime(1700, late)).toEqual({ tick: 2, fraction: 0.5 });
    expect(locatePrayerFlickTime(2150, late)).toEqual({ tick: 3, fraction: 0.25 });
    // Before the oldest start known: whole ticks back from it.
    expect(locatePrayerFlickTime(300, late)).toEqual({ tick: 0, fraction: 0.5 });
  });

  it('keeps a tick its real length across a speed change', () => {
    // Ticks 1 and 2 at 1x, then 2x: tick 3 ran at 1500 and lasts 300 ms.
    const sped = { tick: 3, startTime: 1500, durationMs: TICK_MS / 2, previousStartTimes: [1200, 600] };

    expect(locatePrayerFlickTime(1000, sped)).toEqual({ tick: 1, fraction: 400 / 600 });
    expect(locatePrayerFlickTime(1350, sped)).toEqual({ tick: 2, fraction: 0.5 });
    expect(locatePrayerFlickTime(1575, sped)).toEqual({ tick: 3, fraction: 0.25 });
  });

  it('pins to the start of the window when the tick length is degenerate', () => {
    expect(locatePrayerFlickTime(START + 150, tickWindow({ durationMs: 0 }))).toEqual({
      tick: CURRENT_TICK,
      fraction: 0,
    });
  });
});

describe('buildPrayerFlickTimeline', () => {
  it('stacks the running tick first and the ticks behind it below', () => {
    const timeline = buildPrayerFlickTimeline([], tickWindow());

    const expectedTicks = Array.from({ length: PRAYER_FLICK_BARS }, (_, index) => 100 - index);
    expect(timeline.bars.map((bar) => bar.tick)).toEqual(expectedTicks);
    expect(timeline.bars.map((bar) => bar.current)).toEqual(expectedTicks.map((_, index) => index === 0));
    expect(timeline.durationMs).toBe(TICK_MS);
  });

  it('holds the bar stack before the first tick window arrives', () => {
    const timeline = buildPrayerFlickTimeline([click(1, 0)], null);

    expect(timeline.bars).toHaveLength(PRAYER_FLICK_BARS);
    expect(timeline.bars.every((bar) => bar.marks.length === 0)).toBe(true);
    expect(timeline).toMatchObject({ durationMs: 0, clickCount: 0, slippedCount: 0 });
  });

  it('draws every click made inside one tick, in the order they were made', () => {
    const timeline = buildPrayerFlickTimeline([click(1, 75), click(2, 300), click(3, 525)], tickWindow());

    expect(timeline.bars[0]?.marks.map((mark) => mark.clickFraction)).toEqual([0.125, 0.5, 0.875]);
    expect(timeline.clickCount).toBe(3);
    expect(timeline.slippedCount).toBe(0);
  });

  it('pairs a click with its arrival on one bar when the lag stays inside the tick', () => {
    const timeline = buildPrayerFlickTimeline([click(1, 150, 300)], tickWindow());

    expect(timeline.bars[0]?.marks).toEqual([
      { id: 1, kind: 'on', clickFraction: 0.25, arrivalFraction: 0.5, slipped: false },
    ]);
    expect(timeline.slippedCount).toBe(0);
  });

  it('splits a click from its arrival when the lag crosses the tick boundary', () => {
    // Clicked 450ms into the previous tick, arrived 150ms into the running one.
    const timeline = buildPrayerFlickTimeline([click(1, -150, 150)], tickWindow());

    expect(timeline.bars[1]?.marks).toEqual([
      { id: 1, kind: 'on', clickFraction: 0.75, arrivalFraction: null, slipped: true },
    ]);
    expect(timeline.bars[0]?.marks).toEqual([
      { id: 1, kind: 'on', clickFraction: null, arrivalFraction: 0.25, slipped: true },
    ]);
    expect(timeline).toMatchObject({ clickCount: 1, slippedCount: 1 });
  });

  it('counts a boundary-crossing click once, not once per half', () => {
    const timeline = buildPrayerFlickTimeline([click(1, -150, 150), click(2, 300)], tickWindow());

    expect(timeline).toMatchObject({ clickCount: 2, slippedCount: 1 });
  });

  it('draws a click whose arrival has not landed yet', () => {
    // Arrival falls in tick 101, which has no bar until that tick starts.
    const timeline = buildPrayerFlickTimeline([click(1, 450, 750)], tickWindow());

    expect(timeline.bars[0]?.marks).toEqual([
      { id: 1, kind: 'on', clickFraction: 0.75, arrivalFraction: null, slipped: true },
    ]);
  });

  it('keeps prayer-off clicks apart from prayer-on clicks', () => {
    const timeline = buildPrayerFlickTimeline([click(1, 150, 150, 'on'), click(2, 300, 300, 'off')], tickWindow());

    expect(timeline.bars[0]?.marks.map((mark) => mark.kind)).toEqual(['on', 'off']);
  });

  it('leaves out clicks older than the oldest bar', () => {
    const timeline = buildPrayerFlickTimeline([click(1, -TICK_MS * PRAYER_FLICK_BARS)], tickWindow());

    expect(timeline.bars.every((bar) => bar.marks.length === 0)).toBe(true);
    expect(timeline.clickCount).toBe(0);
  });

  it('places clicks by tick fraction, and slips them, when the sim runs at 2x', () => {
    // 300ms ticks. Clicked 225ms in (0.75), arrived 150ms later, past the boundary.
    const fast = tickWindow({ durationMs: TICK_MS / 2 });
    const clicks = [click(1, 225, 375)];

    const onClickTick = buildPrayerFlickTimeline(clicks, fast);
    const afterBoundary = buildPrayerFlickTimeline(clicks, {
      tick: CURRENT_TICK + 1,
      startTime: START + TICK_MS / 2,
      durationMs: TICK_MS / 2,
    });

    expect(onClickTick.durationMs).toBe(300);
    expect(onClickTick.bars[0]?.marks).toEqual([
      { id: 1, kind: 'on', clickFraction: 0.75, arrivalFraction: null, slipped: true },
    ]);
    expect(afterBoundary.bars[0]?.marks).toEqual([
      { id: 1, kind: 'on', clickFraction: null, arrivalFraction: 0.25, slipped: true },
    ]);
    expect(afterBoundary.bars[1]?.marks).toEqual([
      { id: 1, kind: 'on', clickFraction: 0.75, arrivalFraction: null, slipped: true },
    ]);
  });
});

describe('prunePrayerFlickClicks', () => {
  it('returns the same reference when nothing has expired', () => {
    const clicks = [click(1, 150), click(2, 300)];

    expect(prunePrayerFlickClicks(clicks, tickWindow())).toBe(clicks);
  });

  it('keeps a click whose own bar has scrolled off but whose arrival is still drawn', () => {
    // Clicked at the end of the tick before the oldest bar, arrived on it.
    const carried = click(1, -TICK_MS * PRAYER_FLICK_BARS + 150, -TICK_MS * (PRAYER_FLICK_BARS - 1) + 150);

    expect(prunePrayerFlickClicks([carried], tickWindow())).toEqual([carried]);
  });

  it('drops clicks that have scrolled off entirely', () => {
    const stale = click(1, -TICK_MS * (PRAYER_FLICK_BARS + 1));
    const live = click(2, 150);

    expect(prunePrayerFlickClicks([stale, live], tickWindow())).toEqual([live]);
  });

  it('caps the list by count while no tick window has been published', () => {
    const clicks = Array.from({ length: 70 }, (_, index) => click(index + 1, index));

    const pruned = prunePrayerFlickClicks(clicks, null);

    expect(pruned).toHaveLength(64);
    expect(pruned[pruned.length - 1]?.id).toBe(70);
  });
});
