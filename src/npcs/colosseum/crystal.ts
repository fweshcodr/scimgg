import { createNpcDefinition, type DefinedNpcActor } from '../../core/npcs';
import type { Coordinate } from '../../types/simulation';
import { createColosseumActor } from './actors';
import { BEAM_LINE_LENGTH, CRYSTAL_STEP_INTERVAL_TICKS } from './constants';
import type { CardinalDirection } from './solAttacks';

// Capture analysis section 2.2: fixed edges, recorded reversal tiles, inward travel directions.
// `spawn` is a fixed MODEL value, but the captured spawn tiles vary, all within 2 of the low end:
// north x29 in K/M/N but x27 in A and L (possibly a game update, possibly chance), east y29-31,
// south x28-29, west y30-31. Varied spawns are not modeled, so the encounter's crystals never
// meet the low-end first-step delay in `createCrystal`.
export const BEAM_CRYSTAL_EDGES = [
  { edge: 'north', fixed: 41, from: 27, to: 38, step: [0, -1], direction: 'south', spawn: 29 },
  { edge: 'east', fixed: 39, from: 29, to: 40, step: [-1, 0], direction: 'west', spawn: 31 },
  { edge: 'south', fixed: 28, from: 27, to: 38, step: [0, 1], direction: 'north', spawn: 28 },
  { edge: 'west', fixed: 26, from: 29, to: 40, step: [1, 0], direction: 'east', spawn: 31 },
] as const;

export interface CrystalState {
  readonly index: number;
  direction: 1 | -1;
  firstStepTaken: boolean;
  nextStepTick: number;
  charging: boolean;
}
export type CrystalActor = DefinedNpcActor<CrystalState>;

export const crystalDefinition = createNpcDefinition<CrystalState, undefined>({
  id: 'colosseum-beam-crystal',
  move: ({ actor, context }) => {
    const state = actor.state;
    if (!actor.alive || state.charging || context.tick < state.nextStepTick) return [];
    const edge = BEAM_CRYSTAL_EDGES[state.index];
    const along = edge.edge === 'north' || edge.edge === 'south' ? actor.position[0] : actor.position[1];
    let next = along + state.direction;
    if (next < edge.from || next > edge.to) {
      state.direction = state.direction === 1 ? -1 : 1;
      next = along + state.direction;
    }
    // Every crystal's first step goes toward its edge's low end and every second step heads back
    // up it (12/12 across K/M/N, e.g. N 7461 x28 then 7473 x29, short of the x27 end). One spawned
    // on the low end reverses at once and steps up (L:3982, A:5137, N:7574).
    if (!state.firstStepTaken) {
      state.firstStepTaken = true;
      state.direction = 1;
    }
    state.nextStepTick = context.tick + CRYSTAL_STEP_INTERVAL_TICKS;
    return [{ npcId: actor.id, path: [crystalTile(state.index, next)] }];
  },
});

/**
 * `spawnAlong` is the spawn tile's coordinate along the edge, defaulting to the model's fixed spawn;
 * capture replays pass the recorded one.
 */
export function createCrystal(input: {
  readonly id: string;
  readonly index: number;
  readonly tick: number;
  readonly charging: boolean;
  readonly spawnAlong?: number;
}): CrystalActor {
  const edge = BEAM_CRYSTAL_EDGES[input.index];
  const spawnAlong = input.spawnAlong ?? edge.spawn;
  if (spawnAlong < edge.from || spawnAlong > edge.to)
    throw new RangeError(`Crystal ${input.index} cannot spawn at ${spawnAlong}, off its ${edge.edge} edge`);
  return crystalDefinition.createActor(
    {
      ...createColosseumActor('beam_crystal', input.id, crystalTile(input.index, spawnAlong)),
      spawnTick: input.tick,
    },
    {
      index: input.index,
      direction: -1,
      firstStepTaken: false,
      // VERIFIED: a crystal spawned on its edge's low end first steps at +4 (L:3978->3982,
      // A:5133->5137, N:7570->7574), every other spawn at +3 (15/15 across K/M/N/A/L).
      nextStepTick: input.tick + (spawnAlong === edge.from ? 4 : 3),
      charging: input.charging,
    },
  );
}

export function crystalTile(index: number, alongEdge: number): Coordinate {
  const edge = BEAM_CRYSTAL_EDGES[index];
  return edge.edge === 'north' || edge.edge === 'south' ? [alongEdge, edge.fixed] : [edge.fixed, alongEdge];
}

export function beamLineTiles(index: number, origin: Readonly<Coordinate>): Coordinate[] {
  const edge = BEAM_CRYSTAL_EDGES[index];
  return Array.from({ length: BEAM_LINE_LENGTH }, (_, offset) => [
    origin[0] + edge.step[0] * (offset + 1),
    origin[1] + edge.step[1] * (offset + 1),
  ]);
}

export function crystalBeamDirection(index: number): CardinalDirection {
  return BEAM_CRYSTAL_EDGES[index].direction;
}
