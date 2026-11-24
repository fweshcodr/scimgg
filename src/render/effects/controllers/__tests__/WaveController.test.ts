import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { getArenaAllowUnboundedFallback, getArenaConfig, setArenaConfig } from '../../../../core/constants';
import { isSouthOfArenaEntrance } from '../../../../encounters/yamaP3/constants';
import { getWaveTiles, isWaveTile } from '../../../../encounters/yamaP3/waves';
import type { RenderQueue } from '../../../core/commands';
import { SpotAnimRenderer } from '../../SpotAnimRenderer';
import { WaveController } from '../WaveController';

const BOUNDS = { minX: 0, maxX: 63, minY: 0, maxY: 63, width: 64, height: 64 };

function highlightedTiles(tick: number, progress = 0.25): Set<string> {
  const queue: RenderQueue = { replayPresentationReady: true, commands: [] };
  new WaveController().update(new SpotAnimRenderer(), tick, tick + progress, queue, true);
  const tiles = new Set<string>();
  for (const command of queue.commands) {
    if (command.kind !== 'mesh3d') continue;
    const [, , x, y] = command.meshId.split('-');
    tiles.add(`${x},${y}`);
  }
  return tiles;
}

function inArenaWaveTiles(tick: number): Set<string> {
  return new Set(
    getWaveTiles(tick, BOUNDS.minX, BOUNDS.maxX, BOUNDS.minY, BOUNDS.maxY)
      .filter((tile) => !isSouthOfArenaEntrance(tile.y))
      .map((tile) => `${tile.x},${tile.y}`),
  );
}

describe('WaveController wave-tile debug overlay', () => {
  let previousArena: ReturnType<typeof getArenaConfig>;
  let previousAllowUnbounded: boolean;

  beforeEach(() => {
    previousArena = getArenaConfig();
    previousAllowUnbounded = getArenaAllowUnboundedFallback();
    setArenaConfig({ bounds: BOUNDS, walkableTiles: null, collisionMap: null }, true);
  });

  afterEach(() => {
    setArenaConfig(previousArena, previousAllowUnbounded);
  });

  it("highlights the tiles that hit a player who ends the shown tick on them (next tick's wave)", () => {
    let checked = 0;
    for (let tick = 0; tick < 200; tick++) {
      const highlighted = highlightedTiles(tick);
      expect(highlighted).toEqual(inArenaWaveTiles(tick + 1));
      for (const key of highlighted) {
        const [x, y] = key.split(',').map(Number);
        expect(isWaveTile(x, y, tick + 1)).toBe(true);
      }
      if (highlighted.size > 0) checked++;
    }
    expect(checked).toBeGreaterThan(0);
  });

  it('shows nothing on the last tick a wave is drawn, since it can no longer hit', () => {
    const lastDrawnTick = Array.from({ length: 200 }, (_, tick) => tick).find(
      (tick) => inArenaWaveTiles(tick).size > 0 && inArenaWaveTiles(tick + 1).size === 0,
    );
    if (lastDrawnTick === undefined) throw new Error('Expected a wave to finish within 200 ticks');

    expect(highlightedTiles(lastDrawnTick).size).toBe(0);
  });

  it('keys highlights to the displayed state tick at any interpolation progress, including 1', () => {
    for (let tick = 0; tick < 200; tick++) {
      const expected = inArenaWaveTiles(tick + 1);
      for (const progress of [0, 0.25, 1]) expect(highlightedTiles(tick, progress)).toEqual(expected);
    }
  });
});
