import { describe, expect, it } from 'vitest';
import { ReplayCueStream } from '../replayCueStream';

type Cue = { readonly delay: number; readonly length: number };

function stream() {
  const cues = new ReplayCueStream<Cue>();
  let order = 0;
  const add = (id: string, frameIndex: number, tick: number, delay: number, length = 0) =>
    cues.append({ id, cue: { delay, length }, frameIndex, tick, order: order++ }, delay + length);
  // A hidden opening frame (-1), then visible frames 0..2 at ticks 3..5.
  add('opening', -1, 2, 30, 20);
  add('early', 0, 3, 3, 30);
  add('late-start', 1, 4, 39, 30);
  add('same-tick', 2, 5, 0, 30);
  add('beyond-cutoff', 2, 5, 60, 30);
  const ids = (entries: readonly { id: string }[]) => entries.map(({ id }) => id);
  return { cues, ids };
}

describe('ReplayCueStream', () => {
  it('owes exactly the cues emitted through the frame cutoff and cycle, including unstarted ones', () => {
    const { cues, ids } = stream();
    const end = (cue: Cue) => cue.delay + cue.length;
    // At cycle 120 (tick 4): "late-start" begins at 159, so it is owed but not yet playing.
    expect(ids(cues.unexpired({ cycle: 120, throughFrameIndex: 1 }, end))).toEqual(['early', 'late-start']);
    // The frame cutoff excludes a later frame's cue even when its emitting cycle has been reached.
    expect(ids(cues.unexpired({ cycle: 150, throughFrameIndex: 1 }, end))).toEqual(['late-start']);
    // ...and the emitting cycle excludes a cue on an included frame that the clock has not reached.
    expect(ids(cues.unexpired({ cycle: 149, throughFrameIndex: 2 }, end))).toEqual(['late-start']);
    expect(ids(cues.unexpired({ cycle: 150, throughFrameIndex: 2 }, end))).toEqual([
      'late-start',
      'same-tick',
      'beyond-cutoff',
    ]);
    // Hidden opening context shares absolute cue times with the visible frames.
    expect(ids(cues.unexpired({ cycle: 99, throughFrameIndex: 0 }, end))).toEqual(['opening', 'early']);
    expect(ids(cues.unexpired({ cycle: 110, throughFrameIndex: 0 }, end))).toEqual(['early']);
  });

  it('separates pending starts from cues already in effect and answers rewinds from the destination alone', () => {
    const { cues, ids } = stream();
    const start = (cue: Cue) => cue.delay;
    expect(ids(cues.pending({ cycle: 158, throughFrameIndex: 2 }, start))).toEqual(['late-start', 'beyond-cutoff']);
    expect(ids(cues.pending({ cycle: 159, throughFrameIndex: 2 }, start))).toEqual(['beyond-cutoff']);
    expect(ids(cues.pending({ cycle: 125, throughFrameIndex: 1 }, start))).toEqual(['late-start']);
    // A rewind to before the emitting frame owes nothing it emitted, though the stream has seen it.
    expect(ids(cues.pending({ cycle: 125, throughFrameIndex: 0 }, start))).toEqual([]);
  });

  it('extends the lookback by a renderer-resolved duration the stream was not given', () => {
    const cues = new ReplayCueStream<Cue>();
    cues.append({ id: 'graphic', cue: { delay: 6, length: 0 }, frameIndex: 0, tick: 0, order: 0 }, 6);
    const end = (duration: number) => (cue: Cue) => cue.delay + duration;
    expect(cues.unexpired({ cycle: 50, throughFrameIndex: 0 }, end(60))).toEqual([]);
    expect(cues.unexpired({ cycle: 50, throughFrameIndex: 0 }, end(60), 60).map(({ id }) => id)).toEqual(['graphic']);
    expect(cues.unexpired({ cycle: 66, throughFrameIndex: 0 }, end(60), 60)).toEqual([]);
  });
});
