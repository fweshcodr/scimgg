import type { Coordinate } from '../../types/simulation';
import type { NpcMovementRequest } from '../encounters/types';

export type LinearPatrolRoute = {
  readonly endpoints: readonly [Readonly<Coordinate>, Readonly<Coordinate>];
  readonly endpointPauseTicks: number;
};

export type LinearPatrolState = {
  targetEndpoint: 0 | 1;
  nextMoveTick: number;
};

type LinearPatrolActor = {
  readonly id: string;
  readonly position: Readonly<Coordinate>;
  readonly state: Readonly<LinearPatrolState>;
};

export function calculateLinearPatrolMove(
  actor: LinearPatrolActor,
  route: LinearPatrolRoute,
  tick: number,
): { readonly movement: NpcMovementRequest; readonly state: LinearPatrolState } | null {
  // Whether the actor may move this turn is its caller's call (`canNpcActThisTurn`).
  if (tick < actor.state.nextMoveTick) return null;
  const endpoint = route.endpoints[actor.state.targetEndpoint];
  const position: Coordinate = [
    actor.position[0] + Math.sign(endpoint[0] - actor.position[0]),
    actor.position[1] + Math.sign(endpoint[1] - actor.position[1]),
  ];
  const atEndpoint = position[0] === endpoint[0] && position[1] === endpoint[1];
  return {
    movement: { npcId: actor.id, path: [position] },
    state: {
      targetEndpoint: atEndpoint ? (actor.state.targetEndpoint === 1 ? 0 : 1) : actor.state.targetEndpoint,
      nextMoveTick: tick + 1 + (atEndpoint ? route.endpointPauseTicks : 0),
    },
  };
}
