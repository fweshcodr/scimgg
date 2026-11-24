/**
 * Opening the app from an Inferno setup link: what the link asks for, and the one-shot notice that
 * reports how it went.
 *
 * A link is the address `/inferno/?…` (or `/?…`) carrying any of `INFERNO_SETUP_PARAMS` (the wave,
 * an Inferno Stats spawn layout, destroyed pillars; see `spawnLayout.ts`), plus an optional `setup`:
 * a RuneLite Inventory Setups export string (URL-encoded JSON), read by `importInventorySetup`.
 *
 * - A link whose setup cannot be read applies nothing and reports why.
 * - Complete gear (every item supported) starts the run at once; the player already chose it.
 * - Otherwise the setup is applied and the Inferno setup card opens, so the player can check their
 *   gear and press Start. Gear that cannot be read, or that lost unsupported items, is reported.
 *
 * `useInfernoSetupLink` (src/hooks) consumes the link at boot and acts on this plan. The address bar
 * then mirrors the saved setup in the same format ({@link infernoSetupQuery}, `useInfernoSetupQuery`).
 */
import { importInventorySetup } from '../../data/inventorySetupIO';
import type { EncounterLoadout } from '../../types/encounterLoadout';
import type { MechanicsConfig } from '../../types/simulation';
import { LAST_PILLAR_WAVE } from './constants';
import { infernoLinkMechanics, resolveInfernoRunSetup } from './controls';
import type { InfernoSetupLinkNotice } from './setupLinkNotice';
import {
  buildInfernoSetupQuery,
  INFERNO_GEAR_PARAM,
  INFERNO_IGNORED_PARAMS,
  INFERNO_SETUP_PARAMS,
  parseInfernoSetupParams,
} from './spawnLayout';
import { INFERNO_PRACTICE_START_TILE, startTileApplies } from './startTile';

export interface InfernoSetupLinkPlan {
  /** The Inferno mechanics to save; null for a link that applies nothing. */
  readonly mechanics: Partial<MechanicsConfig> | null;
  /** The gear to make the Inferno's current loadout; null keeps the player's own. */
  readonly loadout: EncounterLoadout | null;
  /** Start the run now (complete gear came with a valid setup), rather than open the setup card. */
  readonly autoStart: boolean;
  readonly notice: InfernoSetupLinkNotice;
}

export interface InfernoSetupLink {
  /** Null for the address bar's own mirror of the saved setup: nothing to apply or announce. */
  readonly plan: InfernoSetupLinkPlan | null;
  /** The address once the link is consumed: its parameters gone, on the lobby path. */
  readonly cleanedUrl: string;
  /** The address was `/inferno/`, not the root: a mirror there enters the fight, as the plain route does. */
  readonly onInfernoRoute: boolean;
}

const CHECK_GEAR = 'Check your gear, then press Start.';

/** What a link's query asks for, or null when it carries no Inferno setup. Never throws. */
export function planInfernoSetupLink(search: URLSearchParams): InfernoSetupLinkPlan | null {
  const parsed = parseInfernoSetupParams(search);
  const gear = search.get(INFERNO_GEAR_PARAM);
  if (parsed.ok && parsed.setup === null && gear === null) return null;
  if (!parsed.ok || parsed.setup === null) {
    const message = parsed.ok ? 'The link does not say which wave to start on.' : parsed.message;
    return { mechanics: null, loadout: null, autoStart: false, notice: { tone: 'error', message } };
  }
  const { setup } = parsed;
  const mechanics = infernoLinkMechanics(setup);
  const loaded = setup.layout ? `Wave ${setup.startWave} spawn` : `Start wave ${setup.startWave}`;
  if (gear === null) {
    return {
      mechanics,
      loadout: null,
      autoStart: false,
      notice: { tone: 'success', message: `${loaded} loaded from link.` },
    };
  }
  const imported = importInventorySetup(gear);
  if (imported.kind === 'error') {
    return {
      mechanics,
      loadout: null,
      autoStart: false,
      notice: { tone: 'warning', message: `${loaded} loaded from link, but its gear could not be read. ${CHECK_GEAR}` },
    };
  }
  const omitted = imported.verificationIssues.filter((issue) => issue.omitted).length;
  if (omitted > 0) {
    const items = omitted === 1 ? '1 unsupported item was' : `${omitted} unsupported items were`;
    return {
      mechanics,
      loadout: imported.loadout,
      autoStart: false,
      notice: { tone: 'warning', message: `${loaded} and gear loaded from link, but ${items} left out. ${CHECK_GEAR}` },
    };
  }
  return {
    mechanics,
    loadout: imported.loadout,
    autoStart: true,
    notice: { tone: 'success', message: `${loaded} and gear loaded from link.` },
  };
}

/** Every parameter a link may carry: consumed with it, and the address bar mirror's to rewrite. */
export const INFERNO_LINK_PARAMS: readonly string[] = [
  ...INFERNO_SETUP_PARAMS,
  ...INFERNO_IGNORED_PARAMS,
  INFERNO_GEAR_PARAM,
];

const NO_PILLARS_DOWN = { west: false, south: false, northEast: false } as const;

/**
 * The setup link query (no `?`, no gear) for the saved Inferno `mechanics`, which the address bar
 * mirrors while the Inferno is open (`useInfernoSetupQuery`); '' for the untouched default setup
 * (the default start wave, random spawns, every pillar standing), so the plain route stays plain.
 * Only what a run of it uses is written: a layout for its own start wave, pillars up to wave 66, and
 * the start tile on waves 2-68 where it is not the default. Equal setups give equal strings.
 */
export function infernoSetupQuery(mechanics: Readonly<Partial<MechanicsConfig>>): string {
  const query = runSetupQuery(mechanics);
  return query === runSetupQuery({}) ? '' : query;
}

function runSetupQuery(mechanics: Readonly<Partial<MechanicsConfig>>): string {
  const setup = resolveInfernoRunSetup(mechanics);
  const [x, y] = setup.startTile;
  const moved =
    startTileApplies(setup.startWave) && (x !== INFERNO_PRACTICE_START_TILE[0] || y !== INFERNO_PRACTICE_START_TILE[1]);
  return buildInfernoSetupQuery({
    startWave: setup.startWave,
    layout: setup.spawnLayout?.wave === setup.startWave ? setup.spawnLayout : null,
    destroyedPillars: setup.startWave <= LAST_PILLAR_WAVE ? setup.destroyedPillars : NO_PILLARS_DOWN,
    startTile: moved ? setup.startTile : null,
  });
}

/**
 * The link at `location`, if it is one: on `/inferno/` or the site root only, so no other page's
 * query is ever read as an Inferno setup.
 *
 * Given the `saved` Inferno mechanics, a gearless link that would leave them as they are (the
 * address bar's own mirror, reloaded or reopened) has no plan: nothing to apply or announce, and
 * the caller opens it as its plain route would ({@link InfernoSetupLink.onInfernoRoute}).
 */
export function readInfernoSetupLink(
  location: Pick<Location, 'pathname' | 'search' | 'hash'>,
  saved?: Readonly<Partial<MechanicsConfig>>,
): InfernoSetupLink | null {
  const segments = location.pathname.split('/').filter(Boolean);
  if (!(segments.length === 0 || (segments.length === 1 && segments[0] === 'inferno'))) return null;
  const search = new URLSearchParams(location.search);
  const plan = planInfernoSetupLink(search);
  if (!plan) return null;
  const mirror =
    saved !== undefined &&
    plan.mechanics !== null &&
    !search.has(INFERNO_GEAR_PARAM) &&
    infernoSetupQuery({ ...saved, ...plan.mechanics }) === infernoSetupQuery(saved);
  for (const name of INFERNO_LINK_PARAMS) search.delete(name);
  const rest = search.toString();
  return {
    plan: mirror ? null : plan,
    cleanedUrl: `/${rest ? `?${rest}` : ''}${location.hash}`,
    onInfernoRoute: segments.length === 1,
  };
}
