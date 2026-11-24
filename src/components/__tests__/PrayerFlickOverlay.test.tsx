// @vitest-environment happy-dom

import { act, render } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import { PrayerFlickOverlay } from '../PrayerFlickOverlay';
import { PRAYER_FLICK_BARS } from '../prayerFlick';
import { prayerFlickTimeline } from '../prayerFlickTimeline';
import { TooltipProvider } from '../Tooltip';

const START = 10_000;
const TICK_MS = 600;
const FIRST_TICK = 100;

function renderOverlay(enabled = true) {
  // DraggablePanel reads the live UI scale from TooltipContext.
  return render(<PrayerFlickOverlay enabled={enabled} />, { wrapper: TooltipProvider });
}

/** Publish a tick window the way the real-time tick loop does. */
function startTick(tick: number, startTime: number, durationMs = TICK_MS) {
  act(() => prayerFlickTimeline.recordTickWindow(tick, startTime, durationMs));
}

/**
 * Default `inputLagMs` is 0, so a click and its arrival share an instant unless
 * a test deliberately separates them. That is the case the panel is built for.
 */
function clickPrayer(kind: 'on' | 'off', clickTime: number, arrivalTime = clickTime) {
  act(() => prayerFlickTimeline.recordClick(kind, clickTime, arrivalTime));
}

function bars(container: HTMLElement): HTMLElement[] {
  return Array.from(container.querySelectorAll<HTMLElement>('.prayer-flick__bar'));
}

/** Recorded clicks only — the resting state's key blades are not clicks. */
function events(scope: HTMLElement | null | undefined): HTMLElement[] {
  return Array.from(scope?.querySelectorAll<HTMLElement>('.prayer-flick__event:not(.is-example)') ?? []);
}

describe('PrayerFlickOverlay', () => {
  beforeEach(() => {
    prayerFlickTimeline.reset();
  });

  it('renders nothing when disabled', () => {
    const { container } = renderOverlay(false);

    expect(container.firstChild).toBeNull();
  });

  it('holds the full bar stack before any tick has been published', () => {
    const { container } = renderOverlay();

    expect(bars(container)).toHaveLength(PRAYER_FLICK_BARS);
    expect(events(container)).toHaveLength(0);
  });

  it('teaches the two lanes and the bar unit while nothing has been recorded', () => {
    const { container } = renderOverlay();

    startTick(FIRST_TICK, START);

    const [current, second] = bars(container);
    const key = Array.from(current?.querySelectorAll('.prayer-flick__event.is-example') ?? []);
    expect(key.map((el) => el.className.includes('prayer-flick__event--on'))).toEqual([true, false]);
    expect(Array.from(current?.querySelectorAll('.prayer-flick__legend') ?? []).map((el) => el.textContent)).toEqual([
      'on',
      'off',
    ]);
    expect(second?.querySelector('.prayer-flick__legend--axis')?.textContent).toBe('each bar is one game tick');
  });

  it('drops the resting key as soon as a click is recorded', () => {
    const { container } = renderOverlay();

    startTick(FIRST_TICK, START);
    clickPrayer('on', START + 150);

    expect(container.querySelector('.prayer-flick__event.is-example')).toBeNull();
    expect(container.querySelector('.prayer-flick__legend')).toBeNull();
  });

  it('marks the running tick, newest first', () => {
    const { container } = renderOverlay();

    startTick(FIRST_TICK, START);

    const [current, ...older] = bars(container);
    expect(current?.classList.contains('is-current')).toBe(true);
    expect(older.some((bar) => bar.classList.contains('is-current'))).toBe(false);
  });

  it('draws a zero-lag click as one mark at the moment it landed, with no travel', () => {
    const { container } = renderOverlay();

    startTick(FIRST_TICK, START);
    clickPrayer('on', START + 150);

    const [event, ...extra] = events(bars(container)[0]);
    expect(extra).toHaveLength(0);
    expect(event?.style.left).toBe('25%');
    expect(event?.style.width).toBe('0%');
    expect(event?.classList.contains('is-instant')).toBe(true);
    expect(event?.classList.contains('prayer-flick__event--on')).toBe(true);
  });

  it('grows the mark into a traveling span once input lag separates click from arrival', () => {
    const { container } = renderOverlay();

    startTick(FIRST_TICK, START);
    clickPrayer('on', START + 150, START + 300);

    const event = bars(container)[0]?.querySelector<HTMLElement>('.prayer-flick__event--on');
    expect(event?.style.left).toBe('25%');
    expect(event?.style.width).toBe('25%');
    expect(event?.classList.contains('is-instant')).toBe(false);
  });

  it('keeps a lag too small to draw in the one-mark form', () => {
    const { container } = renderOverlay();

    startTick(FIRST_TICK, START);
    // 6ms of a 600ms tick: two pixels of a 190px track, which is not a journey.
    clickPrayer('off', START + 150, START + 156);

    expect(bars(container)[0]?.querySelector('.prayer-flick__event')?.classList.contains('is-instant')).toBe(true);
  });

  it('draws every click when several land inside one tick', () => {
    const { container } = renderOverlay();

    startTick(FIRST_TICK, START);
    clickPrayer('on', START + 75);
    clickPrayer('off', START + 300);
    clickPrayer('on', START + 525);

    const current = bars(container)[0];
    expect(events(current).map((el) => el.style.left)).toEqual(['12.5%', '50%', '87.5%']);
    expect(current?.querySelectorAll('.prayer-flick__event--off')).toHaveLength(1);
  });

  it('cuts a click at the tick boundary and resumes it on the next tick when the lag crosses', () => {
    const { container } = renderOverlay();

    startTick(FIRST_TICK, START);
    // Clicked 450ms into the tick, reaches the engine 150ms into the next one.
    clickPrayer('on', START + 450, START + 750);
    startTick(FIRST_TICK + 1, START + TICK_MS);

    const [current, previous] = bars(container);

    // The half that landed: starts at this bar's left edge, no origin post.
    const inbound = current?.querySelector<HTMLElement>('.prayer-flick__event.is-carried.is-inbound');
    expect(inbound?.style.left).toBe('0%');
    expect(inbound?.style.width).toBe('25%');
    expect(current?.querySelector('.prayer-flick__event.is-outbound')).toBeNull();

    // The half that was clicked: runs to the bar's right edge, no blade.
    const outbound = previous?.querySelector<HTMLElement>('.prayer-flick__event.is-carried.is-outbound');
    expect(outbound?.style.left).toBe('75%');
    expect(outbound?.style.width).toBe('25%');
    expect(previous?.querySelector('.prayer-flick__event.is-inbound')).toBeNull();
  });

  it('names the panel and the click count in the accessible label', () => {
    const { getByRole } = renderOverlay();

    startTick(FIRST_TICK, START);
    clickPrayer('on', START + 150);
    clickPrayer('off', START + 450);

    const label = getByRole('img').getAttribute('aria-label');
    expect(label).toContain('Prayer Flick Helper');
    expect(label).toContain('2 prayer clicks');
    // Nothing can slip at the default zero lag, so the clause stays out of the way.
    expect(label).not.toContain('later tick');
  });

  it('reports clicks that registered a tick late only once lag makes that possible', () => {
    const { getByRole } = renderOverlay();

    startTick(FIRST_TICK, START);
    clickPrayer('on', START + 150, START + 300);
    clickPrayer('off', START + 450, START + 750);
    startTick(FIRST_TICK + 1, START + TICK_MS);

    const label = getByRole('img').getAttribute('aria-label');
    expect(label).toContain('2 prayer clicks');
    expect(label).toContain('1 arrived on a later tick');
  });

  it('paces the elapsed sweep with the tick length so it tracks the speed multiplier', () => {
    const { container } = renderOverlay();

    startTick(FIRST_TICK, START, TICK_MS / 2);

    expect(bars(container)[0]?.querySelector<HTMLElement>('.prayer-flick__elapsed')?.style.animationDuration).toBe(
      '300ms',
    );
  });

  it('drops the timeline when the store is reset', () => {
    const { container } = renderOverlay();

    startTick(FIRST_TICK, START);
    clickPrayer('on', START + 150);
    act(() => prayerFlickTimeline.reset());

    expect(events(container)).toHaveLength(0);
    expect(bars(container)).toHaveLength(PRAYER_FLICK_BARS);
    expect(container.querySelector('.prayer-flick__event.is-example')).not.toBeNull();
  });
});
