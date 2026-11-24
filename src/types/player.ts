import type { PlayerAppearance, PlayerEquipment } from '../rs/model/PlayerModelLoader';
import type { CombatSupplies } from './encounterLoadout';
import type { Inventory } from './inventory';
import { createDefaultStats, type PlayerStatName, type PlayerStats } from './playerState';

export interface PlayerConfig {
  appearance: PlayerAppearance;
  equipment: PlayerEquipment;
  stats: PlayerStats;
}

export type PresetRequirements = Partial<Record<PlayerStatName, number>>;

export type EncounterPreset = {
  readonly name: string;
  readonly equipment: PlayerEquipment;
  readonly inventory: Inventory;
  readonly supplies?: CombatSupplies;
  readonly requirements?: PresetRequirements;
  /**
   * Marks the No-Equipment fallback set. When a preset group also contains real
   * equipment sets, a fallback preset is never offered as a selectable picker row:
   * it is auto-applied only when every real set is blocked by the configured stats,
   * and the loadout auto-recovers to the first compatible real set once stats allow.
   */
  readonly isFallback?: boolean;
  /**
   * Picker section the set is listed under (e.g. `'Speedrun'`). Unsectioned sets are the
   * group's main presets; sets sharing a section are shown together in a collapsible group,
   * in declaration order.
   */
  readonly section?: string;
};

export const DEFAULT_PLAYER_CONFIG: PlayerConfig = {
  appearance: {
    gender: 0,
    hairKit: 0,
    jawKit: 10,
    torsoKit: 18,
    armsKit: 26,
    handsKit: 33,
    legsKit: 36,
    feetKit: 42,
    hairColor: 0,
    torsoColor: 0,
    legsColor: 0,
    feetColor: 0,
    skinColor: 0,
  },
  equipment: {},
  stats: createDefaultStats(),
};
