import type { StartPositionStep } from '../core/SimulationEngine';

/**
 * The live countdown positioning walk, for the viewports only: never in SimulationState, the replay
 * timeline or a recording. The tick stays 0 throughout, so a viewport that keys movement on the tick
 * would never animate these steps; it feeds each `sequence` once instead.
 */
export interface StartPositionPreparation {
  /** One countdown boundary (a fresh start); a viewport seeing a new one never replays an old sequence. */
  readonly boundary: object;
  /** Counts this boundary's steps from 1; each value is one step to animate exactly once. */
  readonly sequence: number;
  readonly step: StartPositionStep;
  /** Active-clock (`animationFrames.clock`) time the step was taken: its one interval starts here. */
  readonly steppedAtMs: number;
}
