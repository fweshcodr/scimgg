import { type Dispatch, type SetStateAction, useEffect, useRef, useState } from 'react';
import {
  createDefaultStats,
  createStatsFromBaseLevels,
  isValidBaseStatLevel,
  PLAYER_STAT_KEYS,
  type PlayerBaseStats,
  type PlayerStats,
} from '../types/playerState';
import { loadSetting, saveSetting } from '../util/storage';

const STORAGE_KEY = 'osrs-player-stats';

function loadStats(): PlayerStats {
  const stored = loadSetting<Record<string, unknown>>(STORAGE_KEY);
  if (!stored) return createDefaultStats();

  const levels: PlayerBaseStats = toBaseLevels(createDefaultStats());
  for (const stat of PLAYER_STAT_KEYS) {
    const level = stored[stat];
    if (!isValidBaseStatLevel(stat, level)) {
      return createDefaultStats();
    }
    levels[stat] = level;
  }

  return createStatsFromBaseLevels({
    attack: levels.attack,
    strength: levels.strength,
    defence: levels.defence,
    ranged: levels.ranged,
    magic: levels.magic,
    prayer: levels.prayer,
    hitpoints: levels.hitpoints,
    agility: levels.agility,
  });
}

function toBaseLevels(stats: PlayerStats): PlayerBaseStats {
  return {
    attack: stats.attack.max,
    strength: stats.strength.max,
    defence: stats.defence.max,
    ranged: stats.ranged.max,
    magic: stats.magic.max,
    prayer: stats.prayer.max,
    hitpoints: stats.hitpoints.max,
    agility: stats.agility.max,
  };
}

export function usePlayerStats(): { stats: PlayerStats; setStats: Dispatch<SetStateAction<PlayerStats>> } {
  const [stats, setStats] = useState<PlayerStats>(loadStats);
  const skipNextSave = useRef(true);

  useEffect(() => {
    if (skipNextSave.current) {
      skipNextSave.current = false;
      return;
    }
    saveSetting(STORAGE_KEY, toBaseLevels(stats));
  }, [stats]);

  return { stats, setStats };
}
