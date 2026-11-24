import { describe, expect, it } from 'vitest';
import { detectTimelineDiscontinuity, type TimelineDiscontinuityState } from '../timelineDiscontinuity';

const KEY_A = 'yama_p3:0:L:1';
const KEY_B = 'yama_p3:0:R:1';

function state(lastDisplayedTick: number | undefined, lastTimelineKey: string | undefined): TimelineDiscontinuityState {
  return { lastDisplayedTick, lastTimelineKey };
}

describe('detectTimelineDiscontinuity', () => {
  it('returns null on the first frame (no prior tick or key)', () => {
    expect(
      detectTimelineDiscontinuity(state(undefined, undefined), { currentTick: 10, timelineKey: KEY_A }),
    ).toBeNull();
  });

  it('returns null on the same tick (held/seeked/paused frame)', () => {
    expect(detectTimelineDiscontinuity(state(10, KEY_A), { currentTick: 10, timelineKey: KEY_A })).toBeNull();
  });

  it('returns null on contiguous forward playback (tick + 1)', () => {
    expect(detectTimelineDiscontinuity(state(10, KEY_A), { currentTick: 11, timelineKey: KEY_A })).toBeNull();
  });

  it('detects a rewind (tick moves backward)', () => {
    expect(detectTimelineDiscontinuity(state(20, KEY_A), { currentTick: 5, timelineKey: KEY_A })).toBe('rewind');
  });

  it('detects a rewind by exactly one tick', () => {
    expect(detectTimelineDiscontinuity(state(11, KEY_A), { currentTick: 10, timelineKey: KEY_A })).toBe('rewind');
  });

  it('detects a forward-jump (tick skips ahead by more than one)', () => {
    expect(detectTimelineDiscontinuity(state(10, KEY_A), { currentTick: 20, timelineKey: KEY_A })).toBe('forward-jump');
  });

  it('detects a timeline-change even when the tick is contiguous', () => {
    expect(detectTimelineDiscontinuity(state(10, KEY_A), { currentTick: 11, timelineKey: KEY_B })).toBe(
      'timeline-change',
    );
  });

  it('detects a timeline-change even when the tick is identical', () => {
    expect(detectTimelineDiscontinuity(state(10, KEY_A), { currentTick: 10, timelineKey: KEY_B })).toBe(
      'timeline-change',
    );
  });

  it('detects same-tick and contiguous replay exit into the stable live timeline', () => {
    expect(detectTimelineDiscontinuity(state(10, 'replay-1'), { currentTick: 10, timelineKey: 'live' })).toBe(
      'timeline-change',
    );
    expect(detectTimelineDiscontinuity(state(10, 'replay-1'), { currentTick: 11, timelineKey: 'live' })).toBe(
      'timeline-change',
    );
  });

  it('prioritizes timeline-change over a coincident rewind', () => {
    // New engine/scene typically restarts at tick 0 while the last displayed
    // tick was deep in the fight: both rewind AND timeline-change apply →
    // timeline-change must win (full reset, not just a tick rewind).
    expect(detectTimelineDiscontinuity(state(50, KEY_A), { currentTick: 0, timelineKey: KEY_B })).toBe(
      'timeline-change',
    );
  });

  it('does not treat the first-ever key (no prior key) as a timeline-change', () => {
    expect(detectTimelineDiscontinuity(state(undefined, undefined), { currentTick: 0, timelineKey: KEY_A })).toBeNull();
  });

  it('does not fire timeline-change when the current key is undefined (unwired surface)', () => {
    // Lobby / 2D surfaces may not supply a key yet; tick-based detection still works.
    expect(detectTimelineDiscontinuity(state(10, KEY_A), { currentTick: 5, timelineKey: undefined })).toBe('rewind');
    expect(detectTimelineDiscontinuity(state(10, KEY_A), { currentTick: 11, timelineKey: undefined })).toBeNull();
  });

  it('handles a fully-unwired surface with only tick-based detection', () => {
    expect(detectTimelineDiscontinuity(state(10, undefined), { currentTick: 9, timelineKey: undefined })).toBe(
      'rewind',
    );
    expect(detectTimelineDiscontinuity(state(10, undefined), { currentTick: 30, timelineKey: undefined })).toBe(
      'forward-jump',
    );
  });
});
