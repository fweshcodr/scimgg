// @vitest-environment happy-dom

import { act, cleanup, render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createPicoGLRenderer } from '../../render/backends/picogl/PicoGLRenderer';
import type { AnimationSystem } from '../../render/core/animation';
import { createNullAssetManager, type Renderer, type RenderStatus } from '../../render/core/renderer';
import type { BossPortraitConfig } from '../../render/preview/bossPortraitFraming';
import { type BossPortraitPoser, createBossPortraitPoser } from '../../render/preview/bossPortraitPoser';
import type { NpcModelLoader } from '../../rs/model/NpcModelLoader';
import { animationFrames } from '../../util/animationFrames';
import { TOUCH_ONLY_QUERY } from '../../util/mobileDetection';
import { BOSS_PORTRAIT_MAX_FPS, BossPortrait, type BossPortraitProps } from '../BossPortrait';

vi.mock('../../render/backends/picogl/PicoGLRenderer', () => ({ createPicoGLRenderer: vi.fn() }));
vi.mock('../../render/preview/bossPortraitPoser', () => ({ createBossPortraitPoser: vi.fn() }));

const REDUCED_MOTION_QUERY = '(prefers-reduced-motion: reduce)';
const FRAME_INTERVAL_MS = 1000 / BOSS_PORTRAIT_MAX_FPS;
/** A 60 Hz display's frame period. */
const VSYNC_MS = 1000 / 60;

const PORTRAIT: BossPortraitConfig = {
  npcTypeId: 7706,
  framing: { yaw: 0, pitch: -12, focusHeight: 0.75, span: 0.5 },
};
const PRESENTATION: BossPortraitProps['presentation'] = {
  thumb: '/assets/encounters/zuk-head.png',
  thumbFit: 'contain',
  portrait: PORTRAIT,
};
const NPC_MODEL_LOADER = {} as NpcModelLoader;
const ANIMATION_SYSTEM = {} as AnimationSystem;

let nowMs = 0;
const nativeFrames = new Map<number, FrameRequestCallback>();
let nextFrameId = 0;
const idleCallbacks: (() => void)[] = [];
const matchingQueries = new Set<string>();
let intersectionCallback: IntersectionObserverCallback | null = null;
let visibility: DocumentVisibilityState = 'visible';
let bounds = { width: 88, height: 86 };
let resizeCallback: (() => void) | null = null;

let statusListeners: Set<(status: RenderStatus) => void>;
let contextStatus: RenderStatus;
/** `nowMs` at each draw. */
let drawTimes: number[];
let renderer: Renderer & {
  getContextStatus(): RenderStatus;
  subscribeContextStatus(listener: (status: RenderStatus) => void): () => void;
};
let poser: BossPortraitPoser & { poseAt: ReturnType<typeof vi.fn> };

function makePoser(cycleMs: number): typeof poser {
  return {
    cycleMs,
    points: Float32Array.of(-1, -1, 0, 1, 1, 4),
    poseAt: vi.fn(() => ({
      positions: new Float32Array(9),
      normals: new Float32Array(9),
      hslColors: new Float32Array(3),
      alphas: new Float32Array(3).fill(1),
      faceBias: new Float32Array(3),
      modelFaceIndices: new Uint32Array(1),
    })),
  };
}

function setContextStatus(status: RenderStatus): void {
  contextStatus = status;
  act(() => {
    for (const listener of [...statusListeners]) listener(status);
  });
}

function mount(props: Partial<BossPortraitProps> = {}) {
  const all: BossPortraitProps = {
    presentation: PRESENTATION,
    npcModelLoader: NPC_MODEL_LOADER,
    animationSystem: ANIMATION_SYSTEM,
    ...props,
  };
  const view = render(<BossPortrait {...all} />);
  return {
    ...view,
    root: () => view.container.firstElementChild as HTMLElement,
    canvas: () => view.container.querySelector('canvas'),
    thumb: () => view.container.querySelector('img'),
    update: (next: Partial<BossPortraitProps>) => view.rerender(<BossPortrait {...all} {...next} />),
  };
}

function runIdle(): void {
  act(() => {
    for (const callback of idleCallbacks.splice(0)) callback();
  });
}

function frameAt(time: number): void {
  nowMs = time;
  act(() => {
    for (const [id, callback] of [...nativeFrames]) {
      if (nativeFrames.delete(id)) callback(time);
    }
  });
}

/** Runs vsync frames from `fromMs` up to `untilMs`; returns the last frame's time. */
function runFrames(fromMs: number, untilMs: number): number {
  let time = fromMs;
  for (let i = 0; time <= untilMs; i++) {
    time = fromMs + i * VSYNC_MS;
    frameAt(time);
  }
  return time;
}

function setVisibility(next: DocumentVisibilityState): void {
  visibility = next;
  act(() => {
    document.dispatchEvent(new Event('visibilitychange'));
  });
}

function setIntersecting(isIntersecting: boolean): void {
  act(() => {
    intersectionCallback?.([{ isIntersecting } as IntersectionObserverEntry], {} as IntersectionObserver);
  });
}

beforeEach(() => {
  bounds = { width: 88, height: 86 };
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(() => bounds as DOMRect);
  vi.stubGlobal(
    'ResizeObserver',
    class {
      constructor(callback: () => void) {
        resizeCallback = callback;
      }
      observe(): void {}
      disconnect(): void {
        resizeCallback = null;
      }
    },
  );
  nowMs = 0;
  drawTimes = [];
  statusListeners = new Set();
  contextStatus = { kind: 'ok' };
  renderer = {
    id: 'boss-portrait-test',
    supports: () => true,
    init: vi.fn(),
    resize: vi.fn(),
    render: vi.fn(() => {
      drawTimes.push(nowMs);
    }),
    dispose: vi.fn(),
    assets: createNullAssetManager(),
    getContextStatus: () => contextStatus,
    subscribeContextStatus: (listener) => {
      statusListeners.add(listener);
      return () => statusListeners.delete(listener);
    },
  };
  vi.mocked(createPicoGLRenderer).mockReturnValue(renderer as never);
  poser = makePoser(1800);
  vi.mocked(createBossPortraitPoser).mockImplementation(() => poser);

  vi.stubGlobal(
    'requestAnimationFrame',
    vi.fn((callback: FrameRequestCallback) => {
      const id = ++nextFrameId;
      nativeFrames.set(id, callback);
      return id;
    }),
  );
  vi.stubGlobal(
    'cancelAnimationFrame',
    vi.fn((id: number) => nativeFrames.delete(id)),
  );
  vi.stubGlobal(
    'requestIdleCallback',
    vi.fn((callback: () => void) => idleCallbacks.push(callback)),
  );
  vi.stubGlobal('cancelIdleCallback', vi.fn());
  vi.stubGlobal(
    'matchMedia',
    vi.fn((query: string) => ({
      matches: matchingQueries.has(query),
      media: query,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    })),
  );
  vi.stubGlobal(
    'IntersectionObserver',
    class {
      constructor(callback: IntersectionObserverCallback) {
        intersectionCallback = callback;
      }
      observe(): void {}
      disconnect(): void {
        intersectionCallback = null;
      }
    },
  );
  visibility = 'visible';
  vi.spyOn(document, 'visibilityState', 'get').mockImplementation(() => visibility);
});

afterEach(() => {
  cleanup();
  animationFrames.setSuspended(false);
  const pendingFrames = nativeFrames.size;
  nativeFrames.clear();
  idleCallbacks.length = 0;
  matchingQueries.clear();
  intersectionCallback = null;
  resizeCallback = null;
  vi.restoreAllMocks();
  vi.clearAllMocks();
  vi.unstubAllGlobals();
  expect(pendingFrames).toBe(0);
});

describe('BossPortrait fallback', () => {
  it('shows the thumb, and builds nothing, until the cache loaders are ready', () => {
    const view = mount({ npcModelLoader: null, animationSystem: null });

    expect(view.thumb()?.getAttribute('src')).toBe(PRESENTATION.thumb);
    expect(view.root().style.width).toBe('');
    expect(idleCallbacks).toHaveLength(0);
    expect(createPicoGLRenderer).not.toHaveBeenCalled();

    view.update({ npcModelLoader: NPC_MODEL_LOADER });
    expect(idleCallbacks).toHaveLength(0);
  });

  it('keeps the thumb until an idle callback has drawn the first frame, then swaps to the canvas', () => {
    const view = mount();
    expect(view.thumb()).not.toBeNull();
    expect(view.canvas()).toBeNull();
    expect(createPicoGLRenderer).not.toHaveBeenCalled();

    runIdle();

    expect(renderer.init).toHaveBeenCalledWith(view.canvas());
    expect(renderer.resize).toHaveBeenCalledWith({ width: 88, height: 86, dpr: expect.any(Number) });
    expect(renderer.render).toHaveBeenCalledOnce();
    expect(poser.poseAt).toHaveBeenCalledWith(0);
    expect(view.thumb()).toBeNull();
    expect(view.root().dataset.portrait).toBe('live');
  });

  it('stays on the thumb, holding no canvas or renderer, when WebGL init fails', () => {
    vi.mocked(renderer.init).mockImplementation(() => {
      throw new Error('WebGL2 not supported');
    });
    const view = mount();
    runIdle();

    expect(view.thumb()).not.toBeNull();
    expect(view.canvas()).toBeNull();
    expect(renderer.dispose).toHaveBeenCalledOnce();
    expect(view.root().dataset.portrait).toBe('thumb');
  });

  it('stays on the thumb when the npc model does not load', () => {
    vi.mocked(createBossPortraitPoser).mockReturnValue(null);
    const view = mount();
    runIdle();

    expect(view.thumb()).not.toBeNull();
    expect(view.canvas()).toBeNull();
    expect(renderer.render).not.toHaveBeenCalled();
    expect(renderer.dispose).toHaveBeenCalledOnce();
  });

  it('stays on the thumb when the first draw throws', () => {
    vi.mocked(renderer.render).mockImplementation(() => {
      throw new Error('draw failed');
    });
    const view = mount();
    runIdle();

    expect(view.thumb()).not.toBeNull();
    expect(view.canvas()).toBeNull();
    expect(renderer.dispose).toHaveBeenCalledOnce();
  });

  it('returns to the thumb for good when the context is lost, releasing the renderer', () => {
    const view = mount();
    runIdle();
    frameAt(0);
    frameAt(100);
    const draws = drawTimes.length;

    setContextStatus({ kind: 'lost' });

    expect(view.thumb()).not.toBeNull();
    expect(view.canvas()).toBeNull();
    expect(renderer.dispose).toHaveBeenCalledOnce();
    expect(nativeFrames.size).toBe(0);
    setContextStatus({ kind: 'ok' });
    runFrames(200, 1000);
    expect(drawTimes).toHaveLength(draws);
    expect(createPicoGLRenderer).toHaveBeenCalledOnce();
  });

  it('never goes live on a context that is lost before the first frame', () => {
    contextStatus = { kind: 'lost' };
    const view = mount();
    runIdle();

    expect(view.thumb()).not.toBeNull();
    expect(renderer.render).not.toHaveBeenCalled();
    expect(renderer.dispose).toHaveBeenCalledOnce();
  });

  it('releases the renderer and detaches its canvas on unmount', () => {
    const view = mount();
    runIdle();
    frameAt(0);
    const canvas = view.canvas();

    view.unmount();

    expect(renderer.dispose).toHaveBeenCalledOnce();
    expect(canvas?.isConnected).toBe(false);
    expect(statusListeners.size).toBe(0);
  });

  it('builds nothing when unmounted before its idle callback', () => {
    const view = mount();
    view.unmount();
    expect(cancelIdleCallback).toHaveBeenCalled();
    expect(createPicoGLRenderer).not.toHaveBeenCalled();
  });
});

describe('BossPortrait motion', () => {
  it.each([
    ['a touch-only device', () => matchingQueries.add(TOUCH_ONLY_QUERY), {}],
    ['the still prop', () => {}, { still: true }],
  ] as const)('draws one still frame and runs no frame loop under %s', (_label, arrange, props) => {
    arrange();
    mount(props);
    runIdle();
    runFrames(0, 1000);

    expect(requestAnimationFrame).not.toHaveBeenCalled();
    expect(renderer.render).toHaveBeenCalledOnce();
    expect(poser.poseAt).toHaveBeenCalledExactlyOnceWith(0);
  });

  it(`idles at no more than ${BOSS_PORTRAIT_MAX_FPS} fps, wrapping rather than stopping at the cycle's end`, () => {
    mount();
    runIdle();
    // The poser's cycle is 1800ms, so 5000ms is nearly three times round it.
    runFrames(0, 5000);

    const intervals = drawTimes.slice(2).map((time, i) => time - drawTimes[i + 1]);
    expect(intervals.length).toBeGreaterThan(10);
    for (const interval of intervals) expect(interval).toBeGreaterThanOrEqual(FRAME_INTERVAL_MS);
    const poses = poser.poseAt.mock.calls.map(([ms]) => ms as number);
    // Every pose stays inside the cycle, and the loop is still drawing at the end of the run:
    // a play budget would stop it on its first pose after 1800ms.
    for (const ms of poses) expect(ms).toBeLessThan(1800);
    expect(poses.length).toBeGreaterThan(30);
    // It went round at least twice, which only a wrap can do.
    expect(poses.filter((ms, i) => i > 0 && ms < poses[i - 1]).length).toBeGreaterThanOrEqual(2);
    // Still armed: an idle that is still on screen and unpaused never runs out of frames.
    expect(nativeFrames.size).toBe(1);
  });

  it('still idles under reduced motion', () => {
    matchingQueries.add(REDUCED_MOTION_QUERY);
    mount();
    runIdle();
    runFrames(0, 1000);

    expect(poser.poseAt.mock.calls.length).toBeGreaterThan(5);
    expect(nativeFrames.size).toBe(1);
  });

  it('keeps idling a stand cycle longer than four seconds', () => {
    poser = makePoser(9000);
    mount();
    runIdle();
    runFrames(0, 6000);

    const poses = poser.poseAt.mock.calls.map(([ms]) => ms as number);
    expect(poses.at(-1)).toBeGreaterThan(4000);
    expect(drawTimes.at(-1)).toBeGreaterThan(5000);
    expect(nativeFrames.size).toBe(1);
  });

  it('runs no frame loop for an npc with only a rest pose', () => {
    poser = makePoser(0);
    mount();
    runIdle();
    expect(requestAnimationFrame).not.toHaveBeenCalled();
  });

  it.each([
    [
      'the paused prop',
      (view: ReturnType<typeof mount>) => view.update({ paused: true }),
      (view: ReturnType<typeof mount>) => view.update({ paused: false }),
    ],
    ['a hidden document', () => setVisibility('hidden'), () => setVisibility('visible')],
    ['leaving the screen', () => setIntersecting(false), () => setIntersecting(true)],
  ] as const)('stops its frame loop under %s and resumes where it held, without jumping', (_label, pause, resume) => {
    const view = mount();
    runIdle();
    const last = runFrames(0, 500);
    const heldAt = poser.poseAt.mock.lastCall?.[0] as number;

    pause(view);
    expect(nativeFrames.size).toBe(0);
    runFrames(last + 1, 5000);
    expect(poser.poseAt.mock.lastCall?.[0]).toBe(heldAt);

    resume(view);
    frameAt(10_000);
    frameAt(10_000 + FRAME_INTERVAL_MS);
    expect(poser.poseAt.mock.lastCall?.[0]).toBeCloseTo(heldAt + FRAME_INTERVAL_MS, 6);
    runFrames(10_100, 13_000);
    // Back to idling: inside the cycle, still advancing, still armed. The point of the pause is
    // that time spent held is not fast-forwarded, not that playback ever ends.
    expect(poser.poseAt.mock.lastCall?.[0]).toBeLessThan(1800);
    expect(nativeFrames.size).toBe(1);
  });

  it('resumes from where playback stood when the view is rebuilt', () => {
    const view = mount();
    runIdle();
    runFrames(0, 1000);
    const before = poser.poseAt.mock.lastCall?.[0] as number;

    act(() => {
      bounds = { width: 68, height: 96 };
      resizeCallback?.();
    });
    runIdle();

    // The rebuilt view draws the pose the old one held, not the start of the cycle: playback
    // belongs to the mounted portrait, not to the canvas under it.
    expect(renderer.resize).toHaveBeenLastCalledWith({ width: 68, height: 96, dpr: expect.any(Number) });
    expect(poser.poseAt.mock.lastCall?.[0]).toBeCloseTo(before, 6);
    expect(view.canvas()).not.toBeNull();

    runFrames(1100, 2000);
    expect(poser.poseAt.mock.lastCall?.[0]).not.toBe(before);
  });
});
