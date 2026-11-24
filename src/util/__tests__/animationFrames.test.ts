import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { animationFrames } from '../animationFrames';

const nativeFrames = new Map<number, FrameRequestCallback>();
const requests: number[] = [];
const subscriptions: (() => void)[] = [];
let nextNativeId = 0;

function request(callback: FrameRequestCallback): number {
  const id = animationFrames.request(callback);
  requests.push(id);
  return id;
}

function deliverFrame(time: number): void {
  const frame = [...nativeFrames];
  for (const [id, callback] of frame) {
    if (!nativeFrames.delete(id)) continue;
    callback(time);
  }
}

beforeEach(() => {
  vi.stubGlobal(
    'requestAnimationFrame',
    vi.fn((callback: FrameRequestCallback) => {
      const id = ++nextNativeId;
      nativeFrames.set(id, callback);
      return id;
    }),
  );
  vi.stubGlobal(
    'cancelAnimationFrame',
    vi.fn((id: number) => nativeFrames.delete(id)),
  );
});

afterEach(() => {
  for (const id of requests) animationFrames.cancel(id);
  for (const unsubscribe of subscriptions) unsubscribe();
  animationFrames.setSuspended(false);
  animationFrames.clock.reset();
  expect(nativeFrames.size).toBe(0);
  requests.length = 0;
  subscriptions.length = 0;
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('animationFrames', () => {
  it('keeps separate native callbacks and delivers their current timestamps once', () => {
    const first = vi.fn();
    const second = vi.fn();
    request(first);
    request(second);

    deliverFrame(123);

    expect(requestAnimationFrame).toHaveBeenCalledTimes(2);
    expect(first).toHaveBeenCalledExactlyOnceWith(123);
    expect(second).toHaveBeenCalledExactlyOnceWith(123);
  });

  it('invokes callbacks with the native global receiver', () => {
    let receiver: unknown;
    request(function (this: unknown) {
      receiver = this;
    });

    deliverFrame(123);

    expect(receiver).toBe(globalThis);
  });

  it('retains pending and newly requested work without native frames while suspended', () => {
    const first = vi.fn();
    const second = vi.fn();
    request(first);

    animationFrames.setSuspended(true);
    animationFrames.setSuspended(true);
    request(second);
    deliverFrame(10_000);

    expect(nativeFrames.size).toBe(0);
    expect(requestAnimationFrame).toHaveBeenCalledTimes(1);
    expect(cancelAnimationFrame).toHaveBeenCalledTimes(1);
    expect(first).not.toHaveBeenCalled();
    expect(second).not.toHaveBeenCalled();
  });

  it('reschedules retained work once on resume with the new native timestamp', () => {
    const callback = vi.fn();
    request(callback);
    animationFrames.setSuspended(true);

    animationFrames.setSuspended(false);
    animationFrames.setSuspended(false);
    deliverFrame(60_000);
    deliverFrame(60_016);

    expect(requestAnimationFrame).toHaveBeenCalledTimes(2);
    expect(callback).toHaveBeenCalledExactlyOnceWith(60_000);
  });

  it.each([false, true])('ignores a queued delivery after cancellation (suspended: %s)', (suspended) => {
    const callback = vi.fn();
    const id = request(callback);
    const queued = [...nativeFrames.values()][0];
    animationFrames.setSuspended(suspended);

    animationFrames.cancel(id);
    animationFrames.setSuspended(false);
    queued?.(100);
    deliverFrame(116);

    expect(callback).not.toHaveBeenCalled();
    expect(nativeFrames.size).toBe(0);
  });

  it('ignores a pre-suspension delivery after resume without consuming the resumed request', () => {
    const callback = vi.fn();
    request(callback);
    const queued = [...nativeFrames.values()][0];
    animationFrames.setSuspended(true);
    queued?.(100);
    animationFrames.setSuspended(false);

    queued?.(116);
    expect(callback).not.toHaveBeenCalled();
    deliverFrame(10_000);

    expect(callback).toHaveBeenCalledExactlyOnceWith(10_000);
  });

  it('defers requests made inside callbacks to the next native frame', () => {
    const next = vi.fn();
    request(() => request(next));

    deliverFrame(100);

    expect(next).not.toHaveBeenCalled();
    expect(nativeFrames.size).toBe(1);
    deliverFrame(116);
    expect(next).toHaveBeenCalledExactlyOnceWith(116);
  });

  it('allows one callback to cancel another callback in the same frame', () => {
    const second = vi.fn();
    request(() => animationFrames.cancel(secondId));
    const secondId = request(second);

    deliverFrame(100);

    expect(second).not.toHaveBeenCalled();
  });

  it('retains the remaining callbacks when a callback suspends the scheduler', () => {
    const second = vi.fn();
    request(() => animationFrames.setSuspended(true));
    request(second);

    deliverFrame(100);

    expect(second).not.toHaveBeenCalled();
    expect(nativeFrames.size).toBe(0);
    animationFrames.setSuspended(false);
    deliverFrame(200);
    expect(second).toHaveBeenCalledExactlyOnceWith(200);
  });

  it('leaves unrelated native callbacks scheduled when a callback throws', () => {
    const error = new Error('callback failed');
    request(() => {
      throw error;
    });
    const second = vi.fn();
    request(second);

    expect(() => deliverFrame(100)).toThrow(error);

    expect(nativeFrames.size).toBe(1);
    deliverFrame(116);
    expect(second).toHaveBeenCalledExactlyOnceWith(116);
  });

  it('notifies resume subscribers only on a resume edge and supports cleanup', () => {
    const listener = vi.fn();
    const unsubscribe = animationFrames.subscribeResume(listener);
    subscriptions.push(unsubscribe);
    animationFrames.setSuspended(false);
    animationFrames.setSuspended(true);

    animationFrames.setSuspended(false);

    expect(listener).toHaveBeenCalledOnce();
    unsubscribe();
    animationFrames.setSuspended(true);
    animationFrames.setSuspended(false);
    expect(listener).toHaveBeenCalledOnce();
  });
});
