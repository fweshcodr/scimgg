import type { NpcActor } from '../../core/actors/NpcActor';
import type { NpcFormulaStats } from '../../core/actors/types';
import type { ArenaConfig } from '../../core/arena/ArenaConfig';
import type { CollisionLocPlacement } from '../../core/arena/collisionSpec';
import type { NpcAttackRequest } from '../../core/encounters/types';
import { isNpcLiving } from '../../core/npcDeath';
import { createNpcDefinition, type NpcDefinitionContext } from '../../core/npcs';
import type { WorldState } from '../../core/WorldState';
import { CollisionFlag } from '../../rs/collision/CollisionFlag';
import { createCollisionMap, overlayCollisionMap } from '../../rs/collision/WalkabilityAnalyzer';
import type { Coordinate } from '../../types/simulation';
import { INFERNO_PILLAR_COLLAPSE_NPC_ID, INFERNO_PILLAR_NPC_ID } from './constants';

export type PillarKey = 'west' | 'south' | 'northEast';

export interface InfernoPillar {
  readonly key: PillarKey;
  readonly locId: number;
  /** SW anchor of the 3x3 LOC and of its proxy NPC. */
  readonly position: Coordinate;
}

/** P:254-259; loc placement shape 10 rotation 0. Cache: 3x3, clipType 1, blocks projectiles. */
export const INFERNO_PILLARS: readonly InfernoPillar[] = [
  { key: 'west', locId: 30353, position: [17, 37] },
  { key: 'south', locId: 30354, position: [27, 23] },
  { key: 'northEast', locId: 30355, position: [34, 39] },
];

/** For the cache collision bake; `composePillarArena` then opens collapsed ones at runtime. */
export const INFERNO_PILLAR_COLLISION_LOCS: readonly CollisionLocPlacement[] = INFERNO_PILLARS.map((pillar) => ({
  locId: pillar.locId,
  localX: pillar.position[0],
  localY: pillar.position[1],
  rotation: 0,
  type: 10,
  level: 0,
}));

export const PILLAR_SIZE = 3;
/** The damage varbits count to 255 (Q:52473-52495); https://oldschool.runescape.wiki/w/Rocky_support. */
export const PILLAR_MAX_HP = 255;
/** 7710 removal after the collapse: +2 natural (Q:52535), +3 scripted end of wave 66 (P:175832-175834). */
export const PILLAR_COLLAPSE_REMOVAL_TICKS = { natural: 2, scripted: 3 } as const;

/** The intact LOC blocks movement and line of sight (cache clipType 1, blocksProjectile). */
const PILLAR_FLAGS = CollisionFlag.OBJECT | CollisionFlag.OBJECT_PROJECTILE_BLOCKER;
const COLLISION_MAP_SIZE = 64;

/**
 * Same zero-bonus, level-one defence model as Zuk's glyph: the support has no published combat
 * stats, and only nibblers attack it.
 */
const PILLAR_FORMULA_STATS = {
  levels: { attack: 1, strength: 1, defence: 1, ranged: 1, magic: 1 },
  offensive: { atk: 0, ranged: 0, magic: 0, str: 0, rangedStr: 0, magicStr: 0 },
  defensive: { stab: 0, slash: 0, crush: 0, rangedLight: 0, rangedStandard: 0, rangedHeavy: 0, magic: 0 },
  attributes: [],
} as const satisfies NpcFormulaStats;

export function pillarFootprint(pillar: InfernoPillar): Coordinate[] {
  const tiles: Coordinate[] = [];
  for (let dx = 0; dx < PILLAR_SIZE; dx++) {
    for (let dy = 0; dy < PILLAR_SIZE; dy++) tiles.push([pillar.position[0] + dx, pillar.position[1] + dy]);
  }
  return tiles;
}

/**
 * The installed arena: `base` with each intact pillar's footprint blocked and each collapsed one open.
 *
 * Both directions are applied so the result does not depend on whether `base` was baked with the
 * pillars (the cache bake declares them as dynamic locs) or without them (a hand-built arena). A null
 * walkable set stays null: it means "unbounded", which the collision map alone then constrains.
 */
export function composePillarArena(base: ArenaConfig, intact: ReadonlySet<PillarKey>): ArenaConfig {
  // Nothing standing and no baked collision to open (a cache-less arena from wave 67 on, as wave 69's
  // practice starts): keep the base rather than inventing an empty collision map, which the engine
  // reads differently from none.
  if (intact.size === 0 && base.collisionMap === null) return base;
  // An overlay, not a flag copy: the base keeps its own coordinate origin (a block map spans
  // neighboring squares from -64), and only the pillar tiles change.
  const collisionMap = base.collisionMap
    ? overlayCollisionMap(base.collisionMap)
    : createCollisionMap(COLLISION_MAP_SIZE, COLLISION_MAP_SIZE);
  const walkableTiles = base.walkableTiles ? new Set(base.walkableTiles) : null;
  for (const pillar of INFERNO_PILLARS) {
    const standing = intact.has(pillar.key);
    for (const [x, y] of pillarFootprint(pillar)) {
      if (standing) {
        collisionMap.flag(x, y, PILLAR_FLAGS);
        walkableTiles?.delete(`${x},${y}`);
      } else {
        collisionMap.unflag(x, y, PILLAR_FLAGS);
        walkableTiles?.add(`${x},${y}`);
      }
    }
  }
  return { bounds: base.bounds, walkableTiles, collisionMap };
}

type PillarProxyState = { readonly pillar: PillarKey };
type PillarProxyConfig = {
  /** The proxy reached 0 HP: the encounter collapses its pillar. */
  readonly collapse: (pillar: PillarKey, context: NpcDefinitionContext) => void;
};

/** NPC 7709 `inferno_invisible_3x3`: the invisible target nibblers hit (P:520-530). */
export const pillarProxyDefinition = createNpcDefinition<PillarProxyState, PillarProxyConfig>({
  id: 'inferno-rocky-support',
  move: false,
  onDamageResolved: ({ actor, damage, config, context }) => {
    if (damage.hpBefore > 0 && damage.hpAfter <= 0) config.collapse(actor.state.pillar, context);
  },
});

type PillarCollapseState = { readonly pillar: PillarKey; readonly removeAt: number };

/** NPC 7710 `inferno_safespot_dying`: plays the collapse seq where the pillar stood until `removeAt`. */
export const pillarCollapseDefinition = createNpcDefinition<PillarCollapseState, undefined>({
  id: 'inferno-rocky-support-collapse',
  move: false,
});

function touchesFootprint(npc: NpcActor, anchor: Coordinate): boolean {
  const [ax, ay] = anchor;
  return (
    npc.position[0] <= ax + PILLAR_SIZE &&
    npc.position[0] + npc.size >= ax &&
    npc.position[1] <= ay + PILLAR_SIZE &&
    npc.position[1] + npc.size >= ay
  );
}

/**
 * The collapse's hits, chosen at the moment of collapse so a victim cannot step away from them: each
 * living nibbler touching the footprint takes its remaining HP (policy: nibblers only). Delivered by
 * `source` (the 7710) through each victim's hit queue, so a victim whose turn already passed this
 * tick takes it next tick (Q:52483-52515: the collapsing nibbler at +1, its neighbor at +0).
 */
export function pillarCollapseHits(
  world: Readonly<WorldState>,
  pillar: InfernoPillar,
  sourceId: string,
  isNibbler: (npc: NpcActor) => boolean,
): NpcAttackRequest[] {
  return world
    .getNpcs()
    .filter((npc) => isNibbler(npc) && isNpcLiving(npc) && touchesFootprint(npc, pillar.position))
    .map((npc) => ({
      attackerId: sourceId,
      targetId: npc.id,
      style: 'typeless',
      attackKind: 'typeless',
      rolledDamage: npc.vitals.hp,
      accuracySucceeded: true,
      impactDelayTicks: 0,
      // The rubble is removed at +2; a hit still queued by then has already been decided.
      sourceDeathPolicy: 'persist',
    }));
}

function createStructureActor(options: {
  readonly id: string;
  readonly npcTypeId: number;
  readonly archetypeId: string;
  readonly position: Coordinate;
  readonly spawnTick: number;
  readonly hp: number;
}): NpcActor {
  return {
    id: options.id,
    kind: 'npc',
    npcTypeId: options.npcTypeId,
    archetypeId: options.archetypeId,
    size: PILLAR_SIZE,
    role: 'npc',
    alive: true,
    position: [...options.position],
    previousPosition: [...options.position],
    facing: 0,
    lockedFacing: 0,
    vitals: { hp: options.hp, maxHp: options.hp },
    history: new Map(),
    formulaStats: structuredClone(PILLAR_FORMULA_STATS),
    spawnTick: options.spawnTick,
    // Never targetable: hidden from the cursor and menus, and skipped by area attacks.
    untargetable: true,
    // The LOC is what blocks; the actor sharing its tiles must not block a second time.
    blocksNpcMovement: false,
    combat: {
      attackSpeed: 1,
      attackRange: 0,
      attackStyle: 'typeless',
      nextActionTick: 0,
      targetId: null,
      lastAttackTick: null,
      animations: { idle: null, walk: null, run: null, attack: null, death: null },
    },
  };
}

export function createPillarProxy(options: {
  readonly pillar: InfernoPillar;
  readonly id: string;
  readonly spawnTick: number;
}) {
  return pillarProxyDefinition.createActor(
    {
      ...createStructureActor({
        id: options.id,
        npcTypeId: INFERNO_PILLAR_NPC_ID,
        archetypeId: 'inferno_pillar',
        position: options.pillar.position,
        spawnTick: options.spawnTick,
        hp: PILLAR_MAX_HP,
      }),
      // Nibbler hits show their splats and its headbar (P:582-593: 4 damage, headbar fill 29 of 30).
      healthBarWhenUntargetable: true,
    },
    { pillar: options.pillar.key },
  );
}

export function createPillarCollapse(options: {
  readonly pillar: InfernoPillar;
  readonly id: string;
  readonly spawnTick: number;
  readonly removeAt: number;
}) {
  return pillarCollapseDefinition.createActor(
    createStructureActor({
      id: options.id,
      npcTypeId: INFERNO_PILLAR_COLLAPSE_NPC_ID,
      archetypeId: 'inferno_pillar_collapse',
      position: options.pillar.position,
      spawnTick: options.spawnTick,
      hp: 1,
    }),
    { pillar: options.pillar.key, removeAt: options.removeAt },
  );
}
