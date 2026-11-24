// @vitest-environment happy-dom

import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useInventoryTags } from '../useInventoryTags';

const STORAGE_KEY = 'osrs-inventory-tags';

const storageMocks = vi.hoisted(() => ({
  loadSetting: vi.fn(),
  saveSetting: vi.fn(),
}));

vi.mock('../../util/storage', () => ({
  loadSetting: storageMocks.loadSetting,
  saveSetting: storageMocks.saveSetting,
}));

describe('useInventoryTags', () => {
  beforeEach(() => {
    storageMocks.loadSetting.mockReset();
    storageMocks.saveSetting.mockReset();
  });

  it('loads tags from storage', () => {
    storageMocks.loadSetting.mockImplementation((key: string) => {
      if (key === STORAGE_KEY) {
        return {
          tags: { '4151': '#ff0000', '560': '#00ff00' },
          showTags: false,
          lastColor: '#123456',
        };
      }
      return null;
    });

    const { result } = renderHook(() => useInventoryTags());

    expect(result.current.tags).toEqual({ '560': '#00ff00', '4151': '#ff0000' });
    expect(result.current.showTags).toBe(false);
    expect(result.current.lastColor).toBe('#123456');
  });

  it('sets a tag for an item', () => {
    storageMocks.loadSetting.mockReturnValue(null);
    const { result } = renderHook(() => useInventoryTags());

    act(() => {
      result.current.setTag(4151, '#00ffaa');
    });

    expect(result.current.getTag(4151)).toBe('#00ffaa');
    expect(result.current.lastColor).toBe('#00ffaa');
    expect(storageMocks.saveSetting).toHaveBeenCalledWith(
      STORAGE_KEY,
      expect.objectContaining({
        tags: expect.objectContaining({ '4151': '#00ffaa' }),
        lastColor: '#00ffaa',
      }),
    );
  });

  it('removes a tag', () => {
    storageMocks.loadSetting.mockReturnValue({
      tags: { '4151': '#ff0000' },
      showTags: true,
      lastColor: '#ff0000',
    });
    const { result } = renderHook(() => useInventoryTags());

    act(() => {
      result.current.removeTag(4151);
    });

    expect(result.current.getTag(4151)).toBeUndefined();
    expect(result.current.tags).toEqual({});
  });

  it('gets all items with a specific tag', () => {
    storageMocks.loadSetting.mockReturnValue(null);
    const { result } = renderHook(() => useInventoryTags());

    act(() => {
      result.current.setTag(4151, '#ff0000');
      result.current.setTag(560, '#ff0000');
      result.current.setTag(995, '#00ff00');
    });

    const itemsWithRedTag = Object.entries(result.current.tags)
      .filter(([, color]) => color === '#ff0000')
      .map(([itemId]) => Number(itemId));

    expect(itemsWithRedTag).toEqual([560, 4151]);
  });
});
