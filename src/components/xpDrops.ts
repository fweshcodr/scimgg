import type { DisplayTimelineSnapshot } from '../core/displayTimeline';
import { isCoreEvent, type XpSkill } from '../core/events/types';
import type { ReplayDisplayFrame } from '../core/ReplayRecorder';
import { OSRS_TICK_MS } from '../types/simulation';

export const LIFETIME_MS = 2000;
export const FADE_START_FRACTION = 0.8;
export const UNGROUPED_DELAY_MS = 400;
export const STACK_SPACING_PX = 26;

export interface XpDropOptions {
  readonly grouped: boolean;
  readonly speed: number;
}

export interface XpDropEntry {
  readonly key: string;
  readonly skills: readonly { readonly skill: XpSkill; readonly amount: number }[];
  readonly predictedHit: number;
  readonly bornAtMs: number;
  readonly startOffsetPx: number;
}

interface Spawn {
  readonly entry: XpDropEntry;
  readonly frameIndex: number;
  readonly order: number;
}

function upperBound(spawns: readonly Spawn[], timeMs: number): number {
  let lower = 0;
  let upper = spawns.length;
  while (lower < upper) {
    const middle = Math.floor((lower + upper) / 2);
    if (spawns[middle].entry.bornAtMs <= timeMs) lower = middle + 1;
    else upper = middle;
  }
  return lower;
}

export class XpDropProjection {
  private history: readonly ReplayDisplayFrame[] | undefined;
  private options: XpDropOptions | undefined;
  private indexedFrames = 0;
  private indexedTail: ReplayDisplayFrame | undefined;
  private readonly eventIds = new Set<number>();
  private readonly spawns: Spawn[] = [];
  private nextOrder = 0;

  sample(snapshot: DisplayTimelineSnapshot, options: XpDropOptions): readonly XpDropEntry[] {
    if (
      this.history !== snapshot.history ||
      this.options?.grouped !== options.grouped ||
      this.options.speed !== options.speed ||
      snapshot.history.length < this.indexedFrames ||
      (this.indexedFrames > 0 && snapshot.history[this.indexedFrames - 1] !== this.indexedTail)
    ) {
      this.history = snapshot.history;
      this.options = { ...options };
      this.indexedFrames = 0;
      this.indexedTail = undefined;
      this.eventIds.clear();
      this.spawns.length = 0;
      this.nextOrder = 0;
    }
    this.indexThrough(snapshot, options);
    const nowMs = snapshot.tick * OSRS_TICK_MS;
    const first = upperBound(this.spawns, nowMs - LIFETIME_MS);
    const end = upperBound(this.spawns, nowMs);
    const visible: XpDropEntry[] = [];
    for (let index = first; index < end; index++) {
      const spawn = this.spawns[index];
      if (spawn.frameIndex <= snapshot.frameIndex) visible.push(spawn.entry);
    }
    return visible;
  }

  private indexThrough(snapshot: DisplayTimelineSnapshot, options: XpDropOptions): void {
    const additions: Spawn[] = [];
    const end = Math.min(snapshot.frameIndex + 1, snapshot.history.length);
    for (let frameIndex = this.indexedFrames; frameIndex < end; frameIndex++) {
      const frame = snapshot.history[frameIndex];
      for (const event of frame.events) {
        if (!isCoreEvent(event, 'xp_drop') || this.eventIds.has(event.eventId)) continue;
        this.eventIds.add(event.eventId);
        const groups = options.grouped ? [event.skills] : event.skills.map((skill) => [skill]);
        for (const [groupIndex, skills] of groups.entries()) {
          if (skills.reduce((sum, skill) => sum + skill.amount, 0) <= 0) continue;
          additions.push({
            frameIndex,
            order: this.nextOrder++,
            entry: {
              key: `${event.eventId}:${groupIndex}`,
              skills,
              predictedHit: groupIndex === 0 ? event.predictedHit : 0,
              bornAtMs: event.tick * OSRS_TICK_MS + groupIndex * UNGROUPED_DELAY_MS,
              startOffsetPx: 0,
            },
          });
        }
      }
      this.indexedFrames = frameIndex + 1;
      this.indexedTail = frame;
    }
    if (additions.length === 0) return;
    let earliestMs = Number.POSITIVE_INFINITY;
    for (const spawn of additions) earliestMs = Math.min(earliestMs, spawn.entry.bornAtMs);
    const start = upperBound(this.spawns, earliestMs);
    const tail = this.spawns.slice(start).concat(additions);
    tail.sort((left, right) => left.entry.bornAtMs - right.entry.bornAtMs || left.order - right.order);
    this.spawns.length = start;
    for (const spawn of tail) {
      const previous = this.spawns.at(-1)?.entry;
      const ageMs = previous ? spawn.entry.bornAtMs - previous.bornAtMs : LIFETIME_MS;
      const startOffsetPx =
        previous && ageMs < LIFETIME_MS
          ? Math.max(0, previous.startOffsetPx - (ageMs / 1000) * options.speed + STACK_SPACING_PX)
          : 0;
      this.spawns.push({ ...spawn, entry: { ...spawn.entry, startOffsetPx } });
    }
  }
}
