// @vitest-environment happy-dom

import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AUTO_SETTLE_MS, useAutoOverlayScales } from '../useAutoOverlayScale';

describe('useAutoOverlayScales', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  function setup(width: number, height: number, dpr = 1) {
    const seen: number[] = [];
    const view = renderHook(
      ({ w, h, d }) => {
        const window = { width: w, height: h };
        const scale = useAutoOverlayScales({ window, gameView: window }, d).scene;
        if (seen.at(-1) !== scale) seen.push(scale);
        return scale;
      },
      { initialProps: { w: width, h: height, d: dpr } },
    );
    return { ...view, seen };
  }

  it('takes the first measurement as it is', () => {
    expect(setup(2560, 1300).result.current).toBe(1.25);
  });

  it('holds its size through a window drag and changes once, after the drag settles', () => {
    const { result, rerender, seen } = setup(2560, 1300);
    expect(result.current).toBe(1.25);
    // A drag from 1440p to 4K, a step every 16ms: past 1.5 and into 2.
    for (let i = 1; i <= 60; i++) {
      rerender({ w: 2560 + (1280 * i) / 60, h: 1300 + (720 * i) / 60, d: 1 });
      act(() => vi.advanceTimersByTime(16));
    }
    expect(result.current).toBe(1.25);
    act(() => vi.advanceTimersByTime(AUTO_SETTLE_MS - 17));
    expect(result.current).toBe(1.25);
    act(() => vi.advanceTimersByTime(1));
    expect(result.current).toBe(2);
    // One change, straight to the final size: never through a size in between.
    expect(seen).toEqual([1.25, 2]);
  });

  it('cancels a pending change when the window returns inside the band', () => {
    const { result, rerender } = setup(2560, 1300);
    rerender({ w: 1920, h: 970, d: 1 });
    act(() => vi.advanceTimersByTime(AUTO_SETTLE_MS / 2));
    rerender({ w: 2560, h: 1300, d: 1 });
    act(() => vi.advanceTimersByTime(AUTO_SETTLE_MS * 2));
    expect(result.current).toBe(1.25);
  });

  it('follows a move to a display with another pixel ratio, on the same settle', () => {
    const { result, rerender } = setup(2560, 1300, 1.5);
    expect(result.current).toBeCloseTo(4 / 3, 9);
    rerender({ w: 2560, h: 1300, d: 1 });
    act(() => vi.advanceTimersByTime(AUTO_SETTLE_MS));
    expect(result.current).toBe(1.25);
  });

  it('settles the window and game view sizes together, in one change', () => {
    const seen: Array<{ chrome: number; scene: number }> = [];
    const fixedFit = (w: number, h: number) => {
      // Fixed fit-to-window: the scene is the stretched 512x334 view of a 765x503 client.
      const scale = Math.min(w / 765, h / 503);
      return { window: { width: w, height: h }, gameView: { width: 512 * scale, height: 334 * scale } };
    };
    const { result, rerender } = renderHook(
      ({ spaces }) => {
        const scales = useAutoOverlayScales(spaces, 1);
        const last = seen.at(-1);
        if (!last || last.chrome !== scales.chrome || last.scene !== scales.scene) seen.push(scales);
        return scales;
      },
      { initialProps: { spaces: fixedFit(1920, 970) } },
    );
    expect(result.current).toEqual({ chrome: 1, scene: 1 });
    for (let i = 1; i <= 30; i++) {
      rerender({ spaces: fixedFit(1920 + (1920 * i) / 30, 970 + (1050 * i) / 30) });
      act(() => vi.advanceTimersByTime(16));
    }
    act(() => vi.advanceTimersByTime(AUTO_SETTLE_MS));
    // Buttons from the 3840x2020 window, overlays from the fixed view inside it; one step.
    expect(seen).toEqual([
      { chrome: 1, scene: 1 },
      { chrome: 2, scene: 1.25 },
    ]);
  });
});
