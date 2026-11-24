/**
 * Sol Heredit's fixed parameters.
 *
 * Capture aliases K/M/N and timing status tags follow
 * `docs/encounters/sol-heredit-facts-spec.md#timing-verification-ledger`.
 * VERIFIED denotes repeated capture agreement, not universality; published rules cite the Wiki.
 */
import type { ArenaRect } from '../../npcs/colosseum/solAttacks';
import type { Coordinate } from '../../types/simulation';

/**
 * The effect and boundary domain of Sol's arena: a 14x14 block minus its four corner tiles.
 *
 * Bounded in the captures by the shield-combatant LOCs just outside it (x=25/40 over y=29..40 and
 * y=27/42 over x=27..38), and reproduced by all 114 observed ground bursts. The Wiki's
 * "16x16 with corner protrusions" and "roughly 16x15" disagree with each other; the capture wins.
 */
export const SOL_ARENA: ArenaRect = { minX: 26, maxX: 39, minY: 28, maxY: 41 };

/** Sol's 5x5 footprint anchor at spawn, identical in both captures (K:3998, M:8273). */
export const SOL_START_POSITION: Coordinate = [31, 36];

/** Where the player is placed one tick before the fight clock starts (K:3997, M:8272). */
export const SOL_PLAYER_START: Coordinate = [33, 31];

/** Offset 1792/3072 divided by 64. One map square covers the whole arena. */
export const SOL_MAP_X = 28;
export const SOL_MAP_Y = 48;
export const SOL_MAP_SQUARE = { x: SOL_MAP_X, y: SOL_MAP_Y } as const;

// --- Phase transitions -----------------------------------------------------------------------

/** VERIFIED: sand emits taunt+1 in all 15 transitions; this is not pool appearance or damage. */
export const TRANSITION_SAND_DELAY_TICKS = 1;
/** VERIFIED: a new crystal spawns taunt+2 in all 12 non-enrage transitions. */
export const TRANSITION_CRYSTAL_DELAY_TICKS = 2;

/** VERIFIED: next attack follows taunt+7 in all 15 transitions. */
export const TRANSITION_ATTACK_RESUME_TICKS = 7;

// --- Molten sand -----------------------------------------------------------------------------

/** Wiki: candidates come from the 9x9 centered on the player; observed maximum distance is 4. */
export const SAND_PLACEMENT_RADIUS = 4;

/** Wiki: six tiles per transition. Observed batches are 4-6 because covered tiles yield nothing. */
export const SAND_BATCH_SIZE = 6;

/** VERIFIED: LOC appearance at emission+5 (29 batches). Visual only; damage starts earlier. */
export const SAND_POOL_DELAY_TICKS = 5;

/**
 * VERIFIED: a struck tile burns from emission+3, checked against the tile the player starts the
 * tick on. Spotanim 2698 (delay 30) opens with the white forming pool at E+1 and ends in the bolt,
 * so the player must click off the tick the white pool appears and be moved during E+2.
 * Leaving during E+1 or E+2 escapes (K:4106/4161/4200, A:5132; K:4023, A:5222, M:8460); still
 * standing on the tile at the end of E+2 is hit at E+3 even when stepping off that tick (K:4064).
 */
export const SAND_DAMAGE_ONSET_TICKS = 3;

/** Wiki enrage: five initial tiles, then one every three ticks (K:4207/4210/4213/4216/4219). */
export const ENRAGE_SAND_BATCH_SIZE = 5;
/**
 * VERIFIED: enrage singles follow a three-tick grid; some slots yield no new tile. One placement
 * roll per slot is a known under-fit (two attempts fit L better); the attempt count is UNVERIFIED.
 * See docs/encounters/sol-heredit-unverified.md#sand--pools and capture analysis §13.
 */
export const ENRAGE_SAND_INTERVAL_TICKS = 3;

/**
 * UNVERIFIED: first singles are +6 (N 7725->7731), +7 (K and L 5749->5756), +8 (M); four offsets
 * do not establish the seeded random law used by the model.
 */
export const ENRAGE_SAND_FIRST_SINGLE_DELAY_TICKS: readonly [number, number] = [6, 8];

/** Wiki: "approximately 6-8 per tick". K:4067's 8 is only inferred to be sand and precedes the LOC. */
export const SAND_MIN_DAMAGE = 6;
export const SAND_MAX_DAMAGE = 8;

// --- Beam crystals ---------------------------------------------------------------------------

/** VERIFIED: charge to fire is 4 in all 19 completed ordinary rounds. */
export const BEAM_CHARGE_TICKS = 4;
/** VERIFIED: charge to fire is 3 in all 5 completed enraged rounds (K 1, N 4). */
export const BEAM_ENRAGE_CHARGE_TICKS = 3;

/**
 * VERIFIED: all 26 warnings precede charge by 3 ticks, on 23 regular and 3 triple telegraphs.
 * The second sound's delay (210, or 180 enraged) commits the charge length at the warning.
 */
export const BEAM_PREPARATION_LEAD_TICKS = 3;

/** Emitted with `fireInTicks` on the preparation tick; drives the warning sounds only. */
export const SOL_BEAM_PREPARED_EVENT = 'sol_beam_prepared';

/** VERIFIED: ordinary patrol resumes fire+3 across the three capture timelines. */
export const CRYSTAL_RESUME_AFTER_FIRE_TICKS = 3;
/** VERIFIED: enraged patrol resumes fire+2 (K:4214; N:7739/7751/7763/7774). */
export const CRYSTAL_ENRAGED_RESUME_AFTER_FIRE_TICKS = 2;

/**
 * Wiki overview: up to 75. The strategy page says "70+". The one captured beam hit is 67
 * (L:5584, unprotected, Relentless II), which neither sets a minimum nor a distribution.
 * UNVERIFIED (simulator policy): 40..75, the higher of two rolls as Sol's AoE uses, plus the Relentless
 * max-hit bonus; one hit per fire even where lines cross; protection prayers do not reduce it.
 */
export const BEAM_MIN_HIT = 40;
export const BEAM_MAX_HIT = 75;

/**
 * MODEL: after each fire in phases 0-4 the next round is ready a uniform 22-29 ticks later, with no
 * phase dependence. `__tests__/beamTimeline.test.ts` replays the captures conditioned on recorded
 * attack ticks and fitted rolls, so neither the distribution nor its endpoints are verified.
 * Derivation: docs/encounters/sol-heredit-capture-analysis.md#12-beams-are-announced-on-sols-attacks;
 * status: docs/encounters/sol-heredit-unverified.md#beams--crystals.
 */
export const BEAM_READY_DELAY_TICKS: readonly [number, number] = [22, 29];
/** MODEL: enraged rounds are ready 5 ticks after a fire; consistent with K/N and L's 5 enraged gaps. */
export const BEAM_ENRAGE_READY_DELAY_TICKS = 5;

// --- Fight lifecycle -------------------------------------------------------------------------

/** VERIFIED: Sol removal is death+9 in all 3 captures; reward-chest timing is not identical. */
export const SOL_VICTORY_COMPLETION_DELAY_TICKS = 9;

/**
 * "Sol Heredit jumps down from his seat..." arrives at control-5 (L:3446, control 3451), before the
 * fight the simulation models begins, so it goes out on the first simulated tick instead.
 */
export const SOL_ENTRY_MESSAGE_TICK = 1;
/** VERIFIED: opening taunt is control+3 in all 3 captures (K:4001, M:8276, N:7305). */
export const SOL_OPENING_TAUNT_TICK = 3;
/** SINGLE-OBSERVATION: K attacks at control+5; M +6 and N +8 are delayed by approach/reach. */
export const SOL_FIRST_ATTACK_TICK = 5;

/**
 * SINGLE-OBSERVATION: N first moves at control+6 (7308) while the player stays out of reach;
 * M holds through +5 but does not independently pin the release boundary.
 */
export const SOL_OPENING_HOLD_UNTIL_TICK = 6;

/**
 * VERIFIED in all four kills: the crystals play their despawn (seq 10800) on the death tick and are
 * removed at death+1, and the victory taunt is said at death+1 (K:4221/4222, M:8512/8513,
 * N:7781/7782, L:5833/5834). Exception: a crystal indexed below Sol, processed before his death
 * that tick, despawns one tick later (L beam 4: 10800 at L:5834, removed L:5835); NPC order is not
 * modeled. The pools follow `SOL_DEATH_SAND_REMOVAL_DELAY_TICKS` instead.
 */
export const SOL_DEATH_CLEANUP_DELAY_TICKS = 1;

/**
 * VERIFIED in all four kills: every pool LOC plays its despawn (loc_anim 10814, 60 cycles) on the
 * death tick, is sent it again at D+1, and is replaced by an invisible LOC at D+2 (K:4221-4223 29
 * pools, M:8512-8514 25, N:7781-7783 39, L:5833-5835 47). No kill had the player on a pool from D
 * to D+1, so whether they still burn is unrecorded; the sim stops sand damage at the death.
 */
export const SOL_DEATH_SAND_REMOVAL_DELAY_TICKS = 2;

// --- Modifier presentation schedules -----------------------------------------------------------

/** VERIFIED: A:4976 Sol/control -> A:4984 bee spawn = +8. Wave-message +5 is a different anchor. */
export const SOL_BEES_SPAWN_TICK = 8;
export const SOL_BEES_ACTOR_PREFIX = 'sol_bees';

/**
 * DERIVED (no Quartet capture of Sol): in all 28 captured waves the warband is added on the
 * "Wave: N" message tick, and Bees follow at wave-message+5 (B:2361->2366). Sol's Bees arrive at
 * control+8, so the Quartet warbander is placed five ticks earlier.
 */
export const SOL_QUARTET_SPAWN_TICK = SOL_BEES_SPAWN_TICK - 5;
export const SOL_QUARTET_ACTOR_ID = 'sol_quartet_warbander';
/**
 * MODEL: a seeded draw from the five captured Quartet members' wave spawn tiles (each one south of
 * its formation center; B:2201/2361/2630/2975/3347), as Bees draw from their observed tiles.
 */
export const SOL_QUARTET_SPAWN_TILES = [
  [34, 37],
  [30, 36],
  [31, 35],
  [35, 36],
  [31, 32],
] as const satisfies readonly Readonly<Coordinate>[];

export const SOL_TOTEMIC_ACTOR_PREFIX = 'sol_totem';
/**
 * WIKI-ONLY (no Sol capture has a totem): Strategies rev 15358918, "will heal him for 75 hitpoints".
 * The captured wave rule, floor(30%) of max HP, would give 450 here (facts-spec §Totemic).
 */
export const SOL_TOTEMIC_HEAL_AMOUNT = 75;
/**
 * WIKI-ONLY 200 ticks: Strategies rev 15358918, "After the first totem is destroyed, it will respawn
 * in 2 minutes" (also /w/Healing_totem rev 15259848). The waves only bound it from below (no repeat
 * within 50 ticks of a kill); see docs/encounters/sol-heredit-facts-spec.md#totemic.
 */
export const SOL_TOTEMIC_RESPAWN_TICKS = 200;

/** VERIFIED: M control 8273/add 8276/step 8277; A:4976/4979/4980. */
export const SOL_SOLARFLARE_SPAWN_TICK = 3;
export const SOL_SOLARFLARE_FIRST_STEP_TICK = 4;
export const SOL_SOLARFLARE_ACTOR_PREFIX = 'sol_solarflare';
/** M8512 death -> M8523 orb removal; this is later than the sim's D+9 victory boundary. */
export const SOL_SOLARFLARE_REMOVAL_DELAY_TICKS = 11;
/** M8512 -> 8521 and N7781 -> 7790. An encounter parameter, not a universal NPC delay. */
export const SOL_VOLATILITY_DELAY_TICKS = 9;

/**
 * M8276 spawn corners followed by the corners reached at 8283/8296/8309/8322.
 * VERIFIED: tier I in M; tier timings in Run A waves 5–7 and tier III routes at A:4980+.
 */
export const SOL_SOLARFLARE_ROUTES = [
  [
    [34, 36],
    [34, 40],
    [38, 40],
    [38, 36],
  ], // 45944: N,E,S,W
  [
    [34, 33],
    [38, 33],
    [38, 29],
    [34, 29],
  ], // 45945: E,S,W,N
  [
    [31, 36],
    [27, 36],
    [27, 40],
    [31, 40],
  ], // 45943: W,N,E,S
  [
    [31, 33],
    [31, 29],
    [27, 29],
    [27, 33],
  ], // 45946: S,W,N,E
] as const satisfies readonly (readonly Readonly<Coordinate>[])[];
