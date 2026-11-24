import type { NpcActor } from '../actors/NpcActor';
import type { TickEvents } from '../events/TickEvents';
import { canReceiveHealing } from '../npcDeath';

export function applyNpcHealing(target: NpcActor | null | undefined, amount: number, events: TickEvents): number {
  if (!target || !canReceiveHealing(target) || amount <= 0) return 0;
  const applied = Math.min(amount, target.vitals.maxHp - target.vitals.hp);
  if (applied <= 0) return 0;
  target.vitals = { ...target.vitals, hp: target.vitals.hp + applied };
  events.emit({ type: 'hitsplat_spawned', targetId: target.id, amount: applied, hitsplatType: 'heal' });
  return applied;
}
