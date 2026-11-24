import { useEffect, useRef, useState } from 'react';
import { consolidateRetiredEncounterKinds } from '../encounters/catalog';
import { clampLineWidth } from '../types/lineMarkers';
import { loadSetting, saveSetting } from '../util/storage';
import {
  clampOpacity,
  dedupeLines,
  LINE_MARKER_DEFAULTS,
  LINE_MARKER_STORAGE_KEY,
  type LineMarkerStorageState,
  normalizeLineArray,
} from './lineMarkerState';
import { normalizePresetOverrides } from './presetState';

function loadLineMarkerStorage(): LineMarkerStorageState {
  const stored = loadSetting<Record<string, unknown>>(LINE_MARKER_STORAGE_KEY);
  if (!stored) return LINE_MARKER_DEFAULTS;

  const linesByEncounter: Record<string, ReturnType<typeof normalizeLineArray>> = {};
  if (
    stored.linesByEncounter &&
    typeof stored.linesByEncounter === 'object' &&
    !Array.isArray(stored.linesByEncounter)
  ) {
    for (const [kind, arr] of Object.entries(stored.linesByEncounter as Record<string, unknown>)) {
      const normalized = normalizeLineArray(arr);
      if (normalized.length > 0) linesByEncounter[kind] = normalized;
    }
  }

  const hiddenDefaultLineKeysByEncounter: Record<string, string[]> = {};
  if (
    stored.hiddenDefaultLineKeysByEncounter &&
    typeof stored.hiddenDefaultLineKeysByEncounter === 'object' &&
    !Array.isArray(stored.hiddenDefaultLineKeysByEncounter)
  ) {
    for (const [kind, keys] of Object.entries(stored.hiddenDefaultLineKeysByEncounter as Record<string, unknown>)) {
      if (!Array.isArray(keys)) continue;
      const normalized = keys.filter((key): key is string => typeof key === 'string');
      if (normalized.length > 0) hiddenDefaultLineKeysByEncounter[kind] = [...new Set(normalized)];
    }
  }

  return {
    // The arenas share one coordinate frame, so a retired kind's lines move over as they are; on a
    // shared segment the retired kind's line wins (`dedupeLines` keeps the last).
    linesByEncounter: consolidateRetiredEncounterKinds(linesByEncounter, (owned, retired) =>
      dedupeLines([...(owned ?? []), ...retired]),
    ).map,
    hiddenDefaultLineKeysByEncounter: consolidateRetiredEncounterKinds(
      hiddenDefaultLineKeysByEncounter,
      (owned, retired) => [...new Set([...(owned ?? []), ...retired])],
    ).map,
    showLines: typeof stored.showLines === 'boolean' ? stored.showLines : LINE_MARKER_DEFAULTS.showLines,
    showLabels: typeof stored.showLabels === 'boolean' ? stored.showLabels : LINE_MARKER_DEFAULTS.showLabels,
    lastColor: typeof stored.lastColor === 'string' ? stored.lastColor : LINE_MARKER_DEFAULTS.lastColor,
    lastOpacity:
      typeof stored.lastOpacity === 'number'
        ? clampOpacity(stored.lastOpacity as number)
        : LINE_MARKER_DEFAULTS.lastOpacity,
    lineWidth:
      typeof stored.lineWidth === 'number'
        ? clampLineWidth(stored.lineWidth as number)
        : LINE_MARKER_DEFAULTS.lineWidth,
    presetOverrides: normalizePresetOverrides(stored),
  };
}

export function useLineMarkerStorage() {
  const [state, setState] = useState<LineMarkerStorageState>(loadLineMarkerStorage);
  const isInitial = useRef(true);

  useEffect(() => {
    if (isInitial.current) {
      isInitial.current = false;
      return;
    }
    saveSetting(LINE_MARKER_STORAGE_KEY, state);
  }, [state]);

  return { state, setState };
}
