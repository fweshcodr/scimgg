/** How the Tile Grid plugin draws its lines. Absent (`null`) when the plugin is off. */
export interface TileGridStyle {
  /** Hex color, e.g. '#ffffff'. */
  readonly color: string;
  /** 0–1. */
  readonly opacity: number;
  /** Line thickness on the Tile Indicators 0.5–10 UI scale (`× 0.02` world units in 3D). */
  readonly width: number;
}

export const TILE_GRID_WIDTH_MIN = 0.5;
export const TILE_GRID_WIDTH_MAX = 10;
export const TILE_GRID_WIDTH_STEP = 0.5;

export const DEFAULT_TILE_GRID_COLOR = '#ffffff';
export const DEFAULT_TILE_GRID_OPACITY = 0.3;
export const DEFAULT_TILE_GRID_WIDTH = 1;

export function clampTileGridWidth(width: number): number {
  if (!Number.isFinite(width)) return DEFAULT_TILE_GRID_WIDTH;
  return Math.max(TILE_GRID_WIDTH_MIN, Math.min(TILE_GRID_WIDTH_MAX, width));
}
