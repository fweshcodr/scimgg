import { describe, expect, it } from 'vitest';
import { EQUIPMENT_PRESETS } from '../../data/playerPresets';
import { createDefaultStats } from '../../types/playerState';
import { getUnmetPresetRequirements } from '../presetRequirements';

describe('getUnmetPresetRequirements', () => {
  it('returns only exact requirements above configured base levels', () => {
    const stats = createDefaultStats();
    stats.attack = { current: 120, max: 74 };
    stats.defence = { current: 80, max: 79 };
    stats.strength = { current: 90, max: 90 };

    const unmet = getUnmetPresetRequirements(stats, EQUIPMENT_PRESETS.yama_p3['max-mage']);

    expect(unmet).toEqual({ attack: 75, defence: 80 });
  });

  it('returns no requirements for a compatible or requirement-free preset', () => {
    const stats = createDefaultStats();

    expect(getUnmetPresetRequirements(stats, EQUIPMENT_PRESETS.yama_p3['max-mage'])).toEqual({});
    expect(getUnmetPresetRequirements(stats, EQUIPMENT_PRESETS.lobby.naked)).toEqual({});
  });
});
