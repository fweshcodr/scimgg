// @vitest-environment happy-dom

import { act, render } from '@testing-library/react';
import { StrictMode } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { DisplayTimelineProvider } from '../../contexts/DisplayTimelineContext';
import { ReplayFrameProvider } from '../../contexts/ReplayFrameContext';
import { TickProgressProvider } from '../../contexts/TickProgressContext';
import type { ReplayDisplayFrame } from '../../core/ReplayRecorder';
import { ReplayFrameStore } from '../../core/replayFrameStore';
import { SimulationEngine } from '../../core/SimulationEngine';
import { TickProgressStore } from '../../core/tickProgressStore';
import { encounterRegistry } from '../../encounters/registry';
import { OSRS_TICK_MS } from '../../types/simulation';
import { ORB_CIRCLE_SIZE } from '../minimapOrbGeometry';
import { PrayerOrbFlickSweep } from '../PrayerOrbFlickSweep';

/**
 * The sweep's math lives in prayerFlickOrb.ts and its visibility gate in
 * MinimapOrbs. What is checked here is the wiring to the displayed timeline:
 * that it draws before the first paint, that it tracks the displayed clock
 * rather than wall time, and above all that it does no DOM work on a clock
 * write the line has not moved on. That last one is the whole reason this is
 * affordable — the clock writes at display rate for as long as a prayer is
 * burning, which in a real fight is the entire fight.
 */
const INITIAL_STATE = new SimulationEngine({ encounter: encounterRegistry.create('yama_p3') }).getState();
const HALF = ORB_CIRCLE_SIZE / 2;
const MID_SWEEP = `translate(${HALF}px, 0px) scaleY(1)`;
const HIDDEN = 'translate(0px, 0px) scaleY(0)';
/** Progress 0: the zero-height chord at the left edge. */
const TICK_START = `translate(0px, ${HALF}px) scaleY(0)`;

const frame = (currentTick: number): ReplayDisplayFrame => ({
  state: { ...INITIAL_STATE, currentTick },
  events: [],
});

interface MountOptions {
  /** Clock value written before the sweep mounts, so the first draw has something to show. */
  readonly clockAtMount?: number;
  readonly replaying?: boolean;
  readonly strict?: boolean;
}

function mount({ clockAtMount, replaying = false, strict = false }: MountOptions = {}) {
  const ticks = new TickProgressStore();
  const replayStore = new ReplayFrameStore();
  const history = [frame(0), frame(1), frame(2)];
  if (clockAtMount !== undefined) ticks.set(clockAtMount);

  // Subscriptions counted at the store boundary: the facade attaches to its
  // stores for the first consumer and detaches after the last one leaves, so a
  // live subscription here is a live consumer.
  const attached = vi.fn();
  const detached = vi.fn();
  const subscribeTicks = ticks.subscribe;
  vi.spyOn(ticks, 'subscribe').mockImplementation((listener) => {
    attached();
    const detach = subscribeTicks(listener);
    return () => {
      detached();
      detach();
    };
  });

  const tree = (
    <ReplayFrameProvider store={replayStore}>
      <TickProgressProvider store={ticks}>
        <DisplayTimelineProvider history={history} state={history[1].state} replaying={replaying}>
          <PrayerOrbFlickSweep />
        </DisplayTimelineProvider>
      </TickProgressProvider>
    </ReplayFrameProvider>
  );
  const view = render(strict ? <StrictMode>{tree}</StrictMode> : tree);
  const line = view.container.querySelector('span');
  if (line === null) throw new Error('Missing sweep line');

  // Inline transform writes go through the style attribute, so observing it
  // counts actual DOM writes rather than the values they happened to carry.
  const observer = new MutationObserver(() => {});
  observer.observe(line, { attributes: true, attributeFilter: ['style'] });

  return {
    line,
    history,
    replayStore,
    writes: () => observer.takeRecords().length,
    liveSubscriptions: () => attached.mock.calls.length - detached.mock.calls.length,
    /** Write the render loop's interpolated tick, as it does once per frame. */
    clock: (interpolatedTick: number) => act(() => ticks.set(interpolatedTick)),
    rerender: () => view.rerender(strict ? <StrictMode>{tree}</StrictMode> : tree),
    unmount: view.unmount,
  };
}

function sweepX(line: HTMLElement): number {
  return Number(/translate\((-?\d+)px/.exec(line.style.transform)?.[1] ?? Number.NaN);
}

describe('PrayerOrbFlickSweep', () => {
  it('draws the line in place on mount, not one clock write later', () => {
    const { line } = mount({ clockAtMount: 1.5 });

    // Mid-tick, with no clock write having happened since mounting: the chord is
    // at the orb center, spanning the full diameter. `useLayoutEffect` is what
    // puts this before the browser's first paint; what is locked here is that it
    // does not wait for the clock to move to draw anything at all.
    expect(line.style.transform).toBe(MID_SWEEP);
  });

  it('follows the displayed clock across the orb', () => {
    const { line, clock } = mount();
    const xAt = (interpolatedTick: number): number => {
      clock(interpolatedTick);
      return sweepX(line);
    };

    expect(xAt(1.25)).toBeLessThan(HALF);
    expect(xAt(1.5)).toBe(HALF);
    expect(xAt(1.75)).toBeGreaterThan(HALF);
  });

  it('skips the DOM write on a clock write that lands on the pixel the last one drew', () => {
    const { writes, clock } = mount();
    writes();

    // A write that moves the line writes once...
    clock(1 + 182 / OSRS_TICK_MS);
    expect(writes()).toBe(1);

    // ...and the next one 8ms later - a 120Hz display's frame interval - lands on
    // the same whole pixel, so it must not write at all. The sweep is truncated to
    // whole pixels, and the faster the display the more of its extra frames have
    // nothing new to show.
    clock(1 + 190 / OSRS_TICK_MS);
    expect(writes()).toBe(0);
  });

  it('holds mid-tick with no DOM work while the clock is held, instead of running on to the tick end', () => {
    // A paused, finished, or scrubbed fight stops writing the clock. The line
    // stays exactly where the last write left it — this is a timing instrument,
    // and a line that keeps crossing the orb on wall time would be lying — and
    // rewrites of the held value, or re-renders of the tree above it, touch
    // nothing.
    const { line, writes, clock, rerender } = mount();
    clock(1.5);
    writes();

    clock(1.5);
    clock(1.5);
    act(() => rerender());
    expect(writes()).toBe(0);
    expect(line.style.transform).toBe(MID_SWEEP);
  });

  it('shows a zero-height chord, never a fresh sweep, when the clock overshoots the committed tick', () => {
    // The live render loop clamps its interpolation at one tick, and the facade
    // clamps a stale clock the same way. Either reads as the end of the tick (a
    // zero-height chord), never as a sweep of a tick that has not begun.
    const { line, clock } = mount();

    clock(1 + 599 / OSRS_TICK_MS);
    const nearEnd = line.style.transform;
    clock(7);
    expect(nearEnd).toMatch(/scaleY\(0\)$/);
    expect(line.style.transform).toMatch(/scaleY\(0\)$/);
  });

  it('derives its progress from the replay playhead while replaying', () => {
    const { line, history, replayStore } = mount({ replaying: true });
    act(() => replayStore.setHistory(history));

    act(() => replayStore.set(OSRS_TICK_MS * 1.5, undefined));
    expect(line.style.transform).toBe(MID_SWEEP);

    // A scrub preview shows the previewed frame at its start.
    act(() => replayStore.setPreview({ frameIndex: 0, state: history[0].state, events: [] }));
    expect(line.style.transform).toBe(TICK_START);
  });

  it('draws nothing while a replay has no published history', () => {
    const { line, writes, clock } = mount({ replaying: true, clockAtMount: 1.5 });
    expect(line.style.transform).toBe(HIDDEN);

    writes();
    clock(1.75);
    expect(writes()).toBe(0);
  });

  it('draws nothing, and holds no subscription, outside a display timeline', () => {
    const { container, unmount } = render(<PrayerOrbFlickSweep />);
    const line = container.querySelector('span');

    expect(line?.style.transform).toBe(HIDDEN);
    expect(() => unmount()).not.toThrow();
  });

  it('detaches the subscription it actually holds when unmounted', () => {
    const { liveSubscriptions, clock, unmount } = mount();
    // Several clock writes deep, so a cleanup releasing anything but the live
    // subscription would leave the loop running.
    clock(1.2);
    clock(1.4);
    expect(liveSubscriptions()).toBe(1);

    unmount();
    expect(liveSubscriptions()).toBe(0);
  });

  it('holds one subscription, not two, under StrictMode double-invocation', () => {
    const { liveSubscriptions, line, clock, unmount } = mount({ strict: true });

    // React mounts, tears down, and remounts the effect in StrictMode. A
    // subscription that survived the first cleanup would draw twice per clock
    // write for the life of the sweep.
    expect(liveSubscriptions()).toBe(1);
    clock(1.5);
    expect(line.style.transform).toBe(MID_SWEEP);
    expect(liveSubscriptions()).toBe(1);

    unmount();
    expect(liveSubscriptions()).toBe(0);
  });
});
