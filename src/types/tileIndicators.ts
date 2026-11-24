export interface TileIndicatorStyle {
  enabled: boolean;
  /** Hex color string, e.g. '#0E8FDB'. */
  color: string;
  /** 0-1. */
  opacity: number;
  /** Stroke width in pixels (2D) / world-unit scale factor (3D). */
  width: number;
  /** true = L-shaped corner marks only; false = full tile border. */
  cornerOnly: boolean;
}

export interface TileIndicatorConfig {
  trueTile: TileIndicatorStyle;
  hoverTile: TileIndicatorStyle;
  destinationTile: TileIndicatorStyle;
}

/**
 * Defaults match the hardcoded rendering (trueTile = COLORS.playerTile, hoverTile =
 * COLORS.hoveredTile, destinationTile = COLORS.targetTile), so enabling the plugin changes
 * nothing until the user customizes it.
 */
export const DEFAULT_TILE_INDICATOR_CONFIG: TileIndicatorConfig = {
  trueTile: {
    enabled: true,
    color: '#0E8FDB',
    opacity: 0.84,
    width: 1.5,
    cornerOnly: false,
  },
  hoverTile: {
    enabled: true,
    color: '#ED2420',
    opacity: 1,
    width: 1.5,
    cornerOnly: true,
  },
  destinationTile: {
    enabled: true,
    color: '#14D60A',
    opacity: 1,
    width: 1.5,
    cornerOnly: true,
  },
};
