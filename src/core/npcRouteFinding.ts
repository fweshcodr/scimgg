/**
 * Simplified from RSMOD RouteFinding.kt at fa13b3f67172ef36e15d6b1514358aee61411796,
 * used under the ISC license recorded in scripts/vendoredNotices.ts.
 */
import type { Coordinate } from '../types/simulation';
import { canNpcTakeStep } from './npcMovementCollision';

export type NpcFootprintPredicate = (southWest: Coordinate, size: number) => boolean;
export type NpcStepPredicate = (current: Coordinate, candidate: Coordinate, size: number) => boolean;

export type NpcRouteResult =
  | { readonly kind: 'exact'; readonly steps: readonly Coordinate[] }
  | { readonly kind: 'alternative'; readonly steps: readonly Coordinate[] }
  | { readonly kind: 'failed' };

export type NpcRouteRequest = {
  readonly source: Coordinate;
  readonly size: number;
  readonly destination: Coordinate;
  readonly canOccupy: NpcFootprintPredicate;
  readonly canStep?: NpcStepPredicate;
  readonly moveNear?: boolean;
};

type Direction = {
  readonly deltaX: number;
  readonly deltaY: number;
};

type RouteSearchTree = {
  readonly startIndex: number;
  readonly parents: Int32Array;
  readonly base: Coordinate;
};

const SEARCH_MAP_SIZE = 128;
const SEARCH_CELL_COUNT = SEARCH_MAP_SIZE * SEARCH_MAP_SIZE;
const SOURCE_LOCAL_COORDINATE = SEARCH_MAP_SIZE / 2;
const ALTERNATIVE_ROUTE_RANGE = 10;
const ALTERNATIVE_ROUTE_MAX_DISTANCE = 100;
const UNVISITED = -1;

const DIRECTIONS: readonly Direction[] = [
  { deltaX: -1, deltaY: 0 },
  { deltaX: 1, deltaY: 0 },
  { deltaX: 0, deltaY: -1 },
  { deltaX: 0, deltaY: 1 },
  { deltaX: -1, deltaY: -1 },
  { deltaX: 1, deltaY: -1 },
  { deltaX: -1, deltaY: 1 },
  { deltaX: 1, deltaY: 1 },
] as const;

function axisDistance(minimum: number, maximum: number, coordinate: number): number {
  if (coordinate < minimum) return minimum - coordinate;
  if (coordinate > maximum) return coordinate - maximum;
  return 0;
}

export function isCoordinateInsideFootprint(southWest: Coordinate, size: number, coordinate: Coordinate): boolean {
  return (
    axisDistance(southWest[0], southWest[0] + size - 1, coordinate[0]) === 0 &&
    axisDistance(southWest[1], southWest[1] + size - 1, coordinate[1]) === 0
  );
}

function isExactMeleeArrival(southWest: Coordinate, size: number, destination: Coordinate): boolean {
  const deltaX = axisDistance(southWest[0], southWest[0] + size - 1, destination[0]);
  const deltaY = axisDistance(southWest[1], southWest[1] + size - 1, destination[1]);
  return deltaX + deltaY === 1;
}

function localIndex(localX: number, localY: number): number {
  return localX * SEARCH_MAP_SIZE + localY;
}

function reconstructSteps(endIndex: number, tree: RouteSearchTree): Coordinate[] {
  const reversed: Coordinate[] = [];
  let cursor = endIndex;
  while (cursor !== tree.startIndex) {
    const localX = Math.floor(cursor / SEARCH_MAP_SIZE);
    const localY = cursor % SEARCH_MAP_SIZE;
    reversed.push([tree.base[0] + localX, tree.base[1] + localY]);
    cursor = tree.parents[cursor];
  }
  reversed.reverse();
  return reversed;
}

function findAlternativeIndex(request: NpcRouteRequest, base: Coordinate, distances: Int16Array): number | null {
  const { destination, size } = request;
  const localDestinationX = destination[0] - base[0];
  const localDestinationY = destination[1] - base[1];
  let bestIndex: number | null = null;
  let bestCost = Number.POSITIVE_INFINITY;
  let bestDistance = ALTERNATIVE_ROUTE_MAX_DISTANCE;

  for (
    let localX = localDestinationX - ALTERNATIVE_ROUTE_RANGE;
    localX <= localDestinationX + ALTERNATIVE_ROUTE_RANGE;
    localX++
  ) {
    for (
      let localY = localDestinationY - ALTERNATIVE_ROUTE_RANGE;
      localY <= localDestinationY + ALTERNATIVE_ROUTE_RANGE;
      localY++
    ) {
      if (localX < 0 || localY < 0 || localX >= SEARCH_MAP_SIZE || localY >= SEARCH_MAP_SIZE) continue;
      const index = localIndex(localX, localY);
      const distance = distances[index];
      if (distance < 0 || distance >= ALTERNATIVE_ROUTE_MAX_DISTANCE) continue;

      const worldX = base[0] + localX;
      const worldY = base[1] + localY;
      if (isCoordinateInsideFootprint([worldX, worldY], size, destination)) continue;
      const deltaX = axisDistance(destination[0], destination[0], worldX);
      const deltaY = axisDistance(destination[1], destination[1], worldY);
      const cost = deltaX * deltaX + deltaY * deltaY;
      if (cost < bestCost || (cost === bestCost && distance < bestDistance)) {
        bestIndex = index;
        bestCost = cost;
        bestDistance = distance;
      }
    }
  }

  return bestIndex;
}

export function findNpcMeleeRoute(request: NpcRouteRequest): NpcRouteResult {
  return searchNpcRoute(request, 'melee');
}

function isTileRequestValid(request: NpcRouteRequest): boolean {
  return (
    request.source.every(Number.isInteger) &&
    request.destination.every(Number.isInteger) &&
    Number.isInteger(request.size) &&
    request.size >= 1 &&
    request.canOccupy(request.destination, request.size)
  );
}

/**
 * Exact SW-tile destination by the plain breadth-first search alone, so equal-length ties resolve
 * in neighbor order (straight steps before diagonals). Unlike {@link findNpcTileRoute}, a clear
 * straight-line path does not short-cut the search.
 */
export function findNpcExactTileRoute(request: NpcRouteRequest): NpcRouteResult {
  return isTileRequestValid(request) ? searchNpcRoute(request, 'tile') : { kind: 'failed' };
}

/** Exact SW-tile destination for roaming NPCs, rather than melee adjacency to a target actor. */
export function findNpcTileRoute(request: NpcRouteRequest): NpcRouteResult {
  if (!isTileRequestValid(request)) return { kind: 'failed' };
  // Prefer the simple diagonal-first path when clear; reuse the size-aware search for detours.
  const steps: Coordinate[] = [];
  let current = request.source;
  while (current[0] !== request.destination[0] || current[1] !== request.destination[1]) {
    const next: Coordinate = [
      current[0] + Math.sign(request.destination[0] - current[0]),
      current[1] + Math.sign(request.destination[1] - current[1]),
    ];
    if (
      !request.canOccupy(next, request.size) ||
      !canNpcTakeStep(current, next, { width: request.size, height: request.size }) ||
      request.canStep?.(current, next, request.size) === false
    )
      return searchNpcRoute(request, 'tile');
    steps.push(next);
    current = next;
  }
  return { kind: 'exact', steps };
}

function searchNpcRoute(request: NpcRouteRequest, arrival: 'melee' | 'tile'): NpcRouteResult {
  const { source, size, destination, canOccupy } = request;
  const base: Coordinate = [source[0] - SOURCE_LOCAL_COORDINATE, source[1] - SOURCE_LOCAL_COORDINATE];
  const startIndex = localIndex(SOURCE_LOCAL_COORDINATE, SOURCE_LOCAL_COORDINATE);
  const parents = new Int32Array(SEARCH_CELL_COUNT);
  parents.fill(UNVISITED);
  parents[startIndex] = startIndex;
  const distances = new Int16Array(SEARCH_CELL_COUNT);
  distances.fill(UNVISITED);
  distances[startIndex] = 0;
  const queue = new Int32Array(SEARCH_CELL_COUNT);
  queue[0] = startIndex;
  let readIndex = 0;
  let writeIndex = 1;
  const maximumLocalCoordinate = SEARCH_MAP_SIZE - size;
  const footprint = { width: size, height: size };
  const tree: RouteSearchTree = { startIndex, parents, base };

  while (readIndex < writeIndex) {
    const currentIndex = queue[readIndex++];
    const localX = Math.floor(currentIndex / SEARCH_MAP_SIZE);
    const localY = currentIndex % SEARCH_MAP_SIZE;
    const current: Coordinate = [base[0] + localX, base[1] + localY];
    if (
      arrival === 'tile'
        ? current[0] === destination[0] && current[1] === destination[1]
        : isExactMeleeArrival(current, size, destination)
    ) {
      return { kind: 'exact', steps: reconstructSteps(currentIndex, tree) };
    }

    for (const { deltaX, deltaY } of DIRECTIONS) {
      const nextLocalX = localX + deltaX;
      const nextLocalY = localY + deltaY;
      if (
        nextLocalX < 0 ||
        nextLocalY < 0 ||
        nextLocalX > maximumLocalCoordinate ||
        nextLocalY > maximumLocalCoordinate
      ) {
        continue;
      }
      const nextIndex = localIndex(nextLocalX, nextLocalY);
      if (parents[nextIndex] !== UNVISITED) continue;
      const candidate: Coordinate = [current[0] + deltaX, current[1] + deltaY];
      if (arrival === 'melee' && isCoordinateInsideFootprint(candidate, size, destination)) continue;
      if (!canOccupy(candidate, size) || !canNpcTakeStep(current, candidate, footprint)) continue;
      if (request.canStep?.(current, candidate, size) === false) continue;

      parents[nextIndex] = currentIndex;
      distances[nextIndex] = distances[currentIndex] + 1;
      queue[writeIndex++] = nextIndex;
    }
  }

  if (arrival === 'tile' || request.moveNear === false) return { kind: 'failed' };
  const alternativeIndex = findAlternativeIndex(request, base, distances);
  if (alternativeIndex === null) return { kind: 'failed' };
  return { kind: 'alternative', steps: reconstructSteps(alternativeIndex, tree) };
}
