import { describe, expect, it } from 'vitest';
import type { DirectorState } from '../../runtime/types';
import type { TutorialStep } from '../../types';
import {
  continueLabel,
  getPresenter,
  getTone,
  getToneLabel,
  shouldShowRestartDemo,
  stepLabel,
  type Tone,
} from '../TutorialOverlay';

const infoStep: TutorialStep = { kind: 'info', title: 'A', body: 'b' };
const videoStep: TutorialStep = { kind: 'video', title: 'V', body: 'b', videoUrl: '/v.mp4' };
const spotlightStep: TutorialStep = {
  kind: 'spotlight',
  popover: { title: 'P', description: 'd' },
};
const waitStep: TutorialStep = {
  kind: 'wait-for-event',
  title: 'Wait',
  body: 'b',
  eventName: 'wave_activated',
  count: 3,
};
const highlightStep: TutorialStep = {
  kind: 'world-highlight',
  title: 'H',
  body: 'b',
  target: { type: 'tile', tile: [31, 37] },
  advanceOn: { type: 'continue' },
};
const demoStep: TutorialStep = {
  kind: 'demo',
  title: 'D',
  body: 'b',
  scriptedActions: [],
};
const checkpointStep: TutorialStep = {
  kind: 'checkpoint',
  title: 'Checkpoint',
  body: 'cp body',
  seed: { encounterKind: 'yama_p3' },
};
const setupStep: TutorialStep = {
  kind: 'encounter-control',
  actions: [],
};

function makeState(overrides: Partial<DirectorState> = {}): DirectorState {
  return {
    phase: 'running',
    tutorial: null,
    stepIndex: -1,
    currentStep: null,
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
    ...overrides,
  };
}

describe('getPresenter', () => {
  it('returns codex for reading kinds', () => {
    expect(getPresenter(infoStep)).toBe('codex');
    expect(getPresenter(videoStep)).toBe('codex');
    expect(getPresenter(spotlightStep)).toBe('codex');
  });

  it('returns beam for action kinds without phase context', () => {
    expect(getPresenter(waitStep)).toBe('beam');
    expect(getPresenter(highlightStep)).toBe('beam');
    expect(getPresenter(demoStep)).toBe('beam');
  });

  it('returns beam for encounter-control / checkpoint during linear play (running or undefined phase)', () => {
    expect(getPresenter(checkpointStep)).toBe('beam');
    expect(getPresenter(setupStep)).toBe('beam');
    expect(getPresenter(checkpointStep, 'running')).toBe('beam');
    expect(getPresenter(setupStep, 'running')).toBe('beam');
  });

  it('promotes encounter-control / checkpoint to codex when phase is awaiting-user', () => {
    expect(getPresenter(checkpointStep, 'awaiting-user')).toBe('codex');
    expect(getPresenter(setupStep, 'awaiting-user')).toBe('codex');
  });

  it('keeps reading kinds on codex regardless of phase', () => {
    expect(getPresenter(infoStep, 'awaiting-user')).toBe('codex');
    expect(getPresenter(videoStep, 'awaiting-user')).toBe('codex');
    expect(getPresenter(spotlightStep, 'awaiting-user')).toBe('codex');
    expect(getPresenter(infoStep, 'running')).toBe('codex');
  });

  it('keeps interactive action kinds on beam regardless of phase', () => {
    expect(getPresenter(waitStep, 'awaiting-user')).toBe('beam');
    expect(getPresenter(highlightStep, 'awaiting-user')).toBe('beam');
    expect(getPresenter(demoStep, 'awaiting-user')).toBe('beam');
  });

  it('defaults to beam when step is null', () => {
    expect(getPresenter(null)).toBe('beam');
    expect(getPresenter(null, 'awaiting-user')).toBe('beam');
  });
});

describe('getTone', () => {
  it('failed → error (highest priority)', () => {
    expect(getTone(makeState({ phase: 'failed' }))).toBe('error');
  });

  it('paused → paused', () => {
    expect(getTone(makeState({ phase: 'paused' }))).toBe('paused');
  });

  it('awaiting-user → awaiting', () => {
    expect(getTone(makeState({ phase: 'awaiting-user' }))).toBe('awaiting');
  });

  it('banner success → success (when not paused/failed/awaiting)', () => {
    expect(getTone(makeState({ banner: { tone: 'success', text: 'ok' } }))).toBe('success');
  });

  it('demo step → watch (when not paused/failed/awaiting and no success banner)', () => {
    expect(getTone(makeState({ currentStep: demoStep }))).toBe('watch');
  });

  it('running default → running', () => {
    expect(getTone(makeState())).toBe('running');
  });

  it('failed beats banner.success', () => {
    expect(getTone(makeState({ phase: 'failed', banner: { tone: 'success', text: 'x' } }))).toBe('error');
  });
});

describe('getToneLabel', () => {
  it('awaiting + failed → "Try again" (recovery framing)', () => {
    expect(getToneLabel('awaiting', 'failed')).toBe('Try again');
  });

  it('awaiting + non-failed → "Your turn"', () => {
    expect(getToneLabel('awaiting', 'awaiting-user')).toBe('Your turn');
    expect(getToneLabel('awaiting', 'running')).toBe('Your turn');
  });

  it.each<[Tone, string]>([
    ['paused', 'Paused'],
    ['error', 'Try again'],
    ['success', 'Nice'],
    ['watch', 'Watching'],
    ['running', 'In play'],
  ])('%s tone → "%s" label', (tone, label) => {
    expect(getToneLabel(tone, 'running')).toBe(label);
  });
});

describe('continueLabel', () => {
  it('returns "Continue" by default', () => {
    expect(continueLabel(null)).toBe('Continue');
    expect(continueLabel(waitStep)).toBe('Continue');
    expect(continueLabel(highlightStep)).toBe('Continue');
  });

  it('uses step.continueLabel for info steps when set', () => {
    expect(continueLabel({ ...infoStep, continueLabel: 'Got it' })).toBe('Got it');
  });

  it('uses step.continueLabel for video steps when set', () => {
    expect(continueLabel({ ...videoStep, continueLabel: 'Begin' })).toBe('Begin');
  });

  it('falls back to "Continue" when step.continueLabel is unset', () => {
    expect(continueLabel(infoStep)).toBe('Continue');
    expect(continueLabel(videoStep)).toBe('Continue');
  });
});

describe('stepLabel', () => {
  it('returns step.title for titled kinds', () => {
    expect(stepLabel(infoStep)).toBe('A');
    expect(stepLabel(videoStep)).toBe('V');
    expect(stepLabel(highlightStep)).toBe('H');
    expect(stepLabel(waitStep)).toBe('Wait');
    expect(stepLabel(demoStep)).toBe('D');
    expect(stepLabel(checkpointStep)).toBe('Checkpoint');
  });

  it('returns popover.title for spotlight steps', () => {
    expect(stepLabel(spotlightStep)).toBe('P');
  });

  it('falls back to "Encounter setup" for untitled encounter-control', () => {
    expect(stepLabel(setupStep)).toBe('Encounter setup');
  });

  it('returns the title when encounter-control has one', () => {
    expect(stepLabel({ ...setupStep, title: 'Reset arena' })).toBe('Reset arena');
  });
});

describe('shouldShowRestartDemo (W3/W4)', () => {
  it('shows for a finished demo step (awaiting-user) by default', () => {
    expect(shouldShowRestartDemo(demoStep, 'awaiting-user')).toBe(true);
  });

  it('hides while the demo is still running or paused (the action would no-op)', () => {
    expect(shouldShowRestartDemo(demoStep, 'running')).toBe(false);
    expect(shouldShowRestartDemo(demoStep, 'paused')).toBe(false);
  });

  it('hides for non-demo steps and null', () => {
    expect(shouldShowRestartDemo(infoStep, 'awaiting-user')).toBe(false);
    expect(shouldShowRestartDemo(null, 'awaiting-user')).toBe(false);
  });

  it('honors allowReplay: false', () => {
    const noReplayDemo: TutorialStep = { kind: 'demo', title: 'D', body: 'b', scriptedActions: [], allowReplay: false };
    expect(shouldShowRestartDemo(noReplayDemo, 'awaiting-user')).toBe(false);
  });
});
