import type { NpcActor } from '../actors/NpcActor';
import type { ActorId, DamageType, NpcCombatState } from '../actors/types';
import type { WorldState } from '../WorldState';
import { applyFlinch, flinchWindowStartTick } from './flinch';
import { scheduleNpcAction } from './npcActionClock';

export interface PlayerHitTiming {
  readonly sourceId: ActorId;
  readonly launchTick: number;
  readonly impactTick: number;
  readonly style: DamageType;
  readonly accuracySucceeded: boolean;
}

export function createNpcRetaliation(
  mode: NonNullable<NpcCombatState['retaliation']>['mode'] = 'standard',
): NonNullable<NpcCombatState['retaliation']> {
  return { mode, pending: [], lastIncomingAttackTick: null };
}

export function notifyNpcOfPlayerAttack(npc: NpcActor, hit: PlayerHitTiming): void {
  if (!npc.alive || !npc.combat.retaliation) return;
  let tick: number;
  switch (npc.combat.retaliation.mode) {
    case 'standard':
      tick = flinchWindowStartTick(hit);
      break;
    case 'retarget':
    case 'one-tick':
      // Custom policies retain their launch-origin splash recovery: docs/architecture/npc-retaliation.md.
      tick = hit.style === 'magic' && !hit.accuracySucceeded ? hit.launchTick : hit.impactTick;
      break;
    default: {
      const exhaustive: never = npc.combat.retaliation.mode;
      throw new TypeError(`Unknown retaliation mode: ${exhaustive}`);
    }
  }
  if (tick > hit.launchTick) {
    npc.combat.retaliation.pending.push({ tick, sourceId: hit.sourceId });
  } else {
    retaliate(npc, hit.sourceId, tick);
  }
}

export function processNpcRetaliations(world: WorldState): void {
  for (const npc of world.getNpcs()) {
    const retaliation = npc.combat.retaliation;
    if (!retaliation) continue;
    const pending = retaliation.pending;
    retaliation.pending = [];
    if (!npc.alive) continue;
    for (const event of pending) {
      if (event.tick > world.tick) retaliation.pending.push(event);
      else if (world.actors.get(event.sourceId)?.alive) retaliate(npc, event.sourceId, world.tick);
    }
  }
}

function retaliate(npc: NpcActor, sourceId: ActorId, tick: number): void {
  const retaliation = npc.combat.retaliation;
  if (!retaliation) return;
  switch (retaliation.mode) {
    case 'standard':
      applyFlinch(npc.combat, tick, sourceId);
      break;
    case 'one-tick':
      scheduleNpcAction(npc.combat, tick, 1);
      break;
    case 'retarget':
      break;
    default: {
      const exhaustive: never = retaliation.mode;
      throw new Error(`Unknown retaliation mode: ${exhaustive}`);
    }
  }
  retaliation.lastIncomingAttackTick = tick;
  npc.combat.targetId = sourceId;
}
