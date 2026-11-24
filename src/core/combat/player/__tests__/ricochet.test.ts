import { afterEach, describe, expect, it } from 'vitest';
import { CollisionFlag } from '../../../../rs/collision/CollisionFlag';
import type { CollisionMap } from '../../../../rs/collision/WalkabilityAnalyzer';
import type { NpcActor } from '../../../actors/NpcActor';
import { setArenaConfig } from '../../../constants';
import {
  hasRicochet,
  isRicochetReachable,
  ricochetOrigin,
  ricochetSearchTiles,
  ricochetStartCycles,
  selectRicochetTargets,
} from '../ricochet';

afterEach(() => setArenaConfig({ bounds: null, walkableTiles: null, collisionMap: null }, true));

function npc(id: string, position: readonly [number, number], size = 1, overrides: Partial<NpcActor> = {}): NpcActor {
  return { id, kind: 'npc', alive: true, position: [...position], size, ...overrides } as NpcActor;
}

const ids = (hops: readonly NpcActor[]) => hops.map(({ id }) => id);

describe('selectRicochetTargets', () => {
  it("reaches a target whose center tile is within two of the previous target's center tile", () => {
    // The 3x3's center tile is (11, 11): `near` is 2 tiles from it, `far` 3.
    const primary = npc('primary', [10, 10], 3);
    const near = npc('near', [13, 13]);
    const far = npc('far', [14, 10]);

    expect(ids(selectRicochetTargets(primary, [primary, near, far]))).toEqual(['near', 'primary']);
  });

  it('never opens on the primary target, never stays put, and may come back to the primary', () => {
    const primary = npc('primary', [10, 10]);
    const second = npc('second', [11, 10]);

    expect(ids(selectRicochetTargets(primary, [primary, second]))).toEqual(['second', 'primary']);
  });

  it('takes the most recently spawned candidate, the later-registered among same-tick spawns', () => {
    const primary = npc('primary', [10, 10], 1, { spawnTick: 1 });
    const older = npc('older', [11, 10], 1, { spawnTick: 2 });
    const newer = npc('newer', [9, 10], 1, { spawnTick: 7 });
    const sameTick = npc('same-tick', [10, 11], 1, { spawnTick: 7 });

    expect(ids(selectRicochetTargets(primary, [primary, newer, sameTick, older]))[0]).toBe('same-tick');
    expect(ids(selectRicochetTargets(primary, [primary, sameTick, newer, older]))[0]).toBe('newer');
    expect(ids(selectRicochetTargets(primary, [primary, older]))).toEqual(['older', 'primary']);
  });

  it('skips dead candidates', () => {
    const primary = npc('primary', [10, 10]);
    const dead = npc('dead', [11, 11], 1, { alive: false });

    expect(selectRicochetTargets(primary, [primary, dead])).toEqual([]);
  });

  it('never returns to a primary target its own arrow kills, though the first hop still flies', () => {
    const primary = npc('primary', [10, 10]);
    const second = npc('second', [11, 10]);

    expect(ids(selectRicochetTargets(primary, [primary, second], true))).toEqual(['second']);
  });

  it('stops with no one in reach', () => {
    const primary = npc('primary', [10, 10]);

    expect(selectRicochetTargets(primary, [primary, npc('far', [13, 10])])).toEqual([]);
  });
});

describe('isRicochetReachable', () => {
  it("measures to the next target's center tile, not its nearest tile", () => {
    // The 3x3's nearest tile is 2 from (10, 10), but its center (13, 11) is 3.
    expect(isRicochetReachable(npc('sender', [10, 10]), npc('target', [12, 10], 3))).toBe(false);
    expect(isRicochetReachable(npc('sender', [10, 10]), npc('target', [11, 10], 3))).toBe(true);
  });

  it("takes a 2x2's south-west tile as its center", () => {
    expect(isRicochetReachable(npc('sender', [10, 10]), npc('target', [12, 12], 2))).toBe(true);
    expect(isRicochetReachable(npc('sender', [10, 10]), npc('target', [7, 7], 2))).toBe(false);
  });

  it('lets a 2x2 search from all four of its tiles, as the captured Jaguar warrior did', () => {
    // waves-bees capture, tick 2816: Jaguar warrior (1819, 3112) to Javelin Colossus (1821, 3113).
    const jaguar = npc('jaguar', [1819, 3112], 2);
    const javelin = npc('javelin', [1821, 3113], 3);

    expect(ricochetSearchTiles(jaguar)).toHaveLength(4);
    expect(isRicochetReachable(jaguar, javelin)).toBe(true);
    expect(isRicochetReachable(npc('lone', [1819, 3112]), javelin)).toBe(false);
  });

  it('searches from the middle four tiles of a 4x4', () => {
    expect(ricochetSearchTiles(npc('sender', [10, 10], 4))).toEqual([
      [11, 11],
      [12, 11],
      [11, 12],
      [12, 12],
    ]);
  });

  it('needs line of sight between the center tiles', () => {
    const flags = new Int32Array(32 * 32);
    flags[11 + 10 * 32] = CollisionFlag.OBJECT_PROJECTILE_BLOCKER;
    const pillar: CollisionMap = {
      sizeX: 32,
      sizeY: 32,
      flags,
      getFlag: (x, y) => flags[x + y * 32] ?? -1,
      hasFlag: (x, y, flag) => ((flags[x + y * 32] ?? 0) & flag) !== 0,
      flag: () => undefined,
      unflag: () => undefined,
    };
    setArenaConfig({ bounds: null, walkableTiles: null, collisionMap: pillar }, true);

    expect(isRicochetReachable(npc('sender', [10, 10]), npc('behind', [12, 10]))).toBe(false);
    expect(isRicochetReachable(npc('sender', [10, 10]), npc('beside', [10, 12]))).toBe(true);
  });
});

describe('ricochetOrigin', () => {
  it('is the center tile, the south-west of the middle four for an even size', () => {
    expect([1, 2, 3, 5].map((size) => ricochetOrigin(npc('sender', [10, 10], size)))).toEqual([
      [10, 10],
      [10, 10],
      [11, 11],
      [12, 12],
    ]);
  });
});

describe('ricochet timing and scope', () => {
  it('leaves each hop as the previous projectile lands: the captured 48 -> 63 -> 78', () => {
    expect([0, 1].map((hop) => ricochetStartCycles(48, hop))).toEqual([48, 63]);
  });

  it('belongs to the charged bow and its Echo copy, not the uncharged bow', () => {
    expect([27610, 30434, 27612, 20997].map(hasRicochet)).toEqual([true, true, false, false]);
  });
});
