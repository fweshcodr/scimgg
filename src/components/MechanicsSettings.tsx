import type React from 'react';
import { Fragment, useRef } from 'react';
import type { EncounterCommand } from '../core/encounters/commands';
import type {
  BossHpPreset,
  DebugActionInfo,
  EncounterSnapshot,
  MechanicsChoice,
  MechanicsToggleContext,
  MechanicsToggleInfo,
} from '../core/encounters/types';
import { PLUGIN_KEYBINDS } from '../data/pluginKeybinds';
import type { EncounterSetupControls, EncounterSetupRun } from '../encounters/practiceChrome';
import type { MechanicsConfig, NpcSnapshot } from '../types/simulation';
import { BossHealthControl } from './BossHealthControl';
import { KeybindingsContent } from './GamePanel/KeybindingsContent';
import { MechanicsChoiceGlyph } from './MechanicsChoiceGlyph';
import { DisclosureChevron } from './ui/DisclosureChevron';
import { InfoHint } from './ui/InfoHint';
import { OsrsButton } from './ui/OsrsButton';
import { OsrsCheckbox } from './ui/OsrsCheckbox';
import { SettingRow } from './ui/SettingRow';
import './MechanicsSettings.css';

export type { MechanicsConfig };

/**
 * `configurer` is the pre-fight settings list: pickers last, so the checkbox column stays
 * unbroken. `practice` is the in-fight Practice panel: Fight Setup stays visible, with mechanics,
 * aids and actions under one controlled Options disclosure, and other dependents under their
 * parent toggles. The column does not scroll itself; whatever holds it does.
 */
export type MechanicsSettingsVariant = 'configurer' | 'practice';
export type PracticeGroupId = 'fightSetup' | 'mechanics' | 'assists' | 'actions' | `section:${string}`;

/** A {@link MechanicsToggleInfo.section} and its members, in authored order. */
export interface MechanicsToggleSection {
  readonly title: string;
  readonly toggles: readonly MechanicsToggleInfo[];
}

/** Splits off the toggles filed under a named section, sections in first-appearance order. */
export function partitionToggleSections(toggles: readonly MechanicsToggleInfo[]): {
  unsectioned: MechanicsToggleInfo[];
  sections: MechanicsToggleSection[];
} {
  const sections: { title: string; toggles: MechanicsToggleInfo[] }[] = [];
  const unsectioned: MechanicsToggleInfo[] = [];
  for (const toggle of toggles) {
    if (toggle.section === undefined) {
      unsectioned.push(toggle);
      continue;
    }
    const section = sections.find((entry) => entry.title === toggle.section);
    if (section) section.toggles.push(toggle);
    else sections.push({ title: toggle.section, toggles: [toggle] });
  }
  return { unsectioned, sections };
}

/**
 * The controls Practice shows for the run as it stands: each encounter-authored `visibleInPractice`
 * rule decides its own item (Zuk's controls only while wave 69 is fought). Hiding never changes a
 * saved value. Shared by the desktop pane and Mobile Practice, so the two never disagree.
 */
export function visibleInPractice<T extends Pick<MechanicsToggleInfo, 'visibleInPractice'>>(
  items: readonly T[],
  context: MechanicsToggleContext,
): T[] {
  return items.filter((item) => item.visibleInPractice?.(context) !== false);
}

/**
 * {@link visibleInPractice} for a host that re-renders every tick: the context may hold the run's
 * per-tick snapshot, so the same visible items come back as the same array, keeping what is
 * memoized on it (and memoized children given it) from redrawing each tick.
 */
export function useVisibleInPractice<T extends Pick<MechanicsToggleInfo, 'visibleInPractice'>>(
  items: readonly T[],
  context: MechanicsToggleContext,
): readonly T[] {
  const previous = useRef<readonly T[] | null>(null);
  const next = visibleInPractice(items, context);
  const kept = previous.current;
  if (kept && kept.length === next.length && kept.every((item, index) => item === next[index])) return kept;
  previous.current = next;
  return next;
}

/** The deferral every member of a section shares, which its head states once; null otherwise. */
export function sharedSectionNote(
  toggles: readonly MechanicsToggleInfo[],
  context: MechanicsToggleContext,
): string | null {
  const notes = toggles.map((toggle) => toggle.appliesLater?.(context) ?? null);
  return notes.length > 0 && notes.every((note) => note !== null && note === notes[0]) ? notes[0] : null;
}

interface MechanicsSettingsProps {
  variant?: MechanicsSettingsVariant;
  /** Practice hosts supply both disclosure props and persist the explicit choice. Unused by configurer. */
  optionsExpanded?: boolean;
  onOptionsExpandedChange?: (expanded: boolean) => void;
  /**
   * Practice variant only. Whether the encounter's actions are a group of this panel (the Mobile
   * tool window's Practice tab) or live elsewhere (the desktop Actions palette).
   */
  includeActions?: boolean;
  showKeybindings?: boolean;
  keybindingsReadOnly?: boolean;
  config: MechanicsConfig;
  onConfigChange: (config: MechanicsConfig) => void;
  mechanicsToggles: readonly MechanicsToggleInfo[];
  defaultConfig?: MechanicsConfig;
  debugActions: readonly DebugActionInfo[];
  onExecuteEncounterCommand?: (command: EncounterCommand) => void;
  targetNpc?: NpcSnapshot;
  onSetBossHp?: (hp: number) => void;
  /** Applies a boss-HP preset as a phase jump (rebuilds phase actors). The slider stays on `onSetBossHp`. */
  onApplyBossHpPreset?: (hp: number) => void;
  bossHpPresets?: readonly BossHpPreset[];
  /** Configurer variant only: a field leading the picker zone, sharing its seam and row inset. */
  setupField?: React.ReactNode;
  /**
   * The encounter's own setup control. On either surface the keys it names lose their generic
   * rows, so a choice that needs more than a checkbox or a segmented row is offered once, in the
   * shape its encounter chose.
   *
   * Only the practice variant also draws it, in Fight Setup, and uses its optional Options summary.
   * The configurer's card draws it itself, as a rail section of its own under
   * {@link EncounterSetupControls.railSection}, so there this list only filters.
   */
  setupControls?: EncounterSetupControls;
  /**
   * The run `setupControls` may act on. Supplied by the in-fight surfaces only: in the pre-fight
   * card there is no run, and Start Encounter is what applies the setup.
   */
  setupRun?: EncounterSetupRun;
  /**
   * The run's published snapshot, for the practice rules that read what the run is doing
   * (`MechanicsToggleContext.encounterSnapshot`). In-fight surfaces only, like `setupRun`.
   */
  encounterSnapshot?: EncounterSnapshot;
  /** Configurer variant only: a note the surrounding section head already states, which rows omit. */
  headNote?: string | null;
}

/**
 * Moves every entry that depends on another entry in the list to directly after that entry,
 * keeping authored order otherwise. A dependent whose parent is not in the list stays where it
 * was authored.
 */
export function orderDependentsUnderParents(toggles: readonly MechanicsToggleInfo[]): MechanicsToggleInfo[] {
  const dependents = new Map<string, MechanicsToggleInfo[]>();
  for (const toggle of toggles) {
    if (toggle.dependsOn === undefined || !toggles.some((parent) => parent.key === toggle.dependsOn)) continue;
    const siblings = dependents.get(toggle.dependsOn) ?? [];
    siblings.push(toggle);
    dependents.set(toggle.dependsOn, siblings);
  }
  const ordered: MechanicsToggleInfo[] = [];
  for (const toggle of toggles) {
    if (toggle.dependsOn !== undefined && dependents.has(toggle.dependsOn)) continue;
    ordered.push(toggle, ...(dependents.get(toggle.key) ?? []));
  }
  return ordered;
}

/** Setup choices are independent of their threat toggles; other dependents stay with their parent. */
export function partitionPracticeToggles(toggles: readonly MechanicsToggleInfo[]): {
  setup: MechanicsToggleInfo[];
  mechanics: MechanicsToggleInfo[];
  assists: MechanicsToggleInfo[];
} {
  const groupOf = (toggle: MechanicsToggleInfo): 'setup' | 'mechanics' | 'aid' => {
    const parent = toggle.dependsOn === undefined ? undefined : toggles.find((t) => t.key === toggle.dependsOn);
    if (toggle.group === 'aid' || parent?.group === 'aid') return 'aid';
    if (toggle.setup || parent?.setup) return 'setup';
    return 'mechanics';
  };
  return {
    setup: orderDependentsUnderParents(toggles.filter((toggle) => groupOf(toggle) === 'setup')),
    mechanics: orderDependentsUnderParents(toggles.filter((toggle) => groupOf(toggle) === 'mechanics')),
    assists: orderDependentsUnderParents(toggles.filter((toggle) => groupOf(toggle) === 'aid')),
  };
}

const MAX_CHOICE_COLUMNS = 10;

interface MechanicsChoiceRowProps {
  label: string;
  info?: MechanicsToggleInfo['info'];
  /** When this control takes effect, where that is later than now (`MechanicsToggleInfo`). */
  note?: string;
  choices: readonly MechanicsChoice[];
  value: string;
  disabled: boolean;
  /** Filed under another toggle; the practice panel indents it beneath that parent. */
  dependent: boolean;
  isModified: boolean;
  hideReset: boolean;
  onReset: () => void;
  onSelect: (value: string) => void;
}

const MechanicsChoiceRow: React.FC<MechanicsChoiceRowProps> = ({
  label,
  info,
  note,
  choices,
  value,
  disabled,
  dependent,
  isModified,
  hideReset,
  onReset,
  onSelect,
}) => {
  const labelRef = useRef<HTMLDivElement>(null);
  return (
    <SettingRow
      // Encounter mechanics: in the encounter panel, outside the sidebars search covers.
      searchId={null}
      isModified={isModified}
      hideReset={hideReset}
      onReset={onReset}
      className={dependent ? 'setting-row--dependent' : undefined}
    >
      <div className={`mechanics-choice${disabled ? ' is-disabled' : ''}`}>
        <div ref={labelRef} className={`mechanics-choice-label${info ? ' info-hint-region' : ''}`}>
          {label}
          {info && <InfoHint label={label} text={info} hoverRegionRef={labelRef} />}
          {note && <span className="mechanics-row-note">{note}</span>}
        </div>
        <div
          className={`mechanics-choice-segmented${choices.some((choice) => choice.icon) ? ' has-icons' : ''}`}
          role="radiogroup"
          aria-label={label}
          aria-disabled={disabled || undefined}
          style={{
            // A long list (Inferno's 68 start waves) wraps into rows rather than shrinking past use.
            gridTemplateColumns: `repeat(${Math.min(choices.length, MAX_CHOICE_COLUMNS)}, minmax(0, 1fr))`,
          }}
        >
          {choices.map((choice) => (
            /* biome-ignore lint/a11y/useSemanticElements: matches the Compact Orbs / UI-scale pickers; a native radio cannot carry the segmented styling. */
            <button
              key={choice.value}
              type="button"
              role="radio"
              aria-checked={choice.value === value}
              disabled={disabled}
              className={`mechanics-choice-segment${choice.value === value ? ' is-active' : ''}`}
              data-choice-icon={choice.icon}
              onClick={() => onSelect(choice.value)}
              aria-label={choice.icon ? choice.label : undefined}
            >
              {choice.icon && <MechanicsChoiceGlyph icon={choice.icon} />}
              <span>{choice.label}</span>
            </button>
          ))}
        </div>
      </div>
    </SettingRow>
  );
};

interface MechanicsToggleRowProps {
  label: string;
  info?: MechanicsToggleInfo['info'];
  /** When this control takes effect, where that is later than now (`MechanicsToggleInfo`). */
  note?: string;
  checked: boolean;
  dependent: boolean;
  isModified: boolean;
  hideReset: boolean;
  onReset: () => void;
  onToggle: () => void;
}

const MechanicsToggleRow: React.FC<MechanicsToggleRowProps> = ({
  label,
  info,
  note,
  checked,
  dependent,
  isModified,
  hideReset,
  onReset,
  onToggle,
}) => {
  const regionRef = useRef<HTMLDivElement>(null);
  const checkbox = <OsrsCheckbox checked={checked} onChange={onToggle} label={label} />;
  return (
    <SettingRow
      // Encounter mechanics: in the encounter panel, outside the sidebars search covers.
      searchId={null}
      isModified={isModified}
      hideReset={hideReset}
      onReset={onReset}
      className={dependent ? 'setting-row--dependent' : undefined}
    >
      {info || note ? (
        // Beside the checkbox, never inside it: OsrsCheckbox renders a <button>, and the mark is
        // one too, so nesting them would be invalid HTML and swallow the mark's own focus into
        // the toggle. The wrapper is also the hover region, which is why it has to exist at all.
        <div
          ref={regionRef}
          className={`mechanics-toggle-info${note ? ' mechanics-toggle-info--noted' : ''}${info ? ' info-hint-region' : ''}`}
        >
          {checkbox}
          {info && <InfoHint label={label} text={info} hoverRegionRef={regionRef} />}
          {note && <span className="mechanics-row-note">{note}</span>}
        </div>
      ) : (
        checkbox
      )}
    </SettingRow>
  );
};

export const MechanicsSettings: React.FC<MechanicsSettingsProps> = ({
  variant = 'configurer',
  optionsExpanded,
  onOptionsExpandedChange,
  includeActions = true,
  showKeybindings = false,
  keybindingsReadOnly = false,
  config,
  onConfigChange,
  mechanicsToggles: allMechanicsToggles,
  defaultConfig,
  debugActions,
  onExecuteEncounterCommand,
  targetNpc,
  onSetBossHp,
  onApplyBossHpPreset,
  bossHpPresets,
  setupField,
  setupControls,
  setupRun,
  encounterSnapshot,
  headNote,
}) => {
  // The encounter's own control owns its keys outright: leaving the generic rows in would offer
  // the same setting twice, in two shapes, with two places to look for it.
  const toggleContext: MechanicsToggleContext = { config, stage: setupRun?.stage, encounterSnapshot };
  const ownedToggles = allMechanicsToggles.filter((toggle) => !setupControls?.keys.includes(toggle.key));
  const mechanicsToggles = variant === 'practice' ? visibleInPractice(ownedToggles, toggleContext) : ownedToggles;
  // Practice only: see `setupControls`. The configurer's host places this control, and drawing it
  // here as well would offer the same choice twice on one card.
  const encounterSetup =
    variant === 'practice'
      ? setupControls?.render({
          config,
          onChange: onConfigChange,
          surface: 'practice',
          run: setupRun,
        })
      : undefined;
  const handleToggle = (key: string) => {
    const nextConfig: MechanicsConfig = { ...config };
    // `=== true`, matching how the box renders its checked state. Negating the raw value instead
    // makes a non-boolean read as unchecked but flip to `false`, so a stale persisted string would
    // need two clicks to switch a mechanic on.
    nextConfig[key] = config[key] !== true;
    onConfigChange(nextConfig);
  };

  const renderToggle = (
    { key, label, choices, dependsOn, info, setup, appliesLater }: MechanicsToggleInfo,
    sectionNote: string | null | undefined = headNote,
  ) => {
    // The encounter answers when its own control lands; this component only places the answer,
    // once at a section's head where every row there would say the same.
    const rowNote = appliesLater?.(toggleContext) ?? undefined;
    const note = rowNote !== undefined && rowNote === sectionNote ? undefined : rowNote;
    const currentValue = config[key] ?? false;
    const defaultValue = defaultConfig?.[key] ?? false;
    const isModified = defaultConfig != null && currentValue !== defaultValue;
    const keybindingGroup = showKeybindings
      ? Object.values(PLUGIN_KEYBINDS).find((binding) => binding.setting === key)?.group
      : undefined;

    // A dependent is gated by its parent only while that parent is IN this list. The setup rail
    // shows pickers without any mechanic switch, and a preselected choice there must stay
    // editable — the fight reads the two keys independently, and the in-fight panel, which lists
    // both, keeps expressing the gate through this disabled state.
    const gatedByParent =
      dependsOn !== undefined &&
      mechanicsToggles.some((parent) => parent.key === dependsOn) &&
      config[dependsOn] !== true;

    if (choices && choices.length > 0) {
      return (
        <MechanicsChoiceRow
          key={key}
          label={label}
          info={info}
          note={note}
          choices={choices}
          disabled={gatedByParent}
          dependent={dependsOn != null && !setup}
          // Falls back to the first choice for anything not in `choices`, matching the
          // encounter's own guard. Echoing an unrecognized persisted value instead would
          // leave every segment unselected while the fight ran on the fallback.
          value={(choices.find((choice) => choice.value === currentValue) ?? choices[0]).value}
          isModified={isModified}
          hideReset={defaultConfig == null}
          onReset={() => onConfigChange({ ...config, [key]: defaultValue })}
          onSelect={(next) => onConfigChange({ ...config, [key]: next })}
        />
      );
    }

    return (
      <Fragment key={key}>
        <MechanicsToggleRow
          label={label}
          info={info}
          note={note}
          checked={currentValue === true}
          dependent={dependsOn != null}
          isModified={isModified}
          // Without a default, omit reset entirely rather than reserving an empty gutter.
          hideReset={defaultConfig == null}
          onReset={() => onConfigChange({ ...config, [key]: defaultValue })}
          onToggle={() => handleToggle(key)}
        />
        {/* Folded while the toggle is off; the block returns as soon as it is switched on. */}
        {keybindingGroup && currentValue === true && (
          <div className="mechanics-feature-keybindings">
            <KeybindingsContent group={keybindingGroup} readOnly={keybindingsReadOnly} compact />
          </div>
        )}
      </Fragment>
    );
  };

  const renderActions = (actions: readonly DebugActionInfo[], execute: (command: EncounterCommand) => void) => (
    <div className="mechanics-actions">
      {actions.map(({ command, label }) => (
        <OsrsButton
          // The whole command, not `encounter:type`: two actions may share a type and differ
          // only in payload (Zuk's demonstrate-jad magic vs range).
          key={JSON.stringify(command)}
          variant="small"
          onClick={() => execute(command)}
        >
          {label}
        </OsrsButton>
      ))}
    </div>
  );

  const bossHealth =
    targetNpc && onSetBossHp ? (
      <BossHealthControl
        targetNpc={targetNpc}
        onSetBossHp={onSetBossHp}
        onApplyPreset={onApplyBossHpPreset}
        presets={bossHpPresets}
      />
    ) : null;

  if (variant === 'practice') {
    const { unsectioned, sections } = partitionToggleSections(mechanicsToggles);
    const { setup, mechanics, assists } = partitionPracticeToggles(unsectioned);
    const renderFamilies = (toggles: readonly MechanicsToggleInfo[], sectionNote?: string | null) => {
      const families: { key: string; toggles: MechanicsToggleInfo[] }[] = [];
      for (const toggle of toggles) {
        const family = toggle.dependsOn ? families.find((entry) => entry.key === toggle.dependsOn) : undefined;
        if (family) family.toggles.push(toggle);
        else families.push({ key: toggle.key, toggles: [toggle] });
      }
      families.sort((a, b) => Number(a.toggles.length > 1) - Number(b.toggles.length > 1));
      return (
        <div className="mechanics-toggles">
          {families.map((family) => (
            <div className="mechanics-toggle-family" key={family.key}>
              {family.toggles.map((toggle) => renderToggle(toggle, sectionNote))}
            </div>
          ))}
        </div>
      );
    };
    const visibleActions = visibleInPractice(debugActions, toggleContext);
    const practiceActions = visibleActions.filter((action) => action.purpose !== 'inspection');
    const inspectionActions = visibleActions.filter((action) => action.purpose === 'inspection');
    const groups: {
      id: PracticeGroupId;
      title: string;
      note?: string | null;
      content: React.ReactNode;
    }[] = [];
    if (bossHealth || encounterSetup || setup.length > 0)
      groups.push({
        id: 'fightSetup',
        title: 'Fight Setup',
        content: (
          <div className="mechanics-fight-setup">
            {bossHealth}
            {encounterSetup}
            {setup.map((toggle) => renderToggle(toggle))}
          </div>
        ),
      });
    if (mechanics.length > 0) groups.push({ id: 'mechanics', title: 'Mechanics', content: renderFamilies(mechanics) });
    for (const section of sections) {
      // Pickers last, as in the configurer, so the section's switches read as one run.
      const ordered = orderDependentsUnderParents([
        ...section.toggles.filter((toggle) => !toggle.choices?.length),
        ...section.toggles.filter((toggle) => toggle.choices?.length),
      ]);
      const note = sharedSectionNote(section.toggles, toggleContext);
      groups.push({
        id: `section:${section.title}`,
        title: section.title,
        note,
        content: renderFamilies(ordered, note),
      });
    }
    if (assists.length > 0) groups.push({ id: 'assists', title: 'Practice aids', content: renderFamilies(assists) });
    if (includeActions && visibleActions.length > 0 && onExecuteEncounterCommand) {
      groups.push({
        id: 'actions',
        title: 'Actions',
        content: renderActions([...practiceActions, ...inspectionActions], onExecuteEncounterCommand),
      });
    }
    // What Options holds, named by its parts: a section is a part of the fight with a name of its
    // own, so it leads, ahead of the boss's unnamed mechanics.
    const optionsSummary =
      setupControls?.optionsSummary?.({ config, onChange: onConfigChange, surface: 'practice', run: setupRun }) ??
      `${
        sections.length > 0
          ? [...sections.map((section) => section.title), ...(mechanics.length > 0 ? ['mechanics'] : [])].join(', ')
          : 'Mechanics'
      } & aids`;
    return (
      <div className="mechanics-settings mechanics-settings--practice">
        <div className="mechanics-practice-groups">
          {groups
            .filter((group) => group.id === 'fightSetup')
            .map((group) => (
              <div key={group.id} data-practice-group={group.id}>
                {group.content}
              </div>
            ))}
          {groups.some((group) => group.id !== 'fightSetup') && (
            <div className="practice-options">
              <button
                type="button"
                tabIndex={-1}
                className="practice-options__toggle"
                aria-expanded={optionsExpanded}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => onOptionsExpandedChange?.(!optionsExpanded)}
              >
                <DisclosureChevron open={optionsExpanded} />
                Options <span>{optionsSummary}</span>
              </button>
              <div hidden={!optionsExpanded}>
                {groups
                  .filter((group) => group.id !== 'fightSetup')
                  .map((group) => (
                    <section key={group.id} data-practice-group={group.id}>
                      <h3 className="practice-options__heading">
                        {group.title}
                        {group.note && <span className="mechanics-row-note">{group.note}</span>}
                      </h3>
                      {group.content}
                    </section>
                  ))}
              </div>
            </div>
          )}
        </div>
      </div>
    );
  }

  // Ordering lives HERE, in the one component both surfaces render, because they are handed
  // different lists — the configurer splices the global toggles around the encounter's own, the
  // Practice gets the raw encounter list — so ordering at either source gets it right on only one of
  // them. Each partition is stable, so entries keep the order their encounter authored them in.
  const isChoice = (toggle: MechanicsToggleInfo) => (toggle.choices?.length ?? 0) > 0;
  const mechanicRows = mechanicsToggles.filter((t) => !isChoice(t) && t.group !== 'aid');
  const aidRows = mechanicsToggles.filter((t) => !isChoice(t) && t.group === 'aid');
  const choiceRows = mechanicsToggles.filter(isChoice);
  const leadingRows = [...mechanicRows, ...aidRows];
  // Seams stay flat siblings rather than per-zone wrappers: a host may lay this list out as a
  // single wrapping flex row, and a wrapper would force each zone onto its own line.
  const aidSeamIndex = aidRows.length > 0 && mechanicRows.length > 0 ? mechanicRows.length : -1;
  const choiceSeam = (setupField != null || choiceRows.length > 0) && leadingRows.length > 0;

  return (
    <div className="mechanics-settings">
      {bossHealth}
      <div className="mechanics-toggles">
        {leadingRows.map((toggle, index) => (
          <Fragment key={toggle.key}>
            {index === aidSeamIndex && <div className="mechanics-group-rule" />}
            {renderToggle(toggle)}
          </Fragment>
        ))}
        {choiceSeam && <div className="mechanics-group-rule" />}
        {setupField != null && (
          <SettingRow
            // Encounter mechanics: in the encounter panel, outside the sidebars search covers.
            searchId={null}
            isModified={false}
            onReset={() => {}}
            hideReset
          >
            {setupField}
          </SettingRow>
        )}
        {choiceRows.map((toggle) => renderToggle(toggle))}
      </div>
      {debugActions.length > 0 && onExecuteEncounterCommand && renderActions(debugActions, onExecuteEncounterCommand)}
    </div>
  );
};
