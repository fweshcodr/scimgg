import { describe, expect, it } from 'vitest';
import { TickEvents } from '../../../core/events/TickEvents';
import { emitInfernoVisual, type InfernoVisualCue, isInfernoVisualEvent } from '../visualEvents';

describe('Inferno visual event boundary', () => {
  it('clones the cue when emitted through TickEvents', () => {
    const events = new TickEvents();
    events.setTick(13);
    const cue: InfernoVisualCue = {
      animations: [{ actorId: 'zuk', clipId: 'attack', delayCycles: 0 }],
      projectiles: [],
      graphics: [],
    };
    emitInfernoVisual(events, cue);
    const event = events.flush()[0];
    expect(isInfernoVisualEvent(event)).toBe(true);
    if (!isInfernoVisualEvent(event)) throw new TypeError('Missing visual event');
    expect(event).toMatchObject({ type: 'inferno_visual', tick: 13, eventId: 1 });
    expect(event.animations).not.toBe(cue.animations);
  });

  it('rejects malformed recorded cues instead of assigning missing heights', () => {
    const event = {
      type: 'inferno_visual',
      eventId: 1,
      tick: 0,
      animations: [],
      projectiles: [],
      graphics: [{ spotAnimId: 451, target: { kind: 'tile', position: [31, 44] }, delayCycles: 0 }],
    };
    expect(isInfernoVisualEvent(event)).toBe(false);
    expect(isInfernoVisualEvent({ ...event, graphics: [], animations: [null] })).toBe(false);
  });
});
