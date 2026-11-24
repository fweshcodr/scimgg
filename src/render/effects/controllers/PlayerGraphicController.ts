import { type GameEvent, isCoreEvent } from '../../../core/events/types';
import { SpotAnimID } from '../../../rs/config/spotanimtype/SpotAnimID';
import type { SpotAnimModelLoader } from '../../../rs/model/SpotAnimModelLoader';
import { getTerrainHeightInterpolated } from '../../shared/renderUtils';
import type { PlayerGraphicDescriptor } from '../playerEffectDescriptors';
import type { SpotAnimRenderer } from '../SpotAnimRenderer';
import { updateOneShotSpotAnim } from '../spotAnimPlayback';
import { getPlayerGraphicSpotAnimStyle } from '../spotAnimRenderPolicy';

const Z_PLAYER_GRAPHIC = 72;
const CLIENT_TICKS_PER_GAME_TICK = 30;

export const PLAYER_GRAPHIC_PRELOAD_IDS = [
  SpotAnimID.VFX_PLAYER_SATURATED_HEART_INVIGORATE,
  SpotAnimID.VFX_PLAYER_MARK_OF_DARKNESS,
  SpotAnimID.VFX_TELEPORT_CASTING,
];

interface ActiveGraphic {
  spotAnimId: number;
  startTime: number;
  readonly height: number;
}

interface PlayerGraphicUpdateInput {
  readonly currentTick: number;
  readonly interpolatedTick: number;
  readonly playerVisualPosition: readonly [number, number];
  readonly facingAngle: number;
  readonly playerModelLift: number;
  readonly spotAnimModelLoader: SpotAnimModelLoader | null;
}

export class PlayerGraphicController {
  private descriptor: PlayerGraphicDescriptor | undefined;
  private activeGraphic: ActiveGraphic | null = null;
  private pendingLoadIds = new Set<number>();
  private lastObservedTick = Number.NEGATIVE_INFINITY;

  dispose(): void {
    this.descriptor = undefined;
    this.activeGraphic = null;
    this.pendingLoadIds.clear();
    this.lastObservedTick = Number.NEGATIVE_INFINITY;
  }

  triggerGraphic(spotAnimId: number, tick: number, height = 0): void {
    this.activeGraphic = { spotAnimId, startTime: tick, height };
    if (spotAnimId >= 0) {
      this.pendingLoadIds.add(spotAnimId);
    }
  }

  consumeDescriptor(descriptor: PlayerGraphicDescriptor): boolean {
    if (this.descriptor === descriptor) return false;
    this.descriptor = descriptor;
    this.triggerGraphic(descriptor.spotAnimId, descriptor.tick, descriptor.height);
    return true;
  }

  consumeEvents(events: GameEvent[]): void {
    for (const event of events) {
      if (isCoreEvent(event, 'player_graphic_applied')) {
        this.triggerGraphic(event.spotAnimId, event.tick);
      }
    }
  }

  update(renderer: SpotAnimRenderer, input: PlayerGraphicUpdateInput): void {
    if (input.currentTick < this.lastObservedTick) {
      this.activeGraphic = null;
      renderer.despawn('player-graphic-active');
    }
    this.lastObservedTick = input.currentTick;

    if (input.spotAnimModelLoader) {
      for (const spotAnimId of this.pendingLoadIds) {
        renderer.loadById(input.spotAnimModelLoader, spotAnimId);
        if (renderer.isLoaded(spotAnimId)) {
          this.pendingLoadIds.delete(spotAnimId);
        }
      }
    }

    if (!this.activeGraphic) {
      renderer.despawn('player-graphic-active');
      return;
    }

    const active = this.activeGraphic;
    const policyStyle = getPlayerGraphicSpotAnimStyle(active.spotAnimId);
    const status = updateOneShotSpotAnim(
      renderer,
      {
        instanceId: 'player-graphic-active',
        spotAnimId: active.spotAnimId,
        startCycle: active.startTime * CLIENT_TICKS_PER_GAME_TICK,
        transformSource: {
          kind: 'dynamic',
          resolve: (_t, _it, terrainHeights) => ({
            position: [
              input.playerVisualPosition[0] + 0.5,
              input.playerVisualPosition[1] + 0.5,
              -getTerrainHeightInterpolated(
                terrainHeights,
                input.playerVisualPosition[0] + 0.5,
                input.playerVisualPosition[1] + 0.5,
              ) /
                128 +
                input.playerModelLift +
                active.height / 128,
            ],
            yaw2048: input.facingAngle,
          }),
        },
        heightOffsetMode: 'actor',
        fallbackDurationCycles: 3 * CLIENT_TICKS_PER_GAME_TICK,
        style: {
          zIndex: Z_PLAYER_GRAPHIC,
          ...policyStyle,
        },
      },
      input.interpolatedTick * CLIENT_TICKS_PER_GAME_TICK,
    );
    switch (status) {
      case 'expired':
        this.activeGraphic = null;
        break;
      case 'unloaded':
        this.pendingLoadIds.add(active.spotAnimId);
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
