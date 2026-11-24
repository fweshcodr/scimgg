/**
 * Sol's five HP-threshold transitions and what each one unlocks.
 *
 * The ORDER and the per-transition schedule (sand at +1, a crystal at +2, attacks resume at +7)
 * are capture-proven and identical in both fights. The THRESHOLDS are the Wiki's, and the HP the
 * captures recorded at each taunt is consistent with them:
 *
 * | transition | K tick / HP | M tick / HP |
 * | 90% | 4022 / 1349 | 8292 / 1319 |
 * | 75% | 4063 / 1114 | 8333 / 1124 |
 * | 50% | 4105 /  734 | 8402 /  727 |
 * | 25% | 4160 /  362 | 8459 /  354 |
 * | 10% | 4199 /  146 | 8501 /   97 |
 */

export interface SolPhaseTransition {
  /** Fraction of max HP at or below which this transition fires. */
  readonly threshold: number;
  readonly taunt: string;
  /** Whether this transition brings another beam crystal. The fifth does not. */
  readonly addsCrystal: boolean;
}

export const SOL_PHASE_TRANSITIONS: readonly SolPhaseTransition[] = [
  { threshold: 0.9, taunt: "Not bad. Let's try something else...", addsCrystal: true },
  { threshold: 0.75, taunt: "Impressive. Let's see how you handle this...", addsCrystal: true },
  { threshold: 0.5, taunt: "You can't win!", addsCrystal: true },
  { threshold: 0.25, taunt: 'Ralos guides my hand!', addsCrystal: true },
  { threshold: 0.1, taunt: "LET'S END THIS!", addsCrystal: false },
];

export const SOL_OPENING_TAUNT = "Let's start by testing your footwork.";

/**
 * Sol's dying words, said overhead the tick after the lethal hit. Each kill capture shows one of three
 * lines: K:4222 "A worthy...", M:8513 "Ralos has smiled...", N:7782 and L:5834 "My compliments...". MODEL: an
 * even choice among the observed lines; the real set and weights are unknown.
 */
export const SOL_VICTORY_TAUNTS = [
  'A worthy... opponent...',
  'Ralos has smiled upon you...',
  'My compliments, champion...',
] as const;

/** Picked from the seed, not the encounter stream, so seeded runs keep their later rolls. */
export function solVictoryTaunt(encounterSeed: number): string {
  return SOL_VICTORY_TAUNTS[encounterSeed % SOL_VICTORY_TAUNTS.length]!;
}

/**
 * How many transitions have fired, i.e. the number of thresholds `hp` has reached. Phase 0 is the
 * opening; phase 5 is enrage.
 */
export type SolPhase = 0 | 1 | 2 | 3 | 4 | 5;

export function phaseForHp(hp: number, maxHp: number): SolPhase {
  const fraction = hp / maxHp;
  let phase = 0;
  for (const transition of SOL_PHASE_TRANSITIONS) {
    if (fraction <= transition.threshold) phase++;
  }
  return phase as SolPhase;
}

// What each phase unlocks in Sol's own attacks lives with his scheduler in
// `src/npcs/colosseum/attackScheduler.ts`.

/** Enrage: continuous sand and faster beams, from the fifth transition. */
export function isEnraged(phase: SolPhase): boolean {
  return phase >= 5;
}
