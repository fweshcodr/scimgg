import {
  COMBAT_SKILLS,
  type CombatSkill,
  type CombatTimers,
  clonePlayerStats,
  HP_REGEN_CYCLE_TICKS,
  HP_REGEN_RAPID_HEAL_CYCLE_TICKS,
  type PlayerStats,
  RESTORABLE_STATS,
  type RestorableStat,
  STAT_DECAY_CYCLE_TICKS,
  STAT_DECAY_PRESERVE_EXTENSION_TICKS,
  STAT_RECOVERY_CYCLE_TICKS,
  type StatDecayLock,
  type StatDecayLockSource,
  type StatDecayLocks,
} from '../types/playerState';

/**
 * Level arithmetic shared by every item and timer. `stats[skill].current` is the only level state:
 * each helper reads the live level and returns the next one, so no boost or drain is remembered
 * anywhere else to be replayed later.
 */

/**
 * A boost never stacks on top of an existing boost, but always lifts a drained level by its full
 * amount: `max(C, min(C + q, B + q))`. The amount `q` is computed by the caller from the base level.
 * https://oldschool.runescape.wiki/w/Temporary_skill_boost?oldid=15344600 ("Visible boosts do not stack"),
 * corroborated by RuneLite's BSD-2 `StatBoost` (4ccf49c).
 */
export function boostStat(base: number, current: number, amount: number): number {
  return Math.max(current, Math.min(current + amount, base + amount));
}

export function drainStat(current: number, amount: number): number {
  return Math.max(0, current - amount);
}

/** Restores only raise a level that is below base, and never past it. */
export function restoreStat(base: number, current: number, amount: number): number {
  return current < base ? Math.min(base, current + amount) : current;
}

export function withStatCurrent(stats: PlayerStats, stat: keyof PlayerStats, current: number): PlayerStats {
  if (stats[stat].current === current) return stats;
  const next = clonePlayerStats(stats);
  next[stat] = { ...next[stat], current };
  return next;
}

export function lockStatDecay(
  locks: StatDecayLocks,
  skills: readonly CombatSkill[],
  lock: StatDecayLock,
): StatDecayLocks {
  const next: Partial<Record<CombatSkill, StatDecayLock>> = { ...locks };
  for (const skill of skills) next[skill] = lock;
  return next;
}

/**
 * Count every decay lock down one tick and release the ones that run out. A released skill that is
 * still above base drops straight to base; one at or below base is left alone
 * (https://oldschool.runescape.wiki/w/Divine_potion?oldid=15203520,
 * https://oldschool.runescape.wiki/w/Saturated_heart?oldid=15304376).
 *
 * Runs before {@link tickNaturalStatChange} so a lock released this tick cannot also shield a decay.
 */
export function expireStatDecayLocks(
  stats: PlayerStats,
  timers: CombatTimers,
): { stats: PlayerStats; timers: CombatTimers; expired: StatDecayLockSource[] } {
  let nextStats = stats;
  const nextLocks: Partial<Record<CombatSkill, StatDecayLock>> = {};
  const expired: StatDecayLockSource[] = [];
  let changed = false;

  for (const skill of COMBAT_SKILLS) {
    const lock = timers.statDecayLocks[skill];
    if (!lock) continue;
    changed = true;
    // Counted down in every timer band, including the one on the tick the lock was set, exactly like
    // the other `CombatTimers` countdowns (the heart and surge cooldowns). So a lock applied from
    // input on tick T is released on T + duration - 1, and one prepotted before tick 1 on tick
    // `duration`. (`activeEffects` timers such as stamina differ: they skip their start tick.)
    const ticksRemaining = Math.max(0, lock.ticksRemaining - 1);
    if (ticksRemaining > 0) {
      nextLocks[skill] = { ...lock, ticksRemaining };
      continue;
    }
    if (!expired.includes(lock.source)) expired.push(lock.source);
    const level = nextStats[skill];
    if (level.current > level.max) nextStats = withStatCurrent(nextStats, skill, level.max);
  }

  if (!changed) return { stats, timers, expired };
  return { stats: nextStats, timers: { ...timers, statDecayLocks: nextLocks }, expired };
}

function isCombatSkill(stat: RestorableStat): stat is CombatSkill {
  return (COMBAT_SKILLS as readonly string[]).includes(stat);
}

/**
 * Natural stat change: every 100 ticks a boosted {@link RESTORABLE_STATS} skill — every stat but
 * Hitpoints and Prayer, Agility included — loses 1 toward base and a drained one regains 1 toward
 * base (https://oldschool.runescape.wiki/w/Stat_restoration?oldid=15153239). Hitpoints (see
 * {@link tickNaturalHitpoints}) and Prayer have their own rules and are never touched here.
 *
 * OSRS runs boosted non-combat skills on a separate decay timer whose phase is not documented, so
 * they share the combat decay cycle here, Preserve included. Only combat skills can be locked.
 *
 * The two directions run on separate cycles that both tick continuously, whether or not any skill
 * needs moving, and neither is reset by drinking anything:
 * - decay (`statBoostDecayTick`), which a qualified Preserve postpones once per boundary by 50
 *   ticks — "Preserve will extend the time to drain by another 30 seconds"
 *   (https://oldschool.runescape.wiki/w/Preserve?oldid=15227349) — and a decay lock suspends per skill;
 * - recovery (`statRecoveryTick`), a plain 100-tick cycle that Preserve does not affect.
 *
 * Boundary convention: `cycleTick` is the tick being LEFT (the engine's `previousTick`), so a cycle
 * booked for tick 100 moves levels on the tick numbered 101.
 *
 * `rapidRestoreDue` is Rapid Restore's own timer firing this tick; it adds a further +1 to drained
 * skills, on top of (not instead of) a recovery on the same tick.
 */
export function tickNaturalStatChange(
  stats: PlayerStats,
  timers: CombatTimers,
  cycleTick: number,
  preserveQualified: boolean,
  rapidRestoreDue: boolean,
): { stats: PlayerStats; timers: CombatTimers } {
  const decayTick = timers.statBoostDecayTick;
  const decayDue = cycleTick >= decayTick;
  // A qualified Preserve postpones the drain that is due NOW rather than only lengthening the
  // following cycle; extending only the next interval would let the first drain after lighting
  // Preserve through at full cost. The latch limits that to one postponement per boundary, which is
  // what yields the documented 150-tick spacing instead of pushing the same drain out forever.
  const postponed = decayDue && preserveQualified && !timers.statBoostDecayExtended;
  const shouldDecay = decayDue && !postponed;
  const recoveryDue = cycleTick >= timers.statRecoveryTick;

  const nextStats = clonePlayerStats(stats);
  if (shouldDecay) {
    for (const skill of RESTORABLE_STATS) {
      const level = nextStats[skill];
      const locked = isCombatSkill(skill) && timers.statDecayLocks[skill] !== undefined;
      if (level.current > level.max && !locked) level.current -= 1;
    }
  }
  for (const skill of RESTORABLE_STATS) {
    const level = nextStats[skill];
    if (level.current < level.max && recoveryDue) level.current += 1;
    if (level.current < level.max && rapidRestoreDue) level.current += 1;
  }

  return {
    stats: nextStats,
    timers: {
      ...timers,
      statBoostDecayTick: postponed
        ? decayTick + STAT_DECAY_PRESERVE_EXTENSION_TICKS
        : shouldDecay
          ? cycleTick + STAT_DECAY_CYCLE_TICKS
          : decayTick,
      statBoostDecayExtended: postponed ? true : shouldDecay ? false : timers.statBoostDecayExtended,
      statRecoveryTick: recoveryDue ? cycleTick + STAT_RECOVERY_CYCLE_TICKS : timers.statRecoveryTick,
    },
  };
}

/** The interval natural Hitpoints change runs on, and the delay a Rapid Heal toggle restarts it at. */
export function hpRegenInterval(rapidHealActive: boolean): number {
  return rapidHealActive ? HP_REGEN_RAPID_HEAL_CYCLE_TICKS : HP_REGEN_CYCLE_TICKS;
}

/**
 * Natural Hitpoints change: one deadline, and each time it fires Hitpoints move 1 toward max — up
 * when below it, down when overhealed, and not at all at max, though the deadline still moves on
 * (https://oldschool.runescape.wiki/w/Hitpoints?oldid=15337461). Nothing but a Rapid Heal toggle
 * restarts it: damage, healing, poison and combat all leave it running.
 *
 * Rapid Heal halves the interval (https://oldschool.runescape.wiki/w/Rapid_Heal?oldid=14872669).
 * Because the SAME deadline drives the overheal loss, an overheal also falls every 50 ticks while
 * it is lit; the Wiki does not separate the two, so this is simulator policy.
 *
 * `tick` is the tick being simulated, and the next deadline is booked from it.
 */
export function tickNaturalHitpoints(
  hp: number,
  maxHp: number,
  regenTick: number,
  tick: number,
  rapidHealActive: boolean,
): { hp: number; regenTick: number } {
  if (tick < regenTick) return { hp, regenTick };
  const next = hp < maxHp ? hp + 1 : hp > maxHp ? hp - 1 : hp;
  return { hp: next, regenTick: tick + hpRegenInterval(rapidHealActive) };
}
