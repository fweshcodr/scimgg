import type { ReplayViewportSample, ReplayViewportState } from '../../core/ReplayRecorder';
import type { OrbitCameraState, Projection3D, RestoredOrbitCameraState } from './Projection3D';

export function orbitCameraStateToReplayViewportState(state: OrbitCameraState): ReplayViewportState {
  return {
    kind: 'orbit3d',
    pitchDeg: state.pitch,
    yawDeg: state.yaw,
    fovScale: state.fovScale,
    target: {
      x: state.targetX,
      y: state.targetY,
      z: state.targetZ,
    },
  };
}

/** What a replay records: the camera as drawn, so playback keeps any terrain pitch raise. */
export function replayViewportStateOf(projection: Projection3D): ReplayViewportState {
  return orbitCameraStateToReplayViewportState({ ...projection.getCameraState(), pitch: projection.getViewPitch() });
}

export function replayViewportStateToOrbitCameraState(state: ReplayViewportState): RestoredOrbitCameraState {
  return {
    pitch: state.pitchDeg,
    yaw: state.yawDeg,
    fovScale: state.fovScale,
    targetX: state.target.x,
    targetY: state.target.y,
    targetZ: state.target.z,
  };
}

export function interpolateReplayViewportState(
  samples: readonly ReplayViewportSample[],
  playheadMs: number,
  frameViewportState: ReplayViewportState | undefined,
): ReplayViewportState | undefined {
  if (samples.length === 0) return frameViewportState;
  let lower = 0;
  let upper = samples.length;
  while (lower < upper) {
    const middle = Math.floor((lower + upper) / 2);
    const sample = samples[middle];
    if (sample && sample.tMs <= playheadMs) {
      lower = middle + 1;
    } else {
      upper = middle;
    }
  }
  return samples[Math.max(0, lower - 1)]?.viewportState ?? frameViewportState;
}
