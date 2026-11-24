import { describe, expect, it } from 'vitest';
import type { CacheInfo } from '../../rs/cache/CacheInfo';
import { ObjType } from '../../rs/config/objtype/ObjType';
import type { ObjTypeLoader } from '../../rs/config/objtype/ObjTypeLoader';
import { buildGroundItemTooltip, buildInventoryTooltip } from '../Tooltip';

const MOCK_CACHE_INFO: CacheInfo = {
  name: 'test',
  game: 'oldschool',
  environment: 'test',
  revision: 1,
  timestamp: '2024-01-01T00:00:00Z',
  size: 0,
};

/**
 * Mirrors the real cache, which carries Eat/Wield in `inventoryActions` and leaves
 * `groundActions` empty for every item — Drop and Take are client-side ops.
 */
function createObjTypeLoader(name: string, inventoryActions: (string | undefined)[] = []): ObjTypeLoader {
  return {
    load(id: number): ObjType {
      const obj = new ObjType(id, MOCK_CACHE_INFO);
      obj.name = name;
      obj.inventoryActions = inventoryActions;
      return obj;
    },
    getCount() {
      return 1;
    },
    clearCache() {},
  };
}

const actionOf = (content: { lines: { spans: { text: string }[] }[] } | null): string | undefined =>
  content?.lines[0]?.spans[0]?.text;

describe('buildInventoryTooltip', () => {
  it('shows the cache action when shift is not held', () => {
    const content = buildInventoryTooltip(385, createObjTypeLoader('Shark', ['Eat']));

    expect(actionOf(content)).toBe('Eat ');
  });

  it('shows Drop while shift means drop, even though no cache item has a Drop op', () => {
    const content = buildInventoryTooltip(385, createObjTypeLoader('Shark', ['Eat']), true);

    expect(actionOf(content)).toBe('Drop ');
    expect(content?.lines[0]?.spans[1]?.text).toBe('Shark');
  });

  it('falls back to Use for an item the cache gives no ops at all', () => {
    const content = buildInventoryTooltip(995, createObjTypeLoader('Coins'));

    expect(actionOf(content)).toBe('Use ');
  });
});

describe('buildGroundItemTooltip', () => {
  it('offers Take, since the cache leaves groundActions empty for every item', () => {
    const content = buildGroundItemTooltip(385, createObjTypeLoader('Shark', ['Eat']));

    expect(actionOf(content)).toBe('Take ');
    expect(content?.lines[0]?.spans[1]?.text).toBe('Shark');
  });
});
