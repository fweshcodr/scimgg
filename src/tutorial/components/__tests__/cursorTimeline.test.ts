import { describe, expect, it } from 'vitest';
import { PrayerType } from '../../../types/simulation';
import type { DemoCursorCue } from '../../types';
import { cueAbsoluteMs, cursorStateAt, TIMELINE_DEFAULT_MOVE_MS, TIMELINE_PRESS_MS } from '../cursorTimeline';

const TICK_MS = 600;

const book: DemoCursorCue = {
  time: { kind: 'ms', ms: 900 },
  target: { kind: 'panel-tab', tab: 'prayer' },
  moveMs: 900,
  click: true,
  label: 'Open the prayer book',
};
const prayMagic: DemoCursorCue = {
  time: { kind: 'tick', tick: 10 },
  target: { kind: 'prayer', prayer: PrayerType.ProtectMagic },
  moveMs: 1000,
  click: true,
  label: 'Protect from Magic',
};
const prayMissiles: DemoCursorCue = {
  time: { kind: 'tick', tick: 17 },
  target: { kind: 'prayer', prayer: PrayerType.ProtectRange },
  moveMs: 1000,
  click: true,
  label: 'Protect from Missiles',
};
const cues = [book, prayMagic, prayMissiles];
// arrives: book=900, magic=6000, missiles=10200. glideStarts: 0, 5000, 9200.

describe('cueAbsoluteMs', () => {
  it('resolves ms- and tick-anchored cues (with offset)', () => {
    expect(cueAbsoluteMs(book, TICK_MS)).toBe(900);
    expect(cueAbsoluteMs(prayMagic, TICK_MS)).toBe(6000);
    expect(cueAbsoluteMs({ ...prayMagic, time: { kind: 'tick', tick: 10, offsetMs: 120 } }, TICK_MS)).toBe(6120);
  });
});

describe('cursorStateAt', () => {
  it('returns null for an empty track', () => {
    expect(cursorStateAt([], 100, TICK_MS)).toBeNull();
  });

  it('is hidden before the first cue glide-in starts', () => {
    expect(cursorStateAt(cues, -1, TICK_MS)).toBeNull();
  });

  it('glides in from rest toward the first target', () => {
    const start = cursorStateAt(cues, 0, TICK_MS)!;
    expect(start.fromTarget).toBeNull();
    expect(start.toTarget).toEqual(book.target);
    expect(start.t).toBeCloseTo(0, 5);

    const mid = cursorStateAt(cues, 450, TICK_MS)!;
    expect(mid.t).toBeCloseTo(0.5, 5);

    const arrived = cursorStateAt(cues, 900, TICK_MS)!;
    expect(arrived.t).toBe(1);
    expect(arrived.toTarget).toEqual(book.target);
  });

  it('sits settled on a target between its arrival and the next glide', () => {
    const s = cursorStateAt(cues, 3000, TICK_MS)!;
    expect(s.toTarget).toEqual(book.target);
    expect(s.fromTarget).toBeNull();
    expect(s.t).toBe(1);
  });

  it('glides between two targets inside the next glide window', () => {
    const s = cursorStateAt(cues, 5500, TICK_MS)!;
    expect(s.fromTarget).toEqual(book.target);
    expect(s.toTarget).toEqual(prayMagic.target);
    expect(s.t).toBeCloseTo(0.5, 5);
  });

  it('settles on the last target after the final arrival', () => {
    const s = cursorStateAt(cues, 11000, TICK_MS)!;
    expect(s.toTarget).toEqual(prayMissiles.target);
    expect(s.fromTarget).toEqual(prayMagic.target);
    expect(s.t).toBe(1);
    expect(s.label).toBe('Protect from Missiles');
  });

  it('pulses pressed only within PRESS_MS after a clicking cue arrival', () => {
    expect(cursorStateAt(cues, 900, TICK_MS)!.pressed).toBe(true);
    expect(cursorStateAt(cues, 900 + TIMELINE_PRESS_MS - 1, TICK_MS)!.pressed).toBe(true);
    expect(cursorStateAt(cues, 900 + TIMELINE_PRESS_MS, TICK_MS)!.pressed).toBe(false);
    expect(cursorStateAt(cues, 6000, TICK_MS)!.pressed).toBe(true);
    expect(cursorStateAt(cues, 3000, TICK_MS)!.pressed).toBe(false);
  });

  it('does not pulse for a non-clicking cue', () => {
    const noClick: DemoCursorCue = {
      time: { kind: 'ms', ms: 500 },
      target: { kind: 'selector', selector: '#x' },
      click: false,
    };
    expect(cursorStateAt([noClick], 500, TICK_MS)!.pressed).toBe(false);
  });

  it('applies the default move duration when moveMs is omitted', () => {
    const cue: DemoCursorCue = { time: { kind: 'ms', ms: 2000 }, target: { kind: 'selector', selector: '#y' } };
    expect(cursorStateAt([cue], 2000 - TIMELINE_DEFAULT_MOVE_MS, TICK_MS)!.t).toBeCloseTo(0, 5);
    expect(cursorStateAt([cue], 2000 - TIMELINE_DEFAULT_MOVE_MS / 2, TICK_MS)!.t).toBeCloseTo(0.5, 5);
  });
});
