import { ReplayMarkerCoordinateSchema } from '../replay/format/presentationFormat';
import {
  DEFAULT_MARKER_COLOR,
  DEFAULT_MARKER_FILL_OPACITY,
  DEFAULT_MARKER_OPACITY,
  DEFAULT_TILE_MARKER_WIDTH,
  type TileMarker,
  tileMarkerKey,
} from '../types/tileMarkers';
import type { PresetOverrides } from './presetState';

export const TILE_MARKER_STORAGE_KEY = 'osrs-tile-markers';

export interface TileMarkerStorageState {
  markersByEncounter: Record<string, TileMarker[]>;
  showMarkers: boolean;
  showLabels: boolean;
  lastColor: string;
  lastOpacity: number;
  markerWidth: number;
  lastFillOpacity: number;
  /** Explicit per-preset choices; see `presetState` for the model. */
  presetOverrides: PresetOverrides;
}

export const TILE_MARKER_DEFAULTS: TileMarkerStorageState = {
  markersByEncounter: {},
  showMarkers: true,
  showLabels: true,
  lastColor: DEFAULT_MARKER_COLOR,
  lastOpacity: DEFAULT_MARKER_OPACITY,
  markerWidth: DEFAULT_TILE_MARKER_WIDTH,
  lastFillOpacity: DEFAULT_MARKER_FILL_OPACITY,
  presetOverrides: {},
};

export function clampOpacity(opacity: number): number {
  // Math.max/Math.min propagate NaN, so a stored `null` or a hand-edited string arrives
  // as an opacity no renderer can use and no recording can carry.
  if (!Number.isFinite(opacity)) return DEFAULT_MARKER_OPACITY;
  return Math.max(0, Math.min(1, opacity));
}

/**
 * Coordinates are validated with the replay format's own leaf schema rather than a local
 * rule: a marker outside that range can be neither drawn nor recorded, and stating the
 * bound twice is how the two come to disagree.
 */
function normalizeMarker(marker: Partial<TileMarker>): TileMarker | null {
  const x = ReplayMarkerCoordinateSchema.safeParse(marker.x);
  const y = ReplayMarkerCoordinateSchema.safeParse(marker.y);
  if (!x.success || !y.success) return null;
  return {
    x: x.data,
    y: y.data,
    color: typeof marker.color === 'string' ? marker.color : DEFAULT_MARKER_COLOR,
    opacity: clampOpacity(typeof marker.opacity === 'number' ? marker.opacity : DEFAULT_MARKER_OPACITY),
    ...(typeof marker.fillOpacity === 'number' ? { fillOpacity: clampOpacity(marker.fillOpacity) } : {}),
    ...(typeof marker.label === 'string' ? { label: marker.label } : {}),
  };
}

export function dedupeMarkers(markers: TileMarker[]): TileMarker[] {
  const byTile = new Map<string, TileMarker>();
  for (const marker of markers) byTile.set(tileMarkerKey(marker.x, marker.y), marker);
  return [...byTile.values()];
}

export function normalizeMarkerArray(raw: unknown): TileMarker[] {
  if (!Array.isArray(raw)) return [];
  return dedupeMarkers(raw.map(normalizeMarker).filter((m): m is TileMarker => m !== null));
}
