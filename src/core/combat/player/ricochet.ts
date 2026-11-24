import { getEquipmentCombatBaseId } from '../../../data/equipmentCombatFamilies';
import type { Coordinate } from '../../../types/simulation';
import type { NpcActor } from '../../actors/NpcActor';
import { canReceiveNewAttack } from '../../npcDeath';
import { hasLineOfSight } from '../distance';
import type { FloorRatio } from '../playerAttackTypes';

/**
 * The charged Venator bow's ricochet, as the game has run it since the 19 August 2026 update
 * (Summer Sweep Up: it "find[s] new targets more reliably", /w/Venator_bow rev 15345156 § Changes).
 *
 * Evidence, by capture:
 * - post-update, authoritative: `colosseum-waves-1-12-...` and
 *   `colosseum-waves-bees-death(no-sol)-1`, 78 shots and 116 hops;
 * - pre-update, reference only: `colosseum-no-sol`, 46 shots and 74 hops.
 * The wiki's tile rules date from May 2025, before the update.
 *
 * Projectiles, timing and hit delays did not change. Two things did: reaching a 3x3 or larger target
 * needs only its center tile now (6 post-update hops break the old rule; it fits all 74 earlier
 * hops and explains both earlier untaken bounces), and the choice among several candidates went from
 * no visible preference (5/12) to the most recently allocated NPC (23/26).
 *
 * Each hop's hit lands as that hop's projectile LEAVES, `hitDelayFromEndTime(startCycles)`: VERIFIED
 * post-update, the first hop with the primary hit (64/66 splat on T+2) and the second a tick later
 * (47/50 on T+3, including every one of the 37 that returned to the primary target).
 */
const RICOCHET_WEAPON_BASE_IDS: ReadonlySet<number> = new Set([27610]);

/** Wiki: "bouncing up to two other nearby monsters"; 50/78 post-update shots bounced twice. */
export const RICOCHET_MAX_HOPS = 2;

/**
 * VERIFIED post-update: the next target's center tile ({@link ricochetOrigin}) is within 2 tiles of
 * the previous target's center, or of any of a 2x2's tiles ({@link ricochetSearchTiles}), with line
 * of sight between the centers (the arena's pillars block it). Every one of the 116 hops taken fits,
 * and no hop slot that went unused (28) had such a candidate. Line of sight alone accounts for the
 * 3 unused slots that range alone would fill, and for the 3 choices where the highest-index candidate
 * (the same Serpent shaman, waves-bees ticks 2727-2735) was passed over.
 *
 * Before the update a 3x3 target also needed its south-west tile in reach (the wiki's obsolete
 * table): that fits all 74 earlier hops and explains both earlier unused slots, but 6 post-update
 * hops (1x1 into 3x3, 2x2 Bees into 5x5 Sol) break it. No hop between two 3x3s is captured either way.
 */
export const RICOCHET_RADIUS_TILES = 2;

/** Wiki: the bounced hits "both have a max hit equal to two-thirds of the original max hit, rounded down". */
export const RICOCHET_MAX_HIT_SCALE: FloorRatio = { numerator: 2, denominator: 3 };

/**
 * VERIFIED 116/116 post-update hops: `nex_finale_attack_proj` (2007) leaves as the previous projectile
 * lands and flies 15 cycles at any hop length (1-3 tiles).
 */
export const RICOCHET_FLIGHT_CYCLES = 15;

export function hasRicochet(weaponId: number | undefined): boolean {
  return weaponId !== undefined && RICOCHET_WEAPON_BASE_IDS.has(getEquipmentCombatBaseId(weaponId));
}

/**
 * An actor's center tile, `south-west + floor((size - 1) / 2)`: where a hop leaves from (VERIFIED,
 * the source tile of all 116 post-update hops) and the tile a hop must reach (a 2x2's is its
 * south-west tile; its north-east one rejects 7 post-update hops).
 */
export function ricochetOrigin(actor: Pick<NpcActor, 'position' | 'size'>): Coordinate {
  const offset = Math.floor((actor.size - 1) / 2);
  return [actor.position[0] + offset, actor.position[1] + offset];
}

/**
 * The tiles a hop measures its reach from: the center tile, or for an even size the middle 2x2. All
 * four tiles of a 2x2 count: one post-update hop needs it (waves-bees tick 2816, a Jaguar warrior to
 * a Javelin Colossus 3 tiles from its south-west tile). MODEL for 4x4: none is captured.
 */
export function ricochetSearchTiles(actor: Pick<NpcActor, 'position' | 'size'>): readonly Coordinate[] {
  if (actor.size % 2 === 1) return [ricochetOrigin(actor)];
  const [x, y] = [actor.position[0] + actor.size / 2 - 1, actor.position[1] + actor.size / 2 - 1];
  return [
    [x, y],
    [x + 1, y],
    [x, y + 1],
    [x + 1, y + 1],
  ];
}

export function isRicochetReachable(
  sender: Pick<NpcActor, 'position' | 'size'>,
  candidate: Pick<NpcActor, 'position' | 'size'>,
): boolean {
  const [targetX, targetY] = ricochetOrigin(candidate);
  const inRange = ricochetSearchTiles(sender).some(
    ([x, y]) => Math.max(Math.abs(x - targetX), Math.abs(y - targetY)) <= RICOCHET_RADIUS_TILES,
  );
  const [originX, originY] = ricochetOrigin(sender);
  return inRange && hasLineOfSight(originX, originY, targetX, targetY);
}

/**
 * Which of several reachable candidates a hop takes. VERIFIED post-update: the one with the highest
 * NPC index, 23 of 26 choices (a uniform pick expects 12.7; p = 2e-5); pre-update it matched 5 of 12
 * (uniform 6). No distance measure does better: nearest center tile, ties to the highest index,
 * matches 22/26, and every distance or player-relative rule alone does worse.
 * The misses: a Healing totem already in its heal-and-despawn sequence (tick 1171), and two unexplained
 * (ticks 2048 and 3671, each beside a Healing totem). The simulator has no NPC indices, so MODEL: the
 * most recently spawned candidate. Latest spawn tick, ties by highest index, makes the same pick as
 * highest index in all 26 captured choices; among same-tick spawns the later-registered NPC stands in
 * for the game's index order, which the simulator cannot know. Listed with the other index-order gaps
 * in docs/architecture/npc-behaviors.md#npc-index-order-not-modeled.
 */
function latestAllocated(eligible: readonly NpcActor[]): NpcActor | undefined {
  let best: NpcActor | undefined;
  for (const candidate of eligible) {
    if (best === undefined || (candidate.spawnTick ?? -Infinity) >= (best.spawnTick ?? -Infinity)) best = candidate;
  }
  return best;
}

/**
 * The hops after the primary target, chosen together when the shot is fired (all three projectiles
 * are sent on the launch tick). The first hop never returns to the primary target; the second may,
 * but never stays on the first hop's target and never returns to a primary the shot's own arrow
 * kills: VERIFIED post-update, 0 returns after 30 lethal primary arrows, against 37 returns to
 * survivors; the first hop still flies after a lethal arrow (24/30), as the wiki says it can.
 *
 * `candidates` must be in spawn order (the world's NPC order), which breaks same-tick ties.
 */
export function selectRicochetTargets(
  primary: NpcActor,
  candidates: readonly NpcActor[],
  primaryKilled = false,
): readonly NpcActor[] {
  const hops: NpcActor[] = [];
  let sender = primary;
  for (let hop = 0; hop < RICOCHET_MAX_HOPS; hop++) {
    const from = sender;
    const next = latestAllocated(
      candidates.filter(
        (candidate) =>
          canReceiveNewAttack(candidate) &&
          candidate.id !== from.id &&
          (candidate.id !== primary.id || (hop > 0 && !primaryKilled)) &&
          isRicochetReachable(from, candidate),
      ),
    );
    if (next === undefined) break;
    hops.push(next);
    sender = next;
  }
  return hops;
}

/** A hop leaves as the previous projectile arrives, cycles counted from the launch tick. */
export function ricochetStartCycles(primaryEndCycles: number, hop: number): number {
  return primaryEndCycles + hop * RICOCHET_FLIGHT_CYCLES;
}
