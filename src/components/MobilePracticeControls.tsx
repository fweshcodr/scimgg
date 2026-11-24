import { memo, useEffect, useMemo, useRef, useState } from 'react';
import type { EncounterCommand } from '../core/encounters/commands';
import type { DebugActionInfo, MechanicsToggleInfo } from '../core/encounters/types';
import type { SimulationEngine } from '../core/SimulationEngine';
import {
  type EncounterSetupRun,
  encounterSetupControlsForKind,
  encounterSetupStage,
  encounterSetupStartedWith,
} from '../encounters/practiceChrome';
import { RESET_BUTTON } from '../resourcePack';
import type { PracticeSessionState } from '../types/practiceSession';
import type { ReplayPracticeControls } from '../types/replayPractice';
import type { SetupContextControls } from '../types/setupContext';
import type { MechanicsConfig, SimulationState } from '../types/simulation';
import { BossHealthControl } from './BossHealthControl';
import { usePracticeControls } from './hudModel';
import { EncounterWorkbench } from './launcher/EncounterWorkbench';
import { useEncounterTool } from './launcher/useEncounterTool';
import {
  MechanicsSettings,
  orderDependentsUnderParents,
  partitionPracticeToggles,
  partitionToggleSections,
  useVisibleInPractice,
} from './MechanicsSettings';
import { PixelSprite } from './PixelSprite';
import { PracticeSessionBar } from './PracticeSessionBar';
import { PracticeRetryBar } from './ReplayPractice';
import { useResetToDefaults } from './ResetToDefaults';
import { InfoHint } from './ui/InfoHint';
import { OsrsButton } from './ui/OsrsButton';

export interface MobilePracticeControlsProps {
  readonly simulationState: SimulationState;
  readonly engine?: SimulationEngine;
  readonly mechanicsConfig: MechanicsConfig;
  readonly onMechanicsConfigChange: (config: MechanicsConfig) => void;
  /** Whether these options can be reset to their defaults, and the reset (`SetupContextControls`). */
  readonly setupContext?: SetupContextControls;
  readonly mechanicsToggles: readonly MechanicsToggleInfo[];
  readonly debugActions: readonly DebugActionInfo[];
  readonly onExecuteEncounterCommand: (command: EncounterCommand) => void;
  /** The running encounter's selected loadout for setup links (`EncounterToolProps.exportGear`). */
  readonly exportEncounterGear?: () => string;
  /** The encounter tool opening and closing, to hold the fight under it (`useEncounterTool`). */
  readonly onEncounterToolOpenChange?: (open: boolean) => void;
  readonly onSetBossHp: (hp: number) => void;
  readonly onApplyBossHpPreset?: (hp: number) => void;
  readonly onRestart?: () => void;
  readonly replayPractice?: ReplayPracticeControls;
  /** The encounter's own session (Inferno's wave restarts), shown while replay practice is not. */
  readonly encounterSession?: PracticeSessionState | null;
}

const Settings = memo(MechanicsSettings);
const NO_TOGGLES: readonly MechanicsToggleInfo[] = [];
const NO_ACTIONS: readonly DebugActionInfo[] = [];
// Page id for the encounter's own setup control (practiceChrome).
const ENCOUNTER_SETUP = 'encounter-setup';

interface ToggleGroup {
  readonly id: string;
  readonly label: string;
  toggles: readonly MechanicsToggleInfo[];
}

/** The compact mobile slot is a page of controls, never the desktop settings list squeezed down. */
export function MobilePracticeControls(props: MobilePracticeControlsProps) {
  const encounterTool = useEncounterTool(props);
  const practice = usePracticeControls(props);
  const session = props.replayPractice?.startTick != null ? props.replayPractice : null;
  // Replay practice owns the session page while it is active, so the two never show together.
  const encounterSession = session ? null : (props.encounterSession ?? null);
  const { mechanicsConfig, onMechanicsConfigChange, onExecuteEncounterCommand } = props;
  const encounter = props.simulationState.encounter;
  const setupControls = encounterSetupControlsForKind(encounter.kind);
  // Held here rather than on the list page, so visiting a group keeps a pending Undo.
  const resetToDefaults = useResetToDefaults(props.setupContext, encounter.kind);
  // Primitives only, so the run (and every page memoized on it) changes when the stage does, not
  // with each tick's snapshot.
  const runStage = encounterSetupStage(encounter);
  const runStartedWith = encounterSetupStartedWith(encounter);
  const setupRun = useMemo<EncounterSetupRun | undefined>(
    () =>
      runStage === null
        ? undefined
        : { stage: runStage, startedWith: runStartedWith, execute: onExecuteEncounterCommand },
    [runStage, runStartedWith, onExecuteEncounterCommand],
  );
  const setupProps = useMemo(
    () => ({
      config: mechanicsConfig,
      onChange: onMechanicsConfigChange,
      surface: 'practice' as const,
      run: setupRun,
    }),
    [mechanicsConfig, onMechanicsConfigChange, setupRun],
  );
  // Rendered once per input change, not per tick: an element React has seen before is not redrawn.
  const encounterSetup = useMemo(() => setupControls?.render(setupProps) ?? null, [setupControls, setupProps]);
  const practiceContext = { config: mechanicsConfig, stage: runStage ?? undefined, encounterSnapshot: encounter };
  const debugActions = useVisibleInPractice(props.debugActions, practiceContext);
  const visibleToggles = useVisibleInPractice(practice.inFightMechanicsToggles, practiceContext);
  const [selected, setSelected] = useState(session ? 'session' : 'health');
  const [picking, setPicking] = useState(false);
  const groupHeadRef = useRef<HTMLDivElement>(null);
  const sessionTick = session?.startTick;
  useEffect(() => {
    if (sessionTick != null) {
      setSelected('session');
      setPicking(false);
    }
  }, [sessionTick]);

  const { setupGroups, optionGroups } = useMemo(() => {
    // The encounter's own control owns its keys.
    const toggles = visibleToggles.filter((toggle) => !setupControls?.keys.includes(toggle.key));
    const { unsectioned, sections } = partitionToggleSections(toggles);
    const { setup, mechanics, assists } = partitionPracticeToggles(unsectioned);
    const setupChoices: ToggleGroup[] = [];
    // Keep parent/dependent controls together so their enabled state has the same owner as desktop.
    for (const toggle of setup) {
      const parent = toggle.dependsOn ? setupChoices.find((group) => group.id === toggle.dependsOn) : undefined;
      if (parent) parent.toggles = [...parent.toggles, toggle];
      else setupChoices.push({ id: toggle.key, label: toggle.compactLabel ?? toggle.label, toggles: [toggle] });
    }
    const options: ToggleGroup[] = [];
    if (mechanics.length) options.push({ id: 'mechanics', label: 'Mechanics', toggles: mechanics });
    // A named part of the fight follows the boss's unnamed mechanics, pickers last, as on desktop.
    for (const section of sections) {
      options.push({
        id: `section:${section.title}`,
        label: section.title,
        toggles: orderDependentsUnderParents([
          ...section.toggles.filter((toggle) => !toggle.choices?.length),
          ...section.toggles.filter((toggle) => toggle.choices?.length),
        ]),
      });
    }
    if (assists.length) options.push({ id: 'aids', label: 'Practice aids', toggles: assists });
    return { setupGroups: setupChoices, optionGroups: options };
  }, [visibleToggles, setupControls]);
  const groups = [...setupGroups, ...optionGroups];
  // Desktop's order: the session, the boss, the fight's setup (the encounter's own control first),
  // then what desktop folds into Options, then commands.
  const entries = [
    ...(session || encounterSession ? [{ id: 'session', label: 'Practice session' }] : []),
    ...(practice.bossNpc ? [{ id: 'health', label: 'Boss health' }] : []),
    // Phase presets act on the boss, so they wait for one (Zuk's arrive with him on wave 69).
    ...(practice.bossNpc && practice.bossHpPresets?.length ? [{ id: 'phases', label: 'Jump to phase' }] : []),
    ...(encounterSetup !== null && setupControls
      ? [{ id: ENCOUNTER_SETUP, label: setupControls.practiceSection ?? setupControls.railSection }]
      : []),
    ...setupGroups,
    ...optionGroups,
    ...(debugActions.length ? [{ id: 'actions', label: 'Actions' }] : []),
    ...(props.onRestart ? [{ id: 'restart', label: 'Restart fight' }] : []),
  ];
  const current = entries.find((entry) => entry.id === selected) ?? entries[0];
  const group = groups.find((entry) => entry.id === current?.id);
  const singleChoice = group?.toggles.length === 1 && group.toggles[0].choices?.length ? group.toggles[0] : null;
  if (!current) return <p className="osm-tools__note">Nothing to practice here.</p>;

  const contentClass = [
    'osm-tools__practice-content',
    !picking && singleChoice && 'osm-tools__practice-content--single-choice',
    !picking && current.id === 'session' && 'osm-tools__practice-content--session',
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <div className="osm-tools__practice" data-tutorial-input-surface="gameplay">
      <div
        ref={groupHeadRef}
        className={`osm-tools__group-head${!picking && singleChoice?.info ? ' info-hint-region' : ''}`}
      >
        {picking ? (
          <h2 className="osm-tools__practice-title">Practice</h2>
        ) : (
          <button
            type="button"
            tabIndex={-1}
            className="osm-tools__practice-back"
            aria-label="Back to Practice"
            onClick={() => setPicking(true)}
          >
            <span className="osm-tools__practice-back-link">
              <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true">
                <path d="m7 2-4 4 4 4" fill="none" stroke="currentColor" strokeWidth="1.5" />
              </svg>
              <span>Practice</span>
            </span>
            <span>{current.id === 'session' ? 'Session' : current.label}</span>
          </button>
        )}
        {!picking && singleChoice?.info && (
          <InfoHint label={singleChoice.label} text={singleChoice.info} hoverRegionRef={groupHeadRef} />
        )}
      </div>
      <div className={contentClass} key={picking ? 'picker' : current.id}>
        {picking ? (
          <div className="osm-tools__groups">
            {encounterTool.definition && (
              <button
                type="button"
                tabIndex={-1}
                disabled={!!encounterTool.disabledReason}
                onClick={encounterTool.toggle}
              >
                <span>{encounterTool.definition.label}</span>
                <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true">
                  <path d="m5 2 4 4-4 4" fill="none" stroke="currentColor" strokeWidth="1.5" />
                </svg>
              </button>
            )}
            {entries.map((entry) => (
              <button
                type="button"
                tabIndex={-1}
                key={entry.id}
                onClick={() => {
                  setSelected(entry.id);
                  setPicking(false);
                }}
              >
                <span>{entry.label}</span>
                <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true">
                  <path d="m5 2 4 4-4 4" fill="none" stroke="currentColor" strokeWidth="1.5" />
                </svg>
              </button>
            ))}
            {/* An action, not a destination: the reset glyph where the others have a chevron, and
                once pressed the whole row is its Undo. */}
            {resetToDefaults.state === 'available' && (
              <button type="button" tabIndex={-1} className="osm-tools__reset" onClick={resetToDefaults.reset}>
                <span>Reset to defaults</span>
                <PixelSprite src={RESET_BUTTON.enabled} width={15} height={14} alt="" aria-hidden="true" />
              </button>
            )}
            {resetToDefaults.state === 'restored' && (
              <button
                type="button"
                tabIndex={-1}
                className="osm-tools__reset osm-tools__reset--restored"
                aria-label="Undo reset to defaults"
                onClick={resetToDefaults.undo}
              >
                <span role="status">Defaults restored</span>
                <span className="osm-tools__undo">Undo</span>
              </button>
            )}
          </div>
        ) : current.id === 'session' && session ? (
          <PracticeRetryBar controls={session} presentation="compact" className="osm-tools__session" />
        ) : current.id === 'session' && encounterSession ? (
          <PracticeSessionBar session={encounterSession} presentation="compact" className="osm-tools__session" />
        ) : current.id === 'health' && practice.bossNpc ? (
          <BossHealthControl targetNpc={practice.bossNpc} onSetBossHp={props.onSetBossHp} />
        ) : current.id === 'phases' && practice.bossNpc ? (
          <div className="osm-tools__phases">
            <BossHealthControl
              targetNpc={practice.bossNpc}
              onSetBossHp={props.onSetBossHp}
              onApplyPreset={props.onApplyBossHpPreset}
              presets={practice.bossHpPresets}
            />
          </div>
        ) : current.id === ENCOUNTER_SETUP ? (
          encounterSetup
        ) : current.id === 'restart' ? (
          <div className="osm-tools__restart">
            <p>Restart this fight with the current setup.</p>
            <OsrsButton fullWidth variant="primary" onClick={props.onRestart} disabled={session?.busy}>
              Restart fight
            </OsrsButton>
          </div>
        ) : (
          // No run snapshot: Mobile filters before Settings, and a per-tick prop would defeat the memo.
          <Settings
            config={props.mechanicsConfig}
            onConfigChange={props.onMechanicsConfigChange}
            mechanicsToggles={group?.toggles ?? NO_TOGGLES}
            debugActions={current.id === 'actions' ? debugActions : NO_ACTIONS}
            onExecuteEncounterCommand={props.onExecuteEncounterCommand}
            // The run's stage, so a row's own "applies later" note reads the fight being played.
            setupRun={setupRun}
          />
        )}
      </div>
      {encounterTool.mounted && encounterTool.definition && (
        <EncounterWorkbench
          key={encounter.kind}
          title={encounterTool.definition.label}
          open={encounterTool.open}
          onClose={encounterTool.close}
        >
          {encounterTool.content}
        </EncounterWorkbench>
      )}
      {!picking && current.id === 'health' && !session && props.onRestart && (
        <div className="osm-tools__quick-restart">
          <OsrsButton fullWidth onClick={props.onRestart}>
            Restart fight
          </OsrsButton>
        </div>
      )}
    </div>
  );
}
