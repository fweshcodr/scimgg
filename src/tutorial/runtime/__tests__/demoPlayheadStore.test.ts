import { describe, expect, it, vi } from 'vitest';
import { DemoPlayheadStore } from '../demoPlayheadStore';

describe('DemoPlayheadStore', () => {
  it('notifies subscribers on a changed set and exposes the new playhead', () => {
    const store = new DemoPlayheadStore();
    const listener = vi.fn();
    store.subscribe(listener);

    store.set(600);

    expect(listener).toHaveBeenCalledTimes(1);
    expect(store.getSnapshot()).toBe(600);
  });

  it('does NOT notify when the playhead is unchanged (dedup)', () => {
    const store = new DemoPlayheadStore();
    store.set(600);
    const listener = vi.fn();
    store.subscribe(listener);

    store.set(600);

    expect(listener).not.toHaveBeenCalled();
  });

  it('stops notifying after unsubscribe', () => {
    const store = new DemoPlayheadStore();
    const listener = vi.fn();
    const unsubscribe = store.subscribe(listener);
    unsubscribe();

    store.set(100);

    expect(listener).not.toHaveBeenCalled();
  });
});
