// @vitest-environment happy-dom

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { YAMA_SET_OPENING_RANGE_COMMAND, YAMA_SPAWN_VOID_FLARE_COMMAND } from '../../../encounters/yamaP3/commands';
import type { SimulationState } from '../../../types/simulation';
import type { Tutorial } from '../../types';
import { STEP_INTRO_COUNTDOWN_MS, TutorialDirector } from '../TutorialDirector';
import type { TutorialDirectorAdapter } from '../types';

async function wait(ms = STEP_INTRO_COUNTDOWN_MS + 20): Promise<void> {
  await vi.advanceTimersByTimeAsync(ms);
  await Promise.resolve();
}

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

function demoState(currentTick = 0): SimulationState {
  return { currentTick } as SimulationState;
}

describe('TutorialDirector encounter transitions', () => {
  const originalRaf = globalThis.requestAnimationFrame;
  const originalCancelRaf = globalThis.cancelAnimationFrame;

  beforeEach(() => {
    vi.restoreAllMocks();
    globalThis.requestAnimationFrame = (callback: FrameRequestCallback) => {
      return window.setTimeout(() => callback(performance.now()), 0);
    };
    globalThis.cancelAnimationFrame = (id: number) => window.clearTimeout(id);
  });

  afterEach(() => {
    globalThis.requestAnimationFrame = originalRaf;
    globalThis.cancelAnimationFrame = originalCancelRaf;
  });

  it('waits for the encounter to settle before applying mechanics', async () => {
    let settledEncounterKind: string | null = null;
    const setMechanics = vi.fn();
    const enterEncounter = vi.fn();

    const adapter: TutorialDirectorAdapter = {
      enterEncounter,
      enterLobby: vi.fn(),
      resetEncounter: vi.fn(),
      setMechanics,
      activateTilePreset: vi.fn(),
      deactivateTilePresets: vi.fn(),
      pauseSim: vi.fn(),
      resumeSim: vi.fn(),
      setTickScale: vi.fn(),
      injectAction: vi.fn(),
      setTargetTile: vi.fn(),
      castMarkOfDarkness: vi.fn(),
      executeEncounterCommand: vi.fn(() => true),
      getSettledEncounterKind: () => settledEncounterKind,
      getState: () => demoState(),
      getPlayerPosition: () => [31, 37],
      fastForwardTicks: vi.fn(),
      subscribeTickAdvance: () => () => undefined,
    };

    const tutorial: Tutorial = {
      id: 'test-yama-transition',
      title: 'Test Yama Transition',
      description: 'Verifies transition settling.',
      surface: 'encounter',
      steps: [
        {
          kind: 'encounter-control',
          actions: [
            { type: 'enter-encounter', encounterKind: 'yama_p3' },
            { type: 'set-mechanics', mechanics: { infiniteHealth: true } },
          ],
        },
        { kind: 'info', title: 'Ready', body: 'Scene settled.' },
      ],
    };

    const director = new TutorialDirector(adapter);
    director.start(tutorial);

    await wait();
    expect(enterEncounter).toHaveBeenCalledWith('yama_p3');
    expect(setMechanics).not.toHaveBeenCalled();
    expect(director.getState().stepIndex).toBe(0);

    settledEncounterKind = 'yama_p3';
    await wait();

    expect(setMechanics).toHaveBeenCalledWith({ infiniteHealth: true });
    expect(director.getState().stepIndex).toBe(1);
  });

  it('applies seeded encounter commands when a checkpoint seeds the encounter', async () => {
    const executeEncounterCommand = vi.fn(() => true);
    const adapter: TutorialDirectorAdapter = {
      enterEncounter: vi.fn(),
      enterLobby: vi.fn(),
      resetEncounter: vi.fn(),
      setMechanics: vi.fn(),
      activateTilePreset: vi.fn(),
      deactivateTilePresets: vi.fn(),
      pauseSim: vi.fn(),
      resumeSim: vi.fn(),
      setTickScale: vi.fn(),
      injectAction: vi.fn(),
      setTargetTile: vi.fn(),
      castMarkOfDarkness: vi.fn(),
      executeEncounterCommand,
      // Settled === seed.encounterKind, so applyCheckpointSeed takes the synchronous
      // resetEncounter branch and then applies the seed extras.
      getSettledEncounterKind: () => 'yama_p3',
      getState: () => demoState(),
      getPlayerPosition: () => [31, 37],
      fastForwardTicks: vi.fn(),
      subscribeTickAdvance: () => () => undefined,
    };

    const tutorial: Tutorial = {
      id: 'test-checkpoint-first-attack',
      title: 'Test',
      description: 'Checkpoint seeds an encounter command.',
      surface: 'encounter',
      steps: [
        {
          kind: 'checkpoint',
          title: 'Ready',
          body: 'seed',
          seed: {
            encounterKind: 'yama_p3',
            mechanics: { yamaMageRange: true },
            encounterCommandIds: ['yama-opening-range'],
          },
          autoAdvance: false,
        },
        { kind: 'info', title: 'Next', body: 'done.' },
      ],
    };

    const director = new TutorialDirector(adapter);
    director.start(tutorial);
    await wait();

    expect(executeEncounterCommand).toHaveBeenCalledWith(YAMA_SET_OPENING_RANGE_COMMAND);
  });
});

describe('TutorialDirector.goToStep', () => {
  function buildAdapter(overrides: Partial<TutorialDirectorAdapter> = {}): TutorialDirectorAdapter {
    return {
      enterEncounter: vi.fn(),
      enterLobby: vi.fn(),
      resetEncounter: vi.fn(),
      setMechanics: vi.fn(),
      activateTilePreset: vi.fn(),
      deactivateTilePresets: vi.fn(),
      pauseSim: vi.fn(),
      resumeSim: vi.fn(),
      setTickScale: vi.fn(),
      injectAction: vi.fn(),
      setTargetTile: vi.fn(),
      castMarkOfDarkness: vi.fn(),
      executeEncounterCommand: vi.fn(() => true),
      getSettledEncounterKind: () => 'yama_p3',
      getState: () => demoState(),
      getPlayerPosition: () => [31, 37],
      fastForwardTicks: vi.fn(),
      subscribeTickAdvance: () => () => undefined,
      ...overrides,
    };
  }

  it('fails setup when the active encounter rejects a command', async () => {
    const director = new TutorialDirector(buildAdapter({ executeEncounterCommand: vi.fn(() => false) }));
    director.start({
      id: 'incompatible-command',
      title: 'Incompatible command',
      description: 'Command setup failure.',
      surface: 'encounter',
      steps: [
        {
          kind: 'encounter-control',
          actions: [{ type: 'encounter-command', commandId: 'yama-spawn-void-flare' }],
        },
      ],
    });
    await wait();

    expect(director.getState().phase).toBe('failed');
    expect(director.getState().failPrompt).toBe('Step failed. Exit and retry.');
  });

  const infoSteps: Tutorial['steps'] = [
    { kind: 'info', title: 'Step 0', body: 'b' },
    { kind: 'info', title: 'Step 1', body: 'b' },
    { kind: 'info', title: 'Step 2', body: 'b' },
    { kind: 'info', title: 'Step 3', body: 'b' },
  ];

  const tutorial: Tutorial = {
    id: 'goToStep-test',
    title: 'Jump Test',
    description: 'Verifies goToStep navigation.',
    surface: 'encounter',
    steps: infoSteps,
  };

  it('jumps forward to a future step', async () => {
    const director = new TutorialDirector(buildAdapter());
    director.start(tutorial);
    await wait();
    expect(director.getState().stepIndex).toBe(0);

    director.goToStep(2);
    expect(director.getState().stepIndex).toBe(2);
    expect(director.getState().currentStep?.kind).toBe('info');
    expect((director.getState().currentStep as { title: string }).title).toBe('Step 2');
  });

  it('jumps backward to an earlier step', async () => {
    const director = new TutorialDirector(buildAdapter());
    director.start(tutorial);
    await wait();
    director.goToStep(3);
    expect(director.getState().stepIndex).toBe(3);

    director.goToStep(1);
    expect(director.getState().stepIndex).toBe(1);
  });

  it('clamps below 0 to 0', async () => {
    const director = new TutorialDirector(buildAdapter());
    director.start(tutorial);
    await wait();
    director.goToStep(2);
    director.goToStep(-5);
    expect(director.getState().stepIndex).toBe(0);
  });

  it('clamps above last index to last index', async () => {
    const director = new TutorialDirector(buildAdapter());
    director.start(tutorial);
    await wait();
    director.goToStep(100);
    expect(director.getState().stepIndex).toBe(infoSteps.length - 1);
  });

  it('is a no-op when target equals current step', async () => {
    const director = new TutorialDirector(buildAdapter());
    director.start(tutorial);
    await wait();
    director.goToStep(2);
    const stateAfter = director.getState();
    director.goToStep(2);
    expect(director.getState()).toEqual(stateAfter);
  });

  it('does nothing when called before a tutorial is started', () => {
    const director = new TutorialDirector(buildAdapter());
    expect(() => director.goToStep(2)).not.toThrow();
    expect(director.getState().tutorial).toBeNull();
  });
});

describe('TutorialDirector user-nav reseed (prev / goToStep)', () => {
  // When a user manually navigates back to (or jumps to) a step that depends
  // on live simulation — wait-for-event, demo, encounter-control,
  // event-driven world-highlight — the director must re-seed the encounter by
  // replaying every setup-bearing step (encounter-control + checkpoint)
  // between the nearest preceding checkpoint (or step 0 if none) and the
  // target. Otherwise the user lands in mid-cycle encounter state from their
  // previous play-through, the freshly subscribed wait-for-event gets fed
  // in-flight events, and steps that depend on a preceding setup step's side
  // effects (e.g. yama-voidflares' encounter command) silently
  // skip their setup.
  function buildAdapter(overrides: Partial<TutorialDirectorAdapter> = {}): TutorialDirectorAdapter {
    return {
      enterEncounter: vi.fn(),
      enterLobby: vi.fn(),
      resetEncounter: vi.fn(),
      setMechanics: vi.fn(),
      activateTilePreset: vi.fn(),
      deactivateTilePresets: vi.fn(),
      pauseSim: vi.fn(),
      resumeSim: vi.fn(),
      setTickScale: vi.fn(),
      injectAction: vi.fn(),
      setTargetTile: vi.fn(),
      castMarkOfDarkness: vi.fn(),
      executeEncounterCommand: vi.fn(() => true),
      // Settled === seed.encounterKind, so applyCheckpointSeed takes the
      // resetEncounter() branch (no enterEncounter, no async wait).
      getSettledEncounterKind: () => 'yama_p3',
      getState: () => demoState(),
      getPlayerPosition: () => [31, 37],
      fastForwardTicks: vi.fn(),
      subscribeTickAdvance: () => () => undefined,
      ...overrides,
    };
  }

  const FIREBALL_MECH = { fireballs: true, infiniteHealth: true } as const;

  const tutorial: Tutorial = {
    id: 'nav-reseed-test',
    title: 'Nav Reseed Test',
    description: 'Verifies reseed on user navigation.',
    surface: 'encounter',
    steps: [
      { kind: 'info', title: 'Intro', body: 'b' },
      {
        kind: 'checkpoint',
        title: 'Setup',
        body: 'b',
        seed: { encounterKind: 'yama_p3', mechanics: { ...FIREBALL_MECH } },
      },
      {
        kind: 'wait-for-event',
        title: 'Dodge fireballs',
        body: 'b',
        eventName: 'fireball_impact',
        count: 9,
      },
      { kind: 'info', title: 'Recap', body: 'b' },
    ],
  };

  it('prev() into a live-sim step reseeds via the nearest preceding checkpoint', async () => {
    const adapter = buildAdapter();
    const director = new TutorialDirector(adapter);
    director.start(tutorial);
    await wait();

    director.next();
    await wait();
    expect(director.getState().stepIndex).toBe(2);
    director.next();
    await wait();
    expect(director.getState().stepIndex).toBe(3);

    (adapter.resetEncounter as ReturnType<typeof vi.fn>).mockClear();
    (adapter.setMechanics as ReturnType<typeof vi.fn>).mockClear();

    director.prev();
    await wait();

    expect(adapter.resetEncounter).toHaveBeenCalledTimes(1);
    expect(adapter.setMechanics).toHaveBeenCalledWith({ ...FIREBALL_MECH });
    expect(director.getState().stepIndex).toBe(2);
    expect(director.getState().eventProgress).toBe(0);
  });

  it('goToStep() into a live-sim step reseeds from the preceding checkpoint', async () => {
    const adapter = buildAdapter();
    const director = new TutorialDirector(adapter);
    director.start(tutorial);
    await wait();
    director.goToStep(3);
    await wait();
    expect(director.getState().stepIndex).toBe(3);

    (adapter.resetEncounter as ReturnType<typeof vi.fn>).mockClear();
    (adapter.setMechanics as ReturnType<typeof vi.fn>).mockClear();

    director.goToStep(2);
    await wait();

    expect(adapter.resetEncounter).toHaveBeenCalledTimes(1);
    expect(adapter.setMechanics).toHaveBeenCalledWith({ ...FIREBALL_MECH });
    expect(director.getState().stepIndex).toBe(2);
  });

  it('prev() into a read-only step (info) does NOT reseed', async () => {
    const adapter = buildAdapter();
    const director = new TutorialDirector(adapter);
    director.start(tutorial);
    await wait();
    director.goToStep(3);
    await wait();

    (adapter.resetEncounter as ReturnType<typeof vi.fn>).mockClear();
    (adapter.enterEncounter as ReturnType<typeof vi.fn>).mockClear();
    (adapter.setMechanics as ReturnType<typeof vi.fn>).mockClear();

    director.goToStep(0);
    await wait();

    expect(adapter.resetEncounter).not.toHaveBeenCalled();
    expect(adapter.enterEncounter).not.toHaveBeenCalled();
    expect(adapter.setMechanics).not.toHaveBeenCalled();
    expect(director.getState().stepIndex).toBe(0);
  });

  it('next() (forward progression) does NOT trigger reseed', async () => {
    // Confirms the reseed is gated on user-nav helpers only, not natural
    // forward progression. Otherwise the encounter would reset every step.
    const adapter = buildAdapter();
    const director = new TutorialDirector(adapter);
    director.start(tutorial);
    await wait();
    director.next();
    await wait();
    // checkpoint calls resetEncounter as part of its OWN seed application,
    // which is expected. Clear after we're past the checkpoint.
    expect(director.getState().stepIndex).toBe(2);

    (adapter.resetEncounter as ReturnType<typeof vi.fn>).mockClear();
    (adapter.setMechanics as ReturnType<typeof vi.fn>).mockClear();

    director.next();
    await wait();

    expect(adapter.resetEncounter).not.toHaveBeenCalled();
    expect(adapter.setMechanics).not.toHaveBeenCalled();
    expect(director.getState().stepIndex).toBe(3);
  });

  it('user-nav with no preceding setup-bearing step does not call setup adapters', async () => {
    const noSetupTutorial: Tutorial = {
      id: 'no-setup-test',
      title: 'No Setup',
      description: 'b',
      surface: 'encounter',
      steps: [
        { kind: 'info', title: 'Intro', body: 'b' },
        {
          kind: 'wait-for-event',
          title: 'Wait',
          body: 'b',
          eventName: 'some_event',
          count: 1,
        },
        { kind: 'info', title: 'Done', body: 'b' },
      ],
    };
    const adapter = buildAdapter();
    const director = new TutorialDirector(adapter);
    director.start(noSetupTutorial);
    await wait();
    director.goToStep(2);
    await wait();

    (adapter.resetEncounter as ReturnType<typeof vi.fn>).mockClear();
    (adapter.setMechanics as ReturnType<typeof vi.fn>).mockClear();

    director.goToStep(1);
    await wait();

    expect(adapter.resetEncounter).not.toHaveBeenCalled();
    expect(adapter.setMechanics).not.toHaveBeenCalled();
    expect(director.getState().stepIndex).toBe(1);
  });

  it('user-nav to live-sim target replays preceding encounter-control setup even without a checkpoint', async () => {
    const wavesOnly = { waves: true, infiniteHealth: true } as const;
    const encounterControlOnlyTutorial: Tutorial = {
      id: 'ec-only-test',
      title: 'EC Only',
      description: 'b',
      surface: 'encounter',
      steps: [
        { kind: 'info', title: 'Intro', body: 'b' },
        {
          kind: 'encounter-control',
          title: 'Wave time',
          actions: [{ type: 'reset' }, { type: 'set-mechanics', mechanics: { ...wavesOnly } }],
          advanceDelayMs: 0,
        },
        {
          kind: 'wait-for-event',
          title: 'Survive 1 cycle',
          body: 'b',
          eventName: 'wave_activated',
          count: 3,
        },
        { kind: 'info', title: 'Done', body: 'b' },
      ],
    };
    const adapter = buildAdapter();
    const director = new TutorialDirector(adapter);
    director.start(encounterControlOnlyTutorial);
    await wait();
    director.goToStep(3);
    await wait();
    expect(director.getState().stepIndex).toBe(3);

    (adapter.resetEncounter as ReturnType<typeof vi.fn>).mockClear();
    (adapter.setMechanics as ReturnType<typeof vi.fn>).mockClear();

    director.goToStep(2);
    await wait();

    expect(adapter.resetEncounter).toHaveBeenCalledTimes(1);
    expect(adapter.setMechanics).toHaveBeenCalledWith({ ...wavesOnly });
    expect(director.getState().stepIndex).toBe(2);
    expect(director.getState().eventProgress).toBe(0);
  });

  it('user-nav replays multiple preceding setup steps in order', async () => {
    const flaresOnly = { voidFlares: true, infiniteHealth: true } as const;
    const multiSetupTutorial: Tutorial = {
      id: 'multi-setup-test',
      title: 'Multi Setup',
      description: 'b',
      surface: 'encounter',
      steps: [
        { kind: 'info', title: 'Intro', body: 'b' },
        {
          kind: 'encounter-control',
          title: 'Setup',
          actions: [{ type: 'reset' }, { type: 'set-mechanics', mechanics: { ...flaresOnly } }],
          advanceDelayMs: 0,
        },
        {
          kind: 'encounter-control',
          title: 'Spawning a flare',
          actions: [{ type: 'encounter-command', commandId: 'yama-spawn-void-flare' }],
          advanceDelayMs: 0,
        },
        {
          kind: 'wait-for-event',
          title: 'Kill it',
          body: 'b',
          eventName: 'voidflare_destroyed',
          count: 1,
        },
        { kind: 'info', title: 'Done', body: 'b' },
      ],
    };
    const adapter = buildAdapter();
    const director = new TutorialDirector(adapter);
    director.start(multiSetupTutorial);
    await wait();
    director.goToStep(4);
    await wait();

    (adapter.resetEncounter as ReturnType<typeof vi.fn>).mockClear();
    (adapter.setMechanics as ReturnType<typeof vi.fn>).mockClear();
    (adapter.executeEncounterCommand as ReturnType<typeof vi.fn>).mockClear();

    director.goToStep(3);
    await wait();

    expect(adapter.resetEncounter).toHaveBeenCalledTimes(1);
    expect(adapter.setMechanics).toHaveBeenCalledWith({ ...flaresOnly });
    expect(adapter.executeEncounterCommand).toHaveBeenCalledWith(YAMA_SPAWN_VOID_FLARE_COMMAND);
    // The reset must happen BEFORE the debug action: spawning a flare against a
    // not-yet-reset encounter would put it on a stale cycle position.
    const resetCallOrder = (adapter.resetEncounter as ReturnType<typeof vi.fn>).mock.invocationCallOrder[0];
    const commandCallOrder = (adapter.executeEncounterCommand as ReturnType<typeof vi.fn>).mock.invocationCallOrder[0];
    expect(resetCallOrder).toBeLessThan(commandCallOrder);
  });

  it('user-nav to an encounter-control target runs setup but suppresses auto-advance and pauses sim', async () => {
    // When the user explicitly selects an encounter-control step from the
    // steps list, they want to land ON that step, not be auto-skipped past it.
    // The handler must still run its actions (so the user sees the setup take
    // effect), then pause the sim (so the encounter cycle doesn't drift while
    // the user reads), then settle into awaiting-user (so Continue is shown).
    const wavesOnly = { waves: true, infiniteHealth: true } as const;
    const targetIsEcTutorial: Tutorial = {
      id: 'target-is-ec',
      title: 'Target is EC',
      description: 'b',
      surface: 'encounter',
      steps: [
        { kind: 'info', title: 'Intro', body: 'b' },
        {
          kind: 'encounter-control',
          title: 'Wave time',
          actions: [{ type: 'reset' }, { type: 'set-mechanics', mechanics: { ...wavesOnly } }],
          advanceDelayMs: 600,
        },
        { kind: 'info', title: 'Done', body: 'b' },
      ],
    };
    const adapter = buildAdapter();
    const director = new TutorialDirector(adapter);
    director.start(targetIsEcTutorial);
    await wait();
    director.goToStep(2);
    await wait();
    expect(director.getState().stepIndex).toBe(2);

    (adapter.pauseSim as ReturnType<typeof vi.fn>).mockClear();
    (adapter.resetEncounter as ReturnType<typeof vi.fn>).mockClear();
    (adapter.setMechanics as ReturnType<typeof vi.fn>).mockClear();

    director.goToStep(1);
    await wait(50);

    expect(adapter.resetEncounter).toHaveBeenCalledTimes(1);
    expect(adapter.setMechanics).toHaveBeenCalledWith({ ...wavesOnly });
    expect(director.getState().stepIndex).toBe(1);
    expect(director.getState().phase).toBe('awaiting-user');
    // Sim must be paused after the actions so the cycle doesn't drift while
    // the user reads the banner.
    expect(adapter.pauseSim).toHaveBeenCalled();
  });

  it('user-nav to a checkpoint target applies seed but suppresses auto-advance', async () => {
    const fireballMech = { fireballs: true, infiniteHealth: true } as const;
    const targetIsCheckpointTutorial: Tutorial = {
      id: 'target-is-checkpoint',
      title: 'Target is Checkpoint',
      description: 'b',
      surface: 'encounter',
      steps: [
        { kind: 'info', title: 'Intro', body: 'b' },
        {
          kind: 'checkpoint',
          title: 'Setup',
          body: 'b',
          seed: { encounterKind: 'yama_p3', mechanics: { ...fireballMech } },
        },
        { kind: 'info', title: 'Done', body: 'b' },
      ],
    };
    const adapter = buildAdapter();
    const director = new TutorialDirector(adapter);
    director.start(targetIsCheckpointTutorial);
    await wait();
    expect(director.getState().stepIndex).toBe(0);
    director.next();
    await wait();
    expect(director.getState().stepIndex).toBe(2);

    (adapter.resetEncounter as ReturnType<typeof vi.fn>).mockClear();
    (adapter.setMechanics as ReturnType<typeof vi.fn>).mockClear();

    director.goToStep(1);
    await wait();

    expect(adapter.resetEncounter).toHaveBeenCalledTimes(1);
    expect(adapter.setMechanics).toHaveBeenCalledWith({ ...fireballMech });
    expect(director.getState().stepIndex).toBe(1);
    expect(director.getState().phase).toBe('awaiting-user');
  });

  it('replay skips wait-ticks, pause, resume, set-tick-scale, and inject-action', async () => {
    // Setup actions that would deadlock the replay (wait-ticks under a paused
    // sim) or interfere with replay invariants (pause/resume, inject-action,
    // set-tick-scale) must be filtered out of replay. The replayable actions
    // in the same step must still run.
    const tutorialWithSkipped: Tutorial = {
      id: 'skip-list-test',
      title: 'Skip List',
      description: 'b',
      surface: 'encounter',
      steps: [
        { kind: 'info', title: 'Intro', body: 'b' },
        {
          kind: 'encounter-control',
          title: 'Mixed',
          actions: [
            { type: 'reset' },
            { type: 'wait-ticks', ticks: 5 },
            { type: 'pause' },
            { type: 'resume' },
            { type: 'set-tick-scale', scale: 2 },
            { type: 'set-mechanics', mechanics: { waves: true } },
          ],
          advanceDelayMs: 0,
        },
        {
          kind: 'wait-for-event',
          title: 'Wait',
          body: 'b',
          eventName: 'wave_activated',
          count: 1,
        },
        { kind: 'info', title: 'Done', body: 'b' },
      ],
    };
    const adapter = buildAdapter();
    const director = new TutorialDirector(adapter);
    director.start(tutorialWithSkipped);
    await wait();
    director.goToStep(3);
    await wait();

    (adapter.resetEncounter as ReturnType<typeof vi.fn>).mockClear();
    (adapter.setMechanics as ReturnType<typeof vi.fn>).mockClear();
    (adapter.pauseSim as ReturnType<typeof vi.fn>).mockClear();
    (adapter.resumeSim as ReturnType<typeof vi.fn>).mockClear();
    (adapter.setTickScale as ReturnType<typeof vi.fn>).mockClear();
    (adapter.injectAction as ReturnType<typeof vi.fn>).mockClear();
    adapter.subscribeTickAdvance as ReturnType<typeof vi.fn> | undefined;

    director.goToStep(2);

    // wait-ticks would normally subscribe to ticks and wait forever under
    // paused sim; if the skip list is wrong the replay never resolves and
    // stepIndex stays stuck.
    await wait(50);

    expect(director.getState().stepIndex).toBe(2);
    expect(adapter.resetEncounter).toHaveBeenCalled();
    expect(adapter.setMechanics).toHaveBeenCalledWith({ waves: true });
    // Replay-skipped action types must not be invoked AS PART of the replay.
    // resumeSim is called by advanceTo() at the end (the live-sim target
    // wait-for-event step needs the sim live), so it can fire after replay —
    // but setTickScale and injectAction have no such callers and must stay 0.
    expect(adapter.setTickScale).not.toHaveBeenCalled();
    expect(adapter.injectAction).not.toHaveBeenCalled();
  });

  it('back-to-back nav cancels the prior in-flight reseed', async () => {
    const adapter = buildAdapter();
    const director = new TutorialDirector(adapter);
    director.start(tutorial);
    await wait();
    director.goToStep(3);
    await wait();

    (adapter.resetEncounter as ReturnType<typeof vi.fn>).mockClear();

    // Synchronously kick off two navigations. The first targets the live-sim
    // step and starts an async reseed. The second targets a read-only step,
    // cancels the first's runner, and resolves synchronously.
    director.goToStep(2);
    director.goToStep(0);
    await wait();

    expect(director.getState().stepIndex).toBe(0);
    expect(director.getState().currentStep?.kind).toBe('info');
    expect((director.getState().currentStep as { title: string }).title).toBe('Intro');
  });

  it('updates lastCheckpointIndex correctly when navigating backward past a checkpoint into a read-only step', async () => {
    // `advanceTo()` must recompute lastCheckpointIndex from
    // findLastCheckpointBefore(target). Otherwise navigating backward past a
    // checkpoint leaves lastCheckpointIndex referencing a future checkpoint and
    // retryFromCheckpoint() jumps forward.
    const tutorialWithMidCheckpoint: Tutorial = {
      id: 'mid-checkpoint',
      title: 'Mid Checkpoint',
      description: 'b',
      surface: 'encounter',
      steps: [
        { kind: 'info', title: 'Step 0', body: 'b' },
        { kind: 'info', title: 'Step 1', body: 'b' },
        {
          kind: 'checkpoint',
          title: 'Setup',
          body: 'b',
          seed: { encounterKind: 'yama_p3', mechanics: { fireballs: true } },
        },
        { kind: 'info', title: 'Step 3', body: 'b' },
        { kind: 'info', title: 'Step 4', body: 'b' },
      ],
    };
    const adapter = buildAdapter();
    const director = new TutorialDirector(adapter);
    director.start(tutorialWithMidCheckpoint);
    await wait();
    director.goToStep(4);
    await wait();
    expect(director.getState().stepIndex).toBe(4);
    expect(director.getState().lastCheckpointIndex).toBe(2);

    // Nav backward past the checkpoint to a read-only step — lastCheckpointIndex
    // must now be null because no checkpoint exists at or before step 1.
    director.goToStep(1);
    await wait();
    expect(director.getState().stepIndex).toBe(1);
    expect(director.getState().lastCheckpointIndex).toBeNull();
  });
});

describe('TutorialDirector completedSteps tracking', () => {
  // The completedSteps marker is the persistent 'done' state shown by the
  // StepsList checkmarks and the picker progress count. Its contract:
  //   1. A step joins completedSteps when it exits via natural progression
  //      (`next()` chain or `complete()`), NOT via prev() / goToStep jumps.
  //   2. It is monotonic within a run: a step never leaves completedSteps
  //      once added (re-doing a step does NOT un-mark it).
  //   3. It is purely visual: the director NEVER reads it to skip, gate, or
  //      alter step execution — a 'done' step runs identically to a fresh one.
  //   4. start() can re-seed it from persistence so the marker survives
  //      exit/resume.

  function buildAdapter(overrides: Partial<TutorialDirectorAdapter> = {}): TutorialDirectorAdapter {
    return {
      enterEncounter: vi.fn(),
      enterLobby: vi.fn(),
      resetEncounter: vi.fn(),
      setMechanics: vi.fn(),
      activateTilePreset: vi.fn(),
      deactivateTilePresets: vi.fn(),
      pauseSim: vi.fn(),
      resumeSim: vi.fn(),
      setTickScale: vi.fn(),
      injectAction: vi.fn(),
      setTargetTile: vi.fn(),
      castMarkOfDarkness: vi.fn(),
      executeEncounterCommand: vi.fn(() => true),
      getSettledEncounterKind: () => 'yama_p3',
      getState: () => demoState(),
      getPlayerPosition: () => [31, 37],
      fastForwardTicks: vi.fn(),
      subscribeTickAdvance: () => () => undefined,
      ...overrides,
    };
  }

  const fourInfoSteps: Tutorial = {
    id: 'completed-steps-test',
    title: 'Completed Steps',
    description: 'b',
    surface: 'encounter',
    steps: [
      { kind: 'info', title: 'Step 0', body: 'b' },
      { kind: 'info', title: 'Step 1', body: 'b' },
      { kind: 'info', title: 'Step 2', body: 'b' },
      { kind: 'info', title: 'Step 3', body: 'b' },
    ],
  };

  it('start() initializes completedSteps to an empty array', async () => {
    const director = new TutorialDirector(buildAdapter());
    director.start(fourInfoSteps);
    await wait();
    expect(director.getState().completedSteps).toEqual([]);
  });

  it('next() marks the current step as completed before advancing', async () => {
    const director = new TutorialDirector(buildAdapter());
    director.start(fourInfoSteps);
    await wait();
    expect(director.getState().completedSteps).toEqual([]);

    director.next();
    await wait();
    expect(director.getState().completedSteps).toEqual([0]);
    expect(director.getState().stepIndex).toBe(1);

    director.next();
    await wait();
    expect(director.getState().completedSteps).toEqual([0, 1]);
  });

  it('complete() marks the final step as completed', async () => {
    const director = new TutorialDirector(buildAdapter());
    director.start(fourInfoSteps);
    await wait();
    director.next();
    director.next();
    director.next();
    director.next();
    await wait();
    expect(director.getState().phase).toBe('complete');
    expect(director.getState().completedSteps).toEqual([0, 1, 2, 3]);
  });

  it('prev() does NOT add the current step to completedSteps (user is going back, not finishing)', async () => {
    const director = new TutorialDirector(buildAdapter());
    director.start(fourInfoSteps);
    await wait();
    director.next();
    await wait();

    director.prev();
    await wait();
    expect(director.getState().stepIndex).toBe(0);
    expect(director.getState().completedSteps).toEqual([0]);
  });

  it('goToStep() forward does NOT mark skipped steps as completed', async () => {
    // Jumping from 0 to 3 must not falsely claim 1 and 2 were finished — the
    // user never visited them. Only the step they exited via next() counts.
    const director = new TutorialDirector(buildAdapter());
    director.start(fourInfoSteps);
    await wait();

    director.goToStep(3);
    await wait();
    expect(director.getState().stepIndex).toBe(3);
    expect(director.getState().completedSteps).toEqual([]);
  });

  it('goToStep() backward does NOT change completedSteps', async () => {
    const director = new TutorialDirector(buildAdapter());
    director.start(fourInfoSteps);
    await wait();
    director.next();
    director.next();
    await wait();
    expect(director.getState().completedSteps).toEqual([0, 1]);

    director.goToStep(0);
    await wait();
    expect(director.getState().stepIndex).toBe(0);
    expect(director.getState().completedSteps).toEqual([0, 1]);
  });

  it('re-doing a completed step does not duplicate or unmark it', async () => {
    const director = new TutorialDirector(buildAdapter());
    director.start(fourInfoSteps);
    await wait();
    director.next();
    director.next();
    await wait();
    expect(director.getState().completedSteps).toEqual([0, 1]);

    director.goToStep(0);
    await wait();
    director.next();
    await wait();
    expect(director.getState().completedSteps).toEqual([0, 1]);
    expect(director.getState().stepIndex).toBe(1);
  });

  it('start() accepts initialCompletedSteps to restore from persistence', async () => {
    const director = new TutorialDirector(buildAdapter());
    director.start(fourInfoSteps, { initialCompletedSteps: [0, 2] });
    await wait();
    expect(director.getState().completedSteps).toEqual([0, 2]);

    // Director must NOT skip step 0 just because it's already done — the user
    // is on step 0 (the active step). next() then promotes them to step 1.
    expect(director.getState().stepIndex).toBe(0);
    director.next();
    await wait();
    expect(director.getState().stepIndex).toBe(1);
  });

  it('start() filters out-of-range initialCompletedSteps from a stale save', async () => {
    const director = new TutorialDirector(buildAdapter());
    director.start(fourInfoSteps, { initialCompletedSteps: [-1, 0, 2, 9, 99] });
    await wait();
    expect(director.getState().completedSteps).toEqual([0, 2]);
  });

  it('exit() clears completedSteps so a fresh start does not leak prior progress', async () => {
    const director = new TutorialDirector(buildAdapter());
    director.start(fourInfoSteps);
    await wait();
    director.next();
    director.next();
    await wait();
    expect(director.getState().completedSteps).toEqual([0, 1]);

    director.exit();
    expect(director.getState().completedSteps).toEqual([]);

    director.start(fourInfoSteps);
    await wait();
    expect(director.getState().completedSteps).toEqual([]);
  });

  it('exit() clears the tutorial-driven autopath target', async () => {
    const setTargetTile = vi.fn();
    const director = new TutorialDirector(buildAdapter({ setTargetTile }));
    director.start(fourInfoSteps);
    await wait();

    director.exit();

    expect(setTargetTile).toHaveBeenCalledWith(null);
  });

  it('completed steps NEVER cause the director to skip or auto-advance — every step still runs', async () => {
    // This is the core invariant: 'done' must be purely visual. We start with
    // all steps marked complete and verify the director still walks through
    // them one at a time via next() instead of jumping to the end.
    const director = new TutorialDirector(buildAdapter());
    director.start(fourInfoSteps, { initialCompletedSteps: [0, 1, 2, 3] });
    await wait();
    expect(director.getState().stepIndex).toBe(0);
    expect(director.getState().phase).toBe('awaiting-user');

    director.next();
    await wait();
    expect(director.getState().stepIndex).toBe(1);
    expect(director.getState().phase).toBe('awaiting-user');

    director.next();
    await wait();
    expect(director.getState().stepIndex).toBe(2);

    director.next();
    await wait();
    expect(director.getState().stepIndex).toBe(3);

    director.next();
    await wait();
    expect(director.getState().phase).toBe('complete');
  });
});

describe('TutorialDirector step intro countdown gating', () => {
  function buildAdapter(overrides: Partial<TutorialDirectorAdapter> = {}): TutorialDirectorAdapter {
    return {
      enterEncounter: vi.fn(),
      enterLobby: vi.fn(),
      resetEncounter: vi.fn(),
      setMechanics: vi.fn(),
      activateTilePreset: vi.fn(),
      deactivateTilePresets: vi.fn(),
      pauseSim: vi.fn(),
      resumeSim: vi.fn(),
      setTickScale: vi.fn(),
      injectAction: vi.fn(),
      setTargetTile: vi.fn(),
      castMarkOfDarkness: vi.fn(),
      executeEncounterCommand: vi.fn(() => true),
      getSettledEncounterKind: () => 'yama_p3',
      getState: () => demoState(),
      getPlayerPosition: () => [31, 37],
      fastForwardTicks: vi.fn(),
      subscribeTickAdvance: vi.fn(() => () => undefined),
      ...overrides,
    };
  }

  it('holds demo cursor and recording playback until the countdown completes', async () => {
    const subscribeTickAdvance = vi.fn(() => () => undefined);
    const adapter = buildAdapter({ subscribeTickAdvance });
    const director = new TutorialDirector(adapter);
    director.start({
      id: 'demo-countdown-gate',
      title: 'Demo Countdown Gate',
      description: 'b',
      surface: 'encounter',
      steps: [
        {
          kind: 'demo',
          title: 'Watch',
          body: 'b',
          scriptedActions: [],
          cursor: { cues: [{ time: { kind: 'tick', tick: 1 }, target: { kind: 'panel-tab', tab: 'prayer' } }] },
          stopAtTickOffset: 2,
        },
      ],
    });

    await wait(0);
    expect(director.getState().stepIntroActive).toBe(true);
    expect(director.getState().activeDemoCursor).toBeNull();
    expect(director.getState().demoPlayback).toBeNull();
    expect(subscribeTickAdvance).not.toHaveBeenCalled();

    await wait(STEP_INTRO_COUNTDOWN_MS - 1);
    expect(director.getState().activeDemoCursor).toBeNull();
    expect(director.getState().demoPlayback).toBeNull();
    expect(subscribeTickAdvance).not.toHaveBeenCalled();

    await wait(1);
    expect(director.getState().stepIntroActive).toBe(false);
    expect(director.getState().activeDemoCursor).not.toBeNull();
    expect(director.getState().demoPlayback?.mode).toBe('recording');
    expect(subscribeTickAdvance).toHaveBeenCalledTimes(1);
  });

  it('holds wait-for-event subscriptions until the countdown completes', async () => {
    const subscribeTickAdvance = vi.fn(() => () => undefined);
    const director = new TutorialDirector(buildAdapter({ subscribeTickAdvance }));
    director.start({
      id: 'wait-countdown-gate',
      title: 'Wait Countdown Gate',
      description: 'b',
      surface: 'encounter',
      steps: [
        {
          kind: 'wait-for-event',
          title: 'Wait',
          body: 'b',
          eventName: 'hit',
          count: 2,
        },
      ],
    });

    await wait(0);
    expect(director.getState().stepIntroActive).toBe(true);
    expect(director.getState().eventTarget).toBe(0);
    expect(subscribeTickAdvance).not.toHaveBeenCalled();

    await wait(STEP_INTRO_COUNTDOWN_MS);
    expect(director.getState().stepIntroActive).toBe(false);
    expect(director.getState().eventTarget).toBe(2);
    expect(subscribeTickAdvance).toHaveBeenCalledTimes(1);
  });

  it('holds world-highlight tick listeners until the countdown completes', async () => {
    const subscribeTickAdvance = vi.fn(() => () => undefined);
    const director = new TutorialDirector(buildAdapter({ subscribeTickAdvance }));
    director.start({
      id: 'world-highlight-countdown-gate',
      title: 'World Highlight Countdown Gate',
      description: 'b',
      surface: 'encounter',
      steps: [
        {
          kind: 'world-highlight',
          title: 'Stand here',
          body: 'b',
          target: { type: 'tile', tile: [31, 37] },
          advanceOn: { type: 'player-on-target' },
        },
      ],
    });

    await wait(0);
    expect(director.getState().stepIntroActive).toBe(true);
    expect(subscribeTickAdvance).not.toHaveBeenCalled();

    await wait(STEP_INTRO_COUNTDOWN_MS);
    expect(director.getState().stepIntroActive).toBe(false);
    expect(subscribeTickAdvance).toHaveBeenCalledTimes(1);
  });
});

describe('TutorialDirector step-inline setup field', () => {
  //   1. Setup actions run BEFORE the step's main behavior subscribes.
  //   2. Actions run in declaration order via the existing applyControlAction.
  //   3. Subscription does NOT see events fired during setup
  //      (e.g. an encounter command inside setup must not falsely tick the
  //      event counter — the subscription attaches afterwards).
  //   4. Empty or undefined setup must be a no-op.
  function buildAdapter(overrides: Partial<TutorialDirectorAdapter> = {}): TutorialDirectorAdapter {
    return {
      enterEncounter: vi.fn(),
      enterLobby: vi.fn(),
      resetEncounter: vi.fn(),
      setMechanics: vi.fn(),
      activateTilePreset: vi.fn(),
      deactivateTilePresets: vi.fn(),
      pauseSim: vi.fn(),
      resumeSim: vi.fn(),
      setTickScale: vi.fn(),
      injectAction: vi.fn(),
      setTargetTile: vi.fn(),
      castMarkOfDarkness: vi.fn(),
      executeEncounterCommand: vi.fn(() => true),
      getSettledEncounterKind: () => 'yama_p3',
      getState: () => demoState(),
      getPlayerPosition: () => [31, 37],
      fastForwardTicks: vi.fn(),
      subscribeTickAdvance: () => () => undefined,
      ...overrides,
    };
  }

  it('wait-for-event setup runs reset + set-mechanics in order before subscribing', async () => {
    const callOrder: string[] = [];
    const adapter = buildAdapter({
      resetEncounter: vi.fn(() => {
        callOrder.push('reset');
      }),
      setMechanics: vi.fn((m: unknown) => {
        callOrder.push(`setMechanics:${JSON.stringify(m)}`);
      }),
      subscribeTickAdvance: vi.fn(() => {
        callOrder.push('subscribe');
        return () => undefined;
      }),
    });
    const tutorial: Tutorial = {
      id: 'wfe-setup-test',
      title: 'WFE Setup',
      description: 'b',
      surface: 'encounter',
      steps: [
        {
          kind: 'wait-for-event',
          title: 'Survive 1 cycle',
          body: 'b',
          eventName: 'wave_activated',
          count: 3,
          setup: [{ type: 'reset' }, { type: 'set-mechanics', mechanics: { waves: true } }],
        },
      ],
    };
    const director = new TutorialDirector(adapter);
    director.start(tutorial);
    await wait();

    expect(callOrder).toEqual(['reset', 'setMechanics:{"waves":true}', 'subscribe']);
  });

  it('wait-for-event setup with an encounter command does NOT prematurely tick the event counter', async () => {
    // The yama-voidflares pattern: setup includes an encounter command that
    // spawns a flare; the resulting voidflare_destroyed event from the same
    // tick must NOT count toward the WFE because the subscription has not yet
    // attached when setup ran.
    let subscribeCallback: ((tick: number, events: { type: string }[]) => void) | null = null;
    const executeEncounterCommand = vi.fn(() => true);
    const adapter = buildAdapter({
      executeEncounterCommand,
      subscribeTickAdvance: vi.fn((cb) => {
        subscribeCallback = cb;
        return () => {
          subscribeCallback = null;
        };
      }),
    });
    const tutorial: Tutorial = {
      id: 'wfe-setup-trigger-test',
      title: 'WFE Setup Trigger',
      description: 'b',
      surface: 'encounter',
      steps: [
        {
          kind: 'wait-for-event',
          title: 'Kill the flare',
          body: 'b',
          eventName: 'voidflare_destroyed',
          count: 1,
          setup: [{ type: 'reset' }, { type: 'encounter-command', commandId: 'yama-spawn-void-flare' }],
        },
      ],
    };
    const director = new TutorialDirector(adapter);
    director.start(tutorial);
    await wait();

    expect(executeEncounterCommand).toHaveBeenCalledWith(YAMA_SPAWN_VOID_FLARE_COMMAND);
    // Subscription is attached AFTER setup, before any event has been seen.
    expect(subscribeCallback).not.toBeNull();
    expect(director.getState().eventProgress).toBe(0);

    subscribeCallback!(1, [{ type: 'voidflare_destroyed' }]);
    expect(director.getState().eventProgress).toBe(0);
    expect(director.getState().stepIndex).toBe(0);
    expect(director.getState().phase).toBe('complete');
  });

  it('wait-for-event with no setup field behaves identically to the pre-setup baseline', async () => {
    const adapter = buildAdapter();
    const tutorial: Tutorial = {
      id: 'wfe-no-setup-test',
      title: 'WFE No Setup',
      description: 'b',
      surface: 'encounter',
      steps: [
        {
          kind: 'wait-for-event',
          title: 'Plain WFE',
          body: 'b',
          eventName: 'wave_activated',
          count: 3,
        },
      ],
    };
    const director = new TutorialDirector(adapter);
    director.start(tutorial);
    await wait();

    expect(adapter.resetEncounter).not.toHaveBeenCalled();
    expect(adapter.setMechanics).not.toHaveBeenCalled();
    expect(director.getState().eventProgress).toBe(0);
    expect(director.getState().eventTarget).toBe(3);
  });

  it('world-highlight setup runs before attaching the player-position listener', async () => {
    const callOrder: string[] = [];
    const adapter = buildAdapter({
      resetEncounter: vi.fn(() => {
        callOrder.push('reset');
      }),
      activateTilePreset: vi.fn((id: string) => {
        callOrder.push(`preset:${id}`);
      }),
      subscribeTickAdvance: vi.fn(() => {
        callOrder.push('subscribe');
        return () => undefined;
      }),
    });
    const tutorial: Tutorial = {
      id: 'wh-setup-test',
      title: 'WH Setup',
      description: 'b',
      surface: 'encounter',
      steps: [
        {
          kind: 'world-highlight',
          title: 'Stand here',
          body: 'b',
          target: { type: 'tile', tile: [31, 37] },
          advanceOn: { type: 'player-on-target' },
          setup: [{ type: 'reset' }, { type: 'activate-tile-preset', presetId: 'demo-preset' }],
        },
      ],
    };
    const director = new TutorialDirector(adapter);
    director.start(tutorial);
    await wait();

    expect(callOrder).toEqual(['reset', 'preset:demo-preset', 'subscribe']);
  });

  it('demo setup runs before scripted actions begin', async () => {
    const callOrder: string[] = [];
    const adapter = buildAdapter({
      activateTilePreset: vi.fn((id: string) => {
        callOrder.push(`preset:${id}`);
      }),
      resetEncounter: vi.fn(() => {
        callOrder.push('reset');
      }),
      setMechanics: vi.fn(() => {
        callOrder.push('setMechanics');
      }),
      resumeSim: vi.fn(() => {
        callOrder.push('resume');
      }),
      subscribeTickAdvance: vi.fn(() => {
        callOrder.push('subscribe');
        return () => undefined;
      }),
    });
    const tutorial: Tutorial = {
      id: 'demo-setup-test',
      title: 'Demo Setup',
      description: 'b',
      surface: 'encounter',
      steps: [
        {
          kind: 'demo',
          title: 'Demo',
          body: 'b',
          scriptedActions: [{ tickOffset: 0, annotation: 'a' }],
          stopAtTickOffset: 1,
          // Setup runs before `resetBefore` and `mechanics`; verify it precedes
          // the subscription.
          setup: [{ type: 'activate-tile-preset', presetId: 'demo-preset' }],
          resetBefore: true,
          mechanics: { waves: true },
        },
      ],
    };
    const director = new TutorialDirector(adapter);
    director.start(tutorial);
    await wait();

    expect(callOrder.indexOf('preset:demo-preset')).toBeLessThan(callOrder.indexOf('subscribe'));
    expect(callOrder).toContain('reset');
    expect(callOrder).toContain('setMechanics');
  });

  it('exit() during setup cancels the chain (subscription never attaches)', async () => {
    let triggerCalled = false;
    const adapter = buildAdapter({
      executeEncounterCommand: vi.fn(() => {
        triggerCalled = true;
        return true;
      }),
      subscribeTickAdvance: vi.fn(() => () => undefined),
    });
    const subscribeSpy = adapter.subscribeTickAdvance as ReturnType<typeof vi.fn>;
    const tutorial: Tutorial = {
      id: 'wfe-setup-cancel-test',
      title: 'WFE Setup Cancel',
      description: 'b',
      surface: 'encounter',
      steps: [
        {
          kind: 'wait-for-event',
          title: 'WFE',
          body: 'b',
          eventName: 'evt',
          // 200+ setup items so the per-action microtask awaits accumulate
          // and exit() lands before the chain finishes. Each calls
          // executeEncounterCommand which is sync, but the await between actions
          // yields each iteration.
          setup: Array.from({ length: 200 }, () => ({
            type: 'encounter-command' as const,
            commandId: 'yama-spawn-void-flare' as const,
          })),
        },
      ],
    };
    const director = new TutorialDirector(adapter);
    director.start(tutorial);
    director.exit();
    await wait(50);

    expect(subscribeSpy).not.toHaveBeenCalled();
    // triggerCalled may or may not be true depending on microtask ordering;
    // the important guarantee is that the subscription was never attached.
    void triggerCalled;
  });
});

describe('TutorialDirector step control and demo sessions', () => {
  function buildAdapter(overrides: Partial<TutorialDirectorAdapter> = {}): TutorialDirectorAdapter {
    return {
      enterEncounter: vi.fn(),
      enterLobby: vi.fn(),
      resetEncounter: vi.fn(),
      setMechanics: vi.fn(),
      activateTilePreset: vi.fn(),
      deactivateTilePresets: vi.fn(),
      pauseSim: vi.fn(),
      resumeSim: vi.fn(),
      setTickScale: vi.fn(),
      injectAction: vi.fn(),
      setTargetTile: vi.fn(),
      castMarkOfDarkness: vi.fn(),
      executeEncounterCommand: vi.fn(() => true),
      getSettledEncounterKind: () => 'yama_p3',
      getState: () => demoState(),
      getPlayerPosition: () => [31, 37],
      fastForwardTicks: vi.fn(),
      subscribeTickAdvance: () => () => undefined,
      ...overrides,
    };
  }

  const fourInfoSteps: Tutorial = {
    id: 'review-fix-test',
    title: 'Review Fix',
    description: 'b',
    surface: 'encounter',
    steps: [
      { kind: 'info', title: 'Step 0', body: 'b' },
      { kind: 'info', title: 'Step 1', body: 'b' },
      { kind: 'info', title: 'Step 2', body: 'b' },
      { kind: 'info', title: 'Step 3', body: 'b' },
    ],
  };

  it('skipStep() advances WITHOUT marking the skipped step completed', async () => {
    const director = new TutorialDirector(buildAdapter());
    director.start(fourInfoSteps);
    await wait();
    director.next();
    await wait();
    expect(director.getState().completedSteps).toEqual([0]);
    director.skipStep();
    await wait();
    expect(director.getState().stepIndex).toBe(2);
    expect(director.getState().completedSteps).toEqual([0]);
  });

  it('exit() clears a pending banner timer so it cannot fire into a later run', () => {
    vi.useFakeTimers();
    try {
      const director = new TutorialDirector(buildAdapter());
      director.start(fourInfoSteps);
      director.onPlayerDeath();
      expect(director.getState().banner).not.toBeNull();
      director.exit();

      // A listener attached after exit must never be touched by a stale timer.
      const listener = vi.fn();
      director.subscribe(listener);
      vi.advanceTimersByTime(10000);
      expect(listener).not.toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
    }
  });

  it('pause() defers an auto-advancing checkpoint until resume()', async () => {
    const director = new TutorialDirector(buildAdapter());
    const tutorial: Tutorial = {
      id: 'pause-defer-test',
      title: 'Pause Defer',
      description: 'b',
      surface: 'encounter',
      steps: [
        { kind: 'checkpoint', title: 'CP', body: 'b', seed: { encounterKind: 'yama_p3' } },
        { kind: 'info', title: 'After', body: 'b' },
      ],
    };
    director.start(tutorial);
    director.pause();
    expect(director.getState().phase).toBe('paused');
    await wait();
    expect(director.getState().stepIndex).toBe(0);
    expect(director.getState().phase).toBe('paused');
    director.resume();
    await wait();
    expect(director.getState().stepIndex).toBe(1);
  });

  it('retryStep() re-runs a failed step that has no preceding checkpoint', async () => {
    let emit: ((tick: number, events: { type: string }[]) => void) | null = null;
    const adapter = buildAdapter({
      subscribeTickAdvance: vi.fn((cb) => {
        emit = cb;
        return () => {
          emit = null;
        };
      }),
    });
    const tutorial: Tutorial = {
      id: 'retry-step-test',
      title: 'Retry Step',
      description: 'b',
      surface: 'encounter',
      steps: [
        {
          kind: 'wait-for-event',
          title: 'Kill it',
          body: 'b',
          eventName: 'voidflare_destroyed',
          count: 1,
          failEventName: 'voidflare_exploded',
          failPrompt: 'boom',
        },
      ],
    };
    const director = new TutorialDirector(adapter);
    director.start(tutorial);
    await wait();
    expect(emit).not.toBeNull();

    emit!(1, [{ type: 'voidflare_exploded' }]);
    expect(director.getState().phase).toBe('failed');
    expect(director.getState().lastCheckpointIndex).toBeNull();
    expect(director.getState().failPrompt).toBe('boom');

    director.retryStep();
    await wait();
    expect(director.getState().phase).toBe('running');
    expect(director.getState().failPrompt).toBeNull();
    expect(emit).not.toBeNull();

    emit!(2, [{ type: 'voidflare_destroyed' }]);
    expect(director.getState().phase).toBe('complete');
  });

  it('failResetsProgress: a miss resets the streak and pulses progressResetNonce without failing', async () => {
    let emit: ((tick: number, events: Array<{ type: string; ok?: boolean }>) => void) | null = null;
    const adapter = buildAdapter({
      subscribeTickAdvance: vi.fn((cb) => {
        emit = cb;
        return () => {
          emit = null;
        };
      }),
    });
    const tutorial: Tutorial = {
      id: 'streak-reset-test',
      title: 'Streak Reset',
      description: 'b',
      surface: 'encounter',
      steps: [
        {
          kind: 'wait-for-event',
          title: 'Two in a row',
          body: 'b',
          eventName: 'hit',
          matcher: (e) => (e as { ok?: boolean }).ok === true,
          count: 2,
          failEventName: 'hit',
          failMatcher: (e) => (e as { ok?: boolean }).ok === false,
          failResetsProgress: true,
        },
      ],
    };
    const director = new TutorialDirector(adapter);
    director.start(tutorial);
    await wait();
    expect(emit).not.toBeNull();
    const baseNonce = director.getState().progressResetNonce;

    emit!(1, [{ type: 'hit', ok: true }]);
    expect(director.getState().eventProgress).toBe(1);
    expect(director.getState().phase).toBe('running');

    emit!(2, [{ type: 'hit', ok: false }]);
    expect(director.getState().phase).toBe('running');
    expect(director.getState().eventProgress).toBe(0);
    expect(director.getState().progressResetNonce).toBe(baseNonce + 1);

    // A miss at zero progress must NOT pulse again (nothing was lost).
    emit!(3, [{ type: 'hit', ok: false }]);
    expect(director.getState().progressResetNonce).toBe(baseNonce + 1);

    emit!(4, [{ type: 'hit', ok: true }]);
    expect(director.getState().eventProgress).toBe(1);
    emit!(5, [{ type: 'hit', ok: true }]);
    expect(director.getState().phase).toBe('complete');
  });
});

describe('TutorialDirector demo cursor session', () => {
  function buildAdapter(overrides: Partial<TutorialDirectorAdapter> = {}): TutorialDirectorAdapter {
    return {
      enterEncounter: vi.fn(),
      enterLobby: vi.fn(),
      resetEncounter: vi.fn(),
      setMechanics: vi.fn(),
      activateTilePreset: vi.fn(),
      deactivateTilePresets: vi.fn(),
      pauseSim: vi.fn(),
      resumeSim: vi.fn(),
      setTickScale: vi.fn(),
      injectAction: vi.fn(),
      setTargetTile: vi.fn(),
      castMarkOfDarkness: vi.fn(),
      executeEncounterCommand: vi.fn(() => true),
      getSettledEncounterKind: () => 'yama_p3',
      getState: () => demoState(),
      getPlayerPosition: () => [31, 37],
      fastForwardTicks: vi.fn(),
      subscribeTickAdvance: () => () => undefined,
      ...overrides,
    };
  }

  const demoTutorial: Tutorial = {
    id: 'test-demo-cursor',
    title: 'Demo cursor',
    description: 'Publishes a cursor session.',
    surface: 'encounter',
    steps: [
      {
        kind: 'demo',
        title: 'Watch',
        body: 'b',
        scriptedActions: [],
        cursor: { cues: [{ time: { kind: 'tick', tick: 1 }, target: { kind: 'panel-tab', tab: 'prayer' } }] },
        stopAtTickOffset: 5,
      },
    ],
  };

  it('publishes activeDemoCursor after the demo setup completes', async () => {
    const director = new TutorialDirector(buildAdapter());
    director.start(demoTutorial);
    await wait();
    const s = director.getState();
    expect(s.activeDemoCursor).not.toBeNull();
    expect(s.activeDemoCursor?.track.cues).toHaveLength(1);
    expect(s.activeDemoCursor?.tickMs).toBe(600);
    expect(s.activeDemoCursor?.stepIndex).toBe(0);
  });

  it('clears activeDemoCursor on exit', async () => {
    const director = new TutorialDirector(buildAdapter());
    director.start(demoTutorial);
    await wait();
    expect(director.getState().activeDemoCursor).not.toBeNull();
    director.exit();
    expect(director.getState().activeDemoCursor).toBeNull();
  });

  it('publishes no cursor session for a demo without a cursor track', async () => {
    const director = new TutorialDirector(buildAdapter());
    director.start({
      ...demoTutorial,
      steps: [{ kind: 'demo', title: 'Watch', body: 'b', scriptedActions: [], stopAtTickOffset: 5 }],
    });
    await wait();
    expect(director.getState().activeDemoCursor).toBeNull();
  });

  it('captures per-tick playback frames and supports clamped tick stepping', async () => {
    let emit: ((tick: number, events: { type: string }[]) => void) | null = null;
    let snapTick = 0;
    const director = new TutorialDirector(
      buildAdapter({
        getState: () => demoState(snapTick++),
        subscribeTickAdvance: vi.fn((cb) => {
          emit = cb;
          return () => {
            emit = null;
          };
        }),
      }),
    );
    // Demo (stopAtTickOffset 5) followed by an info step, so next() advances via
    // advanceTo (which clears demoPlayback) rather than completing the tutorial.
    director.start({
      ...demoTutorial,
      steps: [demoTutorial.steps[0], { kind: 'info', title: 'Done', body: 'b' }],
    });
    await wait();
    expect(emit).not.toBeNull();
    // The demo publishes a live 'recording' session from the first tick, so the
    // transport is visible during the watch (not only after it finishes).
    expect(director.getState().demoPlayback?.mode).toBe('recording');
    expect(director.getState().demoPlayback?.frontierMs).toBe(0);

    for (let i = 1; i <= 5; i++) emit!(i, []);

    const dp = director.getState().demoPlayback;
    expect(director.getState().phase).toBe('awaiting-user');
    expect(dp).not.toBeNull();
    expect(dp!.frames.map((f) => f.demoTickOffset)).toEqual([0, 1, 2, 3, 4, 5]);
    expect(dp!.frames.map((f) => f.engineTick)).toEqual([0, 1, 2, 3, 4, 5]);
    expect(dp!.durationMs).toBe(3000);
    expect(dp!.playheadMs).toBe(3000);
    expect(dp!.isPlaying).toBe(false);
    expect(dp!.speed).toBe(1);
    expect(dp!.cues).toHaveLength(1);
    expect(dp!.mode).toBe('review');
    expect(dp!.frontierMs).toBe(3000);

    director.stepDemoBack();
    expect(director.getState().demoPlayback?.playheadMs).toBe(2400);
    for (let i = 0; i < 10; i++) director.stepDemoBack();
    expect(director.getState().demoPlayback?.playheadMs).toBe(0);

    director.stepDemoForward();
    expect(director.getState().demoPlayback?.playheadMs).toBe(600);
    for (let i = 0; i < 10; i++) director.stepDemoForward();
    expect(director.getState().demoPlayback?.playheadMs).toBe(3000);

    director.seekDemo(1500);
    expect(director.getState().demoPlayback?.playheadMs).toBe(1500);
    expect(director.demoPlayheadStore.getSnapshot()).toBe(1500);
    director.playDemo();
    expect(director.getState().demoPlayback?.isPlaying).toBe(true);
    // A sub-tick advance glides the per-frame store WITHOUT re-rendering React:
    // demoPlayback.playheadMs (which drives the demonstrated frame + App render)
    // stays put until the integer tick index changes. This is the perf contract —
    // the autoplay RAF must not setState every frame.
    director.advanceDemoPlayhead(100);
    expect(director.demoPlayheadStore.getSnapshot()).toBe(1600);
    expect(director.getState().demoPlayback?.playheadMs).toBe(1500);
    director.advanceDemoPlayhead(500);
    expect(director.demoPlayheadStore.getSnapshot()).toBe(2100);
    expect(director.getState().demoPlayback?.playheadMs).toBe(2100);
    director.advanceDemoPlayhead(5000);
    expect(director.getState().demoPlayback?.playheadMs).toBe(3000);
    expect(director.demoPlayheadStore.getSnapshot()).toBe(3000);
    expect(director.getState().demoPlayback?.isPlaying).toBe(false);
    director.seekDemo(-100);
    expect(director.getState().demoPlayback?.playheadMs).toBe(0);

    director.next();
    expect(director.getState().demoPlayback).toBeNull();
  });

  it('normalizes cursor cue ticks to demo-local for review (subtracts the fast-forward start tick)', async () => {
    let emit: ((tick: number, events: { type: string }[]) => void) | null = null;
    let snapTick = 5; // simulate fast-forward: the demo begins at engine tick 5
    const director = new TutorialDirector(
      buildAdapter({
        getState: () => demoState(snapTick++),
        subscribeTickAdvance: vi.fn((cb) => {
          emit = cb;
          return () => {
            emit = null;
          };
        }),
      }),
    );
    director.start({
      ...demoTutorial,
      steps: [
        {
          kind: 'demo',
          title: 'Watch',
          body: 'b',
          scriptedActions: [],
          stopAtTickOffset: 15,
          cursor: {
            cues: [
              { time: { kind: 'ms', ms: 900 }, target: { kind: 'selector', selector: '#book' } },
              { time: { kind: 'tick', tick: 10 }, target: { kind: 'selector', selector: '#magic' } },
              { time: { kind: 'tick', tick: 17 }, target: { kind: 'selector', selector: '#range' } },
            ],
          },
        },
      ],
    });
    await wait();
    expect(emit).not.toBeNull();
    for (let i = 1; i <= 15; i++) emit!(i, []);
    const cues = director.getState().demoPlayback!.cues;
    expect(cues[0].time).toEqual({ kind: 'ms', ms: 900 });
    expect(cues[1].time).toEqual({ kind: 'tick', tick: 5 });
    expect(cues[2].time).toEqual({ kind: 'tick', tick: 12 });
  });
});

describe('TutorialDirector fast-forward-ticks action', () => {
  it('delegates a fast-forward-ticks encounter-control action to adapter.fastForwardTicks', async () => {
    const fastForwardTicks = vi.fn();
    const adapter: TutorialDirectorAdapter = {
      enterEncounter: vi.fn(),
      enterLobby: vi.fn(),
      resetEncounter: vi.fn(),
      setMechanics: vi.fn(),
      activateTilePreset: vi.fn(),
      deactivateTilePresets: vi.fn(),
      pauseSim: vi.fn(),
      resumeSim: vi.fn(),
      setTickScale: vi.fn(),
      injectAction: vi.fn(),
      setTargetTile: vi.fn(),
      castMarkOfDarkness: vi.fn(),
      executeEncounterCommand: vi.fn(() => true),
      getSettledEncounterKind: () => 'yama_p3',
      getState: () => demoState(),
      getPlayerPosition: () => [31, 37],
      fastForwardTicks,
      subscribeTickAdvance: () => () => undefined,
    };
    const tutorial: Tutorial = {
      id: 'test-fast-forward-ticks',
      title: 'Test',
      description: 'fast-forward-ticks delegates to the adapter.',
      surface: 'encounter',
      steps: [
        {
          kind: 'encounter-control',
          title: 'Seek',
          actions: [{ type: 'fast-forward-ticks', toTick: 8 }],
          autoAdvance: false,
        },
        { kind: 'info', title: 'Next', body: 'done.' },
      ],
    };
    const director = new TutorialDirector(adapter);
    director.start(tutorial);
    await wait();
    expect(fastForwardTicks).toHaveBeenCalledWith(8);
  });
});

describe('TutorialDirector.reportDemoTargetMissing', () => {
  function buildDemoAdapter(): TutorialDirectorAdapter {
    return {
      enterEncounter: vi.fn(),
      enterLobby: vi.fn(),
      resetEncounter: vi.fn(),
      setMechanics: vi.fn(),
      activateTilePreset: vi.fn(),
      deactivateTilePresets: vi.fn(),
      pauseSim: vi.fn(),
      resumeSim: vi.fn(),
      setTickScale: vi.fn(),
      injectAction: vi.fn(),
      setTargetTile: vi.fn(),
      castMarkOfDarkness: vi.fn(),
      executeEncounterCommand: vi.fn(() => true),
      getSettledEncounterKind: () => 'yama_p3',
      getState: () => demoState(),
      getPlayerPosition: () => [31, 37],
      fastForwardTicks: vi.fn(),
      subscribeTickAdvance: () => () => undefined,
    };
  }

  function demoTutorial(): Tutorial {
    return {
      id: 'demo-missing-target',
      title: 'Demo Missing Target',
      description: 'Verifies a missing required cursor target fails the step.',
      surface: 'encounter',
      steps: [{ kind: 'demo', title: 'Watch', body: 'b', scriptedActions: [], resetBefore: false }],
    };
  }

  it('fails the running demo step when a required target is missing', async () => {
    const adapter = buildDemoAdapter();
    const director = new TutorialDirector(adapter);
    director.start(demoTutorial());
    await wait();

    expect(director.getState().phase).toBe('running');
    expect(director.getState().currentStep?.kind).toBe('demo');

    director.reportDemoTargetMissing('Protect from Magic');

    expect(director.getState().phase).toBe('failed');
    expect(director.getState().failPrompt).toContain('Protect from Magic');
    expect(adapter.pauseSim).toHaveBeenCalled();
  });

  it('is a no-op when the current step is not a demo', () => {
    const director = new TutorialDirector(buildDemoAdapter());
    director.start({
      id: 't',
      title: 'T',
      description: 'x',
      surface: 'encounter',
      steps: [{ kind: 'info', title: 'I', body: 'b' }],
    });
    expect(director.getState().currentStep?.kind).toBe('info');

    director.reportDemoTargetMissing('anything');

    expect(director.getState().phase).not.toBe('failed');
  });
});
