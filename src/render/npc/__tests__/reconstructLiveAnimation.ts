import { CLIENT_TICK_MS } from '../animationTypes';
import { NpcAnimationController } from '../NpcAnimationController';
import { CLIENT_TICKS_PER_GAME_TICK, type NpcAnimationTrigger, type NpcInstanceManager } from '../NpcInstanceManager';

type NpcAnimationReconstruction = {
  readonly spawnTick: number;
  readonly throughTick: number;
  readonly triggers: readonly (NpcAnimationTrigger & { readonly tick: number })[];
};

export function reconstructLiveAnimation(
  manager: NpcInstanceManager,
  actorId: string,
  reconstruction: NpcAnimationReconstruction,
): void {
  const instance = manager['instanceRegistry'].get(actorId);
  const animationSet = instance && manager['typeRegistry'].get(instance.npcTypeId)?.animationSet;
  if (!instance?.modelAdapter || !animationSet) return;
  const controller = new NpcAnimationController({ animationSet, modelAdapter: instance.modelAdapter });
  instance.animController = controller;
  instance.lastAttackTriggerTick = -1;
  manager['appliedAttackTriggers'].delete(instance);
  manager['pendingAttackTriggersByActor'].delete(actorId);
  const attackClips = animationSet.attackClips;
  let cycle = reconstruction.spawnTick * CLIENT_TICKS_PER_GAME_TICK;
  const advanceTo = (tick: number): void => {
    const targetCycle = tick * CLIENT_TICKS_PER_GAME_TICK;
    let remaining = Math.max(0, targetCycle - cycle);
    do {
      const elapsed = Math.min(remaining, 50);
      controller.update({
        deltaMs: elapsed * CLIENT_TICK_MS,
        speedMultiplier: 1,
        turn: { isTurning: false, turnDeltaSigned: 0 },
        movement: { isMoving: manager['movementByActorId'].get(actorId) === true },
      });
      remaining -= elapsed;
    } while (remaining > 0);
    cycle = targetCycle;
  };
  for (const trigger of [...reconstruction.triggers].sort((left, right) => left.tick - right.tick)) {
    if (
      trigger.actorId !== actorId ||
      trigger.trigger !== 'attack' ||
      trigger.tick < reconstruction.spawnTick ||
      trigger.tick > reconstruction.throughTick
    )
      continue;
    advanceTo(trigger.tick);
    manager['applyAttackTrigger'](instance, attackClips, trigger);
    advanceTo(trigger.tick);
  }
  advanceTo(reconstruction.throughTick);
  manager['refreshAnimationHeightOffset'](instance);
}
