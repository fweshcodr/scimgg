import type { EncounterModifierSelection } from '../../core/encounters/encounterFactory';
import type { SimulationEngine } from '../../core/SimulationEngine';
import { resolveEncounterEntry } from '../../encounters/modules';
import { ALL_ENCOUNTER_KINDS, encounterRegistry } from '../../encounters/registry';
import type { GamePanelTab } from '../../hooks/keybindStore';
import { setMobileLayoutEditing } from '../../layout/mobileLayoutEdit';
import { getTutorialById, getTutorialTargetEncounter, TUTORIAL_REGISTRY } from '../../tutorial/content';
import { isSpotlightOnlyTutorial } from '../../tutorial/types';
import type { SimulationState } from '../../types/simulation';
import { setDeviceMode } from '../../util/deviceMode';
import type { DevHarnessSource, HarnessOutcome } from '../devHarnessTypes';
import { resolveHarnessLoadout } from './harnessLoadout';
import { type HarnessOptions, opensTerminalFixture, surfaceRequests } from './harnessOptions';
import {
  HARNESS_SURFACES,
  type HarnessSurface,
  type HarnessSurfaceEntry,
  isBootSurface,
  isTerminalSurface,
  type LiveHarnessSurface,
  parseSurfaceList,
  parseSurfaceRequest,
} from './harnessSurfaces';

/** Imperative surface the harness exposes to Playwright via `window.uiHarness`. */
export interface HarnessControls {
  /** Advance the simulation by `count` ticks; returns the new tick. */
  tick(count?: number): number;
  /** Start/stop the real-time tick loop. Resolves once the change has landed in the app. */
  setAutoAdvance(enabled: boolean): Promise<void>;
  /** Load an encounter, seeded with a real preset loadout. Resolves when the scene has settled. */
  enterEncounter(encounterKind: string, presetKey?: string): Promise<void>;
  /** Rebuild the current encounter from tick 0, keeping the preset it was entered with. */
  reset(): Promise<void>;
  /** Open a game panel tab. */
  setGamePanelTab(tab: GamePanelTab): void;
  /** Set the boss's current HP (the same control Practice's Fight Setup uses). */
  setBossHp(hp: number): void;
  /** Live simulation state, for assertions. */
  getState(): SimulationState;
  /** The live engine, for anything the calls above do not cover. */
  getEngine(): SimulationEngine;
  /** Currently mounted encounter kind. */
  getEncounterKind(): string;
  /** Install one named terminal UI fixture; never accepts arbitrary simulation state. */
  showOutcome(outcome: HarnessOutcome, practice?: boolean, signal?: AbortSignal): Promise<void>;
  /**
   * Open a UI surface by name (harnessSurfaces.ts), `name` or `name:arg`, the way a player reaches
   * it, and resolve once it is on screen. Boot-only surfaces (the GPU ones) throw: load the page
   * with `?open=<surface>`. `signal` cancels it, side effects and all, between its steps.
   */
  open(surface: string, signal?: AbortSignal): Promise<void>;
}

/** A surface that changes scene (a lesson, an arrival) can take a few hundred ms past its handler. */
const OPEN_TIMEOUT_MS = 8000;

type SourceRef = { readonly current: DevHarnessSource | null };

function read(sourceRef: SourceRef): DevHarnessSource {
  const source = sourceRef.current;
  if (!source) throw new Error('UI harness is not ready yet — wait for document.body.dataset.harnessReady');
  return source;
}

/**
 * Poll until `predicate` holds. App state lands over several React commits. An aborted `signal`
 * stops the wait quietly; the caller checks it before doing anything else.
 */
async function waitFor(
  predicate: () => boolean,
  description: string,
  timeoutMs = 5000,
  signal?: AbortSignal,
): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (!predicate()) {
    if (signal?.aborted) return;
    if (Date.now() > deadline) throw new Error(`UI harness timed out waiting for ${description}`);
    await new Promise((resolve) => setTimeout(resolve, 16));
  }
}

/**
 * Adapt App's live internals into the Playwright-facing API. Everything here
 * routes through App's own callbacks, so a harness action takes exactly the
 * path a user action would.
 */
export function createHarnessControls(
  sourceRef: SourceRef,
  setup: { preset?: string; onAction?: () => void; modifierSelection?: EncounterModifierSelection } = {},
): HarnessControls {
  // Remembered so reset() reproduces the screen the harness actually set up.
  // App's own reset reloads the loadout from the per-encounter store, which the
  // harness never writes to — it passes its preset as a one-shot override.
  let activePresetKey = setup.preset ?? 'first';
  let initialModifierSelection = setup.modifierSelection;
  let pendingFixture: AbortController | null = null;
  const onAction = () => {
    setup.onAction?.();
    pendingFixture?.abort();
  };

  const setAutoAdvance = async (enabled: boolean, signal?: AbortSignal): Promise<void> => {
    read(sourceRef).setAutoAdvance(enabled);
    await waitFor(() => read(sourceRef).autoAdvance === enabled, `auto-advance to become ${enabled}`, 5000, signal);
  };

  const enterEncounter = async (encounterKind: string, presetKey = 'first', signal?: AbortSignal): Promise<void> => {
    // App logs and ignores an unknown kind, which would surface here as an
    // unexplained settle timeout. Fail on the actual mistake instead.
    // An alias kind (`zuk`) enters the encounter that owns it, as the app's own entry does.
    const entry = resolveEncounterEntry(encounterKind);
    if (!entry || !encounterRegistry.hasKind(entry.kind)) {
      throw new Error(
        `Unknown encounter kind '${encounterKind}'. Registered: ${encounterRegistry.getRegisteredKinds().join(', ')}`,
      );
    }
    const sceneKind = entry.kind;
    activePresetKey = presetKey;
    const source = read(sourceRef);
    // Read now: the source's fields may be live.
    const { sceneLoadId: previousSceneLoadId, engine: previousEngine } = source;
    // The lobby is entered as Return to Lobby enters it, never as an encounter of kind 'lobby'. It
    // has no load step, so a fresh engine is what marks it entered, even from the lobby.
    if (sceneKind === 'lobby') source.enterLobby();
    else source.enterEncounter(encounterKind, resolveHarnessLoadout(sceneKind, presetKey) ?? undefined);

    // Entry runs loading → encounter across several commits. Keying on
    // sceneLoadId rather than the kind means re-entering the CURRENT encounter
    // still waits for the new scene instead of returning on the stale one.
    await waitFor(
      () => {
        const current = read(sourceRef);
        if (sceneKind === 'lobby') return current.sceneKind === 'lobby' && current.engine !== previousEngine;
        return (
          current.sceneLoadId !== previousSceneLoadId &&
          current.sceneKind === 'encounter' &&
          current.encounterKind === sceneKind
        );
      },
      `encounter '${encounterKind}' to load`,
      5000,
      signal,
    );
    if (signal?.aborted) return;

    // The scene-transition overlay fades over 300ms on top of everything, so a
    // screenshot taken the moment the state settles catches a black wash.
    await waitFor(
      () => document.querySelector('.transition-overlay') === null,
      'the scene transition overlay to clear',
      5000,
      signal,
    );
  };

  const showOutcome = async (outcome: HarnessOutcome, practice = false, signal?: AbortSignal): Promise<void> => {
    if (signal?.aborted) return;
    if (!isTerminalSurface(outcome)) throw new Error(`Unknown terminal UI fixture '${outcome}'`);
    const controller = new AbortController();
    pendingFixture = controller;
    const cancel = () => controller.abort();
    signal?.addEventListener('abort', cancel, { once: true });
    try {
      await setAutoAdvance(false);
      if (controller.signal.aborted) return;
      const source = read(sourceRef);
      if (!(await source.installTerminalFixture(outcome, practice, controller.signal))) return;
      await waitFor(() => {
        const state = read(sourceRef).simulationState;
        return (
          controller.signal.aborted ||
          (outcome === 'death' ? state.failedCondition !== null : state.encounterOutcome.phase === 'victory')
        );
      }, `terminal UI fixture '${outcome}'`);
    } finally {
      signal?.removeEventListener('abort', cancel);
      if (pendingFixture === controller) pendingFixture = null;
    }
  };

  const encounterSource = (surface: LiveHarnessSurface): DevHarnessSource => {
    const source = read(sourceRef);
    if (source.sceneKind !== 'encounter') {
      throw new Error(`'${surface}' needs an encounter; the harness is in the ${source.sceneKind}`);
    }
    return source;
  };
  const ui = () => read(sourceRef).ui;
  // Settings that turn an overlay on, the way its Plugins or Settings toggle does.
  const enable = (
    key:
      | 'showDetailedDps'
      | 'prayerFlickEnabled'
      | 'statusBarsEnabled'
      | 'showFps'
      | 'showTickTiming'
      | 'showSoundDebug'
      | 'showModifierKeys',
  ) => ui().updateSetting(key, true);
  /** Press a control the way a click does; `what` names it when it is not there. */
  const press = (selector: string, what: string) => {
    const element = document.querySelector<HTMLElement>(selector);
    if (!element) throw new Error(`There is no ${what} on screen`);
    element.click();
  };
  /** A desktop top-chrome launcher, unless its pane is already the one open. */
  const pressLauncher = (glyph: string, surface: HarnessSurface) => {
    if (HARNESS_SURFACES[surface].find()) return;
    press(`nav[aria-label="Game menu"] [data-launcher="${glyph}"]`, `${glyph} launcher in this encounter`);
  };

  // The Replay launcher appears with the run's first recorded tick.
  const openReplay = async (signal?: AbortSignal) => {
    encounterSource('replay');
    if (HARNESS_SURFACES.replay.find()) return;
    if (!read(sourceRef).engine.getState().currentTick) read(sourceRef).fastForwardTo(1);
    await waitFor(
      () => document.querySelector('[data-launcher="replay"]') !== null,
      'the Replay launcher',
      5000,
      signal,
    );
    if (!signal?.aborted) pressLauncher('replay', 'replay');
  };

  // Training's own start, which routes to the lesson's scene: by default the first lesson for this
  // encounter (else any), or the first spotlight tour.
  const startTutorial = (surface: 'tutorial' | 'tour', id: string | undefined) => {
    const spotlight = surface === 'tour';
    const kind = read(sourceRef).encounterKind;
    const candidates = TUTORIAL_REGISTRY.filter((tutorial) => isSpotlightOnlyTutorial(tutorial) === spotlight);
    const chosen =
      id ?? (candidates.find((tutorial) => getTutorialTargetEncounter(tutorial) === kind) ?? candidates[0])?.id;
    const tutorial = chosen ? getTutorialById(chosen) : undefined;
    if (!tutorial || isSpotlightOnlyTutorial(tutorial) !== spotlight) {
      throw new Error(
        `'${chosen}' is not a ${spotlight ? 'spotlight tour' : 'lesson'}. Known: ${candidates.map((t) => t.id).join(', ')}`,
      );
    }
    ui().startTutorial(tutorial.id);
  };

  // Typed by the surface list: a new live surface does not compile until it has its route here.
  // Each runs App's own handler; `open` then waits for the surface to be on screen. A route with
  // more than one step checks `signal` before each later one, so a canceled boot changes nothing
  // more (`stopped`).
  type Route = (arg: string | undefined, signal: AbortSignal | undefined) => void | Promise<void>;
  const stopped = (signal: AbortSignal | undefined) => signal?.aborted === true;
  const liveRoutes: Record<LiveHarnessSurface, Route> = {
    // The terminal fixtures (terminalFixtures.ts): the deterministic Yama ending `?outcome=`
    // installs, so base `yama_p3` only. `practice` comes from `?practice=1` or `showOutcome`.
    death: (_, signal) => showOutcome('death', false, signal),
    victory: (_, signal) => showOutcome('victory', false, signal),
    settings: () => ui().setSettingsOpen(true),
    plugins: () => ui().setPluginsOpen(true),
    menu: () => pressLauncher('menu', 'menu'),
    practice: () => pressLauncher('practice', 'practice'),
    actions: () => pressLauncher('actions', 'actions'),
    replay: (_, signal) => openReplay(signal),
    'encounter-picker': () => ui().openEncounterPicker(),
    'encounter-panel': (arg) => {
      const current = read(sourceRef).encounterKind;
      const kind = arg ?? (current === 'lobby' ? 'yama_p3' : current);
      const descriptor = encounterRegistry.getDescriptorForKind(kind);
      if (!descriptor || kind === 'lobby') throw new Error(`'${kind}' is not an encounter with a panel`);
      ui().configureEncounter(kind, descriptor.displayName, descriptor.description ?? '', initialModifierSelection);
      initialModifierSelection = undefined;
    },
    modifiers: () => {
      const kind = encounterSource('modifiers').encounterKind;
      if (!encounterRegistry.getDescriptorForKind(kind)?.modifiers?.length) {
        const withModifiers = ALL_ENCOUNTER_KINDS.filter(
          (k) => encounterRegistry.getDescriptorForKind(k)?.modifiers?.length,
        );
        throw new Error(`'${kind}' has no run modifiers. Encounters with them: ${withModifiers.join(', ')}`);
      }
      ui().openModifiers();
    },
    'quick-search': () => ui().openQuickSearch(),
    training: () => ui().openTutorialPicker(),
    shortcuts: () => ui().openShortcuts(),
    credits: () => ui().openCredits(),
    'cache-explorer': () => ui().openCacheExplorer(),
    tutorial: (id) => startTutorial('tutorial', id),
    tour: (id) => startTutorial('tour', id),
    // A fresh entry into the current encounter plays its arrival again.
    'title-card': (_, signal) => enterEncounter(encounterSource('title-card').encounterKind, activePresetKey, signal),
    // The countdown counts down to a real-time start, so it needs the live loop, which it leaves on:
    // the fight starts when the count ends. It can come and go while the entry's transition overlay
    // is still fading, so it is watched from the start rather than looked for afterwards.
    countdown: async (_, signal) => {
      const kind = encounterSource('countdown').encounterKind;
      ui().updateSetting('fightStartCountdown', true);
      await setAutoAdvance(true, signal);
      if (stopped(signal)) return;
      let seen = false;
      const watch = setInterval(() => {
        seen ||= HARNESS_SURFACES.countdown.find() !== null;
      }, 16);
      try {
        await enterEncounter(kind, activePresetKey, signal);
        if (stopped(signal)) return;
        await waitFor(
          () => seen || HARNESS_SURFACES.countdown.find() !== null,
          'the fight-start countdown',
          5000,
          signal,
        );
      } finally {
        clearInterval(watch);
      }
    },
    // The quick-prayer orb pressed with no quick prayers chosen.
    'hint-toast': () => ui().toggleQuickPrayers(),
    // Alt held, as the keyboard holds it; nothing releases it until a real keyup or blur.
    'hint-bar': () => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Alt', code: 'AltLeft', altKey: true }));
    },
    // A locked resolution one step larger than the window each way.
    'viewport-size-warning': () =>
      ui().updateSetting('gameResolution', {
        mode: 'fixed',
        width: window.innerWidth + 200,
        height: window.innerHeight + 200,
        presetId: 'custom',
      }),
    'dps-overlay': () => enable('showDetailedDps'),
    'prayer-flick': () => enable('prayerFlickEnabled'),
    'status-bars': () => enable('statusBarsEnabled'),
    fps: () => enable('showFps'),
    // The readout reports real tick intervals, so it runs the live loop until it has some.
    // Canceled, it leaves the loop to whoever canceled it (a user turning it on must win).
    'tick-timing': async (_, signal) => {
      enable('showTickTiming');
      await setAutoAdvance(true, signal);
      try {
        if (!stopped(signal)) {
          await waitFor(() => HARNESS_SURFACES['tick-timing'].find() !== null, 'tick timing samples', 8000, signal);
        }
      } finally {
        if (!stopped(signal)) await setAutoAdvance(false);
      }
    },
    'sound-debug': () => enable('showSoundDebug'),
    'modifier-keys': () => enable('showModifierKeys'),
    // Settings' Device choice: Mobile, which gives the Mobile layout and its tool window.
    mobile: () => setDeviceMode('mobile'),
    // Settings' Edit layout button, which needs the Mobile layout under it.
    'mobile-edit-bar': async (_, signal) => {
      if (!HARNESS_SURFACES.mobile.find()) {
        await liveRoutes.mobile(undefined, signal);
        await waitFor(() => HARNESS_SURFACES.mobile.find() !== null, 'the Mobile layout', 5000, signal);
        if (stopped(signal)) return;
      }
      setMobileLayoutEditing(true);
    },
  };

  const open = async (request: string, signal?: AbortSignal): Promise<void> => {
    if (stopped(signal)) return;
    const { surface, arg } = parseSurfaceRequest(request);
    if (isBootSurface(surface)) {
      throw new Error(`'${surface}' is decided before the app mounts: load the page with ?open=${surface}`);
    }
    await liveRoutes[surface](arg, signal);
    if (stopped(signal)) return;
    // A transient surface's route waits for it itself: it may be gone again by now.
    const entry: HarnessSurfaceEntry = HARNESS_SURFACES[surface];
    if (!entry.transient) await waitFor(() => entry.find() !== null, `'${surface}' to open`, OPEN_TIMEOUT_MS, signal);
  };

  return {
    tick(count = 1) {
      onAction();
      const source = read(sourceRef);
      source.fastForwardTo(source.engine.getState().currentTick + count);
      return read(sourceRef).engine.getState().currentTick;
    },
    setAutoAdvance: (enabled) => {
      onAction();
      return setAutoAdvance(enabled);
    },
    enterEncounter: (kind, preset) => {
      onAction();
      return enterEncounter(kind, preset);
    },
    reset: () => {
      onAction();
      return enterEncounter(read(sourceRef).encounterKind, activePresetKey);
    },
    setGamePanelTab: (tab) => {
      onAction();
      read(sourceRef).setGamePanelTab(tab);
    },
    setBossHp: (hp) => {
      onAction();
      read(sourceRef).setBossHp(hp);
    },
    getState: () => read(sourceRef).simulationState,
    getEngine: () => read(sourceRef).engine,
    getEncounterKind: () => read(sourceRef).encounterKind,
    showOutcome: (outcome, practice, signal) => {
      onAction();
      return showOutcome(outcome, practice, signal);
    },
    open: (surface, signal) => {
      onAction();
      return open(surface, signal);
    },
  };
}

/**
 * Apply the URL options once the app hands over its bridge: settle the tick
 * loop, enter the requested encounter with its preset, advance the warm-up
 * ticks (or install the terminal fixture), open the requested surfaces, then the tab.
 *
 * Auto-advance is applied FIRST and unconditionally. The app always boots with
 * it enabled (it is deliberately never persisted), so a harness that only acted
 * on `?autoAdvance=1` would leave the real-time loop running underneath every
 * "deterministic" screen.
 */
export async function applyHarnessOptions(
  controls: HarnessControls,
  options: HarnessOptions,
  signal?: AbortSignal,
): Promise<void> {
  if (signal?.aborted) return;
  await controls.setAutoAdvance(false);
  if (signal?.aborted) return;
  if (options.encounter !== 'lobby') {
    await controls.enterEncounter(options.encounter, options.preset);
  }
  if (signal?.aborted) return;
  // `?outcome=death` is the `death` surface by another name, so it joins the list (first): naming it
  // in both is a duplicate, and beside `victory` a conflict. A terminal fixture stops at its own
  // tick, so it replaces the warm-up ticks and keeps auto-advance off. A combination the app cannot
  // show fails before anything opens; one whose later surface closed an earlier one (the app keeps
  // some modals exclusive) fails after.
  const requests = surfaceRequests(options);
  const surfaces = parseSurfaceList(requests);
  const terminal = opensTerminalFixture(options);
  if (!terminal && options.ticks > 0) controls.tick(options.ticks);
  for (const [index, { surface }] of surfaces.entries()) {
    if (signal?.aborted) return;
    // Boot surfaces were seeded before the app mounted (installHarnessEnvironment).
    if (isBootSurface(surface)) continue;
    if (isTerminalSurface(surface)) await controls.showOutcome(surface, options.practice, signal);
    else await controls.open(requests[index] ?? surface, signal);
  }
  if (signal?.aborted) return;
  // Every surface listed must still be up, terminal dialogs included: a fixture that stood down,
  // or a later surface that closed or replaced an earlier one, fails the boot.
  for (const { surface } of surfaces) {
    const entry: HarnessSurfaceEntry = HARNESS_SURFACES[surface];
    if (!entry.transient && !entry.find()) {
      throw new Error(`'${surface}' closed while the rest of ?open=${requests.join(',')} opened`);
    }
  }
  if (signal?.aborted) return;
  controls.setGamePanelTab(options.tab);
  if (options.autoAdvance && !terminal) await controls.setAutoAdvance(true);
}
