import {
  computeReplayPresentationLayout,
  type ReplayPresentationLayout,
  type ReplayPresentationState,
} from '../core/replayPresentation';
import { centredInUncovered, type SidebarInsets } from '../util/viewportLayout';
import type { WorkspacePresentationGeometry } from './workspaceLayout';

type WorkspaceSnapshot = Pick<ReplayPresentationState, 'frame' | 'workspace'>;

export function recordedWorkspace(presentation: WorkspaceSnapshot): WorkspacePresentationGeometry {
  return presentation.workspace ?? { width: presentation.frame.width, height: presentation.frame.height };
}

/**
 * Where the recording is drawn in the viewer's window. Its horizontal center is the room the
 * viewer's open sidebars leave (`sidebars`, the viewer's own chrome and never recorded), as the
 * live frame's is (`frameOrigin`); its size is fitted to the whole window, which the sidebars only
 * overlay, so opening one moves the recording but never rescales it.
 */
export function fitReplayWorkspace(
  presentation: WorkspaceSnapshot,
  availableWidth: number,
  availableHeight: number,
  preserveFrameSize = false,
  sidebars: SidebarInsets = { left: 0, right: 0 },
): { readonly workspace: ReplayPresentationLayout; readonly frame: ReplayPresentationLayout } {
  const geometry = recordedWorkspace(presentation);
  const scaled = computeReplayPresentationLayout(
    geometry,
    preserveFrameSize ? Math.max(geometry.width, availableWidth) : availableWidth,
    preserveFrameSize ? Math.max(geometry.height, availableHeight) : availableHeight,
  );
  const fitted = {
    ...scaled,
    offsetX: centredInUncovered(availableWidth, scaled.displayWidth, sidebars.left, sidebars.right),
  };
  // A recording with workspace metadata, drawn at its recorded size, centers the game frame on
  // whole pixels and is only moved to keep the workspace inside the viewer's window.
  const workspace =
    presentation.workspace && fitted.scale === 1
      ? {
          ...fitted,
          offsetX: Math.max(
            0,
            Math.min(
              availableWidth - geometry.width,
              Math.round(centredInUncovered(availableWidth, presentation.frame.width, sidebars.left, sidebars.right)),
            ),
          ),
          offsetY: Math.max(
            0,
            Math.min(availableHeight - geometry.height, Math.round((availableHeight - presentation.frame.height) / 2)),
          ),
        }
      : fitted;
  return {
    workspace,
    frame: {
      scale: workspace.scale,
      offsetX: workspace.offsetX,
      offsetY: workspace.offsetY,
      displayWidth: presentation.frame.width * workspace.scale,
      displayHeight: presentation.frame.height * workspace.scale,
    },
  };
}

export interface ViewportSizeWarning {
  readonly width: number;
  readonly height: number;
  /** The oversized thing is a RECORDING, which the viewer cannot resize. Changes the advice given. */
  readonly replay: boolean;
}

/**
 * The oversized geometry to warn about, or null when everything fits.
 *
 * A replay is measured by its FITTED WORKSPACE rather than the viewer's own requested size: any
 * explicit resolution sets `preserveFrameSize`, which keeps the recording at scale 1, so a
 * recording larger than the window is clipped while the viewer's smaller selection still fits.
 */
export function resolveViewportSizeWarning(input: {
  readonly presentation: WorkspaceSnapshot | null;
  readonly fit: { readonly workspace: ReplayPresentationLayout } | null;
  readonly requestedFrameSize: { readonly width: number; readonly height: number } | null;
  readonly windowWidth: number;
  readonly windowHeight: number;
}): ViewportSizeWarning | null {
  const { presentation, fit, requestedFrameSize, windowWidth, windowHeight } = input;
  if (presentation && fit) {
    const { workspace } = fit;
    // A scaled-to-fit workspace lands on its bound with floating-point dust (1920 * (1000 / 1920)
    // is 1000.0000000000001), so only an overflow of a whole pixel counts as clipped.
    const clipped =
      workspace.offsetX < -1 ||
      workspace.offsetY < -1 ||
      workspace.offsetX + workspace.displayWidth > windowWidth + 1 ||
      workspace.offsetY + workspace.displayHeight > windowHeight + 1;
    if (!clipped) return null;
    const geometry = recordedWorkspace(presentation);
    return { width: geometry.width, height: geometry.height, replay: true };
  }
  if (!requestedFrameSize) return null;
  if (requestedFrameSize.width <= windowWidth && requestedFrameSize.height <= windowHeight) return null;
  return { width: requestedFrameSize.width, height: requestedFrameSize.height, replay: false };
}
