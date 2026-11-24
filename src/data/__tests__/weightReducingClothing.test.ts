import { beforeAll, describe, expect, it } from 'vitest';
import { calculateRunEnergyRegen } from '../../core/timers';
import type { ObjTypeLoader } from '../../rs/config/objtype/ObjTypeLoader';
import { loadCacheLoaders, REAL_CACHE_TEST_TIMEOUT_MS, skipWithoutRealCache } from '../../test/helpers/real-cache';
import { computeTotalWeight } from '../../types/equipmentStats';
import { equippedWeightItemId, gracefulRegenBonusPercent, WEIGHT_REDUCING_PAIRS } from '../weightReducingClothing';

const FULL_GRACEFUL = { head: 11850, cape: 11852, body: 11854, legs: 11856, hands: 11858, boots: 11860 };

describe('graceful regeneration bonus', () => {
  it.each([
    [{}, 0],
    [{ head: 11850 }, 3],
    [{ body: 11854, legs: 11856 }, 8],
    [{ ...FULL_GRACEFUL, cape: undefined }, 17],
    [FULL_GRACEFUL, 30],
    // Recolors mix within one set, and the worn ids count the same as inventory ids.
    [{ ...FULL_GRACEFUL, head: 13580, boots: 30060 }, 30],
    // Agility and max capes substitute for the graceful cape.
    [{ ...FULL_GRACEFUL, cape: 9771 }, 30],
    [{ ...FULL_GRACEFUL, cape: 13342 }, 30],
    // Boots of lightness reduce weight but give no regeneration.
    [{ ...FULL_GRACEFUL, boots: 88 }, 17],
  ])('%o gives +%i%%', (equipment, percent) => {
    expect(gracefulRegenBonusPercent(equipment)).toBe(percent);
  });

  it('full set regenerates floor(1.3 * R)', () => {
    expect(calculateRunEnergyRegen(99, 30)).toBe(31);
    expect(calculateRunEnergyRegen(1, 30)).toBe(19);
    expect(calculateRunEnergyRegen(99, 0)).toBe(24);
  });

  it('maps inventory ids to their worn form and passes everything else through', () => {
    expect(equippedWeightItemId(88)).toBe(89);
    expect(equippedWeightItemId(89)).toBe(89);
    expect(equippedWeightItemId(1127)).toBe(1127);
  });
});

describe.skipIf(skipWithoutRealCache('pinned'))('weight-reducing clothing (real cache)', () => {
  let loader: ObjTypeLoader;
  beforeAll(async () => {
    loader = (await loadCacheLoaders('pinned')).objTypeLoader;
  }, 120_000);

  it(
    'every pair is the same item, and the worn form is lighter and non-positive',
    () => {
      for (const [inventoryId, wornId] of WEIGHT_REDUCING_PAIRS) {
        const inventory = loader.load(inventoryId);
        const worn = loader.load(wornId);
        expect(worn.name, `${inventoryId}/${wornId}`).toBe(inventory.name);
        expect(worn.weight, `${inventory.name} ${wornId}`).toBeLessThanOrEqual(0);
        expect(worn.weight).toBeLessThan(inventory.weight);
      }
    },
    REAL_CACHE_TEST_TIMEOUT_MS,
  );

  it(
    'counts worn weight only while equipped',
    () => {
      // https://oldschool.runescape.wiki/w/Boots_of_lightness: 0.34 kg carried, -4.535 kg worn.
      expect(computeTotalWeight({ boots: 88 }, [], loader)).toBeCloseTo(-4.535);
      expect(computeTotalWeight({}, [{ id: 88 }], loader)).toBeCloseTo(0.34);
      // https://oldschool.runescape.wiki/w/Graceful_outfit: the full set reduces weight by 25 kg.
      expect(computeTotalWeight(FULL_GRACEFUL, [], loader)).toBeCloseTo(-25);
    },
    REAL_CACHE_TEST_TIMEOUT_MS,
  );
});
