/**
 * RuneLite marker coordinates are region-local, with `regionId` encoded from
 * the encounter map square. RuneLite colors use alpha-first `#AARRGGBB`; local
 * markers use `#RRGGBB` and separate opacity. Sim x/y ARE the region-local coordinates, which
 * holds only while an encounter sits in a single region.
 */

import { encounterRegistry } from '../encounters/registry';
import { normalizeMarkerArray } from '../hooks/tileMarkerState';
import type { RuneLiteGroundMarkerPoint, TileMarker } from '../types/tileMarkers';
import { DEFAULT_MARKER_COLOR, DEFAULT_MARKER_OPACITY } from '../types/tileMarkers';

export { copyToClipboard } from './clipboard';

function parseRuneLiteColor(rlColor: string): { color: string; opacity: number } {
  const hex = rlColor.startsWith('#') ? rlColor.slice(1) : rlColor;

  if (hex.length === 8) {
    // #AARRGGBB
    const alpha = parseInt(hex.slice(0, 2), 16);
    const rgb = hex.slice(2);
    return {
      color: `#${rgb.toUpperCase()}`,
      opacity: Math.round((alpha / 255) * 100) / 100,
    };
  }

  if (hex.length === 6) {
    // #RRGGBB (no alpha)
    return { color: `#${hex.toUpperCase()}`, opacity: 1.0 };
  }

  return { color: DEFAULT_MARKER_COLOR, opacity: DEFAULT_MARKER_OPACITY };
}

function toRuneLiteColor(color: string, opacity: number): string {
  const hex = color.startsWith('#') ? color.slice(1) : color;
  const alpha = Math.round(Math.max(0, Math.min(1, opacity)) * 255)
    .toString(16)
    .padStart(2, '0')
    .toUpperCase();
  return `#${alpha}${hex.toUpperCase().padEnd(6, '0')}`;
}

// Resolve contract variants through their parent arena descriptor, the way tile packs and
// loadouts already do; a variant kind carries no map square of its own.
function getEncounterRegionId(encounterKind: string): number | null {
  const desc = encounterRegistry.getDescriptorForKind(encounterKind);
  if (!desc) return null;
  return (desc.mapSquare.x << 8) | desc.mapSquare.y;
}

export function importRuneLiteMarkers(jsonString: string, encounterKind: string): TileMarker[] | null {
  const regionId = getEncounterRegionId(encounterKind);
  if (regionId === null) return null;

  let parsed: RuneLiteGroundMarkerPoint[];
  try {
    parsed = JSON.parse(jsonString);
    if (!Array.isArray(parsed)) return null;
  } catch {
    return null;
  }

  const markers: Partial<TileMarker>[] = [];
  for (const point of parsed) {
    if (Math.round(point.regionId) !== regionId) continue;

    // The JSON is whatever was on the clipboard, so `color` is only trusted to be a
    // string once checked; `parseRuneLiteColor` calls string methods on it.
    const { color, opacity } =
      typeof point.color === 'string'
        ? parseRuneLiteColor(point.color)
        : { color: DEFAULT_MARKER_COLOR, opacity: DEFAULT_MARKER_OPACITY };

    markers.push({
      x: Math.round(point.regionX),
      y: Math.round(point.regionY),
      color,
      opacity,
      ...(typeof point.label === 'string' ? { label: point.label } : {}),
    });
  }

  // Through the same gate as stored markers: a pasted point with a missing or
  // non-numeric coordinate becomes NaN above, which no renderer and no recording accepts.
  return normalizeMarkerArray(markers);
}

export function exportRuneLiteMarkers(markers: TileMarker[], encounterKind: string): string | null {
  const regionId = getEncounterRegionId(encounterKind);
  if (regionId === null) return null;

  const points: RuneLiteGroundMarkerPoint[] = markers.map((marker) => ({
    regionId,
    regionX: marker.x,
    regionY: marker.y,
    z: 0,
    color: toRuneLiteColor(marker.color, marker.opacity),
    ...(marker.label ? { label: marker.label } : {}),
  }));

  return JSON.stringify(points);
}

export async function readFromClipboard(): Promise<string | null> {
  try {
    return await navigator.clipboard.readText();
  } catch {
    return null;
  }
}
