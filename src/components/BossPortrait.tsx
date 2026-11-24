import { type FC, type RefObject, useEffect, useRef, useState } from 'react';
import type { EncounterPresentation } from '../encounters/presentationModules';
import { useBackgroundSuspended } from '../hooks/useBackgroundSuspended';
import { useDevicePixelRatio } from '../hooks/useDevicePixelRatio';
import { useIsTouchOnly } from '../hooks/useIsTouchOnly';
import type { AnimationSystem } from '../render/core/animation';
import type { ColorRGBA } from '../render/core/types';
import { type BossPortraitView, createBossPortraitView } from '../render/preview/bossPortraitView';
import type { NpcModelLoader } from '../rs/model/NpcModelLoader';
import { animationFrames } from '../util/animationFrames';

/** Draws at most this many frames a second. */
export const BOSS_PORTRAIT_MAX_FPS = 12;
const FRAME_INTERVAL_MS = 1000 / BOSS_PORTRAIT_MAX_FPS;
/** How long an idle callback may wait for the main thread before it runs anyway. */
const INIT_IDLE_TIMEOUT_MS = 1500;
const DEFAULT_BACKGROUND: ColorRGBA = { r: 0.12, g: 0.12, b: 0.12, a: 1 };

export interface BossPortraitProps {
  /** `thumb` is shown until the live model is ready, and whenever it cannot be; `portrait` is the model. */
  readonly presentation: Pick<EncounterPresentation, 'thumb' | 'thumbFit' | 'portrait'>;
  /** Null until the cache has loaded; the portrait never starts a download. */
  readonly npcModelLoader: NpcModelLoader | null;
  readonly animationSystem: AnimationSystem | null;
  /** Holds the current frame, e.g. while the player is using the form beside it. */
  readonly paused?: boolean;
  /**
   * Draws one still frame and never animates. Touch-only devices are always still. Reduced motion
   * deliberately is not: the idle is a slow stand cycle in a small box, not motion that moves
   * across the page.
   */
  readonly still?: boolean;
  /** The canvas is opaque, so it paints this behind the model. */
  readonly background?: ColorRGBA;
  readonly className?: string;
}

/** Runs `callback` once the main thread is idle; returns the cancel. */
function scheduleIdle(callback: () => void): () => void {
  if (typeof window.requestIdleCallback === 'function') {
    const id = window.requestIdleCallback(callback, { timeout: INIT_IDLE_TIMEOUT_MS });
    return () => window.cancelIdleCallback(id);
  }
  const id = window.setTimeout(callback, 0);
  return () => window.clearTimeout(id);
}

/** Whether `ref`'s element intersects the viewport. True where IntersectionObserver is unavailable. */
function useOnScreen(ref: RefObject<Element | null>): boolean {
  const [onScreen, setOnScreen] = useState(true);
  useEffect(() => {
    const element = ref.current;
    if (!element || typeof IntersectionObserver !== 'function') return;
    const observer = new IntersectionObserver((entries) => {
      const entry = entries[entries.length - 1];
      if (entry) setOnScreen(entry.isIntersecting);
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, [ref]);
  return onScreen;
}

/** Where in the stand cycle a mounted portrait is, kept across view rebuilds. */
interface Playback {
  config: BossPortraitProps['presentation']['portrait'];
  elapsedMs: number;
}

/**
 * A small live model of an encounter's boss standing idle, on a canvas of its own. Until the
 * model is drawn, and whenever WebGL, the cache or the context fails, it shows the encounter's
 * thumbnail instead, without saying why.
 */
export const BossPortrait: FC<BossPortraitProps> = ({
  presentation,
  npcModelLoader,
  animationSystem,
  paused = false,
  still = false,
  background = DEFAULT_BACKGROUND,
  className,
}) => {
  const { thumb, thumbFit, portrait } = presentation;
  const containerRef = useRef<HTMLSpanElement>(null);
  const canvasHostRef = useRef<HTMLSpanElement>(null);
  const viewRef = useRef<{ view: BossPortraitView; fail: () => void } | null>(null);
  const playbackRef = useRef<Playback>({ config: undefined, elapsedMs: 0 });
  const [live, setLive] = useState(false);
  const [bounds, setBounds] = useState({ width: 0, height: 0 });

  // Layout owns the portrait's shape, not the model. Observe the actual box so a
  // wrapped header and a compact layout get matching raster and projection bounds.
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const measure = () => {
      const { width, height } = container.getBoundingClientRect();
      setBounds((previous) => (previous.width === width && previous.height === height ? previous : { width, height }));
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(container);
    return () => observer.disconnect();
  }, []);

  const dpr = useDevicePixelRatio(Number.POSITIVE_INFINITY);
  const hidden = useBackgroundSuspended(false);
  const onScreen = useOnScreen(containerRef);
  const touchOnly = useIsTouchOnly();

  const { r, g, b, a } = background;
  useEffect(() => {
    const host = canvasHostRef.current;
    if (!portrait || !npcModelLoader || !animationSystem || !host || bounds.width <= 0 || bounds.height <= 0) return;

    let view: BossPortraitView | null = null;
    let failed = false;
    const fail = (): void => {
      failed = true;
      view?.dispose();
      if (viewRef.current?.view === view) viewRef.current = null;
      setLive(false);
    };
    const cancelIdle = scheduleIdle(() => {
      const canvas = document.createElement('canvas');
      canvas.style.display = 'block';
      host.appendChild(canvas);
      try {
        view = createBossPortraitView({
          canvas,
          width: bounds.width,
          height: bounds.height,
          dpr,
          background: { r, g, b, a },
          config: portrait,
          npcModelLoader,
          animationSystem,
        });
        view.onContextLost(fail);
        if (playbackRef.current.config !== portrait) {
          playbackRef.current = { config: portrait, elapsedMs: 0 };
        }
        // Drawn before the canvas is ever composited, so a failure here is never seen.
        view.draw(playbackRef.current.elapsedMs);
      } catch {
        canvas.remove();
        fail();
        return;
      }
      if (failed) return;
      viewRef.current = { view, fail };
      setLive(true);
    });

    return () => {
      cancelIdle();
      view?.dispose();
      if (viewRef.current?.view === view) viewRef.current = null;
      setLive(false);
    };
  }, [portrait, npcModelLoader, animationSystem, bounds.width, bounds.height, dpr, r, g, b, a]);

  const motion = !still && !touchOnly;
  const running = live && motion && !paused && !hidden && onScreen;
  useEffect(() => {
    const current = viewRef.current;
    const playback = playbackRef.current;
    if (!running || !current) return;
    const { view, fail } = current;
    // A model with only a rest pose has nothing to run; everything else idles for as long as
    // it is on screen, unpaused and not in the background.
    const cycleMs = view.cycleMs;
    if (cycleMs <= 0) return;

    let frameId = 0;
    // Null until the loop's first frame, so time spent paused or hidden never fast-forwards it.
    let lastDrawMs: number | null = null;
    const unsubscribeResume = animationFrames.subscribeResume(() => {
      lastDrawMs = null;
    });
    const loop = (nowMs: number): void => {
      if (lastDrawMs === null) {
        lastDrawMs = nowMs;
      } else if (nowMs - lastDrawMs >= FRAME_INTERVAL_MS) {
        // Wrapped rather than clamped: a whole cycle ends on its first pose again, so the
        // modulo restarts it on the pose it just reached and the loop never shows a jump.
        playback.elapsedMs = (playback.elapsedMs + (nowMs - lastDrawMs)) % cycleMs;
        lastDrawMs = nowMs;
        try {
          view.draw(playback.elapsedMs);
        } catch {
          fail();
          return;
        }
      }
      frameId = animationFrames.request(loop);
    };
    frameId = animationFrames.request(loop);
    return () => {
      unsubscribeResume();
      animationFrames.cancel(frameId);
    };
  }, [running]);

  return (
    <span
      ref={containerRef}
      className={className}
      data-portrait={live ? 'live' : 'thumb'}
      style={{ overflow: 'hidden' }}
    >
      {!live && thumb && (
        <img
          crossOrigin="anonymous"
          src={thumb}
          alt=""
          draggable={false}
          style={{ display: 'block', width: '100%', height: '100%', objectFit: thumbFit ?? 'contain' }}
        />
      )}
      <span ref={canvasHostRef} aria-hidden="true" style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }} />
    </span>
  );
};
