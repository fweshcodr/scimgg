import { afterEach, expect, it } from 'vitest';
import { findProjectCacheZip, loadColosseumWaveArena } from '../../../../test/helpers/colosseumCollision';
import { REAL_CACHE_TEST_TIMEOUT_MS, skipWithoutRealCache } from '../../../../test/helpers/real-cache';
import { getArenaAllowUnboundedFallback, getArenaConfig, setArenaConfig } from '../../../constants';
import { isRicochetReachable } from '../ricochet';
import { type CapturedVenatorShot, VENATOR_HOP_CANDIDATES } from './fixtures/venatorHopCandidatesCapture';

/**
 * Replays every captured Venator hop decision through the production reach rule, with the cache's
 * pillar collision for line of sight, and scores the target choice
 * (`fixtures/venatorHopCandidatesCapture.ts`). The no-sol capture predates the 19 August 2026 update;
 * waves-1-12 and waves-bees follow it.
 */
type Era = CapturedVenatorShot['era'];
type Npc = CapturedVenatorShot['snapshot'][number];
type Decision = { era: Era; hop: number; eligible: Npc[]; chosen: number | undefined };

function decisions(): Decision[] {
  const out: Decision[] = [];
  for (const { era, chain, snapshot, primaryKilled } of VENATOR_HOP_CANDIDATES) {
    for (let hop = 0; hop < 2; hop++) {
      const sender = snapshot.find((npc) => npc.index === chain[hop]);
      if (!sender) break;
      const chosen = chain[hop + 1];
      const eligible = snapshot.filter(
        (npc) =>
          npc.index !== sender.index &&
          (npc.index !== chain[0] || (hop > 0 && !primaryKilled)) &&
          isRicochetReachable(sender, npc),
      );
      out.push({ era, hop: hop + 1, eligible, chosen });
      if (chosen === undefined) break;
    }
  }
  return out;
}

const cachePath = findProjectCacheZip();
const originalArena = getArenaConfig();
const originalUnbounded = getArenaAllowUnboundedFallback();
afterEach(() => setArenaConfig(originalArena, originalUnbounded));

it.skipIf(skipWithoutRealCache())(
  'reaches and picks the captured Venator hop targets, and shows what the 19 August 2026 update changed',
  async () => {
    setArenaConfig(await loadColosseumWaveArena(cachePath!));
    const all = decisions();
    const score = (era: Era) => {
      const mine = all.filter((decision) => decision.era === era);
      const taken = mine.filter((decision) => decision.chosen !== undefined);
      const choices = taken.filter((decision) => decision.eligible.length > 1);
      const highestIndex = (decision: Decision) => Math.max(...decision.eligible.map(({ index }) => index));
      // The simulator's stand-in for the index: latest spawn tick, ties by index.
      const latestSpawn = (decision: Decision) =>
        [...decision.eligible].sort((left, right) => right.spawnTick - left.spawnTick || right.index - left.index)[0]
          ?.index;
      return {
        hopsTaken: taken.length,
        takenWithinReach: taken.filter((decision) => decision.eligible.some(({ index }) => index === decision.chosen))
          .length,
        unusedSlots: mine.length - taken.length,
        unusedSlotsWithReachableTarget: mine.filter(
          (decision) => decision.chosen === undefined && decision.eligible.length > 0,
        ).length,
        choices: choices.length,
        highestIndexChosen: choices.filter((decision) => highestIndex(decision) === decision.chosen).length,
        latestSpawnChosen: choices.filter((decision) => latestSpawn(decision) === decision.chosen).length,
        uniformExpectation:
          Math.round(choices.reduce((sum, decision) => sum + 1 / decision.eligible.length, 0) * 10) / 10,
      };
    };

    expect(score('postUpdate')).toEqual({
      hopsTaken: 116,
      takenWithinReach: 116,
      unusedSlots: 28,
      unusedSlotsWithReachableTarget: 0,
      choices: 26,
      highestIndexChosen: 23,
      latestSpawnChosen: 23,
      uniformExpectation: 12.7,
    });
    // Before the update the same reach finds the 3x3 Minotaur from a 1x1 the game did not bounce
    // to (ticks 3526 and 3530), and the choice shows no preference.
    expect(score('preUpdate')).toEqual({
      hopsTaken: 74,
      takenWithinReach: 74,
      unusedSlots: 11,
      unusedSlotsWithReachableTarget: 2,
      choices: 12,
      highestIndexChosen: 5,
      latestSpawnChosen: 5,
      uniformExpectation: 6,
    });
  },
  REAL_CACHE_TEST_TIMEOUT_MS,
);
