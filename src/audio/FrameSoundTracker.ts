import type { ActorId } from '../core/actors/types';
import type { SeqType } from '../rs/config/seqtype/SeqType';
import type { Coordinate } from '../types/simulation';
import { log } from '../util/Logger';
import type { AudioEngine } from './AudioEngine';
import { osrsSoundVolume } from './attenuation';

export interface ActorFrameState {
  actorId: ActorId;
  seqId: number;
  currentFrame: number;
  seqType: SeqType | null;
  /**
   * World tile the sound comes from: an npc's or spotanim's center, the player's visual center.
   * Frame sounds attenuate against the listener, so a state built without this plays a distant
   * animation at the same volume as one on top of the player.
   *
   * Null only while a producer genuinely does not know yet (a spotanim spawned this frame but not
   * drawn), which plays unattenuated rather than dropping the sound outright — spotanim sounds sit
   * on frame 0 and 1, so dropping them would lose most of them.
   */
  position: Readonly<Coordinate> | null;
}

interface TrackedState {
  seqId: number;
  lastFrame: number;
}

export class FrameSoundTracker {
  private state = new Map<ActorId, TrackedState>();

  constructor(private readonly audioEngine: AudioEngine) {}

  update(actors: ActorFrameState[], listenerPosition: Readonly<Coordinate>): void {
    const seenActorIds = new Set<ActorId>();

    for (const actor of actors) {
      seenActorIds.add(actor.actorId);
      const tracked = this.state.get(actor.actorId);

      if (!tracked || tracked.seqId !== actor.seqId) {
        this.state.set(actor.actorId, { seqId: actor.seqId, lastFrame: actor.currentFrame });
        this.playFrameSounds(actor, actor.currentFrame, listenerPosition);
        continue;
      }

      if (tracked.lastFrame === actor.currentFrame) {
        continue;
      }

      if (actor.seqType?.frameSounds) {
        if (actor.currentFrame > tracked.lastFrame) {
          for (let f = tracked.lastFrame + 1; f <= actor.currentFrame; f++) {
            this.playFrameSounds(actor, f, listenerPosition);
          }
        } else if (actor.seqType.isLooping()) {
          const frameCount = actor.seqType.frameIds?.length ?? 0;
          if (frameCount > 0) {
            for (let f = tracked.lastFrame + 1; f < frameCount; f++) {
              this.playFrameSounds(actor, f, listenerPosition);
            }
          }
          // A frameStep loop jumps back to `frameCount - frameStep`, not frame 0, so landing at or
          // past that frame never passed through the intro before it. Replaying from 0 would re-fire
          // a one-time intro sound (the Sol Heredit solar flare's flare-up) on every loop.
          const frameStep = actor.seqType.frameStep;
          const loopStart = frameStep > 0 && frameStep <= frameCount ? frameCount - frameStep : 0;
          const wrapStart = actor.currentFrame >= loopStart ? loopStart : 0;
          for (let f = wrapStart; f <= actor.currentFrame; f++) {
            this.playFrameSounds(actor, f, listenerPosition);
          }
        } else {
          // A one-shot sequence holds its last frame, so it can never run backwards on its
          // own: this is the same actor id replaying it from the start. Reading it as a wrap
          // instead would fire every sound between the old frame and the end of the sequence,
          // which is what a re-fired spotanim on a reused instance id looks like.
          for (let f = 0; f <= actor.currentFrame; f++) {
            this.playFrameSounds(actor, f, listenerPosition);
          }
        }
      }

      tracked.lastFrame = actor.currentFrame;
    }

    this.pruneUnseen(seenActorIds);
  }

  reset(): void {
    this.state.clear();
  }

  silentSync(actors: ActorFrameState[]): void {
    const seenActorIds = new Set<ActorId>();

    for (const actor of actors) {
      seenActorIds.add(actor.actorId);
      this.state.set(actor.actorId, { seqId: actor.seqId, lastFrame: actor.currentFrame });
    }

    this.pruneUnseen(seenActorIds);
  }

  private pruneUnseen(seenActorIds: Set<ActorId>): void {
    for (const actorId of this.state.keys()) {
      if (!seenActorIds.has(actorId)) {
        this.state.delete(actorId);
      }
    }
  }

  private playFrameSounds(actor: ActorFrameState, frame: number, listenerPosition: Readonly<Coordinate>): void {
    const sounds = actor.seqType?.frameSounds?.get(frame);
    if (!sounds) return;
    for (const sound of sounds) {
      log.debug(
        'FrameSoundTracker',
        `[${actor.actorId}] seq=${actor.seqId} frame=${frame} → soundId=${sound.id} loops=${sound.loops} location=${sound.location} retain=${sound.retain}`,
      );
      // `location` 0 means the sequence carries no range at all, which plays as a plain synth
      // at full volume rather than a positioned one.
      if (sound.location <= 0 || actor.position === null) {
        this.audioEngine.play(sound.id, { channel: 'sfx' }, `frame:seq=${actor.seqId},f=${frame}`);
        continue;
      }
      const volume = osrsSoundVolume(actor.position, listenerPosition, sound.location, sound.retain);
      if (volume <= 0) continue;
      this.audioEngine.play(sound.id, { channel: 'area', volume }, `frame:seq=${actor.seqId},f=${frame}`);
    }
  }
}
