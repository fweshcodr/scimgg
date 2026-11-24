import { describe, expect, it } from 'vitest';
import {
  frameIndexAtMs,
  frameIndexNearestMs,
  frameSlotAtMs,
  frameStartMs,
  getReplayLateTicks,
} from '../replayTimeline';

const grid = Array.from({ length: 3 }, () => ({}));
const timed = [{ startMs: 0 }, { startMs: 700 }, { startMs: 1300 }];

describe('replay timeline', () => {
  it('keeps an untimed recording on the 600 ms grid', () => {
    expect([0, 1, 2, 4].map((index) => frameStartMs(grid, index))).toEqual([0, 600, 1200, 2400]);
    expect([0, 599, 600, 1799, 9000].map((ms) => frameIndexAtMs(grid, ms))).toEqual([0, 0, 1, 2, 2]);
  });

  it('starts each frame of a timed recording when its tick ran, extending the grid past the end', () => {
    expect([0, 1, 2, 3].map((index) => frameStartMs(timed, index))).toEqual([0, 700, 1300, 1900]);
    expect([-5, 0, 699, 700, 1299, 1300, 9000].map((ms) => frameIndexAtMs(timed, ms))).toEqual([0, 0, 0, 1, 1, 2, 2]);
  });

  it('searches each frame of a mixed recording by its own start, including an untimed last frame', () => {
    const mixed = [{ startMs: 0 }, { startMs: 900 }, {}];
    expect([0, 1, 2, 3].map((index) => frameStartMs(mixed, index))).toEqual([0, 900, 1200, 1800]);
    expect([700, 899, 900, 1199, 1200, 5000].map((ms) => frameIndexAtMs(mixed, ms))).toEqual([0, 0, 1, 1, 2, 2]);
    expect([400, 1000, 1100, 1900].map((ms) => frameIndexNearestMs(mixed, ms))).toEqual([0, 1, 2, 3]);
    expect([700, 1300, 1800].map((ms) => frameSlotAtMs(mixed, ms))).toEqual([0, 2, 3]);

    // An untimed prefix (a takeover of an untimed recording) continued by timed frames.
    const forked = [{}, {}, { startMs: 1500 }];
    expect([599, 600, 1499, 1500].map((ms) => frameIndexAtMs(forked, ms))).toEqual([0, 1, 1, 2]);
  });

  it('counts tick-lengths past the last frame for playback gap detection', () => {
    expect([650, 1300, 1899, 1900, 3100].map((ms) => frameSlotAtMs(timed, ms))).toEqual([0, 2, 2, 3, 5]);
    expect(frameSlotAtMs(grid, 3000)).toBe(5);
  });

  it('reads a typed time as the nearest frame start without clamping', () => {
    expect([340, 360, 1000, 1001, 2000].map((ms) => frameIndexNearestMs(timed, ms))).toEqual([0, 1, 1, 2, 3]);
    expect(frameIndexNearestMs(grid, 4000)).toBe(7);
  });

  it('lists the ticks that ran late, in order', () => {
    expect(getReplayLateTicks([{}, { timing: { lateByMs: 120 } }, {}, { timing: { lateByMs: 60 } }])).toEqual([
      { frameIndex: 1, lateByMs: 120 },
      { frameIndex: 3, lateByMs: 60 },
    ]);
  });
});
