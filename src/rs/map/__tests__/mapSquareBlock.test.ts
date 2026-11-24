import { describe, expect, it } from 'vitest';
import { getMapSquareBlock } from '../mapSquareBlock';

describe('getMapSquareBlock', () => {
  it('returns only the center square when the radius is omitted', () => {
    expect(getMapSquareBlock()).toEqual([{ dx: 0, dy: 0, tileOffsetX: 0, tileOffsetY: 0 }]);
  });

  it('maps only the requested relative squares to 64-tile offsets', () => {
    const block = getMapSquareBlock([
      { dx: -1, dy: 0 },
      { dx: 0, dy: -1 },
      { dx: 0, dy: 0 },
      { dx: 0, dy: 1 },
      { dx: 1, dy: 0 },
    ]);

    expect(block).toEqual([
      { dx: -1, dy: 0, tileOffsetX: -64, tileOffsetY: 0 },
      { dx: 0, dy: -1, tileOffsetX: 0, tileOffsetY: -64 },
      { dx: 0, dy: 0, tileOffsetX: 0, tileOffsetY: 0 },
      { dx: 0, dy: 1, tileOffsetX: 0, tileOffsetY: 64 },
      { dx: 1, dy: 0, tileOffsetX: 64, tileOffsetY: 0 },
    ]);
  });
});
