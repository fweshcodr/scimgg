import type { NpcCombatState } from '../actors/types';

export function isNpcActionReady(combat: Pick<NpcCombatState, 'nextActionTick'>, tick: number): boolean {
  return tick >= combat.nextActionTick;
}

export function scheduleNpcAction(
  combat: Pick<NpcCombatState, 'nextActionTick'>,
  actionTick: number,
  intervalTicks: number,
): void {
  combat.nextActionTick = actionTick + intervalTicks;
}
