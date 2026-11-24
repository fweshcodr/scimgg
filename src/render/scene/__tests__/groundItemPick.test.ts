import { describe, expect, it } from 'vitest';
import { pickGroundItemsAtScreen } from '../groundItemPick';
import type { NpcHitTestData } from '../types';

const IDENTITY = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
const VIEW = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, -5, 1];
const VIEWPORT_WIDTH = 800;
const VIEWPORT_HEIGHT = 600;
const CENTER = { x: VIEWPORT_WIDTH / 2, y: VIEWPORT_HEIGHT / 2 };

function makeGroundItemEntry(groundItemId: string, z = 0): { groundItemId: string; hitTestData: NpcHitTestData } {
  return {
    groundItemId,
    hitTestData: {
      verticesX: new Int32Array([-10, 10, 0]),
      verticesY: new Int32Array([-10, -10, 10]),
      verticesZ: new Int32Array([0, 0, 0]),
      verticesCount: 3,
      indices1: new Int32Array([0]),
      indices2: new Int32Array([1]),
      indices3: new Int32Array([2]),
      faceCount: 1,
      faceColors3: null,
      modelMatrix: new Float32Array([1 / 128, 0, 0, 0, 0, 1 / 128, 0, 0, 0, 0, 1 / 128, 0, 0, 0, z, 1]),
      useBoundingBox: true,
    },
  };
}

describe('pickGroundItemsAtScreen', () => {
  it('Given overlapping ground items When the cursor hits their bounding boxes Then it returns nearest first', () => {
    const picked = pickGroundItemsAtScreen(
      CENTER,
      [makeGroundItemEntry('far'), makeGroundItemEntry('near', 2)],
      VIEW,
      IDENTITY,
      VIEWPORT_WIDTH,
      VIEWPORT_HEIGHT,
    );

    expect(picked.map((item) => item.groundItemId)).toEqual(['near', 'far']);
  });

  it('Given a cursor outside every item box When picking ground items Then it returns no items', () => {
    const picked = pickGroundItemsAtScreen(
      { x: 700, y: 80 },
      [makeGroundItemEntry('item')],
      VIEW,
      IDENTITY,
      VIEWPORT_WIDTH,
      VIEWPORT_HEIGHT,
    );

    expect(picked).toEqual([]);
  });
});
