// @vitest-environment happy-dom

import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useTileIndicators } from '../useTileIndicators';

const STORAGE_KEY = 'osrs-tile-indicators';

const storageMocks = vi.hoisted(() => ({
  loadSetting: vi.fn(),
  saveSetting: vi.fn(),
}));

vi.mock('../../util/storage', () => ({
  loadSetting: storageMocks.loadSetting,
  saveSetting: storageMocks.saveSetting,
}));

describe('useTileIndicators', () => {
  beforeEach(() => {
    storageMocks.loadSetting.mockReset();
    storageMocks.saveSetting.mockReset();
  });

  it('adds a tile indicator by enabling a disabled tile type', () => {
    storageMocks.loadSetting.mockReturnValue({
      enabled: true,
      config: {
        trueTile: { enabled: false },
      },
    });

    const { result } = renderHook(() => useTileIndicators());

    expect(result.current.config.trueTile.enabled).toBe(false);

    act(() => {
      result.current.updateTileStyle('trueTile', 'enabled', true);
    });

    expect(result.current.config.trueTile.enabled).toBe(true);
  });

  it('removes a tile indicator by disabling a tile type', () => {
    storageMocks.loadSetting.mockReturnValue(null);

    const { result } = renderHook(() => useTileIndicators());

    act(() => {
      result.current.updateTileStyle('destinationTile', 'enabled', false);
    });

    expect(result.current.config.destinationTile.enabled).toBe(false);
  });

  it('clears all indicators by toggling global enabled off', () => {
    storageMocks.loadSetting.mockReturnValue(null);

    const { result } = renderHook(() => useTileIndicators());

    act(() => {
      result.current.toggleEnabled();
    });

    expect(result.current.enabled).toBe(false);
    expect(result.current.config.trueTile.enabled).toBe(false);
    expect(result.current.config.hoverTile.enabled).toBe(false);
    expect(result.current.config.destinationTile.enabled).toBe(false);
  });

  it('persists indicator config updates to storage', () => {
    storageMocks.loadSetting.mockReturnValue(null);

    const { result } = renderHook(() => useTileIndicators());

    act(() => {
      result.current.updateTileStyle('hoverTile', 'color', '#abcdef');
    });

    expect(storageMocks.saveSetting).toHaveBeenCalledWith(
      STORAGE_KEY,
      expect.objectContaining({
        config: expect.objectContaining({
          hoverTile: expect.objectContaining({ color: '#abcdef' }),
        }),
      }),
    );
  });
});
