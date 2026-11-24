export interface SpotAnimTransform {
  position: [number, number, number];
  yaw2048?: number;
  pitchRad?: number;
  scale?: number;
}

export type TransformSource =
  | { kind: 'static'; value: SpotAnimTransform }
  | {
      kind: 'dynamic';
      resolve(
        currentTick: number,
        interpolatedTick: number,
        terrainHeights: Int32Array[] | null,
      ): SpotAnimTransform | null;
    };

export type SpotAnimLifecycle =
  | { kind: 'oneShot'; startTick: number; durationTicks?: number }
  | { kind: 'persistent'; startTick: number }
  | { kind: 'duration'; startTick: number; endTick: number }
  | { kind: 'manual' };

export interface SpotAnimStyle {
  zIndex?: number;
  depthBias?: number;
  cullFace?: 'front' | 'back' | 'none';
  /** Force full per-instance transparent face sorting. Default is skipped (GPU back-face culling used instead). */
  requireTransparentSort?: boolean;
  /**
   * Leave the instance's draws out of a frame whose view, set with `SpotAnimRenderer.setViewRejection`,
   * provably excludes its baked bounds. The instance itself stays live: its timeline, frame sounds
   * and render center are unchanged. Not applied to skeletal spotanims, whose poses outgrow the bake.
   */
  cullOutsideView?: boolean;
}

export type SpotAnimFrameProgressResolver = (currentTick: number, interpolatedTick: number) => number;

export interface SpotAnimSpawnRequest {
  instanceId?: string;
  spotAnimId: number;
  transform: TransformSource;
  lifecycle: SpotAnimLifecycle;
  style?: SpotAnimStyle;
  groupId?: string;
  frameProgress?: number | SpotAnimFrameProgressResolver;
  heightOffsetMode?: 'sequence' | 'actor';
  /** A projectile in flight (`ProjectileFlight`), which Entity Hider's Hide projectiles leaves undrawn. */
  projectile?: boolean;
}
