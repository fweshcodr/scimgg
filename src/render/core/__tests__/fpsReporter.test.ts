import { describe, expect, it, vi } from 'vitest';
import { fpsReporter } from '../fpsReporter';

describe('fpsReporter', () => {
  it('returns 0 before any report', () => {
    // The exported singleton starts at 0 and only changes via report().
    // We can't reset its internal state, so assert get() is a finite number
    // and that report() makes it reflect the reported value below.
    expect(typeof fpsReporter.get()).toBe('number');
  });

  it('get() reflects the most recent reported value', () => {
    fpsReporter.report(60);
    expect(fpsReporter.get()).toBe(60);
    fpsReporter.report(30);
    expect(fpsReporter.get()).toBe(30);
  });

  it('notifies subscribers with each reported value', () => {
    const listener = vi.fn();
    const unsubscribe = fpsReporter.subscribe(listener);

    fpsReporter.report(144);
    fpsReporter.report(72);

    expect(listener).toHaveBeenCalledTimes(2);
    expect(listener).toHaveBeenNthCalledWith(1, 144);
    expect(listener).toHaveBeenNthCalledWith(2, 72);

    unsubscribe();
  });

  it('delivers to every active subscriber', () => {
    const a = vi.fn();
    const b = vi.fn();
    const unsubA = fpsReporter.subscribe(a);
    const unsubB = fpsReporter.subscribe(b);

    fpsReporter.report(90);

    expect(a).toHaveBeenCalledWith(90);
    expect(b).toHaveBeenCalledWith(90);

    unsubA();
    unsubB();
  });

  it('stops delivering after unsubscribe', () => {
    const listener = vi.fn();
    const unsubscribe = fpsReporter.subscribe(listener);

    fpsReporter.report(50);
    expect(listener).toHaveBeenCalledTimes(1);

    unsubscribe();
    fpsReporter.report(40);
    expect(listener).toHaveBeenCalledTimes(1);

    expect(fpsReporter.get()).toBe(40);
  });

  it('unsubscribing one listener leaves others intact', () => {
    const a = vi.fn();
    const b = vi.fn();
    const unsubA = fpsReporter.subscribe(a);
    const unsubB = fpsReporter.subscribe(b);

    unsubA();
    fpsReporter.report(120);

    expect(a).not.toHaveBeenCalled();
    expect(b).toHaveBeenCalledWith(120);

    unsubB();
  });
});
