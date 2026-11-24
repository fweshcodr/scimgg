import type { GamePanelTab } from '../hooks/keybindStore';

/**
 * The mobile client's hotkeys bar (601:40 HOTKEYS, group 892 `osm_hotkeys`).
 *
 * Every hotkey type is a row of enum 5607 (cache 2485): its struct carries the name
 * (param 1991), the description (1992) and the icon (1988, 1989x1990). The ids below are
 * enum 5607's own keys. Only the types the simulator can act on are offered: its panel
 * tabs and its three orbs. Tap-to-drop, single tap, the walk and entity filters, tile
 * highlights, ground items, NPC tags, cure poison and the panels it does not have are
 * left out.
 */
export type OsmHotkeyId = 6 | 7 | 8 | 9 | 10 | 12 | 18 | 21 | 22 | 23;
/** An unassigned slot (hotkey id 0). */
export const OSM_HOTKEY_EMPTY = 0;
export type OsmHotkeySlot = OsmHotkeyId | typeof OSM_HOTKEY_EMPTY;

export interface OsmHotkeyType {
  readonly id: OsmHotkeyId;
  /** param 1991, the op name and the name in the native hotkey settings. */
  readonly name: string;
  /** param 1992. */
  readonly description: string;
  /** The panel it opens and closes, as its rail stone does, if a panel hotkey. */
  readonly tab?: GamePanelTab;
  /** The orb it presses (hotkeys 21–23), if an orb hotkey. */
  readonly orb?: 'quickPrayers' | 'run' | 'special';
}

export const OSM_HOTKEY_TYPES: readonly OsmHotkeyType[] = [
  { id: 6, name: 'Inventory Tab', description: 'This will open and close the Inventory Tab.', tab: 'inventory' },
  { id: 7, name: 'Equipment Tab', description: 'This will open and close the Equipment Tab.', tab: 'equipment' },
  { id: 8, name: 'Prayer Tab', description: 'This will open and close the Prayer Tab.', tab: 'prayer' },
  { id: 9, name: 'Spellbook Tab', description: 'This will open and close the Spellbook Tab.', tab: 'spellbook' },
  { id: 10, name: 'Combat Tab', description: 'This will open and close the Combat tab.', tab: 'combat' },
  { id: 12, name: 'Stats Tab', description: 'This will open and close the Stats Tab.', tab: 'skills' },
  { id: 18, name: 'Settings Tab', description: 'This will open and close the Settings Tab.', tab: 'settings' },
  { id: 21, name: 'Quick-prayers', description: 'Enables/disables your current quick prayers.', orb: 'quickPrayers' },
  { id: 22, name: 'Toggle run', description: 'Enables/disables run.', orb: 'run' },
  {
    id: 23,
    name: 'Special attack',
    description: 'When enabled, your next attack will be a special attack, as long as your weapon has one.',
    orb: 'special',
  },
];

const BY_ID = new Map<number, OsmHotkeyType>(OSM_HOTKEY_TYPES.map((type) => [type.id, type]));

export function osmHotkeyType(id: number): OsmHotkeyType | undefined {
  return BY_ID.get(id);
}

export function isOsmHotkeySlot(value: unknown): value is OsmHotkeySlot {
  return value === OSM_HOTKEY_EMPTY || (typeof value === 'number' && BY_ID.has(value));
}

/**
 * Jagex's "Big Boss encounters and raids" recommendation, not the client's factory defaults.
 * Official mobile launch video: https://www.youtube.com/watch?v=BjFAPjA_tcE
 * The 2024-11-06 launch post describes these as "Recommended loadout" suggestions.
 */
export const JAGEX_BOSSING_HOTKEYS: readonly OsmHotkeySlot[] = [22, 23, 8, 9, 21];
export const JAGEX_BOSSING_HOTKEYS_LABEL = "Jagex's recommended bossing loadout";

/**
 * The side panel's state as the mobile client keeps it: which tab is selected, whether the
 * panel is showing and whether the last open came from a hotkey (which can put the panel on
 * the left).
 */
export interface OsmSideState {
  readonly tab: GamePanelTab;
  readonly open: boolean;
  readonly fromHotkey: boolean;
}

/**
 * A side-panel open or close. Both the rail and the hotkeys come through here: pressing the open tab closes
 * the panel, pressing any other tab, or the closed panel's own tab, opens it.
 */
export function osmSideButtonOp(state: OsmSideState, tab: GamePanelTab, source: 'rail' | 'hotkey'): OsmSideState {
  const fromHotkey = source === 'hotkey';
  if (state.open && state.tab === tab) return { tab, open: false, fromHotkey };
  return { tab, open: true, fromHotkey };
}

/**
 * The stone under a hotkey and whether it reads as on.
 * Panel and toggle hotkeys light (_2) while active (see `osmHotkeyActive`); special attack
 * has its own three: _5 without a special-attack weapon, _4 while armed, _3 otherwise.
 */
export type OsmHotkeyStone = 'resting' | 'active' | 'special' | 'specialOn' | 'disabled';

export interface OsmHotkeyFacts {
  /** The side panel's tab, or null while the panel is closed. */
  readonly openTab: GamePanelTab | null;
  readonly quickPrayersActive: boolean;
  readonly runEnabled: boolean;
  readonly hasSpecialAttack: boolean;
  /** As the orb shows it, pending toggles included. */
  readonly specialAttackShownActive: boolean;
}

export function osmHotkeyStone(type: OsmHotkeyType, facts: OsmHotkeyFacts): OsmHotkeyStone {
  if (type.orb === 'special') {
    if (!facts.hasSpecialAttack) return 'disabled';
    return facts.specialAttackShownActive ? 'specialOn' : 'special';
  }
  return osmHotkeyActive(type, facts) ? 'active' : 'resting';
}

/** Active: a panel hotkey while its panel shows, an orb hotkey while it is on. */
export function osmHotkeyActive(type: OsmHotkeyType, facts: OsmHotkeyFacts): boolean {
  if (type.tab) return facts.openTab === type.tab;
  if (type.orb === 'quickPrayers') return facts.quickPrayersActive;
  if (type.orb === 'run') return facts.runEnabled;
  return facts.specialAttackShownActive;
}
