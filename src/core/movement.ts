import type { Coordinate } from '../types/simulation';
import { findPath, findPathToNpc } from './pathfinder';

export interface MovementResult {
  position: Coordinate;
  stepTiles: Coordinate[];
}

/** Axis-aligned bounding box for NPC footprint (inclusive). */
export interface NpcBounds {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

/**
 * Takes the next one (walking) or two (running) steps of the path, whatever their directions.
 *
 * A run's two steps may turn, including two perpendicular cardinals around a corner the diagonal
 * cannot cut: every player `run` with a one-tile diagonal net move in the captures (389 across 25
 * captures, e.g. inferno-waves-1-68:3299 t653) ends the tick on the far tile, and NPC run lines
 * print such pairs outright (colosseum-no-sol:27314 `step1=south, step2=west`).
 *
 * @param bfsPath - Full BFS path (excluding start, including destination)
 */
export function walkBfsPath(
  currentPos: Coordinate,
  bfsPath: Coordinate[],
  isRunning: boolean,
  npcBounds?: NpcBounds,
): MovementResult {
  if (bfsPath.length === 0) {
    return { position: [...currentPos] as Coordinate, stepTiles: [] };
  }

  const tilesPerTick = isRunning ? 2 : 1;
  const stepTiles: Coordinate[] = [];

  for (let i = 0; i < Math.min(tilesPerTick, bfsPath.length); i++) {
    const [tx, ty] = bfsPath[i];
    if (npcBounds && tx >= npcBounds.minX && tx <= npcBounds.maxX && ty >= npcBounds.minY && ty <= npcBounds.maxY) {
      break;
    }
    stepTiles.push([tx, ty] as Coordinate);
  }

  const position = stepTiles[stepTiles.length - 1] ?? ([...currentPos] as Coordinate);
  return { position, stepTiles };
}

/**
 * One tick of walk/run movement toward a ground target, along the pathfinder's route. Without a
 * walkable set or collision map (unit tests, a cache miss), walkability is `isWalkableTile`'s
 * unbounded fallback, so the route is either over open ground or nothing.
 */
export function playerMoveAutopath(
  currentPos: Coordinate,
  targetTile: Coordinate,
  isRunning: boolean = true,
): MovementResult {
  return walkBfsPath(currentPos, findPath(currentPos, targetTile), isRunning);
}

export function playerMoveToNpc(
  currentPos: Coordinate,
  npcPos: Coordinate,
  npcSize: number,
  isRunning: boolean = true,
): MovementResult {
  // Path to NPC-adjacent (range 1) to get a full-length path.
  // This ensures we move tilesPerTick steps each tick (OSRS behavior)
  // rather than stopping at the first tile within weapon attack range.
  const bfsPath = findPathToNpc(currentPos, npcPos, npcSize, 1, true);
  return walkBfsPath(currentPos, bfsPath, isRunning);
}
