// @vitest-environment happy-dom

import { readFileSync } from 'node:fs';
import { act, cleanup, render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { countdownTokens } from '../CountdownBeats';
import { FIGHT_COUNTDOWN_EXIT_MS, FightStartCountdown, fightCountdownPhaseAt } from '../FightStartCountdown';

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'performance'] });
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

const root = () => document.querySelector('.fight-start-countdown');
const numeral = () => document.querySelector('.fight-start-countdown-numeral')?.textContent;
const activeTick = () => document.querySelector('.countdown-beats-tick.is-active')?.textContent;
const ticks = () => Array.from(document.querySelectorAll('.countdown-beats-tick')).map((el) => el.textContent);
const advance = (ms: number) =>
  act(() => {
    vi.advanceTimersByTime(ms);
  });

describe('countdownTokens', () => {
  it('counts down from N and ends on GO', () => {
    expect(countdownTokens(3)).toEqual(['3', '2', '1', 'GO']);
    expect(countdownTokens(1)).toEqual(['1', 'GO']);
    expect(countdownTokens(5)).toEqual(['5', '4', '3', '2', '1', 'GO']);
  });
});

describe('FightStartCountdown', () => {
  it.each(
    [1, 3, 5].flatMap((tickCount) => [0.5, 1, 2].map((speed) => ({ tickCount, speed }))),
  )('uses the captured $tickCount beats at $speed x, including every boundary and the fixed GO tail', ({
    tickCount,
    speed,
  }) => {
    const start = performance.now();
    const tickMs = 600 / speed;
    const end = start + tickCount * tickMs;
    const onFinished = vi.fn();
    const props = { tickCount, tickMs, startsAtMs: start, endsAtMs: end, releasedAtMs: null, onFinished };
    const { rerender } = render(<FightStartCountdown {...props} />);
    expect(numeral()).toBe(String(tickCount));
    for (let index = 1; index < tickCount; index++) {
      advance(tickMs - 1);
      expect(numeral()).toBe(String(tickCount - index + 1));
      advance(1);
      expect(numeral()).toBe(String(tickCount - index));
    }
    advance(tickMs);
    expect(numeral()).toBe('1');
    expect(onFinished).not.toHaveBeenCalled();
    rerender(<FightStartCountdown {...props} releasedAtMs={performance.now()} />);
    expect(numeral()).toBe('GO');
    expect(activeTick()).toBe('GO');
    advance(599);
    expect(numeral()).toBe('GO');
    advance(1);
    expect(root()).toBeNull();
    expect(onFinished).toHaveBeenCalledTimes(1);
  });

  it('beats once a game tick, holds 1 past the prediction, then exits on actual release and finishes once', () => {
    const onFinished = vi.fn();
    const start = performance.now();
    const { rerender } = render(
      <FightStartCountdown
        tickCount={3}
        tickMs={600}
        startsAtMs={start}
        endsAtMs={start + 1800}
        releasedAtMs={null}
        onFinished={onFinished}
      />,
    );

    expect(ticks()).toEqual(['3', '2', '1', 'GO']);
    expect(numeral()).toBe('3');
    expect(activeTick()).toBe('3');
    expect(document.querySelector('.countdown-beats')?.parentElement).toHaveClass('fight-start-countdown-beats');
    expect(document.querySelector('.fight-start-countdown-content')?.getAttribute('aria-hidden')).toBe('true');
    expect(document.querySelector('[role="status"]')?.textContent).toBe('Fight starts in 3 ticks');

    advance(599);
    expect(numeral()).toBe('3');
    advance(1);
    expect(numeral()).toBe('2');
    expect(activeTick()).toBe('2');
    expect(document.querySelector('.countdown-beats-tick.is-lit')?.textContent).toBe('3');

    advance(600);
    expect(numeral()).toBe('1');

    advance(600);
    expect(numeral()).toBe('1');
    expect(activeTick()).toBe('1');
    expect(onFinished).not.toHaveBeenCalled();
    advance(2000);
    expect(numeral()).toBe('1');
    expect(document.querySelector('.fight-start-countdown-numeral.is-go')).toBeNull();
    expect(onFinished).not.toHaveBeenCalled();
    rerender(
      <FightStartCountdown
        tickCount={3}
        tickMs={600}
        startsAtMs={start}
        endsAtMs={start + 1800}
        releasedAtMs={performance.now()}
        onFinished={onFinished}
      />,
    );
    expect(numeral()).toBe('GO');
    expect(document.querySelector('.fight-start-countdown-numeral.is-go')).not.toBeNull();
    expect(activeTick()).toBe('GO');
    expect(document.querySelector('.fight-start-countdown-content--exiting .countdown-beats')).not.toBeNull();
    expect(document.querySelector('[role="status"]')?.textContent).toBe('Fight started');
    expect(document.querySelector('.fight-start-countdown-content--exiting')).not.toBeNull();
    advance(FIGHT_COUNTDOWN_EXIT_MS - 1);
    expect(numeral()).toBe('GO');
    expect(activeTick()).toBe('GO');
    expect(onFinished).not.toHaveBeenCalled();

    advance(1);
    expect(root()).toBeNull();
    expect(document.querySelector('.countdown-beats')).toBeNull();
    expect(onFinished).toHaveBeenCalledTimes(1);

    advance(5000);
    expect(onFinished).toHaveBeenCalledTimes(1);
  });

  it('renders nothing until a future startsAt (intro alignment), then counts from N', () => {
    const onFinished = vi.fn();
    const start = performance.now() + 2500;
    const { rerender } = render(
      <FightStartCountdown
        tickCount={5}
        tickMs={600}
        startsAtMs={start}
        endsAtMs={start + 3000}
        releasedAtMs={null}
        onFinished={onFinished}
      />,
    );

    expect(root()).toBeNull();
    advance(2499);
    expect(root()).toBeNull();
    advance(1);
    expect(numeral()).toBe('5');
    expect(ticks()).toEqual(['5', '4', '3', '2', '1', 'GO']);
    expect(document.querySelector('[role="status"]')?.textContent).toBe('Fight starts in 5 ticks');

    for (const expected of ['4', '3', '2', '1']) {
      advance(600);
      expect(numeral()).toBe(expected);
    }
    advance(600);
    expect(numeral()).toBe('1');
    rerender(
      <FightStartCountdown
        tickCount={5}
        tickMs={600}
        startsAtMs={start}
        endsAtMs={start + 3000}
        releasedAtMs={performance.now()}
        onFinished={onFinished}
      />,
    );
    expect(numeral()).toBe('GO');
    expect(onFinished).not.toHaveBeenCalled();
  });

  it('handles a one-tick countdown', () => {
    const start = performance.now();
    render(
      <FightStartCountdown
        tickCount={1}
        tickMs={600}
        startsAtMs={start}
        endsAtMs={start + 600}
        releasedAtMs={null}
        onFinished={() => {}}
      />,
    );
    expect(ticks()).toEqual(['1', 'GO']);
    expect(document.querySelector('[role="status"]')?.textContent).toBe('Fight starts in 1 tick');
  });

  it('finishes immediately when mounted after its window has passed', () => {
    const onFinished = vi.fn();
    const now = performance.now();
    render(
      <FightStartCountdown
        tickCount={3}
        tickMs={600}
        startsAtMs={now - 10_000}
        endsAtMs={now - 8200}
        releasedAtMs={now - 1000}
        onFinished={onFinished}
      />,
    );
    expect(root()).toBeNull();
    expect(onFinished).toHaveBeenCalledTimes(1);
    advance(600);
    expect(onFinished).toHaveBeenCalledTimes(1);
  });

  it('keeps GO, the full row and restart name in one exit group until 600ms after release', () => {
    const start = performance.now();
    const { rerender } = render(
      <FightStartCountdown
        tickCount={1}
        tickMs={600}
        startsAtMs={start}
        endsAtMs={start + 600}
        releasedAtMs={null}
        onFinished={() => {}}
      />,
    );
    expect(document.querySelector('.fight-start-countdown-name')).toBeNull();
    rerender(
      <FightStartCountdown
        tickCount={1}
        tickMs={600}
        startsAtMs={start}
        endsAtMs={start + 600}
        releasedAtMs={null}
        encounterName="Yama"
        onFinished={() => {}}
      />,
    );
    expect(document.querySelector('.fight-start-countdown-name')?.textContent).toBe('Yama');
    advance(600);
    rerender(
      <FightStartCountdown
        tickCount={1}
        tickMs={600}
        startsAtMs={start}
        endsAtMs={start + 600}
        releasedAtMs={performance.now()}
        encounterName="Yama"
        onFinished={() => {}}
      />,
    );
    expect(document.querySelector('.fight-start-countdown-name')?.textContent).toBe('Yama');
    const exitGroup = document.querySelector('.fight-start-countdown-content--exiting');
    expect(exitGroup?.querySelector('.fight-start-countdown-name')?.textContent).toBe('Yama');
    expect(exitGroup?.querySelector('.fight-start-countdown-numeral')?.textContent).toBe('GO');
    expect(exitGroup?.querySelector('.countdown-beats')).not.toBeNull();
    expect(ticks()).toEqual(['1', 'GO']);
    advance(200);
    expect(numeral()).toBe('GO');
    expect(activeTick()).toBe('GO');
    expect(document.querySelector('.fight-start-countdown-name')?.textContent).toBe('Yama');
    advance(399);
    expect(document.querySelector('.fight-start-countdown-name')?.textContent).toBe('Yama');
    expect(numeral()).toBe('GO');
    expect(activeTick()).toBe('GO');
    advance(1);
    expect(root()).toBeNull();
    expect(document.querySelector('.fight-start-countdown-name')).toBeNull();
    expect(document.querySelector('.countdown-beats')).toBeNull();
  });

  it('holds 1 when mounted late without an actual release', () => {
    const onFinished = vi.fn();
    render(
      <FightStartCountdown
        tickCount={3}
        tickMs={600}
        startsAtMs={-10_000}
        endsAtMs={-8200}
        releasedAtMs={null}
        onFinished={onFinished}
      />,
    );
    expect(numeral()).toBe('1');
    advance(10_000);
    expect(numeral()).toBe('1');
    expect(onFinished).not.toHaveBeenCalled();
  });

  it('flows beneath the shared arrival slot and never takes pointer input', () => {
    const css = readFileSync('src/components/FightStartCountdown.css', 'utf8');
    const rootRule = css.slice(
      css.indexOf('.fight-start-countdown {'),
      css.indexOf('}', css.indexOf('.fight-start-countdown {')),
    );
    expect(rootRule).toContain('pointer-events: none');
    expect(rootRule).toContain('align-items: center');
    expect(rootRule).toContain('justify-content: center');
    expect(rootRule).toContain('position: relative');
    expect(rootRule).not.toContain('inset:');
    expect(rootRule).not.toContain('padding-top');
    expect(css).not.toContain('--crest-floating-top');
    const beatsRule = css.slice(css.indexOf('.fight-start-countdown-beats {'));
    expect(beatsRule.slice(0, beatsRule.indexOf('}'))).toContain('margin-top: 12px');
    expect(beatsRule.slice(0, beatsRule.indexOf('}'))).not.toContain('position: absolute');
    const nameRule = css.slice(css.indexOf('.fight-start-countdown-name {'));
    expect(nameRule.slice(0, nameRule.indexOf('}'))).toContain('position: absolute');
    expect(nameRule.slice(0, nameRule.indexOf('}'))).toContain('bottom: calc(100% + 12px)');
    expect(css).not.toContain('orientation: portrait');
  });

  it('uses a shared confirmation hold and opacity-only fade, including under reduced motion', () => {
    const css = readFileSync('src/components/FightStartCountdown.css', 'utf8');
    expect(FIGHT_COUNTDOWN_EXIT_MS).toBe(200 + 400);
    expect(css).toContain('animation: fight-start-countdown-exit 400ms ease-in-out 200ms both');
    expect(css).toContain('animation: fight-start-countdown-fade 120ms ease backwards');
    expect(css).not.toContain('fight-start-countdown-beat ');
    const goRule = css.slice(css.indexOf('.fight-start-countdown-numeral.is-go {'));
    expect(goRule.slice(0, goRule.indexOf('}'))).toContain('animation: none');
    const exitRule = css.slice(
      css.indexOf('@keyframes fight-start-countdown-exit'),
      css.indexOf('@keyframes fight-start-countdown-fade'),
    );
    expect(exitRule).toContain('opacity: 1');
    expect(exitRule).toContain('opacity: 0');
    expect(exitRule).not.toContain('transform');
    const entrance = css.slice(css.indexOf('@keyframes fight-start-countdown-fade'));
    expect(entrance).toContain('opacity: 0');
    expect(entrance).toContain('opacity: 1');
    expect(entrance).not.toContain('transform');
    // Both animations are already reduced-motion-safe; no override can hide GO or its row.
    expect(css).not.toContain('prefers-reduced-motion');
  });

  it('keeps row ink opaque and protects separator dots without changing the shared tutorial row', () => {
    const css = readFileSync('src/components/FightStartCountdown.css', 'utf8');
    const rule = (selector: string) => {
      const start = css.indexOf(`${selector} {`);
      return css.slice(start, css.indexOf('}', start));
    };
    expect(rule('.fight-start-countdown-beats .countdown-beats-tick.is-pending')).toContain('opacity: 1');
    expect(rule('.fight-start-countdown-beats .countdown-beats-tick.is-active')).toContain('var(--color-heading)');
    expect(rule('.fight-start-countdown-beats .countdown-beats-tick.is-go.is-active')).toContain(
      'var(--color-accent-text)',
    );
    const dots = rule('.fight-start-countdown-beats .countdown-beats-dot');
    expect(dots).toContain('var(--color-text-muted)');
    expect(dots).toContain('text-shadow: var(--crest-rim), var(--crest-shadow-sm)');
  });
});

describe('fightCountdownPhaseAt', () => {
  it('jumps straight to the current beat after a stall, rather than replaying missed ones', () => {
    expect(fightCountdownPhaseAt(1500, 0, 1800, null, 3, 600)).toMatchObject({ kind: 'beat', index: 2 });
    expect(fightCountdownPhaseAt(1800, 0, 1800, null, 3, 600)).toMatchObject({ kind: 'held' });
    expect(fightCountdownPhaseAt(3500, 0, 1800, 3500, 3, 600)).toMatchObject({ kind: 'go' });
    expect(fightCountdownPhaseAt(-1, 0, 1800, null, 3, 600)).toMatchObject({ kind: 'waiting' });
  });

  it('uses actual release for the entire 600ms visual tail, even when sampled late', () => {
    expect(fightCountdownPhaseAt(3500, 0, 1800, 3500, 3, 600)).toEqual({ kind: 'go', nextAtMs: 4100 });
    expect(fightCountdownPhaseAt(4099, 0, 1800, 3500, 3, 600)).toEqual({ kind: 'go', nextAtMs: 4100 });
    expect(fightCountdownPhaseAt(4100, 0, 1800, 3500, 3, 600)).toEqual({ kind: 'done' });
  });
});
