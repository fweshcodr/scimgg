import type React from 'react';
import { useId, useRef, useState } from 'react';
import { DisclosureChevron } from '../../components/ui/DisclosureChevron';
import { HoverHintButton } from '../../components/ui/HoverHintControl';
import { InfoHint } from '../../components/ui/InfoHint';
import { OsrsNumberInput } from '../../components/ui/OsrsNumberInput';
import type { MechanicsConfig } from '../../types/simulation';
import { loadSetting, saveSetting } from '../../util/storage';
import type { EncounterSetupRun } from '../practiceChrome';
import { FIRST_INFERNO_WAVE, ZUK_WAVE } from './constants';
import {
  INFERNO_DESTROYED_PILLAR_KEYS,
  INFERNO_START_WAVE_KEY,
  infernoRunSetupKey,
  resolveInfernoRunSetup,
} from './controls';
import { InfernoLinkNotice, InfernoSpawnSetup } from './InfernoSpawnSetup';
import { clampWave, WAVE_JUMPS, waveCompositionText } from './waveInfo';
import './InfernoSetup.css';

/** The mechanics keys this control draws, so the generic list does not draw rows for them too. */
export const INFERNO_SETUP_KEYS: readonly string[] = [
  INFERNO_START_WAVE_KEY,
  INFERNO_DESTROYED_PILLAR_KEYS.west,
  INFERNO_DESTROYED_PILLAR_KEYS.south,
  INFERNO_DESTROYED_PILLAR_KEYS.northEast,
];

/** A wave starts where the run does, so the two surfaces owe the player different sentences. */
const START_WAVE_INFO = {
  rail: 'The wave the run starts on. Clearing a wave carries straight into the next one, through TzKal-Zuk on wave 69.',
  practice:
    'The saved start wave. Typing or stepping saves it; Go or Enter starts a fresh run with this setup. Wave shortcuts save and start immediately.',
  tool: 'The wave this layout is for. Changing it saves the start wave. Start wave applies your setup; unplaced monsters spawn at random.',
} as const;

export interface InfernoSetupProps {
  readonly config: MechanicsConfig;
  readonly onChange: (config: MechanicsConfig) => void;
  /** `rail` is the pre-fight encounter card; `practice` is the in-fight pane and the mobile window. */
  readonly surface: 'rail' | 'practice' | 'tool';
  /** The run in progress, where there is one: its wave, and the route a restart takes. */
  readonly run?: EncounterSetupRun;
  readonly exportGear?: () => string;
  readonly actionFooter?: HTMLElement | null;
}

/** Wave shortcuts' disclosure, remembered separately for the rail and for Practice. */
const SHORTCUTS_SETTINGS = {
  rail: 'inferno-rail-shortcuts-expanded',
  practice: 'inferno-practice-shortcuts-expanded',
} as const;

/**
 * The footer's line beside Start Encounter: the wave the run starts on, named where it is Zuk's,
 * and a custom layout where the run will use one, so the commit names everything it commits.
 */
export function infernoSetupSummary(config: MechanicsConfig): string {
  const { startWave, spawnLayout } = resolveInfernoRunSetup(config);
  if (startWave === ZUK_WAVE) return `Wave ${ZUK_WAVE} · TzKal-Zuk`;
  return spawnLayout?.wave === startWave ? `Wave ${startWave} · Custom layout` : `Wave ${startWave}`;
}

/**
 * Inferno's choices: which wave to practice, where its monsters spawn (`InfernoSpawnSetup`, with
 * the setup link), and which pillars are already down.
 *
 * The wave is a number field rather than 68 buttons, because the two things a player arrives
 * wanting are an exact wave ("62") and a named one ("the first mager wave"). The field answers the
 * first in one gesture, the landmarks answer the second, and the line under them says what the
 * chosen wave actually spawns, which a grid of numbers never did.
 *
 * Mid-run these are not a form to fill in for later: picking a wave is a request to go there. A
 * landmark is one aimed press on a named destination, so it goes at once; the field and the
 * steppers move a number that is not a destination until it is finished, so they go on Enter or
 * on Go. Practice keeps that command visible and folds the named destinations away until needed.
 */
export const InfernoSetup: React.FC<InfernoSetupProps> = ({
  config,
  onChange,
  surface,
  run,
  exportGear,
  actionFooter,
}) => {
  const runSetup = resolveInfernoRunSetup(config);
  const { startWave } = runSetup;
  const waveFieldId = useId();
  const waveLabelRef = useRef<HTMLDivElement>(null);
  const shortcutsId = useId();
  const shortcutsSetting = SHORTCUTS_SETTINGS[surface === 'practice' ? 'practice' : 'rail'];
  const [shortcutsExpanded, setShortcutsExpanded] = useState(() => loadSetting<boolean>(shortcutsSetting) === true);

  const setWave = (wave: number) => onChange({ ...config, [INFERNO_START_WAVE_KEY]: String(clampWave(wave)) });
  /** Save the wave AND start there now, so a later plain restart lands in the same place. */
  const goToWave = (wave: number) => {
    const next = clampWave(wave);
    setWave(next);
    run?.execute({ encounter: 'inferno', type: 'go-to-wave', wave: next });
  };
  // Compares the saved setup with the one the run started with, never the live pillars (nibblers
  // collapse those mid-wave). Derived rather than held, so it survives the pane closing.
  const setupPending =
    startWave < ZUK_WAVE &&
    run !== undefined &&
    run.stage < ZUK_WAVE &&
    infernoRunSetupKey(runSetup) !== run.startedWith;
  // Named for what the press does: somewhere else is a move, the wave you are on is a restart.
  const goLabel = startWave === run?.stage ? `Go: restart at wave ${startWave}` : `Go to wave ${startWave}`;

  const composition = (
    <p className="inferno-setup__spawns">
      <span>{waveCompositionText(startWave)}</span>
      {surface === 'rail' && (
        <span className="inferno-setup__continues">
          {startWave === ZUK_WAVE ? 'The final wave of the Inferno.' : `Continues through to wave ${ZUK_WAVE}.`}
        </span>
      )}
    </p>
  );

  return (
    <div className={`inferno-setup inferno-setup--${surface}`}>
      <InfernoLinkNotice />
      {/* The section's own label and its value on one row: the rail names the section after it
          rather than heading it a second time. */}
      <div className="inferno-setup__head">
        <div ref={waveLabelRef} className="inferno-setup__title info-hint-region">
          {/* "Start wave" in both surfaces: the session bar above this one already says "Wave 47"
              for the wave being fought, and two live things called "Wave" showing different
              numbers is the confusion this control exists to end. */}
          <label htmlFor={waveFieldId}>Start wave</label>
          <InfoHint label="Start wave" text={START_WAVE_INFO[surface]} hoverRegionRef={waveLabelRef} />
        </div>
        <div className="inferno-setup__command">
          <OsrsNumberInput
            id={waveFieldId}
            className="inferno-setup__input"
            value={String(startWave)}
            min={FIRST_INFERNO_WAVE}
            max={ZUK_WAVE}
            fieldWidth={24}
            suffix={`/ ${ZUK_WAVE}`}
            // Typing and stepping save without restarting; only Enter or Go starts the wave.
            onChange={(event) => {
              const parsed = Number.parseInt(event.target.value, 10);
              if (Number.isInteger(parsed)) setWave(parsed);
            }}
            onKeyDown={(event) => {
              if (event.key !== 'Enter') return;
              event.preventDefault();
              const typed = Number.parseInt(event.currentTarget.value, 10);
              if (Number.isInteger(typed)) goToWave(typed);
            }}
          />
          {surface === 'practice' && run && (
            <HoverHintButton
              type="button"
              tabIndex={-1}
              className="osrs-btn osrs-btn--default inferno-setup__go"
              // The name is the action, as the face reads it; the hint only says what it will do.
              aria-label={goLabel}
              hint={`Restart from saved wave ${startWave} with this setup. This starts a fresh run.`}
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => goToWave(startWave)}
            >
              Go
            </HoverHintButton>
          )}
        </div>
      </div>

      {surface !== 'practice' && composition}
      {surface !== 'tool' && (
        <>
          <button
            type="button"
            tabIndex={-1}
            className="practice-options__toggle inferno-setup__shortcuts-toggle"
            aria-expanded={shortcutsExpanded}
            aria-controls={shortcutsId}
            onMouseDown={(event) => event.preventDefault()}
            onClick={() => {
              const expanded = !shortcutsExpanded;
              setShortcutsExpanded(expanded);
              saveSetting(shortcutsSetting, expanded);
            }}
          >
            <DisclosureChevron open={shortcutsExpanded} />
            Wave shortcuts
          </button>
          <div id={shortcutsId} className="inferno-setup__jumps" hidden={!shortcutsExpanded}>
            {surface === 'practice' && composition}
            <div className="inferno-setup__landmarks">
              {WAVE_JUMPS.map((jump) => {
                const active = jump.wave === startWave;
                return (
                  <HoverHintButton
                    key={jump.id}
                    type="button"
                    tabIndex={-1}
                    className={`inferno-landmark${active ? ' is-active' : ''}`}
                    aria-pressed={active}
                    hint={run ? `Go to wave ${jump.wave} now. ${jump.hint}` : jump.hint}
                    aria-label={`${jump.label}, wave ${jump.wave}`}
                    onMouseDown={(event) => event.preventDefault()}
                    // Executes immediately only with a run; otherwise it just saves.
                    onClick={() => (run ? goToWave(jump.wave) : setWave(jump.wave))}
                  >
                    {/* The number leads: it is what the press delivers, and it aligns down the grid. */}
                    <span className="inferno-landmark__wave">{jump.wave}</span>
                    <span className="inferno-landmark__name">{jump.face}</span>
                  </HoverHintButton>
                );
              })}
            </div>
          </div>
        </>
      )}

      {surface === 'rail' && (
        <InfernoSpawnSetup
          config={config}
          onChange={onChange}
          surface="rail"
          actionFooter={actionFooter}
          exportGear={exportGear}
        />
      )}
      {surface === 'practice' && setupPending && (
        <p className="inferno-setup__pending" role="status">
          Setup saved. Press Go to start wave {startWave} with it.
        </p>
      )}
    </div>
  );
};
