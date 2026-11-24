// @vitest-environment happy-dom

import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { EQUIPMENT_PRESETS } from '../../data/playerPresets';
import { createEmptyCombatSupplies } from '../../types/encounterLoadout';
import { useCustomEquipmentPresets } from '../useCustomEquipmentPresets';

const storageMocks = vi.hoisted(() => ({
  loadSetting: vi.fn(),
  saveSetting: vi.fn(),
}));

vi.mock('../../util/storage', () => ({
  loadSetting: storageMocks.loadSetting,
  saveSetting: storageMocks.saveSetting,
}));

describe('useCustomEquipmentPresets', () => {
  afterEach(() => vi.clearAllMocks());

  it('persists a named sanitized fork separately from the active encounter loadout', async () => {
    const preset = EQUIPMENT_PRESETS.yama_p3['max-mage'];
    storageMocks.loadSetting.mockReturnValue({});

    const { result } = renderHook(() => useCustomEquipmentPresets());
    act(() => {
      result.current.savePreset('yama_p3', 'mage-custom', 'Mage custom', {
        equipment: { ...preset.equipment, weapon: 999999999 },
        inventory: preset.inventory,
        supplies: preset.supplies ?? createEmptyCombatSupplies(),
      });
    });

    expect(result.current.getPresets('yama_p3')[0]?.loadout.equipment.weapon).toBeUndefined();
    await waitFor(() => {
      expect(storageMocks.saveSetting).toHaveBeenCalledWith('osrs-custom-equipment-presets', {
        yama_p3: [expect.objectContaining({ id: 'mage-custom', name: 'Mage custom' })],
      });
    });
  });

  it('persists an update under the same id and does not insert a missing preset', async () => {
    const preset = EQUIPMENT_PRESETS.yama_p3['max-mage'];
    const loadout = { equipment: preset.equipment, inventory: preset.inventory, supplies: createEmptyCombatSupplies() };
    storageMocks.loadSetting.mockReturnValue({ yama_p3: [{ id: 'mine', name: 'My kit', loadout }] });
    const { result } = renderHook(() => useCustomEquipmentPresets());
    const edited = { ...loadout, equipment: {} };
    act(() => expect(result.current.updatePreset('yama_p3', 'mine', edited)).toBe(true));
    expect(result.current.getPresets('yama_p3')).toEqual([{ id: 'mine', name: 'My kit', loadout: edited }]);
    await waitFor(() =>
      expect(storageMocks.saveSetting).toHaveBeenCalledWith('osrs-custom-equipment-presets', {
        yama_p3: [{ id: 'mine', name: 'My kit', loadout: edited }],
      }),
    );
    storageMocks.saveSetting.mockClear();
    act(() => expect(result.current.updatePreset('yama_p3', 'max-mage', edited)).toBe(false));
    expect(storageMocks.saveSetting).not.toHaveBeenCalled();
  });

  describe('sets saved under the retired Zuk kind', () => {
    const preset = EQUIPMENT_PRESETS.yama_p3['max-mage'];
    const loadout = { equipment: preset.equipment, inventory: preset.inventory, supplies: createEmptyCombatSupplies() };

    it('reads them on the Inferno and saves the consolidated map on load', async () => {
      storageMocks.loadSetting.mockReturnValue({ zuk: [{ id: 'mine', name: 'My kit', loadout }] });

      const { result } = renderHook(() => useCustomEquipmentPresets());

      expect(result.current.getPresets('inferno')).toEqual([{ id: 'mine', name: 'My kit', loadout }]);
      await waitFor(() =>
        expect(storageMocks.saveSetting).toHaveBeenCalledWith('osrs-custom-equipment-presets', {
          inferno: [{ id: 'mine', name: 'My kit', loadout }],
        }),
      );
    });
  });
});
