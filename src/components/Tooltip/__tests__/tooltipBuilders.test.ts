import { describe, expect, it } from 'vitest';
import type { CacheInfo } from '../../../rs/cache/CacheInfo';
import { NpcType } from '../../../rs/config/npctype/NpcType';
import { ObjType } from '../../../rs/config/objtype/ObjType';
import type { ObjTypeLoader } from '../../../rs/config/objtype/ObjTypeLoader';
import {
  buildEquipmentTooltip,
  buildGroundItemTooltip,
  buildInventoryTooltip,
  buildMenuEntryTooltip,
  buildNpcTooltip,
} from '../tooltipBuilders';
import { TOOLTIP_COLORS } from '../tooltipTypes';

const ITEM_ID = 28991;
const ITEM_NAME = 'Atlatl dart';
const CACHE_INFO: CacheInfo = {
  name: 'test',
  game: 'oldschool',
  environment: 'live',
  revision: 0,
  timestamp: '2026-01-01T00:00:00Z',
  size: 0,
};

function createObjTypeLoader(): ObjTypeLoader {
  const item = new ObjType(ITEM_ID, CACHE_INFO);
  item.name = ITEM_NAME;

  return {
    load: () => item,
    getCount: () => 1,
    clearCache: () => undefined,
  };
}

describe('buildEquipmentTooltip', () => {
  it.each([
    buildEquipmentTooltip,
    buildGroundItemTooltip,
    buildInventoryTooltip,
  ])('resolves the necklace catalog name when the cache name is literal null', (buildTooltip) => {
    const item = new ObjType(33639, CACHE_INFO);
    const loader: ObjTypeLoader = { load: () => item, getCount: () => 1, clearCache: () => undefined };

    const tooltip = buildTooltip(33639, loader);

    expect(tooltip?.lines[0]?.spans[1]?.text).toBe('Necklace of rupture');
  });

  it('offers Wear for a cataloged wearable the cache has no actions for', () => {
    const item = new ObjType(33639, CACHE_INFO);
    const loader: ObjTypeLoader = { load: () => item, getCount: () => 1, clearCache: () => undefined };

    expect(buildInventoryTooltip(33639, loader)?.lines[0]?.spans[0]?.text).toBe('Wear ');
  });
  it('keeps the loaded item name without Remove when the slot is informational', () => {
    const loader = createObjTypeLoader();

    const tooltip = buildEquipmentTooltip(ITEM_ID, loader, false);

    expect(tooltip?.lines[0]?.spans.map((span) => span.text)).toEqual([ITEM_NAME]);
  });

  it('keeps Remove and the loaded item name when the slot is removable', () => {
    const loader = createObjTypeLoader();

    const tooltip = buildEquipmentTooltip(ITEM_ID, loader, true);

    expect(tooltip?.lines[0]?.spans.map((span) => span.text)).toEqual(['Remove ', ITEM_NAME]);
  });
});

const YAMA = (() => {
  const type = new NpcType(14176, CACHE_INFO);
  type.name = 'Yama';
  type.combatLevel = 700;
  type.actions = ['Attack'];
  return type;
})();

describe('buildNpcTooltip', () => {
  it('paints the target in the NPC gold by default', () => {
    expect(buildNpcTooltip(YAMA)?.lines[0]?.spans[1]?.color).toBe(TOOLTIP_COLORS.npc);
  });

  it('paints the target in the highlight color when NPC Highlights supplies one', () => {
    expect(buildNpcTooltip(YAMA, '#6fb0ae')?.lines[0]?.spans[1]?.color).toBe('#6fb0ae');
  });
});

describe('buildMenuEntryTooltip', () => {
  it('reads the action and target off the promoted menu entry', () => {
    const tooltip = buildMenuEntryTooltip({ action: 'Attack', target: 'Void flare  (level-1)' });
    expect(tooltip?.lines[0]?.spans.map((s) => s.text)).toEqual(['Attack ', 'Void flare  (level-1)']);
  });

  it('carries the entry color through, so a tagged NPC keeps its highlight', () => {
    expect(
      buildMenuEntryTooltip({ action: 'Attack', target: 'Yama', targetColor: '#6fb0ae' })?.lines[0]?.spans[1]?.color,
    ).toBe('#6fb0ae');
  });

  it('drops the attack-target marker the right-click menu adds', () => {
    expect(buildMenuEntryTooltip({ action: 'Attack', target: '*Yama' })?.lines[0]?.spans[1]?.text).toBe('Yama');
  });

  it('has nothing to show for a targetless entry', () => {
    expect(buildMenuEntryTooltip({ action: 'Walk here' })).toBeNull();
  });
});
