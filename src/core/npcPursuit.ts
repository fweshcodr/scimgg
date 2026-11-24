import type { Coordinate } from '../types/simulation';
import type { NpcActor } from './actors/NpcActor';
import type { NpcMovementRequest } from './encounters/types';
import { canNpcTakeStep } from './npcMovementCollision';
import {
  findNpcMeleeRoute,
  isCoordinateInsideFootprint,
  type NpcFootprintPredicate,
  type NpcStepPredicate,
} from './npcRouteFinding';

export type { NpcFootprintPredicate, NpcStepPredicate } from './npcRouteFinding';

export interface NpcPursuitProfile {
  readonly size: number;
  readonly maxSpeed: number;
  readonly canOccupy: NpcFootprintPredicate;
  readonly canStep?: NpcStepPredicate;
  readonly underFootprint: 'random-cardinal' | 'hold';
  readonly unreachable: 'nearest-reachable' | 'hold';
}

export interface NpcPursuitRequest extends NpcPursuitProfile {
  readonly bossSW: Coordinate;
  readonly player: Coordinate;
  readonly rng: () => number;
}

const MOVE_NEAR = { 'nearest-reachable': true, hold: false } as const satisfies Record<
  NpcPursuitProfile['unreachable'],
  boolean
>;

export function isPlayerUnderFootprint(southWest: Coordinate, size: number, player: Coordinate): boolean {
  return isCoordinateInsideFootprint(southWest, size, player);
}

function assertNever(value: never): never {
  throw new RangeError(`Unhandled NPC route result: ${JSON.stringify(value)}`);
}

export function npcPursuitPath(request: NpcPursuitRequest): Coordinate[] {
  const { bossSW, size, player, rng, maxSpeed, canOccupy, canStep, underFootprint, unreachable } = request;
  if (maxSpeed <= 0) return [];
  if (isPlayerUnderFootprint(bossSW, size, player)) {
    switch (underFootprint) {
      case 'hold':
        return [];
      case 'random-cardinal': {
        const horizontal = rng() < 0.5;
        const positive = rng() < 0.5;
        const step = positive ? 1 : -1;
        const candidate: Coordinate = horizontal ? [bossSW[0] + step, bossSW[1]] : [bossSW[0], bossSW[1] + step];
        if (!canOccupy(candidate, size) || canStep?.(bossSW, candidate, size) === false) return [];
        return canNpcTakeStep(bossSW, candidate, { width: size, height: size }) ? [candidate] : [];
      }
      default:
        return assertNever(underFootprint);
    }
  }

  const result = findNpcMeleeRoute({
    source: bossSW,
    size,
    destination: player,
    canOccupy,
    canStep,
    moveNear: MOVE_NEAR[unreachable],
  });
  switch (result.kind) {
    case 'exact':
    case 'alternative':
      return result.steps.slice(0, maxSpeed);
    case 'failed':
      return [];
    default:
      return assertNever(result);
  }
}

/** The movement only: whether the NPC may move this turn is its caller's call (`canNpcActThisTurn`). */
export function pursuePlayer(
  npc: Pick<NpcActor, 'id' | 'position'>,
  player: Coordinate,
  rng: () => number,
  profile: NpcPursuitProfile,
): NpcMovementRequest[] {
  const path = npcPursuitPath({
    bossSW: npc.position,
    size: profile.size,
    player,
    rng,
    maxSpeed: profile.maxSpeed,
    canOccupy: profile.canOccupy,
    canStep: profile.canStep,
    underFootprint: profile.underFootprint,
    unreachable: profile.unreachable,
  });
  return path.length === 0 ? [] : [{ npcId: npc.id, path }];
}
