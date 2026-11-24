import type { Coordinate } from '../types/simulation';
import type { NpcActor } from './actors/NpcActor';
import type { NpcMovementRequest } from './encounters/types';
import { canNpcTakeStep } from './npcMovementCollision';
import {
  findNpcExactTileRoute,
  findNpcMeleeRoute,
  type NpcFootprintPredicate,
  type NpcRouteResult,
} from './npcRouteFinding';

/**
 * "Sticky" pursuit: the NPC runs to a fixed tile beside the player (its slot) instead of the
 * nearest tile in reach, re-routing every tick from the player's start-of-tick tile.
 *
 * Evidence: the Fortis Colosseum Fremennik warband. With the slot taken from each member's spawn
 * offset, this reproduces 1393/1393 scored movement decisions across three wave captures, including
 * routes around the pillars, walking through the player's tile, stacking on other NPCs, and the
 * leftover-route rule (one episode). See `docs/encounters/sol-heredit-facts-spec.md`.
 */
export interface NpcStickyPursuitProfile {
  readonly size: number;
  /** Steps per tick; the warband runs two. */
  readonly maxSteps: number;
  /** South-west tile to stand on, relative to the player's tile. */
  readonly slotOffset: Readonly<Coordinate>;
  /** Tried in order when the slot tile cannot be occupied or reached. */
  readonly fallbackOffsets: readonly Readonly<Coordinate>[];
  /** Terrain and arena only: other actors and the player never block a sticky pursuer. */
  readonly canOccupy: NpcFootprintPredicate;
  /** With no usable slot: route to the nearest tile in melee reach (or the nearest reachable), or hold. */
  readonly unreachable: 'nearest-adjacent' | 'hold';
}

/** Caller-owned per-NPC state, so a reset or replay rebuild never sees another NPC's route. */
export interface NpcStickyPursuitState {
  /** The unwalked tail of the last route, resumed only when this tick's fresh route is empty. */
  remainingSteps: Coordinate[];
}

export function createNpcStickyPursuitState(): NpcStickyPursuitState {
  return { remainingSteps: [] };
}

/**
 * The route to this tick's destination: the slot, else the first usable fallback, else (with
 * 'nearest-adjacent') melee reach. `exact` means the route ends on that destination; `alternative`
 * only gets as near as it can.
 */
function routeToSlot(
  position: Coordinate,
  player: Readonly<Coordinate>,
  profile: NpcStickyPursuitProfile,
): Exclude<NpcRouteResult, { kind: 'failed' }> | null {
  const { size, canOccupy } = profile;
  for (const offset of [profile.slotOffset, ...profile.fallbackOffsets]) {
    const destination: Coordinate = [player[0] + offset[0], player[1] + offset[1]];
    const route = findNpcExactTileRoute({ source: position, destination, size, canOccupy });
    if (route.kind === 'exact') return route;
  }
  if (profile.unreachable === 'hold') return null;
  const route = findNpcMeleeRoute({ source: position, destination: [...player], size, canOccupy, moveNear: true });
  return route.kind === 'failed' ? null : route;
}

/**
 * Whether `position` already is the destination the pursuit selects for this player tile, so its
 * fresh route is empty. Pure: route state is neither read nor changed, and a leftover tail may
 * still move the NPC off it this tick.
 */
export function isAtStickyPursuitDestination(
  position: Readonly<Coordinate>,
  player: Readonly<Coordinate>,
  profile: NpcStickyPursuitProfile,
): boolean {
  const route = routeToSlot([position[0], position[1]], player, profile);
  return route?.kind === 'exact' && route.steps.length === 0;
}

function resumableSteps(position: Coordinate, state: NpcStickyPursuitState, profile: NpcStickyPursuitProfile) {
  const next = state.remainingSteps[0];
  // Anything that moved the NPC off its old route (a teleport, a preset) voids the tail.
  return next !== undefined &&
    profile.canOccupy(next, profile.size) &&
    canNpcTakeStep(position, next, { width: profile.size, height: profile.size })
    ? state.remainingSteps
    : [];
}

/** This tick's steps; updates `state` with the unwalked tail. */
export function stickyPursuitSteps(
  position: Readonly<Coordinate>,
  player: Readonly<Coordinate>,
  profile: NpcStickyPursuitProfile,
  state: NpcStickyPursuitState,
): Coordinate[] {
  const source: Coordinate = [position[0], position[1]];
  const fresh = routeToSlot(source, player, profile)?.steps ?? [];
  // On the slot (or with nowhere to go) the previous route's tail is still walked: no-sol t1801,
  // where all three members left their slots along the route set one tick earlier.
  const route = fresh.length > 0 ? fresh : resumableSteps(source, state, profile);
  const steps = route.slice(0, Math.max(0, profile.maxSteps));
  state.remainingSteps = route.slice(steps.length);
  return steps;
}

/** The movement only: whether the NPC may move this turn is its definition's call (`canNpcActThisTurn`). */
export function pursuePlayerSticky(
  npc: Pick<NpcActor, 'id' | 'position'>,
  player: Readonly<Coordinate>,
  profile: NpcStickyPursuitProfile,
  state: NpcStickyPursuitState,
): NpcMovementRequest[] {
  const path = stickyPursuitSteps(npc.position, player, profile, state);
  return path.length === 0 ? [] : [{ npcId: npc.id, path }];
}
