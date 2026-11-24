import { CollisionFlag } from '../rs/collision/CollisionFlag';
import { hasAttackReach, isUnderNpcRaw } from './combat/distance';
import { getCollisionMap, isWalkableTile } from './constants';

export type Coordinate = [number, number];

const DIRECTION_DELTAS: [number, number][] = [
  [-1, 0],
  [1, 0],
  [0, -1],
  [0, 1],
  [-1, -1],
  [1, -1],
  [-1, 1],
  [1, 1],
];

const DIRECTION_FLAG_WEST = 2;
const DIRECTION_FLAG_EAST = 8;
const DIRECTION_FLAG_SOUTH = 1;
const DIRECTION_FLAG_NORTH = 4;

const DIRECTION_START = 99;

const DIRECTION_FLAGS = [
  DIRECTION_FLAG_WEST,
  DIRECTION_FLAG_EAST,
  DIRECTION_FLAG_SOUTH,
  DIRECTION_FLAG_NORTH,
  DIRECTION_FLAG_SOUTH | DIRECTION_FLAG_WEST,
  DIRECTION_FLAG_SOUTH | DIRECTION_FLAG_EAST,
  DIRECTION_FLAG_NORTH | DIRECTION_FLAG_WEST,
  DIRECTION_FLAG_NORTH | DIRECTION_FLAG_EAST,
];

const CARDINAL_BLOCK_FLAGS = [
  CollisionFlag.BLOCK_WEST,
  CollisionFlag.BLOCK_EAST,
  CollisionFlag.BLOCK_SOUTH,
  CollisionFlag.BLOCK_NORTH,
];

const DIAGONAL_BLOCK_FLAGS: [number, number, number][] = [
  [CollisionFlag.BLOCK_SOUTH_WEST, CollisionFlag.BLOCK_WEST, CollisionFlag.BLOCK_SOUTH],
  [CollisionFlag.BLOCK_SOUTH_EAST, CollisionFlag.BLOCK_EAST, CollisionFlag.BLOCK_SOUTH],
  [CollisionFlag.BLOCK_NORTH_WEST, CollisionFlag.BLOCK_WEST, CollisionFlag.BLOCK_NORTH],
  [CollisionFlag.BLOCK_NORTH_EAST, CollisionFlag.BLOCK_EAST, CollisionFlag.BLOCK_NORTH],
];

const FALLBACK_RADIUS = 10;
const MAX_FALLBACK_BFS_DISTANCE = 100;
const UNVISITED_DISTANCE = 99_999_999;

export function canMoveInDirection(fromX: number, fromY: number, toX: number, toY: number): boolean {
  if (!isWalkableTile(toX, toY)) {
    return false;
  }

  const collisionMap = getCollisionMap();

  if (!collisionMap) {
    return true;
  }

  const dx = toX - fromX;
  const dy = toY - fromY;

  if (dy === 0) {
    if (dx === -1) return !collisionMap.hasFlag(toX, toY, CollisionFlag.BLOCK_WEST);
    if (dx === 1) return !collisionMap.hasFlag(toX, toY, CollisionFlag.BLOCK_EAST);
  }
  if (dx === 0) {
    if (dy === -1) return !collisionMap.hasFlag(toX, toY, CollisionFlag.BLOCK_SOUTH);
    if (dy === 1) return !collisionMap.hasFlag(toX, toY, CollisionFlag.BLOCK_NORTH);
  }

  if (dx === -1 && dy === -1) {
    return (
      !collisionMap.hasFlag(toX, toY, CollisionFlag.BLOCK_SOUTH_WEST) &&
      !collisionMap.hasFlag(fromX - 1, fromY, CollisionFlag.BLOCK_WEST) &&
      !collisionMap.hasFlag(fromX, fromY - 1, CollisionFlag.BLOCK_SOUTH)
    );
  }
  if (dx === 1 && dy === -1) {
    return (
      !collisionMap.hasFlag(toX, toY, CollisionFlag.BLOCK_SOUTH_EAST) &&
      !collisionMap.hasFlag(fromX + 1, fromY, CollisionFlag.BLOCK_EAST) &&
      !collisionMap.hasFlag(fromX, fromY - 1, CollisionFlag.BLOCK_SOUTH)
    );
  }
  if (dx === -1 && dy === 1) {
    return (
      !collisionMap.hasFlag(toX, toY, CollisionFlag.BLOCK_NORTH_WEST) &&
      !collisionMap.hasFlag(fromX - 1, fromY, CollisionFlag.BLOCK_WEST) &&
      !collisionMap.hasFlag(fromX, fromY + 1, CollisionFlag.BLOCK_NORTH)
    );
  }
  if (dx === 1 && dy === 1) {
    return (
      !collisionMap.hasFlag(toX, toY, CollisionFlag.BLOCK_NORTH_EAST) &&
      !collisionMap.hasFlag(fromX + 1, fromY, CollisionFlag.BLOCK_EAST) &&
      !collisionMap.hasFlag(fromX, fromY + 1, CollisionFlag.BLOCK_NORTH)
    );
  }

  return false;
}

export function findPath(start: Coordinate, end: Coordinate): Coordinate[] {
  const [startX, startY] = start;
  const [endX, endY] = end;

  if (startX === endX && startY === endY) {
    return [];
  }

  const GRID_SIZE = 128;
  const centerX = GRID_SIZE >> 1;
  const centerY = GRID_SIZE >> 1;
  const baseX = startX - centerX;
  const baseY = startY - centerY;

  const distances: number[][] = [];
  const directionGrid: number[][] = [];
  for (let i = 0; i < GRID_SIZE; i++) {
    distances[i] = new Array(GRID_SIZE).fill(UNVISITED_DISTANCE);
    directionGrid[i] = new Array(GRID_SIZE).fill(0);
  }

  const queueSize = nextPow2(GRID_SIZE * GRID_SIZE);
  const queueMask = queueSize - 1;
  const queueX = new Int32Array(queueSize);
  const queueY = new Int32Array(queueSize);

  directionGrid[centerX][centerY] = DIRECTION_START;
  distances[centerX][centerY] = 0;
  let writeIndex = 0;
  let readIndex = 0;
  queueX[writeIndex] = startX;
  queueY[writeIndex] = startY;
  writeIndex = (writeIndex + 1) & queueMask;

  let reached = false;
  let resultX = startX;
  let resultY = startY;

  const collisionMap = getCollisionMap();

  while (readIndex !== writeIndex) {
    const curX = queueX[readIndex];
    const curY = queueY[readIndex];
    readIndex = (readIndex + 1) & queueMask;
    const localX = curX - baseX;
    const localY = curY - baseY;

    if (curX === endX && curY === endY) {
      resultX = curX;
      resultY = curY;
      reached = true;
      break;
    }

    const cost = distances[localX][localY] + 1;

    for (let dirIdx = 0; dirIdx < 8; dirIdx++) {
      const [dx, dy] = DIRECTION_DELTAS[dirIdx];
      const nextX = curX + dx;
      const nextY = curY + dy;
      const nextLocalX = nextX - baseX;
      const nextLocalY = nextY - baseY;

      if (nextLocalX < 0 || nextLocalX >= GRID_SIZE || nextLocalY < 0 || nextLocalY >= GRID_SIZE) {
        continue;
      }

      if (directionGrid[nextLocalX][nextLocalY] !== 0) {
        continue;
      }

      if (!isWalkableTile(nextX, nextY)) {
        continue;
      }

      let blocked = false;
      if (collisionMap) {
        if (dirIdx < 4) {
          blocked = collisionMap.hasFlag(nextX, nextY, CARDINAL_BLOCK_FLAGS[dirIdx]);
        } else {
          const diagIdx = dirIdx - 4;
          const [diagFlag, cardXFlag, cardYFlag] = DIAGONAL_BLOCK_FLAGS[diagIdx];
          blocked =
            collisionMap.hasFlag(nextX, nextY, diagFlag) ||
            collisionMap.hasFlag(curX + dx, curY, cardXFlag) ||
            collisionMap.hasFlag(curX, curY + dy, cardYFlag);
        }
      }

      if (blocked) {
        continue;
      }

      directionGrid[nextLocalX][nextLocalY] = DIRECTION_FLAGS[dirIdx];
      distances[nextLocalX][nextLocalY] = cost;
      queueX[writeIndex] = nextX;
      queueY[writeIndex] = nextY;
      writeIndex = (writeIndex + 1) & queueMask;
    }
  }

  if (!reached) {
    let bestDistSq = Infinity;
    let bestBfsDist = Infinity;

    for (let x = endX - FALLBACK_RADIUS; x <= endX + FALLBACK_RADIUS; x++) {
      for (let y = endY - FALLBACK_RADIUS; y <= endY + FALLBACK_RADIUS; y++) {
        const lx = x - baseX;
        const ly = y - baseY;
        if (lx < 0 || ly < 0 || lx >= GRID_SIZE || ly >= GRID_SIZE) {
          continue;
        }
        if (distances[lx][ly] >= MAX_FALLBACK_BFS_DISTANCE) {
          continue;
        }

        const ddx = Math.abs(x - endX);
        const ddy = Math.abs(y - endY);
        const distSq = ddx * ddx + ddy * ddy;

        if (distSq < bestDistSq || (distSq === bestDistSq && distances[lx][ly] < bestBfsDist)) {
          bestDistSq = distSq;
          bestBfsDist = distances[lx][ly];
          resultX = x;
          resultY = y;
        }
      }
    }

    if (bestDistSq === Infinity) {
      return [];
    }
  }

  if (resultX === startX && resultY === startY) {
    return [];
  }

  return reconstructPathFromDirections(directionGrid, baseX, baseY, startX, startY, resultX, resultY);
}

function reconstructPathFromDirections(
  directionGrid: number[][],
  baseX: number,
  baseY: number,
  startX: number,
  startY: number,
  endX: number,
  endY: number,
): Coordinate[] {
  const reversePath: Coordinate[] = [];
  let x = endX;
  let y = endY;

  while (x !== startX || y !== startY) {
    reversePath.push([x, y]);
    const dir = directionGrid[x - baseX][y - baseY];

    if (dir === 0 || dir === DIRECTION_START) {
      break;
    }

    if ((dir & DIRECTION_FLAG_WEST) !== 0) {
      x++;
    } else if ((dir & DIRECTION_FLAG_EAST) !== 0) {
      x--;
    }

    if ((dir & DIRECTION_FLAG_SOUTH) !== 0) {
      y++;
    } else if ((dir & DIRECTION_FLAG_NORTH) !== 0) {
      y--;
    }
  }

  reversePath.reverse();
  return reversePath;
}

export function findPathToNpc(
  start: Coordinate,
  npcPos: Coordinate,
  npcSize: number,
  attackRange: number,
  excludeUnderNpc: boolean = false,
): Coordinate[] {
  const [startX, startY] = start;

  // A destination only counts if the player could actually attack from it — range AND
  // the obstruction test for that range. Accepting bare range would strand the player
  // on a line-of-sight-dead tile: in range so the pathfinder stops, unable to see the
  // target so the auto-attack never fires. TzKal-Zuk's alcove has six such tiles.
  if (hasAttackReach(startX, startY, npcPos[0], npcPos[1], npcSize, attackRange)) {
    if (!excludeUnderNpc || !isUnderNpcRaw(startX, startY, npcPos[0], npcPos[1], npcSize)) {
      return [];
    }
  }

  const GRID_SIZE = 128;
  const centerX = GRID_SIZE >> 1;
  const centerY = GRID_SIZE >> 1;
  const baseX = startX - centerX;
  const baseY = startY - centerY;

  const distances: number[][] = [];
  const directionGrid: number[][] = [];
  for (let i = 0; i < GRID_SIZE; i++) {
    distances[i] = new Array(GRID_SIZE).fill(UNVISITED_DISTANCE);
    directionGrid[i] = new Array(GRID_SIZE).fill(0);
  }

  const queueSize = nextPow2(GRID_SIZE * GRID_SIZE);
  const queueMask = queueSize - 1;
  const queueX = new Int32Array(queueSize);
  const queueY = new Int32Array(queueSize);

  directionGrid[centerX][centerY] = DIRECTION_START;
  distances[centerX][centerY] = 0;
  let writeIndex = 0;
  let readIndex = 0;
  queueX[writeIndex] = startX;
  queueY[writeIndex] = startY;
  writeIndex = (writeIndex + 1) & queueMask;

  let reached = false;
  let resultX = startX;
  let resultY = startY;

  const collisionMap = getCollisionMap();

  while (readIndex !== writeIndex) {
    const curX = queueX[readIndex];
    const curY = queueY[readIndex];
    readIndex = (readIndex + 1) & queueMask;
    const localX = curX - baseX;
    const localY = curY - baseY;

    if (hasAttackReach(curX, curY, npcPos[0], npcPos[1], npcSize, attackRange)) {
      if (!excludeUnderNpc || !isUnderNpcRaw(curX, curY, npcPos[0], npcPos[1], npcSize)) {
        resultX = curX;
        resultY = curY;
        reached = true;
        break;
      }
    }

    const cost = distances[localX][localY] + 1;

    for (let dirIdx = 0; dirIdx < 8; dirIdx++) {
      const [dx, dy] = DIRECTION_DELTAS[dirIdx];
      const nextX = curX + dx;
      const nextY = curY + dy;
      const nextLocalX = nextX - baseX;
      const nextLocalY = nextY - baseY;

      if (nextLocalX < 0 || nextLocalX >= GRID_SIZE || nextLocalY < 0 || nextLocalY >= GRID_SIZE) {
        continue;
      }
      if (directionGrid[nextLocalX][nextLocalY] !== 0) {
        continue;
      }
      if (!isWalkableTile(nextX, nextY)) {
        continue;
      }

      let blocked = false;
      if (collisionMap) {
        if (dirIdx < 4) {
          blocked = collisionMap.hasFlag(nextX, nextY, CARDINAL_BLOCK_FLAGS[dirIdx]);
        } else {
          const diagIdx = dirIdx - 4;
          const [diagFlag, cardXFlag, cardYFlag] = DIAGONAL_BLOCK_FLAGS[diagIdx];
          blocked =
            collisionMap.hasFlag(nextX, nextY, diagFlag) ||
            collisionMap.hasFlag(curX + dx, curY, cardXFlag) ||
            collisionMap.hasFlag(curX, curY + dy, cardYFlag);
        }
      }

      if (blocked) continue;

      directionGrid[nextLocalX][nextLocalY] = DIRECTION_FLAGS[dirIdx];
      distances[nextLocalX][nextLocalY] = cost;
      queueX[writeIndex] = nextX;
      queueY[writeIndex] = nextY;
      writeIndex = (writeIndex + 1) & queueMask;
    }
  }

  if (!reached) {
    const npcMaxX = npcPos[0] + npcSize - 1;
    const npcMaxY = npcPos[1] + npcSize - 1;
    let bestDistSq = Infinity;
    let bestBfsDist = Infinity;
    const searchRadius = FALLBACK_RADIUS + npcSize + attackRange;

    for (let x = npcPos[0] - searchRadius; x <= npcMaxX + searchRadius; x++) {
      for (let y = npcPos[1] - searchRadius; y <= npcMaxY + searchRadius; y++) {
        const lx = x - baseX;
        const ly = y - baseY;
        if (lx < 0 || ly < 0 || lx >= GRID_SIZE || ly >= GRID_SIZE) continue;
        if (distances[lx][ly] >= MAX_FALLBACK_BFS_DISTANCE) continue;

        const edgeDx = x < npcPos[0] ? npcPos[0] - x : x > npcMaxX ? x - npcMaxX : 0;
        const edgeDy = y < npcPos[1] ? npcPos[1] - y : y > npcMaxY ? y - npcMaxY : 0;
        const distSq = edgeDx * edgeDx + edgeDy * edgeDy;

        if (distSq < bestDistSq || (distSq === bestDistSq && distances[lx][ly] < bestBfsDist)) {
          bestDistSq = distSq;
          bestBfsDist = distances[lx][ly];
          resultX = x;
          resultY = y;
        }
      }
    }

    if (bestDistSq === Infinity) return [];
  }

  if (resultX === startX && resultY === startY) return [];

  return reconstructPathFromDirections(directionGrid, baseX, baseY, startX, startY, resultX, resultY);
}

function nextPow2(n: number): number {
  let v = Math.max(16, n);
  v--;
  v |= v >> 1;
  v |= v >> 2;
  v |= v >> 4;
  v |= v >> 8;
  v |= v >> 16;
  v++;
  return v;
}
