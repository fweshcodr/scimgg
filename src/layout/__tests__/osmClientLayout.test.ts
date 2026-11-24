import { describe, expect, it } from 'vitest';
import {
  OSM_CHAT_CONTAINER,
  OSM_COMPASS_MASK,
  OSM_EXPAND_SLOT,
  OSM_MAP_COMPASS_FRAME,
  OSM_MAP_CONTAINER,
  OSM_MAP_MINIMAP,
  OSM_MINIMAP_MASK,
  OSM_SIDE_BACKGROUND,
  OSM_SIDE_CONTENT,
  OSM_SIDE_PANEL,
  OSM_TAB_SLOT_Y,
  OSM_TAB_SLOTS,
  OSM_TAB_STONE,
  osmChatArea,
  osmDebugRightInset,
  osmHotkeysPlacement,
  osmSidePanelPlacement,
  osmTabColumns,
  osmTabRailPlacement,
  osmXpDropRightInset,
} from '../osmClientLayout';

describe('mobile group 601 geometry', () => {
  it('resolves right/center offsets inside the named minimap parents', () => {
    expect(OSM_MAP_CONTAINER).toEqual({ right: 0, top: 0, width: 234, height: 207 });
    expect(OSM_MAP_MINIMAP.x + OSM_MAP_MINIMAP.width + 6).toBe(OSM_MAP_CONTAINER.width);
    expect(OSM_MAP_COMPASS_FRAME).toEqual({ x: 29, y: 0, width: 182, height: 166 });
    expect(OSM_COMPASS_MASK).toEqual({ x: 34, y: 5, width: 35, height: 35 });
    expect(OSM_MINIMAP_MASK).toEqual({ x: 53, y: 8, width: 152, height: 152 });
  });

  it('distinguishes a minus-two background from the absolute centered content', () => {
    expect(OSM_SIDE_PANEL).toEqual({ width: 204, height: 275 });
    expect(OSM_SIDE_BACKGROUND).toEqual({ x: 1, y: 1, width: 202, height: 273 });
    expect(OSM_SIDE_CONTENT).toEqual({ x: 7, y: 7, width: 190, height: 261 });
  });

  it.each([
    [320, false, 85, 41, 36],
    [502, true, 58, 223, 218],
    [503, false, 85, 201, 198],
    [504, true, 58, 201, 199],
    [800, false, 85, 349, 347],
  ])('places panel and rail at height %i, collapsed=%s', (height, collapsed, right, panelTop, railTop) => {
    expect(osmSidePanelPlacement(height, collapsed)).toEqual({ right, top: panelTop, width: 204, height: 275 });
    expect(osmTabRailPlacement(height, collapsed)).toEqual({ right: 0, top: railTop, width: right, height: 280 });
  });

  it('keeps the primary left column intact when the right column is covered', () => {
    expect(osmTabColumns(false)).toEqual({
      left: { x: 3, y: 3, width: 40, height: 274 },
      right: { x: 42, y: 3, width: 40, height: 274 },
    });
    expect(osmTabColumns(true)).toEqual({
      left: { x: 3, y: 3, width: 40, height: 274 },
      right: { x: 15, y: 3, width: 40, height: 274 },
    });
    expect(OSM_TAB_SLOT_Y).toEqual([0, 39, 78, 117, 156, 195, 234]);
    expect(OSM_TAB_SLOT_Y[6] + OSM_TAB_STONE.height).toBe(274);
    expect(OSM_EXPAND_SLOT.iconRect.y).toBe(235);
  });

  it('maps every native side ID once, with Logout outside the thirteen-tab rail', () => {
    const tabs = Object.entries(OSM_TAB_SLOTS);
    expect(tabs.map(([, tab]) => tab.sideId).sort((a, b) => a - b)).toEqual(Array.from({ length: 14 }, (_, i) => i));
    const column = (name: string) => tabs.filter(([, tab]) => tab.column === name).map(([id]) => id);
    expect(column('left')).toEqual(['inventory', 'equipment', 'prayer', 'spellbook', 'combat', 'quests']);
    expect(column('right')).toEqual(['skills', 'emotes', 'music', 'clanChat', 'friends', 'account', 'settings']);
    expect(column('chat')).toEqual(['logout']);
    expect(OSM_TAB_SLOTS.friends.sideId).toBe(9); // Sprite SideIcons._8 is not side ID 8.
    expect(OSM_TAB_SLOTS.account.sideId).toBe(8);
    expect(OSM_EXPAND_SLOT).toMatchObject({ column: 'left', slot: 6, expandedSprite: 4795, collapsedSprite: 4796 });
  });

  it.each([
    [502, false, 210, 242],
    [502, true, 409, 43],
    [503, false, 190, 242],
    [503, true, 390, 43],
  ])('places the independent hotkey column at height %i, collapsed=%s', (height, collapsed, y, h) => {
    expect(osmHotkeysPlacement(height, collapsed)).toEqual({ x: 0, y, width: 58, height: h });
  });

  it.each([
    [false, false, 145],
    [true, false, 115],
    [false, true, 145],
    [true, true, 145],
  ])('sizes bottom-anchored chat with controls=%s, override=%s', (controls, override, height) => {
    const area = osmChatArea(controls, override);
    expect(area).toEqual({ x: 0, y: 165 - height, width: 519, height });
    expect(area.y + area.height).toBe(OSM_CHAT_CONTAINER.height);
  });

  it('uses map visibility for XP inset and adds four only to non-cutscene debug', () => {
    expect(osmXpDropRightInset(false)).toBe(181);
    expect(osmXpDropRightInset(true)).toBe(84);
    expect(osmDebugRightInset(false)).toBe(185);
    expect(osmDebugRightInset(true)).toBe(88);
    expect(osmDebugRightInset(false, true)).toBe(0);
    expect(osmDebugRightInset(true, true)).toBe(0);
  });
});
