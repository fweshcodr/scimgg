import { getMonsterName } from './monsterData';

/**
 * The name the game shows for an NPC: the monster's wiki name for its type ("Sol Heredit",
 * "TzKal-Zuk", "Jal-MejJak"). An NPC with no monster entry (a shield, a crystal) falls back to its
 * archetype id spelled out, which is only ever a stand-in for a real name.
 */
export function npcDisplayName(npc: { readonly npcTypeId: number; readonly archetypeId: string }): string {
  return (
    getMonsterName(npc.npcTypeId) ??
    npc.archetypeId
      .replace(/[_-]+/g, ' ')
      .replace(/([a-z])([A-Z])/g, '$1 $2')
      .replace(/\b[a-z]/g, (c) => c.toUpperCase())
  );
}
