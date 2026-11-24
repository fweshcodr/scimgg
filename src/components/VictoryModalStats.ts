import { OSRS_TICK_MS, type SimulationState } from '../types/simulation';

export type VictoryStatSource = Pick<
  SimulationState,
  'encounterOutcome' | 'damageHistory' | 'playerHP' | 'maxHP' | 'prayerState'
>;

export type VictoryStats = {
  readonly killTime: string;
  readonly damageDealt: number;
  readonly damageTaken: number;
  readonly hpRemaining: string;
  readonly prayerRemaining: string;
};

/**
 * Encounter-agnostic: the completion actor set comes from the typed
 * {@link EncounterOutcome}, never from encounter-specific state. Dealt damage is
 * the overkill-safe HP loss inflicted on the completion actors only, so adds and
 * void flares (which are not completion actors) never inflate the total.
 */
export function deriveVictoryStats(state: VictoryStatSource): VictoryStats | null {
  if (state.encounterOutcome.phase !== 'victory') return null;

  const completionActorIds = new Set<string>(state.encounterOutcome.completionActorIds);
  const totalSeconds = Math.floor((state.encounterOutcome.decisiveTick * OSRS_TICK_MS) / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  const damageDealt = state.damageHistory
    .filter((entry) => entry.source === 'PlayerAttack' && completionActorIds.has(entry.targetId))
    .reduce((total, entry) => total + Math.max(0, entry.hpBefore - entry.hpAfter), 0);
  const damageTaken = state.damageHistory
    .filter((entry) => entry.targetId === 'player')
    .reduce((total, entry) => total + entry.effectiveDamage, 0);

  return {
    killTime: `${minutes}:${seconds.toString().padStart(2, '0')}`,
    damageDealt,
    damageTaken,
    hpRemaining: `${state.playerHP} / ${state.maxHP}`,
    prayerRemaining: `${state.prayerState.points} / ${state.prayerState.maxPoints}`,
  };
}
