import type { EncounterPreset, PresetRequirements } from '../types/player';
import { PLAYER_STAT_KEYS, type PlayerStats } from '../types/playerState';

export function getUnmetPresetRequirements(stats: PlayerStats, preset: EncounterPreset): PresetRequirements {
  const unmet: PresetRequirements = {};
  for (const stat of PLAYER_STAT_KEYS) {
    const requiredLevel = preset.requirements?.[stat];
    if (requiredLevel !== undefined && stats[stat].max < requiredLevel) {
      unmet[stat] = requiredLevel;
    }
  }
  return unmet;
}
