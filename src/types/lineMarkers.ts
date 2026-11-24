import { DEFAULT_MARKER_COLOR } from './tileMarkers';

/**
 * Lines are stored as a canonical segment keyed by orientation and origin:
 * - `horizontal` runs east along the `y` boundary from `(x, y)` to `(x + 1, y)`.
 * - `vertical` runs north along the `x` boundary from `(x, y)` to `(x, y + 1)`.
 *
 * `(x, y)` is the west endpoint of a horizontal line, or the south endpoint of
 * a vertical line. Coordinates follow the repo world convention: `worldX = tileX`,
 * `+Y = North`, and a tile spans `[x, x+1) × [y, y+1)` with the integer being the
 * SW corner (matching `createOutlineMesh3D`, NOT the ±0.5-centered `tilePolygonScreen`).
 *
 * Storing the canonical segment (rather than a `(tile, edge)` pair) means a
 * boundary shared by two adjacent tiles resolves to a single marker — e.g. the
 * north edge of `(x, y)` and the south edge of `(x, y + 1)` are the same
 * `horizontal(x, y + 1)` segment.
 */
export interface LineMarker {
  x: number;
  y: number;
  orientation: LineOrientation;
  color: string;
  opacity: number;
  label?: string;
}

export type LineOrientation = 'horizontal' | 'vertical';

/**
 * The line-marker counterpart to {@link ./tileMarkers.TilePackPreset}.
 *
 * Preset lines are not stored per user. Activation records only a boolean per
 * preset id in `presetOverrides` (see `hooks/presetState`); the lines resolve
 * from the registry at render time, so editing a preset's contents updates
 * every user who has it enabled.
 */
export interface LinePackPreset {
  id: string;
  name: string;
  description: string;
  encounterKind: string;
  lines: readonly LineMarker[];
  /**
   * Caption shown under the name. Defaults to a raw segment count, which is a
   * useless magnitude for anything but a handful of lines — a boundary drawn
   * around four pillars is 128 segments. Say what the group covers instead.
   */
  summary?: string;
  /**
   * Whether the group is on for a user who has never touched it. An explicit
   * toggle always wins and is remembered, so turning a `defaultActive` group
   * off keeps it off — see `presetOverrides` in `lineMarkerState`.
   */
  defaultActive?: boolean;
  link?: string;
}

export type TileEdge = 'north' | 'east' | 'south' | 'west';

/** A tile edge as returned by edge picking: an integer SW-origin tile + which side. */
export interface TileEdgeRef {
  x: number;
  y: number;
  edge: TileEdge;
}

export const DEFAULT_LINE_MARKER_COLOR = DEFAULT_MARKER_COLOR;
export const DEFAULT_LINE_MARKER_OPACITY = 1.0;

/**
 * Line thickness uses the Tile Indicators 0.5-10 UI scale so matching values have matching weight.
 * The renderer converts it to world units (`× 0.02`) for 3D and to pixels for the Canvas2D fallback.
 */
export const LINE_MARKER_WIDTH_MIN = 0.5;
export const LINE_MARKER_WIDTH_MAX = 10;
export const LINE_MARKER_WIDTH_STEP = 0.5;
export const DEFAULT_LINE_MARKER_WIDTH = 1;

export function clampLineWidth(width: number): number {
  if (!Number.isFinite(width)) return DEFAULT_LINE_MARKER_WIDTH;
  return Math.max(LINE_MARKER_WIDTH_MIN, Math.min(LINE_MARKER_WIDTH_MAX, width));
}

export function lineMarkerKey(x: number, y: number, orientation: LineOrientation): string {
  return `${orientation === 'horizontal' ? 'h' : 'v'}:${x}:${y}`;
}

export function lineMarkerKeyOf(marker: Pick<LineMarker, 'x' | 'y' | 'orientation'>): string {
  return lineMarkerKey(marker.x, marker.y, marker.orientation);
}

/** Adjacent tiles sharing a boundary must map to the same segment. */
export function edgeToCanonicalSegment(ref: TileEdgeRef): {
  x: number;
  y: number;
  orientation: LineOrientation;
} {
  switch (ref.edge) {
    case 'south':
      return { x: ref.x, y: ref.y, orientation: 'horizontal' };
    case 'north':
      return { x: ref.x, y: ref.y + 1, orientation: 'horizontal' };
    case 'west':
      return { x: ref.x, y: ref.y, orientation: 'vertical' };
    case 'east':
      return { x: ref.x + 1, y: ref.y, orientation: 'vertical' };
  }
}

/** World-space endpoints of a canonical line segment (z filled by the renderer). */
export function lineMarkerEndpoints(marker: Pick<LineMarker, 'x' | 'y' | 'orientation'>): {
  ax: number;
  ay: number;
  bx: number;
  by: number;
} {
  if (marker.orientation === 'horizontal') {
    return { ax: marker.x, ay: marker.y, bx: marker.x + 1, by: marker.y };
  }
  return { ax: marker.x, ay: marker.y, bx: marker.x, by: marker.y + 1 };
}
