import { describe, expect, it } from 'vitest';
import { fitReplayWorkspace, recordedWorkspace, resolveViewportSizeWarning } from '../replayWorkspaceLayout';
import type { WorkspacePresentationGeometry } from '../workspaceLayout';

const frame = { width: 765, height: 503 };
const workspace: WorkspacePresentationGeometry = { width: 765, height: 503 };

describe('replay workspace fitting', () => {
  it('centers a recording with workspace metadata on whole pixels when it fits', () => {
    const fit = fitReplayWorkspace({ frame, workspace }, 1600, 1000);

    expect(fit.frame).toEqual({ scale: 1, offsetX: 418, offsetY: 249, displayWidth: 765, displayHeight: 503 });
    expect(fit.workspace).toEqual(fit.frame);
  });

  it('does not shrink the recorded frame when the viewer has locked its resolution', () => {
    const fit = fitReplayWorkspace({ frame, workspace }, 740, 400, true);

    expect(fit.frame).toEqual({ scale: 1, offsetX: 0, offsetY: 0, displayWidth: 765, displayHeight: 503 });
    expect(fit.workspace.scale).toBe(1);
  });

  it('places a recording without workspace metadata at the exact center', () => {
    expect(recordedWorkspace({ frame })).toEqual({ width: 765, height: 503 });
    expect(fitReplayWorkspace({ frame }, 1280, 720).frame).toEqual({
      scale: 1,
      offsetX: 257.5,
      offsetY: 108.5,
      displayWidth: 765,
      displayHeight: 503,
    });
  });

  it('downscales a recording larger than the viewer, frame and workspace together', () => {
    const large = { width: 900, height: 550 };
    const fit = fitReplayWorkspace({ frame: large, workspace: large }, 450, 400);

    expect(fit.workspace).toEqual({ scale: 0.5, offsetX: 0, offsetY: 62.5, displayWidth: 450, displayHeight: 275 });
    expect(fit.frame).toEqual(fit.workspace);
  });

  it("centers the recording beside the viewer's open sidebars without rescaling it", () => {
    const both = { left: 320, right: 320 };
    // A Fixed recording in a 1920 window: centered in the 1280 the drawers leave, on whole pixels.
    expect(
      fitReplayWorkspace({ frame, workspace: recordedWorkspace({ frame }) }, 1920, 1080, false, both).frame,
    ).toEqual({ scale: 1, offsetX: 578, offsetY: 289, displayWidth: 765, displayHeight: 503 });
    expect(
      fitReplayWorkspace({ frame, workspace: recordedWorkspace({ frame }) }, 1920, 1080, false, {
        left: 320,
        right: 0,
      }).frame.offsetX,
    ).toBe(738);
    // A recording without a workspace moves the same way.
    expect(fitReplayWorkspace({ frame }, 1920, 1080, false, { left: 320, right: 0 }).frame.offsetX).toBe(737.5);
    // A recording downscaled to the window keeps its scale; only its slack moves, and it stays on screen.
    const big = { frame: { width: 1920, height: 1080 } };
    const plain = fitReplayWorkspace(big, 1600, 1000);
    const beside = fitReplayWorkspace(big, 1600, 1000, false, { left: 320, right: 0 });
    expect(beside.frame.scale).toBe(plain.frame.scale);
    expect(beside.frame.offsetX).toBe(0);
    expect(beside.frame.offsetX + beside.frame.displayWidth).toBeLessThanOrEqual(1600);
  });
});

describe('viewport size warning', () => {
  const recording = { frame: { width: 1920, height: 1080 } };
  const selected = { width: 765, height: 503 };

  it('warns with the RECORDED size when a preserved recording overflows the viewer', () => {
    // The case this covers: the viewer's own 765x503 selection fits in this window, so a check against
    // the requested size stays silent while the 1920x1080 recording is clipped at scale 1.
    const fit = fitReplayWorkspace(recording, 1000, 800, true);

    expect(
      resolveViewportSizeWarning({
        presentation: recording,
        fit,
        requestedFrameSize: selected,
        windowWidth: 1000,
        windowHeight: 800,
      }),
    ).toEqual({ width: 1920, height: 1080, replay: true });
  });

  it('stays silent when the same recording is allowed to scale down to fit', () => {
    const fit = fitReplayWorkspace(recording, 1000, 800);

    expect(
      resolveViewportSizeWarning({
        presentation: recording,
        fit,
        requestedFrameSize: null,
        windowWidth: 1000,
        windowHeight: 800,
      }),
    ).toBeNull();
  });

  it('reports the live selection outside replay, and nothing when it fits', () => {
    const live = { presentation: null, fit: null, windowWidth: 740, windowHeight: 400 } as const;

    expect(resolveViewportSizeWarning({ ...live, requestedFrameSize: selected })).toEqual({
      width: 765,
      height: 503,
      replay: false,
    });
    expect(resolveViewportSizeWarning({ ...live, requestedFrameSize: { width: 640, height: 360 } })).toBeNull();
    expect(resolveViewportSizeWarning({ ...live, requestedFrameSize: null })).toBeNull();
  });
});
