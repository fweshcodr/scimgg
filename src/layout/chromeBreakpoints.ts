import { FIXED_FRAME, FIXED_SCENE, FIXED_VIEWPORT } from './osrsClientLayout';

/**
 * Every size-driven switch of the chrome around the game, and the one place their thresholds live.
 *
 * Each is a pure function of sizes the switch itself never changes, with no history, so none can
 * oscillate and a size has one answer: a window resized across a line crosses it once.
 *
 *   switch                         input                                          line
 *   narrow window                  window width                                   720 (NARROW_WINDOW_WIDTH)
 *   launcher labels or icons       the scene's width from the row to its right    half (LAUNCHER_ROW_MAX_SHARE),
 *                                  inset, against the labeled row (Replay          for the labeled row
 *                                  counted before its recording)
 *   pane under its launcher, in    room under the row, then in the right-side     150 wide (PANE_MIN_WIDTH); Practice
 *   the right-side column, or the  column, per pane, against the viewport and     140, Actions / Menu 96 tall
 *   narrow-window tool window      the fixed chrome only (never an overlay)       (PANE_MIN_HEIGHT, topChromeLayout.ts)
 *   Auto UI scale                  usable window height                           1216, 1760, 1900, 3500
 *
 * The launcher row's form follows the viewport alone, never the overlays on it: the boss bar,
 * infoboxes and the rest place themselves around whatever form the row takes (the boss bar also
 * around the minimap and Plugins, topChromeLayout.ts `bossBarDefault`), so nothing they do can
 * change it.
 *
 * Not a switch: the scene's protected play area (protectedPlayArea) is a bound, not a line. No pane
 * under its launcher enters it; pane widths follow the room left of it continuously. The narrow-window
 * tool window is the exception: in a window too small for any column it may cover scene ground while
 * it is open.
 *
 * The narrow line only applies to windows a desktop browser cannot reach (App.css holds desktop at
 * 765x503), so on desktop it never meets the others.
 */

/**
 * Narrow windows: phones, and desktop windows a fine pointer cannot shrink to. The sidebars and
 * tutorial switch to their compact forms here (the `max-width: 720px` and `min-width: 721px` media
 * queries in CSS use the same number, guarded by a test), and the replay transport goes compact.
 * The encounter title instead responds to its scene container's dimensions.
 */
export const NARROW_WINDOW_WIDTH = 720;

export function isNarrowWindow(width: number): boolean {
  return width <= NARROW_WINDOW_WIDTH;
}

/**
 * The launcher row's labels or icons: the most of the scene's width, from where the row starts to
 * the scene's right inset, the labeled row may cover. It has two forms: all labeled, or every
 * launcher, Menu too, as its icon. It is labeled where the labeled row of every launcher that can
 * show (Replay counted before there is a recording, except in a combat tutorial, which hides it) is
 * within this share, and icons otherwise.
 *
 * Half, so the other half stays the game's. Labeled 282px (Menu 56, Practice 76, Actions 72,
 * Replay 66, 4px gaps), icons 124px (four 28px icons):
 * - Fixed 1x (504px of room): icons, 8..132; with the Settings drawer open (188px), icons at 324.
 * - Fixed fitted to the window: labeled down to a fit of about 1.12x (855x562); 1280x720 with the
 *   Settings drawer open (503px of room): icons.
 * - Modern: labeled at every desktop size with the drawers closed; with the Settings drawer open
 *   (the row starts at 324), icons below 892px wide.
 * - A narrow Modern window (Modern 480 portrait): icons below 572px wide.
 * Sizes in window pixels, so the chrome's zoom and Fixed's scale change nothing.
 *
 * The room ends at the scene's inset, not at the minimap or Plugins over the scene in Modern and
 * Classic, so a labeled row can reach them: the Plugins drawer moves the minimap left under the
 * row's end (Modern 800 with it open: the row ends at 286, the minimap starts at 236), and with both
 * drawers open on a narrow window Plugins gives way to the row and hides (topChromeLayout.ts
 * `pluginsClearOfRow`).
 */
export const LAUNCHER_ROW_MAX_SHARE = 0.5;

export function launcherRowFits(rowWidth: number, room: number): boolean {
  return rowWidth <= room * LAUNCHER_ROW_MAX_SHARE;
}

export interface Box {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

export interface FrameObstacle {
  readonly left: number;
  readonly top: number;
  readonly right: number;
  readonly bottom: number;
}

/**
 * The game scene inside a laid-out frame, in the frame's own (window) pixels: the whole frame in
 * the resizable layouts, where the scene runs under the chrome, and the cache's scene rectangle in
 * Fixed, scaled by the frame's width (FIXED_VIEWPORT with the chatbox open, FIXED_SCENE without).
 */
export function sceneInFrame(frame: Box, fixedLayout: boolean, chatboxOpen: boolean): Box {
  if (!fixedLayout) return frame;
  const scale = frame.width / FIXED_FRAME.width;
  const scene = chatboxOpen ? FIXED_VIEWPORT : FIXED_SCENE;
  return {
    x: frame.x + scene.x * scale,
    y: frame.y + scene.y * scale,
    width: scene.width * scale,
    height: scene.height * scale,
  };
}

/**
 * The scene's protected play area, in the frame's pixels: the ground the player clicks on, which no
 * Practice, Actions or Menu pane may enter. Click-through overlays (infoboxes, the boss bar, XP
 * drops) may lie over it: they never take a click.
 *
 * The camera keeps the player on the scene's center line, between about 0.48 and 0.62 of its height
 * depending on pitch, and the world is drawn at a scale that follows the scene's height
 * (Projection3D: `viewportZoom = viewportHeight * lensStrength / 334`), a tile being about 0.164 of
 * the height across at the default zoom. So the area is a band 0.2 of the height either side of the
 * center line, about a tile and a quarter each way at the closest default zoom and more zoomed out,
 * running from 0.3 of the height (above the player at any pitch) to the scene's bottom: the player,
 * their neighbors, and all the ground south of them to walk back onto. Sized by the height, it
 * covers the same patch of ground at every window size.
 *
 * Not protected from the replay transport: during playback the scene takes no movement clicks, and
 * the transport is the control in use.
 */
export const PROTECTED_HALF_WIDTH = 0.2;
export const PROTECTED_TOP = 0.3;

export function protectedPlayArea(scene: Box): FrameObstacle {
  const centre = scene.x + scene.width / 2;
  const half = PROTECTED_HALF_WIDTH * scene.height;
  return {
    left: centre - half,
    top: scene.y + PROTECTED_TOP * scene.height,
    right: centre + half,
    bottom: scene.y + scene.height,
  };
}
