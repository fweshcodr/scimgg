import { type RefObject, useCallback, useEffect, useRef } from 'react';
import type { TextureLoader } from '../../rs/texture/TextureLoader';
import { animationFrames } from '../../util/animationFrames';
import { createPicoGLRenderer } from '../backends/picogl/PicoGLRenderer';
import { createCamera3D, type Viewport } from '../core/camera';
import type { RenderQueue } from '../core/commands';
import { createQueue, resetQueue } from '../core/commands';
import { isTextureCapableRenderer, type Renderer } from '../core/renderer';
import type { ColorRGBA } from '../core/types';
import { createProjection3D, type OrbitCameraState, type Projection3D } from '../projections/Projection3D';

const DEFAULT_TICK_INTERVAL_MS = 600;
const DEFAULT_BRIGHTNESS = 0.6;
const DEFAULT_CONTRAST = 1.0;
const DEFAULT_SATURATION = 1.0;
const DEFAULT_CLEAR_COLOR: ColorRGBA = { r: 0.12, g: 0.12, b: 0.12, a: 1.0 };

const YAW_SENSITIVITY_DEG_PER_PX = 0.5;
const PITCH_SENSITIVITY_DEG_PER_PX = 0.3;
const DEFAULT_ZOOM_RATE = 0.001;
// Orbit-camera clamps (degrees / world units). The preview relaxes Projection3D's
// stricter in-game limits so these are the authoritative bounds.
const DEFAULT_MIN_PITCH = -80;
const DEFAULT_MAX_PITCH = -6;
const DEFAULT_MIN_DISTANCE = 2;
const DEFAULT_MAX_DISTANCE = 20;

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

export interface EffectViewportBuildContext {
  readonly projection: Projection3D;
  readonly queue: RenderQueue;
  readonly tick: number;
  readonly interpolatedTick: number;
}

export interface EffectViewportHandle {
  readonly projection: Projection3D;
  setCamera(state: Partial<OrbitCameraState>): void;
}

export interface UseEffectViewportOptions {
  textureLoader?: TextureLoader | null;
  brightness?: number;
  contrast?: number;
  saturation?: number;
  clearColor?: ColorRGBA;
  camera?: Partial<OrbitCameraState>;
  tickIntervalMs?: number;
  paused?: boolean;
  minPitch?: number;
  maxPitch?: number;
  minDistance?: number;
  maxDistance?: number;
  zoomRate?: number;
  /** Called every frame to populate the render queue. Stored in a ref — safe to be a fresh closure each render. */
  buildScene: (ctx: EffectViewportBuildContext) => void;
}

function computeViewport(container: HTMLElement | null): Viewport | null {
  if (!container) return null;
  const rect = container.getBoundingClientRect();
  const width = Math.max(1, rect.width);
  const height = Math.max(1, rect.height);
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  return { width, height, dpr };
}

export function useEffectViewport(
  canvasRef: RefObject<HTMLCanvasElement | null>,
  containerRef: RefObject<HTMLElement | null>,
  options: UseEffectViewportOptions,
): EffectViewportHandle {
  const {
    textureLoader,
    brightness = DEFAULT_BRIGHTNESS,
    contrast = DEFAULT_CONTRAST,
    saturation = DEFAULT_SATURATION,
    clearColor = DEFAULT_CLEAR_COLOR,
    camera,
    tickIntervalMs = DEFAULT_TICK_INTERVAL_MS,
    paused = false,
    minPitch = DEFAULT_MIN_PITCH,
    maxPitch = DEFAULT_MAX_PITCH,
    minDistance = DEFAULT_MIN_DISTANCE,
    maxDistance = DEFAULT_MAX_DISTANCE,
    zoomRate = DEFAULT_ZOOM_RATE,
    buildScene,
  } = options;

  // Refs so the rAF loop always sees latest values without restarting.
  const buildSceneRef = useRef(buildScene);
  buildSceneRef.current = buildScene;
  const brightnessRef = useRef(brightness);
  brightnessRef.current = brightness;
  const contrastRef = useRef(contrast);
  contrastRef.current = contrast;
  const saturationRef = useRef(saturation);
  saturationRef.current = saturation;
  const clearColorRef = useRef(clearColor);
  clearColorRef.current = clearColor;
  const tickIntervalMsRef = useRef(tickIntervalMs);
  tickIntervalMsRef.current = tickIntervalMs;
  const pausedRef = useRef(paused);
  pausedRef.current = paused;
  const minPitchRef = useRef(minPitch);
  minPitchRef.current = minPitch;
  const maxPitchRef = useRef(maxPitch);
  maxPitchRef.current = maxPitch;
  const minDistanceRef = useRef(minDistance);
  minDistanceRef.current = minDistance;
  const maxDistanceRef = useRef(maxDistance);
  maxDistanceRef.current = maxDistance;
  const zoomRateRef = useRef(zoomRate);
  zoomRateRef.current = zoomRate;

  const rendererRef = useRef<Renderer | null>(null);
  const projectionRef = useRef<Projection3D | null>(null);
  const queueRef = useRef<RenderQueue | null>(null);
  const texturesLoadedRef = useRef(false);
  const currentViewportRef = useRef<Viewport | null>(null);

  // Lazy projection factory — needed synchronously for the handle before the effect runs.
  // biome-ignore lint/correctness/useExhaustiveDependencies: camera captured at first-call only; consumers change via setCamera
  const getProjection = useCallback((): Projection3D => {
    if (projectionRef.current) return projectionRef.current;
    const viewport = computeViewport(containerRef.current) ?? { width: 1, height: 1, dpr: 1 };
    const projection = createProjection3D(viewport, camera);
    // Relax Projection3D's in-game pitch limits ([-67.5, -22.5]) to a wider
    // preview range ([-87.5, -5]) so this hook's clamps are authoritative and
    // callers can view small effects near-horizontal or large ones nearly top-down.
    projection.setCameraLimits({ relaxPitch: true });
    // Re-apply the caller's initial camera so pitch is not stuck at the pre-relax clamp.
    if (camera) projection.updateCamera(camera);
    projectionRef.current = projection;
    currentViewportRef.current = viewport;
    return projection;
  }, []);

  const clampCameraState = useCallback((state: Partial<OrbitCameraState>): Partial<OrbitCameraState> => {
    const out: Partial<OrbitCameraState> = { ...state };
    if (out.pitch !== undefined) out.pitch = clamp(out.pitch, minPitchRef.current, maxPitchRef.current);
    if (out.distance !== undefined) out.distance = clamp(out.distance, minDistanceRef.current, maxDistanceRef.current);
    return out;
  }, []);

  const setCamera = useCallback(
    (state: Partial<OrbitCameraState>): void => {
      getProjection().updateCamera(clampCameraState(state));
    },
    [getProjection, clampCameraState],
  );

  // Renderer init + dispose (once per canvas identity).
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const renderer = createPicoGLRenderer();
    try {
      renderer.init(canvas);
    } catch (err) {
      // Init failure (no WebGL2). Leave rendererRef null so the loop no-ops.
      renderer.dispose();
      // Re-throwing would surface the error but React swallows it in effects, so the loop
      // guards against a null renderer instead.
      // eslint-disable-next-line no-console
      console.error('[useEffectViewport] PicoGLRenderer init failed', err);
      return;
    }
    rendererRef.current = renderer;
    queueRef.current = createQueue(clearColorRef.current);
    texturesLoadedRef.current = false;

    return () => {
      rendererRef.current = null;
      queueRef.current = null;
      texturesLoadedRef.current = false;
      renderer.dispose();
    };
  }, [canvasRef]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const applyViewport = (): void => {
      const viewport = computeViewport(container);
      if (!viewport) return;
      currentViewportRef.current = viewport;
      const renderer = rendererRef.current;
      if (renderer) renderer.resize(viewport);
      const projection = projectionRef.current;
      if (projection) projection.updateViewport(viewport);
    };

    // Apply initial size synchronously so the first frame draws to real dimensions.
    applyViewport();

    const observer = new ResizeObserver(applyViewport);
    observer.observe(container);
    return () => observer.disconnect();
  }, [containerRef]);

  useEffect(() => {
    if (!textureLoader) return;
    const renderer = rendererRef.current;
    if (!renderer || texturesLoadedRef.current) return;
    if (!isTextureCapableRenderer(renderer)) return;
    renderer.loadTextures(textureLoader);
    texturesLoadedRef.current = true;
  });

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    let dragging = false;
    let lastX = 0;
    let lastY = 0;

    const onDown = (e: MouseEvent): void => {
      dragging = true;
      lastX = e.clientX;
      lastY = e.clientY;
      canvas.style.cursor = 'grabbing';
    };
    const onMove = (e: MouseEvent): void => {
      if (!dragging) return;
      const dx = e.clientX - lastX;
      const dy = e.clientY - lastY;
      lastX = e.clientX;
      lastY = e.clientY;
      const projection = projectionRef.current;
      if (!projection) return;
      const state = projection.getCameraState();
      // Drag right => yaw increases. Drag up (dy<0) => pitch tilts down (more negative).
      // Yaw is unbounded (360° free); pitch is clamped to the hook's [minPitch, maxPitch].
      const nextPitch = clamp(
        state.pitch + dy * PITCH_SENSITIVITY_DEG_PER_PX,
        minPitchRef.current,
        maxPitchRef.current,
      );
      projection.updateCamera({
        yaw: state.yaw + dx * YAW_SENSITIVITY_DEG_PER_PX,
        pitch: nextPitch,
      });
    };
    const onUp = (): void => {
      dragging = false;
      canvas.style.cursor = 'grab';
    };
    const onWheel = (e: WheelEvent): void => {
      e.preventDefault();
      const projection = projectionRef.current;
      if (!projection) return;
      const state = projection.getCameraState();
      // Multiplicative zoom: consistent feel across tiny impacts and huge beams.
      const factor = 1 + e.deltaY * zoomRateRef.current;
      const nextDistance = clamp(state.distance * factor, minDistanceRef.current, maxDistanceRef.current);
      projection.updateCamera({ distance: nextDistance });
    };

    canvas.style.cursor = 'grab';
    canvas.addEventListener('mousedown', onDown);
    canvas.addEventListener('mousemove', onMove);
    canvas.addEventListener('mouseup', onUp);
    canvas.addEventListener('mouseleave', onUp);
    canvas.addEventListener('wheel', onWheel, { passive: false });

    return () => {
      canvas.removeEventListener('mousedown', onDown);
      canvas.removeEventListener('mousemove', onMove);
      canvas.removeEventListener('mouseup', onUp);
      canvas.removeEventListener('mouseleave', onUp);
      canvas.removeEventListener('wheel', onWheel);
    };
  }, [canvasRef]);

  useEffect(() => {
    let frameId = 0;
    let disposed = false;
    let baseTimeMs = performance.now();
    let accumulatedTicks = 0;
    let resetTiming = false;
    const unsubscribeResume = animationFrames.subscribeResume(() => {
      resetTiming = true;
    });

    const loop = (nowMs: number): void => {
      if (disposed) return;
      frameId = animationFrames.request(loop);
      if (resetTiming) {
        baseTimeMs = nowMs;
        resetTiming = false;
      }

      const renderer = rendererRef.current;
      const queue = queueRef.current;
      const projection = projectionRef.current ?? getProjection();
      if (!renderer || !queue) return;

      const interval = Math.max(1, tickIntervalMsRef.current);
      if (!pausedRef.current) {
        const elapsedMs = nowMs - baseTimeMs;
        if (elapsedMs > 0) {
          accumulatedTicks += elapsedMs / interval;
          baseTimeMs = nowMs;
        }
      } else {
        // While paused, keep baseTimeMs current so unpausing doesn't fast-forward.
        baseTimeMs = nowMs;
      }
      const interpolatedTick = accumulatedTicks;
      const currentTick = Math.floor(interpolatedTick);

      resetQueue(queue, clearColorRef.current);
      queue.brightness = brightnessRef.current;
      queue.contrast = contrastRef.current;
      queue.saturation = saturationRef.current;
      queue.tick = interpolatedTick;

      buildSceneRef.current({
        projection,
        queue,
        tick: currentTick,
        interpolatedTick,
      });

      renderer.render({ camera: createCamera3D(projection), queue });
    };

    frameId = animationFrames.request(loop);
    return () => {
      disposed = true;
      unsubscribeResume();
      animationFrames.cancel(frameId);
    };
  }, [getProjection]);

  return {
    get projection(): Projection3D {
      return getProjection();
    },
    setCamera,
  };
}
