import type { Camera, Camera3D, Viewport } from '../../render/core/camera';
import type { RenderFrame } from '../../render/core/renderer';
import type { TileCoord } from '../../render/core/types';
import { vec3 } from '../../render/core/types';

export function createMockCamera(): Camera {
  const mockCamera3D: Camera3D = {
    viewport: { width: 800, height: 600, dpr: 1 },
    viewMatrix: () => new Float32Array(16),
    projectionMatrix: () => new Float32Array(16),
    tileToWorld: (_tile: TileCoord) => vec3(0, 0, 0),
  };
  return { kind: '3d', camera: mockCamera3D };
}

export function createMockViewport(): Viewport {
  return {
    width: 800,
    height: 600,
    dpr: 1,
  };
}

export function createMockRenderFrame(): RenderFrame {
  return {
    camera: createMockCamera(),
    queue: {
      replayPresentationReady: true,
      commands: [],
    },
  };
}
