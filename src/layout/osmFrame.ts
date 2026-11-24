import { type FrameInsets, OSM_LEFT_COLUMN_WIDTH } from './osmClientLayout';
import { type Rect, type Size, scaleRect } from './osrsClientLayout';

export type { FrameInsets } from './osmClientLayout';

/**
 * The mobile GAMEFRAME inside the simulator's viewport: the viewport minus the
 * device's safe-area insets (the native SAFEZONE, 601:19), drawn at a scale from
 * `osmChromeScale`. The 3D scene still fills the whole viewport; only the chrome
 * keeps clear of the notch and the home indicator.
 */
export interface OsmFrame {
  /** Logical cache pixels to CSS pixels. */
  readonly scale: number;
  /** Where the gameframe's top-left corner sits in the viewport, in whole CSS pixels. */
  readonly origin: { readonly x: number; readonly y: number };
  /** The gameframe in logical pixels — what the placement rules are evaluated against. */
  readonly size: Size;
}

/**
 * A CSS length in logical pixels. A length the scale was derived from (the full width) divides
 * back to its whole logical size only up to float noise, and the placement rules switch at
 * exact sizes (`frameHeight < 503`), so a near-integer is taken as the integer it stands for.
 */
function toLogical(cssLength: number, scale: number): number {
  const logical = cssLength / scale;
  const whole = Math.round(logical);
  return Math.abs(logical - whole) < 1e-6 ? whole : logical;
}

/** `scale` is `osmChromeScale` of the full viewport, or a recording's (see osmFramePlaced). */
export function osmFrame(viewport: Size, insets: FrameInsets, scale: number): OsmFrame {
  const cssWidth = Math.max(0, viewport.width - insets.left - insets.right);
  const cssHeight = Math.max(0, viewport.height - insets.top - insets.bottom);
  return {
    scale,
    origin: { x: insets.left, y: insets.top },
    size: { width: toLogical(cssWidth, scale), height: toLogical(cssHeight, scale) },
  };
}

/**
 * A gameframe-space rect in viewport CSS pixels. Snapped by `scaleRect` in frame
 * space first, so two pieces sharing an edge in the cache still share it here.
 */
export function osmCssRect(frame: OsmFrame, rect: Rect): Rect {
  const snapped = scaleRect(rect, frame.scale);
  return { ...snapped, x: snapped.x + frame.origin.x, y: snapped.y + frame.origin.y };
}

/**
 * The left column's right edge in viewport CSS pixels (pop-out, hotkeys and the full-screen
 * stone are all 58 wide). The simulator's own bottom-left chrome starts here in the Mobile
 * layout, so it never sits under the column.
 */
export function osmLeftColumnRight(frame: OsmFrame): number {
  const column = osmCssRect(frame, { x: 0, y: 0, width: OSM_LEFT_COLUMN_WIDTH, height: 1 });
  return column.x + column.width;
}

/** Where a replay draws the recorded frame in the window: its scale and its top-left corner. */
export interface ReplayFramePlacement {
  readonly scale: number;
  readonly offsetX: number;
  readonly offsetY: number;
}

/**
 * A gameframe that does not fill the window from its corner, as the window draws it: built
 * from the frame's own size, safe area and chrome scale, then scaled and moved to where it
 * sits. Used for a replay's fitted frame, from the recorder's values (never the viewer's own
 * scale, which depends on their screen and setting) so recorded taps on its chrome line up,
 * and for a locked resolution's centered frame.
 */
export function osmFramePlaced(
  frame: Size,
  insets: FrameInsets,
  chromeScale: number,
  placement: ReplayFramePlacement,
): OsmFrame {
  const local = osmFrame(frame, insets, chromeScale);
  return {
    scale: local.scale * placement.scale,
    origin: {
      x: placement.offsetX + local.origin.x * placement.scale,
      y: placement.offsetY + local.origin.y * placement.scale,
    },
    size: local.size,
  };
}
