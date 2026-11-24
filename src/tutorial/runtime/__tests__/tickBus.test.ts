import { describe, expect, it, vi } from 'vitest';
import type { GameEvent } from '../../../core/events/types';
import { tickBus } from '../tickBus';

const ev = (id: string): GameEvent => ({ kind: 'noop', id }) as unknown as GameEvent;

describe('tickBus', () => {
  it('publishes tick + events to all current listeners', () => {
    const a = vi.fn();
    const b = vi.fn();
    const unsubA = tickBus.subscribe(a);
    const unsubB = tickBus.subscribe(b);

    tickBus.publish(7, [ev('x')]);
    expect(a).toHaveBeenCalledWith(7, [ev('x')]);
    expect(b).toHaveBeenCalledWith(7, [ev('x')]);

    unsubA();
    unsubB();
  });

  it('subscribe returns an unsubscribe that stops further deliveries to that listener', () => {
    const a = vi.fn();
    const b = vi.fn();
    const unsubA = tickBus.subscribe(a);
    const unsubB = tickBus.subscribe(b);

    unsubA();
    tickBus.publish(1, []);
    expect(a).not.toHaveBeenCalled();
    expect(b).toHaveBeenCalledWith(1, []);

    unsubB();
  });

  it('unsubscribing twice is a no-op', () => {
    const a = vi.fn();
    const unsub = tickBus.subscribe(a);
    unsub();
    expect(() => unsub()).not.toThrow();
    tickBus.publish(2, []);
    expect(a).not.toHaveBeenCalled();
  });

  it('publish with no subscribers does not throw', () => {
    expect(() => tickBus.publish(3, [])).not.toThrow();
  });

  it('does not deliver the in-flight tick to a listener subscribed mid-dispatch', () => {
    const late = vi.fn();
    const lateUnsubs: Array<() => void> = [];
    const early = vi.fn(() => {
      if (lateUnsubs.length === 0) lateUnsubs.push(tickBus.subscribe(late));
    });
    const unsubEarly = tickBus.subscribe(early);

    tickBus.publish(1, []);
    expect(early).toHaveBeenCalledTimes(1);
    expect(late).not.toHaveBeenCalled();

    tickBus.publish(2, []);
    expect(late).toHaveBeenCalledWith(2, []);

    unsubEarly();
    lateUnsubs.forEach((u) => {
      u();
    });
  });

  it('skips a listener removed earlier in the same dispatch', () => {
    const b = vi.fn();
    let unsubB: (() => void) | null = null;
    const a = vi.fn(() => {
      unsubB?.();
    });
    const unsubA = tickBus.subscribe(a);
    unsubB = tickBus.subscribe(b);

    tickBus.publish(1, []);
    expect(a).toHaveBeenCalledTimes(1);
    expect(b).not.toHaveBeenCalled();

    unsubA();
  });
});
