// @vitest-environment happy-dom

import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createDefaultStats } from '../../types/playerState';
import { usePlayerStats } from '../usePlayerStats';

const storageMocks = vi.hoisted(() => ({
  loadSetting: vi.fn(),
  saveSetting: vi.fn(),
}));

vi.mock('../../util/storage', () => ({
  loadSetting: storageMocks.loadSetting,
  saveSetting: storageMocks.saveSetting,
}));

describe('usePlayerStats', () => {
  afterEach(() => {
    storageMocks.loadSetting.mockReset();
    storageMocks.saveSetting.mockReset();
  });
  beforeEach(() => {
    storageMocks.loadSetting.mockReset();
    storageMocks.saveSetting.mockReset();
    storageMocks.loadSetting.mockReturnValue(null);
  });

  it('loads validated persisted base levels and initializes current levels consistently', () => {
    storageMocks.loadSetting.mockReturnValue({
      attack: 70,
      strength: 71,
      defence: 72,
      ranged: 73,
      magic: 74,
      prayer: 75,
      hitpoints: 76,
      agility: 77,
    });

    const { result } = renderHook(() => usePlayerStats());

    expect(result.current.stats.attack).toEqual({ current: 70, max: 70 });
    expect(result.current.stats.prayer).toEqual({ current: 75, max: 75 });
    expect(result.current.stats.hitpoints).toEqual({ current: 76, max: 76 });
    expect(result.current.stats.agility).toEqual({ current: 77, max: 77 });
  });

  it('falls back to all 99s when persisted levels are invalid', () => {
    storageMocks.loadSetting.mockReturnValue({
      attack: 0,
      strength: 71,
      defence: 72,
      ranged: 73,
      magic: 74,
      prayer: 75,
      hitpoints: 76,
    });

    const { result } = renderHook(() => usePlayerStats());

    expect(result.current.stats).toEqual(createDefaultStats());
  });

  it('rejects persisted hitpoints below the shared minimum of 10', () => {
    storageMocks.loadSetting.mockReturnValue({
      attack: 1,
      strength: 1,
      defence: 1,
      ranged: 1,
      magic: 1,
      prayer: 1,
      hitpoints: 9,
    });

    const { result } = renderHook(() => usePlayerStats());

    expect(result.current.stats).toEqual(createDefaultStats());
  });

  it('persists base levels after stats change', () => {
    const { result } = renderHook(() => usePlayerStats());

    act(() => {
      result.current.setStats((previous) => ({
        ...previous,
        magic: { current: 85, max: 85 },
      }));
    });

    expect(storageMocks.saveSetting).toHaveBeenCalledWith('osrs-player-stats', {
      attack: 99,
      strength: 99,
      defence: 99,
      ranged: 99,
      magic: 85,
      prayer: 99,
      hitpoints: 99,
      agility: 99,
    });
  });
});
