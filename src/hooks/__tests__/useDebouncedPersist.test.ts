// @vitest-environment happy-dom

import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useDebouncedPersist } from '../useDebouncedPersist';

describe('useDebouncedPersist', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('coalesces rapid calls into a single trailing persist with the last value', () => {
    const persist = vi.fn();
    const { result } = renderHook(() => useDebouncedPersist(persist, 250));

    act(() => {
      result.current(1.1);
      result.current(1.2);
      result.current(1.5);
    });
    expect(persist).not.toHaveBeenCalled();

    act(() => {
      vi.advanceTimersByTime(250);
    });
    expect(persist).toHaveBeenCalledTimes(1);
    expect(persist).toHaveBeenCalledWith(1.5);
  });

  it('supersedes a pending value with an immediate persist', () => {
    const persist = vi.fn();
    const { result } = renderHook(() => useDebouncedPersist(persist, 250));

    act(() => {
      result.current(1.2);
      result.current.supersede(1.5);
    });

    expect(persist).toHaveBeenCalledOnce();
    expect(persist).toHaveBeenCalledWith(1.5);

    act(() => {
      vi.advanceTimersByTime(250);
    });
    expect(persist).toHaveBeenCalledOnce();
  });

  it('cancels without persisting and can schedule a new value afterwards', () => {
    const persist = vi.fn();
    const { result, unmount } = renderHook(() => useDebouncedPersist(persist, 250));
    act(() => {
      result.current(2);
      result.current.cancel();
      window.dispatchEvent(new Event('pagehide'));
      vi.advanceTimersByTime(250);
    });
    expect(persist).not.toHaveBeenCalled();
    act(() => {
      result.current(3);
      vi.advanceTimersByTime(250);
    });
    expect(persist).toHaveBeenCalledExactlyOnceWith(3);
    unmount();
    expect(persist).toHaveBeenCalledOnce();
  });

  it('flushes the pending value on unmount instead of dropping it', () => {
    const persist = vi.fn();
    const { result, unmount } = renderHook(() => useDebouncedPersist(persist, 250));

    act(() => {
      result.current(1.75);
    });
    expect(persist).not.toHaveBeenCalled();

    unmount();
    expect(persist).toHaveBeenCalledTimes(1);
    expect(persist).toHaveBeenCalledWith(1.75);
  });

  it('flushes the pending value when the tab is hidden (visibilitychange)', () => {
    const persist = vi.fn();
    const { result } = renderHook(() => useDebouncedPersist(persist, 250));

    act(() => {
      result.current(2);
    });

    // Shadow the prototype getter with an own 'hidden' value for this test.
    Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'hidden' });
    act(() => {
      document.dispatchEvent(new Event('visibilitychange'));
    });
    expect(persist).toHaveBeenCalledTimes(1);
    expect(persist).toHaveBeenCalledWith(2);
    delete (document as unknown as { visibilityState?: unknown }).visibilityState;
  });

  it('does NOT flush on visibilitychange when the tab is still visible', () => {
    const persist = vi.fn();
    const { result } = renderHook(() => useDebouncedPersist(persist, 250));
    act(() => {
      result.current(1.9);
    });
    Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'visible' });
    act(() => {
      document.dispatchEvent(new Event('visibilitychange'));
    });
    expect(persist).not.toHaveBeenCalled();
    delete (document as unknown as { visibilityState?: unknown }).visibilityState;
  });

  it('flushes on pagehide', () => {
    const persist = vi.fn();
    const { result } = renderHook(() => useDebouncedPersist(persist, 250));
    act(() => {
      result.current(1.3);
    });
    act(() => {
      window.dispatchEvent(new Event('pagehide'));
    });
    expect(persist).toHaveBeenCalledWith(1.3);
  });

  it('does not double-persist: after the timer fires, unmount is a no-op', () => {
    const persist = vi.fn();
    const { result, unmount } = renderHook(() => useDebouncedPersist(persist, 250));
    act(() => {
      result.current(1.4);
    });
    act(() => {
      vi.advanceTimersByTime(250);
    });
    expect(persist).toHaveBeenCalledTimes(1);
    unmount();
    expect(persist).toHaveBeenCalledTimes(1);
  });

  it('does nothing when no value was scheduled', () => {
    const persist = vi.fn();
    const { unmount } = renderHook(() => useDebouncedPersist(persist, 250));
    unmount();
    expect(persist).not.toHaveBeenCalled();
  });
});
