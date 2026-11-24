import { fmix32 } from '../../core/rng';
import type { ResolvedYamaAttackPattern } from '../../npcs/yama/timing';
import type { Coordinate } from '../../types/simulation';

export {
  DEFAULT_YAMA_ATTACK_PATTERN,
  getYamaBeatInfo,
  VOID_FLARE_NPC_ID,
  YAMA_NPC_ID,
  YAMA_SIZE,
  type YamaBeatInfo,
} from '../../npcs/yama/timing';
/**
 * The captures use this strict round-robin order, with only the starting corner seeded per run.
 * Reordering it changes pair adjacency and phases every later flare after the edit.
 */
export const VOID_FLARE_SPAWN_POSITIONS: readonly Coordinate[] = [
  [26, 25],
  [23, 33],
  [35, 25],
  [38, 33],
];
export const YAMA_VICTORY_COMPLETION_DELAY_TICKS = 7;

/**
 * Overhead quote Yama says once he is defeated, shown above him while his
 * despawn animation plays.
 *
 * Pool: OSRS wiki `Transcript:Yama` → "Defeating Yama". Two of the four are also
 * confirmed in the packet captures.
 */
export const YAMA_VICTORY_QUOTES: readonly string[] = [
  'Fair is fair.',
  'Your reward, as agreed.',
  'A satisfying warmup. Collect your loot and let us continue.',
  'A passing performance.',
];

/**
 * P3 intro teleport animation.
 * Landing area in OSRS world: (1501, 10083) to (1505, 10087)
 * Player faces south (angle 0) on landing.
 */
export const PLAYER_INTRO_FACING = 0;
export const PLAYER_INTRO_ANIM_SEQ_ID = 12152;
export const PLAYER_LANDING_MIN: [number, number] = [29, 35];
export const PLAYER_LANDING_MAX: [number, number] = [33, 39];

export function randomLandingPosition(): [number, number] {
  const x = PLAYER_LANDING_MIN[0] + Math.floor(Math.random() * (PLAYER_LANDING_MAX[0] - PLAYER_LANDING_MIN[0] + 1));
  const y = PLAYER_LANDING_MIN[1] + Math.floor(Math.random() * (PLAYER_LANDING_MAX[1] - PLAYER_LANDING_MIN[1] + 1));
  return [x, y];
}

// SW corner of Yama's 5x5 footprint (OSRS convention)
export const YAMA_START_POS: [number, number] = [29, 28];

/**
 * Y coordinate of Yama's arena entrance (tile (31, 19)). When the fight begins a
 * barrier seals the entrance, so every tile on or south of this line
 * (y <= ARENA_ENTRANCE_Y) is outside the sealed arena: not walkable/pathable, and
 * shadow walls are not rendered there.
 */
export const ARENA_ENTRANCE_Y = 19;

export function isSouthOfArenaEntrance(y: number): boolean {
  return y <= ARENA_ENTRANCE_Y;
}

export const YAMA_FIREBALL_DELAY = 3;

export type FireballAngle = 'vertical' | 'horizontal' | 'diagonal' | 'diagonal-alt';

export function getFireballBurstCycleTicks(pattern: ResolvedYamaAttackPattern): number[] {
  return pattern.fireballBeats.map(
    (beat) => pattern.beatStartTick + beat * pattern.beatIntervalTicks + YAMA_FIREBALL_DELAY,
  );
}

export function getCycleLength(pattern: ResolvedYamaAttackPattern): number {
  return pattern.beatsPerCycle * pattern.beatIntervalTicks;
}

export const FIREBALL_SET_OFFSETS = [0, 3, 6];
export const FIREBALL_SET_DURATION = 5;

/**
 * Which side of a duo the fight throws its Shadow Crash lines for. Both partners get their own
 * burst and the two mirror each other: player 1 (solo, or whoever made the instance) gets the
 * NW-SE diagonal, player 2 the NE-SW one. Openers and closers are the same axes for both.
 */
export type YamaDuoSide = 'player1' | 'player2';

export function isYamaDuoSide(value: unknown): value is YamaDuoSide {
  return value === 'player1' || value === 'player2';
}

/**
 * Fireball burst sequences: start → diagonal → opposite.
 */
const BURST_SEQUENCES: Record<
  YamaDuoSide,
  Record<'vertical' | 'horizontal', [FireballAngle, FireballAngle, FireballAngle]>
> = {
  player1: {
    vertical: ['vertical', 'diagonal', 'horizontal'],
    horizontal: ['horizontal', 'diagonal', 'vertical'],
  },
  player2: {
    vertical: ['vertical', 'diagonal-alt', 'horizontal'],
    horizontal: ['horizontal', 'diagonal-alt', 'vertical'],
  },
};

/**
 * Practice aid: pin which axis every fireball burst opens on, instead of the per-burst
 * coin flip real Yama does. `random` is the only OSRS-accurate value — the other two
 * exist so a player drilling a dodge (e.g. the no-fly method) faces one line pattern.
 *
 * This selects the burst's FIRST set only. The sequence start → diagonal → opposite is
 * fixed by {@link BURST_SEQUENCES}, so a pinned burst still fires all three angles;
 * there is no setting that yields horizontal-only or vertical-only fireballs.
 */
export type YamaFireballStart = 'random' | 'vertical' | 'horizontal';

export function isYamaFireballStart(value: unknown): value is YamaFireballStart {
  return value === 'random' || value === 'vertical' || value === 'horizontal';
}

/**
 * Decide whether a fireball burst starts vertical or horizontal — independently
 * and pseudo-randomly per burst, deterministic from the per-run seed so replays
 * reproduce it exactly.
 *
 * Uses an avalanche hash (fmix32), NOT `(i * k + seed) % 2` or any single bit of
 * that linear expression — a lone bit only alternates or repeats in a fixed
 * pattern, never random. fmix32 mixes all bits, so reading one is a coin flip.
 */
export function getFireballBurstStartsVertical(
  globalBurstIndex: number,
  seed: number,
  start: YamaFireballStart = 'random',
): boolean {
  if (start !== 'random') {
    return start === 'vertical';
  }
  return (fmix32(globalBurstIndex ^ seed) & 1) === 0;
}

export function getFireballAngle(
  globalBurstIndex: number,
  setIndex: number,
  seed: number,
  start: YamaFireballStart = 'random',
  side: YamaDuoSide = 'player1',
): FireballAngle {
  const startsVertical = getFireballBurstStartsVertical(globalBurstIndex, seed, start);
  const sequence = BURST_SEQUENCES[side][startsVertical ? 'vertical' : 'horizontal'];
  return sequence[setIndex];
}

export function getFireballInstanceId(cycleNumber: number, burstIndex: number, setIndex: number): number {
  return cycleNumber * 9 + burstIndex * 3 + setIndex;
}
