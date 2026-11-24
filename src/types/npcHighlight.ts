/**
 * Modeled after RuneLite's Better NPC Highlight plugin. Highlight modes:
 *
 *   - trueTile: Outline around the full NPC footprint at its server-side position
 *   - swTile:   Outline on just the NPC's southwest corner tile
 *   - clickbox: Semi-transparent overlay on the NPC's 3D model (per-face mesh)
 */

export type NpcHighlightMode = 'trueTile' | 'swTile' | 'clickbox';

export const NPC_HIGHLIGHT_MODES: { value: NpcHighlightMode; label: string }[] = [
  { value: 'trueTile', label: 'True Tile' },
  { value: 'swTile', label: 'SW Tile' },
  { value: 'clickbox', label: 'Clickbox' },
];

export interface NpcHighlightEntry {
  npcName: string;
  /** Type id from cache; the primary match key. */
  npcTypeId: number;
  mode: NpcHighlightMode;
  /** Hex color string, e.g. '#00ffff'. */
  color: string;
}

export const DEFAULT_NPC_HIGHLIGHT_COLOR = '#6fb0ae';

/**
 * Whether a highlighted NPC's right-click entries and hover text are painted in its
 * highlight color instead of the standard NPC gold, as Better NPC Highlight's
 * "Highlight menu names" option does. Off by default, unlike that plugin: a tag placed
 * for a tile outline should not silently repaint the menu and hover text too, and the
 * boss of every encounter arrives pre-tagged, so on-by-default would recolor the one
 * NPC every session interacts with before the player asked for anything.
 */
export const DEFAULT_HIGHLIGHT_MENU_ENTRIES = false;

/** A single NPC can be highlighted with multiple modes simultaneously. */
export function npcHighlightKey(npcTypeId: number, mode: NpcHighlightMode): string {
  return `${npcTypeId}:${mode}`;
}

export function hasHighlightForNpc(highlights: NpcHighlightEntry[], npcTypeId: number): boolean {
  return highlights.some((h) => h.npcTypeId === npcTypeId);
}

export function getHighlightsForNpc(highlights: NpcHighlightEntry[], npcTypeId: number): NpcHighlightEntry[] {
  return highlights.filter((h) => h.npcTypeId === npcTypeId);
}

export function isNpcHighlighted(highlights: NpcHighlightEntry[], npcTypeId: number, mode: NpcHighlightMode): boolean {
  return highlights.some((h) => h.npcTypeId === npcTypeId && h.mode === mode);
}

/**
 * An NPC can hold several modes at once, so the first stored entry decides —
 * recoloring one mode must not leave the menu reading a different mode's color.
 */
export function getNpcHighlightMenuColor(highlights: NpcHighlightEntry[], npcTypeId: number): string | undefined {
  return highlights.find((h) => h.npcTypeId === npcTypeId)?.color;
}
