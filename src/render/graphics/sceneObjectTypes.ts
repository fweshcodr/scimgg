import type { GameEvent } from '../../core/events/types';
import type { BlendMode, DepthMode, ShaderId } from '../core/commands';

export const SCENE_OBJECT_CLASSIFICATIONS = ['groundDecal', 'sceneMesh', 'aerial'] as const;

export type SceneObjectClassification = (typeof SCENE_OBJECT_CLASSIFICATIONS)[number];

export type SceneObjectLifecycle =
  | { readonly kind: 'sync' }
  | { readonly kind: 'oneShot'; readonly startTick: number; readonly durationTicks: number }
  | { readonly kind: 'manual'; readonly expiresAtTick?: number };

export interface SceneObjectStyle {
  readonly zIndex?: number;
  readonly depth?: DepthMode;
  readonly depthBias?: number;
  readonly zOffset?: number;
  readonly blend?: BlendMode;
  readonly cullFace?: 'front' | 'back' | 'none';
  /**
   * Scene objects draw baked LOC frames, which carry no normals (`bakeLocFrameGeometry`), so only
   * scene-base, which reads none, can draw them.
   */
  readonly shaderId?: Extract<ShaderId, 'scene-base'>;
  readonly uniforms?: Readonly<Record<string, number | readonly number[] | Float32Array>>;
  /**
   * Multiplies every face's alpha (0..1), which sends the faded faces through the transparent pass.
   * It is baked into the frames, so changing it re-bakes: choose one value per spec, do not animate it.
   */
  readonly opacity?: number;
}

export interface SceneObjectSpec<TData = unknown> {
  readonly id: string;
  readonly meshId: string;
  readonly materialId: string;
  readonly modelMatrix: Float32Array;
  readonly lifecycle: SceneObjectLifecycle;
  readonly classification: SceneObjectClassification;
  readonly style?: SceneObjectStyle;
  readonly data?: TData;
}

/**
 * The start-of-fight countdown as the renderer sees it: `holding` while it holds the fight, then
 * `released` from GO until its overlay has finished.
 */
export type FightStartCountdownPhase = 'holding' | 'released';

export interface SceneObjectFrameContext<TState = unknown> {
  readonly currentTick: number;
  readonly interpolatedTick: number;
  readonly state: TState;
  readonly terrainHeights: readonly Int32Array[] | null;
  /**
   * Absent while no countdown runs (setting off, manual stepping, Tutorial Mode, replay viewing).
   * UI timing only: it is never simulation, snapshot or replay state, so nothing it drives may be
   * either.
   */
  readonly fightStartCountdown?: FightStartCountdownPhase;
}

export interface SceneObjectController<TState = unknown, TData = unknown> {
  consumeEvents(events: readonly GameEvent[]): void;
  update(context: SceneObjectFrameContext<TState>): readonly SceneObjectSpec<TData>[];
}

export interface SceneObjectPolicy {
  readonly depthBias?: number;
  readonly zOffset: number;
}

export const GROUND_DECAL_DEPTH_BIAS = 0.0001;

export function resolveSceneObjectPolicy(spec: Pick<SceneObjectSpec, 'classification' | 'style'>): SceneObjectPolicy {
  const zOffset = spec.style?.zOffset ?? 0;
  const explicitDepthBias = spec.style?.depthBias;

  switch (spec.classification) {
    case 'groundDecal':
      return { depthBias: explicitDepthBias ?? GROUND_DECAL_DEPTH_BIAS, zOffset };
    case 'sceneMesh':
      return explicitDepthBias === undefined ? { zOffset } : { depthBias: explicitDepthBias, zOffset };
    case 'aerial':
      return explicitDepthBias === undefined ? { zOffset } : { depthBias: explicitDepthBias, zOffset };
    default:
      return assertNever(spec.classification);
  }
}

function assertNever(value: never): never {
  throw new Error(`Unhandled scene object classification: ${value}`);
}
