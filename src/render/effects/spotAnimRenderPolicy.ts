import { SPELL_VISUALS } from '../../data/spellVisuals';
import { SpotAnimID } from '../../rs/config/spotanimtype/SpotAnimID';
import type { SpotAnimStyle } from './spotAnimTypes';

/**
 * Forward depth bias for effects flat on, or dipping into, the floor. Under the reversed-Z depth
 * test they would otherwise tie the terrain and flicker.
 */
export const FLOOR_EFFECT_DEPTH_BIAS = 0.0005;

export const PROJECTILE_FLIGHT_STYLE = {
  cullFace: 'back',
  requireTransparentSort: true,
} as const satisfies SpotAnimStyle;

const DEMONBANE_CAST_SPOTANIM_IDS = new Set<number>(
  Object.values(SPELL_VISUALS).map((visuals) => visuals.castSpotanimId),
);
const DEMONBANE_HIT_SPOTANIM_IDS = new Set<number>(
  Object.values(SPELL_VISUALS).map((visuals) => visuals.hitSpotanimId),
);

export function getPlayerGraphicSpotAnimStyle(spotAnimId: number): SpotAnimStyle | undefined {
  return spotAnimId === SpotAnimID.VFX_PLAYER_MARK_OF_DARKNESS || DEMONBANE_CAST_SPOTANIM_IDS.has(spotAnimId)
    ? { depthBias: FLOOR_EFFECT_DEPTH_BIAS }
    : undefined;
}

export function getProjectileImpactSpotAnimStyle(spotAnimId: number): SpotAnimStyle | undefined {
  return DEMONBANE_HIT_SPOTANIM_IDS.has(spotAnimId) ? { depthBias: FLOOR_EFFECT_DEPTH_BIAS } : undefined;
}
