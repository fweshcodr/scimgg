import { WARBAND_ARCHER_NPC_ID, WARBAND_BERSERKER_NPC_ID, WARBAND_SEER_NPC_ID } from '../npcs/colosseum/constants';
import {
  INFERNO_WAVE_NPC_IDS,
  ZUK_HEALER_NPC_ID,
  ZUK_JAD_HEALER_NPC_ID,
  ZUK_JAD_NPC_ID,
  ZUK_MAGER_NPC_ID,
  ZUK_NPC_ID,
  ZUK_RANGER_NPC_ID,
} from '../npcs/inferno/constants';
import type { NpcHighlightMode } from './npcHighlight';
import type { NpcSnapshot } from './simulation';

/**
 * TzHaar HP Tracker, after the plugin-hub plugin of that name (Buchus / InfernoStats, BSD-2): the
 * basics only. It writes each tracked NPC's hitpoints over it, marks it alive or dead in a highlight
 * and in the menu, and can hide the dead.
 *
 * The plugin's number falls as each hitsplat lands, as the snapshot's HP does; it calls an NPC
 * dead early, from the XP drop of a hit already on its way that covers the HP. Here "dead" is the
 * authoritative death: the snapshot carries no queued player hits to predict from (see
 * {@link isTzhaarNpcDead}).
 */

/** Where the HP number sits: the plugin's `HpLocation`. */
export type TzhaarHpLocation = 'off' | 'aboveHpBar' | 'center' | 'bottom';

/** The plugin's highlight styles our NPC highlight renderer draws, or none. */
export type TzhaarHighlightStyle = 'none' | NpcHighlightMode;

/** What the plugin's Dynamic HP Color shades by remaining HP: its `DynamicColor`. */
export type TzhaarDynamicColor = 'off' | 'highlight' | 'hp' | 'both';

export interface TzhaarHpTrackerOptions {
  readonly showHp: TzhaarHpLocation;
  readonly highlightStyle: TzhaarHighlightStyle;
  /** Shades the HP text, the highlight or both from the dead to the alive color by remaining HP. */
  readonly dynamicColor: TzhaarDynamicColor;
  /** Paints a tracked NPC's name alive or dead in its menu entries and hover text. */
  readonly recolorMenu: boolean;
  /** Stops drawing dead NPCs, except Jad, Zuk and their healers. */
  readonly hideDead: boolean;
}

/** The plugin's defaults. */
export const DEFAULT_TZHAAR_HP_TRACKER_OPTIONS: TzhaarHpTrackerOptions = {
  showHp: 'aboveHpBar',
  highlightStyle: 'none',
  dynamicColor: 'off',
  recolorMenu: true,
  hideDead: false,
};

/** The plugin's default Alive NPC Color, rgb(0, 255, 48). */
export const TZHAAR_ALIVE_COLOR = '#00ff30';
/** The plugin's default Dead NPC Color, rgb(224, 0, 0). */
export const TZHAAR_DEAD_COLOR = '#e00000';

export const TZHAAR_HP_LOCATIONS: ReadonlyArray<{ readonly value: TzhaarHpLocation; readonly label: string }> = [
  { value: 'off', label: 'Off' },
  { value: 'aboveHpBar', label: 'Above HP bar' },
  { value: 'center', label: 'Center of NPC' },
  { value: 'bottom', label: 'Bottom of NPC' },
];

export const TZHAAR_DYNAMIC_COLORS: ReadonlyArray<{ readonly value: TzhaarDynamicColor; readonly label: string }> = [
  { value: 'off', label: 'Off' },
  { value: 'highlight', label: 'Highlight' },
  { value: 'hp', label: 'Hitpoints' },
  { value: 'both', label: 'Both' },
];

export const TZHAAR_HIGHLIGHT_STYLES: ReadonlyArray<{ readonly value: TzhaarHighlightStyle; readonly label: string }> =
  [
    { value: 'none', label: 'None' },
    { value: 'trueTile', label: 'True Tile' },
    { value: 'swTile', label: 'SW Tile' },
    { value: 'clickbox', label: 'Clickbox' },
  ];

/**
 * The plugin's Inferno and Colosseum NPCs that the sim has, by type. It also tracks the Fight Caves
 * and the other Colosseum waves, which the sim does not run. The Inferno pillars ("Rocky support")
 * are left out: the plugin shows their HP only behind a separate option that is off by default.
 */
const TRACKED_NPC_TYPE_IDS: ReadonlySet<number> = new Set([
  INFERNO_WAVE_NPC_IDS.nibbler,
  INFERNO_WAVE_NPC_IDS.bat,
  INFERNO_WAVE_NPC_IDS.blob,
  INFERNO_WAVE_NPC_IDS.blob_mage,
  INFERNO_WAVE_NPC_IDS.blob_range,
  INFERNO_WAVE_NPC_IDS.blob_melee,
  INFERNO_WAVE_NPC_IDS.meleer,
  INFERNO_WAVE_NPC_IDS.ranger,
  INFERNO_WAVE_NPC_IDS.mager,
  INFERNO_WAVE_NPC_IDS.jad,
  INFERNO_WAVE_NPC_IDS.jad_healer,
  ZUK_RANGER_NPC_ID,
  ZUK_MAGER_NPC_ID,
  ZUK_JAD_NPC_ID,
  ZUK_JAD_HEALER_NPC_ID,
  ZUK_NPC_ID,
  ZUK_HEALER_NPC_ID,
  WARBAND_ARCHER_NPC_ID,
  WARBAND_SEER_NPC_ID,
  WARBAND_BERSERKER_NPC_ID,
]);

/**
 * The plugin's `EXCLUDED_NPC` (Yt-HurKot, TzTok-Jad, JalTok-Jad, Jal-MejJak, TzKal-Zuk): never
 * recolored in the menu or hidden when dead, since they heal or are healed.
 */
const EXCLUDED_NPC_TYPE_IDS: ReadonlySet<number> = new Set([
  INFERNO_WAVE_NPC_IDS.jad,
  INFERNO_WAVE_NPC_IDS.jad_healer,
  ZUK_JAD_NPC_ID,
  ZUK_JAD_HEALER_NPC_ID,
  ZUK_NPC_ID,
  ZUK_HEALER_NPC_ID,
]);

/** Zuk is too tall for "Above HP bar" to be on screen, so the plugin draws his at his center. */
const CENTERED_ABOVE_HP_BAR_NPC_TYPE_IDS: ReadonlySet<number> = new Set([ZUK_NPC_ID]);

export function isTzhaarTrackedNpc(npcTypeId: number): boolean {
  return TRACKED_NPC_TYPE_IDS.has(npcTypeId);
}

/** Where this NPC's HP goes for `location`; only Zuk differs, drawing "Above HP bar" at his center. */
export function tzhaarHpLocationFor(npcTypeId: number, location: TzhaarHpLocation): TzhaarHpLocation {
  return location === 'aboveHpBar' && CENTERED_ABOVE_HP_BAR_NPC_TYPE_IDS.has(npcTypeId) ? 'center' : location;
}

/**
 * Dead by the snapshot: from the tick the killing hit lands. The plugin's prediction (damage
 * already in flight covering the HP) needs the player's queued hits, which no snapshot carries.
 */
export function isTzhaarNpcDead(npc: Pick<NpcSnapshot, 'alive' | 'hp'>): boolean {
  return !npc.alive || npc.hp <= 0;
}

type ColoredNpc = Pick<NpcSnapshot, 'alive' | 'hp' | 'maxHp'>;

export function tzhaarNpcColor(npc: Pick<NpcSnapshot, 'alive' | 'hp'>): string {
  return isTzhaarNpcDead(npc) ? TZHAAR_DEAD_COLOR : TZHAAR_ALIVE_COLOR;
}

const ALIVE_RGB = [0x00, 0xff, 0x30] as const;
const DEAD_RGB = [0xe0, 0x00, 0x00] as const;

/**
 * Dynamic HP Color: the dead color at 0 HP, blending channel by channel (rounded) to the alive
 * color at full HP, as the plugin's `getDynamicColor` does.
 */
export function tzhaarDynamicColor(npc: Pick<NpcSnapshot, 'hp' | 'maxHp'>): string {
  if (npc.hp <= 0) return TZHAAR_DEAD_COLOR;
  const ratio = npc.maxHp > 0 ? Math.min(1, npc.hp / npc.maxHp) : 1;
  const channels = DEAD_RGB.map((dead, index) => Math.round(dead + ratio * ((ALIVE_RGB[index] ?? 0) - dead)));
  return `#${channels.map((channel) => channel.toString(16).padStart(2, '0')).join('')}`;
}

/** The HP number's color, the plugin's Default text color mode: alive or dead, or dynamic. */
export function tzhaarHpTextColor(npc: ColoredNpc, options: TzhaarHpTrackerOptions): string {
  return options.dynamicColor === 'hp' || options.dynamicColor === 'both'
    ? tzhaarDynamicColor(npc)
    : tzhaarNpcColor(npc);
}

/** The highlight's color: alive or dead, or dynamic. */
export function tzhaarHighlightColor(npc: ColoredNpc, options: TzhaarHpTrackerOptions): string {
  return options.dynamicColor === 'highlight' || options.dynamicColor === 'both'
    ? tzhaarDynamicColor(npc)
    : tzhaarNpcColor(npc);
}

/**
 * The menu and hover-text color for this NPC, or undefined when the plugin leaves it alone. Any
 * Dynamic HP Color but Off shades the menu too, as in the plugin.
 */
export function tzhaarMenuColor(
  npc: Pick<NpcSnapshot, 'npcTypeId' | 'alive' | 'hp' | 'maxHp'>,
  options: TzhaarHpTrackerOptions,
): string | undefined {
  if (!options.recolorMenu || !isTzhaarTrackedNpc(npc.npcTypeId) || EXCLUDED_NPC_TYPE_IDS.has(npc.npcTypeId)) {
    return undefined;
  }
  return options.dynamicColor === 'off' ? tzhaarNpcColor(npc) : tzhaarDynamicColor(npc);
}

/** Whether Hide dead stops this NPC being drawn, model and 2D alike, as the plugin's draw hook does. */
export function isHiddenByTzhaarHideDead(
  npc: Pick<NpcSnapshot, 'npcTypeId' | 'alive' | 'hp'>,
  options: TzhaarHpTrackerOptions,
): boolean {
  return (
    options.hideDead &&
    isTzhaarTrackedNpc(npc.npcTypeId) &&
    !EXCLUDED_NPC_TYPE_IDS.has(npc.npcTypeId) &&
    isTzhaarNpcDead(npc)
  );
}

function isOneOf<T extends string>(value: unknown, options: ReadonlyArray<{ readonly value: T }>): value is T {
  return options.some((option) => option.value === value);
}

/** A stored value, key by key: anything out of range falls back to its default. */
export function parseTzhaarHpTrackerOptions(value: unknown): TzhaarHpTrackerOptions {
  const source = typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : {};
  const defaults = DEFAULT_TZHAAR_HP_TRACKER_OPTIONS;
  return {
    showHp: isOneOf(source.showHp, TZHAAR_HP_LOCATIONS) ? source.showHp : defaults.showHp,
    highlightStyle: isOneOf(source.highlightStyle, TZHAAR_HIGHLIGHT_STYLES)
      ? source.highlightStyle
      : defaults.highlightStyle,
    dynamicColor: isOneOf(source.dynamicColor, TZHAAR_DYNAMIC_COLORS) ? source.dynamicColor : defaults.dynamicColor,
    recolorMenu: typeof source.recolorMenu === 'boolean' ? source.recolorMenu : defaults.recolorMenu,
    hideDead: typeof source.hideDead === 'boolean' ? source.hideDead : defaults.hideDead,
  };
}
