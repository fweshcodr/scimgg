import type { GameEvent } from '../../../core/events/types';
import type { ReplayDisplayFrame } from '../../../core/ReplayRecorder';
import {
  type InfernoAnimationCue,
  type InfernoGraphicCue,
  isInfernoVisualEvent,
} from '../../../npcs/inferno/visualEvents';
import { ReplayEffectIndex } from '../../core/replayEffectIndex';
import type { RenderContext } from '../../scene/types';
import { getTerrainHeightInterpolated } from '../../shared/renderUtils';
import { NpcProjectileFlights, type NpcProjectileFrame, npcVisualTargetCentre } from '../NpcProjectileFlights';
import type { ProjectileFlightRenderer } from '../ProjectileFlight';
import { type ProjectileEndpoint, projectileEndpoint } from '../projectileMotion';
import { ReplayProjectileWork } from '../replayProjectileWork';
import { getOneShotDurationCycles, updateOneShotSpotAnim } from '../spotAnimPlayback';

type Graphic = { readonly cue: InfernoGraphicCue; readonly start: number };
type Animation = { readonly cue: InfernoAnimationCue; readonly cycle: number };

export class InfernoVisualController {
  private readonly seenEvents = new Set<number>();
  private readonly flights: NpcProjectileFlights;
  private readonly graphics = new Map<string, Graphic>();
  private animations: Animation[] = [];
  private replayIndexes = new WeakMap<readonly ReplayDisplayFrame[], ReplayEffectIndex>();
  private replay: { readonly index: ReplayEffectIndex; readonly throughFrameIndex: number } | undefined;

  constructor(private readonly renderer: ProjectileFlightRenderer) {
    this.flights = new NpcProjectileFlights(renderer);
  }

  consumeEvents(events: readonly GameEvent[], destinationCycle = Number.NEGATIVE_INFINITY): void {
    // Even an empty live frame retires historical aiming, without resetting airborne flights.
    this.replay = undefined;
    for (const event of events) {
      if (!isInfernoVisualEvent(event) || this.seenEvents.has(event.eventId)) continue;
      this.seenEvents.add(event.eventId);
      const base = event.tick * 30;
      for (const [index, cue] of event.projectiles.entries()) {
        // Arrival convention: docs/architecture/projectile-motion.md#inputs-and-lifetime-boundary.
        const endCycleExclusive = base + cue.endDelayCycles;
        if (endCycleExclusive <= destinationCycle) continue;
        this.flights.add(`inferno-${event.eventId}-projectile-${index}`, cue, base);
      }
      for (const [index, cue] of event.graphics.entries()) {
        const start = base + cue.delayCycles;
        if (
          start <= destinationCycle &&
          start + getOneShotDurationCycles(this.renderer, cue.spotAnimId, 0) <= destinationCycle
        )
          continue;
        this.graphics.set(`inferno-${event.eventId}-graphic-${index}`, { cue, start });
      }
      for (const cue of event.animations) this.animations.push({ cue, cycle: base + cue.delayCycles });
    }
  }

  reconstruct(
    history: NonNullable<RenderContext['replayHistory']>,
    frame: NpcProjectileFrame,
    sharedIndex?: ReplayEffectIndex,
  ): void {
    this.clear();
    this.syncReplay(history, frame, sharedIndex);
  }

  syncReplay(
    history: NonNullable<RenderContext['replayHistory']>,
    frame: NpcProjectileFrame,
    sharedIndex?: ReplayEffectIndex,
  ): void {
    let index = sharedIndex ?? this.replayIndexes.get(history.frames);
    if (!index) {
      index = new ReplayEffectIndex(history.frames);
      this.replayIndexes.set(history.frames, index);
    }
    index.extend();
    this.replay = { index, throughFrameIndex: history.throughFrameIndex };
    const destination = { cycle: frame.cycle, throughFrameIndex: history.throughFrameIndex };
    for (const entry of index.inferno.projectiles(destination))
      if (!this.flights.has(entry.id)) this.flights.add(entry.id, entry.cue, entry.tick * 30);
    for (const entry of index.inferno.activeGraphics(destination, (id) =>
      getOneShotDurationCycles(this.renderer, id, 0),
    ))
      if (!this.graphics.has(entry.id))
        this.graphics.set(entry.id, { cue: entry.cue, start: entry.tick * 30 + entry.cue.delayCycles });
    // Replay poses actors from their timelines; only live play after a restored handoff takes these.
    this.animations = index.inferno.pendingAnimations(destination);
  }

  takeAnimations(cycle: number): Animation[] {
    const due = this.animations.filter((animation) => animation.cycle <= cycle);
    this.animations = this.animations.filter((animation) => animation.cycle > cycle);
    return due.sort((left, right) => left.cycle - right.cycle);
  }

  update(frame: NpcProjectileFrame, replayWork = new ReplayProjectileWork()): void {
    const sampler = this.replay?.index.actors.sampler(
      {
        cycle: frame.cycle,
        throughFrameIndex: this.replay.throughFrameIndex,
      },
      'snapshot',
    );
    this.flights.update(frame, sampler, replayWork);
    for (const [id, graphic] of this.graphics) {
      const { cue, start } = graphic;
      const status = updateOneShotSpotAnim(
        this.renderer,
        {
          instanceId: id,
          spotAnimId: cue.spotAnimId,
          startCycle: start,
          transformSource: {
            kind: 'dynamic',
            resolve: () => {
              const position = projectileEndpoint(
                this.endpoint(npcVisualTargetCentre(cue.target, frame.resolveActor), cue.height, frame),
              );
              return { position: [position.x, position.y, position.z] };
            },
          },
          heightOffsetMode: 'actor',
          fallbackDurationCycles: 0,
        },
        frame.cycle,
      );
      switch (status) {
        case 'expired':
          this.graphics.delete(id);
          break;
        case 'unloaded':
          if (frame.cycle >= start) this.graphics.delete(id);
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

  private endpoint(
    position: readonly [number, number],
    heightOffset: number,
    frame: NpcProjectileFrame,
  ): ProjectileEndpoint {
    return {
      worldX: position[0],
      worldY: position[1],
      heightOffset,
      resolvedOsrsZ: getTerrainHeightInterpolated(frame.terrainHeights, position[0], position[1]),
    };
  }

  clear(): void {
    this.flights.clear();
    for (const id of this.graphics.keys()) this.renderer.despawn(id);
    this.graphics.clear();
    this.animations = [];
    this.seenEvents.clear();
    this.replay = undefined;
  }

  dispose(): void {
    this.clear();
    this.replayIndexes = new WeakMap();
  }
}
