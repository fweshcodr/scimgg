export interface LobbyEffectMeta {
  defaultAlpha: number;
  animatedAlpha?: () => number;
}

export const LOBBY_EFFECT_TOGGLES: Array<{ key: string; label: string }> = [
  { key: 'nebula', label: 'Nebula Clouds' },
  { key: 'farStars', label: 'Far Stars' },
  { key: 'midStars', label: 'Mid Stars' },
  { key: 'closeStars', label: 'Close Stars' },
  { key: 'shootingStars', label: 'Shooting Stars' },
  { key: 'ambientHaze', label: 'Ambient Haze (atmosphere)' },
  { key: 'ambientMotes', label: 'Ambient Motes' },
  { key: 'godRays', label: 'God Rays (particles)' },
  { key: 'arenaFloorTiles', label: 'Floor Tiles' },
  { key: 'starSpikes', label: 'Star Spikes' },
  { key: 'boundaryGems', label: 'Boundary Gems' },
  { key: 'centerPoolGlow', label: 'Center Pool Glow' },
  { key: 'vortexSwirl', label: 'Vortex Swirl' },
  { key: 'bossGroundActive', label: 'Boss Ground (Active)' },
  { key: 'bossGroundInactive', label: 'Boss Ground (Inactive)' },
  { key: 'brazierBowls', label: 'Brazier Bowls' },
  { key: 'brazierFlames', label: 'Brazier Flames' },
  { key: 'bossSpotlights', label: 'Boss Spotlights' },
  { key: 'debris', label: 'Debris Chunks' },
  { key: 'fallenColumns', label: 'Fallen Columns' },
];

export const LOBBY_EFFECT_METADATA: Record<string, LobbyEffectMeta> = {
  nebula: { defaultAlpha: 0.12 },
  farStars: { defaultAlpha: 1.0 },
  midStars: { defaultAlpha: 0.9 },
  closeStars: { defaultAlpha: 0.7 },
  shootingStars: { defaultAlpha: 1.0 },
  ambientHaze: { defaultAlpha: 0.2 },
  ambientMotes: { defaultAlpha: 0.1 },
  godRays: {
    defaultAlpha: 0.675,
    animatedAlpha: () => 0.675 + 0.075 * Math.sin((performance.now() / 1000) * 1.2),
  },
  arenaFloorTiles: { defaultAlpha: 0.03 },
  starSpikes: { defaultAlpha: 0.05 },
  boundaryGems: { defaultAlpha: 0.3 },
  centerPoolGlow: { defaultAlpha: 0.08 },
  vortexSwirl: { defaultAlpha: 0.05 },
  bossGroundActive: { defaultAlpha: 0.15 },
  bossGroundInactive: { defaultAlpha: 0.05 },
  brazierBowls: { defaultAlpha: 0.2 },
  brazierFlames: {
    defaultAlpha: 0.1,
    animatedAlpha: () => 0.1 + 0.05 * Math.sin((performance.now() / 1000) * 0.8),
  },
  bossSpotlights: { defaultAlpha: 0.05 },
  debris: { defaultAlpha: 0.32 },
  fallenColumns: { defaultAlpha: 1.0 },
};

export function getLobbyEffectDefaults(): Record<string, number> {
  const defaults: Record<string, number> = {};
  for (const [key, meta] of Object.entries(LOBBY_EFFECT_METADATA)) {
    defaults[key] = meta.defaultAlpha;
  }
  return defaults;
}
