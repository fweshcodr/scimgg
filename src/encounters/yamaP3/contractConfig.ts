import type { PrayerReduction } from '../../core/combat/CombatSystem';
import type { DamageValue } from '../../core/combat/damageCalculation';
import type { EncounterEngineRules, MechanicsToggleInfo } from '../../core/encounters/types';
import { DEFAULT_YAMA_ATTACK_PATTERN, type ResolvedYamaAttackPattern } from '../../npcs/yama/timing';
import type { VoidFlareExplosionDamage } from '../../npcs/yama/voidFlare';
import { wretchedMinimumHit } from '../../npcs/yama/wretchedStrength';
import type { FailCondition } from '../../types/simulation';
import { YAMA_NPC_ID } from './constants';
import type { YamaEncounterKind } from './contracts';
import {
  DEFAULT_FIRST_CYCLE_DELTAS,
  DEFAULT_WAVE_DELTAS,
  DEFAULT_WAVE_PERIOD,
  DEFAULT_WAVE_SPEED,
  DEFAULT_WAVE_START_DELAY,
} from './waves';

export type { VoidFlareExplosionDamage } from '../../npcs/yama/voidFlare';

/**
 * Ticks from a flare's spawn to its explosion in phase 3. Every flare that reached its fuse in
 * the captures explodes on add + 3 + E/30 + 2, where E is the `endtime` of its fuse bar
 * (`headbar id=75`): the bar appears on add+3 and finishes two ticks before detonation. Phase-3
 * beat pairs and Divine Severance's drumbeat singles carry E=600, so they explode on add+25. The
 * 26 that phase-1/2 beat pairs show (E=630) does not apply here. The npc is removed two ticks
 * after it explodes. The flare lifecycles are checked against every Yama capture in
 * `__tests__/captureConformance.test.ts`.
 */
export const VOID_FLARE_CHARGE_TICKS = 25;

/**
 * The single flare a melee swing drops carries E=360 and explodes on add+17: all three that reached
 * their fuse in capture yama-normal-contract-long-p3-packet-data.txt (control 2197; added
 * c+999, c+1125, c+1132). Measured in the base fight only: no contract melee flare has been seen to
 * detonate, so contracts reuse it unmeasured.
 */
export const MELEE_VOID_FLARE_CHARGE_TICKS = 17;

/**
 * Divine Severance's "spawns Voidflares continuously": ONE extra flare every 20 ticks, on top
 * of the pair every contract drops on the void-flare beat. Base and forfeit captures have no
 * such drumbeat.
 *
 * The drumbeat is a fight-long timer, so where it lands relative to phase 3 is an accident of
 * when the player crossed the threshold. A phase-3-only sim has no such history; see
 * `YamaEncounter.processPostTick` for the anchor it picks instead.
 */
export const DIVINE_CONTINUOUS_FLARE_INTERVAL = 20;

/**
 * `'lethal'` is the instant kill Divine Severance and Sensory Clouding carry. A bare pair is a
 * flat roll. The object form rolls `atZeroHp` and adds `floor(perRemainingHp * hp)`, where `hp`
 * is the flare's hitpoints AT DETONATION: "the amount of damage dealt, along with health
 * restored to Yama, scales on their remaining health at the time of explosion"
 * (https://oldschool.runescape.wiki/w/Yama/Strategies, § Void Flares). Do not collapse a scaled
 * entry back to a flat pair — two flares detonating on the SAME tick in the bloodied blows
 * capture dealt 45 and 10, which no flat band produces. Derivation: `docs/encounters/yama-facts-spec.md`,
 * "Void flare explosions".
 *
 * Keep `perRemainingHp` dyadic. On a repeating binary fraction `Math.floor` lands a point low at
 * some hitpoint values, and the fitted band has no slack to absorb that.
 */
export interface YamaEncounterConfig {
  attackPattern?: Partial<ResolvedYamaAttackPattern>;
  autoAttacks?: {
    meleeDamage?: [number, number];
    rangedMagicDamage?: [number, number];
    meleePrayerReduction?: PrayerReduction;
    rangedMagicPrayerReduction?: PrayerReduction;
    /** Boost Yama's own accurate autos by `wretchedDamageBonusPercent`, off his live HP. */
    wretchedStrength?: boolean;
  };
  waves?: {
    damage?: DamageValue;
    periodTicks?: number;
    deltas?: readonly number[];
    speedTilesPerTick?: number;
    /** Jitter each staggered wave's arms one tick late, independently (sigil contracts). */
    randomOffsets?: boolean;
    startDelay?: number;
    firstCycleDeltas?: readonly number[];
  };
  fireballs?: {
    damage?: DamageValue;
  };
  voidFlares?: {
    /**
     * Starting (current) HP a flare spawns with. Max HP is always sourced
     * from NPC data (140 for `Void Flare` id 14179). In vanilla P3 the
     * flares spawn at 71 HP (about half), hence the default.
     */
    hp?: number;
    spawnCount?: number;
    maxActive?: number;
    chargeTicks?: number;
    explosionDamage?: VoidFlareExplosionDamage;
    continuous?: boolean;
    /** Ticks between continuous spawns. Only read when `continuous` is set. */
    continuousIntervalTicks?: number;
    /** Starting HP for continuously-spawned flares. Defaults to `hp`. */
    continuousHp?: number;
    guaranteedPlayerMaximum?: boolean;
  };
  boss?: {
    hp?: number;
    maxHp?: number;
  };
  /**
   * Yama walks toward the player every tick instead of standing on his spawn tile
   * (Contract of sensory clouding: "Yama will always attempt to attack with melee (non-stop
   * pursuit), including in phase 3 regardless of the player's mainhand weapon").
   */
  pursuit?: boolean;
}

export interface ResolvedYamaEncounterConfig {
  attackPattern: ResolvedYamaAttackPattern;
  autoAttacks: {
    meleeDamage: [number, number];
    rangedMagicDamage: [number, number];
    meleePrayerReduction: PrayerReduction;
    rangedMagicPrayerReduction: PrayerReduction;
    wretchedStrength: boolean;
  };
  waves: {
    damage: DamageValue;
    periodTicks: number;
    deltas: readonly number[];
    speedTilesPerTick: number;
    randomOffsets: boolean;
    /** Seed for deterministic offset selection. Set by YamaEncounter from encounterSeed. */
    seed: number;
    startDelay: number;
    firstCycleDeltas: readonly number[];
  };
  fireballs: {
    damage: DamageValue;
  };
  voidFlares: {
    /** Starting HP at spawn. Max HP comes from NPC data, not this field. */
    hp: number;
    spawnCount: number;
    maxActive: number;
    chargeTicks: number;
    explosionDamage: VoidFlareExplosionDamage;
    continuous: boolean;
    continuousIntervalTicks: number;
    continuousHp: number;
    guaranteedPlayerMaximum: boolean;
  };
  boss: {
    /**
     * Yama's hitpoints **at the start of phase 3**, i.e. his current HP.
     * See {@link YAMA_P3_START_HP}.
     */
    hp: number;
    /** Yama's full-fight maximum, the denominator on his health bar. */
    maxHp: number;
  };
  pursuit: boolean;
}

// Boss hitpoints
//
// Yama's three phases share ONE continuous health bar, and this simulator only
// models phase 3 — so he spawns already damaged: `maxHp` is the full-fight pool
// and `hp` is what is left when P3 begins.
//
// Full-fight pools, OSRS wiki "Contract variants" table:
//   base / most contracts 2500 · bloodied blows 3000 · glyphic attenuation 2875
//
// Phase 3 opens when the P2 threshold is crossed. The starting HP is practice
// initialization at the HIGHEST value that still trips the stated threshold:
//   base      wiki: "Upon reaching 66.6% and 33.3% of his health (not a hard
//             cap)" — 1/3 of the pool.
//   contracts wiki: ~75% / ~50% instead — 1/2 of the pool.
//
// It is not an exact transition: captured openings fall on both sides (bloodied
// blows 73 under its 1500, both sensory clouding captures above 1250). Evidence:
// `docs/encounters/yama-facts-spec.md` §1.

/** Yama's full-fight hitpoint pool, base fight and most contracts. */
export const YAMA_FULL_FIGHT_HP = 2500;
/** Bloodied blows raises the pool. */
export const BLOODIED_BLOWS_FULL_FIGHT_HP = 3000;
/** Glyphic attenuation raises the pool. */
export const GLYPHIC_ATTENUATION_FULL_FIGHT_HP = 2875;

/** Highest HP that still trips a threshold at `fraction` of `fullFightHp`. */
function phase3StartHp(fullFightHp: number, fraction: number): number {
  return Math.floor(fullFightHp * fraction);
}

/** Base Yama enters phase 3 at 1/3 of his pool: 833 of 2500. */
export const YAMA_P3_START_HP = phase3StartHp(YAMA_FULL_FIGHT_HP, 1 / 3);
/** Contract Yama enters phase 3 at 1/2 of his pool: 1250 of 2500. */
export const YAMA_CONTRACT_P3_START_HP = phase3StartHp(YAMA_FULL_FIGHT_HP, 1 / 2);
/** Bloodied blows: 1500 of 3000. */
export const BLOODIED_BLOWS_P3_START_HP = phase3StartHp(BLOODIED_BLOWS_FULL_FIGHT_HP, 1 / 2);
/** Glyphic attenuation: 1437 of 2875 (1437.5 rounds down — 1438 is above half). */
export const GLYPHIC_ATTENUATION_P3_START_HP = phase3StartHp(GLYPHIC_ATTENUATION_FULL_FIGHT_HP, 1 / 2);

// Prayer penetration
//
// Protection prayers fully block Yama's ranged and magic autos in phases 1 and 2, and leak
// only in phase 3: "his ranged and magic attacks will now pierce prayer (although very
// negligible), while the melee attack deals even more damage" (wiki, Yama § Fight overview).
// This sim IS phase 3, so the leak is unconditional here.
//
// What leaks is `floor(roll * rate)` — see the `reduce` branch of `calculatePrayerDamage` for
// why that rounding and not the other. EVERY RATE BELOW IS CALIBRATED TO THAT ARITHMETIC and is
// pinned by the largest leak its captures actually show, via `floor(maxHit * rate)`. Changing
// the rounding silently invalidates all of them.
//
// These are therefore NOT Jagex's published percentages. The wiki quotes bloodied blows at
// "decreased from 10% to 5%", but 5% floors that contract's ceiling to 2 where its capture
// reaches 6. The published figures appear to be rounded descriptions of the engine's values,
// so the captures win. Reducing the ROLL still beats reducing the max hit and re-rolling,
// hence `reduce` rather than a second uniform draw.
//
// A cap is the one shape the data rules out: `min(6, roll)` on a [0,53] roll returns exactly 6
// on 89% of hits, which the captures contradict.
// Full derivation in `docs/encounters/yama-facts-spec.md`.

/** Base Yama, phase 3. `floor(46 * 0.08) = 3` matches the wiki's "max hit of 3" and the 142
 * prayed landings in the long-P3 capture, whose largest leak is 3. */
const BASE_PRAYER_PENETRATION: PrayerReduction = { type: 'reduce', value: 0.08 };
/**
 * Sigil contracts, bar the two that restate it: Divine Severance and Bloodied Blows.
 *
 * Pinned by glyphic, whose captures reach a leak of 6: that needs >= 12%, where forfeit's
 * observed ceiling of 5 alone would allow 10-11%. Forfeit simply never rolled a 6 in its 20
 * positive landings, which at this rate happens about 15% of the time — do NOT drop this to 11%
 * to fit forfeit's sample, because glyphic's 6 then becomes impossible rather than merely
 * unobserved.
 */
const SIGIL_PRAYER_PENETRATION: PrayerReduction = { type: 'reduce', value: 0.12 };
/**
 * Sensory Clouding promises more penetration ("Yama's attacks have increased prayer
 * penetration") without stating a rate, so this one is fitted rather than published.
 *
 * 17% is the fitted rate if 56 and 9 are the two ceilings: `floor(56 * 0.17) = 9`, where 16%
 * gives 8 and 18% gives 10. Both sensory captures reach 9, but the samples establish only lower
 * bounds on both. Raising `rangedMagicDamage` above 56 pulls the rate DOWN, so the two cannot be
 * fitted independently. Derivation: docs/encounters/sensory-clouding-open-questions.md.
 */
const INCREASED_PRAYER_PENETRATION: PrayerReduction = { type: 'reduce', value: 0.17 };
/**
 * Melee, phase 3. `floor(46 * 0.48) = 22` reproduces "the melee attack can now hit up to 22
 * through prayer" (wiki, Yama/Strategies § Phase 3) exactly, and 22 is also the largest melee
 * leak in the long-P3 capture. 50% would put the ceiling at 23, which neither source shows.
 *
 * Melee still rolls accuracy like the other styles — see `YamaEncounter.rollAccuracy`. It is the
 * penetration that is this large, not the hit rate.
 */
const MELEE_PRAYER_PENETRATION: PrayerReduction = { type: 'reduce', value: 0.48 };

/**
 * Shadow-wave damage. The wiki states none for phase 3, so these spans are measured, and
 * uniform over the observed draws — both true floors may sit below the smallest one, the base
 * floor especially on a three-splat sample.
 */
const BASE_WAVE_DAMAGE: DamageValue = [16, 20];
const SIGIL_WAVE_DAMAGE: DamageValue = [28, 35];

/**
 * "Getting caught in this attack will deal up to 20 damage per explosion" (wiki,
 * Yama/Strategies § Phase 3). "Up to" is a roll. No capture isolates a fireball hitsplat, so
 * nothing constrains it.
 */
const BASE_FIREBALL_DAMAGE: DamageValue = [0, 20];

export function resolveEncounterConfig(partial?: YamaEncounterConfig): ResolvedYamaEncounterConfig {
  return {
    attackPattern: { ...DEFAULT_YAMA_ATTACK_PATTERN, ...partial?.attackPattern },
    autoAttacks: {
      meleeDamage: partial?.autoAttacks?.meleeDamage ?? [0, 46],
      // The wiki's max-hit table quotes ONE auto-attack figure covering all three of Yama's
      // styles — 46 base, 53 under any contract — so ranged/magic carries the melee number.
      rangedMagicDamage: partial?.autoAttacks?.rangedMagicDamage ?? [0, 46],
      meleePrayerReduction: partial?.autoAttacks?.meleePrayerReduction ?? MELEE_PRAYER_PENETRATION,
      rangedMagicPrayerReduction: partial?.autoAttacks?.rangedMagicPrayerReduction ?? BASE_PRAYER_PENETRATION,
      wretchedStrength: partial?.autoAttacks?.wretchedStrength ?? false,
    },
    waves: {
      damage: partial?.waves?.damage ?? BASE_WAVE_DAMAGE,
      periodTicks: partial?.waves?.periodTicks ?? DEFAULT_WAVE_PERIOD,
      deltas: partial?.waves?.deltas ?? DEFAULT_WAVE_DELTAS,
      speedTilesPerTick: partial?.waves?.speedTilesPerTick ?? DEFAULT_WAVE_SPEED,
      randomOffsets: partial?.waves?.randomOffsets ?? false,
      seed: 0,
      startDelay: partial?.waves?.startDelay ?? DEFAULT_WAVE_START_DELAY,
      firstCycleDeltas: partial?.waves?.firstCycleDeltas ?? DEFAULT_FIRST_CYCLE_DELTAS,
    },
    fireballs: {
      damage: partial?.fireballs?.damage ?? BASE_FIREBALL_DAMAGE,
    },
    voidFlares: {
      hp: partial?.voidFlares?.hp ?? 71,
      spawnCount: partial?.voidFlares?.spawnCount ?? 2,
      maxActive: partial?.voidFlares?.maxActive ?? 4,
      chargeTicks: partial?.voidFlares?.chargeTicks ?? VOID_FLARE_CHARGE_TICKS,
      // Span of the four phase-3 explosions the non-contract captures contain, not a measured
      // support: both ends are open. Do NOT "correct" this back to the wiki's flat 23-25, which
      // those four samples falsify. It stays FLAT rather than taking the sigil contracts' scaled
      // form because four samples at two hitpoint values cannot fit a slope, not because the
      // scaling is absent here — the wiki states it for every flare. Derivation:
      // `docs/encounters/yama-facts-spec.md`, "Void flare explosions".
      explosionDamage: partial?.voidFlares?.explosionDamage ?? [10, 27],
      continuous: partial?.voidFlares?.continuous ?? false,
      // Clamped: a 0 would make `tick % interval` NaN and silently stop all spawning.
      continuousIntervalTicks: Math.max(
        1,
        partial?.voidFlares?.continuousIntervalTicks ?? DIVINE_CONTINUOUS_FLARE_INTERVAL,
      ),
      continuousHp: partial?.voidFlares?.continuousHp ?? partial?.voidFlares?.hp ?? 71,
      guaranteedPlayerMaximum: partial?.voidFlares?.guaranteedPlayerMaximum ?? true,
    },
    boss: {
      hp: partial?.boss?.hp ?? YAMA_P3_START_HP,
      maxHp: partial?.boss?.maxHp ?? YAMA_FULL_FIGHT_HP,
    },
    pursuit: partial?.pursuit ?? false,
  };
}

/**
 * Every contract raises Yama's combat levels together — the wiki's stat table gives one row for
 * Bloodied Blows, Glyphic Attenuation and "Other contracts" alike, and only their health pools
 * differ (`boss.hp`, already configured per contract). Four of the five reach the fight, on both
 * sides of it:
 *
 * - `attack`, `magic`, `ranged` — Yama's OWN accuracy, one per style, through `npcAttackRoll`
 *   under `YamaEncounter.rollAccuracy`. Magic and ranged are worth about +2.3 and +3.0
 *   percentage points of hit chance against the contract presets.
 * - `defence`, and `magic` again — the PLAYER's accuracy against Yama, through `npcDefenceRoll`.
 *   Raising defence 225 -> 247 makes every contract measurably harder to hit than base Yama, so
 *   this block is a player-DPS change as much as an incoming-damage one.
 * - `strength` reaches nothing: Yama's damage is a configured `[0, max]` range, never a formula
 *   max hit off `maxHitFromStrength`. Carried because the wiki states the block as a unit.
 *
 * Applied by contract id rather than baked into `monsters.json`, which carries only the Normal
 * and Phase 3 forms — there is no per-contract entry to sync from.
 * https://oldschool.runescape.wiki/w/Yama#Contract_variants
 */
export const CONTRACT_COMBAT_LEVELS = {
  attack: 400,
  strength: 402,
  defence: 247,
  magic: 275,
  ranged: 241,
} as const;

export interface YamaContractConfig {
  kind: YamaEncounterKind;
  contractId: string | null;
  encounter: YamaEncounterConfig;
  engineRules?: EncounterEngineRules;
  /** Additional mechanics toggles shown in the settings UI for this contract. */
  mechanicsToggles?: MechanicsToggleInfo[];
  /** Mechanics config defaults specific to this contract (merged over base defaults). */
  defaultMechanicsConfig?: Record<string, boolean>;
}

const SIGIL_ENCOUNTER_BASE: YamaEncounterConfig = {
  // Base's grid; beat 3 casts alongside its fireball from cycle 0.
  attackPattern: { snapFireballBeats: [0, 7], firstCycleSnapFireballBeats: [0, 7] },
  autoAttacks: {
    meleeDamage: [0, 53],
    rangedMagicDamage: [0, 53],
    rangedMagicPrayerReduction: SIGIL_PRAYER_PENETRATION,
  },
  waves: {
    // Sigil contracts share the base 70-tick cadence and control+12 group start (startDelay 7,
    // inherited) but differ from base in two ways: within-group deltas are [0,15,22] rather
    // than [0,14,21], and the FIRST cycle already fires all three staggered waves where base
    // fires only its lone delta-14 member.
    deltas: [0, 15, 22],
    firstCycleDeltas: [0, 15, 22],
    randomOffsets: true,
    damage: SIGIL_WAVE_DAMAGE,
  },
  boss: { hp: YAMA_CONTRACT_P3_START_HP },
  /**
   * The default for the sigil contracts, and roughly double the base fight's at equal
   * hitpoints — 39-48 against 23-27 at a full 71. It lives here rather than on one contract
   * because all three that have been measured land on the same band: bloodied blows (P1 and
   * P3), glyphic attenuation (P1 and P3), forfeit breath (P1 and P3). Divine Severance and
   * Sensory Clouding override it with `'lethal'` and never roll it. That is a measurement over
   * the contracts that exist, not a rule about the sigil mechanic, so a new contract inherits
   * this band as a default and may still need its own override.
   *
   * Ten is the minimum fitted width over the 52 capture and reported rows — nothing narrower
   * contains them at any slope — although a 7-wide band fits the 14 capture rows alone. The 7/16 is one dyadic value from
   * an interval of slopes that fit equally well, not a measured coefficient; keep it dyadic so
   * `Math.floor` does not land a point low. Derivation, and the two rejected models where the
   * band widens with health: `docs/encounters/yama-facts-spec.md`, "Void flare explosions".
   */
  voidFlares: { explosionDamage: { atZeroHp: [8, 17], perRemainingHp: 7 / 16 } },
};

function defineContract(base: YamaEncounterConfig, overrides: YamaEncounterConfig): YamaEncounterConfig {
  return {
    attackPattern: { ...base.attackPattern, ...overrides.attackPattern },
    autoAttacks: { ...base.autoAttacks, ...overrides.autoAttacks },
    waves: { ...base.waves, ...overrides.waves },
    fireballs: { ...base.fireballs, ...overrides.fireballs },
    voidFlares: { ...base.voidFlares, ...overrides.voidFlares },
    boss: { ...base.boss, ...overrides.boss },
    pursuit: overrides.pursuit ?? base.pursuit,
  };
}

export const BASE_YAMA_CONFIG: YamaContractConfig = {
  kind: 'yama_p3',
  contractId: null,
  encounter: {},
};

export const DIVINE_SEVERANCE_CONFIG: YamaContractConfig = {
  kind: 'yama_p3_divine',
  contractId: 'divine_severance',
  encounter: defineContract(SIGIL_ENCOUNTER_BASE, {
    voidFlares: {
      explosionDamage: 'lethal',
      continuous: true,
      // Only the continuously-spawned flares are tougher; `hp` stays at the ordinary 71.
      continuousHp: 81,
    },
    autoAttacks: { rangedMagicPrayerReduction: { type: 'block' } },
  }),
  engineRules: {
    // Two ticks of protection: the activation tick and the one after it. Read this from
    // DAMAGE, never from the `prayer_protectfrom*` varbit — the `1->0` lands on the
    // second tick and still blocks that tick's hit, so the varbit span reads as 1 and
    // says the opposite of what happens.
    prayerRestrictions: { protection: { expiresAfterTicks: 2 } },
  },
};

/** Drain 1% run energy (100 of 10000 units) every this many ticks. */
const FORFEIT_BREATH_DRAIN_INTERVAL = 4;
/** 1% of RUN_ENERGY_MAX (10000). */
const FORFEIT_BREATH_DRAIN_AMOUNT = 100;
const FORFEIT_BREATH_FAIL: FailCondition = 'StaminaDepleted';

export const FORFEIT_BREATH_CONFIG: YamaContractConfig = {
  kind: 'yama_p3_forfeit_breath',
  contractId: 'forfeit_breath',
  encounter: defineContract(SIGIL_ENCOUNTER_BASE, {}),
  engineRules: {
    onTickStart: (ctx) => {
      if (ctx.player.runEnergy.energy <= 0) {
        return { fail: FORFEIT_BREATH_FAIL };
      }
      if (ctx.tick % FORFEIT_BREATH_DRAIN_INTERVAL === 0) {
        const newEnergy = ctx.player.runEnergy.energy - FORFEIT_BREATH_DRAIN_AMOUNT;
        return {
          runEnergyDelta: -FORFEIT_BREATH_DRAIN_AMOUNT,
          fail: newEnergy <= 0 ? FORFEIT_BREATH_FAIL : undefined,
        };
      }
      return null;
    },
    onPlayerDamageTaken: (info, ctx) => {
      const drain = info.effectiveDamage * FORFEIT_BREATH_DRAIN_AMOUNT;
      const newEnergy = ctx.player.runEnergy.energy - drain;
      return {
        runEnergyDelta: -drain,
        fail: newEnergy <= 0 ? FORFEIT_BREATH_FAIL : undefined,
      };
    },
  },
  mechanicsToggles: [{ key: 'infiniteStamina', label: 'Infinite Stamina' }],
  // Off, unlike the practice aid it looks like: run energy IS this contract. The engine
  // suppresses both the drain and the StaminaDepleted loss while it is on, so defaulting it
  // true left the fight with no passive drain, no drain on damage, and no way to lose.
  defaultMechanicsConfig: { infiniteStamina: false },
};

export const SENSORY_CLOUDING_CONFIG: YamaContractConfig = {
  kind: 'yama_p3_sensory',
  contractId: 'sensory_clouding',
  encounter: defineContract(SIGIL_ENCOUNTER_BASE, {
    voidFlares: { explosionDamage: 'lethal' },
    autoAttacks: {
      rangedMagicPrayerReduction: INCREASED_PRAYER_PENETRATION,
      // The wiki's flat 53 for every contract is falsified here: an unprayed magic auto lands
      // 56 as an ordinary hit, with no `DAMAGE_MAX_ME` splat anywhere in the capture, so 56 is
      // a FLOOR on this contract's max hit and the smallest value consistent with the data —
      // the real ceiling needs a capture with a max-hit splat in it. Melee is left at the sigil
      // 53 as simulator policy: no melee swing was identified in the sensory captures.
      rangedMagicDamage: [0, 56],
    },
    pursuit: true,
  }),
  engineRules: {
    modifyPlayerCombatParams: (params, _ctx) => ({
      ...params,
      attackRange: Math.max(1, Math.floor(params.attackRange / 2)),
    }),
  },
};

export const BLOODIED_BLOWS_CONFIG: YamaContractConfig = {
  kind: 'yama_p3_bloodied',
  contractId: 'bloodied_blows',
  encounter: defineContract(SIGIL_ENCOUNTER_BASE, {
    boss: { hp: BLOODIED_BLOWS_P3_START_HP, maxHp: BLOODIED_BLOWS_FULL_FIGHT_HP },
    /**
     * "Four void flares spawn instead of two" (wiki, § Contract details) arrives in phase 3 as
     * a SECOND PAIR half a cycle early rather than four at once, alternating between the west
     * corner pair and the east one. Modeling it as `spawnCount: 4` would put all four on beat
     * 8 and leave the arena clear for the 35 ticks that pass with two live flares in it.
     */
    attackPattern: { voidFlareBeats: [3, 8] },
    voidFlares: { maxActive: 4, spawnCount: 2, guaranteedPlayerMaximum: false },
    // The one contract with a published rate — "decreased from 10% to 5%" (wiki, Contract of
    // bloodied blows § Changes, 29 May 2025) — and the only sigil one below the shared rate.
    // 6% rather than the published 5% because `floor` arithmetic makes 5% cap this contract at
    // `floor(53 * 0.05) = 2` even with Wretched Strength's launch bonus applied first, where its
    // capture reaches 6; 6% is the lowest whole percent that can. Jagex's figure looks like a
    // rounded description rather than the engine value. Do not raise it further to chase those
    // leaks: Wretched Strength nearly doubles the roll they are a percentage of, so a higher rate
    // double-counts that bonus.
    autoAttacks: { rangedMagicPrayerReduction: { type: 'reduce', value: 0.06 }, wretchedStrength: true },
  }),
  engineRules: {
    playerMinimumHit: (maxHit, { player }) => wretchedMinimumHit(maxHit, player.vitals.hp, player.vitals.maxHp),
  },
};

/**
 * Lowest prayer-drain resistance Glyphic Attenuation will hand out, and the only point on its
 * curve any evidence reaches: at a +46 prayer bonus both glyphic captures fit resistance 40.
 *
 * The literal sign-flip on its own is FALSIFIED by that number: `60 - 2*46` is negative, which
 * would empty a 99 prayer in three ticks. What the curve does between bonus 10 and 46 is
 * unconstrained — nothing published settles it, and a capture at a different prayer bonus is
 * what it would take.
 */
const GLYPHIC_MIN_DRAIN_RESISTANCE = 40;

/**
 * "Challenger's prayer bonus increases the damage they deal", as a multiplier of
 * `1 + rate * prayerBonus`. Nothing publishes the rate; it is fitted from the five
 * `DAMAGE_MAX_ME` splats (hitsplat id 43, RuneLite `HitsplatID.java`) across the two captures,
 * which bracket it at ~1.55%. The magic switch scales identically to melee, so the bonus is
 * not melee-only.
 *
 * Two caveats worth knowing before trusting it far from +44/+46. Jagex say the bonus is
 * "larger at the higher thresholds", so the true curve may not be a line through 1.0; this
 * rate is fitted at +44 and +46 only. And the whole window shifts by ~0.03%/point per point of
 * error in the assumed prayer bonus, which is read off the player's own equipment screen
 * rather than the capture.
 */
const GLYPHIC_DAMAGE_PER_PRAYER_BONUS = 0.0155;

export const GLYPHIC_ATTENUATION_CONFIG: YamaContractConfig = {
  kind: 'yama_p3_glyphic',
  contractId: 'glyphic_attenuation',
  encounter: defineContract(SIGIL_ENCOUNTER_BASE, {
    boss: { hp: GLYPHIC_ATTENUATION_P3_START_HP, maxHp: GLYPHIC_ATTENUATION_FULL_FIGHT_HP },
  }),
  engineRules: {
    prayerDrain: {
      modifyDrainResistance: ({ prayerBonus }) => Math.max(GLYPHIC_MIN_DRAIN_RESISTANCE, 60 - 2 * prayerBonus),
    },
    outgoingDamageMultiplier: ({ player }) => 1 + GLYPHIC_DAMAGE_PER_PRAYER_BONUS * player.equipmentStats.prayer,
    /**
     * "Yama is now weak to crush, and nothing else" is a RESTAT, not a rule: the contract
     * drops his crush defence and pushes everything else to +666, so crush is the only
     * viable style rather than the only permitted one. Modeling it as stats rather than a
     * forced miss is what makes Practice's DPS projection and the roll combat actually makes
     * agree, and it leaves the ~8% of hits other styles really do land.
     *
     * The BONUSES are the contract's own words: "Yama's defence bonuses are now +80 crush
     * defence and +666 for all others" (wiki, Contract of glyphic attenuation § Contract
     * details). 108 rather than 80 is the one inference here, and it is phase 3's: base Yama
     * multiplies every defence bonus by 1.35 on entering the final phase (100/80/333/220 ->
     * 135/108/449/297, wiki, Yama/Strategies § Phase 3), so the contract's 80 lands on 108.
     * The +666 wall is left unscaled because it is a sentinel, not a measurement.
     *
     * The DEFENCE LEVEL is not overridden HERE, but it is not base Yama's either: every
     * contract moves it to 247 through `CONTRACT_COMBAT_LEVELS`, which is where that belongs
     * because the whole level block moves together and does so on all five contracts. Do not
     * re-add a per-contract defence level on the strength of the Yama infobox's 225 or
     * Yama/Strategies' "Defence level of 225" — both describe the BASE fight, and Yama §
     * Contract variants states the contracted levels separately.
     */
    monsterStatOverrides: {
      [YAMA_NPC_ID]: {
        defensive: { crush: 108, stab: 666, slash: 666, magic: 666, light: 666, standard: 666, heavy: 666 },
      },
    },
  },
};
