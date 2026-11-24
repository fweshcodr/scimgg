import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { discoverCacheUsage } from '../../../scripts/discoverCacheUsage';
import { SELF_IMBUE_CAST_ANIM_ID } from '../../core/SimulationEngine';
import {
  getPlayerBlockAnimations,
  getWeaponAnimationSetWithFallbacks,
  PLAYER_ANIMATION_SEQ_IDS,
  PLAYER_EAT_SEQ_ID,
} from '../weaponAnimations';
import { WEAPON_ANIMATION_SETS } from '../weaponCombatVisuals.generated';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');

/**
 * `scripts/trim-cache.ts` ships only the archives it traced, so a player clip that reaches no
 * trace input is absent from the production cache and the model T-poses where it should
 * animate — in production only, because dev serves the full cache.
 */
describe('player animations survive the production cache trim', () => {
  it('covers every pose and flinch id the public resolvers can return', () => {
    const covered = new Set(PLAYER_ANIMATION_SEQ_IDS);
    const generated = new Set<number>();
    for (const set of Object.values(WEAPON_ANIMATION_SETS)) {
      for (const id of Object.values(set)) {
        if (typeof id === 'number' && id >= 0) generated.add(id);
      }
    }

    // 21015 and 4084 carry a WEAPON_BLOCK_ANIMATIONS row but no generated set, so dropping them
    // from this list stops the test seeing 7512/1466 at all. 11283 has no row in either offhand
    // table, so it takes the GENERIC_SHIELD_BLOCK branch.
    const weapons = [undefined, 21015, 4084, ...Object.keys(WEAPON_ANIMATION_SETS).map(Number)];
    const offhands = [undefined, 22322, 12954, 3839, 11283];
    const missing = new Set<number>();

    for (const weapon of weapons) {
      for (const set of getWeaponAnimationSetWithFallbacks(weapon)) {
        for (const id of Object.values(set)) {
          if (typeof id !== 'number' || id < 0) continue;
          // The generated table is its own trace input in trim-cache; this list only has to
          // carry what that table does not.
          if (!covered.has(id) && !generated.has(id)) missing.add(id);
        }
      }
      for (const offhand of offhands) {
        for (const id of getPlayerBlockAnimations(weapon, offhand)) {
          if (!covered.has(id) && !generated.has(id)) missing.add(id);
        }
      }
    }

    expect([...missing]).toEqual([]);
    expect(covered.has(PLAYER_EAT_SEQ_ID)).toBe(true);
  });

  it('discovers the self-imbue cast id from real source, not a fixture', async () => {
    const report = await discoverCacheUsage(REPO_ROOT);

    expect(report.seqIds.has(SELF_IMBUE_CAST_ANIM_ID)).toBe(true);
  }, 60000);
});
