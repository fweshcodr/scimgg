// @vitest-environment happy-dom

import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useLiveSetting } from '../useLiveSetting';

describe('useLiveSetting', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  function setup(initial: number) {
    const persist = vi.fn();
    const view = renderHook(({ persisted }) => useLiveSetting(persisted, persist, { delayMs: 250 }), {
      initialProps: { persisted: initial },
    });
    return { persist, ...view };
  }

  it('shows each change at once and stores only the last one of a burst', () => {
    const { result, persist } = setup(1);
    act(() => result.current.change(1.5));
    act(() => result.current.change(2));
    expect(result.current.value).toBe(2);
    expect(persist).not.toHaveBeenCalled();
    act(() => vi.advanceTimersByTime(250));
    expect(persist).toHaveBeenCalledTimes(1);
    expect(persist).toHaveBeenLastCalledWith(2);
  });

  it('does not snap back when its own earlier write arrives mid-burst', () => {
    const { result, persist, rerender } = setup(1);
    act(() => result.current.change(1.5));
    // The burst pauses past the debounce: 1.5 is written...
    act(() => vi.advanceTimersByTime(250));
    expect(persist).toHaveBeenLastCalledWith(1.5);
    // ...the wheel turns again before storage echoes it back...
    act(() => result.current.change(2));
    // ...and the echo of 1.5 lands. It is our own write, so step 2 stays on screen.
    rerender({ persisted: 1.5 });
    expect(result.current.value).toBe(2);
    act(() => vi.advanceTimersByTime(250));
    expect(persist).toHaveBeenLastCalledWith(2);
  });

  it('recognizes several writes in flight, however late their echoes arrive', () => {
    const { result, rerender } = setup(1);
    act(() => result.current.change(1.5));
    act(() => vi.advanceTimersByTime(250));
    act(() => result.current.change(2));
    act(() => vi.advanceTimersByTime(250));
    act(() => result.current.change(2.5));
    rerender({ persisted: 1.5 });
    rerender({ persisted: 2 });
    expect(result.current.value).toBe(2.5);
  });

  it('adopts a stored value it did not write, such as another tab’s', () => {
    const { result, rerender } = setup(1);
    rerender({ persisted: 3 });
    expect(result.current.value).toBe(3);
  });

  it('cancels a pending local write when an external value arrives', () => {
    const { result, persist, rerender, unmount } = setup(1);
    act(() => result.current.change(2));
    rerender({ persisted: 3 });
    expect(result.current.value).toBe(3);
    act(() => {
      window.dispatchEvent(new Event('pagehide'));
      vi.advanceTimersByTime(250);
    });
    unmount();
    expect(persist).not.toHaveBeenCalled();
  });

  it('stores a committed value immediately', () => {
    const { result, persist } = setup(1);
    act(() => result.current.commit(2.5));
    expect(result.current.value).toBe(2.5);
    expect(persist).toHaveBeenCalledWith(2.5);
  });
});
