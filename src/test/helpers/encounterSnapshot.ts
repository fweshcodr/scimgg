import type { EncounterSnapshot, YamaSnapshot, ZukSnapshot } from '../../core/encounters/snapshot';
import { resolveEncounterConfig } from '../../encounters/yamaP3/contractConfig';
import type { YamaEncounterKind } from '../../encounters/yamaP3/contracts';
import type { YamaPublicState, YamaVisuals } from '../../encounters/yamaP3/snapshot';
import type { ZukPublicState } from '../../encounters/zuk/snapshot';
import type { FireballState } from '../../types/simulation';

/**
 * `SimulationState.encounter` is a discriminated union carrying a complete payload, so a test that
 * only cares about one field would otherwise have to spell out the whole thing. These builders
 * supply neutral defaults and take `Partial` overrides — with no casts, so a fixture that drifts
 * from the real payload shape fails to compile like production code does.
 */

const INACTIVE_FIREBALL: FireballState = {
  active: false,
  phaseIndex: null,
  centerPosition: null,
  angle: null,
  ticksIntoPhase: 0,
};

const RESOLVED_BASE_YAMA_CONFIG = resolveEncounterConfig();

export function yamaSnapshot(
  overrides: {
    readonly kind?: YamaEncounterKind;
    readonly state?: Partial<YamaPublicState>;
    readonly visuals?: Partial<YamaVisuals>;
  } = {},
): YamaSnapshot {
  return {
    kind: overrides.kind ?? 'yama_p3',
    state: {
      contractId: null,
      firstRangeMageType: 'magic',
      lastAttackKind: null,
      lastAttackTick: null,
      waveConfig: RESOLVED_BASE_YAMA_CONFIG.waves,
      attackPattern: RESOLVED_BASE_YAMA_CONFIG.attackPattern,
      ...overrides.state,
    },
    visuals: {
      fireballState: INACTIVE_FIREBALL,
      fireballStates: [],
      ...overrides.visuals,
    },
  };
}

export function zukSnapshot(state: Partial<ZukPublicState> = {}): ZukSnapshot {
  return {
    kind: 'zuk',
    state: {
      setTimer: 0,
      timerPaused: false,
      enraged: false,
      jadSpawned: false,
      shieldX: 0,
      shieldMovingEast: false,
      shieldNextX: 0,
      ...state,
    },
    visuals: {},
  };
}

export function lobbySnapshot(): EncounterSnapshot {
  return { kind: 'lobby', state: {}, visuals: {} };
}
