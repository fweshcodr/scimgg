import type { HitsplatOverlay } from '../core/commands';

/**
 * Hitsplat sprite per overlay type, shared by the 2D and 3D viewports and by `AssetPreloader`.
 *
 * Single source of truth on purpose: a sprite the preloader does not know about is fetched on
 * the first hit that uses it and visibly pops in mid-fight. Deriving the preload list from this
 * map means adding a hitsplat type cannot reintroduce that.
 */
export const HITSPLAT_SPRITE_BY_TYPE: Record<HitsplatOverlay['type'], string> = {
  damage: '/assets/ui/hitsplat-damage.png',
  block: '/assets/ui/hitsplat-block.png',
  poison: '/assets/ui/hitsplat-poison.png',
  venom: '/assets/ui/hitsplat-poison.png',
  heal: '/assets/ui/hitsplat-heal.png',
  doom: '/assets/ui/hitsplat-doom-skull.png',
  burn: '/assets/ui/hitsplat-burn.png',
};
