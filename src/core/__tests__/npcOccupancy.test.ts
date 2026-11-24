import { afterEach, describe, expect, it } from 'vitest';
import { createWaveEngine } from '../../npcs/inferno/__tests__/waveFixture';
import { createBat } from '../../npcs/inferno/bat';
import { createBlob, createSplitBlob } from '../../npcs/inferno/blob';
import { enqueueEnginePendingHit } from '../../test/helpers/pendingHits';
import type { Coordinate } from '../../types/simulation';
import { setArenaConfig, setDefaultArenaConfig } from '../constants';
import {
  createNpcStepOccupancyPredicate,
  type NpcOccupant,
  npcFootprintsOverlap,
  TileOccupancy,
} from '../npcOccupancy';

// The wave engines below install their arena config module-wide.
afterEach(() => {
  setDefaultArenaConfig({ bounds: null, walkableTiles: null, collisionMap: null });
  setArenaConfig({ bounds: null, walkableTiles: null, collisionMap: null }, true);
});

describe('npcFootprintsOverlap', () => {
  it.each([
    { position: [24, 39], size: 1, overlaps: false },
    { position: [24, 39], size: 2, overlaps: true },
    { position: [25, 35], size: 1, overlaps: true },
    { position: [29, 39], size: 1, overlaps: true },
    { position: [30, 39], size: 1, overlaps: false },
    { position: [25, 40], size: 1, overlaps: false },
    { position: [24, 34], size: 7, overlaps: true },
  ] satisfies readonly {
    position: Coordinate;
    size: number;
    overlaps: boolean;
  }[])('compares the complete footprint at $position of size $size', ({ position, size, overlaps }) => {
    const jad = { position: [25, 35] satisfies Coordinate, size: 5 };

    const result = npcFootprintsOverlap({ position, size }, jad);

    expect(result).toBe(overlaps);
  });
});

const flagsOf = (...actors: NpcOccupant[]) => createNpcStepOccupancyPredicate(new TileOccupancy().reconcile(actors));

describe('createNpcStepOccupancyPredicate', () => {
  it.each([
    { current: [24, 39], candidate: [25, 40], eligible: false },
    { current: [24, 39], candidate: [24, 40], eligible: true },
    { current: [24, 40], candidate: [25, 40], eligible: true },
    { current: [24, 38], candidate: [25, 38], eligible: false },
  ] satisfies readonly {
    current: Coordinate;
    candidate: Coordinate;
    eligible: boolean;
  }[])('checks Jad corner geometry from $current to $candidate', ({ current, candidate, eligible }) => {
    const canStep = flagsOf({ id: 'jad', position: [25, 35], size: 5 });

    expect(canStep(current, candidate, 1)).toBe(eligible);
  });

  it.each([
    { blockerPosition: [10, 10], blockerSize: 3, eligible: true },
    { blockerPosition: [12, 10], blockerSize: 2, eligible: false },
    { blockerPosition: [13, 12], blockerSize: 1, eligible: false },
  ] satisfies readonly {
    blockerPosition: Coordinate;
    blockerSize: number;
    eligible: boolean;
  }[])('permits old overlap but rejects newly entered flags at $blockerPosition', ({
    blockerPosition,
    blockerSize,
    eligible,
  }) => {
    const canStep = flagsOf({ id: 'blocker', position: blockerPosition, size: blockerSize });

    expect(canStep([10, 10], [11, 10], 3)).toBe(eligible);
  });

  for (const deltaX of [-1, 1]) {
    for (const deltaY of [-1, 1]) {
      for (const size of [1, 2, 3]) {
        it.each([
          'horizontal',
          'vertical',
        ] as const)(`uses size-${size} corner semantics for ${deltaX},${deltaY} %s intermediate`, (axis) => {
          const edgeX = deltaX > 0 ? 10 + size : 9;
          const edgeY = deltaY > 0 ? 10 + size : 9;
          const trailingX = deltaX > 0 ? 10 : 10 + size - 1;
          const trailingY = deltaY > 0 ? 10 : 10 + size - 1;
          const position: Coordinate = axis === 'horizontal' ? [edgeX, trailingY] : [trailingX, edgeY];
          const canStep = flagsOf({ id: 'blocker', position, size: 1 });

          expect(canStep([10, 10], [10 + deltaX, 10 + deltaY], size)).toBe(size > 1);
        });
        it(`blocks the destination corner for size ${size} and ${deltaX},${deltaY}`, () => {
          const canStep = flagsOf({
            id: 'blocker',
            position: [deltaX > 0 ? 10 + size : 9, deltaY > 0 ? 10 + size : 9],
            size: 1,
          });

          expect(canStep([10, 10], [10 + deltaX, 10 + deltaY], size)).toBe(false);
        });
      }
    }
  }

  it.each([
    { name: 'a non-blocking actor', actor: { id: 'flare', blocksNpcMovement: false }, eligible: true },
    { name: 'a dying NPC', actor: { id: 'corpse', alive: false }, eligible: false },
  ])('enters the tiles of $name: $eligible', ({ actor, eligible }) => {
    const canStep = flagsOf({ ...actor, position: [11, 10], size: 1 });

    expect(canStep([10, 10], [11, 10], 1)).toBe(eligible);
  });
});

describe('TileOccupancy', () => {
  it('reconciles a new actor, a placement, a non-blocking actor and one gone from the world', () => {
    const occupancy = new TileOccupancy();
    const actor: { id: string; position: Coordinate; size: number; blocksNpcMovement?: boolean } = {
      id: 'npc',
      position: [11, 10],
      size: 2,
    };
    const actors = [actor];
    occupancy.reconcile(actors);
    const spawned = [occupancy.isBlocked(12, 11), occupancy.isBlocked(13, 10)];
    actor.position = [20, 20];
    occupancy.reconcile(actors);
    const placed = [occupancy.isBlocked(11, 10), occupancy.isBlocked(21, 21)];
    actor.blocksNpcMovement = false;
    occupancy.reconcile(actors);
    const nonBlocking = occupancy.isBlocked(21, 21);
    actor.blocksNpcMovement = true;
    occupancy.reconcile(actors);
    occupancy.reconcile([]);

    expect([spawned, placed, nonBlocking, occupancy.isBlocked(20, 20)]).toEqual([
      [true, false],
      [false, true],
      false,
      false,
    ]);
  });

  // Inferno: 11/11 captured Yt-HurKot stacks follow a stack partner or a player run leaving the tile
  // (P t9830 run, t9831 stack; Q t4841 run, t4842 stack; Q t4843 42594 leaves 42597's tile).
  it('clears a tile its leaver shared, so a stacked actor no longer blocks there', () => {
    const occupancy = new TileOccupancy();
    const stayer = { id: 'stayer', position: [11, 10] satisfies Coordinate, size: 1 };
    const leaver = { id: 'leaver', position: [11, 10] satisfies Coordinate, size: 1 };
    occupancy.reconcile([stayer, leaver]);
    const canStep = createNpcStepOccupancyPredicate(occupancy);
    const before = canStep([10, 10], [11, 10], 1);

    occupancy.step(leaver, [11, 10], [12, 10]);
    leaver.position = [12, 10];
    occupancy.reconcile([stayer, leaver]);

    expect([before, canStep([10, 10], [11, 10], 1), canStep([13, 10], [12, 10], 1)]).toEqual([false, true, false]);
  });

  it("clears every tile of a run, the middle one included, as the player's steps pass", () => {
    const occupancy = new TileOccupancy();
    const npc = { id: 'npc', position: [11, 10] satisfies Coordinate, size: 1 };
    const player = { id: 'player', position: [10, 10] satisfies Coordinate, size: 1 };
    occupancy.reconcile([npc, player]);

    occupancy.step(player, [10, 10], [11, 10]);
    occupancy.step(player, [11, 10], [12, 10]);

    expect([occupancy.isBlocked(10, 10), occupancy.isBlocked(11, 10), occupancy.isBlocked(12, 10)]).toEqual([
      false,
      false,
      true,
    ]);
  });

  it('applies adds and removals in mutation order, so a later removal clears tiles an earlier spawn set', () => {
    const occupancy = new TileOccupancy();
    const parent = { id: 'parent', position: [10, 10] satisfies Coordinate, size: 3 };
    const overlapper = { id: 'overlapper', position: [11, 11] satisfies Coordinate, size: 2 };
    const child = { id: 'child', position: [11, 12] satisfies Coordinate, size: 1 };
    occupancy.add(parent);
    occupancy.add(overlapper);

    occupancy.remove(parent);
    occupancy.add(child);
    const afterSplit = occupancy.isBlocked(11, 12);
    occupancy.remove(overlapper);

    expect([afterSplit, occupancy.isBlocked(11, 12)]).toEqual([true, false]);
  });

  it('ignores the steps of an actor that sets no flags', () => {
    const occupancy = new TileOccupancy();
    const npc = { id: 'npc', position: [11, 10] satisfies Coordinate, size: 1 };
    occupancy.reconcile([npc]);

    occupancy.step({ id: 'flare', position: [11, 10], size: 1, blocksNpcMovement: false }, [11, 10], [12, 10]);

    expect([occupancy.isBlocked(11, 10), occupancy.isBlocked(12, 10)]).toEqual([true, false]);
  });
});

describe('entity collision flags through the engine', () => {
  it('clears the tiles of a held NPC the player walks over, leaving the rest of its footprint flagged', () => {
    const bat = createBat({ id: 'bat', position: [12, 10], spawnTick: 0, targetId: 'player' });
    bat.debuffs = { boundFromTick: 0, boundUntilTick: 100_000 };
    const { world, player, advanceTo } = createWaveEngine([bat], { startPos: [15, 10] });
    advanceTo(6, () => [10, 10]);

    expect(player.position).toEqual([10, 10]);
    expect(bat.position).toEqual([12, 10]);
    expect([12, 13].map((x) => [world.occupancy.isBlocked(x, 10), world.occupancy.isBlocked(x, 11)])).toEqual([
      [false, true],
      [false, true],
    ]);
  });
});

describe('removal and spawn order through the engine', () => {
  // A Jal-Ak and an overlapping bat die together and are removed on one tick, Jal-Ak first (its children
  // are added in its turn, just before it leaves), then the bat. Applied in that order, Mej's birth tile
  // ends up clear; applying the removals before the additions would leave it flagged.
  it('lets a later NPC enter a split child tile that a later-turn removal cleared', () => {
    const blob = createBlob({ id: 'blob', position: [6, 10], spawnTick: 0, targetId: 'player' });
    const bat = createBat({ id: 'bat', position: [8, 11], spawnTick: 0, targetId: 'player' });
    const follower = createSplitBlob({
      id: 'follower',
      position: [9, 12],
      spawnTick: 0,
      targetId: 'player',
      species: 'blob_melee',
    });
    const { engine, world, removals, advanceTo } = createWaveEngine([blob, bat, follower], {
      startPos: [2, 12],
      spawnSplits: true,
    });
    for (const held of [blob, bat]) held.debuffs = { boundFromTick: 0, boundUntilTick: 100_000 };
    advanceTo(2);
    const killTick = engine.currentTick + 1;
    for (const target of [blob, bat])
      enqueueEnginePendingHit(engine, {
        sourceId: 'player',
        targetId: target.id,
        style: 'typeless',
        attackKind: 'typeless',
        launchTick: engine.currentTick,
        impactTick: killTick,
        rolledDamage: target.vitals.hp,
        accuracySucceeded: true,
      });
    const removalTick = killTick + 3;
    follower.debuffs = { boundFromTick: 0, boundUntilTick: removalTick };
    advanceTo(removalTick);

    expect(removals.map(({ actorId, tick }) => [actorId, tick])).toEqual([
      ['blob', removalTick],
      ['bat', removalTick],
    ]);
    expect(world.getNpc('blob_blob_mage')?.position).toEqual([8, 12]);
    expect(follower.position).toEqual([8, 12]);
  });
});

describe('corpse occupancy through the engine', () => {
  // Inferno 1-68 wave 59 (P:140314-140366): bat 40607 is killed at 7684, starts its death sequence at
  // 7685 and is removed at 7687; the bat beside it enters those tiles on 7687, not before.
  it('keeps a dying bat blocking the bat behind it until the tick it is removed', () => {
    const corpse = createBat({ id: 'corpse', position: [12, 10], spawnTick: 0, targetId: 'player' });
    const follower = createBat({ id: 'follower', position: [10, 10], spawnTick: 0, targetId: 'player' });
    // Held in place, so the only way east for the follower is through its tiles.
    corpse.debuffs = { boundFromTick: 0, boundUntilTick: 100_000 };
    const { engine, removals, advanceTo } = createWaveEngine([corpse, follower], { startPos: [20, 10] });
    advanceTo(3);
    expect(follower.position).toEqual([10, 10]);

    const killTick = engine.currentTick + 1;
    enqueueEnginePendingHit(engine, {
      sourceId: 'player',
      targetId: corpse.id,
      style: 'typeless',
      attackKind: 'typeless',
      launchTick: engine.currentTick,
      impactTick: killTick,
      rolledDamage: corpse.vitals.hp,
      accuracySucceeded: true,
    });
    const positions: [number, Coordinate][] = [];
    while (engine.currentTick < killTick + 3) {
      advanceTo(engine.currentTick + 1);
      positions.push([engine.currentTick, [...follower.position]]);
    }

    expect(corpse.alive).toBe(false);
    expect(corpse.deathAnimationTick).toBe(killTick + 1);
    expect(removals.map(({ actorId, tick }) => [actorId, tick])).toEqual([['corpse', killTick + 3]]);
    expect(positions).toEqual([
      [killTick, [10, 10]],
      [killTick + 1, [10, 10]],
      [killTick + 2, [10, 10]],
      [killTick + 3, [11, 10]],
    ]);
  });
});
