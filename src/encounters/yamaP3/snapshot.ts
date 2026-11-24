import type { FireballState } from '../../types/simulation';
import type { ResolvedYamaEncounterConfig } from './contractConfig';

/**
 * Yama's public per-tick payload: what the renderer, UI and replay may read.
 *
 * Lives beside the encounter rather than in core because the encounter is the producer and owns
 * the shape. `core/encounters/snapshot.ts` only assembles the union.
 *
 * Everything here must be plain, readonly, `structuredClone`-safe data — the replay recorder
 * clones the whole simulation state every frame.
 */
export interface YamaPublicState {
  readonly contractId: string | null;
  readonly firstRangeMageType: 'magic' | 'range';
  readonly lastAttackKind: string | null;
  readonly lastAttackTick: number | null;
  readonly waveConfig: ResolvedYamaEncounterConfig['waves'];
  readonly attackPattern: ResolvedYamaEncounterConfig['attackPattern'];
}

export interface YamaVisuals {
  /** The first active fireball, or an inactive sentinel. Kept for single-fireball consumers. */
  readonly fireballState: FireballState;
  readonly fireballStates: readonly FireballState[];
}
