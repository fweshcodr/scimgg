import type { GameEvent } from '../../core/events/types';
import {
  type InfernoAnimationCue,
  type InfernoGraphicCue,
  isInfernoVisualEvent,
} from '../../npcs/inferno/visualEvents';
import type { NpcProjectileCue } from '../../npcs/projectileCue';
import type { AnimClipRef } from '../npc/animationTypes';
import { type ReplayCue, ReplayCueStream } from './replayCueStream';
import { ReplayDeferredPrimaryIndex } from './replayDeferredPrimaryIndex';
import type { ReplayEffectDestination } from './replayEffectIndex';

export class InfernoReplayIndex {
  private readonly seenEvents = new Set<number>();
  private readonly flights = new ReplayCueStream<NpcProjectileCue>();
  private readonly graphics = new Map<number, ReplayCueStream<InfernoGraphicCue>>();
  private readonly animations = new ReplayCueStream<InfernoAnimationCue>();
  private readonly actors = new Map<string, ReplayDeferredPrimaryIndex<AnimClipRef>>();
  private order = 0;

  append(events: readonly GameEvent[], frameIndex: number): void {
    for (const event of events) {
      if (event.type !== 'inferno_visual' || this.seenEvents.has(event.eventId) || !isInfernoVisualEvent(event))
        continue;
      this.seenEvents.add(event.eventId);
      for (const [ordinal, cue] of event.projectiles.entries()) {
        if (cue.startDelayCycles === cue.endDelayCycles) continue;
        this.flights.append(
          {
            id: `inferno-${event.eventId}-projectile-${ordinal}`,
            cue,
            frameIndex,
            tick: event.tick,
            order: this.order++,
          },
          cue.endDelayCycles,
        );
      }
      for (const [ordinal, cue] of event.graphics.entries()) {
        let stream = this.graphics.get(cue.spotAnimId);
        if (!stream) {
          stream = new ReplayCueStream();
          this.graphics.set(cue.spotAnimId, stream);
        }
        stream.append(
          { id: `inferno-${event.eventId}-graphic-${ordinal}`, cue, frameIndex, tick: event.tick, order: this.order++ },
          cue.delayCycles,
        );
      }
      const actors = new Map<string, Array<{ cycle: number; clipId: string }>>();
      for (const cue of event.animations) {
        this.animations.append({ id: '', cue, frameIndex, tick: event.tick, order: this.order++ }, cue.delayCycles);
        const cues = actors.get(cue.actorId) ?? [];
        cues.push({ cycle: event.tick * 30 + cue.delayCycles, clipId: cue.clipId });
        actors.set(cue.actorId, cues);
      }
      for (const [actorId, cues] of actors) {
        let timeline = this.actors.get(actorId);
        if (!timeline) {
          timeline = new ReplayDeferredPrimaryIndex();
          this.actors.set(actorId, timeline);
        }
        timeline.append(frameIndex, event.tick, cues);
      }
    }
  }

  projectiles(destination: ReplayEffectDestination): readonly ReplayCue<NpcProjectileCue>[] {
    return this.flights.unexpired(destination, (cue) => cue.endDelayCycles);
  }

  activeGraphics(
    destination: ReplayEffectDestination,
    duration: (id: number) => number,
  ): readonly ReplayCue<InfernoGraphicCue>[] {
    const result: ReplayCue<InfernoGraphicCue>[] = [];
    for (const [id, stream] of this.graphics) {
      const lifetime = duration(id);
      result.push(...stream.unexpired(destination, (cue) => cue.delayCycles + lifetime, lifetime));
    }
    return result.sort((left, right) => left.order - right.order);
  }

  pendingAnimations(destination: ReplayEffectDestination) {
    return this.animations
      .pending(destination, (cue) => cue.delayCycles)
      .map((entry) => ({ cue: entry.cue, cycle: entry.tick * 30 + entry.cue.delayCycles }));
  }

  primaryTimeline(actorId: string): ReplayDeferredPrimaryIndex<AnimClipRef> | undefined {
    return this.actors.get(actorId);
  }
}
