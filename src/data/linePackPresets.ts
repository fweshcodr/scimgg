import type { LinePackPreset } from '../types/lineMarkers';

/**
 * Registry of line-marker preset groups, mirroring `tilePackPresets` for tiles.
 *
 * A preset is static data keyed by encounter; user state records only which ids
 * are active. Per-line edits and deletions still apply on top via the normal
 * line-marker merge, so a user can enable a group and then remove one segment.
 */

/** Presets available for an encounter kind, a variant kind answering with its parent's. */
export function getLinePresetsForEncounter(_encounterKind: string): LinePackPreset[] {
  return [];
}

export function getAllLinePresets(): LinePackPreset[] {
  return [];
}
