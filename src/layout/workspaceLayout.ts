/**
 * The replay workspace: the rectangle a recording's cursor and frame are laid out in. It is the
 * game frame itself, so workspace-local pixels are frame-local pixels.
 */
export interface WorkspaceRect {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

export interface WorkspacePresentationGeometry {
  readonly width: number;
  readonly height: number;
}

export interface WorkspaceDockLayout {
  readonly bounds: WorkspaceRect;
  readonly workspace: WorkspacePresentationGeometry;
}

/** The live workspace: exactly the game frame, `gameFrame` in stage pixels. */
export function frameWorkspace(gameFrame: WorkspaceRect): WorkspaceDockLayout {
  return {
    bounds: { ...gameFrame },
    workspace: { width: gameFrame.width, height: gameFrame.height },
  };
}
