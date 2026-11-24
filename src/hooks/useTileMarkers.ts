import { useTileMarkerActions } from './useTileMarkerActions';
import { useTileMarkerStorage } from './useTileMarkerStorage';

export function useTileMarkers(encounterKind: string) {
  const { state, setState } = useTileMarkerStorage();
  return useTileMarkerActions({ encounterKind, state, setState });
}
