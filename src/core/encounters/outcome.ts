import type { ActorId } from '../actors/types';

type CompletedEncounterOutcome = {
  readonly decisiveTick: number;
  readonly completionTick: number;
  readonly primaryActorId: ActorId;
  readonly completionActorIds: readonly ActorId[];
};

export type EncounterOutcome =
  | { readonly phase: 'active' }
  | ({ readonly phase: 'resolving' } & CompletedEncounterOutcome)
  | ({ readonly phase: 'victory' } & CompletedEncounterOutcome);

export const ACTIVE_ENCOUNTER_OUTCOME: EncounterOutcome = { phase: 'active' };
