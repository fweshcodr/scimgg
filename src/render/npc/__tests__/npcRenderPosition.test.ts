import { describe, expect, it } from 'vitest';
import type { Coordinate } from '../../../types/simulation';
import { interpolateNpcPosition, npcCrawlProgress } from '../npcRenderPosition';

const npc = (previousPosition: Coordinate, position: Coordinate, movementPath?: Coordinate[]) => ({
  previousPosition,
  position,
  ...(movementPath ? { movementPath } : {}),
});

describe('interpolateNpcPosition', () => {
  const crawl = {
    ...npc([5, 6], [5, 6]),
    crawlMovement: { from: [5, 5] as Coordinate, to: [5, 6] as Coordinate, startTick: 10 },
  };

  it.each([
    { tick: 10, fraction: 0, y: 5 },
    { tick: 10, fraction: 0.5, y: 5.25 },
    { tick: 11, fraction: 0, y: 5.5 },
    { tick: 11, fraction: 0.5, y: 5.75 },
    { tick: 12, fraction: 0, y: 6 },
    { tick: 20, fraction: 1, y: 6 },
    { tick: 9, fraction: 0, y: 5 },
  ])('samples crawl statelessly at $tick + $fraction', ({ tick, fraction, y }) => {
    expect(interpolateNpcPosition(crawl, fraction, tick)).toEqual([5, y]);
    expect(npcCrawlProgress(crawl, fraction, tick)).toBe(y - 5);
  });

  it('ignores relocated crawl metadata and preserves no-clock compatibility', () => {
    expect(interpolateNpcPosition({ ...crawl, position: [8, 8], previousPosition: [8, 8] }, 0.5, 11)).toEqual([8, 8]);
    expect(interpolateNpcPosition(crawl, 0.5)).toEqual([5, 6]);
    expect(npcCrawlProgress({ ...crawl, position: [8, 8] }, 0, 11)).toBeNull();
  });

  // B:2364 sim tiles: a warband archer runs (27,37) west to (26,37), then north-west to (25,38).
  it.each([
    { fraction: 0, expected: [27, 37] },
    { fraction: 0.5, expected: [26, 37] },
    { fraction: 0.75, expected: [25.5, 37.5] },
    { fraction: 1, expected: [25, 38] },
  ])('follows each step of a run at fraction $fraction', ({ fraction, expected }) => {
    const run = npc(
      [27, 37],
      [25, 38],
      [
        [26, 37],
        [25, 38],
      ],
    );
    expect(interpolateNpcPosition(run, fraction)).toEqual(expected);
  });

  it.each([
    { reason: 'no movementPath', path: undefined },
    { reason: 'a one-step path', path: [[25, 38]] as Coordinate[] },
    {
      reason: 'a path that does not end on the position',
      path: [
        [26, 37],
        [25, 37],
      ] as Coordinate[],
    },
  ])('slides straight from the previous tile with $reason', ({ path }) => {
    expect(interpolateNpcPosition(npc([27, 37], [25, 38], path), 0.5)).toEqual([26, 37.5]);
  });

  it('keeps a stationary NPC on its tile', () => {
    expect(interpolateNpcPosition(npc([5, 5], [5, 5]), 0.5)).toEqual([5, 5]);
  });
});
