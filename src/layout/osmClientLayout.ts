import type { Rect, Size } from './osrsClientLayout';

/**
 * Mobile — cache 2485, interface group 601 `toplevel_osm`.
 * Independent of the desktop display-mode contract: these are logical cache
 * pixels, not a responsive design or a new persisted mode.
 *
 * Component names / mode semantics corroborated against RuneLite (BSD-2-Clause) at an
 * unrecorded revision (project.build.version=1.12.24-SNAPSHOT in its gradle.properties):
 * runelite-api/src/main/java/net/runelite/api/gameval/{InterfaceID,SpriteID}.java and
 * runelite-api/src/main/java/net/runelite/api/widgets/{WidgetSizeMode,WidgetPositionMode}.java.
 * Size modes 0/1/2 mean absolute / parent minus / parent * value / 16384;
 * position modes 0/1/2 mean leading / center plus offset / trailing minus offset.
 *
 * Frame-space anchors below are relative to GAMEFRAME (601:20), inside SAFEZONE
 * (601:19), NOT the browser viewport. The logical-to-CSS scale is `osmChromeScale`;
 * the safe area is applied in osmFrame. Child Rects are resolved into their
 * explicitly named parent's space.
 */

/** 601:22 MAP_CONTAINER; right/top anchored in GAMEFRAME. */
export const OSM_MAP_CONTAINER = { right: 0, top: 0, width: 234, height: 207 } as const;
/** 601:31 MAP_MINIMAP; x = 234 - 6 - 211, local to MAP_CONTAINER. */
export const OSM_MAP_MINIMAP: Rect = { x: 17, y: 0, width: 211, height: 166 };
/** 601:33 compass mask, sprite 1179; local to MAP_MINIMAP. */
export const OSM_COMPASS_MASK: Rect = { x: 34, y: 5, width: 35, height: 35 };
/** 601:34 map mask, sprite 1178; right 6, center y + 1 in MAP_MINIMAP. */
export const OSM_MINIMAP_MASK: Rect = { x: 53, y: 8, width: 152, height: 152 };
/** 601:36 BORDER_MAP_COMPASS, sprite 5832; right/center in MAP_MINIMAP. */
export const OSM_MAP_COMPASS_FRAME: Rect = { x: 29, y: 0, width: 182, height: 166 };
/** 601:37 ORBS; minus-zero width fills MAP_CONTAINER. */
const OSM_ORBS: Rect = { x: 0, y: 5, width: 234, height: 202 };
/** 601:50, expanded or collapsed. */
export const OSM_TAB_RAIL = { expandedWidth: 85, collapsedWidth: 58, height: 280 } as const;
/** 601:63–69/89–95 backgrounds and 71–77/97–103 interactive stones. */
export const OSM_TAB_STONE: Size = { width: 40, height: 40 };
/** 601:63–69/89–95: intentional one-pixel overlap between adjacent stones. */
export const OSM_TAB_SLOT_Y = [0, 39, 78, 117, 156, 195, 234] as const;
/** 601:78–84/104–109, centered in a 40-wide column; integer center is x=3. */
export const OSM_TAB_ICON: Rect = { x: 3, y: 2, width: 33, height: 36 };

/** 601:61 and 87, relative to SIDE_RIGHT_TABS. */
export function osmTabColumns(tabsCollapsed: boolean): { readonly left: Rect; readonly right: Rect } {
  const width = tabsCollapsed ? OSM_TAB_RAIL.collapsedWidth : OSM_TAB_RAIL.expandedWidth;
  // In the collapsed state 601:85 covers the right group, but the left group is
  // drawn later. Do not squeeze/reorder both columns into the narrower rail.
  return {
    left: { x: 3, y: 3, width: 40, height: 274 },
    right: { x: width - 3 - 40, y: 3, width: 40, height: 274 },
  };
}

/** 601:111 SIDE_CONTAINER and 114/115 SIDEMODAL/SIDE_PANELS. */
export const OSM_SIDE_PANEL: Size = { width: 204, height: 275 };
/** 601:114/115: absolute 190x261 centered in 204x275 => seven-pixel inset. */
export const OSM_SIDE_CONTENT: Rect = { x: 7, y: 7, width: 190, height: 261 };
/**
 * 601:113 SIDE_BACKGROUND is MINUS 2 in both axes and centered, not a 2x2 graphic. Its fill
 * is set at runtime by `sideBackgroundFill` (osrsClientLayout.ts); the static sprite in the
 * cache (897) is replaced before it is ever drawn.
 */
export const OSM_SIDE_BACKGROUND: Rect = { x: 1, y: 1, width: 202, height: 273 };

/**
 * 601:111 SIDE_CONTAINER gets the same border as Modern's 164:96: with varbit 12135 at its
 * default 0, the `v2_stone_borders` 4–7 corners and 0–3 edges around the 204x275 container.
 * That is the border Modern's panel chrome already draws (PANEL_BORDER), so the two share it.
 */
export const OSM_SIDE_BORDER = 'stonebox' as const;

/**
 * 601:86 TABS_BLOCKING_GRAPHIC0: the collapsed rail's cover. Its layer (601:85) is sized to
 * the rail only while collapsed; the graphic is the 9-slice middle (5818),
 * MINUS 6 and centered, at IF3 transparency 140, so the right column shows through it dimmed.
 */
export const OSM_TABS_BLOCKING_TRANS = 140;

/** GAMEFRAME height, not full viewport height. */
function sideTop(frameHeight: number, height: number): number {
  return frameHeight < 503 ? frameHeight - height - 4 : Math.trunc((frameHeight - height) / 2) + 87;
}

/**
 * Normal right-side placement only. The open-on-left exception (a hotkey-origin open with
 * the open-on-left setting, see {@link osmSidePanelOnLeft}) uses LEFT 58 instead of this right
 * offset; it never changes the tab order. Callers must handle that separate native option.
 */
export function osmSidePanelPlacement(frameHeight: number, tabsCollapsed: boolean) {
  return {
    right: tabsCollapsed ? OSM_TAB_RAIL.collapsedWidth : OSM_TAB_RAIL.expandedWidth,
    top: sideTop(frameHeight, OSM_SIDE_PANEL.height),
    ...OSM_SIDE_PANEL,
  };
}

/** The open-on-left placement: LEFT 58, beside the hotkeys column. */
export const OSM_SIDE_PANEL_LEFT_X = 58;

/**
 * The side panel opens on the LEFT when the last open came from a hotkey (not a rail stone)
 * and "open side panels on the left" is on. The game's bank and Grand Exchange exceptions
 * never apply here.
 */
export function osmSidePanelOnLeft(openedFromHotkey: boolean, openOnLeftSetting: boolean): boolean {
  return openedFromHotkey && openOnLeftSetting;
}

/** 601:50; placed from the panel's ANCHOR, not its top pixel. */
export function osmTabRailPlacement(frameHeight: number, tabsCollapsed: boolean) {
  return {
    right: 0,
    top: sideTop(frameHeight, OSM_TAB_RAIL.height),
    width: tabsCollapsed ? OSM_TAB_RAIL.collapsedWidth : OSM_TAB_RAIL.expandedWidth,
    height: OSM_TAB_RAIL.height,
  };
}

/** 601:40 HOTKEYS cache size; the column also collapses to 58x43. */
export const OSM_HOTKEYS: Size = { width: 58, height: 242 };
/** Hotkey collapse is separate from tab collapse. */
export function osmHotkeysPlacement(frameHeight: number, hotkeysCollapsed: boolean): Rect {
  const height = hotkeysCollapsed ? 43 : OSM_HOTKEYS.height;
  return {
    x: 0,
    y:
      frameHeight < 503
        ? frameHeight - height - 50
        : Math.trunc((frameHeight - height) / 2) + (hotkeysCollapsed ? 160 : 60),
    width: OSM_HOTKEYS.width,
    height,
  };
}
/** 601:49 CHAT_CONTAINER: cache top-left position, NOT desktop bottom-left. */
export const OSM_CHAT_CONTAINER: Rect = { x: 0, y: 0, width: 519, height: 165 };
/** The controls take 30, not desktop's 23 pixels. */
const OSM_CHAT_AREA_HEIGHT = { full: 145, withControls: 115 } as const;
/**
 * A modal, overlay or visible MES_LAYER overrides the controls reduction. Rect is
 * CHAT_CONTAINER-local.
 */
export function osmChatArea(controlsVisible: boolean, hasOverlayOrModal = false): Rect {
  const height = controlsVisible && !hasOverlayOrModal ? OSM_CHAT_AREA_HEIGHT.withControls : OSM_CHAT_AREA_HEIGHT.full;
  return { x: 0, y: OSM_CHAT_CONTAINER.height - height, width: 519, height };
}

/** Width subtraction for XP_DROPS, by whether the minimap is shown. */
export function osmXpDropRightInset(minimapHidden: boolean): number {
  return minimapHidden ? 84 : 181;
}
/** The debug right offset adds 4, except during cutscenes. */
export function osmDebugRightInset(minimapHidden: boolean, inCutscene = false): number {
  return inCutscene ? 0 : osmXpDropRightInset(minimapHidden) + 4;
}

/**
 * Cache enums 1138/1139 -> 1745 map side IDs to these stones/icons; 1141 names
 * the operations. Gameval SpriteID.SideIcons._N supplies the sprite numbers.
 * Existing GamePanel IDs are used where implemented; other names describe
 * native tabs, not newly supported simulator panels. All slots are zero-based.
 * 13 tabs + expand occupy the rail; Logout is the fourteenth tab, on the LEFT
 * of the gameframe. Background stones are not additional interactive tabs.
 * `iconPath` is packSprite()-relative; the pixel-compared iconPath contract applies to the
 * thirteen rail slots.
 */
export const OSM_TAB_SLOTS = {
  inventory: { column: 'left', slot: 0, sideId: 3, stone: 97, icon: 104, sprite: 900, iconPath: 'tabs/inventory.png' },
  equipment: { column: 'left', slot: 1, sideId: 4, stone: 98, icon: 105, sprite: 901, iconPath: 'tabs/equipment.png' },
  prayer: { column: 'left', slot: 2, sideId: 5, stone: 99, icon: 106, sprite: 902, iconPath: 'tabs/prayer.png' },
  spellbook: { column: 'left', slot: 3, sideId: 6, stone: 100, icon: 107, sprite: 903, iconPath: 'tabs/magic.png' },
  combat: { column: 'left', slot: 4, sideId: 0, stone: 101, icon: 108, sprite: 168, iconPath: 'tabs/combat.png' },
  quests: { column: 'left', slot: 5, sideId: 2, stone: 102, icon: 109, sprite: 899, iconPath: 'tabs/quests.png' },
  skills: { column: 'right', slot: 0, sideId: 1, stone: 71, icon: 78, sprite: 898, iconPath: 'tabs/stats.png' },
  emotes: { column: 'right', slot: 1, sideId: 12, stone: 72, icon: 79, sprite: 909, iconPath: 'tabs/emotes.png' },
  music: { column: 'right', slot: 2, sideId: 13, stone: 73, icon: 80, sprite: 910, iconPath: 'tabs/music.png' },
  clanChat: { column: 'right', slot: 3, sideId: 7, stone: 74, icon: 81, sprite: 904, iconPath: 'tabs/clan_chat.png' },
  friends: { column: 'right', slot: 4, sideId: 9, stone: 75, icon: 82, sprite: 905, iconPath: 'tabs/friends.png' },
  account: {
    column: 'right',
    slot: 5,
    sideId: 8,
    stone: 76,
    icon: 83,
    sprite: 1709,
    iconPath: 'tabs/account_management.png',
  },
  settings: { column: 'right', slot: 6, sideId: 11, stone: 77, icon: 84, sprite: 908, iconPath: 'tabs/options.png' },
  // Its chat column is unrendered; this unused desktop pack path is NOT cache sprite 3560.
  logout: { column: 'chat', slot: 0, sideId: 10, stone: 44, icon: 45, sprite: 3560, iconPath: 'tabs/logout.png' },
} as const;

/** 601:103/110; expand icon is y=235 (one pixel above ordinary slot icons). */
export const OSM_EXPAND_SLOT = {
  column: 'left',
  slot: 6,
  stone: 103,
  icon: 110,
  iconRect: { x: 3, y: 235, width: 33, height: 36 },
  expandedSprite: 4795,
  collapsedSprite: 4796,
  expandedIconPath: 'mobile/show_less.png',
  collapsedIconPath: 'mobile/show_more.png',
} as const;

// Composition: where each piece lands in a gameframe of a given logical size.

/**
 * The mobile "Interface scaling" slider, in percent: 175 to 400 in steps of 25. A mobile
 * value below 175 is reset to 400. The native reset target is the engine's own default,
 * which the simulator cannot see; the top of the range stands in for it.
 */
const OSM_INTERFACE_SCALING_MIN = 175;
const OSM_INTERFACE_SCALING_MAX = 400;
const OSM_INTERFACE_SCALING_STEP = 25;
export const OSM_INTERFACE_SCALING_DEFAULT = 400;
export const OSM_INTERFACE_SCALING_OPTIONS: readonly number[] = Array.from(
  { length: (OSM_INTERFACE_SCALING_MAX - OSM_INTERFACE_SCALING_MIN) / OSM_INTERFACE_SCALING_STEP + 1 },
  (_, index) => OSM_INTERFACE_SCALING_MIN + index * OSM_INTERFACE_SCALING_STEP,
);

export function isOsmInterfaceScaling(value: unknown): value is number {
  return typeof value === 'number' && OSM_INTERFACE_SCALING_OPTIONS.includes(value);
}

/** Device safe-area insets (notch, rounded corners, home indicator), in CSS pixels. */
export interface FrameInsets {
  readonly top: number;
  readonly right: number;
  readonly bottom: number;
  readonly left: number;
}

/** The smallest safe area the Mobile client allows, in logical pixels. */
const OSM_MIN_SAFE_COLUMNS = 894;
const OSM_MIN_SAFE_ROWS = 503;

export interface OsmChromeScaleInputs {
  /** The Interface scaling setting, in percent. */
  readonly interfaceScaling: number;
  readonly devicePixelRatio: number;
  /** The WHOLE viewport in CSS pixels, before the safe area is taken off. */
  readonly viewport: Size;
  /** The safe-area insets within `viewport`, in CSS pixels. */
  readonly safeAreaInsets: FrameInsets;
}

function positiveFinite(value: number): boolean {
  return Number.isFinite(value) && value > 0;
}

function insetOrZero(value: number): number {
  return Number.isFinite(value) && value > 0 ? value : 0;
}

/**
 * CSS pixels per logical cache pixel of the Mobile chrome: the setting's logical screen size,
 * grown until the safe area is at least 894x503 logical pixels, worked out in landscape. The
 * rule and the measurements it matches are in docs/architecture/mobile-chrome-scale.md.
 */
export function osmChromeScale({
  interfaceScaling,
  devicePixelRatio,
  viewport,
  safeAreaInsets,
}: OsmChromeScaleInputs): number {
  const dpr = positiveFinite(devicePixelRatio) ? devicePixelRatio : 1;
  const zoom = (isOsmInterfaceScaling(interfaceScaling) ? interfaceScaling : OSM_INTERFACE_SCALING_DEFAULT) / 100;
  // The client only runs in landscape, so a portrait viewport takes the scale it would have
  // rotated: the chrome is the same size either way up. Only the inset sums per axis matter.
  const horizontalInsets = insetOrZero(safeAreaInsets.left) + insetOrZero(safeAreaInsets.right);
  const verticalInsets = insetOrZero(safeAreaInsets.top) + insetOrZero(safeAreaInsets.bottom);
  const portrait = viewport.height > viewport.width;
  const cssWidth = portrait ? viewport.height : viewport.width;
  const cssHeight = portrait ? viewport.width : viewport.height;
  const safeCssWidth = cssWidth - (portrait ? verticalInsets : horizontalInsets);
  const safeCssHeight = cssHeight - (portrait ? horizontalInsets : verticalInsets);

  // Device pixels, as the native client sizes its screen.
  const screenWidth = Math.round(cssWidth * dpr);
  const screenHeight = Math.round(cssHeight * dpr);
  // No measured screen leaves the safe-area minimum nothing to bind against.
  if (!positiveFinite(screenWidth) || !positiveFinite(screenHeight)) return zoom / dpr;
  const safeWidth = Math.round(safeCssWidth * dpr);
  const safeHeight = Math.round(safeCssHeight * dpr);
  // Insets that leave no safe area are unusable; measure the minimum against the full screen.
  const minWidth = Math.floor((screenWidth * OSM_MIN_SAFE_COLUMNS) / (safeWidth > 0 ? safeWidth : screenWidth));
  const minHeight = Math.floor((screenHeight * OSM_MIN_SAFE_ROWS) / (safeHeight > 0 ? safeHeight : screenHeight));

  // The full screen's logical size at this setting, grown to the minimum keeping its aspect.
  let width = Math.floor(screenWidth / zoom);
  let height = Math.floor(screenHeight / zoom);
  if (width < minWidth) {
    width = minWidth;
    height = Math.round((screenHeight * width) / screenWidth);
  }
  if (height < minHeight) {
    height = minHeight;
    width = Math.round((screenWidth * height) / screenHeight);
  }
  // One scale for both axes that still holds the whole width x height canvas, so a minimum
  // that binds (503 rows) is never rounded under in the frame the placement rules measure.
  return Math.min(cssWidth / width, cssHeight / height);
}

export interface OsmChromeLayout {
  /** The gameframe itself, in logical pixels. */
  readonly frame: Size;
  readonly mapContainer: Rect;
  readonly tabRail: Rect;
  readonly sidePanel: Rect;
}

/**
 * Every pinned piece of the mobile chrome as a GAMEFRAME-space rect. Callers turn
 * them into CSS pixels with `scaleRect`, never by multiplying themselves.
 * The left chat column (601:41) is deliberately not drawn: Mobile has no chatbox yet (a known
 * parity gap, see docs/architecture/workspace-docking.md).
 */
export function osmChromeLayout(frame: Size, tabsCollapsed: boolean, sidePanelOnLeft = false): OsmChromeLayout {
  const rail = osmTabRailPlacement(frame.height, tabsCollapsed);
  const side = osmSidePanelPlacement(frame.height, tabsCollapsed);
  return {
    frame,
    mapContainer: {
      x: frame.width - OSM_MAP_CONTAINER.right - OSM_MAP_CONTAINER.width,
      y: OSM_MAP_CONTAINER.top,
      width: OSM_MAP_CONTAINER.width,
      height: OSM_MAP_CONTAINER.height,
    },
    tabRail: { x: frame.width - rail.right - rail.width, y: rail.top, width: rail.width, height: rail.height },
    sidePanel: {
      x: sidePanelOnLeft ? OSM_SIDE_PANEL_LEFT_X : frame.width - side.right - side.width,
      y: side.top,
      width: side.width,
      height: side.height,
    },
  };
}

// Group 897 `orbs_osm`, mounted into 601:37 ORBS (0,5 inside MAP_CONTAINER).

/** 601:37 is five rows down MAP_CONTAINER; group 897 lays out from there. */
export const OSM_ORBS_ORIGIN = { x: OSM_ORBS.x, y: OSM_ORBS.y } as const;
/** 897:2 — the XP drops orb, sprite 1196, local to ORBS. */
export const OSM_XP_ORB: Rect = { x: 14, y: 0, width: 27, height: 27 };
/**
 * 897:3/14/22/30 — the four orb frames (TliButton01Orbinfo65x34), local to ORBS.
 * Each holds its 26x26 orb at (35,4) and its number in a 23x13 box at x=8,
 * vertically centered two rows low (897:6/17/25/33).
 */
export const OSM_ORB_FRAME_ORIGINS = {
  hitpoints: { x: 3, y: 35 },
  prayer: { x: 0, y: 71 },
  run: { x: 10, y: 107 },
  special: { x: 38, y: 139 },
} as const;
export const OSM_ORB_FRAME = {
  width: 65,
  height: 34,
  circleLeft: 35,
  circleTop: 4,
  textLeft: 8,
  textWidth: 23,
  textHeight: 13,
  textCentreDy: 2,
} as const;

// Group 728 `popout`, mobile layout.

/**
 * 728:10 OSM_BUTTON_FRAME collapsed (58x46), a `_9SliceDark01_3x3`
 * frame (728:27–35, the tab rail's art) around one 52x40 toggle stone at (3,3) (728:36,
 * sprite 728:24) with its 33x36 icon centered (728:25). Expanded, the client stacks its
 * buttons inside the same frame at the same three-pixel inset.
 */
export const OSM_POPOUT_FRAME: Size = { width: 58, height: 46 };
export const OSM_POPOUT_INSET = 3;

/**
 * The pop-out's closed frame: (0,4) from the bottom-left below 503 rows, else (0,204) left
 * and vertically centered. Either way it lands directly under the hotkeys column, so the two
 * read as one left column.
 */
export function osmPopoutPlacement(frameHeight: number): Rect {
  const { width, height } = OSM_POPOUT_FRAME;
  return {
    x: 0,
    y: frameHeight < 503 ? frameHeight - height - 4 : Math.trunc((frameHeight - height) / 2) + 204,
    width,
    height,
  };
}

/**
 * The simulator's full-screen control, in the slot the mobile client's left column
 * (601:41 SIDE_LEFT_CHAT) gave Logout: top-left, four rows down. Logout is the native
 * client's one system control there; the simulator has none, so the browser's full-screen
 * switch takes its place, drawn as the pop-out's framed stone so the column matches.
 */
export const OSM_SYSTEM_STONE_ORIGIN = { x: 0, y: 4 } as const;

/**
 * The simulator's system stones stacked down from Logout's slot, each frame abutting the one
 * above as the hotkeys column abuts the pop-out: full screen (when the browser offers it), then
 * Restart. The HUD keeps clear of every slot, shown or not.
 */
export const OSM_SYSTEM_STONE_SLOTS = 2;
export function osmSystemStoneRect(slot: number): Rect {
  return {
    x: OSM_SYSTEM_STONE_ORIGIN.x,
    y: OSM_SYSTEM_STONE_ORIGIN.y + slot * OSM_POPOUT_FRAME.height,
    ...OSM_POPOUT_FRAME,
  };
}

/** Every piece of the left column is 58 wide: 601:40 HOTKEYS, 728:10, and 601:41. */
export const OSM_LEFT_COLUMN_WIDTH = 58;

// Group 892 `osm_hotkeys`, mounted into 601:40 HOTKEYS (placed by osmHotkeysPlacement).

/** The first stone sits 10 rows into 892:1 CONTENT. */
const OSM_HOTKEY_FIRST_Y = 10;
/** The rail's 39-row pitch: 40-row stones overlapping by one. */
const OSM_HOTKEY_PITCH = 39;
/** 892:17–21, centered in the 58-wide column. */
const OSM_HOTKEY_STONE: Size = { width: 40, height: 40 };
export const OSM_HOTKEY_SLOTS = 5;
/** 892:4 HOTKEY_BACKGROUND: MINUS 12 wide, centered, the full content height. */
export const OSM_HOTKEY_STRIP_INSET = 6;
/** The master toggle is 33 rows under stones, 43 alone. */
const OSM_HOTKEY_TOGGLE_HEIGHT = { withStones: 33, alone: 43 } as const;

/**
 * Group 892 CONTENT for a number of visible stones, bottom-anchored inside 601:40 (the
 * content can be shorter than the 242-row component). Collapsed shows no stones and the
 * 43-row toggle alone, which is all of the collapsed 58x43 component.
 */
export function osmHotkeyContent(stoneCount: number, collapsed: boolean) {
  const stones = collapsed ? 0 : stoneCount;
  const toggleHeight = stones > 0 ? OSM_HOTKEY_TOGGLE_HEIGHT.withStones : OSM_HOTKEY_TOGGLE_HEIGHT.alone;
  const height = stones > 0 ? OSM_HOTKEY_FIRST_Y + stones * OSM_HOTKEY_PITCH + toggleHeight : toggleHeight;
  const stoneX = (OSM_HOTKEYS.width - OSM_HOTKEY_STONE.width) / 2;
  return {
    height,
    stones: Array.from(
      { length: stones },
      (_, i): Rect => ({
        x: stoneX,
        y: OSM_HOTKEY_FIRST_Y + i * OSM_HOTKEY_PITCH,
        ...OSM_HOTKEY_STONE,
      }),
    ),
    toggle: { x: 0, y: height - toggleHeight, width: OSM_HOTKEYS.width, height: toggleHeight } satisfies Rect,
  };
}
