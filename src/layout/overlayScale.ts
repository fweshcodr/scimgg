import type { UIPosition } from '../hooks/usePersistedSettings';
import { type ClientLayoutMode, FIXED_VIEWPORT, placeFixedFrame } from './osrsClientLayout';

/**
 * Size of the screen chrome that sits outside the game client: the menu buttons, the
 * replay transport and the plugin overlays (boss HP, XP drops, DPS,
 * prayer flick, Zuk timer). Independent of `uiScale`, which sizes the game panel, minimap
 * and orbs.
 *
 * All of them follow Auto: nothing here is sized by hand.
 */
export const OVERLAY_SCALE_MIN = 1;
export const OVERLAY_SCALE_MAX = 3;

/** A CSS-pixel area something is sized from. */
export interface OverlayScene {
  readonly width: number;
  readonly height: number;
}

/**
 * The two spaces Auto sizes from.
 * - `window`: the browser viewport. The menu buttons and the replay transport live in it,
 *   whatever the game frame does.
 * - `gameView`: the 3D scene the plugin overlays sit over. The window in a
 *   resizable layout that fills it (not the frame, so opening a sidebar does not re-zoom
 *   every overlay); a set resolution's frame, as much of it as the window shows; Fixed's
 *   stretched 512x334 viewport. Sizing the overlays from the scene is what keeps a small
 *   frame in a big window from being buried under window-sized overlays.
 */
export interface OverlaySpaces {
  readonly window: OverlayScene;
  readonly gameView: OverlayScene;
}

export function overlaySpacesForLayout({
  layout,
  window,
  fixedLayoutScale = 'fit',
  fixedIntegerScaling = false,
  resolution,
}: {
  layout: ClientLayoutMode;
  window: OverlayScene;
  /** Fixed's explicit multiple, or how it fills the window (default 'fit'). */
  fixedLayoutScale?: 'fit' | 'stretch' | number;
  fixedIntegerScaling?: boolean;
  /** A resizable layout's set resolution, or null when the frame fills the window. */
  resolution?: OverlayScene | null;
}): OverlaySpaces {
  if (layout === 'fixed') {
    // The scale the overlays are laid out at. Stretch's frame is measured over the whole window
    // here, not beside the open sidebars, so opening one does not re-zoom every overlay.
    const { scale } = placeFixedFrame(window.width, window.height, fixedLayoutScale, fixedIntegerScaling).layout;
    return { window, gameView: { width: FIXED_VIEWPORT.width * scale, height: FIXED_VIEWPORT.height * scale } };
  }
  if (!resolution) return { window, gameView: window };
  return {
    window,
    gameView: { width: Math.min(resolution.width, window.width), height: Math.min(resolution.height, window.height) },
  };
}

/**
 * How big the chrome may get, by the space's usable height: its height, or three quarters
 * of its width when that is less, so a narrow space is not sized by its height alone.
 *
 * A table rather than a curve, with every switch point in a gap between the heights real
 * windows come in. A browser on one monitor spans a range of heights: full screen at the
 * top, maximized below that with the taskbar (30-48px), the browser's own bars (71-87px), a
 * bookmarks bar (32px) and a translate or download bar (40px) taken off; macOS takes its
 * menu bar and dock instead. A switch point inside such a range gave one monitor two sizes
 * 33-50% apart depending on which bars were showing. The ranges, in CSS pixels (OS scaling
 * folded in), and where they land:
 *
 *   561-1200    768p to 1200p, 1440p at 125%, MacBooks at 200%        1
 *   1233-1728   1440p (and 3440/5120 ultrawides), 1600p, 4K at 125%   1.25
 *   1953-2160   4K                                                    2
 *   2673-2880   5K                                                    2
 *   4113-4320   8K                                                    2.5
 *
 * 1080p and 1200p run into each other (1200p maximized with every bar showing is shorter
 * than 1080p full screen), so no switch point separates them: both keep the 1x design. The
 * 1.5 row only catches windows sized by hand between 1440p and 4K.
 */
const AUTO_STEPS: ReadonlyArray<{ readonly from: number; readonly scale: number }> = [
  { from: 1216, scale: 1.25 },
  { from: 1760, scale: 1.5 },
  { from: 1900, scale: 2 },
  { from: 3500, scale: 2.5 },
];

export function autoOverlayTarget(scene: OverlayScene, heightFactor = 1): number {
  const height = Math.min(scene.height, (scene.width * 3) / 4) * heightFactor;
  let target = OVERLAY_SCALE_MIN;
  for (const step of AUTO_STEPS) if (height >= step.from) target = step.scale;
  return target;
}

/**
 * The sizes chrome may take on a display. The RuneScape faces are 16 units per em, so a
 * glyph edge lands on a device pixel only where zoom x devicePixelRatio is a whole
 * number: those sizes read back 0% soft glyph pixels at DPR 1,
 * 1.25, 1.5 and 2 (once borders stop shifting the content, see `--unscaled-px`).
 * Where whole numbers leave gaps wider than half a step (DPR 1: 1, 2, 3), the halves
 * between them fill in: they put every other glyph edge on the grid and measured
 * 26-51% soft, against 60-85% for any other fraction. 1 is always there as the design
 * size, even where it is itself soft (DPR 1.25).
 *
 * One finer step is added (see GENTLE_STEP); others (1.75: 62% soft at DPR 1) are left
 * out, since Auto changes size once, on settle, with a short transition.
 */
export function crispOverlayScales(devicePixelRatio: number): number[] {
  const dpr = Number.isFinite(devicePixelRatio) && devicePixelRatio > 0 ? devicePixelRatio : 1;
  const perStep = 1 / dpr > 0.5 ? 2 * dpr : dpr;
  const scales = [OVERLAY_SCALE_MIN];
  for (let k = Math.floor(OVERLAY_SCALE_MIN * perStep) + 1; k / perStep <= OVERLAY_SCALE_MAX + 1e-9; k++) {
    scales.push(k / perStep);
  }
  if (!scales.some((scale) => Math.abs(scale / GENTLE_STEP - 1) < 0.07)) {
    scales.push(GENTLE_STEP);
    scales.sort((a, b) => a - b);
  }
  return scales;
}

/**
 * The first step up from the 1x design, added where the ladder leaves a gap: without it DPR
 * 1 and 2 jump straight from 1 to 1.5, which is too much for 1440p. Soft at DPR 1 (68% of
 * glyph pixels, next to 1.5's 51%) and a half step at DPR 2 (34%); DPR 1.25 and 1.5 already
 * have a size within 7% of it (1.2 and 4/3), so they do not get it.
 */
const GENTLE_STEP = 1.25;

/** Pixel-exact on this display: every glyph edge on a device pixel. */
function isSharp(scale: number, dpr: number): boolean {
  const device = scale * dpr;
  return Math.abs(device - Math.round(device)) < 1e-6;
}

/** A sharp size this little above the target is taken over the one below it. */
const SHARP_ROUND_UP = 1.07;

/**
 * The ladder size for `target`: the largest at or under it, so Auto never rounds up into a
 * step the space has no room for, except to a sharp size within 7% above. That keeps one
 * monitor class at one physical size across OS scaling: 1440p's 1.25 becomes the
 * pixel-exact 4/3 on a 4K display at 150%, whose ladder has no 1.25.
 */
export function crispScaleAtMost(target: number, devicePixelRatio: number): number {
  const ladder = crispOverlayScales(devicePixelRatio);
  const sharpAbove = ladder.find(
    (scale) => scale > target + 1e-9 && scale <= target * SHARP_ROUND_UP && isSharp(scale, devicePixelRatio),
  );
  if (sharpAbove !== undefined) return sharpAbove;
  // Float noise must not drop a target that sits exactly on a ladder size.
  return ladder.filter((scale) => scale <= target + 1e-9).at(-1) ?? OVERLAY_SCALE_MIN;
}

/**
 * How far below a switch point the space must shrink before Auto steps down, as a ratio of
 * its usable height. Without it a window resized back and forth across a boundary, or tiled at a
 * size that sits right on one, flips every surface between two sizes on each small move.
 */
export const AUTO_HYSTERESIS = 1.06;

/**
 * Auto's size for a scene. Growing happens as soon as the scene has room for the next
 * size, so a window resized up lands where a page loaded at that size would. With
 * `current` (the size on screen now), shrinking waits until the usable height is
 * `AUTO_HYSTERESIS` below the switch point.
 */
export function autoOverlayScale(scene: OverlayScene, devicePixelRatio: number, current?: number): number {
  if (!(scene.width > 0) || !(scene.height > 0)) return OVERLAY_SCALE_MIN;
  const next = crispScaleAtMost(autoOverlayTarget(scene), devicePixelRatio);
  if (current === undefined || next >= current) return next;
  // `current` off this display's ladder (the window moved to another monitor) has no band.
  if (!crispOverlayScales(devicePixelRatio).some((scale) => sameOverlayScale(scale, current))) return next;
  const held = crispScaleAtMost(autoOverlayTarget(scene, AUTO_HYSTERESIS), devicePixelRatio);
  return sameOverlayScale(held, current) ? current : next;
}

/**
 * Auto's two sizes: `chrome` for what lives in the window (menu buttons, replay transport),
 * `scene` for what lives over the game view (the plugin overlays). One curve, one ladder,
 * one hysteresis rule, applied to each space: where the frame fills the window they are the
 * same size.
 */
export interface AutoScales {
  readonly chrome: number;
  readonly scene: number;
}

export function resolveAutoScales(spaces: OverlaySpaces, devicePixelRatio: number, current?: AutoScales): AutoScales {
  return {
    chrome: autoOverlayScale(spaces.window, devicePixelRatio, current?.chrome),
    scene: autoOverlayScale(spaces.gameView, devicePixelRatio, current?.scene),
  };
}

/**
 * A default corner offset laid out at 1x, where the overlay shows it at `scale`. The same
 * point DraggablePanel projects a 1x default to (its fraction of the free space, which
 * is the offset times the scale away from the edges); recording uses it for a timer that
 * was never moved.
 */
export function scaleOverlayDefaultPosition(position: UIPosition, scale: number): UIPosition {
  return scale === 1 ? position : { ...position, x: position.x * scale, y: position.y * scale };
}

/** Ladder sizes are thirds, fifths and halves, so two can differ in their last bit. */
export function sameOverlayScale(a: number, b: number): boolean {
  return Math.abs(a - b) < 1e-6;
}
