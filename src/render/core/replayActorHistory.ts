import type { Coordinate, NpcSnapshot } from '../../types/simulation';
import type { ActorVisualPositionResolver } from '../effects/projectileAim';
import { interpolateNpcPosition, npcCrawlProgress } from '../npc/npcRenderPosition';
import { isNpcStandingAt } from '../npc/npcStanding';
import { calculateVisualPlayerPosition } from './interpolation';
import type { ReplayEffectSourceFrame } from './replayEffectContext';
import type { ReplayEffectDestination } from './replayEffectIndex';

type ActorFrame = {
  readonly frameIndex: number;
  readonly tick: number;
  readonly npc: NpcSnapshot;
};
type StateFrame = { readonly frameIndex: number; readonly state: ReplayEffectSourceFrame['state'] };

export type ReplayActorSampler = (cycle: number, sinceCycle: number) => ActorVisualPositionResolver;

export class ReplayActorHistory {
  private readonly states: StateFrame[] = [];
  private readonly actors = new Map<string, ActorFrame[]>();
  private readonly snapshotActors = new Map<string, ActorFrame[]>();

  append(frame: ReplayEffectSourceFrame, frameIndex: number): void {
    this.states.push({ frameIndex, state: frame.state });
    for (const npc of frame.state.npcs) {
      const entry = { frameIndex, tick: frame.state.currentTick, npc };
      let snapshots = this.snapshotActors.get(npc.id);
      if (!snapshots) {
        snapshots = [];
        this.snapshotActors.set(npc.id, snapshots);
      }
      snapshots.push(entry);
      // A queued death still moves through its killing tick, so projectiles keep homing on it.
      if (!isNpcStandingAt(npc, frame.state.currentTick * 30)) continue;
      let entries = this.actors.get(npc.id);
      if (!entries) {
        entries = [];
        this.actors.set(npc.id, entries);
      }
      entries.push(entry);
    }
  }

  sampler(
    destination: ReplayEffectDestination,
    presence: 'since-cycle' | 'snapshot' = 'since-cycle',
  ): ReplayActorSampler {
    return (cycle, sinceCycle) => {
      const eligible = (frameIndex: number, tick: number) =>
        frameIndex <= destination.throughFrameIndex && tick * 30 <= cycle;
      const stateEntry = this.latest(this.states, (entry) => eligible(entry.frameIndex, entry.state.currentTick));
      return (actorId): Coordinate | null => {
        if (actorId === 'player') {
          const state = stateEntry?.state;
          if (!state) return null;
          return calculateVisualPlayerPosition(
            state.playerPreviousPosition,
            state.playerMovementPath,
            state.playerPosition,
            Math.max(0, Math.min(1, cycle / 30 - state.currentTick)),
          ).position;
        }
        const actors = presence === 'snapshot' ? this.snapshotActors : this.actors;
        const actor = this.latest(actors.get(actorId) ?? [], (entry) => eligible(entry.frameIndex, entry.tick));
        if (
          !actor ||
          (presence === 'snapshot' ? actor.frameIndex !== stateEntry?.frameIndex : (actor.tick + 1) * 30 <= sinceCycle)
        )
          return null;
        const fraction = Math.max(0, Math.min(1, cycle / 30 - actor.tick));
        // The same path the NPC is drawn along, so a shot homes on the NPC rather than a chord of its run.
        return fraction === 0 && npcCrawlProgress(actor.npc, fraction, actor.tick) === null
          ? actor.npc.position
          : interpolateNpcPosition(actor.npc, fraction, actor.tick);
      };
    };
  }

  private latest<Value>(entries: readonly Value[], eligible: (entry: Value) => boolean): Value | undefined {
    let lower = 0;
    let upper = entries.length;
    while (lower < upper) {
      const middle = Math.floor((lower + upper) / 2);
      const entry = entries[middle];
      if (entry && eligible(entry)) lower = middle + 1;
      else upper = middle;
    }
    return entries[lower - 1];
  }
}
