import type { AssetManager } from './assets';
import type { Camera, Viewport } from './camera';
import type { RenderQueue } from './commands';
import type { ImmutableMeshSource } from './meshSource';

export interface RenderFrame {
  camera: Camera;
  queue: RenderQueue;
}

export interface RendererInitOptions {
  /** Context antialiasing; undefined keeps the renderer's default. */
  antialias?: boolean;
}

export interface Renderer {
  readonly id: string;

  supports(kind: '2d' | '3d'): boolean;

  init(canvas: HTMLCanvasElement, options?: RendererInitOptions): void;

  resize(viewport: Viewport): void;

  render(frame: RenderFrame): void;

  readonly assets: AssetManager;

  /**
   * Called at a scene boundary when the renderer outlives scenes: drops GPU meshes cached
   * under scene-local ids, keeping the context and anything scene-independent.
   */
  releaseSceneMeshes?(): void;

  /**
   * Uploads resident sources ahead of their first draw, a bounded amount per frame, so the
   * build each made while loading leaves the CPU at load. Sources no longer holding that build
   * are skipped: preparing never rebuilds.
   */
  prepareResidentSources?(sources: readonly ImmutableMeshSource[]): void;

  /**
   * Releases every resident or queued source whose owner token is `owner` (see
   * `MeshSourceOptions.owner`), for when that owner, typically a cache loader, is replaced.
   */
  retireResidentSources?(owner: object): void;

  dispose(): void;
}

export interface TextureArrayIndexManager {
  getTextureIndex(textureId: number): number;
}

export interface TextureCapableRenderer extends Renderer {
  loadTextures(textureLoader: unknown): void;
  getTextureArrayManager(): TextureArrayIndexManager | null;
}

export function isTextureCapableRenderer(renderer: Renderer): renderer is TextureCapableRenderer {
  const candidate = renderer as Partial<TextureCapableRenderer>;
  return typeof candidate.loadTextures === 'function' && typeof candidate.getTextureArrayManager === 'function';
}

/**
 * Thrown by `Renderer.init` when the browser cannot provide a usable context, so the
 * viewport can show an unsupported state instead of treating it as a crash.
 */
export class RendererUnsupportedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'RendererUnsupportedError';
  }
}

export type RenderFailureReason =
  /** `init` threw {@link RendererUnsupportedError}. */
  | 'unsupported'
  /** The context came back but rebuilding GPU state threw. */
  | 'context-restore'
  /** The context was lost and the browser never restored it. */
  | 'context-timeout'
  /** The viewport's render loop gave up after repeated frame errors. */
  | 'render-loop';

export type RenderStatus =
  | { readonly kind: 'ok' }
  | { readonly kind: 'lost' }
  | { readonly kind: 'restoring' }
  | { readonly kind: 'failed'; readonly reason: RenderFailureReason };

export interface ContextStatusRenderer extends Renderer {
  getContextStatus(): RenderStatus;
  /** Notified on every status transition; returns the unsubscribe function. */
  subscribeContextStatus(listener: (status: RenderStatus) => void): () => void;
}

export function isContextStatusRenderer(renderer: Renderer): renderer is ContextStatusRenderer {
  const candidate = renderer as Partial<ContextStatusRenderer>;
  return typeof candidate.getContextStatus === 'function' && typeof candidate.subscribeContextStatus === 'function';
}

export function isSameRenderStatus(a: RenderStatus, b: RenderStatus): boolean {
  if (a.kind !== b.kind) return false;
  return a.kind !== 'failed' || a.reason === (b as Extract<RenderStatus, { kind: 'failed' }>).reason;
}

export function createNullAssetManager(): AssetManager {
  return {
    hasTexture2D: () => false,
    ensureTexture2D: () => {},
    deleteTexture2D: () => {},
    hasMesh: () => false,
    ensureMesh: () => {},
    deleteMesh: () => {},
    hasMaterial: () => false,
    ensureMaterial: () => {},
    deleteMaterial: () => {},
    clear: () => {},
  };
}
