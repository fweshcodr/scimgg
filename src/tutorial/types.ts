import type { Alignment, Side } from 'driver.js';
import type { GameEvent } from '../core/events/types';
import type { EngineAction } from '../core/SimulationEngine';
import type { GamePanelTab } from '../hooks/keybindStore';
import type { Coordinate, MechanicsConfig, PrayerType } from '../types/simulation';
import type { TutorialEncounterCommandId } from './encounterCommands';

export type TutorialStepCategory = 'navigation' | 'combat' | 'settings' | 'info';

export interface TutorialAction {
  event: string;
  waitingText: string;
  completedText: string;
  validate?: (detail: unknown) => boolean;
  autoAdvance?: boolean;
}

export interface ResumeGuard {
  isReady: () => boolean;
  /** Index in the ORIGINAL (pre-filter) step array to jump to if isReady() fails */
  fallbackStep: number;
}

export interface SpotlightStep {
  kind: 'spotlight';
  /** CSS selector or function returning an element. Omit for centered modal. */
  element?: string | (() => Element | null);
  popover: {
    title: string;
    description: string;
    side?: Side;
    align?: Alignment;
  };
  category?: TutorialStepCategory;
  skipIfMissing?: boolean;
  /**
   * The target exists only in some runs (an encounter-only plugin row, say), so the Training picker
   * leaves the step out of the tour's step count. Pair with `skipIfMissing`.
   */
  conditional?: boolean;
  /**
   * Dropped on a touch-only device: the step needs a mouse or keyboard, or points at desktop chrome
   * the Mobile layout (which every touch device uses) does not have.
   */
  desktopOnly?: boolean;
  /**
   * Copy shown instead on a touch-only device (the same test as `desktopOnly`), where the default
   * names a mouse or keyboard: a right-click, a key, a shortcut. Prefer wording that suits both;
   * use this only where the instructions really differ.
   */
  touch?: {
    title?: string;
    description?: string;
    waitingText?: string;
    completedText?: string;
  };
  action?: TutorialAction;
  resumeGuard?: ResumeGuard;
  onEnter?: () => void;
  onExit?: () => void;
}

/** Centered modal-style info step. Body may contain HTML. */
export interface InfoStep {
  kind: 'info';
  title: string;
  /** HTML allowed (rendered via dangerouslySetInnerHTML inside the overlay). */
  body: string;
  /** Optional inline image (rendered above body). */
  imageUrl?: string;
  /** Optional embedded video (uses TutorialVideoPlayer). */
  videoUrl?: string;
  videoPosterUrl?: string;
  /** Label for the advance button. Defaults to "Continue". */
  continueLabel?: string;
  /** Optional world-space highlight (e.g. gold outline around an NPC) drawn behind the codex panel. */
  highlight?: WorldHighlightTarget;
}

export interface VideoStep {
  kind: 'video';
  title: string;
  body?: string;
  videoUrl: string;
  posterUrl?: string;
  loop?: boolean;
  autoplay?: boolean;
  continueLabel?: string;
}

export type EncounterControlAction =
  | { type: 'enter-encounter'; encounterKind: string }
  | { type: 'enter-lobby' }
  | { type: 'set-mechanics'; mechanics: Partial<MechanicsConfig> }
  | { type: 'reset' }
  | { type: 'pause' }
  | { type: 'resume' }
  | { type: 'set-tick-scale'; scale: number }
  | { type: 'set-target-tile'; tile: Coordinate | null }
  | { type: 'inject-action'; action: EngineAction }
  | { type: 'wait-ticks'; ticks: number }
  | { type: 'cast-mark-of-darkness' }
  | { type: 'encounter-command'; commandId: TutorialEncounterCommandId }
  | { type: 'activate-tile-preset'; presetId: string }
  | { type: 'deactivate-tile-presets' }
  | { type: 'fast-forward-ticks'; toTick: number };

/**
 * Encounter-control step — performs side effects against the simulation.
 * Runs `actions` sequentially through the director adapter, then advances.
 */
export interface EncounterControlStep {
  kind: 'encounter-control';
  /** Optional banner shown briefly while actions execute. */
  title?: string;
  body?: string;
  actions: EncounterControlAction[];
  /** If false, requires user click on Continue after actions resolve. Default true. */
  autoAdvance?: boolean;
  /** ms to wait before auto-advancing (lets user read banner). Default 0. */
  advanceDelayMs?: number;
}

export type WorldHighlightTarget =
  | { type: 'tile'; tile: Coordinate }
  | { type: 'tiles'; tiles: Coordinate[] }
  | { type: 'npc'; actorId: string }
  | { type: 'player' }
  | { type: 'tile-region'; bounds: { x: number; y: number; width: number; height: number } };

export type WorldHighlightAdvance =
  | { type: 'click-target' }
  | { type: 'event'; eventName: string; matcher?: (event: GameEvent) => boolean }
  | { type: 'continue' }
  | { type: 'player-on-target' };

export interface WorldHighlightStep {
  kind: 'world-highlight';
  title: string;
  body: string;
  target: WorldHighlightTarget;
  advanceOn: WorldHighlightAdvance;
  /** If true, pause sim while step is active. Default false. */
  pauseSim?: boolean;
  /**
   * Optional encounter setup actions run BEFORE the step's main behavior.
   * Lets a single step own its preceding reset/mechanics/preset configuration
   * instead of pairing with a separate encounter-control step. Actions execute
   * in order; if any are async (e.g. enter-encounter) the step waits for them.
   */
  setup?: readonly EncounterControlAction[];
}

export interface WaitForEventStep {
  kind: 'wait-for-event';
  title: string;
  body: string;
  eventName: string;
  matcher?: (event: GameEvent) => boolean;
  count?: number;
  failEventName?: string;
  failMatcher?: (event: GameEvent) => boolean;
  /**
   * When true, a fired fail event RESETS progress to 0 and the step keeps
   * running instead of hard-failing to the retry screen. Use for "do N in a
   * row" drills where a mistake costs the streak but the encounter continues
   * (e.g. pray correctly against 2 consecutive attacks).
   */
  failResetsProgress?: boolean;
  timeoutTicks?: number;
  failPrompt?: string;
  successMessage?: string;
  /**
   * Optional encounter setup actions run BEFORE subscribing to the target
   * event. Lets a single step own its preceding reset/mechanics/spawn-flare
   * configuration instead of pairing with a separate encounter-control step.
   * Actions execute in order; if any are async (e.g. enter-encounter) the
   * subscription waits for them to finish. The subscription does NOT see any
   * events fired during setup — it attaches afterwards, so setup actions like
   * `reset` or `encounter-command` will not falsely tick the event counter.
   */
  setup?: readonly EncounterControlAction[];
}

/**
 * Saves what to seed when the user presses "Retry from checkpoint".
 * The director snapshots the seed; on retry, it re-runs the seed actions
 * and restarts the tutorial pointer at this checkpoint step.
 */
export interface CheckpointStep {
  kind: 'checkpoint';
  title: string;
  body: string;
  seed: {
    encounterKind: string;
    mechanics?: Partial<MechanicsConfig>;
    activatePresetId?: string;
    encounterCommandIds?: readonly TutorialEncounterCommandId[];
  };
  /** Label for the advance button. Defaults to "Continue". */
  continueLabel?: string;
  /** Whether the step also auto-advances. Default true. */
  autoAdvance?: boolean;
}

export interface DemoScriptedAction {
  tickOffset: number;
  action?: EngineAction;
  clickTarget?: Coordinate;
  annotation?: string;
}

/**
 * A target the demonstration cursor can point at. Semantic and content-safe:
 * content names WHAT to point at, never raw DOM selectors (except the explicit
 * `selector` escape hatch). Resolved to a DOM element in the React layer
 * (see cursorTargets.ts), so the content layer never imports DOM details.
 *
 * Extend by adding a variant here AND a resolver in cursorTargets.ts.
 */
export type DemoCursorTarget =
  | { kind: 'panel-tab'; tab: GamePanelTab }
  | { kind: 'prayer'; prayer: PrayerType }
  | { kind: 'selector'; selector: string };

/**
 * When a cursor cue fires, in the demo's own timeline. `ms` is wall-clock from
 * demo start; `tick` anchors to the sim tick grid (converted via the session's
 * tickMs) with an optional fine `offsetMs`.
 */
export type DemoCursorTime = { kind: 'ms'; ms: number } | { kind: 'tick'; tick: number; offsetMs?: number };

/** One cursor move (+ optional click) in a demo's cursor choreography. */
export interface DemoCursorCue {
  /** When the cursor should ARRIVE at the target (and click, if any). */
  time: DemoCursorTime;
  target: DemoCursorTarget;
  /** Glide duration to this target. Default DEMO_CURSOR_DEFAULT_MOVE_MS. */
  moveMs?: number;
  /** If true (default), dispatch a synthetic click on the resolved element. */
  click?: boolean;
  /** Caption shown beside the cursor while moving/clicking. */
  label?: string;
  /** If true (default), a missing target fails the step instead of skipping. */
  required?: boolean;
}

/** Color tone for a rule-card cue (the attack tell); mapped to a themed color in the React layer. */
export type DemoCursorCueTone = 'fire' | 'shadow';
/** One "see this, pray that" row in a demo's rule card. */
export interface DemoCursorRuleRow {
  /** The attack tell to watch for, e.g. "Fire". */
  cue: string;
  /** Warm/cool tone for the cue word + swatch. */
  tone: DemoCursorCueTone;
  /** The prayer to activate in response, e.g. "Protect from Magic". */
  prayer: string;
}
export interface DemoCursorCaption {
  rows: readonly DemoCursorRuleRow[];
}

/** Cursor choreography for a demo step. Played in the React layer in real time. */
export interface DemoCursorTrack {
  cues: readonly DemoCursorCue[];
  /** Block real user input for the demo's duration. Default true. */
  blockInput?: boolean;
  /** Optional persistent instruction caption (rule key) shown during the demo. */
  caption?: DemoCursorCaption;
}

/** Demo step — engine plays scripted player actions while the user watches. */
export interface DemoStep {
  kind: 'demo';
  title: string;
  body: string;
  scriptedActions: DemoScriptedAction[];
  /** Tick offset at which to stop the demo. Defaults to last action's offset + 1. */
  stopAtTickOffset?: number;
  /** Optional event whose first occurrence ends the demo. */
  finishOnEvent?: string;
  /** If true, show "Watch Again" button. Default true. */
  allowReplay?: boolean;
  /**
   * Optional encounter setup actions run BEFORE the demo begins (in addition
   * to / instead of the `resetBefore` and `mechanics` shorthands). Use this
   * when the demo needs spawning or preset activation that the shorthands
   * can't express.
   */
  setup?: readonly EncounterControlAction[];
  /** If set, applied via set-mechanics before the demo runs. */
  mechanics?: Partial<MechanicsConfig>;
  /** If true, encounter-control reset before the demo runs. Default true. */
  resetBefore?: boolean;
  /**
   * Optional demonstration-cursor choreography. When present, a fake cursor
   * glides to real UI elements and clicks them (see DemoCursorLayer), playing
   * in real time alongside the tick-based scriptedActions.
   */
  cursor?: DemoCursorTrack;
}

/**
 * Discriminated union of every tutorial step kind.
 * Use `step.kind` to narrow.
 */
export type TutorialStep =
  | SpotlightStep
  | InfoStep
  | VideoStep
  | EncounterControlStep
  | WorldHighlightStep
  | WaitForEventStep
  | CheckpointStep
  | DemoStep;

export type TutorialDifficulty = 'beginner' | 'intermediate' | 'advanced';

/**
 * Which top-level surface the tutorial lives under in the Training picker.
 *   app       — onboarding & cross-cutting product tutorials (Getting Started, Advanced Tools).
 *   encounter — tutorials tied to a specific encounter (Yama, future bosses).
 */
export type TutorialSurface = 'app' | 'encounter';

export interface Tutorial {
  id: string;
  slug?: string;
  title: string;
  description: string;
  surface: TutorialSurface;
  difficulty?: TutorialDifficulty;
  estimatedDurationMin?: number;
  prerequisites?: string[];
  /**
   * Publication state. 'wip' tutorials are omitted from the Training picker
   * and its completion counts, so players cannot start them; the UI harness
   * can still open one by id. Defaults to 'available'.
   */
  availability?: 'available' | 'wip';
  /** Encounter context this tutorial drives (combat tutorials only). */
  encounterContext?: {
    kind: string;
    autoEnter?: boolean;
    /** Optional EQUIPMENT_PRESETS key applied before the encounter loads. */
    equipmentPresetKey?: string;
  };

  thumbnailUrl?: string;
  introVideoUrl?: string;
  steps: TutorialStep[];
}

/**
 * A single track inside a Training course. Each track groups tutorials under
 * a section label. The id is course-local — just a stable string the modal
 * uses for keys and (eventually) URL fragments.
 */
export interface TrainingTrack {
  id: string;
  label: string;
  tutorialIds: readonly string[];
}

/**
 * Top-level Training course. Each course represents one node in the picker's
 * course rail. App courses (Getting Started, Advanced Tools) are not tied to
 * any encounter; Encounter courses are bound to an encounter kind.
 */
export interface TrainingCourse {
  id: string;
  /**
   * URL-friendly slug, defaults to id. Reserved for future permalink / SEO
   * routing — declared and populated, but not read anywhere yet.
   */
  slug?: string;
  title: string;
  /** Optional short description shown beneath the curriculum title. */
  description?: string;
  surface: TutorialSurface;
  /** Short eyebrow text shown above the curriculum title, e.g. 'App · Onboarding'. */
  eyebrow?: string;
  /** For encounter courses, the encounter kind this course is bound to. */
  encounterKind?: string;
  /** Ordered tracks (renders top-to-bottom in the curriculum). */
  tracks: readonly TrainingTrack[];
}

/**
 * True if every step in the tutorial is a spotlight step. Onboarding tutorials
 * use this path to keep the existing Driver.js UX unchanged; combat tutorials
 * (which include any non-spotlight kind) are routed through the new director.
 */
export function isSpotlightOnlyTutorial(tutorial: Tutorial): boolean {
  return tutorial.steps.every((step) => step.kind === 'spotlight');
}
