// @vitest-environment happy-dom

import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { listenTouchPanBlock } from '../../input/touchHold';
import { useRafDrag } from '../useRafDrag';

describe('useRafDrag', () => {
  let rafCallbacks: Map<number, FrameRequestCallback>;
  let nextRafId: number;

  beforeEach(() => {
    rafCallbacks = new Map();
    nextRafId = 1;

    vi.stubGlobal(
      'requestAnimationFrame',
      vi.fn((cb: FrameRequestCallback) => {
        const id = nextRafId++;
        rafCallbacks.set(id, cb);
        return id;
      }),
    );

    vi.stubGlobal(
      'cancelAnimationFrame',
      vi.fn((id: number) => {
        rafCallbacks.delete(id);
      }),
    );

    document.body.style.cursor = 'auto';
    document.querySelectorAll('style[data-use-raf-drag-cursor]').forEach((el) => {
      el.remove();
    });
  });

  function flushRaf(): void {
    const callbacks = Array.from(rafCallbacks.values());
    rafCallbacks.clear();
    callbacks.forEach((cb) => {
      cb(0);
    });
  }

  function withTimeStamp<T extends Event>(event: T, timeStamp: number): T {
    Object.defineProperty(event, 'timeStamp', { value: timeStamp, configurable: true });
    return event;
  }

  it('fires move updates after drag is started and a frame is flushed', () => {
    const onMove = vi.fn();
    const { result } = renderHook(() => useRafDrag({ onMove }));

    act(() => {
      result.current.startDrag({ clientX: 10, clientY: 20 });
      window.dispatchEvent(new MouseEvent('mousemove', { clientX: 15, clientY: 25, buttons: 1 }));
      flushRaf();
    });

    expect(result.current.isDraggingRef.current).toBe(true);
    expect(onMove).toHaveBeenCalledWith(15, 25, expect.any(Number));
  });

  it('batches move updates with requestAnimationFrame and uses latest coordinates', () => {
    const onMove = vi.fn();
    const { result } = renderHook(() => useRafDrag({ onMove }));

    act(() => {
      result.current.startDrag({ clientX: 0, clientY: 0 });
      window.dispatchEvent(new MouseEvent('mousemove', { clientX: 11, clientY: 12, buttons: 1 }));
      window.dispatchEvent(new MouseEvent('mousemove', { clientX: 22, clientY: 24, buttons: 1 }));
    });

    expect(requestAnimationFrame).toHaveBeenCalledTimes(1);

    act(() => {
      flushRaf();
    });

    expect(onMove).toHaveBeenCalledTimes(1);
    expect(onMove).toHaveBeenCalledWith(22, 24, expect.any(Number));
  });

  it('passes the original input event timestamp through rAF batching and drag end', () => {
    const onMove = vi.fn();
    const onEnd = vi.fn();
    const { result } = renderHook(() => useRafDrag({ onMove, onEnd }));

    act(() => {
      result.current.startDrag({ clientX: 0, clientY: 0, timeStamp: 1000 });
      window.dispatchEvent(withTimeStamp(new MouseEvent('mousemove', { clientX: 12, clientY: 14, buttons: 1 }), 1040));
      flushRaf();
      window.dispatchEvent(withTimeStamp(new MouseEvent('mouseup', { clientX: 12, clientY: 14 }), 1050));
    });

    expect(onMove).toHaveBeenCalledWith(12, 14, 1040);
    expect(onEnd).toHaveBeenCalledWith(12, 14, 1050);
  });

  it('injects a high-specificity global cursor override on drag start and removes it on drag end', () => {
    const preExistingBodyCursor = 'crosshair';
    document.body.style.cursor = preExistingBodyCursor;
    const onMove = vi.fn();
    const onEnd = vi.fn();
    const { result } = renderHook(() => useRafDrag({ onMove, onEnd, cursor: 'grabbing' }));

    act(() => {
      result.current.startDrag({ clientX: 5, clientY: 6 });
      window.dispatchEvent(new MouseEvent('mousemove', { clientX: 30, clientY: 40, buttons: 1 }));
    });

    // A <style data-use-raf-drag-cursor> tag should be appended to <head>
    // with a selector whose specificity beats existing `.a .b { cursor:
    // pointer !important }` rules. `:root:root:root:root *` reaches (0, 4,
    // 0) which is above any realistic class-scoped rule in the codebase.
    const styleEl = document.head.querySelector<HTMLStyleElement>('style[data-use-raf-drag-cursor]');
    expect(styleEl).not.toBeNull();
    expect(styleEl?.textContent).toContain('cursor:grabbing !important');
    expect(styleEl?.textContent).toContain(':root:root:root:root');
    expect(styleEl?.textContent).not.toMatch(/^\*\s*,/);
    // document.body.style.cursor must NOT be touched — the override is
    // strictly via the injected style tag.
    expect(document.body.style.cursor).toBe(preExistingBodyCursor);

    act(() => {
      window.dispatchEvent(new MouseEvent('mouseup', { clientX: 50, clientY: 60 }));
    });

    expect(cancelAnimationFrame).toHaveBeenCalledTimes(1);
    expect(onMove).toHaveBeenCalledWith(50, 60, expect.any(Number));
    expect(onEnd).toHaveBeenCalledWith(50, 60, expect.any(Number));
    expect(result.current.isDraggingRef.current).toBe(false);
    expect(document.head.querySelector('style[data-use-raf-drag-cursor]')).toBeNull();
    expect(document.body.style.cursor).toBe(preExistingBodyCursor);
  });

  it('removes the injected cursor style tag when the hook unmounts mid-drag', () => {
    const onMove = vi.fn();
    const { result, unmount } = renderHook(() => useRafDrag({ onMove, cursor: 'grabbing' }));

    act(() => {
      result.current.startDrag({ clientX: 0, clientY: 0 });
    });

    expect(document.head.querySelector('style[data-use-raf-drag-cursor]')).not.toBeNull();

    unmount();

    expect(document.head.querySelector('style[data-use-raf-drag-cursor]')).toBeNull();
  });

  it('hands an unfinished press to onUnmount rather than onEnd', () => {
    const onMove = vi.fn();
    const onEnd = vi.fn();
    const onUnmount = vi.fn();
    const { result, unmount } = renderHook(() => useRafDrag({ onMove, onEnd, onUnmount }));

    act(() => {
      result.current.startDrag({ clientX: 10, clientY: 20 });
    });
    unmount();

    expect(onUnmount).toHaveBeenCalledTimes(1);
    // onEnd takes a release position, and there is none: the button is still down.
    expect(onEnd).not.toHaveBeenCalled();
  });

  it('does not report an unmount that interrupted nothing', () => {
    const onUnmount = vi.fn();
    const { unmount } = renderHook(() => useRafDrag({ onMove: vi.fn(), onUnmount }));

    unmount();

    expect(onUnmount).not.toHaveBeenCalled();
  });

  it('leaves onUnmount alone when the press ended normally first', () => {
    const onEnd = vi.fn();
    const onUnmount = vi.fn();
    const { result, unmount } = renderHook(() => useRafDrag({ onMove: vi.fn(), onEnd, onUnmount }));

    act(() => {
      result.current.startDrag({ clientX: 10, clientY: 20 });
      window.dispatchEvent(new MouseEvent('mouseup', { clientX: 10, clientY: 20 }));
    });
    unmount();

    expect(onEnd).toHaveBeenCalledTimes(1);
    expect(onUnmount).not.toHaveBeenCalled();
  });

  it('is a no-op for move/up events when not dragging', () => {
    const onMove = vi.fn();
    const onEnd = vi.fn();
    renderHook(() => useRafDrag({ onMove, onEnd }));

    act(() => {
      window.dispatchEvent(new MouseEvent('mousemove', { clientX: 1, clientY: 2 }));
      window.dispatchEvent(new MouseEvent('mouseup', { clientX: 3, clientY: 4 }));
    });

    expect(requestAnimationFrame).not.toHaveBeenCalled();
    expect(onMove).not.toHaveBeenCalled();
    expect(onEnd).not.toHaveBeenCalled();
  });

  it('ends the drag and removes the cursor override on window blur', () => {
    const onMove = vi.fn();
    const onEnd = vi.fn();
    const { result } = renderHook(() => useRafDrag({ onMove, onEnd, cursor: 'grabbing' }));

    act(() => {
      result.current.startDrag({ clientX: 10, clientY: 20 });
      window.dispatchEvent(new MouseEvent('mousemove', { clientX: 111, clientY: 222, buttons: 1 }));
      flushRaf();
    });

    expect(document.head.querySelector('style[data-use-raf-drag-cursor]')).not.toBeNull();
    expect(result.current.isDraggingRef.current).toBe(true);

    act(() => {
      window.dispatchEvent(new Event('blur'));
    });

    expect(result.current.isDraggingRef.current).toBe(false);
    expect(document.head.querySelector('style[data-use-raf-drag-cursor]')).toBeNull();
    expect(onEnd).toHaveBeenCalledWith(111, 222, expect.any(Number));
  });

  it('ends the drag when the document becomes hidden', () => {
    const onMove = vi.fn();
    const onEnd = vi.fn();
    const { result } = renderHook(() => useRafDrag({ onMove, onEnd, cursor: 'grabbing' }));

    act(() => {
      result.current.startDrag({ clientX: 0, clientY: 0 });
      window.dispatchEvent(new MouseEvent('mousemove', { clientX: 77, clientY: 88, buttons: 1 }));
      flushRaf();
    });

    act(() => {
      Object.defineProperty(document, 'visibilityState', { value: 'hidden', configurable: true });
      document.dispatchEvent(new Event('visibilitychange'));
    });

    expect(result.current.isDraggingRef.current).toBe(false);
    expect(document.head.querySelector('style[data-use-raf-drag-cursor]')).toBeNull();
    expect(onEnd).toHaveBeenCalledWith(77, 88, expect.any(Number));

    Object.defineProperty(document, 'visibilityState', { value: 'visible', configurable: true });
  });

  it('does NOT end the drag when the document becomes visible again', () => {
    const onMove = vi.fn();
    const onEnd = vi.fn();
    const { result } = renderHook(() => useRafDrag({ onMove, onEnd, cursor: 'grabbing' }));

    act(() => {
      result.current.startDrag({ clientX: 0, clientY: 0 });
    });

    act(() => {
      Object.defineProperty(document, 'visibilityState', { value: 'visible', configurable: true });
      document.dispatchEvent(new Event('visibilitychange'));
    });

    expect(result.current.isDraggingRef.current).toBe(true);
    expect(onEnd).not.toHaveBeenCalled();
  });

  it('self-heals when mouseup is missed: ends drag on next mousemove with no buttons pressed', () => {
    const onMove = vi.fn();
    const onEnd = vi.fn();
    const { result } = renderHook(() => useRafDrag({ onMove, onEnd, cursor: 'grabbing' }));

    act(() => {
      result.current.startDrag({ clientX: 0, clientY: 0 });
      window.dispatchEvent(new MouseEvent('mousemove', { clientX: 50, clientY: 60, buttons: 1 }));
      flushRaf();
    });
    expect(onMove).toHaveBeenLastCalledWith(50, 60, expect.any(Number));

    act(() => {
      window.dispatchEvent(new MouseEvent('mousemove', { clientX: 999, clientY: 888, buttons: 0 }));
    });

    // Drag ends at the last known in-drag position (50, 60), NOT the
    // re-entry position (999, 888), so panels land where the user actually
    // released rather than where the pointer happened to return.
    expect(result.current.isDraggingRef.current).toBe(false);
    expect(onEnd).toHaveBeenCalledWith(50, 60, expect.any(Number));
    expect(document.head.querySelector('style[data-use-raf-drag-cursor]')).toBeNull();
  });

  it('does not fire blur / visibility handlers when no drag is in progress', () => {
    const onMove = vi.fn();
    const onEnd = vi.fn();
    renderHook(() => useRafDrag({ onMove, onEnd, cursor: 'grabbing' }));

    act(() => {
      window.dispatchEvent(new Event('blur'));
      Object.defineProperty(document, 'visibilityState', { value: 'hidden', configurable: true });
      document.dispatchEvent(new Event('visibilitychange'));
    });

    expect(onEnd).not.toHaveBeenCalled();
    expect(document.head.querySelector('style[data-use-raf-drag-cursor]')).toBeNull();

    Object.defineProperty(document, 'visibilityState', { value: 'visible', configurable: true });
  });

  describe('tracking a touch', () => {
    function pointer(type: string, x: number, pointerId = 4): PointerEvent {
      return new PointerEvent(type, { pointerType: 'touch', pointerId, clientX: x, clientY: 0, bubbles: true });
    }

    function touchMoveCancelled(): boolean {
      const event = new Event('touchmove', { bubbles: true, cancelable: true });
      document.body.dispatchEvent(event);
      return event.defaultPrevented;
    }

    it("follows only that touch's pointer and ends where it lifts, ignoring the mouse", () => {
      const onMove = vi.fn();
      const onEnd = vi.fn();
      const { result } = renderHook(() => useRafDrag({ onMove, onEnd }));

      act(() => {
        result.current.startDrag({ clientX: 0, clientY: 0 }, 4);
        window.dispatchEvent(pointer('pointermove', 30));
        window.dispatchEvent(pointer('pointermove', 99, 5));
        window.dispatchEvent(new MouseEvent('mousemove', { clientX: 77, clientY: 0, buttons: 0 }));
        window.dispatchEvent(new MouseEvent('mouseup', { clientX: 77, clientY: 0 }));
        flushRaf();
      });
      expect(onMove).toHaveBeenCalledExactlyOnceWith(30, 0, expect.any(Number));
      expect(onEnd).not.toHaveBeenCalled();

      act(() => window.dispatchEvent(pointer('pointerup', 40)));
      expect(onEnd).toHaveBeenCalledExactlyOnceWith(40, 0, expect.any(Number));
      expect(result.current.isDraggingRef.current).toBe(false);
    });

    it('cancels rather than ends when the browser takes the touch or the window loses focus', () => {
      const onEnd = vi.fn();
      const onCancel = vi.fn();
      const { result } = renderHook(() => useRafDrag({ onMove: vi.fn(), onEnd, onCancel }));

      act(() => {
        result.current.startDrag({ clientX: 0, clientY: 0 }, 4);
        window.dispatchEvent(pointer('pointercancel', 30));
        window.dispatchEvent(pointer('pointerup', 30));
      });
      act(() => {
        result.current.startDrag({ clientX: 0, clientY: 0 }, 4);
        window.dispatchEvent(new Event('blur'));
      });

      expect(onCancel).toHaveBeenCalledTimes(2);
      expect(onEnd).not.toHaveBeenCalled();
    });

    it('keeps the browser from panning only while the touch drag lasts', () => {
      const remove = listenTouchPanBlock();
      try {
        const { result } = renderHook(() => useRafDrag({ onMove: vi.fn() }));
        act(() => result.current.startDrag({ clientX: 0, clientY: 0 }, 4));
        expect(touchMoveCancelled()).toBe(true);
        act(() => window.dispatchEvent(pointer('pointerup', 0)));
        expect(touchMoveCancelled()).toBe(false);

        // A mouse drag never blocks it.
        act(() => result.current.startDrag({ clientX: 0, clientY: 0 }));
        expect(touchMoveCancelled()).toBe(false);
      } finally {
        remove();
      }
    });
  });
});
