import type { GameEvent } from '../../core/events/types';
import type { NpcSnapshot, SimulationState } from '../../types/simulation';

/** The part of a replay frame's state that the effect, actor and primary-cue indexes read. */
export interface ReplayEffectSourceState
  extends Pick<
    SimulationState,
    | 'currentTick'
    | 'playerPosition'
    | 'playerPreviousPosition'
    | 'playerMovementPath'
    | 'primaryNpcPosition'
    | 'primaryNpcSize'
  > {
  readonly playerEquipment: Pick<SimulationState['playerEquipment'], 'weapon' | 'shield'>;
  readonly npcs: readonly NpcSnapshot[];
}

export interface ReplayEffectSourceFrame {
  readonly state: ReplayEffectSourceState;
  readonly events: GameEvent[];
}
