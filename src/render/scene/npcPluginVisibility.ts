import { type EntityHiderOptions, isNpcDrawnByEntityHider } from '../../types/entityHider';
import type { NpcSnapshot } from '../../types/simulation';
import { isHiddenByTzhaarHideDead, type TzhaarHpTrackerOptions } from '../../types/tzhaarHpTracker';

/**
 * Which NPC layers the hiding plugins leave undrawn. Presentation only: the compositor filters what
 * it draws and what can be clicked, never the snapshot.
 */
export interface NpcHidingPlugins {
  /** Null while Entity Hider is off. */
  readonly entityHider: EntityHiderOptions | null;
  /** Null while TzHaar HP Tracker is off. */
  readonly tzhaarHpTracker: TzhaarHpTrackerOptions | null;
}

type NpcVisibilityFacts = Pick<NpcSnapshot, 'npcTypeId' | 'alive' | 'hp' | 'combatTargetId'>;

export function hasNpcHidingPlugin(plugins: NpcHidingPlugins): boolean {
  return plugins.entityHider !== null || plugins.tzhaarHpTracker !== null;
}

/** The NPC's model, which also takes its clickbox with it. */
export function isNpcModelHidden(npc: NpcVisibilityFacts, plugins: NpcHidingPlugins, localPlayerId: string): boolean {
  if (plugins.tzhaarHpTracker && isHiddenByTzhaarHideDead(npc, plugins.tzhaarHpTracker)) return true;
  return plugins.entityHider !== null && !isNpcDrawnByEntityHider(npc, plugins.entityHider, false, localPlayerId);
}

/**
 * The client's own 2D on the NPC: health and timer bars, hitsplats, overhead text. TzHaar's Hide dead
 * takes these too, as the plugin's draw hook stops both layers.
 */
export function isNpc2DHidden(npc: NpcVisibilityFacts, plugins: NpcHidingPlugins, localPlayerId: string): boolean {
  if (plugins.tzhaarHpTracker && isHiddenByTzhaarHideDead(npc, plugins.tzhaarHpTracker)) return true;
  return isNpcOverlayHidden(npc, plugins, localPlayerId);
}

/**
 * Plugin marks on the NPC (NPC Highlights, TzHaar's highlight and HP). Only Entity Hider's 2D rule
 * hides them: TzHaar's own overlay goes on marking an NPC its Hide dead stopped drawing.
 */
export function isNpcOverlayHidden(npc: NpcVisibilityFacts, plugins: NpcHidingPlugins, localPlayerId: string): boolean {
  return plugins.entityHider !== null && !isNpcDrawnByEntityHider(npc, plugins.entityHider, true, localPlayerId);
}

/**
 * Stand-in facts for a render instance with no snapshot entry: a corpse whose death animation outlasts
 * its NPC, or an instance the snapshot no longer names. Dead with no target if dying, else idle.
 */
export function npcVisibilityFactsWithoutSnapshot(npcTypeId: number, dying: boolean): NpcVisibilityFacts {
  return dying
    ? { npcTypeId, alive: false, hp: 0, combatTargetId: null }
    : { npcTypeId, alive: true, hp: 1, combatTargetId: null };
}
