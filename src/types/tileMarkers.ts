export interface TileMarker {
  x: number;
  y: number;
  color: string;
  /** Border alpha, 0-1. */
  opacity: number;
  /**
   * Interior fill alpha, 0-1, absent meaning none. A marked tile is an outline
   * by default the way it is in RuneLite; the fill is opt-in per marker from the
   * right-click color picker.
   */
  fillOpacity?: number;
  label?: string;
}

export const MARKER_COLOR_PRESETS: { name: string; color: string }[] = [
  { name: 'Coral', color: '#FF5A5A' },
  { name: 'Tangerine', color: '#FF8A3D' },
  { name: 'Amber', color: '#FFC23D' },
  { name: 'Emerald', color: '#3FD06A' },
  { name: 'Cyan', color: '#1FCFD6' },
  { name: 'Azure', color: '#3BA9FF' },
  { name: 'Indigo', color: '#6B79FF' },
  { name: 'Violet', color: '#AE7CFF' },
  { name: 'Rose', color: '#FF6BAE' },
  { name: 'Snow', color: '#F1F4FA' },
];

export const DEFAULT_MARKER_COLOR = '#3BA9FF';
export const DEFAULT_MARKER_OPACITY = 1.0;
export const DEFAULT_MARKER_FILL_OPACITY = 0;

/**
 * Outline thickness on the same 0.5-10 UI scale the Tile Indicators and Line Markers plugins
 * use, so one width means the same weight in all three. The renderer converts it to world units
 * (multiply by 0.02) for 3D and to pixels for the Canvas2D fallback.
 *
 * The default preserves marker thickness for existing persisted settings.
 */
export const TILE_MARKER_WIDTH_MIN = 0.5;
export const TILE_MARKER_WIDTH_MAX = 10;
export const TILE_MARKER_WIDTH_STEP = 0.5;
export const DEFAULT_TILE_MARKER_WIDTH = 2;

export function clampTileWidth(width: number): number {
  if (!Number.isFinite(width)) return DEFAULT_TILE_MARKER_WIDTH;
  return Math.max(TILE_MARKER_WIDTH_MIN, Math.min(TILE_MARKER_WIDTH_MAX, width));
}

export function tileMarkerKey(x: number, y: number): string {
  return `${x},${y}`;
}

export interface TilePackPreset {
  id: string;
  name: string;
  description: string;
  encounterKind: string;
  markers: TileMarker[];
  link?: string;
  /**
   * On for a user who has never touched it. An explicit toggle always wins and
   * is remembered — see `presetOverrides` in `presetState`.
   */
  defaultActive?: boolean;
  /**
   * Kept out of the Plugins pack list because a tutorial owns it, not the
   * player. It must stay in `getPresetsForEncounter`, which is what resolves
   * `activePresetIds` into markers — filtering it there instead would let a
   * tutorial's `activate-tile-preset` succeed while its tiles never render.
   */
  hidden?: boolean;
}

/**
 * RuneLite GroundMarkerPoint format — used for import/export compatibility.
 * Colors are in #AARRGGBB format.
 */
export interface RuneLiteGroundMarkerPoint {
  regionId: number;
  regionX: number;
  regionY: number;
  z: number;
  color?: string;
  label?: string;
}
