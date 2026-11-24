import { describe, expect, it } from 'vitest';
import { createSimulationEngineForNewRun } from '../../encounters/simulationEngineFactory';
import { createEmptyCombatSupplies } from '../../types/encounterLoadout';
import { createEmptyInventory } from '../../types/inventory';
import { createDefaultStats } from '../../types/playerState';
import {
  ENGINE_RUN_BOOTSTRAP_VERSION,
  type EngineRunConfig,
  parseEngineRunBootstrap,
  resolveRunBootstrap,
} from '../engineRunConfig';

/**
 * Everything the parser lets through is fed to a live engine, so the rejections below are the
 * boundary.
 */
function validRunConfig(): EngineRunConfig {
  return createSimulationEngineForNewRun({
    encounterConfig: { kind: 'yama_p3', mechanics: { infiniteHealth: true } },
    enableIntro: false,
    stats: createDefaultStats(),
    inventory: createEmptyInventory(),
    equipment: {},
    combatSupplies: createEmptyCombatSupplies(),
    attackStylePerCategory: {},
    combatSeed: 0x1234abcd,
  }).getRunConfig();
}

describe('parseEngineRunBootstrap', () => {
  it('keeps serialized fields separate when accepting opaque constructor options', () => {
    const runConfig = validRunConfig();
    if (!runConfig.bootstrap) throw new TypeError('Expected a bootstrap');
    const bootstrap = {
      ...runConfig.bootstrap,
      encounterConfig: { unused: { opaque: true } },
    };

    const parsed = parseEngineRunBootstrap(bootstrap);

    expect(parsed?.version).toBe(ENGINE_RUN_BOOTSTRAP_VERSION);
    expect(parsed?.encounterConfig).toEqual({ unused: { opaque: true } });
    expect(parsed?.mechanicsConfig).toMatchObject({ infiniteHealth: true });
    expect(parsed).not.toHaveProperty('encounter');
    expect(parsed).not.toHaveProperty('encounterConfig.kind');
    expect(runConfig.encounter).toMatchObject({ kind: 'yama_p3', seeds: expect.any(Object) });
  });

  it('accepts a bootstrap the engine just produced', () => {
    const bootstrap = validRunConfig().bootstrap;

    expect(parseEngineRunBootstrap(bootstrap)).not.toBeNull();
  });

  it('rejects a missing bootstrap', () => {
    expect(parseEngineRunBootstrap(undefined)).toBeNull();
    expect(parseEngineRunBootstrap(null)).toBeNull();
  });

  it.each([
    ENGINE_RUN_BOOTSTRAP_VERSION - 1,
    ENGINE_RUN_BOOTSTRAP_VERSION + 1,
  ])('rejects a bootstrap written by engine version %i', (version) => {
    // Given: a recording whose fields no longer mean what this engine expects. Its frames still
    // play back; re-simulating the prefix would reproduce a different fight.
    const bootstrap = { ...validRunConfig().bootstrap, version };

    expect(parseEngineRunBootstrap(bootstrap)).toBeNull();
  });

  it('rejects a version-11 bootstrap, which a retired `zuk` recording carries', () => {
    const bootstrap = { ...validRunConfig().bootstrap, version: 11 };

    expect(parseEngineRunBootstrap(bootstrap)).toBeNull();
  });

  it('rejects a bootstrap missing a required field', () => {
    const bootstrap = { ...validRunConfig().bootstrap };
    delete (bootstrap as Record<string, unknown>).combatSeed;

    // Then: without the seed the prefix cannot be replayed, so this must not reconstruct at all.
    expect(parseEngineRunBootstrap(bootstrap)).toBeNull();
  });

  it('rejects a non-integer combat seed', () => {
    // Given: a hand-edited link. A NaN seed would poison every roll of the resumed fight.
    const bootstrap = { ...validRunConfig().bootstrap, combatSeed: 'nope' };

    expect(parseEngineRunBootstrap(bootstrap)).toBeNull();
  });

  it('rejects a malformed start position', () => {
    const bootstrap = { ...validRunConfig().bootstrap, startPosition: [1] };

    expect(parseEngineRunBootstrap(bootstrap)).toBeNull();
  });
});

describe('resolveRunBootstrap', () => {
  it('returns null for a run config without a bootstrap', () => {
    const withoutBootstrap: EngineRunConfig = {
      completionOwnership: 'encounter-owned',
      encounter: { kind: 'yama_p3', seeds: {} },
    };

    expect(resolveRunBootstrap(withoutBootstrap)).toBeNull();
  });

  it('returns null when there is no run config at all', () => {
    expect(resolveRunBootstrap(null)).toBeNull();
  });

  it('returns the bootstrap for a current recording', () => {
    expect(resolveRunBootstrap(validRunConfig())).not.toBeNull();
  });

  it.each([11, ENGINE_RUN_BOOTSTRAP_VERSION - 1])('offers no takeover for a version %i bootstrap', (version) => {
    const runConfig = validRunConfig();
    expect(resolveRunBootstrap({ ...runConfig, bootstrap: { ...runConfig.bootstrap, version } } as never)).toBeNull();
    expect(resolveRunBootstrap(runConfig)).not.toBeNull();
  });
});
