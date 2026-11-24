import type { ResolvedYamaAttackPattern } from '../../npcs/yama/timing';
import type { Coordinate } from '../../types/simulation';
import {
  FIREBALL_SET_DURATION,
  FIREBALL_SET_OFFSETS,
  type FireballAngle,
  getCycleLength,
  getFireballAngle,
  getFireballBurstCycleTicks,
  getFireballInstanceId,
  type YamaDuoSide,
  type YamaFireballStart,
} from './constants';

export interface FireballState {
  active: boolean;
  phase: number;
  centerPosition: Coordinate | null;
  angle: FireballAngle | null;
  ticksIntoPhase: number;
}

export interface ThreeFireballPositions {
  center: Coordinate;
  side1: Coordinate;
  side2: Coordinate;
}

export function getFireballLineOffsets(angle: FireballAngle): { dx: number; dy: number } {
  switch (angle) {
    case 'vertical':
      return { dx: 0, dy: 3 };
    case 'horizontal':
      return { dx: 3, dy: 0 };
    case 'diagonal':
      return { dx: 2, dy: -2 };
    case 'diagonal-alt':
      return { dx: -2, dy: -2 };
  }
}

export function getThreeFireballPositions(centerPos: Coordinate, angle: FireballAngle): ThreeFireballPositions {
  const [cx, cy] = centerPos;
  const { dx, dy } = getFireballLineOffsets(angle);

  return {
    center: centerPos,
    side1: [cx - dx, cy - dy],
    side2: [cx + dx, cy + dy],
  };
}

export type FireballPhase = 'falling' | 'impact' | 'explosion' | 'done';

export function getFireballFallProgress(
  startTick: number,
  currentTick: number,
): { phase: FireballPhase; progress: number } {
  const ticksInto = currentTick - startTick;

  if (ticksInto < 3) {
    return { phase: 'falling', progress: ticksInto / 3 };
  }
  if (ticksInto < 4) {
    return { phase: 'impact', progress: 0 };
  }
  if (ticksInto < 5) {
    return { phase: 'explosion', progress: 1 };
  }
  return { phase: 'done', progress: 1 };
}

function getExplosionOuterTiles(center: Coordinate, angle: FireballAngle): Coordinate[] {
  const [cx, cy] = center;

  if (angle === 'horizontal') {
    return [
      [cx - 3, cy - 3],
      [cx - 3, cy - 2],
      [cx - 3, cy - 1],
      [cx - 3, cy],
      [cx - 3, cy + 1],
      [cx - 3, cy + 2],
      [cx - 3, cy + 3],
      [cx - 2, cy - 2],
      [cx - 2, cy - 1],
      [cx - 2, cy],
      [cx - 2, cy + 1],
      [cx - 2, cy + 2],
      [cx + 2, cy - 2],
      [cx + 2, cy - 1],
      [cx + 2, cy],
      [cx + 2, cy + 1],
      [cx + 2, cy + 2],
      [cx + 3, cy - 3],
      [cx + 3, cy - 2],
      [cx + 3, cy - 1],
      [cx + 3, cy],
      [cx + 3, cy + 1],
      [cx + 3, cy + 2],
      [cx + 3, cy + 3],
    ];
  } else if (angle === 'vertical') {
    return [
      [cx - 3, cy - 3],
      [cx - 2, cy - 3],
      [cx - 1, cy - 3],
      [cx, cy - 3],
      [cx + 1, cy - 3],
      [cx + 2, cy - 3],
      [cx + 3, cy - 3],
      [cx - 2, cy - 2],
      [cx - 1, cy - 2],
      [cx, cy - 2],
      [cx + 1, cy - 2],
      [cx + 2, cy - 2],
      [cx - 2, cy + 2],
      [cx - 1, cy + 2],
      [cx, cy + 2],
      [cx + 1, cy + 2],
      [cx + 2, cy + 2],
      [cx - 3, cy + 3],
      [cx - 2, cy + 3],
      [cx - 1, cy + 3],
      [cx, cy + 3],
      [cx + 1, cy + 3],
      [cx + 2, cy + 3],
      [cx + 3, cy + 3],
    ];
  } else if (angle === 'diagonal') {
    return [
      [cx, cy - 5],
      [cx + 1, cy - 4],
      [cx, cy - 4],
      [cx + 2, cy - 3],
      [cx + 1, cy - 3],
      [cx, cy - 3],
      [cx + 3, cy - 2],
      [cx + 2, cy - 2],
      [cx + 1, cy - 2],
      [cx + 4, cy - 1],
      [cx + 3, cy - 1],
      [cx + 2, cy - 1],
      [cx + 5, cy],
      [cx + 4, cy],
      [cx + 3, cy],
      [cx - 3, cy],
      [cx - 4, cy],
      [cx - 5, cy],
      [cx - 2, cy + 1],
      [cx - 3, cy + 1],
      [cx - 4, cy + 1],
      [cx - 1, cy + 2],
      [cx - 2, cy + 2],
      [cx - 3, cy + 2],
      [cx, cy + 3],
      [cx - 1, cy + 3],
      [cx - 2, cy + 3],
      [cx, cy + 4],
      [cx - 1, cy + 4],
      [cx, cy + 5],
    ];
  } else {
    return [
      [cx, cy - 5],
      [cx - 1, cy - 4],
      [cx, cy - 4],
      [cx - 2, cy - 3],
      [cx - 1, cy - 3],
      [cx, cy - 3],
      [cx - 3, cy - 2],
      [cx - 2, cy - 2],
      [cx - 1, cy - 2],
      [cx - 4, cy - 1],
      [cx - 3, cy - 1],
      [cx - 2, cy - 1],
      [cx - 5, cy],
      [cx - 4, cy],
      [cx - 3, cy],
      [cx + 3, cy],
      [cx + 4, cy],
      [cx + 5, cy],
      [cx + 2, cy + 1],
      [cx + 3, cy + 1],
      [cx + 4, cy + 1],
      [cx + 1, cy + 2],
      [cx + 2, cy + 2],
      [cx + 3, cy + 2],
      [cx, cy + 3],
      [cx + 1, cy + 3],
      [cx + 2, cy + 3],
      [cx, cy + 4],
      [cx + 1, cy + 4],
      [cx, cy + 5],
    ];
  }
}

function getExplosionInnerTiles(center: Coordinate, angle: FireballAngle): Coordinate[] {
  const [cx, cy] = center;

  if (angle === 'horizontal') {
    return [
      [cx - 1, cy - 1],
      [cx - 1, cy],
      [cx - 1, cy + 1],
      [cx, cy],
      [cx + 1, cy - 1],
      [cx + 1, cy],
      [cx + 1, cy + 1],
    ];
  } else if (angle === 'vertical') {
    return [
      [cx - 1, cy - 1],
      [cx, cy - 1],
      [cx + 1, cy - 1],
      [cx, cy],
      [cx - 1, cy + 1],
      [cx, cy + 1],
      [cx + 1, cy + 1],
    ];
  } else if (angle === 'diagonal') {
    return [
      [cx, cy - 2],
      [cx + 1, cy - 1],
      [cx, cy - 1],
      [cx + 2, cy],
      [cx + 1, cy],
      [cx, cy],
      [cx - 1, cy],
      [cx - 2, cy],
      [cx, cy + 1],
      [cx - 1, cy + 1],
      [cx, cy + 2],
    ];
  } else {
    return [
      [cx, cy - 2],
      [cx - 1, cy - 1],
      [cx, cy - 1],
      [cx - 2, cy],
      [cx - 1, cy],
      [cx, cy],
      [cx + 1, cy],
      [cx + 2, cy],
      [cx, cy + 1],
      [cx + 1, cy + 1],
      [cx, cy + 2],
    ];
  }
}

export interface FireballPhaseInfo {
  startTick: number;
  endTick: number;
  angle: FireballAngle;
  instanceId: number;
}

export interface FireballBurstShape {
  start: YamaFireballStart;
  side: YamaDuoSide;
}

/**
 * Per-burst shape. A resolver rather than one value for the whole call because a burst spans ~11
 * ticks across three sets: with a single value, flipping a practice setting between set 1 and set 3
 * re-derives the in-flight burst — yielding the impossible sequence vertical → diagonal → vertical,
 * or rotating a diagonal line already falling. Yama's encounter answers this from a shape it latched
 * when the burst was registered, so a change lands on the next burst instead of rewriting this one.
 */
export type FireballShapeResolver = (globalBurstIndex: number) => FireballBurstShape;

function toResolver(shape: YamaFireballStart | FireballShapeResolver): FireballShapeResolver {
  return typeof shape === 'function' ? shape : () => ({ start: shape, side: 'player1' });
}

export function getFireballPhasesForTick(
  tick: number,
  seed: number,
  pattern: ResolvedYamaAttackPattern,
  shape: YamaFireballStart | FireballShapeResolver = 'random',
): FireballPhaseInfo[] {
  const resolveShape = toResolver(shape);
  const cycleStart = pattern.beatStartTick;
  const cycleLength = getCycleLength(pattern);
  const burstCycleTicks = getFireballBurstCycleTicks(pattern);

  if (tick < cycleStart) return [];

  const results: FireballPhaseInfo[] = [];
  const tickOffset = tick - cycleStart;
  const currentCycle = Math.floor(tickOffset / cycleLength);

  for (let cycle = Math.max(0, currentCycle - 1); cycle <= currentCycle; cycle++) {
    for (let burstIdx = 0; burstIdx < burstCycleTicks.length; burstIdx++) {
      const burstStartTick = cycle * cycleLength + burstCycleTicks[burstIdx];
      const globalBurstIndex = cycle * burstCycleTicks.length + burstIdx;
      const { start, side } = resolveShape(globalBurstIndex);

      for (let setIdx = 0; setIdx < FIREBALL_SET_OFFSETS.length; setIdx++) {
        const startTick = burstStartTick + FIREBALL_SET_OFFSETS[setIdx];
        const endTick = startTick + FIREBALL_SET_DURATION - 1;

        if (tick >= startTick && tick <= endTick) {
          results.push({
            startTick,
            endTick,
            angle: getFireballAngle(globalBurstIndex, setIdx, seed, start, side),
            instanceId: getFireballInstanceId(cycle, burstIdx, setIdx),
          });
        }
      }
    }
  }

  return results;
}

export function getFireballImpactTiles(center: Coordinate, angle: FireballAngle): Coordinate[] {
  const positions = getThreeFireballPositions(center, angle);
  return [positions.center, positions.side1, positions.side2];
}

/**
 * Mechanic: When Yama's Shadow Crash (fireball) lands and Mark of Darkness is
 * active, the player can stand exactly 1 tile perpendicular to the line of 3
 * fireballs (relative to the CENTER fireball) to both avoid damage AND reduce
 * their next attack delay by 1 tick.
 *
 * For each fireball line direction, the perpendicular axis has exactly two
 * 1-tile neighbors that lie OUTSIDE the explosion AoE.
 *
 * Reference: https://oldschool.runescape.wiki/w/Yama/Strategies
 *   "if the player only moves one tile away from the crash and has Mark of
 *    Darkness active, their next attack will be used one tick faster than usual."
 */
export function getFireballPerfectDodgeTiles(center: Coordinate, angle: FireballAngle): [Coordinate, Coordinate] {
  const [cx, cy] = center;
  switch (angle) {
    case 'horizontal':
      return [
        [cx, cy + 1],
        [cx, cy - 1],
      ];
    case 'vertical':
      return [
        [cx + 1, cy],
        [cx - 1, cy],
      ];
    case 'diagonal':
      // Line direction (+1,-1); perpendicular (+1,+1) / (-1,-1).
      return [
        [cx + 1, cy + 1],
        [cx - 1, cy - 1],
      ];
    case 'diagonal-alt':
      // Line direction (+1,+1); perpendicular (+1,-1) / (-1,+1).
      return [
        [cx + 1, cy - 1],
        [cx - 1, cy + 1],
      ];
  }
}

export function isFireballPerfectDodgePosition(
  playerPos: Coordinate,
  center: Coordinate,
  angle: FireballAngle,
): boolean {
  const dodgeTiles = getFireballPerfectDodgeTiles(center, angle);
  return dodgeTiles.some(([dx, dy]) => dx === playerPos[0] && dy === playerPos[1]);
}

export function getExplosionTiles(center: Coordinate, angle: FireballAngle): Coordinate[] {
  return [...getExplosionOuterTiles(center, angle), ...getExplosionInnerTiles(center, angle)];
}

export function getFireballDangerTiles(
  centerPos: Coordinate,
  angle: FireballAngle,
  startTick: number,
  currentTick: number,
): Coordinate[] {
  const { phase } = getFireballFallProgress(startTick, currentTick);

  if (phase === 'impact') {
    return getFireballImpactTiles(centerPos, angle);
  }

  if (phase === 'explosion') {
    return getExplosionTiles(centerPos, angle);
  }

  return [];
}
