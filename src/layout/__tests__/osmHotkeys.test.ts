import { describe, expect, it } from 'vitest';
import { REPLAY_HOTKEY_IDS, REPLAY_HOTKEY_SLOTS } from '../../replay/format/presentationFormat';
import { OSM_HOTKEY_SLOTS } from '../osmClientLayout';
import {
  JAGEX_BOSSING_HOTKEYS,
  JAGEX_BOSSING_HOTKEYS_LABEL,
  OSM_HOTKEY_EMPTY,
  OSM_HOTKEY_TYPES,
  type OsmHotkeyFacts,
  type OsmSideState,
  osmHotkeyActive,
  osmHotkeyStone,
  osmHotkeyType,
  osmSideButtonOp,
} from '../osmHotkeys';

const facts: OsmHotkeyFacts = {
  openTab: null,
  quickPrayersActive: false,
  runEnabled: false,
  hasSpecialAttack: true,
  specialAttackShownActive: false,
};
const type = (id: number) => {
  const found = osmHotkeyType(id);
  if (!found) throw new Error(`no hotkey ${id}`);
  return found;
};

describe('hotkey catalog (enum 5607)', () => {
  it('keeps the replay schema in step with the hotkeys the app offers', () => {
    expect([...REPLAY_HOTKEY_IDS].sort((a, b) => a - b)).toEqual(
      [OSM_HOTKEY_EMPTY, ...OSM_HOTKEY_TYPES.map((t) => t.id)].sort((a, b) => a - b),
    );
    expect(REPLAY_HOTKEY_SLOTS).toBe(OSM_HOTKEY_SLOTS);
  });

  it('defaults to Jagex’s recommended bossing loadout', () => {
    expect(JAGEX_BOSSING_HOTKEYS_LABEL).toBe("Jagex's recommended bossing loadout");
    expect(JAGEX_BOSSING_HOTKEYS.map((id) => osmHotkeyType(id)?.name)).toEqual([
      'Toggle run',
      'Special attack',
      'Prayer Tab',
      'Spellbook Tab',
      'Quick-prayers',
    ]);
  });
});

describe('osmSideButtonOp', () => {
  const open: OsmSideState = { tab: 'inventory', open: true, fromHotkey: false };

  it('closes the open panel when its own tab is pressed again', () => {
    expect(osmSideButtonOp(open, 'inventory', 'hotkey')).toEqual({ tab: 'inventory', open: false, fromHotkey: true });
    expect(osmSideButtonOp(open, 'inventory', 'rail').open).toBe(false);
  });

  it('reopens the same tab once its panel is hidden', () => {
    const hidden = osmSideButtonOp(open, 'inventory', 'hotkey');
    expect(osmSideButtonOp(hidden, 'inventory', 'hotkey')).toEqual({ tab: 'inventory', open: true, fromHotkey: true });
  });

  it('switches tab, and remembers whether a hotkey or a rail stone did it', () => {
    expect(osmSideButtonOp(open, 'prayer', 'hotkey')).toEqual({ tab: 'prayer', open: true, fromHotkey: true });
    const left = osmSideButtonOp(open, 'prayer', 'hotkey');
    expect(osmSideButtonOp(left, 'spellbook', 'rail')).toEqual({ tab: 'spellbook', open: true, fromHotkey: false });
  });
});

describe('hotkey stones', () => {
  it('lights a panel hotkey only while its panel shows', () => {
    expect(osmHotkeyStone(type(8), { ...facts, openTab: 'prayer' })).toBe('active');
    expect(osmHotkeyStone(type(8), { ...facts, openTab: 'inventory' })).toBe('resting');
    expect(osmHotkeyStone(type(8), facts)).toBe('resting');
  });

  it('lights quick-prayers and run while they are on', () => {
    expect(osmHotkeyStone(type(21), { ...facts, quickPrayersActive: true })).toBe('active');
    expect(osmHotkeyActive(type(22), { ...facts, runEnabled: true })).toBe(true);
  });

  it('gives special attack its own three stones', () => {
    expect(osmHotkeyStone(type(23), { ...facts, hasSpecialAttack: false })).toBe('disabled');
    expect(osmHotkeyStone(type(23), facts)).toBe('special');
    expect(osmHotkeyStone(type(23), { ...facts, specialAttackShownActive: true })).toBe('specialOn');
  });
});
