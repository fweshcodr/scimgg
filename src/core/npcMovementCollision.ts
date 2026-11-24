import { CollisionFlag } from '../rs/collision/CollisionFlag';
import type { Coordinate } from '../types/simulation';
import { getArenaBounds, getCollisionMap, isInArena, isWalkableTile } from './constants';

interface EdgeMasks {
  readonly single: number;
  readonly start: number;
  readonly middle: number;
  readonly end: number;
}

interface DiagonalMasks {
  readonly corner: number;
  readonly horizontalStrip: number;
  readonly verticalStrip: number;
  readonly xIntermediate: number;
  readonly yIntermediate: number;
}

export interface NpcFootprintSize {
  readonly width: number;
  readonly height: number;
}

interface StepFootprint extends NpcFootprintSize {
  readonly southWest: Coordinate;
}

const WEST_MASKS = {
  single: CollisionFlag.BLOCK_WEST,
  start: CollisionFlag.BLOCK_SOUTH_WEST,
  middle: CollisionFlag.BLOCK_NORTH_AND_SOUTH_EAST,
  end: CollisionFlag.BLOCK_NORTH_WEST,
} as const satisfies EdgeMasks;

const EAST_MASKS = {
  single: CollisionFlag.BLOCK_EAST,
  start: CollisionFlag.BLOCK_SOUTH_EAST,
  middle: CollisionFlag.BLOCK_NORTH_AND_SOUTH_WEST,
  end: CollisionFlag.BLOCK_NORTH_EAST,
} as const satisfies EdgeMasks;

const SOUTH_MASKS = {
  single: CollisionFlag.BLOCK_SOUTH,
  start: CollisionFlag.BLOCK_SOUTH_WEST,
  middle: CollisionFlag.BLOCK_NORTH_EAST_AND_WEST,
  end: CollisionFlag.BLOCK_SOUTH_EAST,
} as const satisfies EdgeMasks;

const NORTH_MASKS = {
  single: CollisionFlag.BLOCK_NORTH,
  start: CollisionFlag.BLOCK_NORTH_WEST,
  middle: CollisionFlag.BLOCK_SOUTH_EAST_AND_WEST,
  end: CollisionFlag.BLOCK_NORTH_EAST,
} as const satisfies EdgeMasks;

const SOUTH_WEST_DIAGONAL_MASKS = {
  corner: CollisionFlag.BLOCK_SOUTH_WEST,
  horizontalStrip: CollisionFlag.BLOCK_NORTH_EAST_AND_WEST,
  verticalStrip: CollisionFlag.BLOCK_NORTH_AND_SOUTH_EAST,
  xIntermediate: CollisionFlag.BLOCK_WEST,
  yIntermediate: CollisionFlag.BLOCK_SOUTH,
} as const satisfies DiagonalMasks;

const NORTH_WEST_DIAGONAL_MASKS = {
  corner: CollisionFlag.BLOCK_NORTH_WEST,
  horizontalStrip: CollisionFlag.BLOCK_SOUTH_EAST_AND_WEST,
  verticalStrip: CollisionFlag.BLOCK_NORTH_AND_SOUTH_EAST,
  xIntermediate: CollisionFlag.BLOCK_WEST,
  yIntermediate: CollisionFlag.BLOCK_NORTH,
} as const satisfies DiagonalMasks;

const SOUTH_EAST_DIAGONAL_MASKS = {
  corner: CollisionFlag.BLOCK_SOUTH_EAST,
  horizontalStrip: CollisionFlag.BLOCK_NORTH_EAST_AND_WEST,
  verticalStrip: CollisionFlag.BLOCK_NORTH_AND_SOUTH_WEST,
  xIntermediate: CollisionFlag.BLOCK_EAST,
  yIntermediate: CollisionFlag.BLOCK_SOUTH,
} as const satisfies DiagonalMasks;

const NORTH_EAST_DIAGONAL_MASKS = {
  corner: CollisionFlag.BLOCK_NORTH_EAST,
  horizontalStrip: CollisionFlag.BLOCK_SOUTH_EAST_AND_WEST,
  verticalStrip: CollisionFlag.BLOCK_NORTH_AND_SOUTH_WEST,
  xIntermediate: CollisionFlag.BLOCK_EAST,
  yIntermediate: CollisionFlag.BLOCK_NORTH,
} as const satisfies DiagonalMasks;

function masksForDelta(deltaX: number, deltaY: number): EdgeMasks | null {
  if (deltaX === -1 && deltaY === 0) return WEST_MASKS;
  if (deltaX === 1 && deltaY === 0) return EAST_MASKS;
  if (deltaX === 0 && deltaY === -1) return SOUTH_MASKS;
  if (deltaX === 0 && deltaY === 1) return NORTH_MASKS;
  return null;
}

function diagonalMasksForDelta(deltaX: number, deltaY: number): DiagonalMasks | null {
  if (deltaX === -1 && deltaY === -1) return SOUTH_WEST_DIAGONAL_MASKS;
  if (deltaX === -1 && deltaY === 1) return NORTH_WEST_DIAGONAL_MASKS;
  if (deltaX === 1 && deltaY === -1) return SOUTH_EAST_DIAGONAL_MASKS;
  if (deltaX === 1 && deltaY === 1) return NORTH_EAST_DIAGONAL_MASKS;
  return null;
}

function isFootprintWithinBounds(candidateSW: Coordinate, width: number, height: number): boolean {
  const bounds = getArenaBounds();
  return (
    !bounds ||
    (candidateSW[0] >= bounds.minX &&
      candidateSW[1] >= bounds.minY &&
      candidateSW[0] + width - 1 <= bounds.maxX &&
      candidateSW[1] + height - 1 <= bounds.maxY)
  );
}

function canEnterLeadingEdge(footprint: StepFootprint, delta: Coordinate): boolean {
  const { southWest: candidateSW, width, height } = footprint;
  const [deltaX, deltaY] = delta;
  const masks = masksForDelta(deltaX, deltaY);
  if (!masks) return false;

  const horizontal = deltaY === 0;
  const edgeLength = horizontal ? height : width;
  const startX = deltaX === 1 ? candidateSW[0] + width - 1 : candidateSW[0];
  const startY = deltaY === 1 ? candidateSW[1] + height - 1 : candidateSW[1];
  const collisionMap = getCollisionMap();

  for (let index = 0; index < edgeLength; index++) {
    const x = startX + (horizontal ? 0 : index);
    const y = startY + (horizontal ? index : 0);
    if (!isWalkableTile(x, y)) return false;

    const mask =
      edgeLength === 1 ? masks.single : index === 0 ? masks.start : index === edgeLength - 1 ? masks.end : masks.middle;
    if (collisionMap?.hasFlag(x, y, mask)) return false;
  }

  return true;
}

function canEnterDiagonal(currentSW: Coordinate, footprint: StepFootprint, delta: Coordinate): boolean {
  const { southWest: candidateSW, width, height } = footprint;
  const [deltaX, deltaY] = delta;
  const masks = diagonalMasksForDelta(deltaX, deltaY);
  if (!masks) return false;

  const collisionMap = getCollisionMap();
  const canEnter = (x: number, y: number, mask: number): boolean =>
    isWalkableTile(x, y) && !collisionMap?.hasFlag(x, y, mask);

  if (width === 1 && height === 1) {
    return (
      canEnter(candidateSW[0], candidateSW[1], masks.corner) &&
      canEnter(currentSW[0] + deltaX, currentSW[1], masks.xIntermediate) &&
      canEnter(currentSW[0], currentSW[1] + deltaY, masks.yIntermediate)
    );
  }

  const cornerX = deltaX > 0 ? candidateSW[0] + width - 1 : candidateSW[0];
  const cornerY = deltaY > 0 ? candidateSW[1] + height - 1 : candidateSW[1];
  if (!canEnter(cornerX, cornerY, masks.corner)) return false;

  // OSRS actor footprints are square. Applying each strip over its own axis is a simulator-only rectangular extension.
  for (let offset = 1; offset < width; offset++) {
    const x = cornerX - deltaX * offset;
    if (!canEnter(x, cornerY, masks.horizontalStrip)) return false;
  }
  for (let offset = 1; offset < height; offset++) {
    const y = cornerY - deltaY * offset;
    if (!canEnter(cornerX, y, masks.verticalStrip)) return false;
  }

  return true;
}

export function canNpcTakeStep(currentSW: Coordinate, candidateSW: Coordinate, size: NpcFootprintSize): boolean {
  const { width, height } = size;
  if (!Number.isInteger(width) || width < 1 || !Number.isInteger(height) || height < 1) return false;
  const deltaX = candidateSW[0] - currentSW[0];
  const deltaY = candidateSW[1] - currentSW[1];
  if (deltaX === 0 && deltaY === 0) return false;
  if (Math.abs(deltaX) > 1 || Math.abs(deltaY) > 1) return false;
  if (!isFootprintWithinBounds(candidateSW, width, height)) return false;
  const footprint = { southWest: candidateSW, width, height };
  if (deltaX !== 0 && deltaY !== 0) return canEnterDiagonal(currentSW, footprint, [deltaX, deltaY]);
  if (deltaX !== 0 && !canEnterLeadingEdge(footprint, [deltaX, 0])) return false;
  if (deltaY !== 0 && !canEnterLeadingEdge(footprint, [0, deltaY])) return false;
  return true;
}

/** Every footprint tile is inside the arena and walkable; actors are not considered. */
export function isArenaFootprintWalkable(southWest: Coordinate, size: number): boolean {
  for (let x = southWest[0]; x < southWest[0] + size; x++) {
    for (let y = southWest[1]; y < southWest[1] + size; y++) {
      if (!isInArena(x, y) || !isWalkableTile(x, y)) return false;
    }
  }
  return true;
}

export function canNpcTakeCardinalStep(currentSW: Coordinate, candidateSW: Coordinate, size: number): boolean {
  const deltaX = candidateSW[0] - currentSW[0];
  const deltaY = candidateSW[1] - currentSW[1];
  if (Math.abs(deltaX) + Math.abs(deltaY) !== 1) return false;
  return canNpcTakeStep(currentSW, candidateSW, { width: size, height: size });
}
