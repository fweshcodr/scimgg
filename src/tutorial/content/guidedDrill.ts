import type { MechanicsConfig } from '../../types/simulation';
import type { TutorialEncounterCommandId } from '../encounterCommands';
import type {
  CheckpointStep,
  DemoCursorTrack,
  DemoScriptedAction,
  DemoStep,
  EncounterControlAction,
  InfoStep,
  TutorialStep,
  WaitForEventStep,
  WorldHighlightTarget,
} from '../types';

export interface GuidedDrillExplain {
  title: string;
  body: string;
  videoUrl?: string;
  videoPosterUrl?: string;
  imageUrl?: string;
  highlight?: WorldHighlightTarget;
  continueLabel?: string;
}

export interface GuidedDrillDemo {
  title: string;
  body: string;
  scriptedActions?: DemoScriptedAction[];
  cursor?: DemoCursorTrack;
  /** Tick offset at which to stop. Defaults to the last action's offset + 1. */
  stopAtTickOffset?: number;
  /** Must be below the first tick-anchored cue because those cues fire only on live ticks after the seek. */
  fastForwardToTick?: number;
  finishOnEvent?: string;
}

export interface GuidedDrillReady {
  title: string;
  body: string;
  continueLabel?: string;
}

export interface GuidedDrillPractice {
  title: string;
  body: string;
  eventName: string;
  matcher?: WaitForEventStep['matcher'];
  count?: number;
  failEventName?: string;
  failMatcher?: WaitForEventStep['failMatcher'];
  failResetsProgress?: boolean;
  failPrompt?: string;
  successMessage?: string;
  timeoutTicks?: number;
  /** Runs after the ready seed and must not reset, which would discard that seeded state. */
  extraSetup?: readonly EncounterControlAction[];
}

export interface GuidedDrillConfig {
  encounterKind: string;
  /** Applied to the demo and ready seed so practice reproduces the same encounter. */
  mechanics: Partial<MechanicsConfig>;
  activatePresetId?: string;
  openingCommandId?: TutorialEncounterCommandId;
  explain: GuidedDrillExplain;
  demo?: GuidedDrillDemo;
  ready: GuidedDrillReady;
  practice: GuidedDrillPractice;
}

export function buildGuidedDrill(config: GuidedDrillConfig): TutorialStep[] {
  const steps: TutorialStep[] = [buildExplainStep(config.explain)];

  if (config.demo) {
    steps.push(buildDemoStep(config, config.demo));
  }

  steps.push(buildReadyStep(config));
  steps.push(buildPracticeStep(config.practice));

  return steps;
}

function buildExplainStep(explain: GuidedDrillExplain): InfoStep {
  const info: InfoStep = {
    kind: 'info',
    title: explain.title,
    body: explain.body,
  };
  if (explain.imageUrl) info.imageUrl = explain.imageUrl;
  if (explain.videoUrl) info.videoUrl = explain.videoUrl;
  if (explain.videoPosterUrl) info.videoPosterUrl = explain.videoPosterUrl;
  if (explain.highlight) info.highlight = explain.highlight;
  if (explain.continueLabel) info.continueLabel = explain.continueLabel;
  return info;
}

/** The demo setup owns its reset before the ready checkpoint, so resetBefore must stay false. */
function buildDemoStep(config: GuidedDrillConfig, demo: GuidedDrillDemo): DemoStep {
  const setup: EncounterControlAction[] = [{ type: 'reset' }, { type: 'set-mechanics', mechanics: config.mechanics }];
  if (config.openingCommandId) {
    setup.push({ type: 'encounter-command', commandId: config.openingCommandId });
  }
  if (config.activatePresetId) {
    setup.push({ type: 'activate-tile-preset', presetId: config.activatePresetId });
  }

  // Fast-forward must be last so reset, mechanics, command, and preset run first.
  if (demo.fastForwardToTick !== undefined) {
    setup.push({ type: 'fast-forward-ticks', toTick: demo.fastForwardToTick });
  }

  const step: DemoStep = {
    kind: 'demo',
    title: demo.title,
    body: demo.body,
    scriptedActions: demo.scriptedActions ?? [],
    setup,
    resetBefore: false,
  };
  if (demo.stopAtTickOffset !== undefined) step.stopAtTickOffset = demo.stopAtTickOffset;
  if (demo.finishOnEvent) step.finishOnEvent = demo.finishOnEvent;
  if (demo.cursor) step.cursor = demo.cursor;
  return step;
}

/** autoAdvance must stay false so the user starts practice from the ready checkpoint. */
function buildReadyStep(config: GuidedDrillConfig): CheckpointStep {
  const seed: CheckpointStep['seed'] = {
    encounterKind: config.encounterKind,
    mechanics: config.mechanics,
  };
  if (config.activatePresetId) seed.activatePresetId = config.activatePresetId;
  if (config.openingCommandId) seed.encounterCommandIds = [config.openingCommandId];

  const checkpoint: CheckpointStep = {
    kind: 'checkpoint',
    title: config.ready.title,
    body: config.ready.body,
    seed,
    autoAdvance: false,
  };
  if (config.ready.continueLabel) checkpoint.continueLabel = config.ready.continueLabel;
  return checkpoint;
}

function buildPracticeStep(practice: GuidedDrillPractice): WaitForEventStep {
  const step: WaitForEventStep = {
    kind: 'wait-for-event',
    title: practice.title,
    body: practice.body,
    eventName: practice.eventName,
  };
  if (practice.matcher) step.matcher = practice.matcher;
  if (practice.count !== undefined) step.count = practice.count;
  if (practice.failEventName) step.failEventName = practice.failEventName;
  if (practice.failMatcher) step.failMatcher = practice.failMatcher;
  if (practice.failResetsProgress) step.failResetsProgress = practice.failResetsProgress;
  if (practice.failPrompt) step.failPrompt = practice.failPrompt;
  if (practice.successMessage) step.successMessage = practice.successMessage;
  if (practice.timeoutTicks !== undefined) step.timeoutTicks = practice.timeoutTicks;
  if (practice.extraSetup && practice.extraSetup.length > 0) step.setup = practice.extraSetup;
  return step;
}
