import { describe, expect, it } from 'vitest';
import type { OrbitCameraState } from '../../projections/Projection3D';
import { didOrbitCameraStateChange } from '../cameraChangeDetection';

const CAMERA_STATE: OrbitCameraState = {
  pitch: -45,
  yaw: 180,
  distance: 6,
  fovScale: 512,
  targetX: 31.5,
  targetY: 37.5,
  targetZ: 0.9,
};

describe('didOrbitCameraStateChange', () => {
  it('detects per-frame player-follow target movement', () => {
    // Given
    const followedState = { ...CAMERA_STATE, targetX: 31.625, targetY: 37.625 };

    // When
    const changed = didOrbitCameraStateChange(CAMERA_STATE, followedState);

    // Then
    expect(changed).toBe(true);
  });

  it('does not emit redundant camera samples for an unchanged state', () => {
    // Given / When
    const changed = didOrbitCameraStateChange(CAMERA_STATE, { ...CAMERA_STATE });

    // Then
    expect(changed).toBe(false);
  });
});
