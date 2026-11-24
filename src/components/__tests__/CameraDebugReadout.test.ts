import { describe, expect, it } from 'vitest';
import { createProjection3D } from '../../render/projections/Projection3D';
import { formatCameraReadout } from '../CameraDebugReadout';

describe('formatCameraReadout', () => {
  it('reads the camera in the units an encounter defaultCamera takes', () => {
    const cam = createProjection3D({ width: 800, height: 600, dpr: 1 }, { yaw: 0, pitch: -30, fovScale: 187 });
    expect(formatCameraReadout(cam)).toBe('yaw: 0 (N), pitch: -30, zoom: 187');
  });

  it('names the direction the camera looks, west being yaw 90', () => {
    const cam = createProjection3D({ width: 800, height: 600, dpr: 1 }, { yaw: -90 });
    expect(formatCameraReadout(cam)).toMatch(/^yaw: 270 \(E\)/);
    cam.updateCamera({ yaw: 90 });
    expect(formatCameraReadout(cam)).toMatch(/^yaw: 90 \(W\)/);
  });
});
