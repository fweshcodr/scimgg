import { useEffect, useMemo } from 'react';
import type { NpcTypeLoader } from '../rs/config/npctype/NpcTypeLoader';
import type { NpcSnapshot } from '../types/simulation';

interface UseSeedBossHighlightsArgs {
  /** Active encounter kind; the lobby is excluded from auto-seeding. */
  encounterKind: string;
  npcs: NpcSnapshot[];
  npcTypeLoader: NpcTypeLoader | undefined;
  seedBossDefault: (npcTypeId: number, npcName: string) => void;
}

/**
 * Auto-seeds a true-tile NPC highlight for each of an encounter's combat NPCs —
 * every boss- and minion-role actor, but not `npc`-role scenery such as Zuk's
 * glyph shield — the first time it appears, so they come pre-tagged in the NPC
 * Highlights plugin: shift+right-click shows "Untag True Tile" and the entry
 * appears in the plugin panel. The lobby uses a separate compositor that never
 * renders highlights and is skipped outright. Seeding is idempotent per NPC type
 * (tracked in the hook), so one the user untags is never re-tagged.
 */
export function useSeedBossHighlights({
  encounterKind,
  npcs,
  npcTypeLoader,
  seedBossDefault,
}: UseSeedBossHighlightsArgs): void {
  // Stable signature of the combat NPC type IDs currently present. Recomputed
  // each tick (npcs is a fresh array) but collapses to a primitive so the seeding
  // effect only fires when the set of combat NPC types actually changes.
  const combatNpcTypeIdKey = useMemo(() => {
    const ids = new Set<number>();
    for (const npc of npcs) {
      if (npc.role === 'boss' || npc.role === 'minion') ids.add(npc.npcTypeId);
    }
    return [...ids].sort((a, b) => a - b).join(',');
  }, [npcs]);

  useEffect(() => {
    if (encounterKind === 'lobby') return;
    if (!npcTypeLoader) return;
    if (combatNpcTypeIdKey === '') return;

    for (const npcTypeId of combatNpcTypeIdKey.split(',').map(Number)) {
      let name = `NPC ${npcTypeId}`;
      try {
        const resolved = npcTypeLoader.load(npcTypeId)?.name;
        if (resolved) name = resolved;
      } catch {
        // Fall back to the generic name if the type can't be resolved yet.
      }
      seedBossDefault(npcTypeId, name);
    }
  }, [encounterKind, combatNpcTypeIdKey, npcTypeLoader, seedBossDefault]);
}
