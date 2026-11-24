import type { EncounterContext, EnvironmentalDamage } from '../../core/encounters/types';
import type { Coordinate } from '../../types/simulation';
import { log } from '../../util/Logger';
import {
  type FireballPhaseInfo,
  getExplosionTiles,
  getFireballFallProgress,
  getFireballImpactTiles,
  isFireballPerfectDodgePosition,
} from './fireball';
import type { YamaFireballState } from './state';

export type FireballHazardContext = Pick<EncounterContext, 'tick' | 'world' | 'tickEvents' | 'grantNextAttackSpeedup'>;

type FireballHazardInput = {
  readonly ctx: FireballHazardContext;
  readonly activePhases: readonly FireballPhaseInfo[];
  readonly sourceActorId: string;
  readonly damage: EnvironmentalDamage['baseDamage'];
  readonly damages: EnvironmentalDamage[];
};

export function resolveFireballHazards(state: YamaFireballState, input: FireballHazardInput): void {
  if (input.activePhases.length === 0) return;
  const player = input.ctx.world.getPlayer();
  if (!player) return;
  const checkPosition = player.position;
  const appendDamage = (): void => {
    input.damages.push({
      baseDamage: input.damage,
      attackType: 'typeless',
      source: 'Fireball',
      playerPosition: [...checkPosition] as Coordinate,
    });
  };
  for (const activePhase of input.activePhases) {
    if (!player.alive) break;
    const centerPosition = state.startPositions.get(activePhase.instanceId);
    if (!centerPosition) continue;
    const { phase } = getFireballFallProgress(activePhase.startTick, input.ctx.tick);
    if (phase === 'impact') {
      if (!state.impactEmitted.has(activePhase.instanceId)) {
        state.impactEmitted.add(activePhase.instanceId);
        input.ctx.tickEvents.emit({
          type: 'fireball_impact',
          sourceId: input.sourceActorId,
          targetPosition: centerPosition,
          fireballIndex: activePhase.instanceId,
        });
      }
      if (!state.impactDealt.has(activePhase.instanceId)) {
        const hit = getFireballImpactTiles(centerPosition, activePhase.angle).some(
          (tile) => tile[0] === checkPosition[0] && tile[1] === checkPosition[1],
        );
        if (hit) {
          appendDamage();
          state.impactDealt.add(activePhase.instanceId);
        }
      }
    }
    if (phase !== 'explosion' || state.explosionDealt.has(activePhase.instanceId)) continue;
    const hit = getExplosionTiles(centerPosition, activePhase.angle).some(
      (tile) => tile[0] === checkPosition[0] && tile[1] === checkPosition[1],
    );
    if (hit) {
      appendDamage();
      state.explosionDealt.add(activePhase.instanceId);
      continue;
    }
    if (state.perfectDodgeTriggered.has(activePhase.instanceId)) continue;
    if (
      player.combatTimers.markOfDarknessActiveTicks <= 0 ||
      !isFireballPerfectDodgePosition(checkPosition, centerPosition, activePhase.angle)
    ) {
      continue;
    }
    const pendingMinimumDamage = input.damages.reduce(
      (sum, damage) => sum + (typeof damage.baseDamage === 'number' ? damage.baseDamage : damage.baseDamage[0]),
      0,
    );
    if (player.vitals.hp <= pendingMinimumDamage) continue;
    state.perfectDodgeTriggered.add(activePhase.instanceId);
    state.shadowWaveImmunityTick = input.ctx.tick + 1;
    input.ctx.grantNextAttackSpeedup(player.id, 1);
    input.ctx.tickEvents.emit({
      type: 'yama_perfect_dodge',
      fireballIndex: activePhase.instanceId,
      playerPosition: [...checkPosition] as Coordinate,
      fireballCenter: [...centerPosition] as Coordinate,
      angle: activePhase.angle,
    });
    log.info(
      'PerfectDodge',
      `🛡️ tick ${input.ctx.tick}: player at [${checkPosition[0]}, ${checkPosition[1]}] dodged fireball ` +
        `#${activePhase.instanceId} centered [${centerPosition[0]}, ${centerPosition[1]}] (${activePhase.angle}) ` +
        `with Mark of Darkness — granting +1 tick to the next attack.`,
    );
  }
}
