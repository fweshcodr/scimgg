import { type FC, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { SpotAnimModelLoader } from '../../rs/model/SpotAnimModelLoader';
import type { TextureLoader } from '../../rs/texture/TextureLoader';
import { animationFrames } from '../../util/animationFrames';
import type { AnimationSystem } from '../core/animation';
import { type MeshBounds, positionBounds } from '../core/meshSource';
import type { ColorRGBA } from '../core/types';
import { SpotAnimRenderer } from '../effects/SpotAnimRenderer';
import { type EffectViewportBuildContext, type EffectViewportHandle, useEffectViewport } from './useEffectViewport';

interface SpotAnimPreview3DProps {
  spotAnimId: number;
  spotAnimModelLoader: SpotAnimModelLoader | null;
  textureLoader?: TextureLoader | null;
  /** Required for skeletal sequences: they are posed per frame rather than baked from frameIds. */
  animationSystem?: AnimationSystem | null;
  className?: string;
}

interface BackgroundSwatch {
  readonly label: string;
  readonly title: string;
  readonly color: ColorRGBA;
  readonly swatchCss: string;
}

const BACKGROUND_SWATCHES: readonly BackgroundSwatch[] = [
  {
    label: 'D',
    title: 'Dark background',
    color: { r: 0.12, g: 0.12, b: 0.12, a: 1.0 },
    swatchCss: 'rgb(31, 31, 31)',
  },
  {
    label: 'S',
    title: 'Sand background',
    color: { r: 210 / 255, g: 190 / 255, b: 150 / 255, a: 1.0 },
    swatchCss: 'rgb(210, 190, 150)',
  },
  {
    label: 'G',
    title: 'Mid-gray background',
    color: { r: 0.5, g: 0.5, b: 0.5, a: 1.0 },
    swatchCss: 'rgb(128, 128, 128)',
  },
  {
    label: 'W',
    title: 'White background',
    color: { r: 0.94, g: 0.94, b: 0.94, a: 1.0 },
    swatchCss: 'rgb(240, 240, 240)',
  },
];

// OSRS animation tick = 20ms. Frame lengths in `frameLengths[]` are counts of
// these animation ticks (30 anim ticks per game tick).
const ANIM_TICK_MS = 20;

const DEFAULT_YAW = 210;
const DEFAULT_PITCH = -22;
const DEFAULT_DISTANCE = 8;
const DEGENERATE_TARGET_X = 0;
const DEGENERATE_TARGET_Y = 0;
const DEGENERATE_TARGET_Z = 0.5;
const DEGENERATE_DISTANCE = 6;
const ZOOM_STEP = 1.0;
const MIN_DISTANCE = 2;
const MAX_DISTANCE = 20;

// OSRS model-to-world scale, matching SpotAnimRenderer, NpcInstanceManager, LocRenderer, and SceneCompositor.
const SCALE = 1 / 128;

// Distance = extent * FIT_FACTOR gives the fitted orbit distance so the AABB's
// largest axis spans ~64% of vertical NDC at Projection3D's default OSRS FOV.
const FIT_FACTOR = 2.4;

interface FittedFraming {
  targetX: number;
  targetY: number;
  targetZ: number;
  distance: number;
  yaw: number;
  pitch: number;
}

export const SpotAnimPreview3D: FC<SpotAnimPreview3DProps> = ({
  spotAnimId,
  spotAnimModelLoader,
  textureLoader,
  animationSystem,
  className,
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const spotAnimRendererRef = useRef<SpotAnimRenderer | null>(null);
  if (spotAnimRendererRef.current === null) {
    spotAnimRendererRef.current = new SpotAnimRenderer();
  }

  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [currentFrame, setCurrentFrame] = useState(0);
  const [totalFrames, setTotalFrames] = useState(1);
  const [bgIndex, setBgIndex] = useState(0);

  // Playback state kept in refs so the render loop can mutate without re-render churn.
  const frameLengthsRef = useRef<number[]>([1]);
  const totalDurationRef = useRef<number>(1);
  const currentFrameIdxRef = useRef<number>(0);
  const ticksInFrameRef = useRef<number>(0);
  const seekFrameRef = useRef<number | null>(null);
  const lastPlaybackMsRef = useRef<number>(performance.now());
  useEffect(
    () =>
      animationFrames.subscribeResume(() => {
        lastPlaybackMsRef.current = performance.now();
      }),
    [],
  );
  const pausedRef = useRef<boolean>(false);
  pausedRef.current = isPaused;

  // Reset ("1:1") restores THIS framing, not the pre-load fallback constants.
  const fittedFramingRef = useRef<FittedFraming>({
    targetX: DEGENERATE_TARGET_X,
    targetY: DEGENERATE_TARGET_Y,
    targetZ: DEGENERATE_TARGET_Z,
    distance: DEFAULT_DISTANCE,
    yaw: DEFAULT_YAW,
    pitch: DEFAULT_PITCH,
  });

  // Held so the load effect (which runs before the viewport identity settles) can
  // apply the fitted framing via a stable indirection.
  const viewportRef = useRef<EffectViewportHandle | null>(null);

  useEffect(() => {
    return () => {
      const r = spotAnimRendererRef.current;
      if (r) {
        r.dispose();
        spotAnimRendererRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    if (!spotAnimModelLoader || spotAnimId < 0) {
      setError(spotAnimId < 0 ? 'No spotanim' : 'Initializing...');
      setLoading(false);
      return;
    }
    const renderer = spotAnimRendererRef.current;
    if (!renderer) return;

    setLoading(true);
    setError(null);

    // Clear any previous instance so stale state doesn't leak across id changes.
    renderer.despawn('preview');

    // Skeletal sequences are posed per frame, so the renderer needs this before the load decides
    // whether it can prepare a poser.
    renderer.setAnimationSystem(animationSystem ?? null);
    try {
      renderer.loadById(spotAnimModelLoader, spotAnimId);
    } catch (err) {
      setError(err instanceof Error ? err.message : `Failed to load spotanim ${spotAnimId}`);
      setLoading(false);
      return;
    }

    if (!renderer.isLoaded(spotAnimId)) {
      setError(`SpotAnim ${spotAnimId} not found`);
      setLoading(false);
      return;
    }

    const rawLengths = renderer.getFrameLengths(spotAnimId) ?? [];
    const frameLengths = rawLengths.length > 0 ? Array.from(rawLengths) : [1];
    frameLengthsRef.current = frameLengths;
    let total = 0;
    for (const len of frameLengths) total += len;
    totalDurationRef.current = total > 0 ? total : 1;

    currentFrameIdxRef.current = 0;
    ticksInFrameRef.current = 0;
    seekFrameRef.current = null;
    lastPlaybackMsRef.current = performance.now();

    // Covers EVERY frame's geometry so an animated / expanding effect
    // (moving beam, growing cone) stays framed across its whole cycle.
    // Model → world transform matches SpotAnimRenderer.fillModelMatrix
    // with the preview's transform (position [0,0,0], yaw2048=0,
    // pitchRad=0, scale=1):
    //   worldX =  vx * SCALE
    //   worldY =  vz * SCALE
    //   worldZ = -vy * SCALE
    // An axis permutation, a sign and a positive scale, so the world box is exactly the image of
    // the model-space box.
    let minX = Number.POSITIVE_INFINITY;
    let minY = Number.POSITIVE_INFINITY;
    let minZ = Number.POSITIVE_INFINITY;
    let maxX = Number.NEGATIVE_INFINITY;
    let maxY = Number.NEGATIVE_INFINITY;
    let maxZ = Number.NEGATIVE_INFINITY;
    let hasGeometry = false;
    const accumulateBounds = (bounds: MeshBounds): void => {
      minX = Math.min(minX, bounds.minX * SCALE);
      maxX = Math.max(maxX, bounds.maxX * SCALE);
      minY = Math.min(minY, bounds.minZ * SCALE);
      maxY = Math.max(maxY, bounds.maxZ * SCALE);
      minZ = Math.min(minZ, -bounds.maxY * SCALE);
      maxZ = Math.max(maxZ, -bounds.minY * SCALE);
      hasGeometry = true;
    };

    // The renderer keeps the bounds of every baked part of every frame. A skeletal spotanim has
    // none, so it frames its rest pose, baked here once.
    const bakedBounds = renderer.getBakedBounds(spotAnimId);
    if (bakedBounds) {
      accumulateBounds(bakedBounds);
    } else {
      const staticMesh = spotAnimModelLoader.loadSpotAnimMesh(spotAnimId);
      const restBounds = staticMesh ? positionBounds(staticMesh.positions) : null;
      if (restBounds) accumulateBounds(restBounds);
    }

    let framing: FittedFraming;
    if (!hasGeometry || !Number.isFinite(minX) || !Number.isFinite(maxX)) {
      framing = {
        targetX: DEGENERATE_TARGET_X,
        targetY: DEGENERATE_TARGET_Y,
        targetZ: DEGENERATE_TARGET_Z,
        distance: DEGENERATE_DISTANCE,
        yaw: DEFAULT_YAW,
        pitch: DEFAULT_PITCH,
      };
    } else {
      const extentX = maxX - minX;
      const extentY = maxY - minY;
      const extentZ = maxZ - minZ;
      const extent = Math.max(extentX, extentY, extentZ);
      const safeExtent = extent > 1e-4 ? extent : 1.0;
      const rawDistance = safeExtent * FIT_FACTOR;
      const distance = Math.max(MIN_DISTANCE, Math.min(MAX_DISTANCE, rawDistance));
      framing = {
        targetX: (minX + maxX) * 0.5,
        targetY: (minY + maxY) * 0.5,
        targetZ: (minZ + maxZ) * 0.5,
        distance,
        yaw: DEFAULT_YAW,
        pitch: DEFAULT_PITCH,
      };
    }
    fittedFramingRef.current = framing;
    viewportRef.current?.setCamera(framing);

    setTotalFrames(frameLengths.length);
    setCurrentFrame(0);
    setIsPaused(false);
    setLoading(false);
  }, [spotAnimId, spotAnimModelLoader, animationSystem]);

  const stepFrame = useCallback((direction: number) => {
    const n = Math.max(1, frameLengthsRef.current.length);
    const nextIdx = (((currentFrameIdxRef.current + direction) % n) + n) % n;
    seekFrameRef.current = nextIdx;
    setIsPaused(true);
  }, []);

  const handleSeek = useCallback((rawValue: string) => {
    const parsed = Number.parseInt(rawValue, 10);
    if (!Number.isFinite(parsed)) return;
    const clamped = Math.max(0, Math.min(frameLengthsRef.current.length - 1, parsed));
    seekFrameRef.current = clamped;
    setCurrentFrame(clamped);
    setIsPaused(true);
  }, []);

  const buildScene = useCallback(
    (ctx: EffectViewportBuildContext): void => {
      const renderer = spotAnimRendererRef.current;
      if (!renderer || !renderer.isLoaded(spotAnimId) || spotAnimId < 0) return;

      const now = performance.now();
      const deltaMs = Math.max(0, now - lastPlaybackMsRef.current);
      lastPlaybackMsRef.current = now;

      const frameLengths = frameLengthsRef.current;
      const nFrames = Math.max(1, frameLengths.length);

      if (seekFrameRef.current !== null) {
        currentFrameIdxRef.current = seekFrameRef.current;
        ticksInFrameRef.current = 0;
        seekFrameRef.current = null;
      } else if (!pausedRef.current && nFrames > 1) {
        ticksInFrameRef.current += deltaMs / ANIM_TICK_MS;
        let safety = 0;
        while (safety++ < 1000) {
          const currentLen = frameLengths[currentFrameIdxRef.current] ?? 1;
          if (ticksInFrameRef.current < currentLen) break;
          ticksInFrameRef.current -= currentLen;
          currentFrameIdxRef.current = (currentFrameIdxRef.current + 1) % nFrames;
        }
      }

      // Sync visible frame counter (React skips no-op updates).
      const displayIdx = currentFrameIdxRef.current;
      setCurrentFrame((prev) => (prev === displayIdx ? prev : displayIdx));

      // Spot animation sorting requires the OSRS camera projection used by SceneCompositor.
      renderer.setSorterProjection(ctx.projection.getOsrsCameraProjection());

      // 3) Compute `frameProgress` (0..1) so `getAnimFrameIndex` picks displayIdx.
      // Midpoint sampling keeps us stably inside the frame's [acc, acc+len) window.
      let acc = 0;
      for (let i = 0; i < displayIdx; i++) acc += frameLengths[i];
      const midInFrame = (frameLengths[displayIdx] ?? 1) * 0.5;
      const frameProgress = Math.min(0.9999, (acc + midInFrame) / totalDurationRef.current);

      renderer.upsert({
        instanceId: 'preview',
        spotAnimId,
        transform: { kind: 'static', value: { position: [0, 0, 0] } },
        lifecycle: { kind: 'manual' },
        frameProgress,
        style: { zIndex: 0, requireTransparentSort: true },
      });

      renderer.tick(ctx.tick, ctx.interpolatedTick);
      renderer.render(ctx.queue);
    },
    [spotAnimId],
  );

  // The initial camera is a pre-fit placeholder; the load effect overrides it
  // via `viewport.setCamera(fittedFramingRef.current)` as soon as the mesh is
  // available. This means the very first frame may show the fallback framing,
  // but by the next tick the fitted framing is applied.
  const initialCamera = useMemo(
    () => ({
      yaw: DEFAULT_YAW,
      pitch: DEFAULT_PITCH,
      distance: DEFAULT_DISTANCE,
      targetX: DEGENERATE_TARGET_X,
      targetY: DEGENERATE_TARGET_Y,
      targetZ: DEGENERATE_TARGET_Z,
    }),
    [],
  );

  const swatch = BACKGROUND_SWATCHES[bgIndex] ?? BACKGROUND_SWATCHES[0];

  const viewport = useEffectViewport(canvasRef, containerRef, {
    textureLoader,
    clearColor: swatch.color,
    camera: initialCamera,
    minDistance: MIN_DISTANCE,
    maxDistance: MAX_DISTANCE,
    buildScene,
  });
  viewportRef.current = viewport;

  const adjustDistance = useCallback(
    (delta: number) => {
      const state = viewport.projection.getCameraState();
      const next = Math.max(MIN_DISTANCE, Math.min(MAX_DISTANCE, state.distance + delta));
      viewport.setCamera({ distance: next });
    },
    [viewport],
  );

  const resetCamera = useCallback(() => {
    viewport.setCamera(fittedFramingRef.current);
  }, [viewport]);

  const hasAnim = totalFrames > 1;

  return (
    <div className={`model-preview-container ${className ?? ''}`}>
      <div ref={containerRef} className="model-preview-viewport">
        {loading && (
          <div className="model-preview-loading">
            <div className="spinner"></div>
          </div>
        )}
        {error ? (
          <div className="model-preview-error">
            <span className="error-icon">⚠️</span>
            {error}
          </div>
        ) : (
          <>
            <canvas ref={canvasRef} className="model-preview-canvas" />
            <div className="model-preview-zoom-controls">
              <button type="button" onClick={() => adjustDistance(-ZOOM_STEP)} title="Zoom In">
                +
              </button>
              <button type="button" onClick={resetCamera} title="Reset Camera">
                1:1
              </button>
              <button type="button" onClick={() => adjustDistance(ZOOM_STEP)} title="Zoom Out">
                −
              </button>
              <button
                type="button"
                onClick={() => setBgIndex((i) => (i + 1) % BACKGROUND_SWATCHES.length)}
                title={`Background: ${swatch.title}. Click to cycle.`}
                style={{
                  background: swatch.swatchCss,
                  color: bgIndex === 3 ? '#111' : '#fff',
                  textShadow: bgIndex === 3 ? 'none' : '1px 1px 0 #000',
                }}
              >
                {swatch.label}
              </button>
            </div>
          </>
        )}
      </div>

      {!error && !loading && (
        <div className="model-preview-footer">
          <div className="playback-controls">
            <button
              type="button"
              className="control-btn"
              onClick={() => stepFrame(-1)}
              disabled={!hasAnim}
              title="Previous Frame"
            >
              ◀
            </button>
            <button
              type="button"
              className="control-btn main-play-btn"
              onClick={() => setIsPaused((p) => !p)}
              disabled={!hasAnim}
              title={isPaused ? 'Play' : 'Pause'}
            >
              {isPaused ? '▶' : '⏸'}
            </button>
            <button
              type="button"
              className="control-btn"
              onClick={() => stepFrame(1)}
              disabled={!hasAnim}
              title="Next Frame"
            >
              ▶
            </button>
            <span className="frame-info">
              {hasAnim ? `Frame ${currentFrame + 1} / ${totalFrames}` : 'Static Model'}
            </span>
          </div>

          {hasAnim && (
            <div className="seekbar-container">
              <input
                type="range"
                min={0}
                max={totalFrames - 1}
                value={currentFrame}
                onChange={(e) => handleSeek(e.target.value)}
                className="anim-slider"
              />
            </div>
          )}
        </div>
      )}
    </div>
  );
};
