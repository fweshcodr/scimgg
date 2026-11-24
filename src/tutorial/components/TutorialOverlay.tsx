import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { CountdownBeats } from '../../components/CountdownBeats';

import { HoverHintButton } from '../../components/ui/HoverHintControl';
import type { SidebarInsets } from '../../util/viewportLayout';
import { getCourseForTutorial, getStartableTutorials } from '../content';
import { loadTutorialProgress } from '../persistence';
import type { DemoPlayheadStore } from '../runtime/demoPlayheadStore';
import type { DemoPlaybackSession, DirectorState } from '../runtime/types';
import type { DemoCursorCue, DemoCursorCueTone, InfoStep, SpotlightStep, TutorialStep, VideoStep } from '../types';
import { isSpotlightOnlyTutorial } from '../types';
import './TutorialOverlay.css';
import { DemoCursorLayer } from './DemoCursorLayer';
import { TutorialMarkup } from './TutorialMarkup';

type DemoReviewCursor = { cues: readonly DemoCursorCue[]; tickMs: number; playheadMs: number; blockInput?: boolean };

export interface TutorialOverlayProps {
  state: DirectorState;
  onNext: () => void;
  onPrev: () => void;
  onSkip: () => void;
  onRetryCheckpoint: () => void;
  onRetryStep: () => void;
  onStepDemoBack: () => void;
  onStepDemoForward: () => void;
  onSeekDemo: (ms: number) => void;
  onPlayDemo: () => void;
  onPauseDemo: () => void;
  onWatchAgain: () => void;
  demoPlayback: DemoPlaybackSession | null;
  demoReview: DemoReviewCursor | null;
  /** Per-frame demo review playhead store (drives the demo cursor without per-frame App re-renders). */
  demoPlayheadStore?: DemoPlayheadStore;
  onDemoTargetMissing: (label: string | null) => void;
  onPause: () => void;
  onResume: () => void;
  onExit: () => void;
  /** Return to the training hub, staying in Tutorial Mode; onExit leaves training entirely. */
  onBackToTraining: () => void;
  /** Routes through App's shared start-a-tutorial path (scene switch, Tutorial Mode, equipment preset), the same one the Training picker uses. */
  onStartNextLesson: (tutorialId: string) => void;
  onJumpToStep: (index: number) => void;
  /** Live settings.uiScale, so the demo cursor matches the scaled prayer book. */
  uiScale: number;
  /** The open sidebars' window insets (App `uiInsets`), for the demo cursor's resting place. */
  sidebarInsets?: SidebarInsets;
}

const SHOULD_SHOW_PHASES: ReadonlyArray<DirectorState['phase']> = [
  'running',
  'awaiting-user',
  'paused',
  'failed',
  'complete',
];

export type Presenter = 'beam' | 'codex';

/**
 * `encounter-control` and `checkpoint` are dual-mode: beam while they auto-advance during
 * linear play, codex once `fromUserNav` suspends them in awaiting-user and the body text
 * becomes something to read. `phase` is optional so call sites without it keep the beam default.
 */
export function getPresenter(step: TutorialStep | null, phase?: DirectorState['phase']): Presenter {
  if (!step) return 'beam';
  switch (step.kind) {
    case 'info':
    case 'video':
    case 'spotlight':
      return 'codex';
    case 'wait-for-event':
    case 'world-highlight':
    case 'demo':
      return 'beam';
    case 'encounter-control':
    case 'checkpoint':
      // User-nav suspends these in awaiting-user with auto-advance disabled.
      // Promote them to the codex so the user can actually read the body.
      return phase === 'awaiting-user' ? 'codex' : 'beam';
  }
}

export type Tone = 'running' | 'awaiting' | 'paused' | 'error' | 'success' | 'watch';

export function getTone(state: DirectorState): Tone {
  if (state.phase === 'failed') return 'error';
  if (state.phase === 'paused') return 'paused';
  if (state.phase === 'awaiting-user') return 'awaiting';
  if (state.banner?.tone === 'success') return 'success';
  if (state.currentStep?.kind === 'demo') return 'watch';
  return 'running';
}

export function getToneLabel(tone: Tone, phase: DirectorState['phase']): string | null {
  switch (tone) {
    case 'awaiting':
      return phase === 'failed' ? 'Try again' : 'Your turn';
    case 'paused':
      return 'Paused';
    case 'error':
      return 'Try again';
    case 'success':
      return 'Nice';
    case 'watch':
      return 'Watching';
    default:
      return 'In play';
  }
}

export function TutorialOverlay(props: TutorialOverlayProps) {
  const { state } = props;
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted || !state.tutorial || !SHOULD_SHOW_PHASES.includes(state.phase)) return null;
  // Spotlight tutorials drive their own UI through Driver.js (SpotlightRunner), so no chrome here.
  if (isSpotlightOnlyTutorial(state.tutorial)) return null;

  return createPortal(<OverlayShell {...props} />, document.body);
}

function OverlayShell(props: TutorialOverlayProps) {
  const {
    state,
    onNext,
    onPrev,
    onSkip,
    onRetryCheckpoint,
    onRetryStep,
    onStepDemoBack,
    onStepDemoForward,
    onSeekDemo,
    onPlayDemo,
    onPauseDemo,
    onWatchAgain,
    demoPlayback,
    demoReview,
    demoPlayheadStore,
    onDemoTargetMissing,
    onPause,
    onResume,
    onExit,
    onBackToTraining,
    onStartNextLesson,
    onJumpToStep,
    uiScale,
    sidebarInsets,
  } = props;
  const tutorial = state.tutorial!;
  const totalSteps = tutorial.steps.length;
  const currentIndex = state.stepIndex;
  const step = state.currentStep;
  const presenter = getPresenter(step, state.phase);
  const tone = getTone(state);
  const canRetryCheckpoint = state.lastCheckpointIndex !== null;
  const isDemoWatchPaused = state.phase === 'paused' && step?.kind === 'demo' && state.demoPlayback?.mode !== 'review';

  const [menuOpen, setMenuOpen] = useState(false);
  const [stepsListOpen, setStepsListOpen] = useState(false);
  const [lingeringStepIntroKey, setLingeringStepIntroKey] = useState<string | null>(null);
  const stepKey = `${tutorial.id}:${currentIndex}`;
  const previousStepKeyRef = useRef(stepKey);
  const canShowStepIntro = state.phase === 'running' && shouldShowStepIntro(step);
  const startingStepIntroKey = canShowStepIntro && state.stepIntroActive ? stepKey : null;
  const renderedStepIntroKey = startingStepIntroKey ?? lingeringStepIntroKey;
  const handleStepIntroDone = useCallback((doneKey: string) => {
    setLingeringStepIntroKey((currentKey) => (currentKey === doneKey ? null : currentKey));
  }, []);
  useEffect(() => {
    if (previousStepKeyRef.current === stepKey) return;
    previousStepKeyRef.current = stepKey;
    setMenuOpen(false);
    setStepsListOpen(false);
  }, [stepKey]);

  useEffect(() => {
    if (startingStepIntroKey) {
      setLingeringStepIntroKey(startingStepIntroKey);
    } else if (!canShowStepIntro) {
      setLingeringStepIntroKey(null);
    }
  }, [canShowStepIntro, startingStepIntroKey]);

  return (
    <section className="tutorial-overlay" data-phase={state.phase} aria-label={`${tutorial.title} tutorial`}>
      <DemoCursorLayer
        session={state.activeDemoCursor}
        review={demoReview}
        demoPlayheadStore={demoPlayheadStore}
        phase={state.phase}
        uiScale={uiScale}
        onRequiredTargetMissing={onDemoTargetMissing}
        sidebarInsets={sidebarInsets}
      />

      {state.phase !== 'complete' && presenter === 'beam' && (
        <TutorialBeam
          tutorial={tutorial}
          currentIndex={currentIndex}
          totalSteps={totalSteps}
          step={step}
          tone={tone}
          phase={state.phase}
          eventProgress={state.eventProgress}
          eventTarget={state.eventTarget}
          progressResetNonce={state.progressResetNonce}
          failPrompt={state.failPrompt}
          canRetryCheckpoint={canRetryCheckpoint}
          menuOpen={menuOpen}
          onMenuToggle={() => setMenuOpen((v) => !v)}
          onMenuClose={() => setMenuOpen(false)}
          onPrev={onPrev}
          onSkip={onSkip}
          onRetryCheckpoint={onRetryCheckpoint}
          onRetryStep={onRetryStep}
          onStepDemoBack={onStepDemoBack}
          onStepDemoForward={onStepDemoForward}
          onSeekDemo={onSeekDemo}
          onPlayDemo={onPlayDemo}
          onPauseDemo={onPauseDemo}
          onWatchAgain={onWatchAgain}
          demoPlayback={demoPlayback}
          onNext={onNext}
          onPause={onPause}
          onResume={onResume}
          onExit={onExit}
        />
      )}

      {state.phase !== 'complete' && presenter === 'codex' && step && (
        <TutorialCodex
          tutorial={tutorial}
          currentIndex={currentIndex}
          totalSteps={totalSteps}
          step={step}
          completedSteps={state.completedSteps}
          stepsListOpen={stepsListOpen}
          onStepsListToggle={() => setStepsListOpen((v) => !v)}
          onStepsListClose={() => setStepsListOpen(false)}
          onPrev={onPrev}
          onNext={onNext}
          onExit={onExit}
          onJumpToStep={(index) => {
            onJumpToStep(index);
            setStepsListOpen(false);
          }}
        />
      )}

      {state.phase === 'paused' && !isDemoWatchPaused && (
        <TutorialPauseOverlay
          tutorial={tutorial}
          currentIndex={currentIndex}
          totalSteps={totalSteps}
          step={step}
          onResume={onResume}
          onExit={onExit}
        />
      )}

      {state.phase === 'complete' && (
        <TutorialCompletionModal
          tutorial={tutorial}
          onDismiss={onBackToTraining}
          onStartNextLesson={onStartNextLesson}
        />
      )}

      {canShowStepIntro && renderedStepIntroKey === stepKey && step && (
        <TutorialStepIntro
          key={renderedStepIntroKey}
          introKey={renderedStepIntroKey}
          title={stepLabel(step)}
          onDone={handleStepIntroDone}
        />
      )}
    </section>
  );
}

const INTRO_STEP_KINDS: ReadonlySet<TutorialStep['kind']> = new Set(['wait-for-event', 'demo', 'world-highlight']);

export function shouldShowStepIntro(step: TutorialStep | null): boolean {
  return step !== null && INTRO_STEP_KINDS.has(step.kind);
}

/** Showing Restart demo outside awaiting-user or allowReplay:false creates a dead action. */
export function shouldShowRestartDemo(step: TutorialStep | null, phase: DirectorState['phase']): boolean {
  return step?.kind === 'demo' && phase === 'awaiting-user' && step.allowReplay !== false;
}

interface TutorialStepIntroProps {
  introKey: string;
  title: string;
  onDone: (introKey: string) => void;
}

/** 3 · 2 · 1 · GO; GO is index COUNTDOWN_FROM. */
const COUNTDOWN_FROM = 3;
const LAST_BEAT = COUNTDOWN_FROM;
export const BEAT_MS = 450;
const EXIT_MS = 200;
/** On-screen time for the TEXT; the dim outlives it (STEP_INTRO_DIM_MS). */
export const STEP_INTRO_TOTAL_MS = 2050;
/** Must match the .tutorial-step-intro-scrim animation duration in CSS. */
export const STEP_INTRO_DIM_MS = 3200;

function TutorialStepIntro({ introKey, title, onDone }: TutorialStepIntroProps) {
  const [beat, setBeat] = useState(0);
  const [exiting, setExiting] = useState(false);
  const [visible, setVisible] = useState(true);

  useEffect(() => {
    // prefers-reduced-motion is handled purely in CSS, so the beats always run here.
    const timers = [
      setTimeout(() => setBeat(1), BEAT_MS),
      setTimeout(() => setBeat(2), BEAT_MS * 2),
      setTimeout(() => setBeat(LAST_BEAT), BEAT_MS * 3),
      setTimeout(() => setExiting(true), STEP_INTRO_TOTAL_MS - EXIT_MS),
      setTimeout(() => {
        setVisible(false);
        onDone(introKey);
      }, STEP_INTRO_DIM_MS),
    ];
    return () => timers.forEach(clearTimeout);
  }, [introKey, onDone]);

  if (!visible) return null;

  return (
    <div className="tutorial-step-intro">
      <div className="tutorial-step-intro-scrim" aria-hidden="true" />
      <div className={`tutorial-step-intro-content${exiting ? ' tutorial-step-intro-content--exiting' : ''}`}>
        <div className="tutorial-step-intro-label" aria-hidden="true">
          <span className="tutorial-step-intro-label-line" />
          <span className="tutorial-step-intro-label-text">Objective</span>
          <span className="tutorial-step-intro-label-line" />
        </div>
        <div className="tutorial-step-intro-objective" aria-live="polite">
          {title}
        </div>
        <CountdownBeats from={COUNTDOWN_FROM} activeIndex={beat} className="tutorial-step-intro-countdown" />
      </div>
    </div>
  );
}

/** Must match the .tutorial-perimeter-seg.lost animation duration in CSS. */
const PERIMETER_LOST_BLINK_MS = 600;

export function PerimeterMeter({
  total,
  filled,
  resetNonce = 0,
}: {
  total: number;
  filled: number;
  /**
   * Increment to fire a one-shot "lost progress" blink: the segments filled
   * just before the change flash and then fade to empty, so the player SEES the
   * streak they dropped. Mounting with any value does NOT animate — only a
   * CHANGE animates.
   */
  resetNonce?: number;
}) {
  // Production callers already clamp; this guards direct callers (tests) passing filled > total.
  const safeFilled = Math.max(0, Math.min(filled, total));

  const [lostCount, setLostCount] = useState(0);
  const prevFilledRef = useRef(safeFilled);
  const lastNonceRef = useRef(resetNonce);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (resetNonce === lastNonceRef.current) return;
    lastNonceRef.current = resetNonce;
    // prevFilledRef still holds the pre-reset fill (the filled-tracking effect
    // below runs AFTER this one), so it is exactly the count we just lost.
    const lost = prevFilledRef.current;
    if (lost <= 0) return;
    setLostCount(lost);
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      setLostCount(0);
      timerRef.current = null;
    }, PERIMETER_LOST_BLINK_MS);
  }, [resetNonce]);

  useEffect(() => {
    prevFilledRef.current = safeFilled;
  }, [safeFilled]);

  useEffect(
    () => () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    },
    [],
  );

  return (
    <div
      className="tutorial-perimeter-meter"
      role="progressbar"
      aria-valuemin={0}
      aria-valuemax={total}
      aria-valuenow={safeFilled}
      aria-label="Step progress"
    >
      {Array.from({ length: total }, (_, index) => `segment-${index + 1}`).map((segmentId, i) => {
        const isFilled = i < safeFilled;
        const isLost = !isFilled && i < lostCount;
        return (
          <span
            key={segmentId}
            className={`tutorial-perimeter-seg${isFilled ? ' filled' : ''}${isLost ? ' lost' : ''}`}
          />
        );
      })}
    </div>
  );
}

interface BeamProps {
  tutorial: NonNullable<DirectorState['tutorial']>;
  currentIndex: number;
  totalSteps: number;
  step: TutorialStep | null;
  tone: Tone;
  phase: DirectorState['phase'];
  eventProgress: number;
  eventTarget: number;
  progressResetNonce: number;
  failPrompt: string | null;
  canRetryCheckpoint: boolean;
  menuOpen: boolean;
  onMenuToggle: () => void;
  onMenuClose: () => void;
  onPrev: () => void;
  onSkip: () => void;
  onRetryCheckpoint: () => void;
  onRetryStep: () => void;
  onStepDemoBack: () => void;
  onStepDemoForward: () => void;
  onSeekDemo: (ms: number) => void;
  onPlayDemo: () => void;
  onPauseDemo: () => void;
  onWatchAgain: () => void;
  demoPlayback: DemoPlaybackSession | null;
  onNext: () => void;
  onPause: () => void;
  onResume: () => void;
  onExit: () => void;
}

const CUE_TONE_COLOR: Record<DemoCursorCueTone, string> = {
  fire: 'var(--color-error)',
  shadow: 'var(--color-info)',
};

function RuleArrowIcon() {
  return (
    <svg className="tutorial-beam-rule-arrow" width="12" height="10" viewBox="0 0 12 10" fill="none" aria-hidden="true">
      <path
        d="M1 5 H10 M6.5 1.5 L10.5 5 L6.5 8.5"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function TutorialBeam(props: BeamProps) {
  const {
    tutorial,
    currentIndex,
    totalSteps,
    step,
    tone,
    phase,
    eventProgress,
    eventTarget,
    progressResetNonce,
    failPrompt,
    canRetryCheckpoint,
    menuOpen,
    onMenuToggle,
    onMenuClose,
    onPrev,
    onSkip,
    onRetryCheckpoint,
    onRetryStep,
    onStepDemoBack,
    onStepDemoForward,
    onSeekDemo,
    onPlayDemo,
    onPauseDemo,
    onWatchAgain,
    demoPlayback,
    onNext,
    onPause,
    onResume,
    onExit,
  } = props;

  const beamRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    if (!menuOpen) return;
    const handler = (event: MouseEvent) => {
      const target = event.target;
      if (!(target instanceof Node)) return;
      if (beamRef.current?.contains(target)) return;
      onMenuClose();
    };
    window.addEventListener('mousedown', handler);
    return () => window.removeEventListener('mousedown', handler);
  }, [menuOpen, onMenuClose]);

  const toneLabel = getToneLabel(tone, phase);
  const displayStep = Math.min(currentIndex + 1, totalSteps);
  const title = step ? stepLabel(step) : tutorial.title;
  const showProgress = step?.kind === 'wait-for-event' && eventTarget > 0;
  const showRetry = phase === 'failed' && canRetryCheckpoint;
  const showRetryStep = phase === 'failed' && !canRetryCheckpoint;
  const showContinue = phase === 'awaiting-user';
  const isPaused = phase === 'paused';
  const demoStep = step?.kind === 'demo' ? step : null;
  const isDemoWatchPause = isPaused && demoStep !== null && demoPlayback?.mode !== 'review';
  const demoCaption = demoStep?.cursor?.caption ?? null;
  const transportDenomMs = demoPlayback
    ? demoPlayback.mode === 'recording'
      ? Math.max(0, demoPlayback.plannedDurationMs ?? demoPlayback.frontierMs)
      : demoPlayback.durationMs
    : 0;
  const transportProgressPct =
    demoPlayback && transportDenomMs > 0
      ? Math.max(0, Math.min(100, (demoPlayback.playheadMs / transportDenomMs) * 100))
      : 0;
  const transportCurrentTick = demoPlayback ? Math.round(demoPlayback.playheadMs / demoPlayback.tickMs) : 0;
  const transportLastTick = demoPlayback ? Math.round(transportDenomMs / demoPlayback.tickMs) : 0;

  return (
    <section ref={beamRef} className="tutorial-beam" data-tone={tone} data-phase={phase} aria-label="Tutorial status">
      <span className="tutorial-beam-status" aria-hidden="true" />
      <div className="tutorial-beam-stack">
        <div className="tutorial-beam-meta">
          <span className="tutorial-beam-tone-label">{toneLabel}</span>
          <span className="tutorial-beam-step-of">
            {tutorial.title}{' '}
            <span className="tutorial-beam-num">
              {displayStep}/{totalSteps}
            </span>
          </span>
        </div>
        <div className="tutorial-beam-title">
          {failPrompt && phase === 'failed' ? failPrompt : title}
          {showProgress && (
            <span className="tutorial-beam-progress">
              {' '}
              · {eventProgress}/{eventTarget}
            </span>
          )}
        </div>
      </div>
      <div className="tutorial-beam-controls">
        {showContinue && demoPlayback?.mode !== 'review' && (
          <button type="button" className="tutorial-beam-cta" onClick={onNext} title="Continue">
            {continueLabel(step)}
          </button>
        )}
        {showRetry && (
          <button
            type="button"
            className="tutorial-beam-cta tutorial-beam-cta--retry"
            onClick={onRetryCheckpoint}
            title="Retry from checkpoint"
          >
            Retry
          </button>
        )}
        {showRetryStep && (
          <button
            type="button"
            className="tutorial-beam-cta tutorial-beam-cta--retry"
            onClick={onRetryStep}
            title="Retry this step"
          >
            Retry
          </button>
        )}
        {!showContinue && !showRetry && !showRetryStep && !demoPlayback && (
          <>
            <HoverHintButton
              type="button"
              className="tutorial-beam-btn"
              onClick={isPaused ? onResume : onPause}
              title={demoStep ? (isPaused ? 'Resume demo' : 'Pause demo') : isPaused ? 'Resume' : 'Pause'}
              aria-label={
                demoStep ? (isPaused ? 'Resume demo' : 'Pause demo') : isPaused ? 'Resume tutorial' : 'Pause tutorial'
              }
            >
              {isPaused ? <PlayIcon /> : <PauseIcon />}
            </HoverHintButton>
            {isDemoWatchPause && <span className="tutorial-beam-inline-paused">Paused</span>}
          </>
        )}
        <HoverHintButton
          type="button"
          className="tutorial-beam-btn"
          onClick={onMenuToggle}
          title="Menu"
          aria-haspopup="menu"
          aria-expanded={menuOpen}
          aria-label="Tutorial menu"
        >
          <MenuIcon />
        </HoverHintButton>
      </div>
      {/* Kept up during the review/scrub as well: it is what the learner studies while stepping back through the swaps. */}
      {demoCaption && (
        <div className="tutorial-beam-rule">
          {demoCaption.rows.map((row) => (
            <div className="tutorial-beam-rule-row" key={row.cue}>
              <span className="tutorial-beam-rule-cue" style={{ color: CUE_TONE_COLOR[row.tone] }}>
                {row.cue}
              </span>
              <RuleArrowIcon />
              <span className="tutorial-beam-rule-prayer">{row.prayer}</span>
            </div>
          ))}
        </div>
      )}
      {demoPlayback && (
        <div className="tutorial-beam-transport">
          {demoPlayback.mode === 'recording' ? (
            <div
              className="tutorial-beam-transport-track"
              style={{ '--seek-progress': `${transportProgressPct}%` } as React.CSSProperties}
              role="progressbar"
              aria-valuemin={0}
              aria-valuemax={Math.max(1, transportDenomMs)}
              aria-valuenow={demoPlayback.playheadMs}
              aria-label="Demo progress"
            />
          ) : (
            <input
              className="tutorial-beam-seek"
              type="range"
              min={0}
              max={demoPlayback.durationMs}
              step={demoPlayback.tickMs}
              value={demoPlayback.playheadMs}
              style={{ '--seek-progress': `${transportProgressPct}%` } as React.CSSProperties}
              onChange={(e) => onSeekDemo(Number(e.target.value))}
              aria-label="Demo playhead"
            />
          )}
          <div className="tutorial-beam-transport-controls">
            {demoPlayback.mode === 'recording' ? (
              <>
                <HoverHintButton
                  type="button"
                  className="tutorial-beam-btn tutorial-beam-btn--play"
                  onClick={isPaused ? onResume : onPause}
                  title={isPaused ? 'Resume demo' : 'Pause demo'}
                  aria-label={isPaused ? 'Resume demo' : 'Pause demo'}
                >
                  {isPaused ? <PlayIcon /> : <PauseIcon />}
                </HoverHintButton>
                {isDemoWatchPause && <span className="tutorial-beam-transport-paused">Paused</span>}
              </>
            ) : (
              <>
                <HoverHintButton
                  type="button"
                  className="tutorial-beam-btn"
                  onClick={onStepDemoBack}
                  disabled={demoPlayback.playheadMs <= 0}
                  title="Step back one tick"
                  aria-label="Step back one tick"
                >
                  <BackIcon />
                </HoverHintButton>
                <HoverHintButton
                  type="button"
                  className="tutorial-beam-btn tutorial-beam-btn--play"
                  onClick={demoPlayback.isPlaying ? onPauseDemo : onPlayDemo}
                  title={demoPlayback.isPlaying ? 'Pause demo' : 'Play demo'}
                  aria-label={demoPlayback.isPlaying ? 'Pause demo' : 'Play demo'}
                >
                  {demoPlayback.isPlaying ? <PauseIcon /> : <PlayIcon />}
                </HoverHintButton>
                <HoverHintButton
                  type="button"
                  className="tutorial-beam-btn"
                  onClick={onStepDemoForward}
                  disabled={demoPlayback.playheadMs >= demoPlayback.durationMs}
                  title="Step forward one tick"
                  aria-label="Step forward one tick"
                >
                  <ForwardIcon />
                </HoverHintButton>
              </>
            )}
            <span className="tutorial-beam-transport-tick">
              <span className="tutorial-beam-transport-tick-current">{transportCurrentTick}</span>
              <span className="tutorial-beam-transport-tick-sep">/</span>
              <span className="tutorial-beam-transport-tick-total">{transportLastTick}</span>
            </span>
            {demoPlayback.mode === 'review' && (
              <button type="button" className="tutorial-beam-cta" onClick={onNext} title="Continue">
                {continueLabel(step)}
              </button>
            )}
          </div>
        </div>
      )}
      {showProgress && (
        <PerimeterMeter
          total={eventTarget}
          filled={Math.min(eventProgress, eventTarget)}
          resetNonce={progressResetNonce}
        />
      )}
      {menuOpen && (
        <BeamMenu
          currentIndex={currentIndex}
          totalSteps={totalSteps}
          canRetryCheckpoint={canRetryCheckpoint}
          onPrev={() => {
            onPrev();
            onMenuClose();
          }}
          onSkip={() => {
            onSkip();
            onMenuClose();
          }}
          onRetryCheckpoint={() => {
            onRetryCheckpoint();
            onMenuClose();
          }}
          onExit={() => {
            onExit();
            onMenuClose();
          }}
          showRestartDemo={shouldShowRestartDemo(step, phase)}
          onWatchAgain={() => {
            onWatchAgain();
            onMenuClose();
          }}
        />
      )}
    </section>
  );
}

interface BeamMenuProps {
  currentIndex: number;
  totalSteps: number;
  canRetryCheckpoint: boolean;
  onPrev: () => void;
  onSkip: () => void;
  onRetryCheckpoint: () => void;
  onExit: () => void;
  showRestartDemo: boolean;
  onWatchAgain: () => void;
}

function BeamMenu({
  currentIndex,
  totalSteps,
  canRetryCheckpoint,
  showRestartDemo,
  onPrev,
  onSkip,
  onRetryCheckpoint,
  onWatchAgain,
  onExit,
}: BeamMenuProps) {
  const atFirst = currentIndex <= 0;
  const atLast = currentIndex >= totalSteps - 1;
  return (
    <div className="tutorial-beam-menu" role="menu">
      <button type="button" className="tutorial-beam-menu-item" role="menuitem" onClick={onPrev} disabled={atFirst}>
        <BackIcon />
        <span>Previous step</span>
      </button>
      <button type="button" className="tutorial-beam-menu-item" role="menuitem" onClick={onSkip} disabled={atLast}>
        <SkipIcon />
        <span>Skip step</span>
      </button>
      {canRetryCheckpoint && (
        <button type="button" className="tutorial-beam-menu-item" role="menuitem" onClick={onRetryCheckpoint}>
          <RetryIcon />
          <span>Retry from checkpoint</span>
        </button>
      )}
      {showRestartDemo && (
        <button type="button" className="tutorial-beam-menu-item" role="menuitem" onClick={onWatchAgain}>
          <RetryIcon />
          <span>Restart demo</span>
        </button>
      )}
      <div className="tutorial-beam-menu-divider" />
      <button
        type="button"
        className="tutorial-beam-menu-item tutorial-beam-menu-item--danger"
        role="menuitem"
        onClick={onExit}
      >
        <ExitIcon />
        <span>Exit training</span>
      </button>
    </div>
  );
}

interface CodexProps {
  tutorial: NonNullable<DirectorState['tutorial']>;
  currentIndex: number;
  totalSteps: number;
  step: TutorialStep;
  completedSteps: readonly number[];
  stepsListOpen: boolean;
  onStepsListToggle: () => void;
  onStepsListClose: () => void;
  onJumpToStep: (index: number) => void;
  onPrev: () => void;
  onNext: () => void;
  /** Leaves training. The beam keeps it in its menu; without this the codex would leave the
   *  Mobile pop-out (not held open for a whole lesson) as the only way out on a phone. */
  onExit: () => void;
}

function TutorialCodex(props: CodexProps) {
  const {
    tutorial,
    currentIndex,
    totalSteps,
    step,
    stepsListOpen,
    completedSteps,
    onStepsListToggle,
    onStepsListClose,
    onJumpToStep,
    onPrev,
    onNext,
    onExit,
  } = props;

  const codexRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    if (!stepsListOpen) return;
    const handler = (event: MouseEvent) => {
      const target = event.target;
      if (!(target instanceof Node)) return;
      if (codexRef.current?.contains(target)) return;
      onStepsListClose();
    };
    window.addEventListener('mousedown', handler);
    return () => window.removeEventListener('mousedown', handler);
  }, [stepsListOpen, onStepsListClose]);

  const displayStep = Math.min(currentIndex + 1, totalSteps);
  const kindLabel =
    step.kind === 'video'
      ? 'Video'
      : step.kind === 'spotlight'
        ? 'Note'
        : step.kind === 'encounter-control'
          ? 'Setup'
          : step.kind === 'checkpoint'
            ? 'Checkpoint'
            : 'Info';
  const nextStep = currentIndex + 1 < totalSteps ? tutorial.steps[currentIndex + 1] : null;
  const ctaLabel = continueLabel(step);
  const showSteps = stepsListOpen;

  return (
    <div
      ref={codexRef}
      className={`tutorial-codex${showSteps ? ' tutorial-codex--steps' : ''}`}
      role="dialog"
      aria-label={showSteps ? 'All tutorial steps' : 'Step content'}
    >
      <header className="tutorial-codex-head">
        <div className="tutorial-codex-head-text">
          <div className="tutorial-codex-eyebrow">
            {showSteps ? tutorial.title : `${tutorial.title} · step ${displayStep} of ${totalSteps} · ${kindLabel}`}
          </div>
          <h2 className="tutorial-codex-title">
            {showSteps ? `All steps · ${displayStep} of ${totalSteps}` : stepLabel(step)}
          </h2>
        </div>
        <button type="button" className="tutorial-codex-foot-btn" onClick={onExit} aria-label="Exit training">
          Exit
        </button>
      </header>

      <div className="tutorial-codex-body">
        {showSteps ? (
          <StepsList
            tutorial={tutorial}
            currentIndex={currentIndex}
            completedSteps={completedSteps}
            onJumpToStep={onJumpToStep}
          />
        ) : (
          renderCodexBody(step)
        )}
      </div>

      {!showSteps && nextStep && (
        <div className="tutorial-codex-callout">
          <div className="tutorial-codex-callout-text">
            <div className="tutorial-codex-callout-eyebrow">Up next</div>
            <div className="tutorial-codex-callout-title">{stepLabel(nextStep)}</div>
          </div>
        </div>
      )}

      <footer className="tutorial-codex-foot">
        {showSteps ? (
          <>
            <span aria-hidden="true" />
            <button type="button" className="tutorial-codex-foot-btn" onClick={onStepsListClose} title="Back to step">
              Back to step
            </button>
            <button
              type="button"
              className="tutorial-codex-foot-btn tutorial-codex-foot-btn--primary"
              onClick={onNext}
              title="Continue"
            >
              {ctaLabel}
            </button>
          </>
        ) : (
          <>
            <button
              type="button"
              className="tutorial-codex-foot-btn"
              onClick={onPrev}
              disabled={currentIndex <= 0}
              title="Back"
            >
              Back
            </button>
            <button
              type="button"
              className="tutorial-codex-foot-btn"
              onClick={onStepsListToggle}
              title="All steps"
              aria-expanded={stepsListOpen}
            >
              Steps
            </button>
            <button
              type="button"
              className="tutorial-codex-foot-btn tutorial-codex-foot-btn--primary"
              onClick={onNext}
              title="Continue"
            >
              {ctaLabel}
            </button>
          </>
        )}
      </footer>
    </div>
  );
}
interface StepsListProps {
  tutorial: NonNullable<DirectorState['tutorial']>;
  currentIndex: number;
  completedSteps: readonly number[];
  onJumpToStep: (index: number) => void;
}

function StepsList({ tutorial, currentIndex, completedSteps, onJumpToStep }: StepsListProps) {
  const activeRef = useRef<HTMLLIElement | null>(null);
  useEffect(() => {
    activeRef.current?.scrollIntoView({ block: 'nearest', behavior: 'auto' });
  }, []);

  const completedSet = new Set(completedSteps);

  return (
    <ol className="tutorial-steps-list" aria-label="Tutorial steps">
      {tutorial.steps.map((step, idx) => {
        // Active overrides done: the currently-running step always shows as
        // active even if it was completed in a prior run (you're doing it again).
        const status = idx === currentIndex ? 'active' : completedSet.has(idx) ? 'done' : 'pending';
        const label = stepLabel(step);
        const isActive = status === 'active';
        return (
          <li
            key={`${step.kind}:${label}`}
            ref={isActive ? activeRef : undefined}
            className={`tutorial-steps-item ${status}`}
          >
            <button
              type="button"
              className="tutorial-steps-item-btn"
              onClick={() => onJumpToStep(idx)}
              disabled={isActive}
              aria-current={isActive ? 'step' : undefined}
              title={isActive ? `${label} — you are here` : `Go to: ${label}`}
            >
              <span className="tutorial-steps-marker" aria-hidden="true">
                {status === 'done' ? (
                  <svg viewBox="0 0 12 12" aria-hidden="true" focusable="false">
                    <path d="M2.5 6.5 L5 9 L10 3" />
                  </svg>
                ) : (
                  <span>{idx + 1}</span>
                )}
              </span>
              <span className="tutorial-steps-label">{label}</span>
              {isActive && (
                <span className="tutorial-steps-current-tag" aria-hidden="true">
                  current
                </span>
              )}
            </button>
          </li>
        );
      })}
    </ol>
  );
}

interface PauseProps {
  tutorial: NonNullable<DirectorState['tutorial']>;
  currentIndex: number;
  totalSteps: number;
  step: TutorialStep | null;
  onResume: () => void;
  onExit: () => void;
}

function TutorialPauseOverlay({ tutorial, currentIndex, totalSteps, step, onResume, onExit }: PauseProps) {
  const displayStep = Math.min(currentIndex + 1, totalSteps);
  return (
    <div className="tutorial-pause-backdrop" role="dialog" aria-modal="true" aria-labelledby="tutorial-pause-title">
      <div className="tutorial-pause-card">
        <header className="tutorial-pause-card-head">
          <h3 id="tutorial-pause-title">Paused</h3>
        </header>
        <div className="tutorial-pause-card-body">
          <p className="tutorial-pause-card-meta">
            {tutorial.title} ·{' '}
            <span className="tutorial-pause-card-step-of">
              step {displayStep} of {totalSteps}
            </span>
          </p>
          {step && <p className="tutorial-pause-card-helper">{stepLabel(step)}</p>}
        </div>
        <footer className="tutorial-pause-card-foot">
          <button
            type="button"
            className="tutorial-pause-card-btn tutorial-pause-card-btn--full tutorial-pause-card-btn--primary"
            onClick={onResume}
          >
            Resume
          </button>
          <button
            type="button"
            className="tutorial-pause-card-btn tutorial-pause-card-btn--full tutorial-pause-card-btn--danger"
            onClick={onExit}
          >
            Exit training
          </button>
        </footer>
      </div>
    </div>
  );
}

export interface CourseRung {
  id: string;
  title: string;
  done: boolean;
  earned: boolean;
}

export interface CourseStanding {
  courseTitle: string;
  rungs: CourseRung[];
  position: number;
  completedCount: number;
  next: { id: string; title: string } | null;
}

/**
 * Startable lessons come from getStartableTutorials, the same helper the Training picker
 * counts its rail with, so the two can never disagree about what "N of M" means. The
 * finished lesson is forced `done` instead of read back from persistence: the director's
 * write and this render are not ordered.
 */
export function readCourseStanding(tutorialId: string): CourseStanding | null {
  const course = getCourseForTutorial(tutorialId);
  if (!course) return null;

  const lessons = getStartableTutorials(course);
  if (lessons.length === 0) return null;

  const rungs: CourseRung[] = lessons.map((lesson) => {
    const earned = lesson.id === tutorialId;
    return {
      id: lesson.id,
      title: lesson.title,
      done: earned || (loadTutorialProgress(lesson.id)?.completed ?? false),
      earned,
    };
  });

  const index = rungs.findIndex((r) => r.earned);
  if (index === -1) return null;

  const next = rungs.slice(index + 1).find((r) => !r.done) ?? rungs.find((r) => !r.done) ?? null;
  return {
    courseTitle: course.title,
    rungs,
    position: index + 1,
    completedCount: rungs.filter((r) => r.done).length,
    next: next ? { id: next.id, title: next.title } : null,
  };
}

interface CompletionProps {
  tutorial: NonNullable<DirectorState['tutorial']>;
  onDismiss: () => void;
  onStartNextLesson: (tutorialId: string) => void;
}

// No stat block: steps / difficulty / estimated duration are static Tutorial fields,
// identical before and after the run, so they report nothing the player earned.
function TutorialCompletionModal({ tutorial, onDismiss, onStartNextLesson }: CompletionProps) {
  const standing = useMemo(() => readCourseStanding(tutorial.id), [tutorial.id]);
  const next = standing?.next ?? null;

  return (
    <div
      className="tutorial-completion-backdrop"
      role="dialog"
      aria-modal="true"
      /* Both halves of the headline: the status lives in the kicker and the subject in the
         title, so naming only one announces the dialog as a bare lesson name. */
      aria-labelledby="tutorial-completion-status tutorial-completion-title"
    >
      <div className="tutorial-completion-card">
        <div className="tutorial-completion-crest">
          <svg
            className="tutorial-completion-mark"
            viewBox="0 0 36 36"
            width="44"
            height="44"
            aria-hidden="true"
            focusable="false"
          >
            <path
              className="tutorial-completion-mark-outer"
              d="M18 4 Q14 10 14 14 Q12 12 11 10 Q9 18 10 22 Q8 22 6 20 Q6 28 12 32 Q14 28 14 26 Q16 30 18 32 Q20 30 22 26 Q22 28 24 32 Q30 28 30 20 Q28 22 26 22 Q27 18 25 10 Q24 12 22 14 Q22 10 18 4 Z"
            />
            <path
              className="tutorial-completion-mark-core"
              d="M18 12 Q15 17 15 20 Q14 19 13 18 Q12 22 13 25 Q16 28 18 28 Q20 28 23 25 Q24 22 23 18 Q22 19 21 20 Q21 17 18 12 Z"
            />
            <path className="tutorial-completion-mark-check" d="M14.6 20.6 L17.3 23.3 L22.6 17" />
          </svg>

          <div className="tutorial-completion-kicker">
            <span className="tutorial-completion-kicker-rule" aria-hidden="true" />
            <span className="tutorial-completion-kicker-text" id="tutorial-completion-status">
              Lesson complete
            </span>
            <span className="tutorial-completion-kicker-rule" aria-hidden="true" />
          </div>

          <h3 id="tutorial-completion-title" className="tutorial-completion-title">
            {tutorial.title}
          </h3>
          {standing && (
            <p className="tutorial-completion-place">
              {standing.courseTitle} {'\u00b7'} Lesson {standing.position} of {standing.rungs.length}
            </p>
          )}
        </div>

        {standing && (
          <div className="tutorial-completion-body">
            <div className="tutorial-completion-track-head">
              <span className="tutorial-completion-track-label">Course progress</span>
              <span className="tutorial-completion-track-count">
                {standing.completedCount} / {standing.rungs.length}
              </span>
            </div>
            {/* is-complete lifts every cleared segment to full strength; without it a finished
                course reads as "you are on the last one". */}
            {/* aria-hidden: the bar is a visual restatement of the "Course
                progress N / M" line right above it, so announcing six unlabeled
                list items would be noise. The li titles stay as mouse tooltips. */}
            <ol className={`tutorial-completion-track${next ? '' : ' is-complete'}`} aria-hidden="true">
              {standing.rungs.map((rung) => (
                <li
                  key={rung.id}
                  className={`tutorial-completion-seg${rung.earned ? ' is-earned' : rung.done ? ' is-done' : ''}`}
                  title={rung.title}
                />
              ))}
            </ol>
            <p className={`tutorial-completion-next${next ? '' : ' is-complete'}`}>
              {next ? (
                <>
                  <span className="tutorial-completion-next-label">Next up</span>
                  <span className="tutorial-completion-next-name">{next.title}</span>
                </>
              ) : (
                <span className="tutorial-completion-next-done">Course complete. Every lesson cleared.</span>
              )}
            </p>
          </div>
        )}

        <footer className="tutorial-completion-foot">
          {next ? (
            <>
              <button type="button" className="tutorial-completion-foot-btn" onClick={onDismiss}>
                Back to training
              </button>
              {/* Visible label stays short so the two actions balance; the accessible name carries which lesson it starts. */}
              <button
                type="button"
                className="tutorial-completion-foot-btn tutorial-completion-foot-btn--primary"
                onClick={() => onStartNextLesson(next.id)}
                aria-label={`Next lesson: ${next.title}`}
              >
                Next lesson
              </button>
            </>
          ) : (
            <button
              type="button"
              className="tutorial-completion-foot-btn tutorial-completion-foot-btn--primary tutorial-completion-foot-btn--full"
              onClick={onDismiss}
            >
              Back to training
            </button>
          )}
        </footer>
      </div>
    </div>
  );
}

export function continueLabel(step: TutorialStep | null): string {
  if (!step) return 'Continue';
  if (step.kind === 'info' && step.continueLabel) return step.continueLabel;
  if (step.kind === 'video' && step.continueLabel) return step.continueLabel;
  if (step.kind === 'checkpoint' && step.continueLabel) return step.continueLabel;
  return 'Continue';
}

export function stepLabel(step: TutorialStep): string {
  switch (step.kind) {
    case 'spotlight':
      return step.popover.title;
    case 'info':
    case 'video':
    case 'world-highlight':
    case 'wait-for-event':
    case 'checkpoint':
    case 'demo':
      return step.title;
    case 'encounter-control':
      return step.title ?? 'Encounter setup';
  }
}

function renderCodexBody(step: TutorialStep): React.ReactNode {
  switch (step.kind) {
    case 'spotlight':
      return <SpotlightBody step={step} />;
    case 'info':
      return <InfoBody step={step} />;
    case 'video':
      return <VideoBody step={step} />;
    // Beam-presented kinds never reach here; these cases keep the switch exhaustive.
    case 'world-highlight':
      return (
        <p className="tutorial-codex-text">
          <TutorialMarkup html={step.body} />
        </p>
      );
    case 'wait-for-event':
      return (
        <p className="tutorial-codex-text">
          <TutorialMarkup html={step.body} />
        </p>
      );
    case 'checkpoint':
      return (
        <p className="tutorial-codex-text">
          <TutorialMarkup html={step.body} />
        </p>
      );
    case 'demo':
      return (
        <p className="tutorial-codex-text">
          <TutorialMarkup html={step.body} />
        </p>
      );
    case 'encounter-control':
      return step.body ? (
        <p className="tutorial-codex-text">
          <TutorialMarkup html={step.body} />
        </p>
      ) : null;
  }
}

function SpotlightBody({ step }: { step: SpotlightStep }) {
  return (
    <p className="tutorial-codex-text">
      <TutorialMarkup html={step.popover.description} />
    </p>
  );
}

function InfoBody({ step }: { step: InfoStep }) {
  return (
    <div className="tutorial-codex-rich">
      {step.imageUrl && <img className="tutorial-codex-image" src={step.imageUrl} alt="" />}
      {step.videoUrl && <TutorialVideoPlayer videoUrl={step.videoUrl} posterUrl={step.videoPosterUrl} />}
      <p className="tutorial-codex-text">
        <TutorialMarkup html={step.body} />
      </p>
    </div>
  );
}

function VideoBody({ step }: { step: VideoStep }) {
  return (
    <div className="tutorial-codex-rich">
      <TutorialVideoPlayer
        videoUrl={step.videoUrl}
        posterUrl={step.posterUrl}
        loop={step.loop}
        autoplay={step.autoplay}
      />
      {step.body && (
        <p className="tutorial-codex-text">
          <TutorialMarkup html={step.body} />
        </p>
      )}
    </div>
  );
}

interface VideoPlayerProps {
  videoUrl: string;
  posterUrl?: string;
  loop?: boolean;
  autoplay?: boolean;
}

function TutorialVideoPlayer({ videoUrl, posterUrl, loop, autoplay }: VideoPlayerProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [hasError, setHasError] = useState(false);

  if (hasError) {
    return (
      <div className="tutorial-codex-video-fallback">
        <div className="tutorial-codex-video-fallback-title">Video unavailable</div>
        <div className="tutorial-codex-video-fallback-text">{videoUrl}</div>
      </div>
    );
  }

  return (
    <video
      ref={videoRef}
      className="tutorial-codex-video"
      src={videoUrl}
      poster={posterUrl}
      controls
      muted
      loop={loop}
      autoPlay={autoplay}
      onError={() => setHasError(true)}
    >
      <track kind="captions" />
    </video>
  );
}

function PauseIcon() {
  return (
    <svg viewBox="0 0 12 12" aria-hidden="true" focusable="false">
      <line x1="4" y1="3" x2="4" y2="9" />
      <line x1="8" y1="3" x2="8" y2="9" />
    </svg>
  );
}

function PlayIcon() {
  return (
    <svg viewBox="0 0 12 12" aria-hidden="true" focusable="false">
      <path d="M4 3 L4 9 L9 6 Z" />
    </svg>
  );
}

function MenuIcon() {
  return (
    <svg viewBox="0 0 12 12" aria-hidden="true" focusable="false">
      <circle cx="6" cy="2.5" r="0.6" />
      <circle cx="6" cy="6" r="0.6" />
      <circle cx="6" cy="9.5" r="0.6" />
    </svg>
  );
}

function BackIcon() {
  return (
    <svg viewBox="0 0 12 12" aria-hidden="true" focusable="false">
      <path d="M7.5 2.5 L4 6 L7.5 9.5" />
    </svg>
  );
}

function ForwardIcon() {
  return (
    <svg viewBox="0 0 12 12" aria-hidden="true" focusable="false">
      <path d="M4.5 2.5 L8 6 L4.5 9.5" />
    </svg>
  );
}

function SkipIcon() {
  return (
    <svg viewBox="0 0 12 12" aria-hidden="true" focusable="false">
      <path d="M3 2.5 L7.5 6 L3 9.5 M9 2.5 L9 9.5" />
    </svg>
  );
}

function RetryIcon() {
  return (
    <svg viewBox="0 0 12 12" aria-hidden="true" focusable="false">
      <path d="M9.5 4 A4 4 0 1 0 10 7.5 M9.5 1.5 L9.5 4 L7 4" />
    </svg>
  );
}

function ExitIcon() {
  return (
    <svg viewBox="0 0 12 12" aria-hidden="true" focusable="false">
      <path d="M4.5 2 L2 2 L2 10 L4.5 10 M6 4 L9 6 L6 8 M9 6 L4 6" />
    </svg>
  );
}
