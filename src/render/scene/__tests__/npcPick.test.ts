import { describe, expect, it } from 'vitest';
import type { Coordinate } from '../../../types/simulation';
import { type NpcActorResolver, pickNpcsAtScreen, type Ray3D, screenNpcModelHitDepth } from '../npcPick';
import type { NpcHitTestData } from '../types';

const IDENTITY = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
const VIEW = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, -5, 1];
const WIDTH = 800;
const HEIGHT = 600;
const CENTER = { x: WIDTH / 2, y: HEIGHT / 2 };

const RAY: Ray3D = { origin: { x: 0, y: 0, z: 5 }, direction: { x: 0, y: 0, z: -1 } };

interface EntryOpts {
  /** World-space z translation (controls pick depth; nearer = larger tz). */
  tz?: number;
  vertexZ?: number | readonly [number, number];
  /** Per-face color layer; -2 marks an invisible (unclickable) face. */
  faceColors3?: Int32Array | null;
  behindCamera?: boolean;
}

function makeCenterEntry(
  actorId: string,
  { tz = 0, vertexZ = 0, faceColors3 = null, behindCamera = false }: EntryOpts = {},
): { actorId: string; hitTestData: NpcHitTestData } {
  const scale = 1 / 128;
  const w15 = behindCamera ? -1 : 1;
  const modelMatrix = new Float32Array([scale, 0, 0, 0, 0, scale, 0, 0, 0, 0, scale, 0, 0, 0, tz, w15]);
  const hasTwoFaces = typeof vertexZ !== 'number';
  const verticesX = hasTwoFaces ? [-50, 50, 0, -50, 50, 0] : [-50, 50, 0];
  const verticesY = hasTwoFaces ? [-50, -50, 50, -50, -50, 50] : [-50, -50, 50];
  const verticesZ = hasTwoFaces
    ? [vertexZ[0], vertexZ[0], vertexZ[0], vertexZ[1], vertexZ[1], vertexZ[1]]
    : [vertexZ, vertexZ, vertexZ];
  return {
    actorId,
    hitTestData: {
      verticesX: new Int32Array(verticesX),
      verticesY: new Int32Array(verticesY),
      verticesZ: new Int32Array(verticesZ),
      verticesCount: verticesZ.length,
      indices1: new Int32Array(hasTwoFaces ? [0, 3] : [0]),
      indices2: new Int32Array(hasTwoFaces ? [1, 4] : [1]),
      indices3: new Int32Array(hasTwoFaces ? [2, 5] : [2]),
      faceCount: hasTwoFaces ? 2 : 1,
      faceColors3,
      modelMatrix,
    },
  };
}

const identityResolver: NpcActorResolver = (rawActorId) => ({
  actorId: rawActorId,
  npcTypeId: 100,
  position: [1, 2] as Coordinate,
});

function pick(
  screenPx: { x: number; y: number },
  entries: Array<{ actorId: string; hitTestData: NpcHitTestData }>,
  resolver: NpcActorResolver = identityResolver,
) {
  return pickNpcsAtScreen(screenPx, RAY, entries, VIEW, IDENTITY, WIDTH, HEIGHT, resolver)[0] ?? null;
}

describe('pickNpcsAtScreen nearest hit', () => {
  it('picks an NPC whose animated model covers the cursor', () => {
    const picked = pick(CENTER, [makeCenterEntry('npc-a')]);
    expect(picked?.actorId).toBe('npc-a');
    expect(picked?.npcTypeId).toBe(100);
  });

  it('returns null when the cursor is off the model', () => {
    expect(pick({ x: 40, y: 40 }, [makeCenterEntry('npc-a')])).toBeNull();
  });

  it('returns the nearest NPC when several overlap on screen', () => {
    const entries = [makeCenterEntry('far', { tz: 0 }), makeCenterEntry('near', { tz: 2 })];
    expect(pick(CENTER, entries)?.actorId).toBe('near');
    expect(pick(CENTER, [entries[1], entries[0]])?.actorId).toBe('near');
  });

  it('ignores faces marked invisible (faceColors3 === -2)', () => {
    const entry = makeCenterEntry('hidden', { faceColors3: new Int32Array([-2]) });
    expect(pick(CENTER, [entry])).toBeNull();
  });

  it('ignores faces whose vertices are behind the camera', () => {
    const entry = makeCenterEntry('behind', { behindCamera: true });
    expect(pick(CENTER, [entry])).toBeNull();
  });

  it('remaps the primary-npc singleton id to the sim boss identity', () => {
    const bossResolver: NpcActorResolver = (rawActorId) =>
      rawActorId === 'primary-npc' ? { actorId: 'test-boss', npcTypeId: 1234, position: [31, 36] as Coordinate } : null;
    const picked = pick(CENTER, [makeCenterEntry('primary-npc')], bossResolver);
    expect(picked?.actorId).toBe('test-boss');
    expect(picked?.npcTypeId).toBe(1234);
    expect(picked?.position).toEqual([31, 36]);
  });

  it('skips a hit whose actor cannot be resolved and falls through to a resolvable one', () => {
    const resolver: NpcActorResolver = (rawActorId) =>
      rawActorId === 'ghost' ? null : { actorId: rawActorId, npcTypeId: 7, position: [0, 0] as Coordinate };
    const entries = [makeCenterEntry('ghost', { tz: 4 }), makeCenterEntry('real', { tz: 0 })];
    expect(pick(CENTER, entries, resolver)?.actorId).toBe('real');
  });
});

describe('screenNpcModelHitDepth', () => {
  it('returns the nearest integer depth among every hit face', () => {
    const entry = makeCenterEntry('layered', { vertexZ: [480, 512] });

    expect(screenNpcModelHitDepth(CENTER, entry.hitTestData, VIEW, IDENTITY, WIDTH, HEIGHT)).toBe(20550);
  });
});

function pickAll(
  screenPx: { x: number; y: number },
  entries: Array<{ actorId: string; hitTestData: NpcHitTestData }>,
  resolver: NpcActorResolver = identityResolver,
) {
  return pickNpcsAtScreen(screenPx, RAY, entries, VIEW, IDENTITY, WIDTH, HEIGHT, resolver);
}

describe('pickNpcsAtScreen', () => {
  it('orders overlapping NPCs by the nearest hit face instead of the model origin', () => {
    const picked = pickAll(CENTER, [
      makeCenterEntry('near-face', { tz: 0, vertexZ: 512 }),
      makeCenterEntry('near-origin', { tz: 2, vertexZ: -512 }),
    ]);

    expect(picked.map((hit) => hit.actorId)).toEqual(['near-face', 'near-origin']);
  });

  it('returns every stacked NPC under the cursor, nearest first', () => {
    const picked = pickAll(CENTER, [
      makeCenterEntry('far', { tz: 0 }),
      makeCenterEntry('near', { tz: 2 }),
      makeCenterEntry('mid', { tz: 1 }),
    ]);
    expect(picked.map((hit) => hit.actorId)).toEqual(['near', 'mid', 'far']);
  });

  it('distinguishes tile-space depths before truncating in client units', () => {
    const picked = pickAll(CENTER, [
      makeCenterEntry('farther', { vertexZ: 480 }),
      makeCenterEntry('nearer', { vertexZ: 512 }),
    ]);
    expect(picked.map((hit) => hit.actorId)).toEqual(['nearer', 'farther']);
    expect(picked.map((hit) => hit.distance)).toEqual([20550, 29766]);
  });

  it('keeps scene order for a genuine equal integer client-depth tie', () => {
    const picked = pickAll(CENTER, [
      makeCenterEntry('first', { vertexZ: 512 }),
      makeCenterEntry('second', { tz: 1 / 65536, vertexZ: 512 }),
    ]);
    expect(picked.map((hit) => hit.actorId)).toEqual(['first', 'second']);
    expect(picked.map((hit) => hit.distance)).toEqual([20550, 20550]);
  });

  it('excludes NPCs the cursor misses', () => {
    const picked = pickAll(CENTER, [
      makeCenterEntry('visible'),
      makeCenterEntry('hidden', { faceColors3: new Int32Array([-2]) }),
      makeCenterEntry('behind', { behindCamera: true }),
    ]);
    expect(picked.map((hit) => hit.actorId)).toEqual(['visible']);
  });

  it('returns an empty array when nothing is under the cursor', () => {
    expect(pickAll({ x: 40, y: 40 }, [makeCenterEntry('npc-a')])).toEqual([]);
  });

  it('collapses entries resolving to one actor, keeping its nearest hit', () => {
    const bossResolver: NpcActorResolver = () => ({
      actorId: 'test-boss',
      npcTypeId: 1234,
      position: [31, 36] as Coordinate,
    });
    const picked = pickAll(
      CENTER,
      [makeCenterEntry('primary-npc', { tz: 0 }), makeCenterEntry('test-boss', { tz: 2 })],
      bossResolver,
    );
    expect(picked).toHaveLength(1);
    expect(picked[0]?.distance).toBe(151622);
  });

  it('puts the same NPC on top as the nearest-hit helper', () => {
    const entries = [makeCenterEntry('far', { tz: 0 }), makeCenterEntry('near', { tz: 2 })];
    expect(pickAll(CENTER, entries)[0]?.actorId).toBe(pick(CENTER, entries)?.actorId);
  });
});

function makeSmallEntry(
  actorId: string,
  { useBoundingBox = false, tz = 0 }: { useBoundingBox?: boolean; tz?: number } = {},
): { actorId: string; hitTestData: NpcHitTestData } {
  const scale = 1 / 128;
  return {
    actorId,
    hitTestData: {
      verticesX: new Int32Array([0, 10, 0]),
      verticesY: new Int32Array([0, 0, 10]),
      verticesZ: new Int32Array([0, 0, 0]),
      verticesCount: 3,
      indices1: new Int32Array([0]),
      indices2: new Int32Array([1]),
      indices3: new Int32Array([2]),
      faceCount: 1,
      faceColors3: null,
      modelMatrix: new Float32Array([scale, 0, 0, 0, 0, scale, 0, 0, 0, 0, scale, 0, 0, 0, tz, 1]),
      useBoundingBox,
    },
  };
}

describe('size-1 NPC bounding-box clickbox', () => {
  const BESIDE_MODEL = { x: 520, y: 300 };
  const OUTSIDE_BOX = { x: 600, y: 300 };

  it('picks a one-tile NPC anywhere inside its projected bounding box', () => {
    // The client returns the AABB itself as the clickbox for a bounding-box model
    // (RuneLite `Perspective.getClickbox`), so a cursor nowhere near a face still hits.
    expect(pick(BESIDE_MODEL, [makeSmallEntry('healer', { useBoundingBox: true })])?.actorId).toBe('healer');
  });

  it('keeps the per-face clickbox for an NPC larger than one tile', () => {
    expect(pick(BESIDE_MODEL, [makeSmallEntry('jad')])).toBeNull();
  });

  it('still misses a one-tile NPC outside its padded box', () => {
    expect(pick(OUTSIDE_BOX, [makeSmallEntry('healer', { useBoundingBox: true })])).toBeNull();
  });

  it('gives a one-tile NPC no priority over a nearer NPC it overlaps', () => {
    // Both cover the center; the boss is nearer, so it still heads the menu. The box
    // widens WHERE a small NPC can be hit, never WHICH NPC wins a stack.
    const picked = pickAll(CENTER, [
      makeSmallEntry('healer', { useBoundingBox: true }),
      makeCenterEntry('boss', { tz: 2 }),
    ]);
    expect(picked.map((hit) => hit.actorId)).toEqual(['boss', 'healer']);
  });
});
