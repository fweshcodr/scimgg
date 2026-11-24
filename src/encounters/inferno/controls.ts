import type { EncounterControls, MechanicsToggleContext, MechanicsToggleInfo } from '../../core/encounters/types';
import type { Coordinate, MechanicsConfig } from '../../types/simulation';
import { buildZukControls } from '../zuk/controls';
import { INFERNO_DEBUG_ACTIONS, infernoSecondaryRestart, waveKeepsSpawns } from './commands';
import { FIRST_INFERNO_WAVE, INFERNO_DEFAULT_START_WAVE, LAST_PILLAR_WAVE, ZUK_WAVE } from './constants';
import type { PillarKey } from './pillars';
import { type InfernoLinkSetup, type InfernoSpawnLayout, parseSpawnLayout, serializeSpawnLayout } from './spawnLayout';
import {
  INFERNO_PRACTICE_START_TILE,
  resolveInfernoStartTile,
  serializeInfernoStartTile,
  startTileApplies,
} from './startTile';

export const INFERNO_START_WAVE_KEY = 'infernoStartWave';
/**
 * A custom spawn layout for one wave (`serializeSpawnLayout`), '' for random spawns. Drawn by the
 * Inferno setup control alone, so it is deliberately not a mechanics toggle: no generic row renders
 * it, while it is still persisted, carried into replays and kept by reconstruction.
 */
export const INFERNO_SPAWN_LAYOUT_KEY = 'infernoSpawnLayout';
/**
 * The practice start tile for waves 2-68 (`startTile.ts`), `"x,y"` local, '' for the default. Like
 * the layout, drawn by the Inferno setup control alone, never as a generic toggle.
 */
export const INFERNO_START_TILE_KEY = 'infernoStartTile';
/**
 * The wave whose spawns this run keeps (Lock layout): a run-only `runMechanics` override, never a
 * saved setting, toggle or default, so it reaches the run and its recording but not the setup.
 */
export const INFERNO_PINNED_WAVE_KEY = 'infernoPinnedWave';
export const INFERNO_DESTROYED_PILLAR_KEYS = {
  west: 'infernoWestPillarDestroyed',
  south: 'infernoSouthPillarDestroyed',
  northEast: 'infernoNorthEastPillarDestroyed',
} as const satisfies Record<PillarKey, string>;

/** The run setup the practice controls choose; the run seed travels as an encounter seed. */
export interface InfernoRunSetup {
  /** 1-69; 69 is TzKal-Zuk. */
  readonly startWave: number;
  /** Wave 69's starting glyph side, wherever the run reaches it. */
  readonly zukShieldStart: MechanicsConfig['zukShieldStart'];
  readonly destroyedPillars: Readonly<Record<PillarKey, boolean>>;
  /** Placed on its own wave whenever the run spawns it; every other wave stays seeded-random. */
  readonly spawnLayout: InfernoSpawnLayout | null;
  /**
   * Where a run started on waves 2-68 opens (fresh entries and Go to wave): the stored tile, or the
   * default where it is unset, outside the arena or under a pillar standing at this start. Terrain is
   * the encounter's to check. Ignored by starts on wave 1 and 69.
   */
  readonly startTile: Coordinate;
  /**
   * The wave whose spawns Retry repeats (`INFERNO_PINNED_WAVE_KEY`), absent for none. Only that
   * wave's: once the run moves past it, it no longer applies.
   */
  readonly pinnedWave?: number;
}

/** A whole-number string, else NaN. */
function parseWave(raw: unknown): number {
  return typeof raw === 'string' && /^\d+$/.test(raw) ? Number(raw) : Number.NaN;
}

/** Persisted values are arbitrary strings after a hand edit; a missing or unreadable one is the default. */
export function resolveInfernoRunSetup(mechanics: Readonly<Partial<MechanicsConfig>>): InfernoRunSetup {
  const parsed = parseWave(mechanics[INFERNO_START_WAVE_KEY]);
  const startWave = parsed >= FIRST_INFERNO_WAVE && parsed <= ZUK_WAVE ? parsed : INFERNO_DEFAULT_START_WAVE;
  const pinnedWave = parseWave(mechanics[INFERNO_PINNED_WAVE_KEY]);
  const destroyedPillars = {
    west: mechanics[INFERNO_DESTROYED_PILLAR_KEYS.west] === true,
    south: mechanics[INFERNO_DESTROYED_PILLAR_KEYS.south] === true,
    northEast: mechanics[INFERNO_DESTROYED_PILLAR_KEYS.northEast] === true,
  };
  return {
    startWave,
    zukShieldStart: mechanics.zukShieldStart,
    destroyedPillars,
    spawnLayout: parseSpawnLayout(mechanics[INFERNO_SPAWN_LAYOUT_KEY]),
    startTile: resolveInfernoStartTile(mechanics[INFERNO_START_TILE_KEY], { startWave, destroyedPillars }),
    ...(waveKeepsSpawns(pinnedWave) ? { pinnedWave } : {}),
  };
}

/** Declaration order, so a key built from the same choice is always the same string. */
const PILLAR_ORDER = ['west', 'south', 'northEast'] as const satisfies readonly PillarKey[];

/**
 * A comparable key for a pillar choice.
 *
 * The setup control builds one from the saved config and one from the run's published start state
 * ({@link InfernoPublicState.startDestroyedPillars}); a difference is a choice the player has
 * changed since the run began, which a running fight cannot take without restarting. Derived on
 * both sides rather than remembered, so it survives the Practice pane being closed and reopened.
 */
export function infernoPillarKey(destroyedPillars: Readonly<Record<PillarKey, boolean>>): string {
  return PILLAR_ORDER.filter((key) => destroyedPillars[key] === true).join(',');
}

/**
 * The whole setup a running fight cannot take without restarting (pillars, spawn layout and start
 * tile), as a comparable key: built from the saved config on one side and from the run's published
 * start state ({@link InfernoPublicState.startSpawnLayout}, `startPlayerTile`) on the other, as
 * {@link infernoPillarKey} is. Both sides pass RESOLVED tiles, so an unset choice and the default
 * agree. The tile counts only where `startWave` uses one and it is not the default, so without a
 * layout or a moved tile the key equals the pillar key.
 */
export function infernoRunSetupKey(
  setup: Pick<InfernoRunSetup, 'startWave' | 'destroyedPillars' | 'spawnLayout' | 'startTile'>,
): string {
  const pillars = infernoPillarKey(setup.destroyedPillars);
  const layout = setup.spawnLayout ? `;${serializeSpawnLayout(setup.spawnLayout)}` : '';
  const [x, y] = setup.startTile;
  const [defaultX, defaultY] = INFERNO_PRACTICE_START_TILE;
  const moved = startTileApplies(setup.startWave) && (x !== defaultX || y !== defaultY);
  return `${pillars}${layout}${moved ? `;start=${serializeInfernoStartTile(setup.startTile)}` : ''}`;
}

const PILLAR_INFO = `Starts the run with this pillar already collapsed. Pillars never stand after wave ${LAST_PILLAR_WAVE}. Applies from your next attempt.`;

/** The section TzKal-Zuk's own controls are listed under, in the configurer and in Practice. */
export const ZUK_SECTION = 'TzKal-Zuk';

/** Practice follows the fight, not a saved destination the player has not started yet. */
const atZukWave = ({ stage }: MechanicsToggleContext): boolean => stage === ZUK_WAVE;
/**
 * Listed only where the session bar offers it (`infernoSecondaryRestart`): read from the run, not
 * `config`, which may hold a saved layout the run is not using.
 */
const offersSecondary =
  (type: 'reroll-wave' | 'keep-spawns') =>
  ({ encounterSnapshot }: MechanicsToggleContext): boolean =>
    infernoSecondaryRestart(encounterSnapshot) === type;

/**
 * Every control TzKal-Zuk owns, marked with the wave it starts mattering on.
 *
 * A run that starts anywhere below 69 carries into 69, so these are deferred, never inapplicable:
 * they stay enabled and keep their value, and the row simply says when it lands. The note clears
 * once 69 is the wave chosen, or the wave being fought. Marking the whole of Zuk's set rather
 * than a hand-kept list of keys means a control added to him cannot be forgotten here.
 */
function appliesFromZukWave(toggle: MechanicsToggleInfo): MechanicsToggleInfo {
  return {
    ...toggle,
    // The rail retains deferred preparation; Practice shows this group only while fighting Zuk.
    section: ZUK_SECTION,
    visibleInPractice: atZukWave,
    appliesLater: ({ config, stage }) =>
      stage === ZUK_WAVE || resolveInfernoRunSetup(config).startWave === ZUK_WAVE ? null : `From wave ${ZUK_WAVE}`,
  };
}

/** The Start Wave choice for TzKal-Zuk, named so the picker reads as the fight it is. */
export const ZUK_WAVE_CHOICE_LABEL = `${ZUK_WAVE} · TzKal-Zuk`;

/**
 * One control set for the whole run: the run setup (start wave 1-69, pillars), then wave 69's
 * mechanics, aids and boss-HP phases, which only act while TzKal-Zuk is up (the boss-HP control
 * appears only with a boss on the field, and Zuk's practice actions do nothing before wave 69).
 */
export function buildInfernoControls(): EncounterControls {
  const zuk = buildZukControls();
  return {
    ...(zuk.bossHpPresets ? { bossHpPresets: zuk.bossHpPresets } : {}),
    defaultMechanicsConfig: {
      ...zuk.defaultMechanicsConfig,
      infiniteHealth: false,
      [INFERNO_START_WAVE_KEY]: String(INFERNO_DEFAULT_START_WAVE),
      [INFERNO_DESTROYED_PILLAR_KEYS.west]: false,
      [INFERNO_DESTROYED_PILLAR_KEYS.south]: false,
      [INFERNO_DESTROYED_PILLAR_KEYS.northEast]: false,
      [INFERNO_SPAWN_LAYOUT_KEY]: '',
      [INFERNO_START_TILE_KEY]: '',
    },
    mechanicsToggles: [
      {
        key: INFERNO_START_WAVE_KEY,
        label: 'Start Wave',
        setup: true,
        choices: Array.from({ length: ZUK_WAVE - FIRST_INFERNO_WAVE + 1 }, (_, index) => {
          const wave = FIRST_INFERNO_WAVE + index;
          return { value: String(wave), label: wave === ZUK_WAVE ? ZUK_WAVE_CHOICE_LABEL : String(wave) };
        }),
        info: 'The wave the run starts on. Clearing a wave continues into the next, through TzKal-Zuk on wave 69. Applies from your next attempt.',
      },
      { key: INFERNO_DESTROYED_PILLAR_KEYS.west, label: 'West Pillar Destroyed', setup: true, info: PILLAR_INFO },
      { key: INFERNO_DESTROYED_PILLAR_KEYS.south, label: 'South Pillar Destroyed', setup: true, info: PILLAR_INFO },
      {
        key: INFERNO_DESTROYED_PILLAR_KEYS.northEast,
        label: 'North-East Pillar Destroyed',
        setup: true,
        info: PILLAR_INFO,
      },
      ...zuk.mechanicsToggles.map(appliesFromZukWave),
    ],
    debugActions: [
      ...INFERNO_DEBUG_ACTIONS.map((action) =>
        action.command.type === 'retry-wave'
          ? action
          : { ...action, visibleInPractice: offersSecondary(action.command.type) },
      ),
      ...zuk.debugActions.map((action) => ({ ...action, visibleInPractice: atZukWave })),
    ],
  };
}

/**
 * The mechanics a link's setup saves: start wave, spawn layout (or random), all three pillars, and
 * the start tile where it names one for a wave that uses it (otherwise the player's own is kept).
 */
export function infernoLinkMechanics(setup: InfernoLinkSetup): Partial<MechanicsConfig> {
  return {
    [INFERNO_START_WAVE_KEY]: String(setup.startWave),
    [INFERNO_SPAWN_LAYOUT_KEY]: setup.layout ? serializeSpawnLayout(setup.layout) : '',
    [INFERNO_DESTROYED_PILLAR_KEYS.west]: setup.destroyedPillars.west,
    [INFERNO_DESTROYED_PILLAR_KEYS.south]: setup.destroyedPillars.south,
    [INFERNO_DESTROYED_PILLAR_KEYS.northEast]: setup.destroyedPillars.northEast,
    ...(setup.startTile && startTileApplies(setup.startWave)
      ? { [INFERNO_START_TILE_KEY]: serializeInfernoStartTile(setup.startTile) }
      : {}),
  };
}
