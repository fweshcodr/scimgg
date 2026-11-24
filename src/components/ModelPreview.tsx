import type React from 'react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { createPicoGLRenderer } from '../render/backends/picogl/PicoGLRenderer';
import type { Camera3D, Viewport } from '../render/core/camera';
import type { RenderCommand } from '../render/core/commands';
import type { Renderer } from '../render/core/renderer';
import { splitTriangleSoupByAlpha } from '../render/core/splitMeshByAlpha';
import type { ModelLoader } from '../rs/model/ModelLoader';
import { modelDataToMesh } from '../rs/model/NpcModelLoader';
import { animationFrames } from '../util/animationFrames';
import { HoverHintButton } from './ui/HoverHintControl';

interface ModelPreviewProps {
  modelId: number;
  modelLoader: ModelLoader | null;
  className?: string;
}

const SCALE = 1 / 128;
const DEG_TO_RAD = Math.PI / 180;
const PREVIEW_PITCH = -30; // degrees
const NEAR = 50 / 128; // OSRS near clip
const FAR = 200;
const OSRS_FOCAL_LENGTH = 512;
const OSRS_REFERENCE_HEIGHT = 503;

class PreviewCamera implements Camera3D {
  viewport: Viewport;
  private yaw: number; // radians
  private pitch: number; // radians
  private distance: number;
  private targetZ: number; // world Z offset for vertical centering

  constructor(viewport: Viewport, yaw: number, pitch: number, distance: number, targetZ: number) {
    this.viewport = viewport;
    this.yaw = yaw;
    this.pitch = pitch;
    this.distance = distance;
    this.targetZ = targetZ;
  }

  viewMatrix(): Float32Array {
    const cp = Math.cos(this.pitch);
    const sp = Math.sin(this.pitch);
    const cy = Math.cos(this.yaw);
    const sy = Math.sin(this.yaw);

    // Camera position orbiting around (0, 0, targetZ)
    const camX = -this.distance * cp * sy;
    const camY = -this.distance * cp * cy;
    const camZ = this.targetZ - this.distance * sp;

    // Right-handed view matrix matching Projection3D conventions
    const rx = cy,
      ry = -sy,
      rz = 0;
    const ux = -sp * sy,
      uy = -sp * cy,
      uz = cp;
    const fx = -cp * sy,
      fy = -cp * cy,
      fz = -sp;

    return new Float32Array([
      rx,
      ux,
      fx,
      0,
      ry,
      uy,
      fy,
      0,
      rz,
      uz,
      fz,
      0,
      -(rx * camX + ry * camY + rz * camZ),
      -(ux * camX + uy * camY + uz * camZ),
      -(fx * camX + fy * camY + fz * camZ),
      1,
    ]);
  }

  projectionMatrix(): Float32Array {
    // Reversed-Z projection matching PicoGLRenderer conventions
    const effectiveFL = OSRS_FOCAL_LENGTH * (this.viewport.height / OSRS_REFERENCE_HEIGHT);
    const fov = 2 * Math.atan(this.viewport.height / (2 * effectiveFL));
    const aspect = this.viewport.width / this.viewport.height;
    const f = 1 / Math.tan(fov / 2);
    const nf = 1 / (FAR - NEAR);

    return new Float32Array([
      f / aspect,
      0,
      0,
      0,
      0,
      f,
      0,
      0,
      0,
      0,
      (FAR + NEAR) * nf,
      -1,
      0,
      0,
      2 * FAR * NEAR * nf,
      0,
    ]);
  }

  tileToWorld(_tile: { x: number; y: number; level?: number }) {
    return { x: 0, y: 0, z: 0 };
  }
}

/**
 * Same axis remapping as NpcInstanceManager.createPrimaryNpcModelMatrix:
 *   model X → world X (east)
 *   model Y → world -Z (height, neg=up)
 *   model Z → world Y (north)
 */
function buildPreviewModelMatrix(theta: number, centerX: number, centerY: number, centerZ: number): Float32Array {
  const c = Math.cos(theta);
  const s = Math.sin(theta);

  // Column-major: M = AxisRemap(theta) * Translate(-center)
  // The translation terms bake in the centering so the model orbits around origin.
  return new Float32Array([
    SCALE * c,
    -SCALE * s,
    0,
    0,
    0,
    0,
    -SCALE,
    0,
    SCALE * s,
    SCALE * c,
    0,
    0,
    -SCALE * (c * centerX + s * centerZ),
    SCALE * centerY,
    -SCALE * (-s * centerX + c * centerZ),
    1,
  ]);
}

function computeModelBounds(positions: Float32Array) {
  let minX = Infinity,
    minY = Infinity,
    minZ = Infinity;
  let maxX = -Infinity,
    maxY = -Infinity,
    maxZ = -Infinity;

  for (let i = 0; i < positions.length; i += 3) {
    const x = positions[i];
    const y = positions[i + 1];
    const z = positions[i + 2];
    if (x < minX) minX = x;
    if (x > maxX) maxX = x;
    if (y < minY) minY = y;
    if (y > maxY) maxY = y;
    if (z < minZ) minZ = z;
    if (z > maxZ) maxZ = z;
  }

  const cx = (minX + maxX) * 0.5;
  const cy = (minY + maxY) * 0.5;
  const cz = (minZ + maxZ) * 0.5;

  // Size in world units (after SCALE)
  const sizeX = (maxX - minX) * SCALE;
  const sizeY = (maxY - minY) * SCALE;
  const sizeZ = (maxZ - minZ) * SCALE;
  const worldSize = Math.max(sizeX, sizeY, sizeZ);

  return { cx, cy, cz, worldSize };
}

/** Uses the same command structure as NpcInstanceManager.buildNpcMesh3D(). */
function buildPreviewCommands(
  mesh: {
    positions: Float32Array;
    normals: Float32Array;
    hslColors: Float32Array;
    alphas: Float32Array;
    faceBias?: Float32Array;
  },
  modelMatrix: Float32Array,
  meshId: string,
): RenderCommand[] {
  const split = splitTriangleSoupByAlpha({
    positions: mesh.positions,
    normals: mesh.normals,
    hslColors: mesh.hslColors,
    alphas: mesh.alphas,
    faceBias: mesh.faceBias,
  });

  const commands: RenderCommand[] = [];

  if (split.opaque) {
    commands.push({
      kind: 'mesh3d',
      meshId: `${meshId}-opaque`,
      materialId: 'osrs-npc',
      modelMatrix,
      positions: split.opaque.positions,
      normals: split.opaque.normals,
      perVertexHslColors: split.opaque.hslColors,
      perVertexAlphas: split.opaque.alphas,
      perVertexFaceBias: split.opaque.faceBias,
      depth: 'readwrite',
      zIndex: 0,
    } as RenderCommand);
  }

  if (split.transparent) {
    commands.push({
      kind: 'mesh3d',
      meshId: `${meshId}-transparent`,
      materialId: 'osrs-npc',
      modelMatrix,
      positions: split.transparent.positions,
      normals: split.transparent.normals,
      perVertexHslColors: split.transparent.hslColors,
      perVertexAlphas: split.transparent.alphas,
      perVertexFaceBias: split.transparent.faceBias,
      depth: 'read',
      blend: 'normal',
      cullFace: 'back',
      zIndex: 0,
    } as RenderCommand);
  }

  return commands;
}

export const ModelPreview: React.FC<ModelPreviewProps> = ({ modelId, modelLoader, className }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rendererRef = useRef<Renderer | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const rotationRef = useRef<number>(0);
  const [isPaused, setIsPaused] = useState(false);
  const [zoom, setZoom] = useState(1.0);

  const canvasContainerRef = useRef<HTMLDivElement>(null);
  const [canvasSize, setCanvasSize] = useState<{ width: number; height: number }>({ width: 300, height: 300 });

  useEffect(() => {
    const container = canvasContainerRef.current;
    if (!container) return;

    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const { width, height } = entry.contentRect;
        if (width > 0 && height > 0) {
          const dpr = Math.min(window.devicePixelRatio || 1, 2);
          setCanvasSize({
            width: Math.round(width * dpr),
            height: Math.round(height * dpr),
          });
        }
      }
    });
    observer.observe(container);
    return () => observer.disconnect();
  }, []);

  const isDraggingRef = useRef(false);
  const lastMouseXRef = useRef(0);
  const lastMouseYRef = useRef(0);

  const handleWheel = useCallback((e: React.WheelEvent) => {
    e.preventDefault();
    setZoom((prev) => Math.min(Math.max(0.1, prev - e.deltaY * 0.001), 5.0));
  }, []);

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    isDraggingRef.current = true;
    lastMouseXRef.current = e.clientX;
    lastMouseYRef.current = e.clientY;
  }, []);

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    if (!isDraggingRef.current) return;
    const deltaX = e.clientX - lastMouseXRef.current;
    rotationRef.current += deltaX * 0.01;
    lastMouseXRef.current = e.clientX;
    lastMouseYRef.current = e.clientY;
  }, []);

  const handleMouseUp = useCallback(() => {
    isDraggingRef.current = false;
  }, []);

  useEffect(() => {
    if (!canvasRef.current || !modelLoader || modelId < 0) {
      setError(modelId < 0 ? 'No model' : 'Initializing...');
      return;
    }

    setLoading(true);

    const canvas = canvasRef.current;

    if (!rendererRef.current) {
      try {
        rendererRef.current = createPicoGLRenderer();
        rendererRef.current.init(canvas);
      } catch {
        setError('WebGL2 not supported');
        setLoading(false);
        return;
      }
    }

    const renderer = rendererRef.current;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const cssWidth = canvas.clientWidth || canvasSize.width / dpr;
    const cssHeight = canvas.clientHeight || canvasSize.height / dpr;
    renderer.resize({ width: cssWidth, height: cssHeight, dpr });

    const modelData = modelLoader.getModel(modelId);
    if (!modelData) {
      setError(`Model ${modelId} not found`);
      setLoading(false);
      return;
    }

    setError(null);

    const mesh = modelDataToMesh(modelData);
    if (mesh.positions.length === 0) {
      setError('Empty model');
      setLoading(false);
      return;
    }

    // Compute bounds in raw OSRS model space
    const bounds = computeModelBounds(mesh.positions);
    const baseDistance = Math.max(bounds.worldSize * 1.8, 0.5);
    // World-space Z offset for the model center (model Y → world -Z, centered)
    const worldCenterZ = -bounds.cy * SCALE;

    const meshId = `preview-model-${modelId}`;
    setLoading(false);

    let frameId = 0;
    const loop = () => {
      frameId = animationFrames.request(loop);

      if (!isPaused && !isDraggingRef.current) {
        rotationRef.current += 0.01;
      }

      const currentDistance = baseDistance / zoom;
      const pitchRad = PREVIEW_PITCH * DEG_TO_RAD;

      const modelMatrix = buildPreviewModelMatrix(rotationRef.current, bounds.cx, bounds.cy, bounds.cz);

      const commands = buildPreviewCommands(mesh, modelMatrix, meshId);

      const viewport: Viewport = { width: cssWidth, height: cssHeight, dpr };
      const camera = new PreviewCamera(viewport, 0, pitchRad, currentDistance, worldCenterZ);

      renderer.render({
        camera: { kind: '3d', camera },
        queue: {
          replayPresentationReady: true,
          clear: { color: { r: 0.12, g: 0.12, b: 0.12, a: 1.0 } },
          commands,
        },
      });
    };

    frameId = animationFrames.request(loop);

    return () => {
      animationFrames.cancel(frameId);
    };
  }, [modelId, modelLoader, zoom, isPaused, canvasSize]);

  useEffect(() => {
    return () => {
      if (rendererRef.current) {
        rendererRef.current.dispose();
        rendererRef.current = null;
      }
    };
  }, []);

  return (
    <div className={`model-preview-container ${className || ''}`} style={{ position: 'relative' }}>
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
          <div ref={canvasContainerRef} className="model-preview-viewport">
            <canvas
              ref={canvasRef}
              width={canvasSize.width}
              height={canvasSize.height}
              className="model-preview-canvas"
              onWheel={handleWheel}
              onMouseDown={handleMouseDown}
              onMouseMove={handleMouseMove}
              onMouseUp={handleMouseUp}
              onMouseLeave={handleMouseUp}
              style={{ cursor: isDraggingRef.current ? 'grabbing' : 'grab' }}
            />
          </div>
          <div className="model-preview-controls">
            <HoverHintButton
              type="button"
              onClick={() => setIsPaused(!isPaused)}
              aria-label={isPaused ? 'Play' : 'Pause'}
            >
              {isPaused ? '▶' : '⏸'}
            </HoverHintButton>
            <HoverHintButton type="button" onClick={() => setZoom((z) => Math.max(0.1, z - 0.2))} aria-label="Zoom out">
              -
            </HoverHintButton>
            <button type="button" onClick={() => setZoom(1.0)} title="Reset Zoom">
              1:1
            </button>
            <HoverHintButton type="button" onClick={() => setZoom((z) => Math.min(5.0, z + 0.2))} aria-label="Zoom in">
              +
            </HoverHintButton>
          </div>
        </>
      )}
    </div>
  );
};
