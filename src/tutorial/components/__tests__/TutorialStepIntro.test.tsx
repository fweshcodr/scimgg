// @vitest-environment happy-dom

import { readFileSync } from 'node:fs';
import { act, cleanup, render } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { getStartableTutorials, TRAINING_COURSES } from '../../content';
import { saveTutorialProgress } from '../../persistence';
import type { DemoPlaybackSession, DirectorState } from '../../runtime/types';
import type { Tutorial, TutorialStep } from '../../types';
import type { TutorialOverlayProps } from '../TutorialOverlay';
import {
  BEAT_MS,
  readCourseStanding,
  STEP_INTRO_DIM_MS,
  STEP_INTRO_TOTAL_MS,
  shouldShowStepIntro,
  TutorialOverlay,
} from '../TutorialOverlay';

afterEach(cleanup);

const waitStep: TutorialStep = {
  kind: 'wait-for-event',
  title: 'Dodge 9 fireballs',
  body: 'Step off the impact tiles.',
  eventName: 'fireball_impact',
  count: 9,
};

const demoStep: TutorialStep = {
  kind: 'demo',
  title: 'Watch the demo',
  body: 'b',
  scriptedActions: [],
};

const worldHighlightStep: TutorialStep = {
  kind: 'world-highlight',
  title: 'Click the tile',
  body: 'b',
  target: { type: 'tile', tile: [31, 37] },
  advanceOn: { type: 'click-target' },
};

const infoStep: TutorialStep = { kind: 'info', title: 'A', body: 'b' };
const checkpointStep: TutorialStep = {
  kind: 'checkpoint',
  title: 'CP',
  body: 'cp',
  seed: { encounterKind: 'yama_p3' },
};
const encounterControlStep: TutorialStep = {
  kind: 'encounter-control',
  actions: [],
};

const stubTutorial: Tutorial = {
  id: 'test-tutorial',
  title: 'Test',
  description: 'desc',
  surface: 'encounter',
  steps: [waitStep],
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
    stepIntroActive: true,
    activeDemoCursor: null,
    demoPlayback: null,
    ...overrides,
  };
}

function makeProps(stateOverrides: Partial<DirectorState> = {}): TutorialOverlayProps {
  return {
    state: makeState(stateOverrides),
    onNext: vi.fn(),
    onPrev: vi.fn(),
    onSkip: vi.fn(),
    onRetryCheckpoint: vi.fn(),
    onRetryStep: vi.fn(),
    onStepDemoBack: vi.fn(),
    onStepDemoForward: vi.fn(),
    onSeekDemo: vi.fn(),
    onPlayDemo: vi.fn(),
    onPauseDemo: vi.fn(),
    onWatchAgain: vi.fn(),
    onDemoTargetMissing: vi.fn(),
    demoPlayback: null,
    demoReview: null,
    onPause: vi.fn(),
    onResume: vi.fn(),
    onExit: vi.fn(),
    onBackToTraining: vi.fn(),
    onStartNextLesson: vi.fn(),
    onJumpToStep: vi.fn(),
    uiScale: 1,
  };
}

describe('shouldShowStepIntro', () => {
  it('returns true for interactive step kinds', () => {
    expect(shouldShowStepIntro(waitStep)).toBe(true);
    expect(shouldShowStepIntro(demoStep)).toBe(true);
    expect(shouldShowStepIntro(worldHighlightStep)).toBe(true);
  });

  it('returns false for read-only / silent step kinds', () => {
    expect(shouldShowStepIntro(infoStep)).toBe(false);
    expect(shouldShowStepIntro(checkpointStep)).toBe(false);
    expect(shouldShowStepIntro(encounterControlStep)).toBe(false);
  });

  it('returns false for null', () => {
    expect(shouldShowStepIntro(null)).toBe(false);
  });
});

describe('TutorialStepIntro rendering', () => {
  it('shows the objective with a 3 . 2 . 1 . GO countdown beneath it', () => {
    vi.useFakeTimers();
    const props = makeProps({
      phase: 'running',
      tutorial: stubTutorial,
      stepIndex: 0,
      currentStep: waitStep,
    });
    render(<TutorialOverlay {...props} />);

    expect(document.querySelector('.tutorial-step-intro-objective')?.textContent).toBe('Dodge 9 fireballs');
    expect(document.querySelector('.tutorial-step-intro-countdown')?.getAttribute('aria-hidden')).toBe('true');

    const tokens = () =>
      Array.from(document.querySelectorAll('.tutorial-step-intro-countdown .countdown-beats-tick')).map(
        (el) => el.textContent,
      );
    const active = () =>
      document.querySelector('.tutorial-step-intro-countdown .countdown-beats-tick.is-active')?.textContent;

    expect(tokens()).toEqual(['3', '2', '1', 'GO']);
    expect(active()).toBe('3');

    act(() => {
      vi.advanceTimersByTime(BEAT_MS);
    });
    expect(tokens()).toEqual(['3', '2', '1', 'GO']);
    expect(active()).toBe('2');

    act(() => {
      vi.advanceTimersByTime(BEAT_MS);
    });
    expect(active()).toBe('1');

    act(() => {
      vi.advanceTimersByTime(BEAT_MS);
    });
    expect(active()).toBe('GO');
    expect(
      document.querySelector('.tutorial-step-intro-countdown .countdown-beats-tick.is-go.is-active')?.textContent,
    ).toBe('GO');
    expect(document.querySelector('.tutorial-step-intro-objective')?.textContent).toBe('Dodge 9 fireballs');

    const label = document.querySelector('.tutorial-step-intro-label');
    expect(label?.querySelector('.tutorial-step-intro-label-text')?.textContent).toBe('Objective');
    expect(label?.querySelectorAll('.tutorial-step-intro-label-line').length).toBe(2);
    expect(document.querySelector('.tutorial-step-intro-frame')).toBeNull();
    expect(document.querySelectorAll('.tutorial-step-intro-bracket').length).toBe(0);

    vi.useRealTimers();
  });

  it('shows the objective for demo steps', () => {
    vi.useFakeTimers();
    const demoTutorial: Tutorial = { ...stubTutorial, steps: [demoStep] };
    const props = makeProps({
      phase: 'running',
      tutorial: demoTutorial,
      stepIndex: 0,
      currentStep: demoStep,
    });
    render(<TutorialOverlay {...props} />);
    expect(document.querySelector('.tutorial-step-intro-objective')?.textContent).toBe('Watch the demo');
    act(() => {
      vi.advanceTimersByTime(BEAT_MS * 3);
    });
    expect(document.querySelector('.tutorial-step-intro-countdown .countdown-beats-tick.is-go')?.textContent).toBe(
      'GO',
    );
    vi.useRealTimers();
  });

  it('shows the objective for world-highlight steps', () => {
    vi.useFakeTimers();
    const whTutorial: Tutorial = { ...stubTutorial, steps: [worldHighlightStep] };
    const props = makeProps({
      phase: 'running',
      tutorial: whTutorial,
      stepIndex: 0,
      currentStep: worldHighlightStep,
    });
    render(<TutorialOverlay {...props} />);
    expect(document.querySelector('.tutorial-step-intro-objective')?.textContent).toBe('Click the tile');
    act(() => {
      vi.advanceTimersByTime(BEAT_MS * 3);
    });
    expect(document.querySelector('.tutorial-step-intro-countdown .countdown-beats-tick.is-go')?.textContent).toBe(
      'GO',
    );
    vi.useRealTimers();
  });

  it('does NOT render intro for info steps (codex instead)', () => {
    const infoTutorial: Tutorial = { ...stubTutorial, steps: [infoStep] };
    const props = makeProps({
      phase: 'running',
      tutorial: infoTutorial,
      stepIndex: 0,
      currentStep: infoStep,
    });
    render(<TutorialOverlay {...props} />);
    expect(document.querySelector('.tutorial-step-intro')).toBeNull();
  });

  it('does NOT render intro when phase is paused', () => {
    const props = makeProps({
      phase: 'paused',
      tutorial: stubTutorial,
      stepIndex: 0,
      currentStep: waitStep,
    });
    render(<TutorialOverlay {...props} />);
    expect(document.querySelector('.tutorial-step-intro')).toBeNull();
  });

  it('does NOT render intro when phase is failed', () => {
    const props = makeProps({
      phase: 'failed',
      tutorial: stubTutorial,
      stepIndex: 0,
      currentStep: waitStep,
    });
    render(<TutorialOverlay {...props} />);
    expect(document.querySelector('.tutorial-step-intro')).toBeNull();
  });

  it('auto-dismisses after the full hold', () => {
    vi.useFakeTimers();
    const props = makeProps({
      phase: 'running',
      tutorial: stubTutorial,
      stepIndex: 0,
      currentStep: waitStep,
    });
    render(<TutorialOverlay {...props} />);

    expect(document.querySelector('.tutorial-step-intro')).toBeTruthy();

    act(() => {
      vi.advanceTimersByTime(STEP_INTRO_TOTAL_MS);
    });
    expect(document.querySelector('.tutorial-step-intro')).toBeTruthy();

    act(() => {
      vi.advanceTimersByTime(STEP_INTRO_DIM_MS - STEP_INTRO_TOTAL_MS - 1);
    });
    expect(document.querySelector('.tutorial-step-intro')).toBeTruthy();

    act(() => {
      vi.advanceTimersByTime(1);
    });
    expect(document.querySelector('.tutorial-step-intro')).toBeNull();

    vi.useRealTimers();
  });

  it('continues the fade after gameplay starts at GO', () => {
    vi.useFakeTimers();
    const props = makeProps({
      phase: 'running',
      tutorial: stubTutorial,
      stepIndex: 0,
      currentStep: waitStep,
      stepIntroActive: true,
    });
    const { rerender } = render(<TutorialOverlay {...props} />);

    act(() => {
      vi.advanceTimersByTime(BEAT_MS * 3);
    });
    expect(
      document.querySelector('.tutorial-step-intro-countdown .countdown-beats-tick.is-go.is-active')?.textContent,
    ).toBe('GO');

    rerender(<TutorialOverlay {...props} state={{ ...props.state, stepIntroActive: false }} />);

    expect(document.querySelector('.tutorial-step-intro')).toBeTruthy();
    expect(
      document.querySelector('.tutorial-step-intro-countdown .countdown-beats-tick.is-go.is-active')?.textContent,
    ).toBe('GO');

    act(() => {
      vi.advanceTimersByTime(STEP_INTRO_DIM_MS - BEAT_MS * 3);
    });
    expect(document.querySelector('.tutorial-step-intro')).toBeNull();

    vi.useRealTimers();
  });

  it('keeps the countdown visible under reduced motion (opacity fade, not removed)', () => {
    const css = readFileSync('src/tutorial/components/TutorialOverlay.css', 'utf8');
    const reduced = css.slice(css.indexOf('@media (prefers-reduced-motion: reduce)'));
    expect(reduced).toContain('.tutorial-step-intro-objective');
    expect(reduced).toContain('tutorial-step-intro-fade');
    // The shared strip owns its own reduced-motion rule: color stays, the transition goes.
    const beatsCss = readFileSync('src/components/CountdownBeats.css', 'utf8');
    const beatsReduced = beatsCss.slice(beatsCss.indexOf('@media (prefers-reduced-motion: reduce)'));
    expect(beatsReduced).toContain('.countdown-beats-tick');
    expect(beatsReduced).toContain('transition: none');
  });
});

describe('completion modal "Back to training"', () => {
  it('invokes onBackToTraining and never the destructive onExit', () => {
    const props = makeProps({
      phase: 'complete',
      tutorial: stubTutorial,
      stepIndex: 0,
      currentStep: null,
    });
    render(<TutorialOverlay {...props} />);

    const btn = document.querySelector<HTMLButtonElement>('.tutorial-completion-foot-btn--primary');
    expect(btn?.textContent).toBe('Back to training');

    act(() => {
      btn!.click();
    });

    expect(props.onBackToTraining).toHaveBeenCalledTimes(1);
    expect(props.onExit).not.toHaveBeenCalled();
  });
});

describe('completion modal course standing', () => {
  const multiLessonCourse = TRAINING_COURSES.find((c) => getStartableTutorials(c).length >= 2);
  // Picked by shape off the REAL manifest, so adding or promoting a tutorial cannot silently turn these into no-ops.

  function lessonsOf() {
    if (!multiLessonCourse) throw new Error('no course with 2+ startable lessons');
    return getStartableTutorials(multiLessonCourse);
  }

  function markCompleted(id: string) {
    saveTutorialProgress(id, { lastStep: 0, completed: true });
  }

  afterEach(() => {
    // readCourseStanding reads module-global localStorage; per-file isolation
    // would otherwise leak progress into whichever suite shares this worker.
    localStorage.clear();
  });

  it('has a course with 2+ startable lessons to exercise', () => {
    expect(multiLessonCourse).toBeDefined();
  });

  it('points at the following lesson and counts only what is cleared', () => {
    const [first, second] = lessonsOf();
    markCompleted(first.id);

    const standing = readCourseStanding(first.id);
    expect(standing).not.toBeNull();
    expect(standing!.position).toBe(1);
    expect(standing!.rungs.length).toBe(lessonsOf().length);
    expect(standing!.completedCount).toBe(1);
    expect(standing!.next).toEqual({ id: second.id, title: second.title });
    expect(standing!.rungs[0].earned).toBe(true);
    expect(standing!.rungs[1].done).toBe(false);
  });

  it('counts the finished lesson as done even before persistence has flushed', () => {
    // The director's progress write and this render are not ordered, so the
    // just-completed lesson is forced done rather than read back from storage.
    const [first] = lessonsOf();
    const standing = readCourseStanding(first.id);
    expect(standing!.rungs[0].done).toBe(true);
    expect(standing!.completedCount).toBe(1);
  });

  it('reports no next lesson once every lesson in the course is cleared', () => {
    const lessons = lessonsOf();
    lessons.forEach((lesson) => {
      markCompleted(lesson.id);
    });

    const standing = readCourseStanding(lessons[lessons.length - 1].id);
    expect(standing!.next).toBeNull();
    expect(standing!.completedCount).toBe(lessons.length);
    expect(standing!.position).toBe(lessons.length);
  });

  it('falls back to an earlier unfinished lesson when the player skipped ahead', () => {
    // Finishing the LAST lesson with an earlier one still open must not report
    // the course complete — otherwise the track would light every segment.
    const lessons = lessonsOf();
    const last = lessons[lessons.length - 1];
    markCompleted(last.id);

    const standing = readCourseStanding(last.id);
    expect(standing!.next).toEqual({ id: lessons[0].id, title: lessons[0].title });
    expect(standing!.completedCount).toBe(1);
  });

  it('returns null for a tutorial no course claims', () => {
    expect(readCourseStanding('test-tutorial')).toBeNull();
  });
});

describe('completion modal "Next lesson" action', () => {
  const multiLessonCourse = TRAINING_COURSES.find((c) => getStartableTutorials(c).length >= 2);

  afterEach(() => {
    localStorage.clear();
  });

  /** Use the real tutorial id for course lookup but a non-spotlight step because spotlight tutorials bypass this overlay. */
  function renderCompletionFor(tutorial: Tutorial) {
    const props = makeProps({
      phase: 'complete',
      tutorial: { ...tutorial, steps: [waitStep] },
      stepIndex: 0,
      currentStep: null,
    });
    render(<TutorialOverlay {...props} />);
    return props;
  }

  it('offers both actions and starts the NEXT lesson by id', () => {
    const [first, second] = getStartableTutorials(multiLessonCourse!);
    const props = renderCompletionFor(first);

    const buttons = [...document.querySelectorAll<HTMLButtonElement>('.tutorial-completion-foot-btn')];
    expect(buttons.map((b) => b.textContent)).toEqual(['Back to training', 'Next lesson']);

    act(() => {
      buttons[1].click();
    });

    expect(props.onStartNextLesson).toHaveBeenCalledTimes(1);
    expect(props.onStartNextLesson).toHaveBeenCalledWith(second.id);
    expect(props.onBackToTraining).not.toHaveBeenCalled();
    expect(props.onExit).not.toHaveBeenCalled();
  });

  it('names the lesson in the accessible label while the visible label stays short', () => {
    const [first, second] = getStartableTutorials(multiLessonCourse!);
    renderCompletionFor(first);

    const primary = document.querySelector<HTMLButtonElement>('.tutorial-completion-foot-btn--primary');
    expect(primary?.textContent).toBe('Next lesson');
    expect(primary?.getAttribute('aria-label')).toBe(`Next lesson: ${second.title}`);
  });

  it('names the dialog by both the status and the lesson, not the lesson alone', () => {
    const [first] = getStartableTutorials(multiLessonCourse!);
    renderCompletionFor(first);

    const dialog = document.querySelector('.tutorial-completion-backdrop');
    expect(dialog?.getAttribute('aria-labelledby')).toBe('tutorial-completion-status tutorial-completion-title');
    expect(document.getElementById('tutorial-completion-status')?.textContent).toBe('Lesson complete');
    expect(document.getElementById('tutorial-completion-title')?.textContent).toBe(first.title);
  });

  it('collapses to a single dismiss when the whole course is cleared', () => {
    const lessons = getStartableTutorials(multiLessonCourse!);
    lessons.forEach((lesson) => {
      saveTutorialProgress(lesson.id, { lastStep: 0, completed: true });
    });
    const props = renderCompletionFor(lessons[lessons.length - 1]);

    const buttons = [...document.querySelectorAll<HTMLButtonElement>('.tutorial-completion-foot-btn')];
    expect(buttons.map((b) => b.textContent)).toEqual(['Back to training']);

    act(() => {
      buttons[0].click();
    });
    expect(props.onBackToTraining).toHaveBeenCalledTimes(1);
    expect(props.onStartNextLesson).not.toHaveBeenCalled();
  });

  it('marks every segment complete only when the course is actually finished', () => {
    const lessons = getStartableTutorials(multiLessonCourse!);
    lessons.forEach((lesson) => {
      saveTutorialProgress(lesson.id, { lastStep: 0, completed: true });
    });
    renderCompletionFor(lessons[lessons.length - 1]);
    expect(document.querySelector('.tutorial-completion-track.is-complete')).not.toBeNull();

    cleanup();
    localStorage.clear();

    renderCompletionFor(lessons[0]);
    expect(document.querySelector('.tutorial-completion-track.is-complete')).toBeNull();
  });
});

describe('demo watch pause UX', () => {
  const recordingDemoPlayback: DemoPlaybackSession = {
    stepIndex: 0,
    mode: 'recording',
    frames: [],
    cues: [],
    tickMs: 600,
    playheadMs: 0,
    durationMs: 0,
    frontierMs: 0,
    plannedDurationMs: 3000,
    isPlaying: true,
    speed: 1,
  };
  const reviewDemoPlayback: DemoPlaybackSession = {
    ...recordingDemoPlayback,
    mode: 'review',
    durationMs: 3000,
    frontierMs: 3000,
    isPlaying: false,
  };
  const demoTutorial: Tutorial = { ...stubTutorial, steps: [demoStep] };

  it('suppresses the global pause overlay when paused during a live demo recording', () => {
    const props = makeProps({
      phase: 'paused',
      tutorial: demoTutorial,
      stepIndex: 0,
      currentStep: demoStep,
      demoPlayback: recordingDemoPlayback,
    });
    render(<TutorialOverlay {...props} demoPlayback={recordingDemoPlayback} />);
    // The Resume/Exit modal is intentionally absent: it would block the world the user is watching.
    expect(document.querySelector('.tutorial-pause-backdrop')).toBeNull();
  });

  it('suppresses the global pause overlay when paused on a demo watch step before recording starts', () => {
    const props = makeProps({
      phase: 'paused',
      tutorial: demoTutorial,
      stepIndex: 0,
      currentStep: demoStep,
      demoPlayback: null,
    });
    render(<TutorialOverlay {...props} />);
    expect(document.querySelector('.tutorial-pause-backdrop')).toBeNull();
    expect(document.querySelector('.tutorial-beam-inline-paused')?.textContent).toBe('Paused');
  });

  it('shows an inline Paused label in the beam transport row during demo recording pause', () => {
    const props = makeProps({
      phase: 'paused',
      tutorial: demoTutorial,
      stepIndex: 0,
      currentStep: demoStep,
      demoPlayback: recordingDemoPlayback,
    });
    render(<TutorialOverlay {...props} demoPlayback={recordingDemoPlayback} />);
    const inline = document.querySelector('.tutorial-beam-transport-paused');
    expect(inline?.textContent).toBe('Paused');
  });

  it('labels the recording transport button as the demo (not the tutorial) so users know what they are toggling', () => {
    const pausedProps = makeProps({
      phase: 'paused',
      tutorial: demoTutorial,
      stepIndex: 0,
      currentStep: demoStep,
      demoPlayback: recordingDemoPlayback,
    });
    const { rerender } = render(<TutorialOverlay {...pausedProps} demoPlayback={recordingDemoPlayback} />);
    const playBtn = () => document.querySelector<HTMLButtonElement>('.tutorial-beam-btn.tutorial-beam-btn--play');
    expect(playBtn()?.getAttribute('aria-label')).toBe('Resume demo');
    // Named by the instant hover hint, which reads the aria-label; no native tooltip.
    expect(playBtn()?.title).toBe('');

    // Reuse vi.useFakeTimers() because the running phase mounts TutorialStepIntro
    // for the demo step, which schedules a countdown — fake timers stop the real
    // setTimeouts from firing after the test ends.
    vi.useFakeTimers();
    const runningProps = makeProps({
      phase: 'running',
      tutorial: demoTutorial,
      stepIndex: 0,
      currentStep: demoStep,
      demoPlayback: recordingDemoPlayback,
    });
    rerender(<TutorialOverlay {...runningProps} demoPlayback={recordingDemoPlayback} />);
    expect(playBtn()?.getAttribute('aria-label')).toBe('Pause demo');
    // Named by the instant hover hint, which reads the aria-label; no native tooltip.
    expect(playBtn()?.title).toBe('');
    expect(document.querySelector('.tutorial-beam-transport-paused')).toBeNull();
    vi.useRealTimers();
  });

  it('labels the pre-recording demo watch pause button as the demo, not the tutorial', () => {
    const pausedProps = makeProps({
      phase: 'paused',
      tutorial: demoTutorial,
      stepIndex: 0,
      currentStep: demoStep,
      demoPlayback: null,
    });
    const { rerender } = render(<TutorialOverlay {...pausedProps} />);
    const button = () => document.querySelector<HTMLButtonElement>('.tutorial-beam-controls .tutorial-beam-btn');
    expect(button()?.getAttribute('aria-label')).toBe('Resume demo');
    // Named by the instant hover hint, which reads the aria-label; no native tooltip.
    expect(button()?.title).toBe('');

    vi.useFakeTimers();
    const runningProps = makeProps({
      phase: 'running',
      tutorial: demoTutorial,
      stepIndex: 0,
      currentStep: demoStep,
      demoPlayback: null,
    });
    rerender(<TutorialOverlay {...runningProps} />);
    expect(button()?.getAttribute('aria-label')).toBe('Pause demo');
    // Named by the instant hover hint, which reads the aria-label; no native tooltip.
    expect(button()?.title).toBe('');
    vi.useRealTimers();
  });

  it('still renders the global pause overlay when paused on a non-demo step', () => {
    const props = makeProps({
      phase: 'paused',
      tutorial: stubTutorial,
      stepIndex: 0,
      currentStep: waitStep,
    });
    render(<TutorialOverlay {...props} />);
    expect(document.querySelector('.tutorial-pause-backdrop')).toBeTruthy();
    expect(document.querySelector('.tutorial-beam-transport-paused')).toBeNull();
  });

  it('still renders the global pause overlay when paused on a demo step in review mode (post-watch scrub)', () => {
    const props = makeProps({
      phase: 'paused',
      tutorial: demoTutorial,
      stepIndex: 0,
      currentStep: demoStep,
      demoPlayback: reviewDemoPlayback,
    });
    render(<TutorialOverlay {...props} demoPlayback={reviewDemoPlayback} />);
    expect(document.querySelector('.tutorial-pause-backdrop')).toBeTruthy();
    expect(document.querySelector('.tutorial-beam-transport-paused')).toBeNull();
  });
});
