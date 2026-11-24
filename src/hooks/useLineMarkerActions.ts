import { useCallback, useMemo } from 'react';
import { getLinePresetsForEncounter } from '../data/linePackPresets';
import {
  clampLineWidth,
  edgeToCanonicalSegment,
  type LineMarker,
  type LineOrientation,
  type LinePackPreset,
  lineMarkerKey,
  lineMarkerKeyOf,
  type TileEdgeRef,
} from '../types/lineMarkers';
import { clampOpacity, dedupeLines, type LineMarkerStorageState, mergeDefaultLineMarkers } from './lineMarkerState';
import {
  deactivatePresetOverrides,
  presetChoicesFor,
  presetOverridesEqual,
  resolveActivePresetIds,
  togglePresetOverrides,
} from './presetState';

interface UseLineMarkerActionsArgs {
  encounterKind: string;
  state: LineMarkerStorageState;
  /**
   * Presets offered for this encounter right now. Active ids that are not
   * available contribute no lines and stay in state untouched.
   */
  availablePresets: readonly LinePackPreset[];
  setState: React.Dispatch<React.SetStateAction<LineMarkerStorageState>>;
}

export function useLineMarkerActions({ encounterKind, availablePresets, state, setState }: UseLineMarkerActionsArgs) {
  const storedUserLines = useMemo(
    () => state.linesByEncounter[encounterKind] ?? [],
    [state.linesByEncounter, encounterKind],
  );
  const hiddenDefaultLineKeys = state.hiddenDefaultLineKeysByEncounter[encounterKind] ?? [];
  const presetChoices = useMemo(
    () => presetChoicesFor(state.presetOverrides, encounterKind),
    [state.presetOverrides, encounterKind],
  );

  /** Ids of the available presets currently on, honoring saved choices first. */
  const activePresetIds = useMemo(
    () => resolveActivePresetIds(availablePresets, presetChoices),
    [availablePresets, presetChoices],
  );

  const presetLines = useMemo(
    () => availablePresets.filter((preset) => activePresetIds.includes(preset.id)).flatMap((preset) => preset.lines),
    [availablePresets, activePresetIds],
  );

  /**
   * Every segment any preset registered for this encounter owns, whether or not
   * that group is currently on or even offered. Restyling or labeling a preset
   * line copies it into `linesByEncounter`; without this set those copies would
   * survive as ordinary user lines once their group is switched off or gated
   * away, leaving a handful of recolored segments stranded on the floor.
   */
  const presetOwnedKeys = useMemo(
    () => new Set(getLinePresetsForEncounter(encounterKind).flatMap((preset) => preset.lines.map(lineMarkerKeyOf))),
    [encounterKind],
  );

  /**
   * `userLines` is what the plugin panel lists under "Your Lines": only segments
   * the user placed or edited, never the preset groups, which carry their own
   * toggles. `lines` is what the renderer draws: those plus the active presets.
   */
  const { lines, userLines } = useMemo(() => {
    const activeKeys = new Set(presetLines.map(lineMarkerKeyOf));
    const visibleUserLines = storedUserLines.filter((line) => {
      const key = lineMarkerKeyOf(line);
      return !presetOwnedKeys.has(key) || activeKeys.has(key);
    });
    return {
      lines: mergeDefaultLineMarkers(visibleUserLines, presetLines, hiddenDefaultLineKeys, true),
      userLines: visibleUserLines,
    };
  }, [presetLines, presetOwnedKeys, hiddenDefaultLineKeys, storedUserLines]);

  const setHiddenDefaultLineKeys = useCallback(
    (updater: (prev: string[]) => string[]) => {
      setState((prev) => ({
        ...prev,
        hiddenDefaultLineKeysByEncounter: {
          ...prev.hiddenDefaultLineKeysByEncounter,
          [encounterKind]: updater(prev.hiddenDefaultLineKeysByEncounter[encounterKind] ?? []),
        },
      }));
    },
    [encounterKind, setState],
  );

  const updateEncounterLines = useCallback(
    (updater: (prev: LineMarker[]) => LineMarker[]) => {
      setState((prev) => ({
        ...prev,
        linesByEncounter: {
          ...prev.linesByEncounter,
          [encounterKind]: updater(prev.linesByEncounter[encounterKind] ?? []),
        },
      }));
    },
    [encounterKind, setState],
  );

  const addLine = useCallback(
    (x: number, y: number, orientation: LineOrientation) => {
      const key = lineMarkerKey(x, y, orientation);
      setState((prev) => {
        const next = (prev.linesByEncounter[encounterKind] ?? []).filter(
          (l) => lineMarkerKey(l.x, l.y, l.orientation) !== key,
        );
        next.push({ x, y, orientation, color: prev.lastColor, opacity: prev.lastOpacity });
        const hidden = (prev.hiddenDefaultLineKeysByEncounter[encounterKind] ?? []).filter((item) => item !== key);
        return {
          ...prev,
          linesByEncounter: { ...prev.linesByEncounter, [encounterKind]: next },
          hiddenDefaultLineKeysByEncounter: { ...prev.hiddenDefaultLineKeysByEncounter, [encounterKind]: hidden },
        };
      });
    },
    [encounterKind, setState],
  );

  const addEdge = useCallback(
    (ref: TileEdgeRef) => {
      const seg = edgeToCanonicalSegment(ref);
      addLine(seg.x, seg.y, seg.orientation);
    },
    [addLine],
  );

  const removeLine = useCallback(
    (x: number, y: number, orientation: LineOrientation) => {
      const key = lineMarkerKey(x, y, orientation);
      updateEncounterLines((prev) => prev.filter((l) => lineMarkerKey(l.x, l.y, l.orientation) !== key));
      if (presetLines.some((line) => lineMarkerKeyOf(line) === key)) {
        setHiddenDefaultLineKeys((prev) => (prev.includes(key) ? prev : [...prev, key]));
      }
    },
    [presetLines, setHiddenDefaultLineKeys, updateEncounterLines],
  );

  const removeEdge = useCallback(
    (ref: TileEdgeRef) => {
      const seg = edgeToCanonicalSegment(ref);
      removeLine(seg.x, seg.y, seg.orientation);
    },
    [removeLine],
  );

  const updateLineColor = useCallback(
    (x: number, y: number, orientation: LineOrientation, color: string, opacity: number) => {
      const key = lineMarkerKey(x, y, orientation);
      setState((prev) => {
        const current = prev.linesByEncounter[encounterKind] ?? [];
        const idx = current.findIndex((l) => lineMarkerKey(l.x, l.y, l.orientation) === key);
        const defaultLine = presetLines.find((line) => lineMarkerKeyOf(line) === key);
        if (idx === -1 && !defaultLine) return prev;
        const clamped = clampOpacity(opacity);
        const nextLines = [...current];
        if (idx === -1) {
          if (!defaultLine) return prev;
          nextLines.push({ ...defaultLine, color, opacity: clamped });
        } else {
          nextLines[idx] = { ...nextLines[idx], color, opacity: clamped };
        }
        return {
          ...prev,
          linesByEncounter: { ...prev.linesByEncounter, [encounterKind]: nextLines },
          hiddenDefaultLineKeysByEncounter: {
            ...prev.hiddenDefaultLineKeysByEncounter,
            [encounterKind]: (prev.hiddenDefaultLineKeysByEncounter[encounterKind] ?? []).filter(
              (item) => item !== key,
            ),
          },
          lastColor: color,
          lastOpacity: clamped,
        };
      });
    },
    [presetLines, encounterKind, setState],
  );

  const updateLineLabel = useCallback(
    (x: number, y: number, orientation: LineOrientation, label: string | undefined) => {
      const key = lineMarkerKey(x, y, orientation);
      setState((prev) => {
        const current = prev.linesByEncounter[encounterKind] ?? [];
        const idx = current.findIndex((l) => lineMarkerKey(l.x, l.y, l.orientation) === key);
        const defaultLine = presetLines.find((line) => lineMarkerKeyOf(line) === key);
        if (idx === -1 && !defaultLine) return prev;
        const nextLines = [...current];
        if (idx === -1) {
          if (!defaultLine) return prev;
          nextLines.push({ ...defaultLine, label: label || undefined });
        } else {
          nextLines[idx] = { ...nextLines[idx], label: label || undefined };
        }
        return {
          ...prev,
          linesByEncounter: { ...prev.linesByEncounter, [encounterKind]: nextLines },
          hiddenDefaultLineKeysByEncounter: {
            ...prev.hiddenDefaultLineKeysByEncounter,
            [encounterKind]: (prev.hiddenDefaultLineKeysByEncounter[encounterKind] ?? []).filter(
              (item) => item !== key,
            ),
          },
        };
      });
    },
    [presetLines, encounterKind, setState],
  );

  const updateEdgeColor = useCallback(
    (ref: TileEdgeRef, color: string, opacity: number) => {
      const seg = edgeToCanonicalSegment(ref);
      updateLineColor(seg.x, seg.y, seg.orientation, color, opacity);
    },
    [updateLineColor],
  );

  const updateEdgeLabel = useCallback(
    (ref: TileEdgeRef, label: string | undefined) => {
      const seg = edgeToCanonicalSegment(ref);
      updateLineLabel(seg.x, seg.y, seg.orientation, label);
    },
    [updateLineLabel],
  );

  const toggleShowLines = useCallback(() => setState((prev) => ({ ...prev, showLines: !prev.showLines })), [setState]);
  const toggleShowLabels = useCallback(
    () => setState((prev) => ({ ...prev, showLabels: !prev.showLabels })),
    [setState],
  );
  const setLineWidth = useCallback(
    (width: number) => setState((prev) => ({ ...prev, lineWidth: clampLineWidth(width) })),
    [setState],
  );

  /**
   * Multi-select: line groups are composable overlays, unlike the tile packs'
   * competing strategies. Enabling also un-hides the group's lines — a user who
   * deleted segments and then re-enables it expects the whole group back.
   */
  const togglePreset = useCallback(
    (presetId: string) => {
      const preset = availablePresets.find((entry) => entry.id === presetId);
      setState((prev) => {
        const presetOverrides = togglePresetOverrides(
          prev.presetOverrides,
          encounterKind,
          availablePresets,
          presetId,
          'multi',
        );
        if (!preset || !presetOverrides[encounterKind]?.[presetId]) return { ...prev, presetOverrides };

        const restored = new Set(preset.lines.map(lineMarkerKeyOf));
        return {
          ...prev,
          presetOverrides,
          hiddenDefaultLineKeysByEncounter: {
            ...prev.hiddenDefaultLineKeysByEncounter,
            [encounterKind]: (prev.hiddenDefaultLineKeysByEncounter[encounterKind] ?? []).filter(
              (key) => !restored.has(key),
            ),
          },
        };
      });
    },
    [availablePresets, encounterKind, setState],
  );

  const deactivateAllPresets = useCallback(() => {
    const ids = availablePresets.map((preset) => preset.id);
    setState((prev) => {
      const presetOverrides = deactivatePresetOverrides(prev.presetOverrides, encounterKind, ids);
      return presetOverridesEqual(prev.presetOverrides, presetOverrides) ? prev : { ...prev, presetOverrides };
    });
  }, [availablePresets, encounterKind, setState]);

  /**
   * Clears the user's own lines only, matching the tile-marker Clear All. The
   * preset groups are not this button's to remove, since they are not listed
   * beside it; their own toggles switch them off.
   */
  const clearAllLines = useCallback(() => updateEncounterLines(() => []), [updateEncounterLines]);

  const importLines = useCallback(
    (newLines: LineMarker[]) => {
      updateEncounterLines((current) => {
        const importKeys = new Set(newLines.map((l) => lineMarkerKey(l.x, l.y, l.orientation)));
        const kept = current.filter((l) => !importKeys.has(lineMarkerKey(l.x, l.y, l.orientation)));
        return dedupeLines([...kept, ...newLines]);
      });
      const importKeys = new Set(newLines.map(lineMarkerKeyOf));
      setHiddenDefaultLineKeys((current) => current.filter((key) => !importKeys.has(key)));
    },
    [setHiddenDefaultLineKeys, updateEncounterLines],
  );

  const hasLine = useCallback(
    (x: number, y: number, orientation: LineOrientation) => {
      const key = lineMarkerKey(x, y, orientation);
      return lines.some((l) => lineMarkerKey(l.x, l.y, l.orientation) === key);
    },
    [lines],
  );

  const hasEdge = useCallback(
    (ref: TileEdgeRef) => {
      const seg = edgeToCanonicalSegment(ref);
      return hasLine(seg.x, seg.y, seg.orientation);
    },
    [hasLine],
  );

  const getLine = useCallback(
    (x: number, y: number, orientation: LineOrientation) => {
      const key = lineMarkerKey(x, y, orientation);
      return lines.find((l) => lineMarkerKey(l.x, l.y, l.orientation) === key);
    },
    [lines],
  );

  const getEdge = useCallback(
    (ref: TileEdgeRef) => {
      const seg = edgeToCanonicalSegment(ref);
      return getLine(seg.x, seg.y, seg.orientation);
    },
    [getLine],
  );

  return {
    lines,
    userLines,
    showLines: state.showLines,
    showLabels: state.showLabels,
    lastColor: state.lastColor,
    lastOpacity: state.lastOpacity,
    lineWidth: state.lineWidth,
    activePresetIds,
    addLine,
    addEdge,
    removeLine,
    removeEdge,
    updateLineColor,
    updateLineLabel,
    updateEdgeColor,
    updateEdgeLabel,
    toggleShowLines,
    toggleShowLabels,
    setLineWidth,
    togglePreset,
    deactivateAllPresets,
    clearAllLines,
    importLines,
    hasLine,
    hasEdge,
    getLine,
    getEdge,
  };
}
