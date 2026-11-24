import { readFileSync } from 'node:fs';
import { afterEach, describe, expect, it } from 'vitest';
import type { ArenaConfig } from '../../../core/arena/ArenaConfig';
import { clearResolvedArenaConfigs, setArenaConfig, setDefaultArenaConfig } from '../../../core/constants';
import { type DecisionRandom, generatorDecisionRandom } from '../../../core/decisionRandom';
import { type ParityRun, runAllParityTrajectories } from './decisionParityDriver';

const EMPTY_ARENA: ArenaConfig = { bounds: null, walkableTiles: null, collisionMap: null };

afterEach(() => {
  clearResolvedArenaConfigs();
  setDefaultArenaConfig(EMPTY_ARENA);
  setArenaConfig(EMPTY_ARENA, true);
});

/**
 * 3 run seeds x 8 start waves x 260 ticks, digested every 20 ticks. The golden pins every labeled
 * draw (the `DecisionRandom` seam) and every modeled Inferno mechanic these runs reach: removal in the
 * NPC's turn, healer timing and placement, regeneration, resurrection, dying swings, launch tiles,
 * splits, revived NPCs' attack gate, entity collision and the practice start on the first tick after
 * GO. Re-record it only for a deliberate mechanic change, and check that only the runs and checkpoints
 * that change should reach have moved. Regenerating it for any other reason proves nothing.
 */
const GOLDEN = JSON.parse(
  readFileSync('src/encounters/inferno/__tests__/fixtures/decision-parity.golden.json', 'utf8'),
) as ParityRun[];

function counting(counts: Map<string, number>, next: () => number): DecisionRandom {
  const inner = generatorDecisionRandom(next);
  const bump = (site: string) => counts.set(site, (counts.get(site) ?? 0) + 1);
  return {
    next: () => {
      bump('(unlabelled)');
      return inner.next();
    },
    chance: (key, probability) => {
      bump(key.site);
      return inner.chance(key, probability);
    },
    int: (key, low, high) => {
      bump(key.site);
      return inner.int(key, low, high);
    },
    choose: (key, options) => {
      bump(key.site);
      return inner.choose(key, options);
    },
  };
}

// Each test simulates all 24 runs (about 6,000 ticks): with every worker busy on a slower machine
// that can pass the default 5s, so they get the same generous bound as the other whole-simulation suites.
const SIMULATION_TIMEOUT_MS = 30_000;

describe('decision-random parity', { timeout: SIMULATION_TIMEOUT_MS }, () => {
  it('reproduces the golden trajectories', () => {
    expect(runAllParityTrajectories()).toEqual(GOLDEN);
  });

  it('reaches every labeled Inferno site, unchanged when every stream is wrapped', () => {
    const npc = new Map<string, number>();
    const combat = new Map<string, number>();
    const runs = runAllParityTrajectories({
      encounter: { decisionRandom: (_stream, _wave, next) => counting(npc, next) },
      combatDecisions: (next) => counting(combat, next),
    });
    expect(runs).toEqual(GOLDEN);
    // Every draw of the encounter's own streams is labeled.
    expect(npc.has('(unlabelled)')).toBe(false);
    const sites = new Set([...npc.keys(), ...combat.keys()]);
    for (const site of [
      'inferno.layout.slot',
      'inferno.layout.jad',
      'inferno.layout.nibbler_x',
      'inferno.layout.nibbler_y',
      'inferno.nibbler.pillar',
      'inferno.nibbler.damage',
      'inferno.blob.style',
      'inferno.blob.melee',
      'inferno.meleer.dig_interval',
      'inferno.mager.rez',
      'inferno.mager.rez.corpse',
      'inferno.mager.rez.tile',
      'inferno.jad.style',
      'inferno.jad_healer.tile',
      'npc.attack.select',
      'npc.attack.accuracy',
      'npc.attack.damage',
      'npc.movement.overlap_escape',
    ]) {
      expect(sites, site).toContain(site);
    }
  });
});
