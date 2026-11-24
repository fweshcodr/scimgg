import { describe, expect, it, vi } from 'vitest';
import { type PrimarySpec, ReplayPrimaryIndex } from '../replayPrimaryIndex';

const attack: PrimarySpec<string> = { clip: 'attack', priority: 6, duration: 90, delay: 0, replaces: false };
const block: PrimarySpec<string> = { clip: 'block', priority: 5, duration: 30, delay: 0, replaces: false };
const destination = (cycle: number, throughFrameIndex = 100) => ({ cycle, throughFrameIndex });

describe('ReplayPrimaryIndex', () => {
  it('retains an accepted attack when a newer block loses priority', () => {
    const index = new ReplayPrimaryIndex([
      { frameIndex: 0, tick: 0, value: attack },
      { frameIndex: 1, tick: 1, value: block },
    ]);
    const result = index.sample(destination(45.5), {}, (cue) => cue);
    expect(result.primary).toMatchObject({ clip: 'attack', elapsedTicks: 45, remainderMs: 10 });
  });

  it('restarts equal-priority cues and keeps delayed clips in the slot', () => {
    const index = new ReplayPrimaryIndex([
      { frameIndex: 0, tick: 0, value: { ...attack, delay: 30 } },
      { frameIndex: 1, tick: 0, value: block },
      { frameIndex: 2, tick: 1, value: attack },
    ]);
    const metadata = {};
    index.sample(destination(70), metadata, (cue) => cue);
    expect(index.sample(destination(15, 1), metadata, (cue) => cue).primary).toMatchObject({
      clip: 'attack',
      delayClientTicks: 15,
      elapsedTicks: 0,
    });
    expect(index.sample(destination(45), metadata, (cue) => cue).primary?.elapsedTicks).toBe(15);
  });

  it('retries unavailable metadata without shifting the origin and invalidates on identity change', () => {
    const index = new ReplayPrimaryIndex([{ frameIndex: 0, tick: 2, value: attack }]);
    const metadata = {};
    expect(index.sample(destination(80), metadata, () => undefined).pending).toBe(true);
    expect(index.sample(destination(80), metadata, (cue) => cue)).toMatchObject({
      rebuilt: true,
      pending: false,
      primary: { elapsedTicks: 20 },
    });
    expect(index.sample(destination(80), {}, () => ({ ...block, duration: 10 })).primary).toBeNull();
  });

  it('does not revisit historical cues after indexing, including fractional rewinds and appends', () => {
    const entries = Array.from({ length: 1000 }, (_, frameIndex) => ({ frameIndex, tick: frameIndex, value: attack }));
    const index = new ReplayPrimaryIndex(entries);
    const resolve = vi.fn((cue: PrimarySpec<string>) => cue);
    const metadata = {};
    index.sample(destination(29990, 999), metadata, resolve);
    resolve.mockClear();
    for (let cycle = 500; cycle > 400; cycle -= 0.25) index.sample(destination(cycle), metadata, resolve);
    expect(resolve).not.toHaveBeenCalled();
    entries.push({ frameIndex: 1000, tick: 1000, value: attack });
    index.sample(destination(30001, 1000), metadata, resolve);
    expect(resolve).toHaveBeenCalledTimes(1);
  });
});
