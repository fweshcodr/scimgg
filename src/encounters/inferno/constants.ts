import type { Coordinate } from '../../types/simulation';

// Facts and policy: docs/encounters/inferno-facts-spec.md, docs/encounters/inferno-policy.md.
// Waves 1-68 run in the same map square and local frame as Zuk (world = local + (2240, 5312)); the
// map-square literals live in ../zuk/constants.ts, which keeps them in the production cache trim.
export {
  ZUK_ARENA_BOUNDS as INFERNO_ARENA_BOUNDS,
  ZUK_MAP_SQUARE as INFERNO_MAP_SQUARE,
  ZUK_MAP_SQUARE_OFFSETS as INFERNO_MAP_SQUARE_OFFSETS,
} from '../zuk/constants';

export const INFERNO_KIND = 'inferno';

export const FIRST_INFERNO_WAVE = 1;
/** The last wave of ordinary monsters; the one after it is TzKal-Zuk's. */
export const LAST_ORDINARY_WAVE = 68;
/** TzKal-Zuk's wave, the run's last: `src/encounters/zuk/` directs it. */
export const ZUK_WAVE = 69;
/**
 * The start wave of an untouched setup (new players, Reset to defaults, a missing or unreadable saved
 * value): TzKal-Zuk, the fight most players open the Inferno to practice. Simulator policy
 * (docs/encounters/inferno-policy.md).
 */
export const INFERNO_DEFAULT_START_WAVE = ZUK_WAVE;
/** Pillars stand through wave 66 and collapse together on its completion tick. */
export const LAST_PILLAR_WAVE = 66;

/** P:232, the landing tile: where a run started on wave 1 lands. */
export const INFERNO_LANDING_TILE: Coordinate = [30, 32];
/**
 * Where a run started on waves 2-68 opens unless the player picks another tile (`infernoStartTile`):
 * the north-east pillar (SW 34,39) covers x 34-36, y 39-41, so its north wall's west tile is (34,42),
 * and this is two tiles north of that. Simulator policy, not a game fact
 * (docs/encounters/inferno-policy.md).
 */
export const INFERNO_PRACTICE_START_TILE: Coordinate = [34, 44];
/**
 * P:233 `sequence id=quest_lunar_landing_on_face (4367)` with the landing teleport at t459, ten ticks
 * before control (P:293 `busy` 1→0, t469). Frame-based in our cache: 41 frames, 268 client cycles
 * (~8.9 ticks).
 */
export const INFERNO_LANDING_SEQ_ID = 4367;
/** P:230 `message_game type=mesbox` at the landing; its message box closes at control (P:295). */
export const INFERNO_LANDING_MESSAGE = 'You hit the ground in the centre of The Inferno.';
/** Control + 11 to the first wave (P t469 -> t480; both resumes agree). */
export const FIRST_WAVE_DELAY_TICKS = 11;
/**
 * A run started on waves 2-68 spawns its wave on the first tick after GO: a practice convenience,
 * not the capture's +11, which only an entry (wave 1) has (docs/encounters/inferno-policy.md).
 */
export const PRACTICE_START_WAVE_DELAY_TICKS = 1;

/** Ticks from control (tick 0) to the first wave of a run started on `startWave` (1-68). */
export function startWaveDelayTicks(startWave: number): number {
  return startWave === FIRST_INFERNO_WAVE ? FIRST_WAVE_DELAY_TICKS : PRACTICE_START_WAVE_DELAY_TICKS;
}
/** Completion + 6 to the next wave (106/106 transitions). */
export const NEXT_WAVE_DELAY_TICKS = 6;
/**
 * Wave 68's completion to the start of wave 69's intro (busy, C-12). Simulator policy, not
 * evidence: no capture records the clear of wave 68 together with the intro. It reuses the ordinary
 * +6 wave gap (docs/encounters/inferno-policy.md, Wave 69 transition).
 */
export const ZUK_INTRO_DELAY_TICKS = NEXT_WAVE_DELAY_TICKS;

/** P:480 `<col=ef1020>Wave: N</col>`. */
export const WAVE_MESSAGE_COLOR = '#ef1020';

/** Nine fixed SW tiles for wave-start bats, blobs, meleers, rangers and magers; never two in one wave. */
export const INFERNO_SPAWN_SLOTS: readonly Coordinate[] = [
  [18, 41],
  [20, 35],
  [18, 18],
  [22, 23],
  [32, 18],
  [40, 21],
  [33, 29],
  [40, 34],
  [39, 41],
];

/** Nibblers: independently, with replacement, over this inclusive 3x3 area. */
export const NIBBLER_SPAWN_AREA = { minX: 25, maxX: 27, minY: 33, maxY: 35 } as const;

/** P:175851, 183429-183431. */
export const WAVE_67_JAD_TILE: Coordinate = [25, 35];
export const WAVE_68_JAD_TILES: readonly Coordinate[] = [
  [34, 34],
  [25, 35],
  [28, 23],
];
/**
 * Waves 67-68 Yt-HurKot spawn tiles: Euclidean distance from the Jad's center tile, inclusive. Simulator
 * policy fitted to 28 captured healers (8 batches), NOT a verified game rule (inferno-policy.md, Jad
 * healer placement; derivation in inferno-open-questions.md C15).
 */
export const JAD_HEALER_SPAWN_DISTANCE = { min: 4, max: 8 } as const;

// Species ids and seqs: `INFERNO_WAVE_NPC_IDS` / `INFERNO_WAVE_SEQS` in src/npcs/inferno/constants.ts.
// The encounter-owned Rocky support actors; `_NPC_ID` keeps them in the production cache trim.
export const INFERNO_PILLAR_NPC_ID = 7709;
export const INFERNO_PILLAR_COLLAPSE_NPC_ID = 7710;

/** Area sound 1021, centered on the pillar's SW + (1, 1). */
export const PILLAR_COLLAPSE_SOUND_ID = 1021;
