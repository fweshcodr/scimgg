import type { EncounterCommand } from '../../core/encounters/commands';
import type { EncounterCompletionOwnership } from '../../core/encounters/types';
import type { GameEvent } from '../../core/events/types';
import type { EngineAction } from '../../core/SimulationEngine';
import type { Coordinate, MechanicsConfig, SimulationState } from '../../types/simulation';
import type { DemoCursorCue, DemoCursorTrack, Tutorial, TutorialStep } from '../types';

/**
 * Bridge between the TutorialDirector and the live simulation.
 * Implementations are provided by `useTutorialDirector` to wire up React state.
 *
 * All side-effect methods are synchronous — long-running waits (e.g. `wait-ticks`)
 * are handled by the director using `subscribeTickAdvance` from the wiring layer.
 */
export interface TutorialDirectorAdapter {
  enterEncounter(encounterKind: string): void;
  enterLobby(): void;
  resetEncounter(completionOwnership?: EncounterCompletionOwnership): void;
  setMechanics(config: Partial<MechanicsConfig>): void;
  activateTilePreset(presetId: string): void;
  deactivateTilePresets(): void;

  pauseSim(): void;
  resumeSim(): void;
  setTickScale(scale: number): void;
  setCompletionOwnership?(ownership: EncounterCompletionOwnership): void;
  injectAction(action: EngineAction): void;
  setTargetTile(tile: Coordinate | null): void;
  castMarkOfDarkness(): void;
  executeEncounterCommand(command: EncounterCommand): boolean;
  /**
   * Seek the encounter forward to `toTick` (completing the landing intro first).
   * Used by demo steps to skip dead lead-up ticks before the choreography begins.
   */
  fastForwardTicks(toTick: number): void;

  getSettledEncounterKind(): string | null;
  getState(): SimulationState;
  getPlayerPosition(): Coordinate;

  subscribeTickAdvance(handler: (tick: number, events: GameEvent[]) => void): () => void;
}

export type DirectorPhase = 'idle' | 'running' | 'awaiting-user' | 'paused' | 'failed' | 'complete';

export interface DirectorBannerMessage {
  text: string;
  tone: 'info' | 'success' | 'warning' | 'error';
  clearAfterMs?: number;
}

/**
 * Runtime token the director publishes when a demo step with a cursor track
 * starts — set AFTER the demo's setup completes (see TutorialDirector.runDemo),
 * which avoids the race where `currentStep` is published before setup finishes.
 * The React DemoCursorLayer consumes it to play the choreography; `id` changes
 * per playback so the layer restarts cleanly on replay. Null when inactive.
 */
export interface DemoCursorSession {
  id: string;
  stepIndex: number;
  track: DemoCursorTrack;
  tickMs: number;
}

export interface DemoPlaybackFrame {
  demoTickOffset: number;
  engineTick: number;
  state: SimulationState;
  events: GameEvent[];
}

export interface DemoPlaybackSession {
  stepIndex: number;
  /** 'recording' while the demo plays live (transport = progress + pause); 'review' once finished (full snapshot scrub). */
  mode: 'recording' | 'review';
  frames: DemoPlaybackFrame[];
  /** Cursor choreography from the demo step, for scrubbing the guide cursor during review. */
  cues: readonly DemoCursorCue[];
  /** Whether this demo gates gameplay input (mirrors DemoCursorTrack.blockInput); false opts out. */
  blockInput?: boolean;
  /** ms per sim tick: resolves tick-anchored cue times and maps the playhead to a frame. */
  tickMs: number;
  /** Continuous review playhead, ms from demo start (0..durationMs). */
  playheadMs: number;
  /** Total scrubbable duration, ms = (frames.length - 1) * tickMs. */
  durationMs: number;
  /** Highest recorded ms (the live frontier); equals durationMs in review. */
  frontierMs: number;
  /** Expected total ms (stopOffset * tickMs); fills the live progress bar during recording. */
  plannedDurationMs?: number;
  isPlaying: boolean;
  speed: number;
}

export interface DirectorState {
  tutorial: Tutorial | null;
  stepIndex: number;
  currentStep: TutorialStep | null;
  phase: DirectorPhase;
  eventProgress: number;
  eventTarget: number;
  /**
   * Monotonic counter that increments each time a wait-for-event step's
   * progress is RESET by a recoverable miss (failResetsProgress). Never reset
   * to 0 by step transitions, so the UI can fire a one-shot "lost progress"
   * animation purely off a change in this value (a fresh meter mount reads the
   * current value and does NOT animate).
   */
  progressResetNonce: number;
  failPrompt: string | null;
  banner: DirectorBannerMessage | null;
  /**
   * The most recent CheckpointStep the director has seen. Used to seed
   * "Retry from checkpoint" when the player dies or fails a step.
   */
  lastCheckpointIndex: number | null;
  /**
   * Sorted, deduplicated set of step indices the user has *completed* — i.e.
   * finished naturally via `next()` or the step auto-advancing, NOT via
   * `prev()` / `goToStep` jumps. Purely a visual marker fed to the StepsList
   * checkmark UI; the director never reads this to gate or skip execution.
   * Loaded from persistence on `start()`, persisted on every change.
   */
  completedSteps: readonly number[];
  stepIntroActive: boolean;
  /** Published when a demo step's cursor track starts (post-setup); drives the DemoCursorLayer. */
  activeDemoCursor: DemoCursorSession | null;
  demoPlayback: DemoPlaybackSession | null;
}

export const INITIAL_DIRECTOR_STATE: DirectorState = {
  tutorial: null,
  stepIndex: -1,
  currentStep: null,
  phase: 'idle',
  eventProgress: 0,
  eventTarget: 0,
  progressResetNonce: 0,
  failPrompt: null,
  banner: null,
  lastCheckpointIndex: null,
  completedSteps: [],
  stepIntroActive: false,
  activeDemoCursor: null,
  demoPlayback: null,
};
