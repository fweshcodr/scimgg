import type { NpcModelLoader } from '../../rs/model/NpcModelLoader';
import { createPicoGLRenderer } from '../backends/picogl/PicoGLRenderer';
import type { AnimationSystem } from '../core/animation';
import { type Camera, createCamera3D } from '../core/camera';
import { createQueue, type NpcMesh3DCommand, resetQueue } from '../core/commands';
import { isContextStatusRenderer } from '../core/renderer';
import { splitTriangleSoupByAlpha } from '../core/splitMeshByAlpha';
import type { ColorRGBA } from '../core/types';
import { createProjection3D } from '../projections/Projection3D';
import { type BossPortraitConfig, framePortraitCamera } from './bossPortraitFraming';
import { type BossPortraitPoser, createBossPortraitPoser } from './bossPortraitPoser';

export interface BossPortraitViewOptions {
  /** Owned by the view from here on: {@link BossPortraitView.dispose} detaches it. */
  readonly canvas: HTMLCanvasElement;
  /** The measured portrait container in CSS pixels. */
  readonly width: number;
  readonly height: number;
  readonly dpr: number;
  readonly background: ColorRGBA;
  readonly config: BossPortraitConfig;
  readonly npcModelLoader: NpcModelLoader;
  readonly animationSystem: AnimationSystem;
}

export interface BossPortraitView {
  /** One stand cycle in ms; 0 when there is only a rest pose. */
  readonly cycleMs: number;
  /** Draws the pose `ms` into the stand cycle. Draws nothing once the context is lost. */
  draw(ms: number): void;
  /** `listener` hears once that the context was lost or failed, at once if it already was. */
  onContextLost(listener: () => void): void;
  /** Releases the renderer and its context, and detaches the canvas. Idempotent. */
  dispose(): void;
}

/** OSRS model units to world tiles, axis-remapped as every NPC model matrix does (column-major). */
const MODEL_MATRIX = new Float32Array([1 / 128, 0, 0, 0, 0, 0, -1 / 128, 0, 0, 1 / 128, 0, 0, 0, 0, 0, 1]);

/**
 * One NPC drawn by a renderer of its own on a small canvas. Throws when WebGL2 is unavailable or
 * the model does not load, having released everything it built.
 */
export function createBossPortraitView(options: BossPortraitViewOptions): BossPortraitView {
  const { canvas, width, height, dpr, background, config } = options;
  const renderer = createPicoGLRenderer();
  let disposed = false;
  let lost = false;
  let lostListener: (() => void) | null = null;
  let unsubscribeStatus: (() => void) | null = null;

  const dispose = (): void => {
    if (disposed) return;
    disposed = true;
    unsubscribeStatus?.();
    // Detached first: the renderer gives back the context only of a canvas out of the document.
    canvas.remove();
    renderer.dispose();
  };

  let poser: BossPortraitPoser;
  let camera: Camera;
  try {
    renderer.init(canvas);
    renderer.resize({ width, height, dpr });
    const loaded = createBossPortraitPoser(options.npcModelLoader, options.animationSystem, config);
    if (!loaded) throw new Error(`Boss portrait: NPC ${config.npcTypeId} did not load`);
    poser = loaded;
    camera = createCamera3D(
      createProjection3D({ width, height, dpr }, framePortraitCamera(poser.points, config.framing)),
    );
  } catch (error) {
    dispose();
    throw error;
  }
  const queue = createQueue(background);

  if (isContextStatusRenderer(renderer)) {
    lost = renderer.getContextStatus().kind !== 'ok';
    unsubscribeStatus = renderer.subscribeContextStatus((status) => {
      if (status.kind === 'ok' || lost) return;
      lost = true;
      lostListener?.();
    });
  }

  return {
    cycleMs: poser.cycleMs,
    draw(ms) {
      if (disposed || lost) return;
      const split = splitTriangleSoupByAlpha(poser.poseAt(ms));
      resetQueue(queue, background);
      for (const [part, soup] of [
        ['opaque', split.opaque],
        ['transparent', split.transparent],
      ] as const) {
        if (!soup) continue;
        const transparent = part === 'transparent';
        const command: NpcMesh3DCommand = {
          kind: 'mesh3d',
          meshId: `boss-portrait-${config.npcTypeId}-${part}`,
          materialId: 'osrs-npc',
          modelMatrix: MODEL_MATRIX,
          positions: soup.positions,
          normals: soup.normals,
          perVertexHslColors: soup.hslColors,
          perVertexAlphas: soup.alphas,
          perVertexFaceBias: soup.faceBias,
          // Re-posed in place, so the renderer rewrites its cached buffers on every draw.
          animated: true,
          depth: transparent ? 'read' : 'readwrite',
          ...(transparent ? { blend: 'normal' as const } : {}),
          zIndex: 0,
        };
        queue.commands.push(command);
      }
      renderer.render({ camera, queue });
    },
    onContextLost(listener) {
      lostListener = listener;
      if (lost) listener();
    },
    dispose,
  };
}
