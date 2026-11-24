import { CollisionFlag } from '../../rs/collision/CollisionFlag';
import type { Coordinate } from '../../types/simulation';
import { getCollisionMap } from '../constants';
import type { MeleeReach } from './attackTypes';

export { chebyshevDistanceToRect } from './chebyshevDistance';

function getProjectileEntryMask(stepX: number, stepY: number): number {
  if (stepX === 1) return CollisionFlag.BLOCK_EAST_PROJECTILE;
  if (stepX === -1) return CollisionFlag.BLOCK_WEST_PROJECTILE;
  if (stepY === 1) return CollisionFlag.BLOCK_NORTH_PROJECTILE;
  return CollisionFlag.BLOCK_SOUTH_PROJECTILE;
}

/**
 * Mirrors RuneLite's `WorldArea.hasLineOfSight`: every entered tile — the destination
 * included — is tested against the same mask, and floor flags are deliberately absent.
 * `BLOCK_MOVEMENT_FLOOR` ("Eg. water") stops walking, not arrows.
 * See RuneLite WorldArea.java:553
 * and RuneLite CollisionDataFlag.java:55-62.
 */
export function hasLineOfSight(fromX: number, fromY: number, toX: number, toY: number): boolean {
  const collisionMap = getCollisionMap();
  if (!collisionMap) return true;
  if (fromX === toX && fromY === toY) return true;

  const dx = toX - fromX;
  const dy = toY - fromY;
  const absDx = Math.abs(dx);
  const absDy = Math.abs(dy);
  const stepX = Math.sign(dx);
  const stepY = Math.sign(dy);

  const checkEnteredTile = (x: number, y: number, sx: number, sy: number): boolean => {
    const tileFlag = collisionMap.getFlag(x, y);
    if (tileFlag === -1) return false;
    return (tileFlag & getProjectileEntryMask(sx, sy)) === 0;
  };

  if (absDx > absDy) {
    let yScaled = (fromY << 16) + 0x8000;
    const yStepScaled = absDx === 0 ? 0 : Math.floor((absDy << 16) / absDx);
    if (stepY < 0) yScaled -= 1;

    let x = fromX;
    while (x !== toX) {
      x += stepX;

      const y = yScaled >> 16;
      if (!checkEnteredTile(x, y, stepX, 0)) return false;

      yScaled += yStepScaled * stepY;
      const nextY = yScaled >> 16;
      if (nextY !== y && !checkEnteredTile(x, nextY, 0, stepY)) {
        return false;
      }
    }

    return true;
  }

  let xScaled = (fromX << 16) + 0x8000;
  const xStepScaled = Math.floor((absDx << 16) / absDy);
  if (stepX < 0) xScaled -= 1;

  let y = fromY;
  while (y !== toY) {
    y += stepY;

    const x = xScaled >> 16;
    if (!checkEnteredTile(x, y, 0, stepY)) return false;

    xScaled += xStepScaled * stepX;
    const nextX = xScaled >> 16;
    if (nextX !== x && !checkEnteredTile(nextX, y, stepX, 0)) {
      return false;
    }
  }

  return true;
}

/**
 * The point of the closed span `[min, max]` nearest `value` — the clamp OSRS uses to pick
 * each end of a line-of-sight ray.
 */
export function clampAxis(value: number, min: number, max: number): number {
  if (value < min) return min;
  if (value > max) return max;
  return value;
}

/**
 * OSRS parity: line of sight to a multi-tile NPC is ONE ray to a single endpoint —
 * the player's tile clamped into the NPC's footprint rectangle — never a search for
 * whichever footprint tile happens to be exposed.
 *
 * The distinction is load-bearing. TzKal-Zuk's 7x7 footprint always exposes its south row
 * straight across the open ledge, so an any-tile search reports line of sight from every
 * tile in the Inferno and the rock outcrops flanking his alcove (x=27 / x=35) never block
 * anything. Clamping reproduces the six dead tiles the live game marks.
 *
 * Range is NOT tested here: `isInAttackRangeRaw` already applies the Chebyshev
 * rect-edge distance, which is exactly the distance to this clamped endpoint.
 */
export function hasLineOfSightToNpc(
  playerX: number,
  playerY: number,
  npcX: number,
  npcY: number,
  npcSize: number,
): boolean {
  const size = Math.max(1, npcSize);
  return hasLineOfSight(
    playerX,
    playerY,
    clampAxis(playerX, npcX, npcX + size - 1),
    clampAxis(playerY, npcY, npcY + size - 1),
  );
}

export interface ActorFootprint {
  readonly southWest: readonly [number, number];
  readonly width: number;
  readonly height: number;
}

export interface AttackEligibilityOptions {
  readonly attackRange: number;
  readonly checkCollision?: boolean;
  /** Diagonal-capable melee uses line of sight, not a cardinal interaction edge. */
  readonly meleeReach?: MeleeReach;
}

function hasAttackReachBetweenBounds(
  sourceMinX: number,
  sourceMinY: number,
  sourceMaxX: number,
  sourceMaxY: number,
  targetMinX: number,
  targetMinY: number,
  targetMaxX: number,
  targetMaxY: number,
  attackRange: number,
  checkCollision: boolean,
  meleeReach: MeleeReach = 'cardinal',
): boolean {
  const deltaX =
    sourceMaxX < targetMinX ? targetMinX - sourceMaxX : targetMaxX < sourceMinX ? sourceMinX - targetMaxX : 0;
  const deltaY =
    sourceMaxY < targetMinY ? targetMinY - sourceMaxY : targetMaxY < sourceMinY ? sourceMinY - targetMaxY : 0;
  if (Math.max(deltaX, deltaY) > attackRange) return false;
  if (attackRange <= 1 && meleeReach === 'cardinal' && deltaX > 0 && deltaY > 0) return false;
  if (!checkCollision) return true;

  if (attackRange > 1 || meleeReach === 'diagonal') {
    // OSRS parity: each rectangle is clamped toward the other,
    // producing one deterministic ray rather than searching for any exposed tile pair.
    return hasLineOfSight(
      clampAxis(targetMinX, sourceMinX, sourceMaxX),
      clampAxis(targetMinY, sourceMinY, sourceMaxY),
      clampAxis(sourceMinX, targetMinX, targetMaxX),
      clampAxis(sourceMinY, targetMinY, targetMaxY),
    );
  }

  if (deltaX === 0 && deltaY === 0) return true;

  if (sourceMaxX < targetMinX || targetMaxX < sourceMinX) {
    const sourceX = sourceMaxX < targetMinX ? sourceMaxX : sourceMinX;
    const targetX = sourceMaxX < targetMinX ? targetMinX : targetMaxX;
    const overlapMinY = Math.max(sourceMinY, targetMinY);
    const overlapMaxY = Math.min(sourceMaxY, targetMaxY);
    for (let y = overlapMinY; y <= overlapMaxY; y++) {
      if (!edgeHasWallBetween(sourceX, y, targetX, y)) return true;
    }
    return false;
  }

  const sourceY = sourceMaxY < targetMinY ? sourceMaxY : sourceMinY;
  const targetY = sourceMaxY < targetMinY ? targetMinY : targetMaxY;
  const overlapMinX = Math.max(sourceMinX, targetMinX);
  const overlapMaxX = Math.min(sourceMaxX, targetMaxX);
  for (let x = overlapMinX; x <= overlapMaxX; x++) {
    if (!edgeHasWallBetween(x, sourceY, x, targetY)) return true;
  }
  return false;
}

/**
 * The single OSRS "can I attack from this tile?" predicate: edge range PLUS the
 * obstruction test that range implies — a wall-free interaction edge for melee,
 * line of sight for everything else (including diagonal-reach melee).
 *
 * Raw-scalar form so the pathfinder can call it per BFS node without allocating.
 * Every consumer that decides attack eligibility or where to stop approaching MUST
 * go through this, so obstruction rules can never drift apart between "may I shoot
 * from here" and "is this a valid tile to walk to".
 */
export function hasAttackReach(
  px: number,
  py: number,
  npcX: number,
  npcY: number,
  npcSize: number,
  attackRange: number,
  meleeReach: MeleeReach = 'cardinal',
): boolean {
  const size = Math.max(1, npcSize);
  return hasAttackReachBetweenBounds(
    px,
    py,
    px,
    py,
    npcX,
    npcY,
    npcX + size - 1,
    npcY + size - 1,
    attackRange,
    true,
    meleeReach,
  );
}

export function isFootprintInAttackRange(
  source: ActorFootprint,
  target: ActorFootprint,
  options: AttackEligibilityOptions,
): boolean {
  const sourceWidth = Math.max(1, Math.trunc(source.width));
  const sourceHeight = Math.max(1, Math.trunc(source.height));
  const targetWidth = Math.max(1, Math.trunc(target.width));
  const targetHeight = Math.max(1, Math.trunc(target.height));
  return hasAttackReachBetweenBounds(
    source.southWest[0],
    source.southWest[1],
    source.southWest[0] + sourceWidth - 1,
    source.southWest[1] + sourceHeight - 1,
    target.southWest[0],
    target.southWest[1],
    target.southWest[0] + targetWidth - 1,
    target.southWest[1] + targetHeight - 1,
    options.attackRange,
    options.checkCollision ?? false,
    options.meleeReach,
  );
}

export function isInAttackRange(
  playerPos: Coordinate,
  npcPos: Coordinate,
  npcSize: number,
  attackRange: number,
  checkWalls: boolean = false,
  meleeReach: MeleeReach = 'cardinal',
): boolean {
  if (!checkWalls) {
    return isInAttackRangeRaw(playerPos[0], playerPos[1], npcPos[0], npcPos[1], npcSize, attackRange, meleeReach);
  }
  return hasAttackReach(playerPos[0], playerPos[1], npcPos[0], npcPos[1], npcSize, attackRange, meleeReach);
}

export function isInAttackRangeRaw(
  px: number,
  py: number,
  npcX: number,
  npcY: number,
  npcSize: number,
  attackRange: number,
  meleeReach: MeleeReach = 'cardinal',
): boolean {
  const size = Math.max(1, npcSize);
  return hasAttackReachBetweenBounds(
    px,
    py,
    px,
    py,
    npcX,
    npcY,
    npcX + size - 1,
    npcY + size - 1,
    attackRange,
    false,
    meleeReach,
  );
}

export function isUnderNpc(playerPos: Coordinate, npcPos: Coordinate, npcSize: number): boolean {
  return isUnderNpcRaw(playerPos[0], playerPos[1], npcPos[0], npcPos[1], npcSize);
}

export function isUnderNpcRaw(px: number, py: number, npcX: number, npcY: number, npcSize: number): boolean {
  return px >= npcX && px <= npcX + npcSize - 1 && py >= npcY && py <= npcY + npcSize - 1;
}

/**
 * Whether a wall sits on the edge between two tiles.
 * Only supports cardinal adjacency (dx+dy = 1).
 */
export function edgeHasWallBetween(ax: number, ay: number, bx: number, by: number): boolean {
  const collisionMap = getCollisionMap();
  if (!collisionMap) return false;

  const dx = bx - ax;
  const dy = by - ay;
  if (Math.abs(dx) + Math.abs(dy) !== 1) return false;

  const flagA = collisionMap.getFlag(ax, ay);
  const flagB = collisionMap.getFlag(bx, by);
  if (flagA === -1 || flagB === -1) return false;

  if (dx === 1) {
    return (flagA & CollisionFlag.WALL_EAST) !== 0 || (flagB & CollisionFlag.WALL_WEST) !== 0;
  } else if (dx === -1) {
    return (flagA & CollisionFlag.WALL_WEST) !== 0 || (flagB & CollisionFlag.WALL_EAST) !== 0;
  } else if (dy === 1) {
    return (flagA & CollisionFlag.WALL_NORTH) !== 0 || (flagB & CollisionFlag.WALL_SOUTH) !== 0;
  } else {
    return (flagA & CollisionFlag.WALL_SOUTH) !== 0 || (flagB & CollisionFlag.WALL_NORTH) !== 0;
  }
}

/**
 * Whether the player can reach an NPC's area without a wall on the interaction edge.
 *
 * @param playerX Player tile X
 * @param playerY Player tile Y
 * @param npcX NPC SW corner X
 * @param npcY NPC SW corner Y
 * @param npcSizeX NPC width in tiles
 * @param npcSizeY NPC height in tiles (defaults to npcSizeX for square NPCs)
 * @returns true if no wall blocks the interaction edge
 */
export function hasDirectReach(
  playerX: number,
  playerY: number,
  npcX: number,
  npcY: number,
  npcSizeX: number,
  npcSizeY: number = npcSizeX,
): boolean {
  const minX = npcX;
  const minY = npcY;
  const maxX = minX + Math.max(1, npcSizeX) - 1;
  const maxY = minY + Math.max(1, npcSizeY) - 1;

  if (playerX >= minX && playerX <= maxX && playerY >= minY && playerY <= maxY) {
    return true;
  }

  const clampedX = Math.max(minX, Math.min(playerX, maxX));
  const clampedY = Math.max(minY, Math.min(playerY, maxY));
  const dx = clampedX - playerX;
  const dy = clampedY - playerY;
  const distance = Math.max(Math.abs(dx), Math.abs(dy));

  if (distance === 0) {
    return true;
  }

  if (distance > 1) {
    return false;
  }

  const stepX = Math.sign(dx);
  const stepY = Math.sign(dy);

  const checkEdge = (ax: number, ay: number, bx: number, by: number): boolean => !edgeHasWallBetween(ax, ay, bx, by);

  if (stepX === 0 || stepY === 0) {
    return checkEdge(playerX, playerY, playerX + stepX, playerY + stepY);
  }

  // Diagonal adjacency — check both L-shaped paths (horiz-first and vert-first)
  const horizFirst =
    checkEdge(playerX, playerY, playerX + stepX, playerY) &&
    checkEdge(playerX + stepX, playerY, playerX + stepX, playerY + stepY);
  const vertFirst =
    checkEdge(playerX, playerY, playerX, playerY + stepY) &&
    checkEdge(playerX, playerY + stepY, playerX + stepX, playerY + stepY);

  return horizFirst || vertFirst;
}
