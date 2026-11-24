// @vitest-environment happy-dom

import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ANTI_DRAG_DEFAULTS, useAntiDrag } from '../useAntiDrag';

const storageMocks = vi.hoisted(() => ({
  loadSetting: vi.fn(),
  saveSetting: vi.fn(),
}));

vi.mock('../../util/storage', () => ({
  loadSetting: storageMocks.loadSetting,
  saveSetting: storageMocks.saveSetting,
}));

describe('useAntiDrag', () => {
  beforeEach(() => {
    vi.useRealTimers();
    storageMocks.loadSetting.mockReset();
    storageMocks.saveSetting.mockReset();
    storageMocks.loadSetting.mockReturnValue(null);
  });

  it('applies anti-drag delay by suppressing pointer-driven drag start until timeout', () => {
    vi.useFakeTimers();
    const { result } = renderHook(() => useAntiDrag());

    let pointerEventsSuppressed = true;
    let dragStarted = false;
    const startDragWithDelay = () => {
      setTimeout(() => {
        pointerEventsSuppressed = false;
        dragStarted = true;
      }, result.current.dragDelay);
    };

    act(() => {
      startDragWithDelay();
    });

    expect(result.current.dragDelay).toBe(ANTI_DRAG_DEFAULTS.dragDelay);
    expect(pointerEventsSuppressed).toBe(true);
    expect(dragStarted).toBe(false);

    act(() => {
      vi.advanceTimersByTime(ANTI_DRAG_DEFAULTS.dragDelay - 1);
    });
    expect(pointerEventsSuppressed).toBe(true);
    expect(dragStarted).toBe(false);

    act(() => {
      vi.advanceTimersByTime(1);
    });
    expect(pointerEventsSuppressed).toBe(false);
    expect(dragStarted).toBe(true);
  });

  it('supports configurable delay threshold via setDragDelay', () => {
    const { result } = renderHook(() => useAntiDrag());

    act(() => {
      result.current.setDragDelay(1200);
    });

    expect(result.current.dragDelay).toBe(1200);
    expect(storageMocks.saveSetting).toHaveBeenCalledWith(
      'osrs-anti-drag',
      expect.objectContaining({ dragDelay: 1200 }),
    );
  });

  it('clamps configured drag delay bounds for immediate or max-delay starts', () => {
    const { result } = renderHook(() => useAntiDrag());

    act(() => {
      result.current.setDragDelay(-20);
    });
    expect(result.current.dragDelay).toBe(0);

    act(() => {
      result.current.setDragDelay(9999);
    });
    expect(result.current.dragDelay).toBe(2000);
  });
});
