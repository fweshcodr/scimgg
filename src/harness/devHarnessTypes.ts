import type { EncounterModifierSelection } from '../core/encounters/encounterFactory';
import type { SimulationEngine } from '../core/SimulationEngine';
import type { GamePanelTab } from '../hooks/keybindStore';
import type { PersistedSettings } from '../hooks/usePersistedSettings';
import type { EncounterLoadout } from '../types/encounterLoadout';
import type { SimulationState } from '../types/simulation';

export type HarnessOutcome = 'death' | 'victory';

/**
 * The live App internals the dev UI harness drives.
 *
 * App refreshes this every render behind an `import.meta.env.DEV` guard and
 * hands the *ref* over once loaded, so the harness always calls today's
 * callbacks instead of ones captured at boot. Everything here is type-only:
 * production never imports this module, and the guard folds the assignment
 * away, so no harness code reaches a shipped bundle.
 */
export interface DevHarnessSource {
  engine: SimulationEngine;
  encounterKind: string;
  sceneKind: 'lobby' | 'loading' | 'encounter';
  /** Monotonic per scene load. The harness settles on a *change*, so re-entering the same kind still waits. */
  sceneLoadId: number;
  /** Committed value, so the harness can wait for a requested change to land before it ticks. */
  autoAdvance: boolean;
  /** `useSimulationWiring.fastForwardTicks`: completes the intro, records replay frames, publishes state. */
  fastForwardTo: (tick: number) => void;
  enterEncounter: (kind: string, loadout?: EncounterLoadout) => void;
  /** The lobby entry Return to Lobby and the `/` route use, without the exit fade or intro. */
  enterLobby: () => void;
  reset: () => void;
  setGamePanelTab: (tab: GamePanelTab) => void;
  setBossHp: (hp: number) => void;
  setAutoAdvance: (enabled: boolean) => void;
  /** Committed App state (a terminal QA fixture is authored here, not by mutating engine internals). */
  simulationState: SimulationState;
  replaying: boolean;
  /** Recorder identity changes on a whole-run reset even when the engine and tick are reused. */
  recordingIdentity: object;
  /** Named UI-only ending, with a genuine replay prefix and real restart/replay callbacks. */
  installTerminalFixture: (outcome: HarnessOutcome, practice: boolean, signal?: AbortSignal) => Promise<boolean>;
  /**
   * The handlers App's own buttons, menu items and hotkeys call to open its UI, so a harness
   * surface opens the way a player opens it. Each is the existing handler, not new state.
   */
  ui: {
    setSettingsOpen: (open: boolean) => void;
    setPluginsOpen: (open: boolean) => void;
    openEncounterPicker: () => void;
    openQuickSearch: () => void;
    openTutorialPicker: () => void;
    openShortcuts: () => void;
    openCredits: () => void;
    openCacheExplorer: () => void;
    /** The Modifiers launcher; a no-op for an encounter without run modifiers. */
    openModifiers: () => void;
    /** The encounter picker's Configure; an optional dev-only selection is then saved as an ordinary modifier edit. */
    configureEncounter: (
      kind: string,
      displayName: string,
      description: string,
      modifierSelection?: EncounterModifierSelection,
    ) => void;
    /** Training's start path, which routes to the tutorial's own scene. */
    startTutorial: (id: string) => void;
    /** The quick-prayer orb's press. */
    toggleQuickPrayers: () => void;
    updateSetting: <K extends keyof PersistedSettings>(key: K, value: PersistedSettings[K]) => void;
  };
}

export interface DevHarnessBoot {
  /** Fired once, when the app is fully loaded. The ref stays live for the page's lifetime. */
  onReady: (source: { readonly current: DevHarnessSource | null }) => void;
  /**
   * Keep the router off the address in both directions. The UI harness page sets it:
   * `/ui-harness.html?…` is not a route, and syncing it would make a reload boot the full app.
   * App tests that drive routing through this seam leave it unset.
   */
  readonly fixedAddress?: boolean;
}
