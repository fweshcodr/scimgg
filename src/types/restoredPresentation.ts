import type { ReplayDisplayFrame } from '../core/ReplayRecorder';
import type { SimulationEngine } from '../core/SimulationEngine';

/** Visual initialization for one successfully adopted engine, independent of practice metadata. */
export interface RestoredPresentation {
  readonly engine: SimulationEngine;
  readonly tick: number;
  /** The end of snapshot tick's visual interval, also the beginning of its next tick. */
  readonly timeMs: number;
  readonly history: {
    readonly frames: readonly ReplayDisplayFrame[];
    readonly throughFrameIndex: number;
  };
}
