import { describe, expect, it } from 'vitest';
import { playerMoveToNpc } from '../movement';

describe('playerMoveToNpc - drag mechanic (no arena constraints installed)', () => {
  it('melee (range 1) drag paths to adjacent - running', () => {
    const result = playerMoveToNpc([20, 20], [29, 28], 5, true);

    expect(result.stepTiles.length).toBe(2);
    expect(result.position[0]).toBeGreaterThan(20);
    expect(result.position[1]).toBeGreaterThan(20);
  });

  it('melee drag 1 tile when walking', () => {
    const result = playerMoveToNpc([20, 20], [29, 28], 5, false);

    expect(result.stepTiles.length).toBe(1);
    expect(result.position[0]).toBeGreaterThan(20);
    expect(result.position[1]).toBeGreaterThan(20);
  });

  it('already adjacent returns no movement', () => {
    const result = playerMoveToNpc([28, 30], [29, 28], 5, true);

    expect(result.stepTiles.length).toBe(0);
    expect(result.position).toEqual([28, 30]);
  });

  it('ranged weapon out of range moves toward NPC', () => {
    const result = playerMoveToNpc([15, 28], [29, 28], 5, true);

    expect(result.stepTiles.length).toBe(2);
    expect(result.position[0]).toBeGreaterThan(15);
  });

  it('NPC tile guard - does not land on NPC tiles', () => {
    const result = playerMoveToNpc([31, 20], [29, 28], 5, true);

    expect(result.stepTiles.length).toBeGreaterThan(0);

    for (const [x, y] of result.stepTiles) {
      const onNpcTile = x >= 29 && x <= 33 && y >= 28 && y <= 32;
      expect(onNpcTile).toBe(false);
    }
  });

  it('corner exclusion for melee - chooses closer diagonal option', () => {
    const result = playerMoveToNpc([25, 25], [29, 28], 5, true);

    expect(result.stepTiles.length).toBeGreaterThan(0);
    expect(result.position[0]).toBeGreaterThan(25);
    expect(result.position[1]).toBeGreaterThan(25);
  });
});
