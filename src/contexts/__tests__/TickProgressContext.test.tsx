// @vitest-environment happy-dom
import { act, render, screen } from '@testing-library/react';
import type React from 'react';
import { describe, expect, it } from 'vitest';
import { TickProgressStore } from '../../core/tickProgressStore';
import { TickProgressProvider, useRemainingSeconds } from '../TickProgressContext';

/**
 * The countdown must step on one-second boundaries WITHOUT costing a re-render
 * per animation frame — that is the whole point of snapshotting the whole second
 * rather than the raw interpolated tick.
 */

let renderCount = 0;

const Timer: React.FC<{ ticksRemaining: number; sampledAtTick: number }> = ({ ticksRemaining, sampledAtTick }) => {
  renderCount++;
  const seconds = useRemainingSeconds(ticksRemaining, sampledAtTick);
  return <span data-testid="seconds">{seconds}</span>;
};

function setup(ticksRemaining: number, sampledAtTick = 0) {
  renderCount = 0;
  const store = new TickProgressStore();
  store.set(sampledAtTick);
  const view = render(
    <TickProgressProvider store={store}>
      <Timer ticksRemaining={ticksRemaining} sampledAtTick={sampledAtTick} />
    </TickProgressProvider>,
  );
  return { store, view };
}

const seconds = () => Number(screen.getByTestId('seconds').textContent);

describe('useRemainingSeconds', () => {
  it('counts down within a tick', () => {
    const { store } = setup(10, 100);
    expect(seconds()).toBe(6);

    // 0.5 ticks elapsed = 0.3s -> 5.7s left -> still reads 6.
    act(() => store.set(100.5));
    expect(seconds()).toBe(6);
  });

  it('drops a second only after a full second of simulation time', () => {
    const { store } = setup(5, 200);
    expect(seconds()).toBe(3);

    act(() => store.set(200.9));
    expect(seconds()).toBe(3);

    // Interpolation is clamped to one tick: 5 - 1 = 4 ticks = 2.4s -> ceil 3.
    act(() => store.set(201));
    expect(seconds()).toBe(3);
  });

  it('does not dip a second at the tick boundary handoff', () => {
    // Publishing a bare fraction would mean that on the frame React commits
    // the decremented tick count, the store still holds the previous frame's
    // ~1.0 fraction, so the timer briefly shows a second too few.
    const { store, view } = setup(10, 100);
    expect(seconds()).toBe(6);

    act(() => store.set(100.999));
    const beforeCommit = seconds();

    // React commits tick 101 with ticksRemaining=9; store not yet rewritten.
    act(() => {
      view.rerender(
        <TickProgressProvider store={store}>
          <Timer ticksRemaining={9} sampledAtTick={101} />
        </TickProgressProvider>,
      );
    });
    const afterCommit = seconds();

    act(() => store.set(101.01));
    const afterStore = seconds();

    expect(afterCommit).toBeLessThanOrEqual(beforeCommit);
    expect(beforeCommit - afterCommit).toBeLessThanOrEqual(1);
    expect(afterStore).toBe(afterCommit);
  });

  it('re-renders only when the displayed second changes, not per frame', () => {
    // Sixty frames across one tick (0.6s) can cross a one-second boundary at
    // most once, so a per-frame subscription would be 60 renders where a correct
    // one is at most 1.
    const { store } = setup(10, 0);
    const afterMount = renderCount;

    for (let frame = 1; frame <= 60; frame++) {
      act(() => store.set(frame / 60));
    }

    expect(renderCount - afterMount).toBeLessThanOrEqual(1);
  });

  it('does not notify subscribers when the value is unchanged', () => {
    const { store } = setup(10, 0);
    const before = renderCount;

    act(() => store.set(0.25));
    act(() => store.set(0.25));
    act(() => store.set(0.25));

    expect(renderCount - before).toBeLessThanOrEqual(1);
  });

  it('freezes while the interpolated tick is held, as it is when paused', () => {
    const { store } = setup(20, 0);
    act(() => store.set(0.5));
    const held = seconds();
    for (let i = 0; i < 10; i++) {
      act(() => store.set(0.5));
    }
    expect(seconds()).toBe(held);
  });

  it('ignores a store that has fallen behind the sampled tick', () => {
    // Negative elapsed would otherwise ADD time to the timer.
    const { store } = setup(10, 100);
    act(() => store.set(90));
    expect(seconds()).toBe(6);
  });

  it('falls back to the tick-boundary value outside a provider', () => {
    renderCount = 0;
    render(<Timer ticksRemaining={10} sampledAtTick={0} />);
    expect(seconds()).toBe(6);
  });

  it('releases its subscription on unmount', () => {
    const { store, view } = setup(10, 0);
    view.unmount();
    expect(() => store.set(0.9)).not.toThrow();
  });
});

describe('TickProgressStore', () => {
  it('notifies subscribers on change and skips no-op writes', () => {
    const store = new TickProgressStore();
    let notifications = 0;
    const unsubscribe = store.subscribe(() => {
      notifications++;
    });

    store.set(0.25);
    expect(notifications).toBe(1);
    store.set(0.25);
    expect(notifications).toBe(1);
    store.set(0.5);
    expect(notifications).toBe(2);

    unsubscribe();
    store.set(0.75);
    expect(notifications).toBe(2);
    expect(store.getSnapshot()).toBe(0.75);
  });
});
