import type { GameEvent } from './types';

export type EmittableGameEvent<T extends GameEvent = GameEvent> = T extends GameEvent
  ? Omit<T, 'eventId' | 'tick'>
  : never;

export class TickEvents {
  private eventBuffer: GameEvent[] = [];
  private nextEventId = 1;
  private currentTick = 0;

  setTick(tick: number): void {
    this.currentTick = tick;
  }

  emit<T extends EmittableGameEvent>(event: T): void {
    // Spreading a discriminated-union Omit (EmittableGameEvent) and re-adding the base fields
    // can't be re-narrowed to GameEvent by TS (EncounterGameEvent's index signature widens it),
    // so assert the known-correct shape.
    const fullEvent = {
      ...event,
      tick: this.currentTick,
      eventId: this.nextEventId,
    } as GameEvent;
    this.eventBuffer.push(fullEvent);
    this.nextEventId += 1;
  }

  /** Make the next emitted ID follow `eventId`, never reusing an ID a recording already holds. */
  continueAfter(eventId: number): void {
    this.nextEventId = Math.max(this.nextEventId, eventId + 1);
  }

  flush(): GameEvent[] {
    const events = [...this.eventBuffer];
    this.eventBuffer = [];
    return events;
  }
}
