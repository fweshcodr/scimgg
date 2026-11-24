import { getLocCenterHeight } from '../../shared/renderUtils';
import type { SpotAnimTransform, TransformSource } from '../spotAnimTypes';

export interface NpcCenterTransformState {
  readonly swX: number;
  readonly swY: number;
  readonly size: number;
  readonly z?: number;
  readonly yaw2048?: number;
}

export interface NpcCenterTransformOptions {
  readonly getState: (currentTick: number, interpolatedTick: number) => NpcCenterTransformState | null;
  readonly zOffset?: number;
}

export function createNpcCenterTransformSource(options: NpcCenterTransformOptions): TransformSource {
  return {
    kind: 'dynamic',
    resolve(currentTick, interpolatedTick, terrainHeights): SpotAnimTransform | null {
      const state = options.getState(currentTick, interpolatedTick);
      if (state === null) {
        return null;
      }

      const position: [number, number, number] = [
        state.swX + state.size / 2,
        state.swY + state.size / 2,
        (state.z ?? getLocCenterHeight(terrainHeights, state.swX, state.swY, state.size, state.size)) +
          (options.zOffset ?? 0),
      ];

      if (state.yaw2048 === undefined) {
        return { position };
      }

      return { position, yaw2048: state.yaw2048 };
    },
  };
}
