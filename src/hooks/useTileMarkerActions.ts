import { useCallback, useMemo } from 'react';
import { getPresetsForEncounter } from '../data/tilePackPresets';
import type { TileMarker } from '../types/tileMarkers';
import { clampTileWidth, tileMarkerKey } from '../types/tileMarkers';
import {
  activatePresetOverrides,
  deactivatePresetOverrides,
  presetChoicesFor,
  presetOverridesEqual,
  resolveActivePresetIds,
  togglePresetOverrides,
} from './presetState';
import { clampOpacity, dedupeMarkers, type TileMarkerStorageState } from './tileMarkerState';

interface UseTileMarkerActionsArgs {
  encounterKind: string;
  state: TileMarkerStorageState;
  setState: React.Dispatch<React.SetStateAction<TileMarkerStorageState>>;
}

export function useTileMarkerActions({ encounterKind, state, setState }: UseTileMarkerActionsArgs) {
  const markers = useMemo(
    () => state.markersByEncounter[encounterKind] ?? [],
    [state.markersByEncounter, encounterKind],
  );

  /** Packs offered for this encounter; also the scope single-select applies to. */
  const encounterPresets = useMemo(() => getPresetsForEncounter(encounterKind), [encounterKind]);
  const activePresetIds = useMemo(
    () => resolveActivePresetIds(encounterPresets, presetChoicesFor(state.presetOverrides, encounterKind)),
    [encounterPresets, state.presetOverrides, encounterKind],
  );

  const updateEncounterMarkers = useCallback(
    (updater: (prev: TileMarker[]) => TileMarker[]) => {
      setState((prev) => ({
        ...prev,
        markersByEncounter: {
          ...prev.markersByEncounter,
          [encounterKind]: updater(prev.markersByEncounter[encounterKind] ?? []),
        },
      }));
    },
    [encounterKind, setState],
  );

  const addMarker = useCallback(
    (x: number, y: number) => {
      setState((prev) => {
        const next = (prev.markersByEncounter[encounterKind] ?? []).filter((m) => m.x !== x || m.y !== y);
        next.push({
          x,
          y,
          color: prev.lastColor,
          opacity: prev.lastOpacity,
          ...(prev.lastFillOpacity > 0 ? { fillOpacity: prev.lastFillOpacity } : {}),
        });
        return { ...prev, markersByEncounter: { ...prev.markersByEncounter, [encounterKind]: next } };
      });
    },
    [encounterKind, setState],
  );

  const removeMarker = useCallback(
    (x: number, y: number) => {
      updateEncounterMarkers((prev) => prev.filter((m) => m.x !== x || m.y !== y));
    },
    [updateEncounterMarkers],
  );

  const updateMarkerColor = useCallback(
    (x: number, y: number, color: string, opacity: number, fillOpacity: number) => {
      setState((prev) => {
        const current = prev.markersByEncounter[encounterKind] ?? [];
        const markerIndex = current.findIndex((m) => m.x === x && m.y === y);
        if (markerIndex === -1) return prev;
        const clamped = clampOpacity(opacity);
        const clampedFill = clampOpacity(fillOpacity);
        const nextMarkers = [...current];
        // Absent rather than 0 so a marker with no fill keeps the fill-less shape,
        // which is what replays and exports compare.
        const { fillOpacity: _previous, ...rest } = nextMarkers[markerIndex];
        nextMarkers[markerIndex] = {
          ...rest,
          color,
          opacity: clamped,
          ...(clampedFill > 0 ? { fillOpacity: clampedFill } : {}),
        };
        return {
          ...prev,
          markersByEncounter: { ...prev.markersByEncounter, [encounterKind]: nextMarkers },
          lastColor: color,
          lastOpacity: clamped,
          lastFillOpacity: clampedFill,
        };
      });
    },
    [encounterKind, setState],
  );

  const updateMarkerLabel = useCallback(
    (x: number, y: number, label: string | undefined) => {
      setState((prev) => {
        const current = prev.markersByEncounter[encounterKind] ?? [];
        const markerIndex = current.findIndex((m) => m.x === x && m.y === y);
        if (markerIndex === -1) return prev;
        const nextMarkers = [...current];
        nextMarkers[markerIndex] = { ...nextMarkers[markerIndex], label: label || undefined };
        return { ...prev, markersByEncounter: { ...prev.markersByEncounter, [encounterKind]: nextMarkers } };
      });
    },
    [encounterKind, setState],
  );

  const toggleShowMarkers = useCallback(
    () => setState((prev) => ({ ...prev, showMarkers: !prev.showMarkers })),
    [setState],
  );
  const toggleShowLabels = useCallback(
    () => setState((prev) => ({ ...prev, showLabels: !prev.showLabels })),
    [setState],
  );
  const setMarkerWidth = useCallback(
    (width: number) => setState((prev) => ({ ...prev, markerWidth: clampTileWidth(width) })),
    [setState],
  );
  const clearAllMarkers = useCallback(() => updateEncounterMarkers(() => []), [updateEncounterMarkers]);

  const importMarkers = useCallback(
    (newMarkers: TileMarker[]) => {
      updateEncounterMarkers((current) => {
        const importKeys = new Set(newMarkers.map((m) => tileMarkerKey(m.x, m.y)));
        const kept = current.filter((m) => !importKeys.has(tileMarkerKey(m.x, m.y)));
        return dedupeMarkers([...kept, ...newMarkers]);
      });
    },
    [updateEncounterMarkers],
  );

  const hasMarker = useCallback(
    (x: number, y: number) => markers.some((marker) => marker.x === x && marker.y === y),
    [markers],
  );
  const getMarker = useCallback(
    (x: number, y: number) => markers.find((marker) => marker.x === x && marker.y === y),
    [markers],
  );
  /** Single-select: choosing a pack switches the encounter's other packs off. */
  const togglePreset = useCallback(
    (presetId: string) =>
      setState((prev) => ({
        ...prev,
        presetOverrides: togglePresetOverrides(
          prev.presetOverrides,
          encounterKind,
          encounterPresets,
          presetId,
          'single',
        ),
      })),
    [encounterKind, encounterPresets, setState],
  );

  const activateAllPresets = useCallback(
    (presetIds: string[]) => {
      setState((prev) => {
        const presetOverrides = activatePresetOverrides(prev.presetOverrides, encounterKind, presetIds);
        return presetOverridesEqual(prev.presetOverrides, presetOverrides) ? prev : { ...prev, presetOverrides };
      });
    },
    [encounterKind, setState],
  );

  const deactivateAllPresets = useCallback(
    (presetIds: string[]) => {
      setState((prev) => {
        const presetOverrides = deactivatePresetOverrides(prev.presetOverrides, encounterKind, presetIds);
        return presetOverridesEqual(prev.presetOverrides, presetOverrides) ? prev : { ...prev, presetOverrides };
      });
    },
    [encounterKind, setState],
  );

  const effectiveMarkers = useMemo(() => {
    const presetMarkers: TileMarker[] = [];
    for (const preset of encounterPresets) {
      if (activePresetIds.includes(preset.id)) presetMarkers.push(...preset.markers);
    }
    if (presetMarkers.length === 0) return markers;
    const userTiles = new Set(markers.map((m) => tileMarkerKey(m.x, m.y)));
    return [...markers, ...presetMarkers.filter((m) => !userTiles.has(tileMarkerKey(m.x, m.y)))];
  }, [markers, activePresetIds, encounterPresets]);

  return {
    markers,
    effectiveMarkers,
    showMarkers: state.showMarkers,
    showLabels: state.showLabels,
    lastColor: state.lastColor,
    lastOpacity: state.lastOpacity,
    markerWidth: state.markerWidth,
    lastFillOpacity: state.lastFillOpacity,
    activePresetIds,
    addMarker,
    removeMarker,
    updateMarkerColor,
    updateMarkerLabel,
    toggleShowMarkers,
    toggleShowLabels,
    setMarkerWidth,
    clearAllMarkers,
    importMarkers,
    hasMarker,
    getMarker,
    togglePreset,
    activateAllPresets,
    deactivateAllPresets,
  };
}
