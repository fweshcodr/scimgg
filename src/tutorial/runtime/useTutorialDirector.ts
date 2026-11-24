import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { flushSync } from 'react-dom';
import type { EncounterCommand } from '../../core/encounters/commands';
import type { EncounterCompletionOwnership } from '../../core/encounters/types';
import type { EngineAction, SimulationEngine } from '../../core/SimulationEngine';
import type { Coordinate, MechanicsConfig, SimulationState } from '../../types/simulation';
import { getTutorialById } from '../content';
import { loadTutorialProgress, resetTutorialProgress, saveTutorialProgress } from '../persistence';
import { isSpotlightOnlyTutorial, type SpotlightStep } from '../types';
import type { DemoPlayheadStore } from './demoPlayheadStore';
import { SpotlightRunner } from './SpotlightRunner';
import { TutorialDirector } from './TutorialDirector';
import { tickBus } from './tickBus';
import type { DirectorState, TutorialDirectorAdapter } from './types';
import { INITIAL_DIRECTOR_STATE } from './types';

/**
 * Side-effect callbacks the host (App.tsx) provides so the director can drive
 * encounter selection, mechanics config, target tile, and tile-pack presets
 * through the same hooks the user-facing UI uses.
 */
export interface UseTutorialDirectorParams {
  isTouchOnly: boolean;
  engineRef: React.MutableRefObject<SimulationEngine>;
  simulationState: SimulationState;
  completionOwnership: EncounterCompletionOwnership;
  activeEncounterKind: string;
  settledEncounterKind: string | null;
  enterEncounter: (kind: string) => void;
  enterLobby: () => void;
  resetEncounter: () => void;
  setMechanics: (config: Partial<MechanicsConfig>) => void;
  setTargetTile: (tile: Coordinate | null) => void;
  injectAction: (action: EngineAction) => void;
  castMarkOfDarkness: () => void;
  executeEncounterCommand: (command: EncounterCommand) => boolean;
  activateTilePreset: (presetId: string) => void;
  deactivateTilePresets: () => void;
  fastForwardTicks: (toTick: number) => void;
  /** The wiring's tutorial hold, which freezes the running tick at the moment it is set. */
  setTutorialPaused: (paused: boolean) => void;
}

export interface UseTutorialDirectorReturn {
  directorState: DirectorState;
  isActive: boolean;
  spotlightActive: boolean;
  /**
   * The element the running spotlight step points at, or null. The host keeps it on screen:
   * the Mobile pop-out opens for a step that points into it (mobileMenuState).
   */
  spotlightTarget: Element | null;
  startTutorial: (tutorialId: string, opts?: { forceRestart?: boolean }) => void;
  exitTutorial: () => void;
  nextStep: () => void;
  prevStep: () => void;
  skipStep: () => void;
  goToStep: (index: number) => void;
  pauseTutorial: () => void;
  resumeTutorial: () => void;
  retryFromCheckpoint: () => void;
  retryStep: () => void;
  watchAgain: () => void;
  reportDemoTargetMissing: (label: string | null) => void;
  seekDemo: (ms: number) => void;
  stepDemoBack: () => void;
  stepDemoForward: () => void;
  playDemo: () => void;
  pauseDemo: () => void;
  setDemoSpeed: (speed: number) => void;
  advanceDemoPlayhead: (deltaMs: number) => void;
  demoPlayheadStore: DemoPlayheadStore;
}

// The director and adapter must stay stable for the hook lifetime. Host
// callbacks and live simulation state are read through a ref written every
// render; recreating the director on an adapter identity change calls `exit()`
// and destroys mid-tutorial state.

interface LiveCallbacks
  extends Omit<
    UseTutorialDirectorParams,
    | 'isTouchOnly'
    | 'engineRef'
    | 'simulationState'
    | 'completionOwnership'
    | 'activeEncounterKind'
    | 'settledEncounterKind'
  > {
  activeEncounterKind: string;
  settledEncounterKind: string | null;
  playerPosition: Coordinate;
  currentTick: number;
}

export function useTutorialDirector(params: UseTutorialDirectorParams): UseTutorialDirectorReturn {
  const {
    isTouchOnly,
    engineRef,
    simulationState,
    completionOwnership,
    activeEncounterKind,
    settledEncounterKind,
    enterEncounter,
    enterLobby,
    resetEncounter,
    setMechanics,
    setTargetTile,
    injectAction,
    castMarkOfDarkness,
    executeEncounterCommand,
    activateTilePreset,
    deactivateTilePresets,
    fastForwardTicks,
    setTutorialPaused,
  } = params;

  const [directorState, setDirectorState] = useState<DirectorState>(INITIAL_DIRECTOR_STATE);
  const [spotlightActive, setSpotlightActive] = useState(false);
  const [spotlightTarget, setSpotlightTarget] = useState<Element | null>(null);
  const [activeTutorialId, setActiveTutorialIdState] = useState<string | null>(null);
  // Ref mirror of activeTutorialId so the spotlight runner's persistent
  // onStepHighlighted / onDestroyed callbacks (built once at runner
  // construction) can read the current id even after subsequent re-renders.
  // Closing over the React state would freeze the id at runner-construction
  // time, leaking progress into the wrong tutorial when the user switches.
  const activeTutorialIdRef = useRef<string | null>(null);
  const setActiveTutorialId = useCallback((id: string | null) => {
    activeTutorialIdRef.current = id;
    setActiveTutorialIdState(id);
  }, []);

  // The adapter (built once below) reads from this ref so its identity stays
  // stable. We keep the ref pointing at the latest values on every render.
  const liveRef = useRef<LiveCallbacks>({
    enterEncounter,
    enterLobby,
    resetEncounter,
    setMechanics,
    setTargetTile,
    injectAction,
    castMarkOfDarkness,
    executeEncounterCommand,
    activateTilePreset,
    deactivateTilePresets,
    fastForwardTicks,
    setTutorialPaused,
    activeEncounterKind,
    settledEncounterKind,
    playerPosition: simulationState.playerPosition,
    currentTick: simulationState.currentTick,
  });
  liveRef.current = {
    enterEncounter,
    enterLobby,
    resetEncounter,
    setMechanics,
    setTargetTile,
    injectAction,
    castMarkOfDarkness,
    executeEncounterCommand,
    activateTilePreset,
    deactivateTilePresets,
    fastForwardTicks,
    setTutorialPaused,
    activeEncounterKind,
    settledEncounterKind,
    playerPosition: simulationState.playerPosition,
    currentTick: simulationState.currentTick,
  };

  // Built ONCE in a ref. Every method indirects through liveRef, so the
  // identity never changes and the director below is never recreated.
  const adapterRef = useRef<TutorialDirectorAdapter | null>(null);
  if (!adapterRef.current) {
    adapterRef.current = {
      enterEncounter: (kind) => liveRef.current.enterEncounter(kind),
      enterLobby: () => liveRef.current.enterLobby(),
      resetEncounter: () => liveRef.current.resetEncounter(),
      setMechanics: (config) => liveRef.current.setMechanics(config),
      activateTilePreset: (presetId) => liveRef.current.activateTilePreset(presetId),
      deactivateTilePresets: () => liveRef.current.deactivateTilePresets(),
      fastForwardTicks: (toTick) => liveRef.current.fastForwardTicks(toTick),
      pauseSim: () => liveRef.current.setTutorialPaused(true),
      resumeSim: () => liveRef.current.setTutorialPaused(false),
      setTickScale: () => {
        // Intentionally empty: tutorials use pause/resume, not slow-mo.
      },
      setCompletionOwnership: (ownership) => engineRef.current.setCompletionOwnership(ownership),
      injectAction: (action) => liveRef.current.injectAction(action),
      setTargetTile: (tile) => liveRef.current.setTargetTile(tile),
      castMarkOfDarkness: () => liveRef.current.castMarkOfDarkness(),
      executeEncounterCommand: (command) => liveRef.current.executeEncounterCommand(command),
      getSettledEncounterKind: () => liveRef.current.settledEncounterKind,
      getState: () => engineRef.current.getState(),
      getPlayerPosition: () => liveRef.current.playerPosition,
      subscribeTickAdvance: (handler) => tickBus.subscribe(handler),
    };
  }

  const currentEngine = engineRef.current;
  useLayoutEffect(() => {
    currentEngine.setCompletionOwnership(completionOwnership);
  }, [completionOwnership, currentEngine]);

  const directorRef = useRef<TutorialDirector | null>(null);
  if (!directorRef.current) {
    directorRef.current = new TutorialDirector(adapterRef.current);
  }

  useEffect(() => {
    const director = directorRef.current!;
    const unsub = director.subscribe(setDirectorState);
    return () => {
      unsub();
      director.exit();
    };
  }, []);

  const spotlightRunnerRef = useRef<SpotlightRunner | null>(null);

  const lastFailedConditionRef = useRef<string | null>(null);
  useEffect(() => {
    const failed = simulationState.failedCondition;
    if (failed && lastFailedConditionRef.current === null) {
      directorRef.current?.onPlayerDeath();
    }
    lastFailedConditionRef.current = failed;
  }, [simulationState.failedCondition]);

  const ensureSpotlightRunner = useCallback((): SpotlightRunner => {
    if (!spotlightRunnerRef.current) {
      spotlightRunnerRef.current = new SpotlightRunner({
        onStepHighlighted: (step, visitedSteps, element) => {
          setSpotlightTarget(element);
          const id = activeTutorialIdRef.current;
          if (id) {
            saveTutorialProgress(id, { lastStep: step, completed: false, completedSteps: visitedSteps });
          }
        },
        onDestroyed: ({ reachedLastStep, lastStep, visitedSteps }) => {
          setSpotlightActive(false);
          setSpotlightTarget(null);
          const id = activeTutorialIdRef.current;
          if (id) {
            saveTutorialProgress(id, {
              lastStep,
              completed: reachedLastStep,
              completedSteps: visitedSteps,
            });
          }
          setActiveTutorialId(null);
        },
        commitSync: flushSync,
      });
    }
    return spotlightRunnerRef.current;
  }, [setActiveTutorialId]);

  useEffect(() => {
    return () => {
      spotlightRunnerRef.current?.destroy();
      spotlightRunnerRef.current = null;
    };
  }, []);

  const startTutorial = useCallback(
    (tutorialId: string, opts?: { forceRestart?: boolean }) => {
      const tutorial = getTutorialById(tutorialId);
      if (!tutorial) return;
      // Tear down any prior runtime BEFORE flipping the active id. The
      // spotlight runner's onDestroyed runs synchronously inside .destroy()
      // / .start(), so updating the id first would cause the old runner's
      // last persisted progress to be saved against the NEW tutorial's id
      // (and to clear the new id back to null).
      directorRef.current?.exit();
      spotlightRunnerRef.current?.destroy();
      setSpotlightActive(false);
      setActiveTutorialId(tutorialId);

      const forceRestart = opts?.forceRestart ?? false;
      if (forceRestart) resetTutorialProgress(tutorialId);
      const savedProgress = forceRestart ? null : loadTutorialProgress(tutorialId);
      const isReplay = savedProgress?.completed ?? false;

      // For combat tutorials, resuming directly to a wait-for-event step can
      // skip critical setup/checkpoint seeding. Resume from the nearest
      // preceding checkpoint instead, falling back to step 0 if none exists.
      let resumeFromStep = 0;
      if (!isReplay && savedProgress && savedProgress.lastStep >= 0) {
        const last = savedProgress.lastStep;
        if (isSpotlightOnlyTutorial(tutorial)) {
          resumeFromStep = Math.max(0, last);
        } else {
          let target = 0;
          for (let i = Math.min(last, tutorial.steps.length - 1); i >= 0; i--) {
            if (tutorial.steps[i].kind === 'checkpoint') {
              target = i;
              break;
            }
          }
          resumeFromStep = target;
        }
      }

      if (isSpotlightOnlyTutorial(tutorial)) {
        const runner = ensureSpotlightRunner();
        // The chrome a tour pins must be on screen before the runner filters the steps against the
        // live DOM: the desktop menu shows only while a tour is up (TopChrome `menu.pinned`), and
        // its entries' skipIfMissing steps would otherwise be dropped for the whole run.
        flushSync(() => setSpotlightActive(true));
        const started = runner.start({
          steps: tutorial.steps as SpotlightStep[],
          resumeFromStep,
          isReplay,
          isTouchOnly,
          visitedSteps: forceRestart ? undefined : savedProgress?.completedSteps,
        });
        if (!started) {
          // Every step was filtered out (e.g. all desktopOnly on a touch
          // device) — no Driver.js UI mounted. Don't leave the chrome thinking
          // a tutorial is active; clear what we optimistically set above.
          setSpotlightActive(false);
          setActiveTutorialId(null);
        }
      } else {
        const initialCompletedSteps = savedProgress?.completedSteps ?? [];
        directorRef.current?.start(tutorial, { resumeFromStep, initialCompletedSteps });
      }
    },
    [ensureSpotlightRunner, isTouchOnly, setActiveTutorialId],
  );

  const exitTutorial = useCallback(() => {
    spotlightRunnerRef.current?.destroy();
    setSpotlightActive(false);
    directorRef.current?.exit();
    if (activeTutorialId && directorState.tutorial) {
      saveTutorialProgress(activeTutorialId, {
        lastStep: directorState.stepIndex,
        completed: directorState.phase === 'complete',
        completedSteps: directorState.completedSteps,
      });
    }
    setActiveTutorialId(null);
  }, [
    activeTutorialId,
    directorState.completedSteps,
    directorState.phase,
    directorState.stepIndex,
    directorState.tutorial,
    setActiveTutorialId,
  ]);

  // Persist combat-tutorial progress as the director advances. completedSteps
  // is in the dep list so an event-driven step completion (e.g. wait-for-event
  // hitting its count, which extends completedSteps without changing stepIndex
  // in the same render) still writes through to storage.
  useEffect(() => {
    if (!activeTutorialId || !directorState.tutorial) return;
    if (directorState.phase === 'idle') return;
    if (directorState.stepIndex < 0) return;
    saveTutorialProgress(activeTutorialId, {
      lastStep: directorState.stepIndex,
      completed: directorState.phase === 'complete',
      completedSteps: directorState.completedSteps,
    });
  }, [
    activeTutorialId,
    directorState.phase,
    directorState.stepIndex,
    directorState.tutorial,
    directorState.completedSteps,
  ]);

  const nextStep = useCallback(() => directorRef.current?.next(), []);
  const prevStep = useCallback(() => directorRef.current?.prev(), []);
  const skipStep = useCallback(() => directorRef.current?.skipStep(), []);
  const goToStep = useCallback((index: number) => directorRef.current?.goToStep(index), []);
  const pauseTutorial = useCallback(() => directorRef.current?.pause(), []);
  const resumeTutorial = useCallback(() => directorRef.current?.resume(), []);
  const retryFromCheckpoint = useCallback(() => directorRef.current?.retryFromCheckpoint(), []);
  const retryStep = useCallback(() => directorRef.current?.retryStep(), []);
  const watchAgain = useCallback(() => directorRef.current?.watchAgain(), []);
  const reportDemoTargetMissing = useCallback(
    (label: string | null) => directorRef.current?.reportDemoTargetMissing(label),
    [],
  );
  const seekDemo = useCallback((ms: number) => directorRef.current?.seekDemo(ms), []);
  const stepDemoBack = useCallback(() => directorRef.current?.stepDemoBack(), []);
  const stepDemoForward = useCallback(() => directorRef.current?.stepDemoForward(), []);
  const playDemo = useCallback(() => directorRef.current?.playDemo(), []);
  const pauseDemo = useCallback(() => directorRef.current?.pauseDemo(), []);
  const setDemoSpeed = useCallback((speed: number) => directorRef.current?.setDemoSpeed(speed), []);
  const advanceDemoPlayhead = useCallback((deltaMs: number) => directorRef.current?.advanceDemoPlayhead(deltaMs), []);

  const isActive = spotlightActive || (directorState.phase !== 'idle' && directorState.phase !== 'complete');

  return {
    directorState,
    isActive,
    spotlightActive,
    spotlightTarget: spotlightActive ? spotlightTarget : null,
    startTutorial,
    exitTutorial,
    nextStep,
    prevStep,
    skipStep,
    goToStep,
    pauseTutorial,
    resumeTutorial,
    retryFromCheckpoint,
    retryStep,
    watchAgain,
    reportDemoTargetMissing,
    seekDemo,
    stepDemoBack,
    stepDemoForward,
    playDemo,
    pauseDemo,
    setDemoSpeed,
    advanceDemoPlayhead,
    demoPlayheadStore: directorRef.current!.demoPlayheadStore,
  };
}
