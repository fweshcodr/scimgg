// @vitest-environment happy-dom
import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { animationFrames } from '../../util/animationFrames';
import {
  type FightStartCountdownParams,
  fightStartCountdownWindow,
  useFightStartCountdown,
} from '../useFightStartCountdown';

describe('fightStartCountdownWindow', () => {
  it('runs a plain countdown from now when there is no intro to end with', () => {
    expect(fightStartCountdownWindow(1000, 3000)).toEqual({ startsAtMs: 1000, endsAtMs: 4000 });
  });

  it('ends with an intro longer than the countdown, starting it that much before the intro ends', () => {
    expect(fightStartCountdownWindow(1000, 3000, 4500)).toEqual({ startsAtMs: 2500, endsAtMs: 5500 });
    expect(fightStartCountdownWindow(1000, 3000, 3000)).toEqual({ startsAtMs: 1000, endsAtMs: 4000 });
  });

  it('starts with an intro shorter than the countdown, holding the fight past the intro', () => {
    expect(fightStartCountdownWindow(1000, 3000, 1200)).toEqual({ startsAtMs: 1000, endsAtMs: 4000 });
    expect(fightStartCountdownWindow(1000, 3000, 0)).toEqual({ startsAtMs: 1000, endsAtMs: 4000 });
  });
});

describe('useFightStartCountdown tick snapshots and tempo', () => {
  let nowMs: number;
  let frames: Map<number, FrameRequestCallback>;
  let params: FightStartCountdownParams;
  beforeEach(() => {
    nowMs = 0;
    frames = new Map();
    let nextId = 0;
    vi.spyOn(performance, 'now').mockImplementation(() => nowMs);
    vi.spyOn(window, 'requestAnimationFrame').mockImplementation((callback) => {
      frames.set(++nextId, callback);
      return nextId;
    });
    vi.spyOn(window, 'cancelAnimationFrame').mockImplementation((id) => {
      frames.delete(id);
    });
    params = {
      countdownTicks: 3,
      speedMultiplier: 1,
      covered: false,
      introActive: false,
      getIntroRemainingMs: (_expectedSpeedMultiplier: number) => undefined,
    };
  });
  afterEach(() => {
    cleanup();
    animationFrames.setSuspended(false);
    animationFrames.clock.reset();
    vi.restoreAllMocks();
  });
  const advanceFrame = (timeMs: number) => {
    nowMs = timeMs;
    const queued = [...frames.values()];
    frames.clear();
    act(() => {
      for (const frame of queued) frame(timeMs);
    });
  };

  it.each(
    [1, 3, 5].flatMap((tickCount) => [0.5, 1, 2].map((speedMultiplier) => ({ tickCount, speedMultiplier }))),
  )('captures $tickCount ticks at $speedMultiplier x and releases at the complete tick window', ({
    tickCount,
    speedMultiplier,
  }) => {
    params = { ...params, countdownTicks: tickCount, speedMultiplier };
    const { result } = renderHook(useFightStartCountdown, { initialProps: params });
    act(() => result.current.start());
    const tickMs = 600 / speedMultiplier;
    expect(result.current.descriptor).toMatchObject({
      startsAtMs: 0,
      endsAtMs: tickCount * tickMs,
      tickCount,
      tickMs,
      releasedAtMs: null,
    });
    advanceFrame(tickCount * tickMs - 1);
    expect(result.current.holding).toBe(true);
    advanceFrame(tickCount * tickMs);
    expect(result.current.holding).toBe(false);
    expect(result.current.descriptor?.releasedAtMs).toBe(tickCount * tickMs);
  });

  it('snapshots count edits until the next start', () => {
    const { result, rerender } = renderHook(useFightStartCountdown, { initialProps: params });
    act(() => result.current.start());
    const first = result.current.descriptor;
    params = { ...params, countdownTicks: 5 };
    rerender(params);
    expect(result.current.descriptor).toEqual(first);
    advanceFrame(1800);
    expect(result.current.descriptor?.tickCount).toBe(3);
    nowMs = 2500;
    act(() => result.current.start());
    expect(result.current.descriptor).toMatchObject({ tickCount: 5, tickMs: 600, startsAtMs: 2500, endsAtMs: 5500 });
    expect(result.current.descriptor?.key).not.toBe(first?.key);
  });

  it('restarts the full count at a changed tempo and cancels the old deadline', () => {
    const { result, rerender } = renderHook(useFightStartCountdown, { initialProps: params });
    act(() => result.current.start());
    const old = result.current.descriptor;
    nowMs = 1000;
    rerender({ ...params, speedMultiplier: 0.5 });
    expect(result.current.descriptor).toMatchObject({
      tickCount: 3,
      tickMs: 1200,
      startsAtMs: 1000,
      endsAtMs: 4600,
      releasedAtMs: null,
    });
    expect(result.current.descriptor?.key).not.toBe(old?.key);
    advanceFrame(1800);
    expect(result.current.holding).toBe(true);
    advanceFrame(4599);
    expect(result.current.holding).toBe(true);
    advanceFrame(4600);
    expect(result.current.holding).toBe(false);
  });

  it('combines cover and tempo rearm, then captures the current settings on uncover', () => {
    const { result, rerender } = renderHook(useFightStartCountdown, { initialProps: params });
    act(() => result.current.start());
    const firstKey = result.current.descriptor?.key ?? -1;
    params = { ...params, covered: true, speedMultiplier: 2 };
    rerender(params);
    expect(result.current.descriptor).toBeNull();
    expect(frames.size).toBe(0);
    params = { ...params, countdownTicks: 5 };
    rerender(params);
    nowMs = 2000;
    rerender({ ...params, covered: false });
    expect(result.current.descriptor).toMatchObject({
      key: firstKey + 2,
      tickCount: 5,
      tickMs: 300,
      startsAtMs: 2000,
      endsAtMs: 3500,
    });
  });

  it('waits through several FPS-capped RAFs until the renderer acknowledges the requested tempo', () => {
    let remaining: number | null = 4500;
    let rendererSpeed = 1;
    const getter = vi.fn((expectedSpeedMultiplier: number) =>
      expectedSpeedMultiplier === rendererSpeed ? remaining : null,
    );
    params = { ...params, introActive: true, getIntroRemainingMs: getter };
    const { result, rerender } = renderHook(useFightStartCountdown, { initialProps: params });
    act(() => result.current.start());
    const oldKey = result.current.descriptor?.key;
    expect(result.current.descriptor).toMatchObject({ startsAtMs: 2700, endsAtMs: 4500 });
    nowMs = 1000;
    remaining = 3500; // The FPS cap skips builds, not just the first RAF.
    params = { ...params, speedMultiplier: 2 };
    rerender(params);
    expect(result.current.descriptor).toBeNull();
    for (const frame of [1016, 1032, 1048]) {
      advanceFrame(frame);
      expect(result.current.descriptor).toBeNull();
      expect(result.current.active).toBe(true);
      expect(result.current.holding).toBe(true);
      expect(getter).toHaveBeenLastCalledWith(2);
    }
    rendererSpeed = 2;
    remaining = 1702; // Already speed-adjusted, with the same 2766ms actual end.
    advanceFrame(1064);
    expect(result.current.descriptor).toMatchObject({ tickCount: 3, tickMs: 300, startsAtMs: 1866, endsAtMs: 2766 });
    expect(result.current.descriptor?.key).not.toBe(oldKey);
    advanceFrame(2766);
    expect(result.current.holding).toBe(true);
    expect(frames.size).toBe(0);
    nowMs = 3000;
    rerender({ ...params, introActive: false });
    expect(result.current.descriptor?.releasedAtMs).toBe(3000);
  });

  it('rearms while an intro is still pending and when the final 1 is held past its prediction', () => {
    let remaining: number | null = null;
    params = { ...params, introActive: true, getIntroRemainingMs: (_expectedSpeedMultiplier: number) => remaining };
    const { result, rerender } = renderHook(useFightStartCountdown, { initialProps: params });
    act(() => result.current.start());
    rerender({ ...params, speedMultiplier: 2 });
    remaining = 900;
    advanceFrame(100);
    expect(result.current.descriptor).toMatchObject({ tickMs: 300, endsAtMs: 1000 });
    advanceFrame(1000);
    expect(result.current.holding).toBe(true);
    nowMs = 1100;
    remaining = 0;
    params = { ...params, speedMultiplier: 0.5 };
    rerender(params);
    advanceFrame(1116);
    expect(result.current.descriptor).toMatchObject({
      tickMs: 1200,
      startsAtMs: 1100,
      endsAtMs: 4700,
      releasedAtMs: null,
    });
  });

  it('never changes an already-live snapshot or key on tempo/count edits', () => {
    const { result, rerender } = renderHook(useFightStartCountdown, { initialProps: params });
    act(() => result.current.start());
    advanceFrame(1800);
    const live = result.current.descriptor;
    nowMs = 1900;
    rerender({ ...params, speedMultiplier: 2, countdownTicks: 5 });
    expect(result.current.descriptor).toEqual(live);
    expect(result.current.holding).toBe(false);
  });

  it('cancels both timed and untimed countdowns when disabled', () => {
    const { result, rerender } = renderHook(useFightStartCountdown, { initialProps: params });
    act(() => result.current.start());
    rerender({ ...params, countdownTicks: null });
    expect(result.current.descriptor).toBeNull();
    expect(result.current.holding).toBe(false);
    expect(frames.size).toBe(0);
    params = { ...params, introActive: true, getIntroRemainingMs: (_expectedSpeedMultiplier: number) => null };
    rerender(params);
    act(() => result.current.start());
    expect(result.current.holding).toBe(true);
    rerender({ ...params, countdownTicks: null });
    expect(result.current.holding).toBe(false);
    expect(frames.size).toBe(0);
  });

  it('keeps explicit active status through long pending, cover, counting and GO until finish/cancel', () => {
    let remaining: number | null = null;
    params = { ...params, introActive: true, getIntroRemainingMs: (_expectedSpeedMultiplier: number) => remaining };
    const { result, rerender } = renderHook(useFightStartCountdown, { initialProps: params });
    expect(result.current.active).toBe(false);
    act(() => result.current.start());
    advanceFrame(4000);
    expect(result.current.active).toBe(true);
    expect(result.current.descriptor).toBeNull();
    rerender({ ...params, covered: true });
    expect(result.current.active).toBe(true);
    expect(result.current.descriptor).toBeNull();
    nowMs = 4100;
    rerender(params);
    remaining = 1800;
    advanceFrame(4116);
    const key = result.current.descriptor?.key ?? -1;
    expect(result.current.active).toBe(true);
    advanceFrame(5916);
    act(() => result.current.finish(key));
    expect(result.current.active).toBe(true);
    nowMs = 6000;
    rerender({ ...params, introActive: false });
    expect(result.current.active).toBe(true);
    expect(result.current.holding).toBe(false);
    act(() => result.current.finish(key));
    expect(result.current.active).toBe(false);
    act(() => result.current.start());
    expect(result.current.active).toBe(true);
    act(() => result.current.cancel());
    expect(result.current.active).toBe(false);
  });
});
