import type { GameEvent } from '../../core/events/types';
import { OSRS_TICK_MS } from '../../types/simulation';
import { resolveTutorialEncounterCommand, TutorialEncounterCommandSetupError } from '../encounterCommands';
import type {
  CheckpointStep,
  DemoCursorCue,
  DemoStep,
  EncounterControlAction,
  EncounterControlStep,
  InfoStep,
  Tutorial,
  TutorialStep,
  VideoStep,
  WaitForEventStep,
  WorldHighlightStep,
} from '../types';
import { DemoPlayheadStore } from './demoPlayheadStore';
import {
  type DemoPlaybackFrame,
  type DirectorBannerMessage,
  type DirectorPhase,
  type DirectorState,
  INITIAL_DIRECTOR_STATE,
  type TutorialDirectorAdapter,
} from './types';

const SUCCESS_BANNER_MS = 1800;
const STEP_INTRO_BEAT_MS = 450;
export const STEP_INTRO_COUNTDOWN_MS = STEP_INTRO_BEAT_MS * 3;

/**
 * Convert a demo's cursor cues from ABSOLUTE engine ticks to DEMO-LOCAL ticks for
 * snapshot review. The live cursor runs off the engine tickBus (absolute ticks),
 * but review scrubs a demo-local playhead (0..durationMs), so tick-anchored cues
 * must be shifted by the demo's start tick (frames[0].engineTick, e.g. a
 * fast-forward target). ms-anchored cues are demo-local wall-clock and unchanged.
 */
function localizeDemoCursorCues(cues: readonly DemoCursorCue[], demoStartTick: number): readonly DemoCursorCue[] {
  if (demoStartTick === 0) return cues;
  return cues.map((cue) =>
    cue.time.kind === 'tick' ? { ...cue, time: { ...cue.time, tick: cue.time.tick - demoStartTick } } : cue,
  );
}
const FAIL_BANNER_MS = 4000;

interface ActiveStepRunner {
  cancel(): void;
}

interface NavOpts {
  /**
   * True when the user explicitly navigated here (Back / Steps-list jump).
   * Suppresses auto-advance on `encounter-control` and `checkpoint` targets
   * so the user lands ON the step they chose and clicks Continue to move on,
   * instead of the step silently auto-completing past them.
   */
  fromUserNav?: boolean;
}

export class TutorialDirector {
  private state: DirectorState = { ...INITIAL_DIRECTOR_STATE };
  private listeners = new Set<(state: DirectorState) => void>();
  /**
   * Per-frame demo review playhead. Kept OUT of React `state` so the autoplay
   * RAF can advance it every frame without re-rendering App/Grid; only the demo
   * cursor overlay subscribes to it. `state.demoPlayback.playheadMs` mirrors it
   * at tick granularity (see advanceDemoPlayhead).
   */
  readonly demoPlayheadStore = new DemoPlayheadStore();
  private activeRunner: ActiveStepRunner | null = null;
  private bannerTimerId: ReturnType<typeof setTimeout> | null = null;
  /**
   * A pending auto-advance continuation captured while the user is paused.
   * Fired on resume(); cleared whenever the active runner is canceled.
   */
  private deferredAdvance: (() => void) | null = null;
  /**
   * Mirrored Set of completedSteps for O(1) add. We mutate this in `next()`
   * and `complete()` then publish a sorted readonly array into `state.completedSteps`.
   * NOTE: this is a pure visual marker — NEVER read it to skip / gate / alter
   * step execution. The contract is 'done' steps run identically to 'not done'.
   */
  private completedStepsSet = new Set<number>();

  constructor(private adapter: TutorialDirectorAdapter) {}

  start(tutorial: Tutorial, opts?: { resumeFromStep?: number; initialCompletedSteps?: readonly number[] }): void {
    this.cancelActiveRunner();
    this.clearBannerTimer();
    const startIndex = Math.max(0, Math.min(opts?.resumeFromStep ?? 0, tutorial.steps.length - 1));
    // Seed completedSteps from persistence so the StepsList checkmarks survive
    // tutorial exit/resume. Only valid step indices are kept.
    const lastIndex = tutorial.steps.length - 1;
    this.completedStepsSet = new Set((opts?.initialCompletedSteps ?? []).filter((idx) => idx >= 0 && idx <= lastIndex));
    this.setState({
      tutorial,
      stepIndex: -1,
      currentStep: null,
      phase: 'running',
      eventProgress: 0,
      eventTarget: 0,
      failPrompt: null,
      banner: null,
      lastCheckpointIndex: this.findLastCheckpointBefore(tutorial, startIndex),
      completedSteps: this.sortedCompletedSteps(),
    });
    this.advanceTo(startIndex);
  }

  next(): void {
    this.advancePastCurrent(true);
  }

  /**
   * `markComplete` records the current step in
   * the completedSteps marker set (the StepsList checkmark) — true for natural
   * progression (next / auto-advance / event count reached), false for an
   * explicit user skip so skipped steps don't show a false 'done' checkmark.
   */
  private advancePastCurrent(markComplete: boolean): void {
    const { tutorial, stepIndex } = this.state;
    if (!tutorial) return;
    this.cancelActiveRunner();
    if (markComplete) this.markStepComplete(stepIndex);
    const nextIndex = stepIndex + 1;
    if (nextIndex >= tutorial.steps.length) {
      this.complete();
      return;
    }
    this.advanceTo(nextIndex);
  }

  prev(): void {
    const { tutorial, stepIndex } = this.state;
    if (!tutorial || stepIndex <= 0) return;
    this.cancelActiveRunner();
    this.advanceToFromUserNav(stepIndex - 1);
  }

  skipStep(): void {
    this.advancePastCurrent(false);
  }

  goToStep(index: number): void {
    const { tutorial, stepIndex } = this.state;
    if (!tutorial) return;
    const target = Math.max(0, Math.min(index, tutorial.steps.length - 1));
    if (target === stepIndex) return;
    this.cancelActiveRunner();
    this.advanceToFromUserNav(target);
  }

  /**
   * Replay the current demo step from the top ("Watch Again"). Valid once the
   * demo has finished (awaiting-user); re-runs the step through the standard
   * dispatch so setup / reset / choreography all replay cleanly.
   */
  watchAgain(): void {
    const { currentStep, stepIndex, phase } = this.state;
    if (currentStep?.kind !== 'demo' || phase !== 'awaiting-user') return;
    this.cancelActiveRunner();
    this.advanceTo(stepIndex);
  }

  private setDemoPlayhead(ms: number, isPlaying: boolean): void {
    const dp = this.state.demoPlayback;
    if (!dp) return;
    const clamped = Math.max(0, Math.min(dp.durationMs, ms));
    // Always sync the per-frame store so the demo cursor jumps to the seeked/
    // paused position even when the (tick-granular) React playhead is unchanged.
    this.demoPlayheadStore.set(clamped);
    if (clamped === dp.playheadMs && isPlaying === dp.isPlaying) return;
    this.setState({ demoPlayback: { ...dp, playheadMs: clamped, isPlaying } });
  }

  seekDemo(ms: number): void {
    this.setDemoPlayhead(ms, false);
  }

  stepDemoBack(): void {
    const dp = this.state.demoPlayback;
    if (!dp) return;
    this.setDemoPlayhead((Math.round(dp.playheadMs / dp.tickMs) - 1) * dp.tickMs, false);
  }

  stepDemoForward(): void {
    const dp = this.state.demoPlayback;
    if (!dp) return;
    this.setDemoPlayhead((Math.round(dp.playheadMs / dp.tickMs) + 1) * dp.tickMs, false);
  }

  playDemo(): void {
    const dp = this.state.demoPlayback;
    if (!dp) return;
    const current = this.demoPlayheadStore.getSnapshot();
    const startMs = current >= dp.durationMs ? 0 : current;
    this.demoPlayheadStore.set(startMs);
    this.setState({ demoPlayback: { ...dp, playheadMs: startMs, isPlaying: true } });
  }

  pauseDemo(): void {
    // Preserve the exact sub-tick position: the store holds the true per-frame
    // playhead (React state only tracks tick boundaries during autoplay).
    if (!this.state.demoPlayback) return;
    this.setDemoPlayhead(this.demoPlayheadStore.getSnapshot(), false);
  }

  setDemoSpeed(speed: number): void {
    const dp = this.state.demoPlayback;
    if (!dp || dp.speed === speed) return;
    this.setState({ demoPlayback: { ...dp, speed } });
  }

  advanceDemoPlayhead(deltaMs: number): void {
    const dp = this.state.demoPlayback;
    if (!dp || !dp.isPlaying) return;
    const next = Math.min(dp.durationMs, this.demoPlayheadStore.getSnapshot() + deltaMs);
    // Per-frame: advance the store only (no React setState) so the demo cursor
    // glides smoothly without re-rendering App/Grid every frame.
    this.demoPlayheadStore.set(next);
    if (next >= dp.durationMs) {
      this.setState({ demoPlayback: { ...dp, playheadMs: dp.durationMs, isPlaying: false } });
      return;
    }
    // React state (demonstrated tick snapshot + transport) only needs to change
    // when the integer tick index changes — at most once per tick, not per frame.
    if (Math.round(next / dp.tickMs) !== Math.round(dp.playheadMs / dp.tickMs)) {
      this.setState({ demoPlayback: { ...dp, playheadMs: next } });
    }
  }

  pause(): void {
    if (this.state.phase !== 'running' && this.state.phase !== 'awaiting-user') return;
    this.adapter.pauseSim();
    this.setState({ phase: 'paused' });
  }

  resume(): void {
    if (this.state.phase !== 'paused') return;
    this.adapter.resumeSim();
    this.setState({ phase: 'running' });
    // Fire any auto-advance that was deferred because we were paused.
    const deferred = this.deferredAdvance;
    this.deferredAdvance = null;
    deferred?.();
  }

  retryFromCheckpoint(): void {
    const { tutorial, lastCheckpointIndex } = this.state;
    if (!tutorial || lastCheckpointIndex == null) {
      this.exit();
      return;
    }
    const checkpoint = tutorial.steps[lastCheckpointIndex];
    if (checkpoint?.kind !== 'checkpoint') {
      this.exit();
      return;
    }
    this.cancelActiveRunner();
    this.setState({
      phase: 'running',
      failPrompt: null,
      eventProgress: 0,
      eventTarget: 0,
      banner: { text: 'Restarting from checkpoint…', tone: 'info', clearAfterMs: 1500 },
    });
    this.scheduleBannerClear(1500);
    // advanceTo runs the checkpoint step, which applies its seed (once) via
    // runCheckpoint and then auto-advances into the post-checkpoint steps.
    // Seeding here directly as well would double-apply it — a second full
    // engine reset (re-randomized player position, equipment restore, replay
    // restart) on every retry, since the second pass sees the encounter already
    // settled and takes the reset branch.
    this.advanceTo(lastCheckpointIndex);
  }

  /**
   * Retry the current step in place. Recovery path for a failed step that has
   * no preceding checkpoint (so "Retry from checkpoint" is unavailable). Re-runs
   * the user-nav re-entry for the current index: replays the setup-bearing steps
   * before it, then re-activates the step with its own inline setup — reseeding
   * the encounter into the state the step expects.
   */
  retryStep(): void {
    const { tutorial, stepIndex } = this.state;
    if (!tutorial || stepIndex < 0) return;
    this.cancelActiveRunner();
    this.advanceToFromUserNav(stepIndex);
  }

  exit(): void {
    this.cancelActiveRunner();
    this.clearBannerTimer();
    this.adapter.resumeSim();
    this.adapter.setTickScale(1);
    // Clear any tutorial-driven autopath target (demo clickTarget /
    // set-target-tile) so the player doesn't keep walking after exit.
    this.adapter.setTargetTile(null);
    // Reset the local completedSteps set so a subsequent start() doesn't
    // leak progress from the previous tutorial. The fresh state is then
    // re-seeded from persistence inside start() via initialCompletedSteps.
    this.completedStepsSet = new Set();
    this.setState({ ...INITIAL_DIRECTOR_STATE });
  }

  onPlayerDeath(): void {
    if (this.state.phase === 'idle' || this.state.phase === 'complete') return;
    this.cancelActiveRunner();
    this.fail('You died. Retry from checkpoint?');
  }

  /**
   * Called by the DemoCursorLayer when a demo cue's REQUIRED target is missing
   * at click time. Per the `required` contract (types.ts), a missing required
   * target FAILS the step rather than silently producing a "successful" broken
   * demo (e.g. on a selector regression). No-op unless a demo step is running.
   */
  reportDemoTargetMissing(label: string | null): void {
    if (this.state.currentStep?.kind !== 'demo') return;
    if (this.state.phase !== 'running') return;
    this.cancelActiveRunner();
    this.fail(
      label
        ? `Demo couldn't find "${label}". Exit and retry.`
        : "Demo couldn't find a required target. Exit and retry.",
    );
  }

  getState(): DirectorState {
    return this.state;
  }

  subscribe(listener: (state: DirectorState) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private setState(patch: Partial<DirectorState>): void {
    this.state = { ...this.state, ...patch };
    for (const listener of this.listeners) listener(this.state);
  }

  private complete(): void {
    this.adapter.resumeSim();
    this.adapter.setTickScale(1);
    // The final step finishes via complete() (no further next() call), so mark
    // it done here. By the time complete() runs, stepIndex still points at the
    // last step that just finished.
    this.markStepComplete(this.state.stepIndex);
    this.setState({
      phase: 'complete',
      currentStep: null,
      eventProgress: 0,
      eventTarget: 0,
      banner: { text: 'Tutorial complete!', tone: 'success', clearAfterMs: SUCCESS_BANNER_MS },
    });
    this.scheduleBannerClear(SUCCESS_BANNER_MS);
  }

  /**
   * This is a pure visual marker for the StepsList checkmark UI.
   * The director MUST NEVER read `completedSteps` to skip, gate, or alter
   * step execution. A 'done' step runs identically to a 'not done' step.
   */
  private markStepComplete(idx: number): void {
    if (idx < 0) return;
    if (this.completedStepsSet.has(idx)) return;
    this.completedStepsSet.add(idx);
    this.setState({ completedSteps: this.sortedCompletedSteps() });
  }

  private sortedCompletedSteps(): readonly number[] {
    return Array.from(this.completedStepsSet).sort((a, b) => a - b);
  }

  private fail(reason: string): void {
    this.adapter.pauseSim();
    this.setState({
      phase: 'failed',
      failPrompt: reason,
      banner: { text: reason, tone: 'error', clearAfterMs: FAIL_BANNER_MS },
    });
    this.scheduleBannerClear(FAIL_BANNER_MS);
  }

  private clearBannerTimer(): void {
    if (this.bannerTimerId) {
      clearTimeout(this.bannerTimerId);
      this.bannerTimerId = null;
    }
  }

  private scheduleBannerClear(ms: number): void {
    this.clearBannerTimer();
    this.bannerTimerId = setTimeout(() => {
      this.bannerTimerId = null;
      this.setState({ banner: null });
    }, ms);
  }

  /**
   * Run an auto-advance continuation now, or defer it until `resume()` if the
   * user has paused. Without this, a pending `advanceDelayMs` timer or a
   * checkpoint seed promise could fire `next()` behind the pause overlay and
   * silently advance the tutorial while the user believes it is halted.
   */
  private advanceOrDefer(fn: () => void): void {
    if (this.state.phase === 'paused') {
      this.deferredAdvance = fn;
      return;
    }
    fn();
  }

  private cancelActiveRunner(): void {
    this.activeRunner?.cancel();
    this.activeRunner = null;
    this.deferredAdvance = null;
  }

  private advanceTo(index: number, opts: NavOpts = {}): void {
    const { tutorial } = this.state;
    if (!tutorial) return;
    const step = tutorial.steps[index];
    if (!step) {
      this.complete();
      return;
    }
    // Read steps pause the sim so the user can read in safety. Act steps
    // resume so events fire / scripted actions tick / players can move.
    // wait-for-event in particular MUST resume — the tickBus is gated by
    // engine.isTutorialPaused() (useSimulationWiring.ts), so a paused sim
    // means no events ever reach the director.
    if (TutorialDirector.stepNeedsLiveSim(step) && !TutorialDirector.stepShowsIntroCountdown(step)) {
      this.adapter.resumeSim();
    } else {
      this.adapter.pauseSim();
    }
    this.setState({
      stepIndex: index,
      currentStep: step,
      phase: 'running',
      eventProgress: 0,
      eventTarget: 0,
      failPrompt: null,
      lastCheckpointIndex: this.findLastCheckpointBefore(tutorial, index),
      stepIntroActive: false,
      demoPlayback: null,
    });
    this.runStep(step, opts);
  }

  /**
   * The user is asking to do the target step *over again*. We make this work in
   * two parts:
   *
   * 1. **Setup replay.** Combat tutorials chain setup-bearing steps
   *    (`encounter-control` resets + mechanics, `checkpoint` seeds) before each
   *    play step (`wait-for-event` / `demo` / event-driven `world-highlight`).
   *    Linear progression runs each setup step in order, so by the time a play
   *    step starts the encounter is in the expected state. Jumping straight to a
   *    play step would skip that setup and land the user in stale state from a
   *    previous run (wrong mechanics on, mid-cycle tick state, missing spawned
   *    entities). We fix that by replaying every `encounter-control` and
   *    `checkpoint` step between the nearest preceding checkpoint (or step 0 if
   *    none) and the target — see `replaySetupBefore` for the exact policy.
   *
   * 2. **Auto-advance suppression.** `encounter-control` and `checkpoint` steps
   *    auto-advance to the next step by default. When the user explicitly chose
   *    one of these as a navigation target they want to stop ON it, not be
   *    instantly skipped past it. We pass `fromUserNav: true` so those handlers
   *    settle into `awaiting-user` instead of calling `next()`. The user clicks
   *    Continue when ready, which re-enters the normal forward path.
   *
   * Linear forward progression via `next()` / `skipStep()` is unchanged — only
   * deliberate user navigation triggers the reseed.
   */
  private advanceToFromUserNav(index: number): void {
    const { tutorial } = this.state;
    if (!tutorial) return;
    const step = tutorial.steps[index];
    if (!step) {
      this.advanceTo(index, { fromUserNav: true });
      return;
    }

    // Non-live-sim targets (info / video / spotlight / checkpoint /
    // world-highlight-continue / world-highlight-click) don't depend on live
    // encounter state — the sim is paused while the user reads. Skip the
    // setup replay (it's irrelevant and would just wipe progress), but still
    // pass `fromUserNav` so checkpoint targets suppress their auto-advance.
    if (!TutorialDirector.stepNeedsLiveSim(step)) {
      this.advanceTo(index, { fromUserNav: true });
      return;
    }

    // Live-sim target: pause the sim, replay all preceding setup steps, then
    // activate the target. Pausing keeps the reseed atomic from the user's
    // perspective — no ticks fire against stale encounter state, no wait-for-event
    // subscription gets fed in-flight events from the previous play-through.
    // advanceTo() will resume the sim when the target step actually starts.
    this.adapter.pauseSim();
    let cancelled = false;
    this.activeRunner = {
      cancel: () => {
        cancelled = true;
      },
    };
    this.setState({
      stepIndex: index,
      currentStep: step,
      phase: 'running',
      eventProgress: 0,
      eventTarget: 0,
      failPrompt: null,
      banner: { text: 'Restarting step…', tone: 'info', clearAfterMs: 1500 },
      lastCheckpointIndex: this.findLastCheckpointBefore(tutorial, index),
      stepIntroActive: false,
      demoPlayback: null,
    });
    this.scheduleBannerClear(1500);
    this.replaySetupBefore(tutorial, index, () => cancelled)
      .then(() => {
        if (cancelled) return;
        this.advanceTo(index, { fromUserNav: true });
      })
      .catch((err) => {
        if (cancelled) return;
        console.error('TutorialDirector: nav reseed failed', err);
        this.fail('Step setup failed. Exit and retry.');
      });
  }

  private static stepNeedsLiveSim(step: TutorialStep): boolean {
    switch (step.kind) {
      case 'wait-for-event':
      case 'demo':
      case 'encounter-control':
        return true;
      case 'world-highlight':
        return step.advanceOn.type === 'event' || step.advanceOn.type === 'player-on-target';
      case 'spotlight':
      case 'info':
      case 'video':
      case 'checkpoint':
        return false;
    }
  }

  private static stepShowsIntroCountdown(step: TutorialStep): boolean {
    switch (step.kind) {
      case 'wait-for-event':
      case 'demo':
      case 'world-highlight':
        return true;
      case 'spotlight':
      case 'info':
      case 'video':
      case 'encounter-control':
      case 'checkpoint':
        return false;
    }
  }

  private startAfterStepIntro(
    step: TutorialStep,
    isCancelled: () => boolean,
    setTimer: (timer: ReturnType<typeof setTimeout> | null) => void,
    start: () => void,
  ): void {
    if (!TutorialDirector.stepShowsIntroCountdown(step)) {
      this.advanceOrDefer(start);
      return;
    }

    this.adapter.pauseSim();
    this.setState({ stepIntroActive: true });
    const timer = setTimeout(() => {
      setTimer(null);
      if (isCancelled()) return;
      this.setState({ stepIntroActive: false });
      this.advanceOrDefer(start);
    }, STEP_INTRO_COUNTDOWN_MS);
    setTimer(timer);
  }

  private runStep(step: TutorialStep, opts: NavOpts = {}): void {
    switch (step.kind) {
      case 'spotlight':
        this.runSpotlight();
        break;
      case 'info':
        this.runInfo(step);
        break;
      case 'video':
        this.runVideo(step);
        break;
      case 'encounter-control':
        this.runEncounterControl(step, opts);
        break;
      case 'world-highlight':
        this.runWorldHighlight(step);
        break;
      case 'wait-for-event':
        this.runWaitForEvent(step);
        break;
      case 'checkpoint':
        this.runCheckpoint(step, opts);
        break;
      case 'demo':
        this.runDemo(step);
        break;
    }
  }

  /**
   * Spotlight steps within a director-driven tutorial are rendered by the
   * overlay as info-style banners (no Driver.js). Pure-spotlight tutorials
   * never reach the director — see `isSpotlightOnlyTutorial` in types.ts.
   */
  private runSpotlight(): void {
    this.setState({ phase: 'awaiting-user' });
  }

  private runInfo(_step: InfoStep): void {
    this.setState({ phase: 'awaiting-user' });
  }

  private runVideo(_step: VideoStep): void {
    this.setState({ phase: 'awaiting-user' });
  }

  private runEncounterControl(step: EncounterControlStep, opts: NavOpts = {}): void {
    let cancelled = false;
    let pendingTimer: ReturnType<typeof setTimeout> | null = null;
    let waitTickUnsub: (() => void) | null = null;

    const runActions = async (): Promise<void> => {
      for (const action of step.actions) {
        if (cancelled) return;
        await this.applyControlAction(
          action,
          () => cancelled,
          (unsub) => {
            waitTickUnsub = unsub;
          },
        );
      }
    };

    this.activeRunner = {
      cancel: () => {
        cancelled = true;
        if (pendingTimer) {
          clearTimeout(pendingTimer);
          pendingTimer = null;
        }
        waitTickUnsub?.();
      },
    };

    runActions()
      .then(() => {
        if (cancelled) return;
        // User-nav targets always settle into awaiting-user: the user came here
        // deliberately and shouldn't be auto-skipped past their own destination.
        // Also pause the sim — advanceTo() resumed it because encounter-control
        // is classified as live-sim, but with auto-advance suppressed the user
        // is now reading the banner, so we don't want the encounter cycle to
        // drift before the user clicks Continue and the next live step subscribes.
        if (opts.fromUserNav) {
          this.adapter.pauseSim();
          this.setState({ phase: 'awaiting-user' });
          return;
        }
        const autoAdvance = step.autoAdvance !== false;
        if (autoAdvance) {
          const delay = step.advanceDelayMs ?? 0;
          if (delay > 0) {
            pendingTimer = setTimeout(() => {
              pendingTimer = null;
              if (!cancelled) this.advanceOrDefer(() => this.next());
            }, delay);
          } else {
            this.advanceOrDefer(() => this.next());
          }
        } else {
          this.setState({ phase: 'awaiting-user' });
        }
      })
      .catch((err) => {
        if (cancelled) return;
        console.error('TutorialDirector: encounter-control action failed', err);
        this.fail('Step failed. Exit and retry.');
      });
  }

  private async applyControlAction(
    action: EncounterControlAction,
    isCancelled: () => boolean,
    registerUnsub: (unsub: () => void) => void,
  ): Promise<void> {
    switch (action.type) {
      case 'enter-encounter':
        this.adapter.enterEncounter(action.encounterKind);
        await this.waitForEncounterKind(action.encounterKind, isCancelled);
        return;
      case 'enter-lobby':
        this.adapter.enterLobby();
        await this.waitForEncounterKind('lobby', isCancelled);
        return;
      case 'set-mechanics':
        this.adapter.setMechanics(action.mechanics);
        return;
      case 'reset':
        this.adapter.resetEncounter();
        return;
      case 'pause':
        this.adapter.pauseSim();
        return;
      case 'resume':
        this.adapter.resumeSim();
        return;
      case 'set-tick-scale':
        this.adapter.setTickScale(action.scale);
        return;
      case 'set-target-tile':
        this.adapter.setTargetTile(action.tile);
        return;
      case 'inject-action':
        this.adapter.injectAction(action.action);
        return;
      case 'cast-mark-of-darkness':
        this.adapter.castMarkOfDarkness();
        return;
      case 'encounter-command':
        if (!this.adapter.executeEncounterCommand(resolveTutorialEncounterCommand(action.commandId))) {
          throw new TutorialEncounterCommandSetupError(action.commandId);
        }
        return;
      case 'activate-tile-preset':
        this.adapter.activateTilePreset(action.presetId);
        return;
      case 'deactivate-tile-presets':
        this.adapter.deactivateTilePresets();
        return;
      case 'wait-ticks':
        await this.waitTicks(action.ticks, isCancelled, registerUnsub);
        return;
      case 'fast-forward-ticks':
        this.adapter.fastForwardTicks(action.toTick);
        return;
    }
  }

  /**
   * Poll until the settled encounter kind matches `target`. Encounter swaps
   * are React state updates plus an async scene transition; the wait keeps
   * sequential `set-mechanics` actions from racing the encounter rebuild and
   * scene readiness. `activeEncounterKind` reports the loading target early,
   * so it is intentionally not a readiness signal here.
   * Times out after 2 seconds to avoid hanging if the transition fails.
   */
  private waitForEncounterKind(target: string, isCancelled: () => boolean): Promise<void> {
    return new Promise<void>((resolve) => {
      const startedAt = Date.now();
      const TIMEOUT_MS = 2000;
      const tick = () => {
        if (isCancelled()) {
          resolve();
          return;
        }
        if (this.adapter.getSettledEncounterKind() === target) {
          resolve();
          return;
        }
        if (Date.now() - startedAt > TIMEOUT_MS) {
          resolve();
          return;
        }
        requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    });
  }

  private waitTicks(
    ticks: number,
    isCancelled: () => boolean,
    registerUnsub: (unsub: () => void) => void,
  ): Promise<void> {
    if (ticks <= 0) return Promise.resolve();
    return new Promise<void>((resolve) => {
      let remaining = ticks;
      const unsub = this.adapter.subscribeTickAdvance(() => {
        if (isCancelled()) {
          unsub();
          resolve();
          return;
        }
        remaining -= 1;
        if (remaining <= 0) {
          unsub();
          resolve();
        }
      });
      registerUnsub(unsub);
    });
  }

  private runWorldHighlight(step: WorldHighlightStep): void {
    let cancelled = false;
    let introTimer: ReturnType<typeof setTimeout> | null = null;
    let setupWaitTickUnsub: (() => void) | null = null;
    let mainUnsub: (() => void) | null = null;

    this.activeRunner = {
      cancel: () => {
        cancelled = true;
        if (introTimer) {
          clearTimeout(introTimer);
          introTimer = null;
        }
        setupWaitTickUnsub?.();
        setupWaitTickUnsub = null;
        mainUnsub?.();
        mainUnsub = null;
        this.setState({ stepIntroActive: false });
        if (step.pauseSim) this.adapter.resumeSim();
      },
    };

    const startMain = (): void => {
      if (cancelled) return;
      if (TutorialDirector.stepNeedsLiveSim(step)) this.adapter.resumeSim();
      if (step.pauseSim) this.adapter.pauseSim();

      const advance = (): void => {
        if (step.pauseSim) this.adapter.resumeSim();
        this.next();
      };

      if (step.advanceOn.type === 'continue') {
        this.setState({ phase: 'awaiting-user' });
        return;
      }

      if (step.advanceOn.type === 'event') {
        const { eventName, matcher } = step.advanceOn;
        mainUnsub = this.adapter.subscribeTickAdvance((_tick, events) => {
          for (const event of events) {
            if (event.type !== eventName) continue;
            if (matcher && !matcher(event)) continue;
            mainUnsub?.();
            mainUnsub = null;
            advance();
            return;
          }
        });
        return;
      }

      if (step.advanceOn.type === 'player-on-target') {
        const target = step.target;
        mainUnsub = this.adapter.subscribeTickAdvance(() => {
          const pos = this.adapter.getPlayerPosition();
          if (this.playerOnTarget(pos, target)) {
            mainUnsub?.();
            mainUnsub = null;
            advance();
          }
        });
        return;
      }

      if (step.advanceOn.type === 'click-target') {
        this.setState({ phase: 'awaiting-user' });
      }
    };

    this.runStepSetup(
      step.setup,
      () => cancelled,
      (u) => {
        setupWaitTickUnsub = u;
      },
      true,
    )
      .then(() => {
        if (cancelled) return;
        this.startAfterStepIntro(
          step,
          () => cancelled,
          (timer) => {
            introTimer = timer;
          },
          startMain,
        );
      })
      .catch((err) => {
        if (cancelled) return;
        console.error('TutorialDirector: world-highlight setup failed', err);
        this.fail('Step setup failed. Exit and retry.');
      });
  }

  private playerOnTarget(pos: [number, number], target: WorldHighlightStep['target']): boolean {
    if (target.type === 'tile') {
      return pos[0] === target.tile[0] && pos[1] === target.tile[1];
    }
    if (target.type === 'tiles') {
      return target.tiles.some(([x, y]) => pos[0] === x && pos[1] === y);
    }
    if (target.type === 'tile-region') {
      const { x, y, width, height } = target.bounds;
      return pos[0] >= x && pos[0] < x + width && pos[1] >= y && pos[1] < y + height;
    }
    return false;
  }

  private runWaitForEvent(step: WaitForEventStep): void {
    let cancelled = false;
    let introTimer: ReturnType<typeof setTimeout> | null = null;
    let setupWaitTickUnsub: (() => void) | null = null;
    let mainUnsub: (() => void) | null = null;

    this.activeRunner = {
      cancel: () => {
        cancelled = true;
        if (introTimer) {
          clearTimeout(introTimer);
          introTimer = null;
        }
        setupWaitTickUnsub?.();
        setupWaitTickUnsub = null;
        mainUnsub?.();
        mainUnsub = null;
        this.setState({ stepIntroActive: false });
      },
    };

    const subscribe = (): void => {
      if (cancelled) return;
      // Defensive: also resume here in case advanceTo's policy was bypassed
      // (e.g. a step author manually paused via world-highlight.pauseSim).
      this.adapter.resumeSim();
      const target = step.count ?? 1;
      let matched = 0;
      let elapsedTicks = 0;
      this.setState({ eventProgress: 0, eventTarget: target });

      mainUnsub = this.adapter.subscribeTickAdvance((_tick, events) => {
        for (const event of events) {
          if (step.failEventName && event.type === step.failEventName) {
            if (!step.failMatcher || step.failMatcher(event)) {
              if (step.failResetsProgress) {
                // Recoverable miss: drop the streak to zero and keep the drill
                // running (the encounter keeps attacking until the player
                // strings together `count` successes in a row). Pulse the reset
                // nonce ONLY when there was progress to lose, so the UI blink
                // fires on a real setback and never on a no-op.
                if (matched > 0) {
                  matched = 0;
                  this.setState({
                    eventProgress: 0,
                    progressResetNonce: this.state.progressResetNonce + 1,
                  });
                }
                continue;
              }
              mainUnsub?.();
              mainUnsub = null;
              this.fail(step.failPrompt ?? 'Step failed.');
              return;
            }
          }
          if (event.type !== step.eventName) continue;
          if (step.matcher && !step.matcher(event as GameEvent)) continue;
          matched += 1;
          this.setState({ eventProgress: matched });
          if (matched >= target) {
            mainUnsub?.();
            mainUnsub = null;
            if (step.successMessage) {
              this.setState({
                banner: { text: step.successMessage, tone: 'success', clearAfterMs: SUCCESS_BANNER_MS },
              });
              this.scheduleBannerClear(SUCCESS_BANNER_MS);
            }
            this.next();
            return;
          }
        }
        elapsedTicks += 1;
        if (step.timeoutTicks && elapsedTicks >= step.timeoutTicks) {
          mainUnsub?.();
          mainUnsub = null;
          this.fail(step.failPrompt ?? 'Step timed out.');
        }
      });
    };

    // Run setup first (reset / mechanics / spawn-flare etc.) so the
    // subscription attaches AGAINST the freshly-seeded encounter state.
    // Events fired during setup are not seen by the subscription — it's
    // not attached yet — so e.g. a void-flare encounter command in setup
    // does NOT falsely tick the event counter.
    this.runStepSetup(
      step.setup,
      () => cancelled,
      (u) => {
        setupWaitTickUnsub = u;
      },
      true,
    )
      .then(() => {
        if (cancelled) return;
        this.startAfterStepIntro(
          step,
          () => cancelled,
          (timer) => {
            introTimer = timer;
          },
          subscribe,
        );
      })
      .catch((err) => {
        if (cancelled) return;
        console.error('TutorialDirector: wait-for-event setup failed', err);
        this.fail('Step setup failed. Exit and retry.');
      });
  }

  private runCheckpoint(step: CheckpointStep, opts: NavOpts = {}): void {
    let cancelled = false;
    this.activeRunner = {
      cancel: () => {
        cancelled = true;
      },
    };
    this.applyCheckpointSeed(step, () => cancelled)
      .then(() => {
        if (cancelled) return;
        // User-nav targets always settle into awaiting-user (see runEncounterControl).
        if (opts.fromUserNav) {
          this.setState({ phase: 'awaiting-user' });
          return;
        }
        if (step.autoAdvance !== false) {
          this.advanceOrDefer(() => this.next());
        } else {
          this.setState({ phase: 'awaiting-user' });
        }
      })
      .catch((err) => {
        if (cancelled) return;
        console.error('TutorialDirector: checkpoint seed failed', err);
        this.fail('Checkpoint setup failed. Exit and retry.');
      });
  }

  /**
   * Await encounter transition before applying mechanics so the new encounter
   * is the one being configured.
   */
  private async applyCheckpointSeed(step: CheckpointStep, isCancelled: () => boolean = () => false): Promise<void> {
    const { seed } = step;
    if (this.adapter.getSettledEncounterKind() !== seed.encounterKind) {
      this.adapter.enterEncounter(seed.encounterKind);
      await this.waitForEncounterKind(seed.encounterKind, isCancelled);
    } else {
      this.adapter.resetEncounter();
    }
    if (isCancelled()) return;
    if (seed.mechanics) this.adapter.setMechanics(seed.mechanics);
    if (seed.activatePresetId) this.adapter.activateTilePreset(seed.activatePresetId);
    for (const commandId of seed.encounterCommandIds ?? []) {
      if (!this.adapter.executeEncounterCommand(resolveTutorialEncounterCommand(commandId))) {
        throw new TutorialEncounterCommandSetupError(commandId);
      }
    }
  }

  /** Run inline `setup` actions in order before the step's main behavior subscribes. */
  private async runStepSetup(
    setup: readonly EncounterControlAction[] | undefined,
    isCancelled: () => boolean,
    registerUnsub: (unsub: () => void) => void,
    pauseAfterWaitTicks = false,
  ): Promise<void> {
    if (!setup || setup.length === 0) return;
    for (const action of setup) {
      if (isCancelled()) return;
      const resumesForWaitTicks = pauseAfterWaitTicks && action.type === 'wait-ticks';
      if (resumesForWaitTicks) this.adapter.resumeSim();
      await this.applyControlAction(action, isCancelled, registerUnsub);
      if (resumesForWaitTicks && !isCancelled()) this.adapter.pauseSim();
    }
  }

  private runDemo(step: DemoStep): void {
    let cancelled = false;
    let introTimer: ReturnType<typeof setTimeout> | null = null;
    let setupWaitTickUnsub: (() => void) | null = null;
    let unsub: (() => void) | null = null;
    let finished = false;
    const frames: DemoPlaybackFrame[] = [];
    // Review-scrub cues, normalized to demo-local ticks once frames[0] exists
    // (in startMain). The live path keeps the absolute-tick track in
    // activeDemoCursor.track, driven by the engine tickBus; the two are not
    // interchangeable.
    let playbackCues: readonly DemoCursorCue[] = step.cursor?.cues ?? [];

    const captureFrame = (demoTickOffset: number, events: GameEvent[]): void => {
      const state = structuredClone(this.adapter.getState());
      frames.push({ demoTickOffset, engineTick: state.currentTick, state, events });
    };

    const finishDemo = (): void => {
      if (finished) return;
      finished = true;
      unsub?.();
      unsub = null;
      this.adapter.pauseSim();
      this.setState({
        phase: 'awaiting-user',
        activeDemoCursor: null,
        demoPlayback:
          frames.length > 0
            ? {
                stepIndex: this.state.stepIndex,
                mode: 'review',
                frames,
                cues: playbackCues,
                blockInput: step.cursor?.blockInput,
                tickMs: OSRS_TICK_MS,
                frontierMs: (frames.length - 1) * OSRS_TICK_MS,
                durationMs: (frames.length - 1) * OSRS_TICK_MS,
                playheadMs: (frames.length - 1) * OSRS_TICK_MS,
                isPlaying: false,
                speed: 1,
              }
            : null,
      });
      // Initialize the per-frame store to the freshly-created review session's
      // playhead so the demo cursor starts at the correct (end) frame.
      if (frames.length > 0) {
        this.demoPlayheadStore.set((frames.length - 1) * OSRS_TICK_MS);
      }
    };

    this.activeRunner = {
      cancel: () => {
        cancelled = true;
        finished = true;
        if (introTimer) {
          clearTimeout(introTimer);
          introTimer = null;
        }
        setupWaitTickUnsub?.();
        setupWaitTickUnsub = null;
        unsub?.();
        unsub = null;
        this.setState({ activeDemoCursor: null, demoPlayback: null, stepIntroActive: false });
      },
    };

    const startMain = (): void => {
      if (cancelled) return;
      // Apply `setup` actions before `resetBefore` and `mechanics`; both paths
      // may coexist in content and each shorthand is idempotent against the
      // same engine state.
      if (step.resetBefore !== false) this.adapter.resetEncounter();
      if (step.mechanics) this.adapter.setMechanics(step.mechanics);
      this.adapter.resumeSim();
      this.adapter.setTickScale(1);

      // Publish the cursor session AFTER setup/reset/mechanics so the React
      // DemoCursorLayer starts the choreography against the settled encounter
      // (avoids the race where `currentStep` is set before setup completes).
      if (step.cursor) {
        this.setState({
          activeDemoCursor: {
            id: `demo-cursor-${this.state.stepIndex}-${Date.now()}`,
            stepIndex: this.state.stepIndex,
            track: step.cursor,
            tickMs: OSRS_TICK_MS,
          },
        });
      }

      const stopOffset =
        step.stopAtTickOffset ??
        (step.scriptedActions.length > 0 ? Math.max(...step.scriptedActions.map((a) => a.tickOffset)) + 1 : 1);

      // Publish a 'recording' session so the watch transport is visible from the
      // first tick (live-progress only: the frontier grows, but the user can't
      // scrub behind the live engine until the demo finishes -> 'review').
      const publishRecording = (): void => {
        const frontierMs = (frames.length - 1) * OSRS_TICK_MS;
        this.setState({
          demoPlayback: {
            stepIndex: this.state.stepIndex,
            mode: 'recording',
            frames: frames.slice(),
            cues: playbackCues,
            tickMs: OSRS_TICK_MS,
            frontierMs,
            playheadMs: frontierMs,
            durationMs: frontierMs,
            plannedDurationMs: stopOffset * OSRS_TICK_MS,
            isPlaying: false,
            speed: 1,
          },
        });
      };

      captureFrame(0, []);
      playbackCues = localizeDemoCursorCues(step.cursor?.cues ?? [], frames[0]?.engineTick ?? 0);
      publishRecording();

      let elapsed = 0;

      unsub = this.adapter.subscribeTickAdvance((_tick, events) => {
        if (finished) return;
        for (const action of step.scriptedActions) {
          if (action.tickOffset !== elapsed) continue;
          if (action.action) this.adapter.injectAction(action.action);
          if (action.clickTarget) this.adapter.setTargetTile(action.clickTarget);
        }
        captureFrame(elapsed + 1, events);
        if (step.finishOnEvent) {
          for (const event of events) {
            if (event.type === step.finishOnEvent) {
              finishDemo();
              return;
            }
          }
        }
        elapsed += 1;
        if (elapsed >= stopOffset) {
          finishDemo();
          return;
        }
        publishRecording();
      });
    };

    this.runStepSetup(
      step.setup,
      () => cancelled,
      (u) => {
        setupWaitTickUnsub = u;
      },
      true,
    )
      .then(() => {
        if (cancelled) return;
        this.startAfterStepIntro(
          step,
          () => cancelled,
          (timer) => {
            introTimer = timer;
          },
          startMain,
        );
      })
      .catch((err) => {
        if (cancelled) return;
        console.error('TutorialDirector: demo setup failed', err);
        this.fail('Step setup failed. Exit and retry.');
      });
  }

  /**
   * Replay every setup-bearing step between the nearest preceding `checkpoint`
   * (inclusive) and `target` (exclusive). If no checkpoint precedes the target,
   * replay from index 0. Used by user-nav (Back / Steps-list jump) to put the
   * encounter into the state the target step expects.
   *
   * Setup-bearing kinds:
   *   - `checkpoint` — applied via `applyCheckpointSeed` (its own contract).
   *   - `encounter-control` — actions replayed in order, filtered by
   *     `isSetupReplayableAction` (skips wait-ticks / pause / resume /
   *     set-tick-scale / inject-action; see that function for rationale).
   *
   * Caller is responsible for pausing the sim and managing `activeRunner`.
   * Aborts as soon as `isCancelled()` flips true; checked between each step
   * AND between each action inside an `encounter-control` step.
   */
  private async replaySetupBefore(tutorial: Tutorial, target: number, isCancelled: () => boolean): Promise<void> {
    const checkpointIdx = this.findLastCheckpointBefore(tutorial, target - 1);
    const startIdx = checkpointIdx ?? 0;
    for (let i = startIdx; i < target; i++) {
      if (isCancelled()) return;
      const step = tutorial.steps[i];
      if (step.kind === 'checkpoint') {
        await this.applyCheckpointSeed(step, isCancelled);
        continue;
      }
      if (step.kind === 'encounter-control') {
        for (const action of step.actions) {
          if (isCancelled()) return;
          if (!TutorialDirector.isSetupReplayableAction(action)) continue;
          await this.applyControlAction(action, isCancelled, () => {});
        }
      }
    }
  }

  /**
   * Filter for `encounter-control` actions during user-nav setup replay.
   *
   * Skipped:
   *   - `wait-ticks` — resolves only via `subscribeTickAdvance` and the sim is
   *     paused during replay, so this would deadlock.
   *   - `pause` / `resume` — replay owns sim pause state atomically; honoring
   *     these would let an intermediate step leave the sim in a state that
   *     contradicts the replay's caller invariants.
   *   - `set-tick-scale` — transient cosmetic, not part of the durable encounter
   *     state a target step depends on.
   *   - `inject-action` — queues a one-shot engine action. Re-injecting it during
   *     replay could fire the event the target `wait-for-event` is about to
   *     subscribe to, so setup actions must opt in rather than blanket-replay.
   *   - `fast-forward-ticks` — seeks the engine forward; the sim is paused during
   *     replay, so honoring it would desync the replay pause invariant (same
   *     rationale as `wait-ticks`).
   *
   * Replayed (default): `reset`, `set-mechanics`, `enter-encounter`, `enter-lobby`,
   * `set-target-tile`, `cast-mark-of-darkness`, `encounter-command`,
   * `activate-tile-preset`, `deactivate-tile-presets`. These are durable
   * encounter / world state that the target step assumes was previously applied —
   * e.g. the yama-voidflares encounter command spawns the flare
   * that the next `wait-for-event: voidflare_destroyed` step needs to exist.
   */
  private static isSetupReplayableAction(action: EncounterControlAction): boolean {
    switch (action.type) {
      case 'wait-ticks':
      case 'pause':
      case 'resume':
      case 'set-tick-scale':
      case 'inject-action':
      case 'fast-forward-ticks':
        return false;
      case 'enter-encounter':
      case 'enter-lobby':
      case 'set-mechanics':
      case 'reset':
      case 'set-target-tile':
      case 'cast-mark-of-darkness':
      case 'encounter-command':
      case 'activate-tile-preset':
      case 'deactivate-tile-presets':
        return true;
    }
  }

  private findLastCheckpointBefore(tutorial: Tutorial, index: number): number | null {
    for (let i = Math.min(index, tutorial.steps.length - 1); i >= 0; i--) {
      if (tutorial.steps[i].kind === 'checkpoint') return i;
    }
    return null;
  }
}

export type { DirectorBannerMessage, DirectorPhase, DirectorState, TutorialDirectorAdapter };
