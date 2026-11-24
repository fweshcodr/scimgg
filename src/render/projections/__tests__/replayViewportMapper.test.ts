import { describe, expect, it } from 'vitest';
import type { ReplayViewportSample, ReplayViewportState } from '../../../core/ReplayRecorder';
import { createProjection3D, type OrbitCameraState } from '../Projection3D';
import {
  interpolateReplayViewportState,
  orbitCameraStateToReplayViewportState,
  replayViewportStateOf,
  replayViewportStateToOrbitCameraState,
} from '../replayViewportMapper';

function makeReplayViewportState(
  overrides: Partial<Omit<ReplayViewportState, 'kind' | 'target'>> & { target?: ReplayViewportState['target'] } = {},
): ReplayViewportState {
  return {
    kind: 'orbit3d',
    pitchDeg: overrides.pitchDeg ?? -45,
    yawDeg: overrides.yawDeg ?? 180,
    fovScale: overrides.fovScale ?? 512,
    target: overrides.target ?? { x: 31.5, y: 37.5, z: 0.9 },
  };
}

describe('replayViewportMapper', () => {
  it('records the pitch the camera is drawn at, including a terrain raise', () => {
    const cam = createProjection3D({ width: 800, height: 600, dpr: 1 }, { pitch: -22.5, targetX: 32.5, targetY: 32.5 });
    const heights = Array.from({ length: 65 }, () => new Int32Array(65));
    // A corner 600 units above the focal point lifts the camera toward 300 JAU.
    heights[34]![32] = -600;
    cam.setTerrainHeights(heights);
    for (let i = 0; i < 2000; i++) cam.stepTerrainPitch(20);

    expect(cam.getCameraState().pitch).toBe(-22.5);
    expect(replayViewportStateOf(cam).pitchDeg).toBe(cam.getViewPitch());
    expect(replayViewportStateOf(cam).pitchDeg).toBeLessThan(-50);
  });

  it('maps an orbit camera state into the replay viewport schema, leaving out the derived distance', () => {
    const cameraState: OrbitCameraState = {
      pitch: -42,
      yaw: 135,
      distance: 7,
      fovScale: 640,
      targetX: 31.5,
      targetY: 37.5,
      targetZ: 0.9,
    };

    const replayState = orbitCameraStateToReplayViewportState(cameraState);

    expect(replayState).toEqual({
      kind: 'orbit3d',
      pitchDeg: -42,
      yawDeg: 135,
      fovScale: 640,
      target: { x: 31.5, y: 37.5, z: 0.9 },
    });
  });

  it('maps a replay viewport state back to an orbit camera update', () => {
    const replayState: ReplayViewportState = {
      kind: 'orbit3d',
      pitchDeg: -35,
      yawDeg: 270,
      fovScale: 384,
      target: { x: 12.5, y: 18.5, z: 1.25 },
    };

    const cameraState = replayViewportStateToOrbitCameraState(replayState);

    expect(cameraState).toEqual({
      pitch: -35,
      yaw: 270,
      fovScale: 384,
      targetX: 12.5,
      targetY: 18.5,
      targetZ: 1.25,
    });
  });

  it('holds every camera field when the next observation has not arrived', () => {
    const samples: readonly ReplayViewportSample[] = [
      {
        tMs: 0,
        viewportState: makeReplayViewportState({
          pitchDeg: -50,
          yawDeg: 100,
          fovScale: 400,
          target: { x: 10, y: 20, z: 1 },
        }),
      },
      {
        tMs: 600,
        viewportState: makeReplayViewportState({
          pitchDeg: -30,
          yawDeg: 160,
          fovScale: 700,
          target: { x: 16, y: 26, z: 4 },
        }),
      },
    ];

    const replayState = interpolateReplayViewportState(samples, 300, makeReplayViewportState());

    expect(replayState).toBe(samples[0]?.viewportState);
  });

  it.each([
    [50, 350],
    [100, 350],
    [400, 350],
    [699, 350],
    [700, 10],
    [900, 10],
  ])('holds the observed yaw at %s ms when rotation crosses zero', (playheadMs, expectedYaw) => {
    const first = makeReplayViewportState({ yawDeg: 350 });
    const last = makeReplayViewportState({ yawDeg: 10 });
    const samples: readonly ReplayViewportSample[] = [
      { tMs: 100, viewportState: first },
      { tMs: 700, viewportState: last },
    ];

    const replayState = interpolateReplayViewportState(samples, playheadMs, makeReplayViewportState());

    expect(replayState?.yawDeg).toBe(expectedYaw);
  });

  it('returns the frame camera when the viewport track is empty', () => {
    const frameCamera = makeReplayViewportState({ yawDeg: 270 });

    const replayState = interpolateReplayViewportState([], 400, frameCamera);

    expect(replayState).toBe(frameCamera);
  });

  it('returns no camera when neither track nor frame captured one', () => {
    const replayState = interpolateReplayViewportState([], 400, undefined);

    expect(replayState).toBeUndefined();
  });

  it.each([
    6_000, 30_000, 59_400, 59_700, 59_999, 60_000,
  ])('holds a static camera until the actual change when seeking to %s ms', (playheadMs) => {
    const still = makeReplayViewportState({ yawDeg: 180 });
    const moved = makeReplayViewportState({ yawDeg: 260 });
    const samples: readonly ReplayViewportSample[] = [
      { tMs: 0, viewportState: still },
      { tMs: 60_000, viewportState: moved },
    ];

    const replayState = interpolateReplayViewportState(samples, playheadMs, still);

    expect(replayState).toBe(playheadMs < 60_000 ? still : moved);
  });

  it('selects the last observation when multiple cameras share an exact timestamp', () => {
    const first = makeReplayViewportState({ yawDeg: 90 });
    const last = makeReplayViewportState({ yawDeg: 270 });
    const samples = [
      { tMs: 100, viewportState: first },
      { tMs: 100, viewportState: last },
      { tMs: 200, viewportState: first },
    ];

    const replayState = interpolateReplayViewportState(samples, 100, undefined);

    expect(replayState).toBe(last);
  });
});
