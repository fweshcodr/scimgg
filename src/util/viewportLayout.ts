/**
 * The one inset of the chrome around the game, in its own (unzoomed) pixels: the launcher row and
 * Plugins from the window's top corners (or the Fixed frame's border), the gap between the row and
 * the pane under it, the boss bar's top inset, and the Chatbox infobox rows and readouts from the
 * frame's left and the chatbox below them. An edge measured outside the zoomed chrome is this times
 * its zoom. The window-fixed hint toast shares it too, or it separates from the readouts.
 */
export const HUD_TOOL_GAP = 4;

/** How much of the window's left and right edges the open sidebars cover (App `uiInsets`). */
export interface SidebarInsets {
  readonly left: number;
  readonly right: number;
}

const NO_SIDEBARS: SidebarInsets = { left: 0, right: 0 };

/** The x the room the open sidebars leave in a `windowWidth` window is centered on. */
export function uncoveredCentreX(windowWidth: number, sidebars: SidebarInsets = NO_SIDEBARS): number {
  return sidebars.left + (windowWidth - sidebars.left - sidebars.right) / 2;
}

/**
 * Where something `size` long starts on a `span` it is centered in, unrounded: centered in the part
 * the sidebars leave uncovered (`before` and `after` cover the span's two ends), but never past
 * either end of the span. So a box that fits beside the sidebars sits centered between them; one that
 * fits only the whole span reaches under them, as near that center as staying on the span allows
 * (both sidebars open: the span's own center); and one longer than the span starts at its leading
 * edge, as it always has, rather than moving when a sidebar opens.
 */
export function centredInUncovered(span: number, size: number, before = 0, after = 0): number {
  const centred = before + (span - before - after - size) / 2;
  return Math.min(Math.max(centred, 0), Math.max(0, span - size));
}

/**
 * Where a frame smaller than the stage sits in it: Fixed's client and a locked resolution. Centered
 * in the room the sidebars leave (`centredInUncovered`), as the resizable layouts keep the player
 * centered there, and on whole screen pixels: `area` is the stage's box in the window, so the origin
 * is snapped where the frame lands on screen, then returned relative to the area. Sidebars overlay
 * the full window and the stage spans its width, so the window insets apply to the area as they are.
 */
export function frameOrigin(
  frame: { readonly width: number; readonly height: number },
  area: { readonly left: number; readonly top: number; readonly width: number; readonly height: number },
  sidebars: SidebarInsets = NO_SIDEBARS,
): { x: number; y: number } {
  const snap = (start: number, offset: number) => Math.max(0, Math.round(start + offset) - start);
  return {
    x: snap(area.left, centredInUncovered(area.width, frame.width, sidebars.left, sidebars.right)),
    y: snap(area.top, centredInUncovered(area.height, frame.height)),
  };
}

/**
 * How far each open sidebar reaches over a frame `x` (window pixels) and `width` wide, measured in
 * from that edge of the frame (App `viewportInsets`): only the part of a sidebar that actually
 * covers the frame counts, so one beside the frame contributes zero.
 */
export function sidebarOverlap(
  frame: { readonly x: number; readonly width: number },
  windowWidth: number,
  sidebars: SidebarInsets,
): SidebarInsets {
  const frameRight = frame.x + frame.width;
  return {
    left: Math.max(0, Math.min(sidebars.left, frameRight) - Math.max(frame.x, 0)),
    right: Math.max(0, Math.min(frameRight, windowWidth) - Math.max(windowWidth - sidebars.right, frame.x)),
  };
}
