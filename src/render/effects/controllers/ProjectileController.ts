import { chebyshevDistanceToRect } from '../../../core/combat/distance';
import { calculateProjectileEndTime, type ProjAnimTiming } from '../../../core/combat/hitDelay';
import { getProjectileTiming } from '../../../core/combat/weaponCombatData';
import type { GameEvent } from '../../../core/events/types';
import type { WeaponCombatVisuals } from '../../../data/weaponCombatVisuals.generated';
import type { SpotAnimModelLoader } from '../../../rs/model/SpotAnimModelLoader';
import type { ReplayActorSampler } from '../../core/replayActorHistory';
import { getLocCenterHeight, getTerrainHeightInterpolated } from '../../shared/renderUtils';
import { ProjectileFlight } from '../ProjectileFlight';
import type { PlayerTravelDescriptor } from '../playerEffectDescriptors';
import { type ActorVisualPositionResolver, ProjectileAim } from '../projectileAim';
import { ReplayProjectileWork } from '../replayProjectileWork';
import type { SpotAnimRenderer } from '../SpotAnimRenderer';
import { updateOneShotSpotAnim } from '../spotAnimPlayback';
import { getProjectileImpactSpotAnimStyle } from '../spotAnimRenderPolicy';

const Z_PROJECTILE = 68;
const CLIENT_TICKS_PER_GAME_TICK = 30;

export type SurfaceHeightResolver = (worldX: number, worldY: number) => number;

interface ActiveProjectile {
  readonly launchCycle: number;
  spotAnimId: number;
  sourceX: number;
  sourceY: number;
  readonly sourceSize: number;
  startHeight: number;
  endHeight: number;
  readonly flight: ProjectileFlight;
  /** Destination; homes onto the target actor unless it was launched at a tile. */
  aim: ProjectileAim;
}

interface ActiveImpactEffect {
  readonly attachmentCycle: number;
  spotAnimId: number;
  startTick: number;
  heightOffset: number;
  useNpcCenterHeight: boolean;
  readonly heightOffsetMode: 'sequence' | 'actor';
  /** Impact graphics sit on the target actor, so they re-resolve like the projectile. */
  aim: ProjectileAim;
  /** A graphic on an actor turns with it; one pinned to a tile, like a `map_anim`, never rotates. */
  readonly onActor: boolean;
}

/**
 * A destination that homes onto `targetActorId` when one is known, and stays
 * pinned to the launch tile otherwise (non-targeted / tile-aimed attacks).
 */
function buildAim(
  targetActorId: string | undefined,
  sw: readonly [number, number],
  size: number,
  height: number,
): ProjectileAim {
  const point = { sw: [sw[0], sw[1]] as const, size, height };
  return targetActorId ? ProjectileAim.atActor(targetActorId, point) : ProjectileAim.atPoint(point);
}

export class ProjectileController {
  private consumedDescriptors = new WeakSet<PlayerTravelDescriptor>();
  private replaySampler: ReplayActorSampler | undefined;
  private pendingLoadIds = new Set<number>();
  private activeProjectiles = new Map<string, ActiveProjectile>();
  private activeImpacts = new Map<string, ActiveImpactEffect>();
  private nextEffectId = 0;
  private lastObservedTick = Number.NEGATIVE_INFINITY;
  private terrainHeights: Int32Array[] | null = null;
  private surfaceHeightResolver: SurfaceHeightResolver | null = null;

  dispose(): void {
    this.consumedDescriptors = new WeakSet();
    this.replaySampler = undefined;
    this.pendingLoadIds.clear();
    this.activeProjectiles.clear();
    this.activeImpacts.clear();
    this.nextEffectId = 0;
    this.lastObservedTick = Number.NEGATIVE_INFINITY;
    this.terrainHeights = null;
    this.surfaceHeightResolver = null;
  }

  setTerrainHeights(heights: Int32Array[] | null): void {
    this.terrainHeights = heights;
  }

  setSurfaceHeightResolver(resolver: SurfaceHeightResolver | null): void {
    this.surfaceHeightResolver = resolver;
  }

  consumeEvents(_events: GameEvent[]): void {}

  setReplaySampler(sampler: ReplayActorSampler | undefined): void {
    this.replaySampler = sampler;
  }

  consumeDescriptor(effect: PlayerTravelDescriptor, modelCenterHeight: number): boolean {
    if (this.consumedDescriptors.has(effect)) return false;
    this.consumedDescriptors.add(effect);
    const target = effect.target;
    switch (effect.kind) {
      case 'projectile':
        this.launchProjectile(
          effect.visuals,
          effect.weaponId,
          [...effect.source],
          [...target.position],
          target.size,
          modelCenterHeight,
          effect.tick,
          target.actorId,
          effect.timing,
          effect.presentation,
          effect.key,
        );
        break;
      case 'impact':
        this.scheduleImpactSpotanim(
          effect.spotAnimId,
          effect.height,
          effect.startTick,
          [...target.position],
          target.size,
          modelCenterHeight,
          target.actorId,
          effect.heightMode,
          effect.key,
        );
        break;
      default: {
        const exhaustive: never = effect;
        throw exhaustive;
      }
    }
    return true;
  }

  /**
   * `targetActorId` makes the projectile home onto that actor: its endpoint is
   * re-resolved every frame so a target that moves after launch is still hit.
   * Omit it only for genuinely tile-targeted attacks.
   */
  launchProjectile(
    visuals: WeaponCombatVisuals,
    weaponId: number,
    playerPos: [number, number],
    npcPos: [number, number],
    npcSize: number,
    npcModelCenterHeight: number,
    tick: number,
    targetActorId?: string,
    timingOverride?: ProjAnimTiming,
    presentation?: { readonly origin?: 'caster' | 'target'; readonly impactHeightMode?: 'sequence' | 'actor' },
    effectKey?: string,
  ): void {
    const spotAnimId = visuals.projectileId;
    if (spotAnimId < 0) {
      return;
    }

    const distance = chebyshevDistanceToRect(playerPos[0], playerPos[1], npcPos[0], npcPos[1], npcSize);
    const timing = timingOverride ?? getProjectileTiming(weaponId);

    this.pendingLoadIds.add(spotAnimId);
    const hitSpotAnimId = visuals.hitSpotanim;
    if (hitSpotAnimId >= 0) {
      this.pendingLoadIds.add(hitSpotAnimId);
    }

    const startTimeCC = visuals.projectileStartDelay;
    const endTimeCC = timing ? calculateProjectileEndTime(timing, distance) : startTimeCC + CLIENT_TICKS_PER_GAME_TICK;
    const startCycle = tick * CLIENT_TICKS_PER_GAME_TICK + startTimeCC;
    const endCycle = tick * CLIENT_TICKS_PER_GAME_TICK + endTimeCC;
    const effectId = effectKey ?? this.nextEffectId++;
    const instanceId = `player-projectile-${effectId}`;
    const aim = buildAim(targetActorId, npcPos, npcSize, npcModelCenterHeight);
    const source = presentation?.origin === 'target' ? npcPos : playerPos;

    // An overlapping magic cast (distance 0) arrives 5 cycles before its start
    // delay, so there is no travel to draw; the impact still lands at endCycle.
    // Non-finite clocks fall through so ProjectileFlight still rejects them.
    if (!(endCycle <= startCycle)) {
      this.activeProjectiles.set(instanceId, {
        launchCycle: tick * CLIENT_TICKS_PER_GAME_TICK,
        spotAnimId,
        sourceX: source[0],
        sourceY: source[1],
        sourceSize: presentation?.origin === 'target' ? npcSize : 1,
        startHeight: visuals.projectileStartHeight,
        endHeight: visuals.projectileEndHeight,
        flight: new ProjectileFlight({
          instanceId,
          spotAnimId,
          startCycle,
          // Use packet endtime as our continuous-time arrival/expiry boundary.
          // Captures schedule the arrival effect at that same delay, and RSMod
          // fa13b3f ProjAnim.clientCycles returns endTime. Adding 1 here also adds
          // a cycle to the motion horizon, placing arrival after the impact.
          // This does not assert the native client's integer-cycle draw predicate.
          // See docs/architecture/projectile-motion.md#inputs-and-lifetime-boundary.
          endCycleExclusive: endCycle,
          startOffset: timing?.progress ?? 0,
          slope: visuals.projectileSlope,
          animationLoop: 'full-sequence',
          heightOffsetMode: 'sequence',
          style: { zIndex: Z_PROJECTILE },
        }),
        aim,
      });
    }
    if (hitSpotAnimId >= 0) {
      this.activeImpacts.set(`player-projectile-impact-${effectId}`, {
        attachmentCycle: tick * CLIENT_TICKS_PER_GAME_TICK,
        spotAnimId: hitSpotAnimId,
        startTick: endCycle / CLIENT_TICKS_PER_GAME_TICK,
        heightOffset: visuals.hitSpotanimHeight / 128,
        useNpcCenterHeight: presentation?.impactHeightMode !== 'actor',
        heightOffsetMode: presentation?.impactHeightMode ?? 'sequence',
        aim,
        onActor: targetActorId !== undefined,
      });
    }
  }

  scheduleImpactSpotanim(
    hitSpotanimId: number,
    hitSpotanimHeight: number,
    impactTick: number,
    targetSWPos: [number, number],
    targetSize: number,
    targetModelCenterHeight: number,
    targetActorId?: string,
    heightOffsetMode: 'sequence' | 'actor' = 'sequence',
    effectKey?: string,
  ): void {
    if (hitSpotanimId < 0) {
      return;
    }
    this.pendingLoadIds.add(hitSpotanimId);
    this.activeImpacts.set(`player-projectile-impact-${effectKey ?? this.nextEffectId++}`, {
      attachmentCycle: impactTick * CLIENT_TICKS_PER_GAME_TICK,
      spotAnimId: hitSpotanimId,
      startTick: impactTick,
      heightOffset: hitSpotanimHeight / 128,
      useNpcCenterHeight: false,
      heightOffsetMode,
      aim: buildAim(targetActorId, targetSWPos, targetSize, targetModelCenterHeight),
      onActor: targetActorId !== undefined,
    });
  }

  update(
    renderer: SpotAnimRenderer,
    currentTick: number,
    interpolatedTick: number,
    spotAnimModelLoader: SpotAnimModelLoader | null,
    npcFacingAngle?: number,
    resolveActorPosition?: ActorVisualPositionResolver | null,
    replayWork = new ReplayProjectileWork(),
  ): void {
    if (currentTick < this.lastObservedTick) {
      for (const id of this.activeProjectiles.keys()) renderer.despawn(id);
      for (const id of this.activeImpacts.keys()) renderer.despawn(id);
      this.activeProjectiles.clear();
      this.activeImpacts.clear();
      this.pendingLoadIds.clear();
    }
    this.lastObservedTick = currentTick;

    if (spotAnimModelLoader) {
      for (const spotAnimId of this.pendingLoadIds) {
        renderer.loadById(spotAnimModelLoader, spotAnimId);
        if (renderer.isLoaded(spotAnimId)) {
          this.pendingLoadIds.delete(spotAnimId);
        }
      }
    }

    for (const [id, proj] of this.activeProjectiles) {
      const srcCenterX = proj.sourceX + proj.sourceSize / 2;
      const srcCenterY = proj.sourceY + proj.sourceSize / 2;
      const frameAt = (cycle: number) => {
        const target = proj.aim.resolve(this.replaySampler?.(cycle, proj.launchCycle) ?? resolveActorPosition);
        const targetCenterX = target.sw[0] + target.size / 2;
        const targetCenterY = target.sw[1] + target.size / 2;
        return {
          cycle,
          source: {
            worldX: srcCenterX,
            worldY: srcCenterY,
            resolvedOsrsZ:
              this.surfaceHeightResolver?.(srcCenterX, srcCenterY) ??
              getTerrainHeightInterpolated(this.terrainHeights, srcCenterX, srcCenterY),
            heightOffset: proj.startHeight,
          },
          target: {
            worldX: targetCenterX,
            worldY: targetCenterY,
            resolvedOsrsZ:
              this.surfaceHeightResolver?.(targetCenterX, targetCenterY) ??
              getTerrainHeightInterpolated(this.terrainHeights, targetCenterX, targetCenterY),
            heightOffset: proj.endHeight,
          },
        };
      };
      const cycle = interpolatedTick * CLIENT_TICKS_PER_GAME_TICK;
      const status = this.replaySampler
        ? proj.flight.updateReplay(renderer, cycle, frameAt, replayWork)
        : proj.flight.update(renderer, frameAt(cycle));
      if (status === 'expired') {
        this.activeProjectiles.delete(id);
      } else if (!renderer.isLoaded(proj.spotAnimId)) {
        this.pendingLoadIds.add(proj.spotAnimId);
      }
    }
    this.renderImpacts(renderer, interpolatedTick, npcFacingAngle, resolveActorPosition);
  }

  private renderImpacts(
    renderer: SpotAnimRenderer,
    interpolatedTick: number,
    npcFacingAngle?: number,
    resolveActorPosition?: ActorVisualPositionResolver | null,
  ): void {
    for (const [instanceId, impact] of this.activeImpacts) {
      const status = updateOneShotSpotAnim(
        renderer,
        {
          instanceId,
          spotAnimId: impact.spotAnimId,
          startCycle: impact.startTick * CLIENT_TICKS_PER_GAME_TICK,
          transformSource: {
            kind: 'dynamic',
            resolve: () => {
              const cycle = interpolatedTick * CLIENT_TICKS_PER_GAME_TICK;
              const target = impact.aim.resolve(
                this.replaySampler?.(cycle, impact.attachmentCycle) ?? resolveActorPosition,
              );
              return {
                position: [
                  target.sw[0] + target.size / 2,
                  target.sw[1] + target.size / 2,
                  getLocCenterHeight(this.terrainHeights, target.sw[0], target.sw[1], target.size, target.size) +
                    (impact.useNpcCenterHeight ? target.height : 0) +
                    impact.heightOffset,
                ],
                yaw2048: impact.onActor ? npcFacingAngle : 0,
              };
            },
          },
          heightOffsetMode: impact.heightOffsetMode,
          fallbackDurationCycles: 3 * CLIENT_TICKS_PER_GAME_TICK,
          style: {
            zIndex: Z_PROJECTILE,
            ...getProjectileImpactSpotAnimStyle(impact.spotAnimId),
          },
        },
        interpolatedTick * CLIENT_TICKS_PER_GAME_TICK,
      );
      switch (status) {
        case 'expired':
          this.activeImpacts.delete(instanceId);
          break;
        case 'unloaded':
          this.pendingLoadIds.add(impact.spotAnimId);
          break;
        case 'pending':
        case 'active':
          break;
        default: {
          const exhaustive: never = status;
          throw exhaustive;
        }
      }
    }
  }
}
