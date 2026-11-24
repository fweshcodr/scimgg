import { afterEach, expect, it } from 'vitest';
import { getArenaAllowUnboundedFallback, getArenaConfig, setArenaConfig } from '../../../core/constants';
import { queuedDeathAnimationTick } from '../../../core/npcDeath';
import {
  createNpcStickyPursuitState,
  type NpcStickyPursuitState,
  stickyPursuitSteps,
} from '../../../core/npcStickyPursuit';
import { findProjectCacheZip, loadColosseumWaveArena } from '../../../test/helpers/colosseumCollision';
import { REAL_CACHE_TEST_TIMEOUT_MS, skipWithoutRealCache } from '../../../test/helpers/real-cache';
import type { Coordinate } from '../../../types/simulation';
import {
  COLOSSEUM_SPOTANIMS,
  WARBAND_ARCHER_NPC_ID,
  WARBAND_BERSERKER_NPC_ID,
  WARBAND_PROJECTILES,
  WARBAND_SEER_IMPACT_HEIGHT,
  WARBAND_SEER_NPC_ID,
} from '../constants';
import {
  isWarbanderAttackPosition,
  WARBAND_ATTACK_PERIOD_TICKS,
  WARBAND_FALLBACK_OFFSETS,
  WARBAND_FIRST_MOVE_TICKS,
  WARBAND_SLOT_OFFSETS,
  WARBANDER_PROFILES,
  WARBANDER_ROLES,
  type WarbanderRole,
  warbandPursuitProfile,
} from '../warband';
import {
  type WarbandEvent as CapturedWarbandEvent,
  WARBAND_CAPTURE_FRAMES,
  WARBAND_CAPTURE_PROJECTILES,
  type WarbandFrame,
} from './fixtures/warbandCapture';

/**
 * Replays every captured warband movement decision through the production sticky pursuit, with the
 * player's start-of-tick tile and the cache's pillar collision (local origin 1792/3072).
 */
const CAPTURES = {
  noSol: 'colosseum-no-sol-packet-data.txt',
  bees: 'colosseum-waves-bees-death(no-sol)-packet-data-1.txt',
  waves: 'colosseum-waves-1-12-damage-trials-solarflare3-volatility3-bees1-totemic-doom1-death-packet-data.txt',
} as const;
const STEP: Readonly<Record<string, Coordinate>> = {
  north: [0, 1],
  south: [0, -1],
  east: [1, 0],
  west: [-1, 0],
  'north-east': [1, 1],
  'north-west': [-1, 1],
  'south-east': [1, -1],
  'south-west': [-1, -1],
};

const ROLE_BY_NPC_ID: Readonly<Record<number, WarbanderRole>> = {
  [WARBAND_BERSERKER_NPC_ID]: 'berserker',
  [WARBAND_ARCHER_NPC_ID]: 'archer',
  [WARBAND_SEER_NPC_ID]: 'seer',
};
const ATTACK_SEQS = new Set(WARBANDER_ROLES.map((role) => WARBANDER_PROFILES[role].seqs.attack));
const DEATH_SEQS = new Set(WARBANDER_ROLES.map((role) => WARBANDER_PROFILES[role].seqs.death));
const ROLE_BY_PROJECTILE: Readonly<Record<number, WarbanderRole>> = {
  [WARBAND_PROJECTILES.archer.spotAnimId]: 'archer',
  [WARBAND_PROJECTILES.seer.spotAnimId]: 'seer',
};

interface WarbandEvent extends Omit<CapturedWarbandEvent, 'seqs'> {
  readonly attackSeq: boolean;
  readonly deathSeq: boolean;
}
interface Frame {
  readonly tick: number;
  readonly playerStart: Coordinate | null;
  readonly events: readonly WarbandEvent[];
  readonly projectiles: readonly { readonly role: WarbanderRole; readonly source: Coordinate | null }[];
  /** NPC indices of the player's thralls on this tick, by tile. */
  readonly thralls: ReadonlyMap<string, number>;
  /** Thrall projectiles launched this tick: source tile and target NPC index. */
  readonly thrallShots: WarbandFrame['thrallShots'];
}

/** The extracted frames, with sequence and projectile ids resolved through the production profiles. */
function readFrames(file: keyof typeof CAPTURES): Frame[] {
  return WARBAND_CAPTURE_FRAMES[file]!.map((frame) => ({
    ...frame,
    events: frame.events.map(({ seqs, ...event }) => ({
      ...event,
      attackSeq: seqs.some((seq) => ATTACK_SEQS.has(seq)),
      deathSeq: seqs.some((seq) => DEATH_SEQS.has(seq)),
    })),
    projectiles: frame.projectiles.flatMap(({ id, source }) => {
      const role = ROLE_BY_PROJECTILE[id];
      return role ? [{ role, source }] : [];
    }),
    thralls: new Map(frame.thralls),
  }));
}

interface Observation {
  readonly start: Coordinate;
  readonly path: Coordinate[];
  readonly deadBefore: boolean;
  diedNow: boolean;
  attackSeq: boolean;
  projectile: boolean;
  hits: number[];
  deathSeq: boolean;
  /** On its killing tick: whether the hit queue processes its death that same tick (K), not K+1. */
  promoted: boolean;
}

/**
 * The hit-queue death rule (`docs/architecture/npc-hit-queue-and-death.md`, section 1) from what a
 * capture shows: death is processed on the killing tick K when another hit lands after the lethal one
 * in the member's pass (a trailing 0 splat), or a thrall indexed below the member — which therefore
 * acts before the member's turn — queues a hit at it that tick. Otherwise at K + 1.
 */
function promotedOnKill(observation: Observation, frame: Frame, index: number): boolean {
  const overkill = observation.hits.length >= 2 && observation.hits.at(-1) === 0;
  const thrallQueued = frame.thrallShots.some(
    (shot) =>
      shot.target === index &&
      shot.source !== null &&
      (frame.thralls.get(shot.source) ?? Number.POSITIVE_INFINITY) < index,
  );
  return overkill || thrallQueued;
}

/** Each member's killing tick, death-sequence tick and last step, to check the shared death rule. */
interface DeathRecord {
  killTick: number | null;
  promoted: boolean;
  lastStepTick: number | undefined;
  deathSequenceTick: number | null;
}

const sameTile = (a: Readonly<Coordinate>, b: Readonly<Coordinate>) => a[0] === b[0] && a[1] === b[1];
const cardinallyAdjacent = (a: Readonly<Coordinate>, b: Readonly<Coordinate>) =>
  Math.abs(a[0] - b[0]) + Math.abs(a[1] - b[1]) === 1;

/** The production attack gate on every captured tick, against what each live member did. */
interface AttackTally {
  /** Attacks seen: an attack sequence, or (seer) only its projectile. */
  launches: { sequence: number; projectileOnly: number };
  /** Attacks the gate rejects, or seen off the member's phase. */
  missed: string[];
  offPhase: string[];
  /**
   * Admitted phase ticks that were also the member's killing tick: it swings when its death is
   * processed at K + 1 (B:3356), and not when the hit queue promotes it to K (C:2142, C:2432).
   */
  killTick: { swung: string[]; promoted: string[] };
  /** Phase ticks the gate admits where what the member did is not explained by the rules. */
  falseLethal: string[];
  falseNonlethal: string[];
  /** Phase ticks with no attack that end one tile straight out from the player's start tile. */
  phaseArrivalsWithoutAttack: number;
  /** Warband projectiles not launched from a live member's start-of-tick tile. */
  unattributedProjectiles: string[];
}

function replay(file: keyof typeof CAPTURES) {
  const position = new Map<number, Coordinate>();
  const dead = new Set<number>();
  const spawnTick = new Map<number, number>();
  const slot = new Map<number, Coordinate>();
  const roles = new Map<number, WarbanderRole>();
  const routes = new Map<number, NpcStickyPursuitState>();
  const excluded = { nonContiguous: 0, dead: 0, spawnHold: 0, killedBeforeMoving: 0 };
  const deaths = new Map<number, DeathRecord>();
  const mismatches: string[] = [];
  const attacks: AttackTally = {
    launches: { sequence: 0, projectileOnly: 0 },
    missed: [],
    offPhase: [],
    killTick: { swung: [], promoted: [] },
    falseLethal: [],
    falseNonlethal: [],
    phaseArrivalsWithoutAttack: 0,
    unattributedProjectiles: [],
  };
  let scored = 0;
  let previousTick: number | null = null;
  for (const frame of readFrames(file)) {
    const contiguous = previousTick !== null && frame.tick === previousTick + 1;
    previousTick = frame.tick;
    const observations = new Map<number, Observation>();
    const seen = new Set<number>();
    const adds = frame.events.filter((event) => event.kind === 'add');
    // Formation center: one tile south of the berserker. Each member keeps its spawn offset as its slot.
    const berserker = adds.find((event) => event.npcId === WARBAND_BERSERKER_NPC_ID);
    for (const event of adds) {
      if (!berserker) throw new Error(`Warband without a berserker at ${file}:${frame.tick}`);
      slot.set(event.index, [event.coord[0] - berserker.coord[0], event.coord[1] - (berserker.coord[1] - 1)]);
      spawnTick.set(event.index, frame.tick);
      roles.set(event.index, ROLE_BY_NPC_ID[event.npcId]!);
      position.set(event.index, event.coord);
      routes.set(event.index, createNpcStickyPursuitState());
      dead.delete(event.index);
      seen.add(event.index);
    }
    for (const event of frame.events) {
      if (event.kind === 'add') continue;
      seen.add(event.index);
      if (event.kind === 'del') {
        position.delete(event.index);
        continue;
      }
      const deadBefore = dead.has(event.index);
      if (event.fill === 0) dead.add(event.index);
      let tile = event.coord;
      const path = event.kind === 'teleport' && event.newCoord ? [event.newCoord] : [];
      for (const step of event.steps) {
        tile = [tile[0] + STEP[step]![0], tile[1] + STEP[step]![1]];
        path.push(tile);
      }
      const existing = observations.get(event.index);
      if (existing) {
        existing.path.push(...path);
        existing.diedNow ||= event.fill === 0;
        existing.attackSeq ||= event.attackSeq === true;
        existing.deathSeq ||= event.deathSeq === true;
        existing.hits.push(...event.hits);
      } else
        observations.set(event.index, {
          start: event.coord,
          path,
          deadBefore,
          diedNow: event.fill === 0 && !deadBefore,
          attackSeq: event.attackSeq === true,
          projectile: false,
          hits: [...event.hits],
          deathSeq: event.deathSeq === true,
          promoted: false,
        });
      if (event.newCoord) position.set(event.index, event.newCoord);
    }
    for (const [index, tile] of position) {
      if (!seen.has(index))
        observations.set(index, {
          start: tile,
          path: [],
          deadBefore: dead.has(index),
          diedNow: false,
          attackSeq: false,
          projectile: false,
          hits: [],
          deathSeq: false,
          promoted: false,
        });
    }
    for (const { role, source } of frame.projectiles) {
      const launcher = [...observations].find(
        ([index, observation]) =>
          roles.get(index) === role && !observation.deadBefore && source && sameTile(observation.start, source),
      );
      if (launcher) launcher[1].projectile = true;
      else attacks.unattributedProjectiles.push(`${frame.tick} ${role} ${JSON.stringify(source)}`);
    }
    for (const [index, observation] of observations) {
      const death = deaths.get(index) ?? {
        killTick: null,
        promoted: false,
        lastStepTick: undefined,
        deathSequenceTick: null,
      };
      deaths.set(index, death);
      if (death.killTick === null && observation.path.length > 0) death.lastStepTick = frame.tick;
      if (observation.diedNow && death.killTick === null) {
        observation.promoted = promotedOnKill(observation, frame, index);
        death.killTick = frame.tick;
        death.promoted = observation.promoted;
      }
      if (observation.deathSeq && death.deathSequenceTick === null) death.deathSequenceTick = frame.tick;
    }
    for (const [index, observation] of observations) {
      const route = routes.get(index)!;
      const playerStart = frame.playerStart;
      if (!contiguous || observation.deadBefore || playerStart === null) {
        excluded[contiguous ? 'dead' : 'nonContiguous']++;
        route.remainingSteps = [];
        continue;
      }
      tallyAttack(attacks, `${frame.tick}:${index}`, {
        observation,
        playerStart,
        phaseDue: isPhaseTick(roles.get(index)!, frame.tick - spawnTick.get(index)!),
        slot: slot.get(index)!,
      });
      if (frame.tick - spawnTick.get(index)! < WARBAND_FIRST_MOVE_TICKS) {
        excluded.spawnHold++;
        continue;
      }
      const predicted = stickyPursuitSteps(
        observation.start,
        playerStart,
        warbandPursuitProfile(slot.get(index)!, WARBAND_FALLBACK_OFFSETS),
        route,
      );
      // A hit landed before its movement; the death itself, not pursuit, kept it still.
      if (observation.diedNow && observation.path.length === 0) {
        excluded.killedBeforeMoving++;
        continue;
      }
      scored++;
      if (JSON.stringify(predicted) !== JSON.stringify(observation.path)) {
        route.remainingSteps = [];
        mismatches.push(`${frame.tick}:${index} ${JSON.stringify(observation.path)} vs ${JSON.stringify(predicted)}`);
      }
    }
  }
  const deathTiming = { fit: 0, mismatches: [] as string[], promoted: 0 };
  for (const [index, death] of deaths) {
    if (death.killTick === null || death.deathSequenceTick === null) continue;
    const processTick = death.promoted ? death.killTick : death.killTick + 1;
    const predicted = queuedDeathAnimationTick(processTick, death.lastStepTick);
    if (death.promoted) deathTiming.promoted++;
    if (predicted === death.deathSequenceTick) deathTiming.fit++;
    else deathTiming.mismatches.push(`${death.killTick}:${index} death ${death.deathSequenceTick} vs ${predicted}`);
  }
  return { movement: { scored, mismatches, excluded }, attacks, deathTiming };
}

function isPhaseTick(role: WarbanderRole, sinceSpawn: number): boolean {
  const elapsed = sinceSpawn - WARBANDER_PROFILES[role].attackPhase;
  return elapsed >= 0 && elapsed % WARBAND_ATTACK_PERIOD_TICKS === 0;
}

function tallyAttack(
  attacks: AttackTally,
  label: string,
  input: { observation: Observation; playerStart: Coordinate; phaseDue: boolean; slot: Coordinate },
) {
  const { observation, playerStart, phaseDue } = input;
  const attacked = observation.attackSeq || observation.projectile;
  if (observation.attackSeq) attacks.launches.sequence++;
  else if (observation.projectile) attacks.launches.projectileOnly++;
  if (!phaseDue) {
    if (attacked) attacks.offPhase.push(label);
    return;
  }
  const admitted = isWarbanderAttackPosition(observation.start, playerStart, input.slot, WARBAND_FALLBACK_OFFSETS);
  // A queued death keeps the killing tick's turn unless the hit queue processed the death on K.
  if (admitted && observation.diedNow) {
    if (attacked !== !observation.promoted) attacks.falseLethal.push(label);
    else attacks.killTick[attacked ? 'swung' : 'promoted'].push(label);
  }
  if (attacked) {
    if (!admitted) attacks.missed.push(label);
    return;
  }
  if (admitted && !observation.diedNow) attacks.falseNonlethal.push(label);
  const end = observation.path.at(-1) ?? observation.start;
  if (!observation.diedNow && cardinallyAdjacent(end, playerStart)) attacks.phaseArrivalsWithoutAttack++;
}

const cachePath = findProjectCacheZip();
const originalArena = getArenaConfig();
const originalUnbounded = getArenaAllowUnboundedFallback();
afterEach(() => setArenaConfig(originalArena, originalUnbounded));

let replayed: Record<keyof typeof CAPTURES, ReturnType<typeof replay>> | null = null;
/** Both conformance tests read one replay; the arena is set per test and restored after it. */
async function replayCaptures() {
  setArenaConfig(await loadColosseumWaveArena(cachePath!));
  replayed ??= {
    noSol: replay('noSol'),
    bees: replay('bees'),
    waves: replay('waves'),
  };
  return replayed;
}

it.skipIf(skipWithoutRealCache())(
  'reproduces every captured warband movement decision around the real pillars',
  async () => {
    const results = await replayCaptures();
    // Scored: every tick a live member could move. Excluded, explicitly: ticks after its killing hit,
    // spawn and spawn+1 (it never moves then: 89/89), and the killing tick when the hit landed
    // before its movement. No capture here has a tick gap inside a warband's life.
    const excluded = (dead: number, spawnHold: number, killedBeforeMoving: number) => ({
      nonContiguous: 0,
      dead,
      spawnHold,
      killedBeforeMoving,
    });
    expect({
      noSol: results.noSol.movement,
      bees: results.bees.movement,
      waves: results.waves.movement,
    }).toEqual({
      noSol: { scored: 417, mismatches: [], excluded: excluded(136, 33, 16) },
      bees: { scored: 464, mismatches: [], excluded: excluded(121, 29, 14) },
      waves: { scored: 512, mismatches: [], excluded: excluded(106, 27, 16) },
    });
  },
  REAL_CACHE_TEST_TIMEOUT_MS,
);

it.skipIf(skipWithoutRealCache())(
  'admits every captured warband attack through the production gate, and no other phase tick',
  async () => {
    const results = await replayCaptures();
    const tally = (
      sequence: number,
      projectileOnly: number,
      phaseArrivals: number,
      killTick: { swung: string[]; promoted: string[] } = { swung: [], promoted: [] },
    ) => ({
      launches: { sequence, projectileOnly },
      missed: [],
      offPhase: [],
      killTick,
      falseLethal: [],
      falseNonlethal: [],
      phaseArrivalsWithoutAttack: phaseArrivals,
      unattributedProjectiles: [],
    });
    // 82 launches: 78 attack sequences plus 4 seer casts seen only by their projectile, each from the
    // member's start-of-tick tile. The 79 phase ticks that end one tile straight out without an
    // attack (an "adjacent after moving" gate's false positives) are all rejected. Seven admitted
    // phase ticks are also killing ticks, and the queued death rule explains all seven: five members
    // swing on their killing tick (death processed at K + 1, e.g. B:3356's berserker); the C:2142 and
    // C:2432 archers do not, because a thrall indexed below each queued a hit at it before its turn
    // (death processed on K).
    expect({
      noSol: results.noSol.attacks,
      bees: results.bees.attacks,
      waves: results.waves.attacks,
    }).toEqual({
      noSol: tally(20, 1, 23, { swung: ['1688:41901'], promoted: ['2142:59269', '2432:35510'] }),
      bees: tally(21, 0, 33, { swung: ['2998:37790', '3356:42130'], promoted: [] }),
      waves: tally(37, 3, 23, { swung: ['2205:44409', '3271:63700'], promoted: [] }),
    });
  },
  REAL_CACHE_TEST_TIMEOUT_MS,
);

it.skipIf(skipWithoutRealCache())(
  'starts every captured warband death animation by the shared queued rule',
  async () => {
    const results = await replayCaptures();
    // 89/89 deaths start at max(processTick, lastStep + 3) through the production rule, with
    // processTick = K for the 13 the hit queue promotes (a trailing 0 splat, or a lower-index thrall's
    // hit queued before the member's turn) and K + 1 otherwise. A flat K + 1 for every death fits
    // 82/89; each of the seven it misses (deaths on K, e.g. C:2142, C:1815) is one of these promoted
    // deaths.
    expect({
      noSol: results.noSol.deathTiming,
      bees: results.bees.deathTiming,
      waves: results.waves.deathTiming,
    }).toEqual({
      noSol: { fit: 33, mismatches: [], promoted: 6 },
      bees: { fit: 29, mismatches: [], promoted: 4 },
      waves: { fit: 27, mismatches: [], promoted: 3 },
    });
  },
  REAL_CACHE_TEST_TIMEOUT_MS,
);

// Sim tiles from the captures (world minus 1792/3072), each on the member's phase tick.
it.skipIf(skipWithoutRealCache())(
  'does not attack on arriving at its slot, or from beside the player on the wrong side',
  async () => {
    setArenaConfig(await loadColosseumWaveArena(cachePath!));
    const cases = {
      // C:1644 berserker (spawn+3) runs south, south onto its north slot.
      arrival: { role: 'berserker', start: [32, 40], player: [32, 37] },
      // C:1808 seer starts on the player's north tile and walks to its east slot.
      wrongSide: { role: 'seer', start: [42, 34], player: [42, 33] },
      // A:2654 berserker starts south of the player and runs through it to its north slot.
      throughPlayer: { role: 'berserker', start: [24, 45], player: [24, 46] },
    } as const;
    for (const [name, { role, start, player }] of Object.entries(cases)) {
      const slot = WARBAND_SLOT_OFFSETS[role];
      expect([name, isWarbanderAttackPosition(start, player, slot, WARBAND_FALLBACK_OFFSETS)]).toEqual([name, false]);
      // On its slot it would have attacked.
      const onSlot: Coordinate = [player[0] + slot[0], player[1] + slot[1]];
      expect([name, isWarbanderAttackPosition(onSlot, player, slot, WARBAND_FALLBACK_OFFSETS)]).toEqual([name, true]);
    }
  },
  REAL_CACHE_TEST_TIMEOUT_MS,
);

it('matches every captured warband projectile, and the seer impact on its launch tick', () => {
  const roles = { 9: 'archer', 130: 'seer' } as const;
  const launches = { archer: 0, seer: 0 };
  // The player's slot-2 spotanim on each seer cast's tick: the impact, unless another source took the slot.
  const seerImpacts: Record<string, number> = {};
  // Every archer and seer projectile in the captures was extracted: each had a source and a player target.
  for (const file of Object.keys(CAPTURES) as (keyof typeof CAPTURES)[]) {
    for (const { fields, source, target, playerSlot2Spotanim: impact } of WARBAND_CAPTURE_PROJECTILES[file]!) {
      const role = roles[fields.spotAnimId as keyof typeof roles];
      launches[role]++;
      expect(fields).toEqual(WARBAND_PROJECTILES[role]);
      expect(Math.max(Math.abs(source[0] - target[0]), Math.abs(source[1] - target[1]))).toBe(1);
      if (role !== 'seer') continue;
      const key =
        impact?.[0] === COLOSSEUM_SPOTANIMS.fireblastImpact
          ? `${impact[0]}, delay=${impact[1]}, height=${impact[2]}`
          : (impact?.[0] ?? 'none');
      seerImpacts[key] = (seerImpacts[key] ?? 0) + 1;
    }
  }
  expect(launches).toEqual({ archer: 52, seer: 27 });
  expect(seerImpacts).toEqual({
    [`131, delay=${WARBAND_PROJECTILES.seer.endDelayCycles}, height=${WARBAND_SEER_IMPACT_HEIGHT}`]: 25,
    // akkha_magic_impact from another attacker the same tick (no-sol t3455, bees t3369).
    2254: 2,
  });
});
