// @vitest-environment happy-dom

import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { animationFrames } from '../../util/animationFrames';
import { createPicoGLRenderer } from '../backends/picogl/PicoGLRenderer';
import { createNullAssetManager, type Renderer } from '../core/renderer';
import { type EffectViewportBuildContext, useEffectViewport } from './useEffectViewport';

vi.mock('../backends/picogl/PicoGLRenderer', () => ({ createPicoGLRenderer: vi.fn() }));

const nativeFrames = new Map<number, FrameRequestCallback>();
let nextId = 0;
const renderer: Renderer = {
  id: 'effect-preview-test',
  supports: () => true,
  init: vi.fn(),
  resize: vi.fn(),
  render: vi.fn(),
  dispose: vi.fn(),
  assets: createNullAssetManager(),
};

function mountViewport(paused = false) {
  const canvasRef = { current: document.createElement('canvas') };
  const containerRef = { current: document.createElement('div') };
  containerRef.current.appendChild(canvasRef.current);
  const buildScene = vi.fn((_context: EffectViewportBuildContext) => {});
  const view = renderHook(({ paused }) => useEffectViewport(canvasRef, containerRef, { paused, buildScene }), {
    initialProps: { paused },
  });
  return { ...view, buildScene };
}

function frameAt(time: number): void {
  vi.mocked(performance.now).mockReturnValue(time);
  act(() => {
    for (const [id, callback] of [...nativeFrames]) {
      if (nativeFrames.delete(id)) callback(time);
    }
  });
}

beforeEach(() => {
  vi.spyOn(performance, 'now').mockReturnValue(1000);
  vi.mocked(createPicoGLRenderer).mockReturnValue(renderer);
  vi.stubGlobal(
    'requestAnimationFrame',
    vi.fn((callback: FrameRequestCallback) => {
      const id = ++nextId;
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
  cleanup();
  animationFrames.setSuspended(false);
  const remainingFrames = nativeFrames.size;
  nativeFrames.clear();
  vi.restoreAllMocks();
  vi.clearAllMocks();
  vi.unstubAllGlobals();
  expect(remainingFrames).toBe(0);
});

describe('useEffectViewport background suspension', () => {
  it('stops scene builds and draws, then resumes the same ticks with only the next frame delta', () => {
    const { buildScene } = mountViewport();
    frameAt(1300);
    frameAt(1600);
    expect(buildScene.mock.lastCall?.[0]).toMatchObject({ tick: 1, interpolatedTick: 1 });
    const queued = [...nativeFrames.values()][0];
    const requests = vi.mocked(requestAnimationFrame).mock.calls.length;

    animationFrames.setSuspended(true);
    frameAt(60_000);
    act(() => queued?.(60_000));

    expect(nativeFrames.size).toBe(0);
    expect(requestAnimationFrame).toHaveBeenCalledTimes(requests);
    expect(buildScene).toHaveBeenCalledTimes(2);
    expect(renderer.render).toHaveBeenCalledTimes(2);

    animationFrames.setSuspended(false);
    frameAt(60_500);

    expect(buildScene).toHaveBeenCalledTimes(3);
    expect(renderer.render).toHaveBeenCalledTimes(3);
    expect(buildScene.mock.lastCall?.[0]).toMatchObject({ tick: 1, interpolatedTick: 1 });
    frameAt(60_650);
    expect(buildScene.mock.lastCall?.[0]).toMatchObject({ tick: 1, interpolatedTick: 1.25 });
    expect(createPicoGLRenderer).toHaveBeenCalledOnce();
    expect(renderer.init).toHaveBeenCalledOnce();
    expect(renderer.dispose).not.toHaveBeenCalled();
  });

  it('starts at zero when mounted suspended and waits for the resumed native timestamp', () => {
    animationFrames.setSuspended(true);
    const { buildScene } = mountViewport();

    frameAt(60_000);

    expect(requestAnimationFrame).not.toHaveBeenCalled();
    expect(buildScene).not.toHaveBeenCalled();
    expect(renderer.render).not.toHaveBeenCalled();
    animationFrames.setSuspended(false);
    frameAt(60_500);
    expect(buildScene.mock.lastCall?.[0]).toMatchObject({ tick: 0, interpolatedTick: 0 });
    frameAt(60_800);
    expect(buildScene.mock.lastCall?.[0]).toMatchObject({ tick: 0, interpolatedTick: 0.5 });
  });

  it('preserves explicit pause through suspension while continuing to draw after resume', () => {
    const { buildScene, rerender } = mountViewport(true);
    frameAt(1300);
    animationFrames.setSuspended(true);
    frameAt(60_000);

    animationFrames.setSuspended(false);
    frameAt(60_500);
    frameAt(60_800);

    expect(buildScene).toHaveBeenCalledTimes(3);
    expect(renderer.render).toHaveBeenCalledTimes(3);
    expect(buildScene.mock.calls.map(([context]) => context.interpolatedTick)).toEqual([0, 0, 0]);
    rerender({ paused: false });
    frameAt(61_100);
    expect(buildScene.mock.lastCall?.[0].interpolatedTick).toBe(0.5);
  });

  it.each([false, true])('ignores late callbacks after unmount (suspended: %s)', (suspended) => {
    const { buildScene, unmount } = mountViewport();
    frameAt(1300);
    const queued = [...nativeFrames.values()][0];
    animationFrames.setSuspended(suspended);

    unmount();
    animationFrames.setSuspended(false);
    act(() => queued?.(60_000));

    expect(nativeFrames.size).toBe(0);
    expect(buildScene).toHaveBeenCalledOnce();
    expect(renderer.render).toHaveBeenCalledOnce();
    expect(renderer.dispose).toHaveBeenCalledOnce();
  });
});
