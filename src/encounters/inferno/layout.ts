import {
  chooseDistinct,
  type DecisionKey,
  type DecisionRandom,
  generatorDecisionRandom,
  uniformOptions,
} from '../../core/decisionRandom';
import { fmix32, mulberry32 } from '../../core/rng';
import { INFERNO_WAVE_JAD_SCHEDULE } from '../../npcs/inferno/waveNpcs';
import type { Coordinate } from '../../types/simulation';
import {
  INFERNO_SPAWN_SLOTS,
  JAD_HEALER_SPAWN_DISTANCE,
  NIBBLER_SPAWN_AREA,
  WAVE_67_JAD_TILE,
  WAVE_68_JAD_TILES,
} from './constants';
import type { InfernoSpawnLayout } from './spawnLayout';
import { type WaveNpcKind, waveSpawnKinds } from './waves';

export interface WaveSpawnPlacement {
  readonly kind: WaveNpcKind;
  readonly position: Coordinate;
  /** Jads only: first tell at spawn + `openingDelayTicks`, then every `rangedMagicPeriod`. */
  readonly jad?: { readonly openingDelayTicks: number; readonly rangedMagicPeriod: 8 | 9 };
}

/** Turns one of the wave's seeded streams into labeled decisions; tests substitute constrained ones. */
export type WaveStreamDecisions = (next: () => number) => DecisionRandom;

const LAYOUT_STREAM = 0x4c41594f;
const NPC_STREAM = 0x4e504353;
const NIBBLER_TARGET_STREAM = 0x4e494254;
const ATTEMPT_STREAM = 0x41545054;

function waveStreamSeed(runSeed: number, wave: number, stream: number): number {
  return fmix32((runSeed ^ Math.imul(wave, 0x9e3779b1) ^ stream) >>> 0);
}

/**
 * The seed the NPCs' decisions draw from (each wave's NPC stream, and wave 69's director). A run's
 * first attempt, which has no attempt seed, draws them from `runSeed` itself. A retry keeps
 * `runSeed`, so its layout and nibbler pillar repeat, but salts this with its own `attemptSeed`, so
 * the monsters' hits and placements roll afresh (docs/encounters/inferno-policy.md, Seeds).
 */
export function npcDecisionSeed(runSeed: number, attemptSeed: number | undefined): number {
  if (attemptSeed === undefined) return runSeed;
  return fmix32((runSeed ^ fmix32((attemptSeed ^ ATTEMPT_STREAM) >>> 0)) >>> 0);
}

/**
 * The wave's own layout stream, derived from `(runSeed, wave)` alone and independent of combat and
 * NPC randomness, so retrying a wave with the same run seed reproduces its layout (policy).
 */
export function waveLayoutRandom(runSeed: number, wave: number): () => number {
  return mulberry32(waveStreamSeed(runSeed, wave, LAYOUT_STREAM));
}

/**
 * NPC decision stream for the wave (healer and resurrection placement, definition rolls), from
 * `npcSeed` (`npcDecisionSeed`), never the layout's.
 */
export function waveNpcRandom(npcSeed: number, wave: number): () => number {
  return mulberry32(waveStreamSeed(npcSeed, wave, NPC_STREAM));
}

/**
 * The one pillar every nibbler of the wave heads for (105/105 captured waves share one; no
 * deterministic rule fits), drawn uniformly (policy) among the pillars standing when the wave spawns,
 * from its own `(runSeed, wave)` stream so a retry repeats it. Null when none stands.
 */
export function pickWaveNibblerTarget<T>(
  runSeed: number,
  wave: number,
  standing: readonly T[],
  decide: WaveStreamDecisions = generatorDecisionRandom,
  tick = -1,
): T | null {
  if (standing.length === 0) return null;
  const decisions = decide(mulberry32(waveStreamSeed(runSeed, wave, NIBBLER_TARGET_STREAM)));
  // A lone standing pillar is still drawn for, as before labeling.
  return decisions.choose({ site: 'inferno.nibbler.pillar', tick }, uniformOptions(standing));
}

/** Fisher-Yates from the top: swap `ordinal` with an index in [0, ordinal] (`inferno.layout.<site>`). */
function shuffled<T>(items: readonly T[], decisions: DecisionRandom, site: string, tick: number): T[] {
  const result = [...items];
  for (let index = result.length - 1; index > 0; index--) {
    const swap = decisions.int({ site, tick, ordinal: index }, 0, index);
    [result[index], result[swap]] = [result[swap], result[index]];
  }
  return result;
}

/**
 * The slots for the batch's slot NPCs, in spawn order: each NPC the layout places takes its slot (two
 * of a kind fill theirs in slot order), and the rest take the shuffled slots the layout leaves free,
 * in shuffle order. A layout may place any of the wave's slot NPCs (`validateSpawnLayout`); a
 * complete one leaves none to the shuffle.
 */
function chosenSlots(
  kinds: readonly WaveNpcKind[],
  layout: InfernoSpawnLayout,
  shuffledIndices: readonly number[],
): Coordinate[] {
  const taken = new Set<number>();
  const free = shuffledIndices.filter((index) => layout.slots[index] === null);
  let nextFree = 0;
  const slots = kinds
    .filter((kind) => kind !== 'nibbler')
    .map((kind) => {
      const placed = layout.slots.findIndex((slotKind, candidate) => slotKind === kind && !taken.has(candidate));
      const index = placed >= 0 ? placed : free[nextFree++];
      if (index === undefined) throw new RangeError(`Wave ${layout.wave} has more slot NPCs than free spawn slots`);
      taken.add(index);
      return INFERNO_SPAWN_SLOTS[index];
    });
  if (layout.slots.some((kind, index) => kind !== null && !taken.has(index))) {
    throw new RangeError(`Spawn layout places more NPCs than wave ${layout.wave} spawns`);
  }
  return slots;
}

/**
 * The wave-start batch in spawn order. Policy (docs/encounters/inferno-policy.md): a uniform
 * shuffle of the nine slots for ordinary NPCs, nibblers uniform with replacement over their 3x3 area,
 * fixed Jad tiles, and a seeded spawn order for the three wave-68 Jads whose openings follow it.
 *
 * A `spawnLayout` for this wave (a practice option) places its slot NPCs instead of the shuffle,
 * and a partial one's other slot NPCs fill the slots it leaves free in shuffle order (policy). The
 * shuffle is always drawn, so the nibblers that follow it on the same stream land where they would
 * have; a layout for another wave changes nothing.
 */
export function planWaveSpawns(
  runSeed: number,
  wave: number,
  decide: WaveStreamDecisions = generatorDecisionRandom,
  tick = -1,
  spawnLayout: InfernoSpawnLayout | null = null,
): WaveSpawnPlacement[] {
  const decisions = decide(waveLayoutRandom(runSeed, wave));
  const kinds = waveSpawnKinds(wave);
  if (wave === 67 || wave === 68) {
    const schedule = INFERNO_WAVE_JAD_SCHEDULE[wave];
    const tiles = wave === 67 ? [WAVE_67_JAD_TILE] : shuffled(WAVE_68_JAD_TILES, decisions, 'inferno.layout.jad', tick);
    // Openings follow spawn (index) order, not position: P opened east-first, Q south-first.
    return tiles.map((tile, index) => ({
      kind: 'jad',
      position: [...tile],
      jad: { openingDelayTicks: schedule.openingDelayTicks[index], rangedMagicPeriod: schedule.rangedMagicPeriod },
    }));
  }
  // Indices rather than tiles: the same draws (they depend on the length alone), and a partial
  // layout's free slots can be read off them.
  const shuffledIndices = shuffled(
    INFERNO_SPAWN_SLOTS.map((_, index) => index),
    decisions,
    'inferno.layout.slot',
    tick,
  );
  const slots =
    spawnLayout?.wave === wave
      ? chosenSlots(kinds, spawnLayout, shuffledIndices)
      : shuffledIndices.map((index) => INFERNO_SPAWN_SLOTS[index]);
  let nextSlot = 0;
  let nextNibbler = 0;
  return kinds.map((kind): WaveSpawnPlacement => {
    if (kind === 'nibbler') {
      const ordinal = nextNibbler++;
      const x = decisions.int(
        { site: 'inferno.layout.nibbler_x', tick, ordinal },
        NIBBLER_SPAWN_AREA.minX,
        NIBBLER_SPAWN_AREA.maxX,
      );
      const y = decisions.int(
        { site: 'inferno.layout.nibbler_y', tick, ordinal },
        NIBBLER_SPAWN_AREA.minY,
        NIBBLER_SPAWN_AREA.maxY,
      );
      return { kind, position: [x, y] };
    }
    const slot = slots[nextSlot++];
    if (!slot) throw new RangeError(`Wave ${wave} has more slot NPCs than the nine spawn slots`);
    return { kind, position: [...slot] };
  });
}

export interface JadHealerPlacement {
  readonly isOpen: (x: number, y: number) => boolean;
  /** The player's tile when the healers are added; never a spawn tile. */
  readonly player: Readonly<Coordinate> | null;
  readonly decisions: DecisionRandom;
  readonly key: Omit<DecisionKey, 'ordinal'>;
}

/** The fallback's reach beyond the footprint, should the distance band run short. */
const JAD_HEALER_FALLBACK_RADIUS = 8;

/**
 * Waves 67-68 Yt-HurKot spawn tiles, a simulator policy fitted to captures, not a verified rule
 * (inferno-policy.md, Jad healer placement): `count` distinct open tiles, never the player's, drawn
 * uniformly without replacement (`chooseDistinct`) from those within `JAD_HEALER_SPAWN_DISTANCE` of
 * the Jad's center tile; at 4+ tiles from the center they all lie outside its footprint. Should the
 * band run short, the nearest free open tiles around the footprint fill in undrawn. Fewer than `count`
 * come back only when no such tile is left (never in the real arena): no healer is invented onto a
 * blocked, taken or player tile.
 */
export function pickJadHealerTiles(
  jad: { readonly position: Readonly<Coordinate>; readonly size: number },
  count: number,
  { isOpen, player, decisions, key }: JadHealerPlacement,
): Coordinate[] {
  const [jx, jy] = jad.position;
  const centre = (jad.size - 1) / 2;
  const [cx, cy] = [jx + centre, jy + centre];
  const free = (x: number, y: number) => isOpen(x, y) && !(player && player[0] === x && player[1] === y);
  const { min, max } = JAD_HEALER_SPAWN_DISTANCE;
  const band: Coordinate[] = [];
  for (let x = Math.floor(cx - max); x <= Math.ceil(cx + max); x++) {
    for (let y = Math.floor(cy - max); y <= Math.ceil(cy + max); y++) {
      const squared = (x - cx) ** 2 + (y - cy) ** 2;
      if (squared >= min * min && squared <= max * max && free(x, y)) band.push([x, y]);
    }
  }
  const tiles = chooseDistinct(decisions, key, band, count);
  const taken = (x: number, y: number) => tiles.some(([tx, ty]) => tx === x && ty === y);
  for (let radius = 1; radius <= JAD_HEALER_FALLBACK_RADIUS && tiles.length < count; radius++) {
    for (let x = jx - radius; x <= jx + jad.size - 1 + radius && tiles.length < count; x++) {
      for (let y = jy - radius; y <= jy + jad.size - 1 + radius && tiles.length < count; y++) {
        const ring = Math.max(jx - x, x - (jx + jad.size - 1), jy - y, y - (jy + jad.size - 1));
        if (ring === radius && free(x, y) && !taken(x, y)) tiles.push([x, y]);
      }
    }
  }
  return tiles;
}
