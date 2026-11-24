/**
 * Custom spawn layouts: a player-chosen placement of one wave's slot NPCs (bats, blobs, meleers,
 * rangers, magers) on the nine fixed spawn slots, a practice option in place of the seeded shuffle
 * (docs/encounters/inferno-policy.md, Practice flow). Nibblers and Jads are never part of one.
 *
 * The API:
 * - {@link InfernoSpawnLayout}: `slots[i]` is the kind on `INFERNO_SPAWN_SLOTS[i]`, or null.
 * - {@link validateSpawnLayout}: the only way to build a layout; it is valid iff the wave is 1-66
 *   with at least one slot NPC and it places some of that wave's slot NPCs (nibblers aside), none
 *   more often than the wave has them. {@link isCompleteSpawnLayout}: it places all of them; a
 *   partial layout's other slot NPCs spawn at random.
 * - {@link serializeSpawnLayout} / {@link parseSpawnLayout}: the `infernoSpawnLayout` mechanics
 *   value, `"<wave>:<one char per slot>"` (`b` bat, `l` blob, `m` meleer, `r` ranger, `g` mager,
 *   `-` empty), e.g. `"31:l-r-m--l-"`. Anything unreadable or invalid parses to null (random).
 * - {@link slotKindsForWave}, {@link inferWaveFromKinds}: what a wave places, and the reverse
 *   (compositions are unique across waves 1-66, so species counts name the wave).
 * - {@link layoutFromPlacements}: the layout a spawned batch actually used, random or not.
 * - {@link parseInfernoSetupParams} / {@link buildInfernoSetupUrl}: the setup link, compatible with
 *   the RuneLite Inferno Stats plugin's links (its link format is a public interface; this parser is
 *   our own). See {@link INFERNO_SETUP_PARAMS} for the format.
 */
import type { Coordinate } from '../../types/simulation';
import { FIRST_INFERNO_WAVE, INFERNO_SPAWN_SLOTS, LAST_PILLAR_WAVE, ZUK_WAVE } from './constants';
import type { PillarKey } from './pillars';
import { startTileApplies, validateInfernoStartTile } from './startTile';
import { WAVE_NPC_NAMES } from './waveInfo';
import { isInfernoWave, WAVE_NPC_SPAWN_ORDER, type WaveNpcKind, waveSpawnKinds } from './waves';

/** The species that spawn on the nine slots. */
export type SlotKind = Exclude<WaveNpcKind, 'nibbler' | 'jad'>;

export interface InfernoSpawnLayout {
  /** 1-66, a wave with at least one slot NPC. */
  readonly wave: number;
  /** Length 9, indexed as `INFERNO_SPAWN_SLOTS`. */
  readonly slots: readonly (SlotKind | null)[];
}

export type SpawnLayoutError = 'bad-wave' | 'no-slot-npcs' | 'bad-slots' | 'empty' | 'composition-mismatch';

export type SpawnLayoutResult =
  | { readonly ok: true; readonly layout: InfernoSpawnLayout }
  | { readonly ok: false; readonly error: SpawnLayoutError; readonly message: string };

const SLOT_COUNT = INFERNO_SPAWN_SLOTS.length;

function isSlotKind(kind: WaveNpcKind): kind is SlotKind {
  return kind !== 'nibbler' && kind !== 'jad';
}

/** The wave's slot NPCs, one entry each, in spawn order. Empty for nibbler-only waves and 67-69. */
export function slotKindsForWave(wave: number): SlotKind[] {
  return isInfernoWave(wave) ? waveSpawnKinds(wave).filter(isSlotKind) : [];
}

function countKey(kinds: readonly SlotKind[]): string {
  return WAVE_NPC_SPAWN_ORDER.map((kind) => kinds.filter((candidate) => candidate === kind).length).join(',');
}

/** "1 ranger, 1 meleer and 2 blobs", in spawn order. */
function describeKinds(kinds: readonly SlotKind[]): string {
  const parts = WAVE_NPC_SPAWN_ORDER.flatMap((kind) => {
    const count = kinds.filter((candidate) => candidate === kind).length;
    if (count === 0) return [];
    const names = WAVE_NPC_NAMES[kind];
    return [`${count} ${count === 1 ? names.one : names.many}`];
  });
  return parts.length <= 1 ? parts.join('') : `${parts.slice(0, -1).join(', ')} and ${parts.at(-1)}`;
}

/** The one wave (1-66) whose slot NPCs are exactly `kinds`, or null if none is. */
export function inferWaveFromKinds(kinds: readonly SlotKind[]): number | null {
  if (kinds.length === 0) return null;
  const key = countKey(kinds);
  for (let wave = FIRST_INFERNO_WAVE; wave <= LAST_PILLAR_WAVE; wave++) {
    if (countKey(slotKindsForWave(wave)) === key) return wave;
  }
  return null;
}

/**
 * Checks a placement for `wave`, returning the layout or a short message a player can act on. It may
 * place any of the wave's slot NPCs, at least one, each kind no more often than the wave spawns it:
 * the rest spawn at random (`planWaveSpawns`).
 */
export function validateSpawnLayout(wave: number, slots: readonly (SlotKind | null)[]): SpawnLayoutResult {
  if (!Number.isInteger(wave) || wave < FIRST_INFERNO_WAVE || wave > LAST_PILLAR_WAVE) {
    return { ok: false, error: 'bad-wave', message: `Spawn layouts are for waves 1 to ${LAST_PILLAR_WAVE}.` };
  }
  const expected = slotKindsForWave(wave);
  if (expected.length === 0) {
    return {
      ok: false,
      error: 'no-slot-npcs',
      message: `Wave ${wave} spawns only nibblers, so it has no spawns to set.`,
    };
  }
  if (slots.length !== SLOT_COUNT) {
    return { ok: false, error: 'bad-slots', message: `A spawn layout has ${SLOT_COUNT} spawn tiles.` };
  }
  const placed = slots.filter((kind): kind is SlotKind => kind !== null);
  if (placed.length === 0) return { ok: false, error: 'empty', message: 'Place at least one monster.' };
  const fits = WAVE_NPC_SPAWN_ORDER.every(
    (kind) => placed.filter((candidate) => candidate === kind).length <= expected.filter((k) => k === kind).length,
  );
  if (!fits) {
    return {
      ok: false,
      error: 'composition-mismatch',
      message: `Those spawns do not fit wave ${wave}, which has ${describeKinds(expected)}.`,
    };
  }
  return { ok: true, layout: { wave, slots: [...slots] } };
}

/** Whether `layout` places every one of its wave's slot NPCs, leaving none to spawn at random. */
export function isCompleteSpawnLayout(layout: InfernoSpawnLayout): boolean {
  return layout.slots.filter(Boolean).length === slotKindsForWave(layout.wave).length;
}

const KIND_CHAR: Readonly<Record<SlotKind, string>> = { bat: 'b', blob: 'l', meleer: 'm', ranger: 'r', mager: 'g' };
const CHAR_KIND: Readonly<Record<string, SlotKind>> = Object.fromEntries(
  Object.entries(KIND_CHAR).map(([kind, char]) => [char, kind as SlotKind]),
);
const SERIALIZED = /^([1-9]\d?):([-blmrg]{9})$/;

/** The `infernoSpawnLayout` mechanics value for `layout`. */
export function serializeSpawnLayout(layout: InfernoSpawnLayout): string {
  return `${layout.wave}:${layout.slots.map((kind) => (kind === null ? '-' : KIND_CHAR[kind])).join('')}`;
}

/** A stored `infernoSpawnLayout` value: null (random spawns) for '', garbage or an invalid layout. */
export function parseSpawnLayout(value: unknown): InfernoSpawnLayout | null {
  if (typeof value !== 'string') return null;
  const match = SERIALIZED.exec(value);
  if (!match) return null;
  const slots = [...match[2]].map((char) => (char === '-' ? null : CHAR_KIND[char]));
  const result = validateSpawnLayout(Number(match[1]), slots);
  return result.ok ? result.layout : null;
}

/**
 * The layout a planned batch (`planWaveSpawns`) put on the slots, random or custom: each slot NPC's
 * tile mapped back to its slot. Null for a wave with nothing to place (nibbler-only waves, 67-69)
 * or a batch whose slot NPCs are not exactly the wave's, one per slot.
 */
export function layoutFromPlacements(
  wave: number,
  placements: readonly { readonly kind: WaveNpcKind; readonly position: Readonly<Coordinate> }[],
): InfernoSpawnLayout | null {
  if (slotKindsForWave(wave).length === 0) return null;
  const slots: (SlotKind | null)[] = Array.from({ length: SLOT_COUNT }, () => null);
  for (const { kind, position } of placements) {
    if (!isSlotKind(kind)) continue;
    const index = INFERNO_SPAWN_SLOTS.findIndex(([x, y]) => x === position[0] && y === position[1]);
    if (index < 0 || slots[index] !== null) return null;
    slots[index] = kind;
  }
  const result = validateSpawnLayout(wave, slots);
  return result.ok && isCompleteSpawnLayout(result.layout) ? result.layout : null;
}

// ---------------------------------------------------------------------------------------------
// Setup links
// ---------------------------------------------------------------------------------------------

/**
 * The setup link's query parameters, e.g.
 * `/inferno/?wave=31&blob=[[16,17],[23,12]]&melee=[[1,5]]&ranger=[[22,5]]&pillars=west`.
 *
 * - `bat`, `blob`, `melee`, `ranger`, `mager`: the RuneLite Inferno Stats plugin's own parameters,
 *   each a JSON-style list of `[x,y]` tiles, brackets and commas raw or percent-encoded. Its tiles are
 *   `x = regionX - 17`, `y = 46 - regionY` of the NPC's SW tile, so our local slot is
 *   `(x + 17, 46 - y)`; every tile must be one of the nine spawn slots. The plugin sends nothing
 *   for nibblers and Jads, and its trailing `copyable` flag is ignored.
 * - `wave` (our addition, 1-69): the start wave. Without it the wave is inferred from the species
 *   counts, which must then be a whole wave's; with it they may place only some of that wave's slot
 *   NPCs (a partial layout: the rest spawn at random). A `wave` alone starts there with random spawns.
 * - `pillars` (our addition): a comma list of the pillars already DESTROYED, from
 *   `west`, `south`, `northeast`. Absent: all standing.
 * - `player` (our addition): the start tile, `[x,y]` in the same coordinates as the monsters. Used
 *   on waves 2-68 only (wave 1 lands, wave 69 has its own start), so ignored on 1 and 69. Absent:
 *   the player's own start tile is kept.
 */
export const INFERNO_SETUP_PARAMS = ['wave', 'bat', 'blob', 'melee', 'ranger', 'mager', 'pillars', 'player'] as const;
/** Inferno Stats appends `&copyable`; it carries nothing. */
export const INFERNO_IGNORED_PARAMS = ['copyable'] as const;

/** A RuneLite Inventory Setups export string (URL-encoded JSON); read by the boot link, not here. */
export const INFERNO_GEAR_PARAM = 'setup';

/** Inferno Stats' parameter name for each slot kind, in the order it writes them. */
const SPECIES_PARAMS: readonly { readonly param: string; readonly kind: SlotKind }[] = [
  { param: 'bat', kind: 'bat' },
  { param: 'blob', kind: 'blob' },
  { param: 'melee', kind: 'meleer' },
  { param: 'ranger', kind: 'ranger' },
  { param: 'mager', kind: 'mager' },
];

const PILLAR_PARAM_NAMES: Readonly<Record<PillarKey, string>> = {
  west: 'west',
  south: 'south',
  northEast: 'northeast',
};
const PILLAR_ORDER = ['west', 'south', 'northEast'] as const satisfies readonly PillarKey[];

/** The tile Inferno Stats writes for local tile `(x, y)`. */
function toLinkTile([x, y]: readonly [number, number]): [number, number] {
  return [x - 17, 46 - y];
}

/** The local tile for an Inferno Stats tile (the inverse of {@link toLinkTile}). */
function fromLinkTile([x, y]: readonly [number, number]): Coordinate {
  return [x + 17, 46 - y];
}

function slotIndexOfLinkTile(x: number, y: number): number {
  return INFERNO_SPAWN_SLOTS.findIndex((slot) => {
    const [lx, ly] = toLinkTile(slot);
    return lx === x && ly === y;
  });
}

/** The setup a link carries: what the player starts on. */
export interface InfernoLinkSetup {
  readonly startWave: number;
  /** Null: random spawns. Always for `startWave`. */
  readonly layout: InfernoSpawnLayout | null;
  readonly destroyedPillars: Readonly<Record<PillarKey, boolean>>;
  /**
   * The start tile (local), on waves 2-68 only; absent or null: none named, so the player's own is
   * kept. Parsed links always set it (null where the link has none or the wave ignores it).
   */
  readonly startTile?: Readonly<Coordinate> | null;
}

export type InfernoLinkError =
  | 'bad-param'
  | 'bad-wave'
  | 'missing-wave'
  | 'bad-tiles'
  | 'unknown-tile'
  | 'shared-tile'
  | 'no-matching-wave'
  | 'bad-pillars'
  | 'bad-player'
  | SpawnLayoutError;

export type InfernoLinkResult =
  | {
      readonly ok: true;
      /** Null when the link names none of {@link INFERNO_SETUP_PARAMS}. */
      readonly setup: InfernoLinkSetup | null;
    }
  | { readonly ok: false; readonly error: InfernoLinkError; readonly message: string };

function linkError(error: InfernoLinkError, message: string): InfernoLinkResult {
  return { ok: false, error, message };
}

/** `[[x,y],...]` as JSON after dropping whitespace; null when it is anything else. */
function parseTiles(raw: string): [number, number][] | null {
  let decoded: unknown;
  try {
    decoded = JSON.parse(raw.replace(/\s+/g, ''));
  } catch {
    return null;
  }
  if (!Array.isArray(decoded)) return null;
  const tiles: [number, number][] = [];
  for (const tile of decoded) {
    if (!Array.isArray(tile) || tile.length !== 2 || !tile.every((value) => Number.isInteger(value))) return null;
    tiles.push([tile[0], tile[1]]);
  }
  return tiles;
}

/**
 * Reads a setup link's query. Never throws: a link that cannot be applied as a whole comes back as
 * an error with a message to show, and applies nothing.
 */
export function parseInfernoSetupParams(search: URLSearchParams): InfernoLinkResult {
  for (const name of INFERNO_SETUP_PARAMS) {
    if (search.getAll(name).length > 1) return linkError('bad-param', `The link gives “${name}” more than once.`);
  }
  if (!INFERNO_SETUP_PARAMS.some((name) => search.has(name))) return { ok: true, setup: null };

  let wave: number | null = null;
  const rawWave = search.get('wave');
  if (rawWave !== null) {
    const trimmed = rawWave.trim();
    const parsed = /^\d{1,3}$/.test(trimmed) ? Number(trimmed) : Number.NaN;
    if (!(parsed >= FIRST_INFERNO_WAVE && parsed <= ZUK_WAVE)) {
      return linkError('bad-wave', `“${rawWave}” is not a wave from ${FIRST_INFERNO_WAVE} to ${ZUK_WAVE}.`);
    }
    wave = parsed;
  }

  const slots: (SlotKind | null)[] = Array.from({ length: SLOT_COUNT }, () => null);
  const placed: SlotKind[] = [];
  for (const { param, kind } of SPECIES_PARAMS) {
    const raw = search.get(param);
    if (raw === null) continue;
    const tiles = parseTiles(raw);
    if (!tiles) return linkError('bad-tiles', `Could not read the ${WAVE_NPC_NAMES[kind].one} tiles in the link.`);
    for (const [x, y] of tiles) {
      const index = slotIndexOfLinkTile(x, y);
      if (index < 0) {
        return linkError('unknown-tile', `The ${WAVE_NPC_NAMES[kind].one} tile [${x},${y}] is not a spawn tile.`);
      }
      if (slots[index] !== null) return linkError('shared-tile', `Two monsters share the spawn tile [${x},${y}].`);
      slots[index] = kind;
      placed.push(kind);
    }
  }

  let layout: InfernoSpawnLayout | null = null;
  if (placed.length > 0) {
    const layoutWave = wave ?? inferWaveFromKinds(placed);
    if (layoutWave === null) {
      return linkError('no-matching-wave', `No wave spawns exactly ${describeKinds(placed)}.`);
    }
    const validated = validateSpawnLayout(layoutWave, slots);
    if (!validated.ok) return validated;
    layout = validated.layout;
    wave = layoutWave;
  }
  if (wave === null) return linkError('missing-wave', 'The link does not say which wave to start on.');

  const destroyedPillars: Record<PillarKey, boolean> = { west: false, south: false, northEast: false };
  const rawPillars = search.get('pillars');
  if (rawPillars !== null) {
    for (const name of rawPillars.split(',').map((part) => part.trim().toLowerCase())) {
      if (name === '') continue;
      const key = PILLAR_ORDER.find((candidate) => PILLAR_PARAM_NAMES[candidate] === name);
      if (!key) return linkError('bad-pillars', `“${name}” is not a pillar. Use west, south or northeast.`);
      destroyedPillars[key] = true;
    }
  }

  let startTile: Coordinate | null = null;
  const rawPlayer = search.get('player');
  if (rawPlayer !== null && startTileApplies(wave)) {
    const tiles = parseTiles(rawPlayer) ?? parseTiles(`[${rawPlayer}]`);
    if (!tiles || tiles.length !== 1) return linkError('bad-player', 'Could not read the player tile in the link.');
    const [x, y] = tiles[0];
    const tile = fromLinkTile([x, y]);
    const check = validateInfernoStartTile(tile, { startWave: wave, destroyedPillars });
    if (!check.ok) {
      const problem = check.reason === 'pillar' ? 'is under a standing pillar' : 'is outside the arena';
      return linkError('bad-player', `The player tile [${x},${y}] ${problem}.`);
    }
    startTile = tile;
  }
  return { ok: true, setup: { startWave: wave, layout, destroyedPillars, startTile } };
}

/**
 * A link that reopens `setup`: `<origin>/inferno/?wave=N`, then the Inferno Stats species
 * parameters for a layout, then `pillars` when any is down, then `player` for a start tile on waves
 * 2-68, then `setup` (an Inventory Setups export
 * string, see `src/data/inventorySetupIO.ts`) when gear is given. Brackets and commas are written
 * raw, as the plugin writes them. `origin` is the page's own, `window.location.origin`.
 */
export function buildInfernoSetupUrl(origin: string, setup: InfernoLinkSetup, gearSetup?: string): string {
  return `${origin.replace(/\/+$/, '')}/inferno/?${buildInfernoSetupQuery(setup, gearSetup)}`;
}

/** {@link buildInfernoSetupUrl}'s query alone, without the `?`. */
export function buildInfernoSetupQuery(setup: InfernoLinkSetup, gearSetup?: string): string {
  if (setup.layout && setup.layout.wave !== setup.startWave) {
    throw new RangeError(`A setup link names one wave: layout ${setup.layout.wave}, start ${setup.startWave}`);
  }
  const parts = [`wave=${setup.startWave}`];
  if (setup.layout) {
    const slots = setup.layout.slots;
    for (const { param, kind } of SPECIES_PARAMS) {
      const tiles = INFERNO_SPAWN_SLOTS.filter((_, index) => slots[index] === kind).map((slot) => toLinkTile(slot));
      if (tiles.length > 0) parts.push(`${param}=[${tiles.map(([x, y]) => `[${x},${y}]`).join(',')}]`);
    }
  }
  const destroyed = PILLAR_ORDER.filter((key) => setup.destroyedPillars[key]);
  if (destroyed.length > 0) parts.push(`pillars=${destroyed.map((key) => PILLAR_PARAM_NAMES[key]).join(',')}`);
  if (setup.startTile && startTileApplies(setup.startWave)) {
    const [x, y] = toLinkTile([setup.startTile[0], setup.startTile[1]]);
    parts.push(`player=[${x},${y}]`);
  }
  if (gearSetup !== undefined) parts.push(`setup=${encodeURIComponent(gearSetup)}`);
  return parts.join('&');
}
