import type { EncounterModifierTier } from '../../../core/encounters/encounterFactory';
import type { EnvironmentalDamage } from '../../../core/encounters/types';
import type { Coordinate } from '../../../types/simulation';

export function volatilityExplosionCentre(position: Readonly<Coordinate>, size: number): Coordinate {
  const offset = Math.floor(size / 2);
  return [position[0] + offset, position[1] + offset];
}

/** Wiki Modifiers oldid=15163385: III retains II's radius; the added sand pool is not simulated. */
export function volatilityExplosionTiles(
  npcPosition: Readonly<Coordinate>,
  npcSize: number,
  tier: EncounterModifierTier,
): Coordinate[] {
  const radius = Math.min(tier, 2);
  const tiles: Coordinate[] = [];
  for (let x = npcPosition[0] - radius; x < npcPosition[0] + npcSize + radius; x++) {
    for (let y = npcPosition[1] - radius; y < npcPosition[1] + npcSize + radius; y++) tiles.push([x, y]);
  }
  return tiles;
}

/** M8521 and N7790: client-cycle ripple, not a damage delay or a per-tick hazard. */
export function volatilityRingDelay(position: Readonly<Coordinate>, centre: Readonly<Coordinate>): number {
  return 2 * Math.max(Math.abs(position[0] - centre[0]), Math.abs(position[1] - centre[1]));
}

export const VOLATILITY_DAMAGE_SOURCE = 'Volatility';

/** A:2800/2852/3487/3592/3608/4026: the visual footprint is also the damage footprint. */
export function volatilityExplosionDamage(
  npcPosition: Readonly<Coordinate>,
  npcSize: number,
  tier: EncounterModifierTier,
  playerStartPosition: Readonly<Coordinate>,
): EnvironmentalDamage[] {
  // A:3260/4638: leaving during this tick still hits; A:2979: stepping in does not.
  const covered = volatilityExplosionTiles(npcPosition, npcSize, tier).some(
    ([x, y]) => x === playerStartPosition[0] && y === playerStartPosition[1],
  );
  return covered
    ? [
        {
          // MODEL: observed 16–24 (I 17/24/16/20, II 22/22/21, III 21); use engine combat RNG.
          baseDamage: [16, 24],
          attackType: 'typeless',
          source: VOLATILITY_DAMAGE_SOURCE,
          playerPosition: [...playerStartPosition],
        },
      ]
    : [];
}
