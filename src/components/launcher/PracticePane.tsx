import type React from 'react';
import { useCallback, useId, useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { EncounterCommand } from '../../core/encounters/commands';
import type { DebugActionInfo, EncounterSnapshot } from '../../core/encounters/types';
import type { SimulationEngine } from '../../core/SimulationEngine';
import {
  encounterSetupControlsForKind,
  encounterSetupStage,
  encounterSetupStartedWith,
} from '../../encounters/practiceChrome';
import type { SetupContextControls } from '../../types/setupContext';
import type { MechanicsConfig, SimulationState } from '../../types/simulation';
import { type PracticeControls, useHudReadouts } from '../hudModel';
import { MechanicsSettings, type PracticeGroupId } from '../MechanicsSettings';
import { type ResetToDefaults, ResetToDefaultsControl, useResetToDefaults } from '../ResetToDefaults';
import { useHoverCard } from '../ui/HoverCard';
import { OsrsButton } from '../ui/OsrsButton';
import '../PracticePanel.css';

export type PracticeTab = 'setup' | 'stats';

/** The pane's close mark, drawn rather than a glyph, so it needs no fallback font. */
export const CloseGlyph = () => (
  <svg viewBox="0 0 10 10" aria-hidden="true" focusable="false">
    <path d="M1 1 L9 9 M1 9 L9 1" />
  </svg>
);

const SECTION_LABELS: Partial<Record<PracticeGroupId, string>> = {
  fightSetup: 'Fight',
  mechanics: 'Mechanics',
  assists: 'Aids',
};

/** A named mechanics section is its own stop, under its own name. */
const sectionLabel = (id: PracticeGroupId): string | undefined =>
  id.startsWith('section:') ? id.slice('section:'.length) : SECTION_LABELS[id];

export interface PracticePaneProps {
  readonly onRestart?: () => void;
  /** Ctrl+R runs a session restart instead (a replay practice tick, or the encounter's), so Restart fight does not claim it. */
  readonly restartShortcutTargetsSession?: boolean;
  readonly restoring?: boolean;
  /** The tab chosen, remembered across closing; replay shows Stats without changing it. */
  readonly tab: PracticeTab;
  readonly onTabChange: (tab: PracticeTab) => void;
  readonly replaying: boolean;
  /** Absent when opened from an icon launcher: TopChrome's title row carries the close. */
  readonly onClose?: () => void;
  readonly engine?: SimulationEngine;
  readonly simulationState: SimulationState;
  readonly dpsProjection?: ReturnType<SimulationEngine['getAdjustedTheoreticalDps']>;
  readonly practice: PracticeControls;
  readonly mechanicsConfig: MechanicsConfig;
  readonly onMechanicsConfigChange: (config: MechanicsConfig) => void;
  /** Whether these options can be reset to their defaults, and the reset (`SetupContextControls`). */
  readonly setupContext?: SetupContextControls;
  readonly onSetBossHp: (hp: number) => void;
  readonly onApplyBossHpPreset?: (hp: number) => void;
  /**
   * The encounter's own command route. Setup uses it for the controls an encounter draws itself,
   * which can apply a choice to the run instead of only saving it for the next one.
   */
  readonly onExecuteEncounterCommand: (command: EncounterCommand) => void;
}

const REPLAY_SETUP_REASON = 'Setup is off while you watch a replay. Exit Replay to change the fight.';

/** The encounter's actions are TopChrome's Actions pane on desktop, never a group of Setup. */
const NO_ACTIONS: readonly DebugActionInfo[] = [];

/**
 * Practice: Setup (Fight Setup, then Mechanics and Aids under Options in one scrolling body) and Stats
 * (the fight's readouts). The pane around it (TopChrome) owns where it opens and how tall it may be.
 */
export const PracticePane: React.FC<PracticePaneProps> = ({
  tab,
  onTabChange,
  replaying,
  onClose,
  engine,
  simulationState,
  dpsProjection,
  practice,
  mechanicsConfig,
  onMechanicsConfigChange,
  setupContext,
  onSetBossHp,
  onApplyBossHpPreset,
  onExecuteEncounterCommand,
  onRestart,
  restartShortcutTargetsSession = false,
  restoring,
}) => {
  // Held by the pane, not the Setup body, so a look at Stats keeps a pending Undo.
  const resetToDefaults = useResetToDefaults(setupContext, simulationState.encounter.kind);
  // During playback the fight cannot change, so Setup is off and Stats follows the recording; the
  // chosen tab comes back when the replay ends.
  const shown: PracticeTab = replaying ? 'stats' : tab;
  // Why Setup is off, in the app's hover card rather than the browser's title tooltip.
  const setupRef = useRef<HTMLButtonElement>(null);
  const setupCardId = useId();
  const { card: setupCard } = useHoverCard({
    content: REPLAY_SETUP_REASON,
    anchorRef: setupRef,
    placement: 'block',
    cardId: setupCardId,
    // Launchers are aimed at on purpose: show the name at once.
    dwellMs: 0,
    cardClassName: 'hover-card--instant',
    openOnFocus: false,
    regionTouch: false,
  });
  return (
    <>
      <div className="launcher-pane__head">
        <div className="launcher-tabs">
          <button
            ref={setupRef}
            type="button"
            className={`launcher-tab${shown === 'setup' ? ' is-active' : ''}`}
            aria-pressed={shown === 'setup'}
            aria-disabled={replaying || undefined}
            aria-describedby={replaying ? setupCardId : undefined}
            onClick={() => {
              if (!replaying) onTabChange('setup');
            }}
          >
            Setup
          </button>
          {replaying && setupCard}
          <button
            type="button"
            className={`launcher-tab${shown === 'stats' ? ' is-active' : ''}`}
            aria-pressed={shown === 'stats'}
            onClick={() => onTabChange('stats')}
          >
            Stats
          </button>
        </div>
        {onClose && (
          <button type="button" className="launcher-pane__close" aria-label="Close Practice" onClick={onClose}>
            <CloseGlyph />
          </button>
        )}
      </div>
      {shown === 'stats' ? (
        <div className="launcher-pane__body">
          <PracticeStats
            simulationState={simulationState}
            engine={engine}
            dpsProjection={dpsProjection}
            replaying={replaying}
          />
        </div>
      ) : (
        <SetupBody
          practice={practice}
          mechanicsConfig={mechanicsConfig}
          onMechanicsConfigChange={onMechanicsConfigChange}
          onSetBossHp={onSetBossHp}
          onApplyBossHpPreset={onApplyBossHpPreset}
          onExecuteEncounterCommand={onExecuteEncounterCommand}
          resetToDefaults={resetToDefaults}
          // The fight's own kind, not the scene's: a variant resolves to the kind that owns it.
          encounterKind={simulationState.encounter.kind}
          // Null outside a run and in every encounter that publishes no stage, which is what keeps
          // the setup a plain form there.
          runStage={replaying ? null : encounterSetupStage(simulationState.encounter)}
          runStartedWith={encounterSetupStartedWith(simulationState.encounter)}
          runSnapshot={replaying ? undefined : simulationState.encounter}
        />
      )}
      {!replaying && onRestart && (
        <footer className="practice-footer">
          <OsrsButton
            fullWidth
            variant="primary"
            className="practice-footer__restart"
            onClick={onRestart}
            disabled={restoring}
          >
            Restart fight
            {!restartShortcutTargetsSession && (
              /* biome-ignore lint/a11y/noAriaHiddenOnFocusable: supplementary shortcut only; the button keeps its action name. */
              <kbd className="practice-footer__shortcut" aria-hidden="true">
                Ctrl+R
              </kbd>
            )}
          </OsrsButton>
        </footer>
      )}
    </>
  );
};

/**
 * How far `element` sits from the top of `scroller`'s content, in the scroller's own CSS pixels:
 * scrollTop's units at any chrome zoom. Client rects are drawn at the zoom and scrollTop is not, so
 * a jump measured with them overshoots above 1x. Null where the scroller is not on the element's
 * offset-parent chain (it is positioned for this: `launcher-pane__body--setup`, TopChrome.css).
 */
function offsetWithin(element: HTMLElement, scroller: HTMLElement): number | null {
  let top = 0;
  let node = element;
  while (node !== scroller) {
    top += node.offsetTop;
    const parent = node.offsetParent;
    if (!(parent instanceof HTMLElement) || !scroller.contains(parent)) return null;
    // An offset is measured from inside its parent's border; the scroller's own border is outside
    // its content, which is where scrollTop counts from.
    if (parent !== scroller) top += parent.clientTop;
    node = parent;
  }
  return top;
}

/**
 * Setup's one scrolling body, and the Fight / Mechanics / Aids nav that appears only when the
 * body would scroll without it. Choosing a section scrolls the body to it and keeps that section
 * selected even where the scroll stops short of its heading; scrolling by hand follows the body
 * again, the last section at the very end.
 */
const SetupBody: React.FC<
  Pick<
    PracticePaneProps,
    | 'practice'
    | 'mechanicsConfig'
    | 'onMechanicsConfigChange'
    | 'onSetBossHp'
    | 'onApplyBossHpPreset'
    | 'onExecuteEncounterCommand'
  > & {
    readonly encounterKind: string;
    readonly runStage: number | null;
    readonly runStartedWith: string;
    /** The run's snapshot for Practice's visibility rules; undefined while replaying. */
    readonly runSnapshot: EncounterSnapshot | undefined;
    readonly resetToDefaults: ResetToDefaults;
  }
> = ({
  practice,
  mechanicsConfig,
  onMechanicsConfigChange,
  onSetBossHp,
  onApplyBossHpPreset,
  onExecuteEncounterCommand,
  encounterKind,
  runStage,
  runStartedWith,
  runSnapshot,
  resetToDefaults,
}) => {
  const bodyRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const navRef = useRef<HTMLDivElement>(null);
  const [sections, setSections] = useState<readonly PracticeGroupId[]>([]);
  const [chosen, setChosen] = useState<PracticeGroupId | null>(null);
  const [followed, setFollowed] = useState<PracticeGroupId | null>(null);
  // A scroll this pane made itself, which must not count as the user scrolling away.
  const programmatic = useRef(false);
  // Keeps the `run` handed to the encounter's setup control the same object until the run's stage
  // or start setup changes. It does not stop this pane's re-renders from reaching that control.
  const setupRun = useMemo(
    () =>
      runStage === null
        ? undefined
        : { stage: runStage, startedWith: runStartedWith, execute: onExecuteEncounterCommand },
    [runStage, runStartedWith, onExecuteEncounterCommand],
  );

  const followScroll = useCallback(() => {
    const body = bodyRef.current;
    if (!body) return;
    const groups = Array.from(body.querySelectorAll<HTMLElement>('[data-practice-group]'));
    if (groups.length === 0) return;
    const atEnd = body.scrollTop >= body.scrollHeight - body.clientHeight - 1;
    const bodyTop = body.getBoundingClientRect().top;
    let current = groups[0];
    for (const group of groups) {
      if (group.getBoundingClientRect().top - bodyTop <= 4) current = group;
    }
    const id = (atEnd ? groups[groups.length - 1] : current).dataset.practiceGroup as PracticeGroupId;
    setFollowed((previous) => (previous === id ? previous : id));
  }, []);

  // Measured without the nav, so showing the nav can never be what makes the body overflow.
  const measureLayout = useCallback(() => {
    const body = bodyRef.current;
    if (!body) return;
    const navHeight = navRef.current?.offsetHeight ?? 0;
    const overflows = body.scrollHeight > body.clientHeight + navHeight + 1;
    const ids = overflows
      ? Array.from(body.querySelectorAll<HTMLElement>('[data-practice-group]'))
          .map((group) => group.dataset.practiceGroup as PracticeGroupId)
          .filter((id) => sectionLabel(id) !== undefined)
      : [];
    setSections((previous) => (previous.join('|') === ids.join('|') ? previous : ids));
    setChosen((previous) => (previous !== null && !ids.includes(previous) ? null : previous));
    if (ids.length > 0) followScroll();
  }, [followScroll]);

  // NPC snapshots change every tick, but only section/disclosure changes affect this layout.
  // The observer also covers wrapping, fonts, and other content-size changes without a render.
  const contentKey = `${runStage}|${Boolean(practice.bossNpc)}|${practice.optionsExpanded}|${practice.inFightMechanicsToggles
    .map((toggle) => `${toggle.key}:${toggle.group}:${toggle.setup}:${toggle.section}`)
    .join(',')}`;
  const hasNav = sections.length > 1;
  // biome-ignore lint/correctness/useExhaustiveDependencies: these keys invalidate DOM layout without changing the measuring callback; tick-only NPC data does not.
  useLayoutEffect(measureLayout, [measureLayout, contentKey, hasNav]);
  useLayoutEffect(() => {
    const body = bodyRef.current;
    const content = contentRef.current;
    if (!body || !content || typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(measureLayout);
    observer.observe(body);
    observer.observe(content);
    return () => observer.disconnect();
  }, [measureLayout]);

  const choose = (id: PracticeGroupId) => {
    const body = bodyRef.current;
    const group = body?.querySelector<HTMLElement>(`[data-practice-group="${id}"]`);
    if (!body || !group) return;
    setChosen(id);
    const target = offsetWithin(group, body);
    if (target !== null && Math.abs(body.scrollTop - target) >= 1) {
      programmatic.current = true;
      body.scrollTop = target;
    }
  };

  const active = chosen ?? followed ?? sections[0] ?? null;
  return (
    <>
      {practice.optionsExpanded && sections.length > 1 && (
        <div ref={navRef} className="launcher-sections">
          {sections.map((id) => (
            <button
              key={id}
              type="button"
              className={`launcher-section${active === id ? ' is-active' : ''}`}
              aria-pressed={active === id}
              onClick={() => choose(id)}
            >
              {sectionLabel(id)}
            </button>
          ))}
        </div>
      )}
      <div
        ref={bodyRef}
        className="launcher-pane__body launcher-pane__body--setup"
        data-tutorial-input-surface="gameplay"
        onScroll={() => {
          if (programmatic.current) {
            programmatic.current = false;
            return;
          }
          setChosen(null);
          followScroll();
        }}
      >
        <div ref={contentRef} className="practice-panel">
          {/* Only aids exist outside a fight: say first where the rest will be. */}
          {!practice.bossNpc && practice.inFightMechanicsToggles.every((toggle) => toggle.group === 'aid') && (
            <p className="launcher-pane__note">Fight setup and mechanics appear here once you start an encounter.</p>
          )}
          <MechanicsSettings
            variant="practice"
            config={mechanicsConfig}
            onConfigChange={onMechanicsConfigChange}
            mechanicsToggles={practice.inFightMechanicsToggles}
            debugActions={NO_ACTIONS}
            targetNpc={practice.bossNpc}
            onSetBossHp={onSetBossHp}
            onApplyBossHpPreset={onApplyBossHpPreset}
            bossHpPresets={practice.bossHpPresets}
            setupControls={encounterSetupControlsForKind(encounterKind)}
            setupRun={setupRun}
            encounterSnapshot={runSnapshot}
            optionsExpanded={practice.optionsExpanded}
            onOptionsExpandedChange={practice.setOptionsExpanded}
          />
          {/* The end of the settings it resets, ruled off from them and kept apart from Restart fight. */}
          <ResetToDefaultsControl control={resetToDefaults} variant="practice" />
        </div>
      </div>
    </>
  );
};

/** The fight's readouts: the player and the target's health, the tick, DPS and the max hit. */
export const PracticeStats: React.FC<{
  readonly simulationState: SimulationState;
  readonly engine?: SimulationEngine;
  readonly dpsProjection?: ReturnType<SimulationEngine['getAdjustedTheoreticalDps']>;
  readonly replaying: boolean;
}> = ({ simulationState, engine, dpsProjection, replaying }) => {
  const readouts = useHudReadouts({ simulationState, engine, dpsProjection });
  const noDamage = readouts.actualText === '—';
  return (
    <div className="launcher-stats" data-tutorial="practice-stats">
      {replaying && <div className="launcher-stats__source">From the replay</div>}
      <div>
        <div className="launcher-stats__row">
          <span className="launcher-stats__label">Player</span>
          <span className="launcher-stats__value">
            {readouts.playerHP} / {readouts.maxHP}
          </span>
        </div>
        <Bar pct={readouts.hpPct} hasFill={readouts.hpHasFill} color={readouts.hpColor} />
      </div>
      {readouts.targetNpc ? (
        <div>
          <div className="launcher-stats__row">
            <span className="launcher-stats__label">{readouts.targetName}</span>
            <span className="launcher-stats__value">
              {readouts.targetNpc.hp} / {readouts.targetNpc.maxHp}
            </span>
          </div>
          <Bar pct={readouts.targetHpPct} hasFill={readouts.targetHasFill} color={readouts.targetHpColor} />
        </div>
      ) : (
        <div className="launcher-stats__row">
          <span className="launcher-stats__label">Target</span>
          <span className="launcher-stats__value is-empty">None</span>
        </div>
      )}
      <hr className="launcher-stats__rule" />
      <div className="launcher-stats__row">
        <span className="launcher-stats__label">Tick</span>
        <span className="launcher-stats__value">{readouts.currentTick}</span>
      </div>
      {noDamage ? (
        <div className="launcher-stats__row">
          <span className="launcher-stats__label">DPS</span>
          <span className="launcher-stats__value is-empty">No damage yet</span>
        </div>
      ) : (
        <div className="launcher-stats__dps">
          <span className="launcher-stats__label">DPS</span>
          <span className="launcher-stats__sub">Actual</span>
          <span className={`launcher-stats__value ${readouts.dpsLuckClass}`}>{readouts.actualText}</span>
          <span className="launcher-stats__sub">Expected</span>
          <span className="launcher-stats__value">{readouts.expectedText}</span>
        </div>
      )}
      <div className="launcher-stats__row">
        <span className="launcher-stats__label">Max hit</span>
        <span className="launcher-stats__value">{readouts.maxHitText}</span>
      </div>
    </div>
  );
};

const Bar: React.FC<{ readonly pct: number; readonly hasFill: boolean; readonly color: string }> = ({
  pct,
  hasFill,
  color,
}) => (
  <div className="launcher-stats__bar">
    <div
      className="launcher-stats__fill"
      style={{ width: `${pct}%`, minWidth: hasFill ? '1px' : '0', backgroundColor: color }}
    />
  </div>
);
