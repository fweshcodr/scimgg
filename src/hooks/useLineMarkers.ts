import type { LinePackPreset } from '../types/lineMarkers';
import { useLineMarkerActions } from './useLineMarkerActions';
import { useLineMarkerStorage } from './useLineMarkerStorage';

export function useLineMarkers(encounterKind: string, availablePresets: readonly LinePackPreset[] = []) {
  const { state, setState } = useLineMarkerStorage();
  return useLineMarkerActions({ encounterKind, availablePresets, state, setState });
}
