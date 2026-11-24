import { useEffect, useRef, useState } from 'react';
import { consolidateRetiredEncounterKinds } from '../encounters/catalog';
import { clampTileWidth } from '../types/tileMarkers';
import { loadSetting, saveSetting } from '../util/storage';
import { normalizePresetOverrides } from './presetState';
import {
  clampOpacity,
  dedupeMarkers,
  normalizeMarkerArray,
  TILE_MARKER_DEFAULTS,
  TILE_MARKER_STORAGE_KEY,
  type TileMarkerStorageState,
} from './tileMarkerState';

function loadTileMarkerStorage(): TileMarkerStorageState {
  const stored = loadSetting<Record<string, unknown>>(TILE_MARKER_STORAGE_KEY);
  if (!stored) return TILE_MARKER_DEFAULTS;

  const markersByEncounter: Record<string, ReturnType<typeof normalizeMarkerArray>> = {};
  if (
    stored.markersByEncounter &&
    typeof stored.markersByEncounter === 'object' &&
    !Array.isArray(stored.markersByEncounter)
  ) {
    for (const [kind, arr] of Object.entries(stored.markersByEncounter as Record<string, unknown>)) {
      const normalized = normalizeMarkerArray(arr);
      if (normalized.length > 0) markersByEncounter[kind] = normalized;
    }
  }

  return {
    // The arenas share one coordinate frame, so a retired kind's markers move over as they are;
    // on a shared tile the retired kind's marker wins (`dedupeMarkers` keeps the last).
    markersByEncounter: consolidateRetiredEncounterKinds(markersByEncounter, (owned, retired) =>
      dedupeMarkers([...(owned ?? []), ...retired]),
    ).map,
    showMarkers: typeof stored.showMarkers === 'boolean' ? stored.showMarkers : TILE_MARKER_DEFAULTS.showMarkers,
    showLabels: typeof stored.showLabels === 'boolean' ? stored.showLabels : TILE_MARKER_DEFAULTS.showLabels,
    lastColor: typeof stored.lastColor === 'string' ? stored.lastColor : TILE_MARKER_DEFAULTS.lastColor,
    lastOpacity:
      typeof stored.lastOpacity === 'number'
        ? clampOpacity(stored.lastOpacity as number)
        : TILE_MARKER_DEFAULTS.lastOpacity,
    markerWidth:
      typeof stored.markerWidth === 'number'
        ? clampTileWidth(stored.markerWidth as number)
        : TILE_MARKER_DEFAULTS.markerWidth,
    lastFillOpacity:
      typeof stored.lastFillOpacity === 'number'
        ? clampOpacity(stored.lastFillOpacity as number)
        : TILE_MARKER_DEFAULTS.lastFillOpacity,
    presetOverrides: normalizePresetOverrides(stored),
  };
}

export function useTileMarkerStorage() {
  const [state, setState] = useState<TileMarkerStorageState>(loadTileMarkerStorage);
  const isInitial = useRef(true);

  useEffect(() => {
    if (isInitial.current) {
      isInitial.current = false;
      return;
    }
    saveSetting(TILE_MARKER_STORAGE_KEY, state);
  }, [state]);

  return { state, setState };
}
