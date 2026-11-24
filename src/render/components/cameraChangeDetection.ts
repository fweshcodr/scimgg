import type { OrbitCameraState } from '../projections/Projection3D';

export function didOrbitCameraStateChange(previous: OrbitCameraState, current: OrbitCameraState): boolean {
  return (
    previous.pitch !== current.pitch ||
    previous.yaw !== current.yaw ||
    previous.distance !== current.distance ||
    previous.fovScale !== current.fovScale ||
    previous.targetX !== current.targetX ||
    previous.targetY !== current.targetY ||
    previous.targetZ !== current.targetZ
  );
}
