/**
 * Interface sprite paths. Every file lives under one root, `public/assets/ui/packs/pack-vanilla/`,
 * where `npm run setup` draws them from the cache (scripts/assets/sprite-manifest.json).
 */

const SPRITE_BASE = '/assets/ui/packs/pack-vanilla';

/** A sprite's URL. `relativePath` is relative to the sprite root (e.g. 'buttons/middle.png'). */
export function packSprite(relativePath: string): string {
  return `${SPRITE_BASE}/${relativePath}`;
}

function mobileSprite(name: string): string {
  return packSprite(`mobile/${name}`);
}

export const PANEL = {
  get background() {
    return packSprite('panel/side_panel_background.png');
  },
  get edgeLeft() {
    return packSprite('panel/side_panel_edge_left.png');
  },
  get edgeRight() {
    return packSprite('panel/side_panel_edge_right.png');
  },
  /**
   * The upper and lower left pieces differ in width because the panel's left edge steps
   * in where the chatbox ends — see FIXED_EDGE_LEFT_* in layout/osrsClientLayout.
   */
  get fixedEdgeLeftUpper() {
    return packSprite('other/old_school_mode_side_panel_edge_left_upper.png');
  },
  get fixedEdgeLeftLower() {
    return packSprite('other/old_school_mode_side_panel_edge_left_lower.png');
  },
  get fixedEdgeRight() {
    return packSprite('other/old_school_mode_side_panel_edge_right.png');
  },
  /**
   * Fixed-mode chrome, from the client's OWN gameframe sprite set. RuneLite's Interface
   * Styles plugin keeps the two apart for the same reason (`FIXED_MODE_TABS_TOP_ROW` =
   * sprite 1036 vs `RESIZEABLE_MODE_TABS_TOP_ROW` = 1174): the rows are 249x38 / 246x37
   * against 241x37 and the minimap surround differs again, so the resizable art does not
   * substitute — do not synthesize these from it.
   */
  get fixedBackground() {
    return packSprite('panel/fixed_mode_side_panel_background.png');
  },
  get fixedTabsTopRow() {
    return packSprite('panel/fixed_mode_tabs_top_row.png');
  },
  get fixedTabsBottomRow() {
    return packSprite('panel/fixed_mode_tabs_row_bottom.png');
  },
  get fixedWindowFrameEdgeTop() {
    return packSprite('panel/fixed_mode_window_frame_edge_top.png');
  },
  get fixedWindowFrameEdgeLeft() {
    return packSprite('other/window_frame_edge_left.png');
  },
  get fixedTopRightCorner() {
    return packSprite('panel/fixed_mode_top_right_corner.png');
  },
  /**
   * RuneLite's `RESIZEABLE_MODE_TAB_STONE_MIDDLE`/`_SELECTED`, sprites 1180/1181
   * (`PreEocStones`). Modern's bar is seven identical stones, so one selected
   * sprite covers every slot; interface group 164 components 52-58 all point at
   * 1181. Do NOT use these in fixed or classic — see tabStoneSelected* below.
   */
  get tabStone() {
    return packSprite('panel/tab_stone_middle.png');
  },
  get tabStoneSelected() {
    return packSprite('panel/tab_stone_middle_selected.png');
  },
  /**
   * RuneLite's `TAB_STONE_*_SELECTED`, sprites 1026-1030 (`SideStoneHighlights`) are
   * used by fixed and classic selected tabs.
   * The four corner stones are distinct art because they carry the side panel's
   * rounded corner, and they are 38x36 against the 33x36 slot — they overhang it.
   *
   * Which slot gets which is the cache's, not a guess: group 548 components 64-70
   * (upper row) and 48-54 (lower), and group 161 components 59-65 / 43-49, all put
   * TOP_LEFT/BOTTOM_LEFT on slot 0, TOP_RIGHT/BOTTOM_RIGHT on slot 6 and MIDDLE on
   * slots 1-5.
   */
  get tabStoneSelectedTopLeft() {
    return packSprite('tabs/stone_top_left_selected.png');
  },
  get tabStoneSelectedTopRight() {
    return packSprite('tabs/stone_top_right_selected.png');
  },
  get tabStoneSelectedBottomLeft() {
    return packSprite('tabs/stone_bottom_left_selected.png');
  },
  get tabStoneSelectedBottomRight() {
    return packSprite('tabs/stone_bottom_right_selected.png');
  },
  get tabStoneSelectedMiddle() {
    return packSprite('tabs/stone_middle_selected.png');
  },
  get tabsTopRow() {
    return packSprite('panel/tabs_top_row.png');
  },
  get tabsBottomRow() {
    return packSprite('panel/tabs_bottom_row.png');
  },
};

export const PANEL_BORDER = {
  get cornerTopLeft() {
    return packSprite('dialog/bottom_line_mode_side_panel_corner_top_left.png');
  },
  get cornerTopRight() {
    return packSprite('dialog/bottom_line_mode_side_panel_corner_top_right.png');
  },
  get cornerBottomLeft() {
    return packSprite('dialog/bottom_line_mode_side_panel_corner_bottom_left.png');
  },
  get cornerBottomRight() {
    return packSprite('dialog/bottom_line_mode_side_panel_corner_bottom_right.png');
  },
  get edgeTop() {
    return packSprite('dialog/bottom_line_mode_side_panel_edge_top.png');
  },
  get edgeBottom() {
    return packSprite('dialog/bottom_line_mode_side_panel_edge_bottom.png');
  },
  get edgeLeft() {
    return packSprite('dialog/bottom_line_mode_side_panel_edge_left.png');
  },
  get edgeRight() {
    return packSprite('dialog/bottom_line_mode_side_panel_edge_right.png');
  },
};

export const PRAYER = {
  get activatedBackground() {
    return packSprite('prayer/activated_background.png');
  },
  get iconSmall() {
    return packSprite('prayer/icon_small.png');
  },
  icon(name: string): string {
    return packSprite(`prayer/${name}.png`);
  },
  iconDisabled(name: string): string {
    return packSprite(`prayer/${name}_disabled.png`);
  },
};

// The prayer and spellbook filter menus draw their rows with the shared
// `options_radio_buttons` sheet: index 6 when the row's varbit is 0 (checked),
// index 5 when it is 1, and index 2 for a row the client has grayed out. Both
// toggles are 17x17.
export const FILTER_TOGGLE = {
  get checked() {
    return packSprite('options/round_check_box_checked_green.png');
  },
  get unchecked() {
    return packSprite('options/round_check_box_crossed2.png');
  },
  get disabled() {
    return packSprite('options/round_check_box_checked.png');
  },
};

export const AUDIO_SLIDER = {
  get track() {
    return packSprite('options/slider_new_empty.png');
  },
  get leftCap() {
    return packSprite('options/slider_new_left_caret.png');
  },
  get firstNotch() {
    return packSprite('options/slider_new_dot_darker.png');
  },
  get notch() {
    return packSprite('options/slider_new_dot_regular.png');
  },
  get halfLeft() {
    return packSprite('options/slider_new_half_dot_left.png');
  },
  get halfRight() {
    return packSprite('options/slider_new_half_dot_right.png');
  },
  get rightCap() {
    return packSprite('options/slider_new_right_caret.png');
  },
  get thumb() {
    return packSprite('options/slider_new_dot_green.png');
  },
};

export const RESET_BUTTON = {
  get enabled() {
    return packSprite('other/reset_killcount_button_hovered.png');
  },
  get disabled() {
    return packSprite('other/reset_killcount_button.png');
  },
};

export const STATS = {
  get tileLeft() {
    return packSprite('stats/new_tile_left.png');
  },
  get tileRightWithSlash() {
    return packSprite('stats/new_tile_right_with_slash.png');
  },
  skillIcon(name: string): string {
    return packSprite(`skill/${name}.png`);
  },
};

// STATS.skillIcon is a function, so collectPackAssetPaths()'s Object.values() loop cannot
// discover these paths — they are appended explicitly from this list.
const CLASSIC_SKILL_NAMES = [
  'attack',
  'hitpoints',
  'mining',
  'strength',
  'agility',
  'smithing',
  'defence',
  'herblore',
  'fishing',
  'ranged',
  'thieving',
  'cooking',
  'prayer',
  'crafting',
  'firemaking',
  'magic',
  'fletching',
  'woodcutting',
  'runecraft',
  'slayer',
  'farming',
  'construction',
  'hunter',
] as const;

export const TAB_ICONS = {
  get combat() {
    return packSprite('tabs/combat.png');
  },
  get skills() {
    return packSprite('tabs/stats.png');
  },
  get inventory() {
    return packSprite('tabs/inventory.png');
  },
  get equipment() {
    return packSprite('tabs/equipment.png');
  },
  get prayer() {
    return packSprite('tabs/prayer.png');
  },
  get spellbook() {
    return packSprite('tabs/magic.png');
  },
  get settings() {
    return packSprite('tabs/options.png');
  },
};

export const EQUIPMENT_SLOTS = {
  get head() {
    return packSprite('equipment-slots/slot_head.png');
  },
  get body() {
    return packSprite('equipment-slots/slot_torso.png');
  },
  get legs() {
    return packSprite('equipment-slots/slot_legs.png');
  },
  get weapon() {
    return packSprite('equipment-slots/slot_weapon.png');
  },
  get shield() {
    return packSprite('equipment-slots/slot_shield.png');
  },
  get cape() {
    return packSprite('equipment-slots/slot_cape.png');
  },
  get amulet() {
    return packSprite('equipment-slots/slot_neck.png');
  },
  get ammo() {
    return packSprite('equipment-slots/slot_ammunition.png');
  },
  get hands() {
    return packSprite('equipment-slots/slot_hands.png');
  },
  get boots() {
    return packSprite('equipment-slots/slot_feet.png');
  },
  get ring() {
    return packSprite('equipment-slots/slot_ring.png');
  },
  get tile() {
    return packSprite('equipment-slots/slot_tile.png');
  },
  get selected() {
    return packSprite('equipment-slots/slot_selected.png');
  },
  get weight() {
    return packSprite('equipment-slots/weight.png');
  },
};

export const COMBAT_BUTTONS = {
  get narrow() {
    return packSprite('buttons/combat_style_narrow.png');
  },
  get narrowSelected() {
    return packSprite('buttons/combat_style_narrow_selected.png');
  },
  get thin() {
    return packSprite('buttons/combat_style_thin.png');
  },
  get thinSelected() {
    return packSprite('buttons/combat_style_thin_selected.png');
  },
  get autoRetaliate() {
    return packSprite('combat/auto_retaliate.png');
  },
  get autoRetaliateSelected() {
    return packSprite('combat/auto_retaliate_selected.png');
  },
};

export const BUTTON = {
  get middle() {
    return packSprite('buttons/middle.png');
  },
  get middleSelected() {
    return packSprite('buttons/middle_selected.png');
  },
  get cornerTopLeft() {
    return packSprite('buttons/corner_top_left.png');
  },
  get cornerTopRight() {
    return packSprite('buttons/corner_top_right.png');
  },
  get cornerBottomLeft() {
    return packSprite('buttons/corner_bottom_left.png');
  },
  get cornerBottomRight() {
    return packSprite('buttons/corner_bottom_right.png');
  },
  get cornerTopLeftSelected() {
    return packSprite('buttons/corner_top_left_selected.png');
  },
  get cornerTopRightSelected() {
    return packSprite('buttons/corner_top_right_selected.png');
  },
  get cornerBottomLeftSelected() {
    return packSprite('buttons/corner_bottom_left_selected.png');
  },
  get cornerBottomRightSelected() {
    return packSprite('buttons/corner_bottom_right_selected.png');
  },
  get edgeTop() {
    return packSprite('buttons/edge_top.png');
  },
  get edgeBottom() {
    return packSprite('buttons/edge_bottom.png');
  },
  get edgeLeft() {
    return packSprite('buttons/edge_left.png');
  },
  get edgeRight() {
    return packSprite('buttons/edge_right.png');
  },
  get edgeTopSelected() {
    return packSprite('buttons/edge_top_selected.png');
  },
  get edgeBottomSelected() {
    return packSprite('buttons/edge_bottom_selected.png');
  },
  get edgeLeftSelected() {
    return packSprite('buttons/edge_left_selected.png');
  },
  get edgeRightSelected() {
    return packSprite('buttons/edge_right_selected.png');
  },
};

export const EQUIPMENT_FRAME = {
  get edgeTop() {
    return packSprite('buttons/equipment_edge_top.png');
  },
  get edgeBottom() {
    return packSprite('buttons/equipment_edge_bottom.png');
  },
  get edgeLeft() {
    return packSprite('buttons/equipment_edge_left.png');
  },
  get edgeRight() {
    return packSprite('buttons/equipment_edge_right.png');
  },
  get cornerTopLeft() {
    return packSprite('buttons/equipment_metal_corner_top_left.png');
  },
  get cornerTopRight() {
    return packSprite('buttons/equipment_metal_corner_top_right.png');
  },
  get cornerBottomLeft() {
    return packSprite('buttons/equipment_metal_corner_bottom_left.png');
  },
  get cornerBottomRight() {
    return packSprite('buttons/equipment_metal_corner_bottom_right.png');
  },
};

export const IRON_RIVETS = {
  get vertical() {
    return packSprite('dialog/iron_rivets_vertical.png');
  },
  get horizontal() {
    return packSprite('dialog/iron_rivets_horizontal.png');
  },
  get bottom() {
    return packSprite('dialog/iron_rivets_bottom.png');
  },
  get cornerTopLeft() {
    return packSprite('dialog/iron_rivets_corner_top_left.png');
  },
  get cornerTopRight() {
    return packSprite('dialog/iron_rivets_corner_top_right.png');
  },
  get cornerBottomLeft() {
    return packSprite('dialog/iron_rivets_corner_bottom_left.png');
  },
  get cornerBottomRight() {
    return packSprite('dialog/iron_rivets_corner_bottom_right.png');
  },
  get edgeTop() {
    return packSprite('dialog/iron_rivets_edge_top.png');
  },
  get edgeRight() {
    return packSprite('dialog/iron_rivets_edge_right.png');
  },
};

export const EQUIPMENT_BUTTONS = {
  get stats() {
    return packSprite('buttons/equipment_stats_icon.png');
  },
  get guidePrices() {
    return packSprite('buttons/equipment_guide_prices.png');
  },
  get itemsKeptOnDeath() {
    return packSprite('buttons/equipment_items_lost_on_death.png');
  },
  get callFollower() {
    return packSprite('buttons/equipment_call_follower.png');
  },
};

export const SCROLLBAR = {
  get arrowUp() {
    return packSprite('scrollbar/arrow_up.png');
  },
  get arrowDown() {
    return packSprite('scrollbar/arrow_down.png');
  },
  get thumbTop() {
    return packSprite('scrollbar/thumb_top.png');
  },
  get thumbMiddle() {
    return packSprite('scrollbar/thumb_middle.png');
  },
  get thumbBottom() {
    return packSprite('scrollbar/thumb_bottom.png');
  },
  /** RuneLite's SCROLLBAR_THUMB_MIDDLE_DARK — ScrollbarDraggerV2.TRACK, the trough. */
  get track() {
    return packSprite('scrollbar/thumb_middle_dark.png');
  },
  /**
   * The transparent chatbox's set, `scrollbar_trans_dragger` frames 0-3 (top, middle, bottom,
   * track) and `scrollbar_trans_arrows`: near-white art the client draws at a high transparency.
   */
  get transparentArrowUp() {
    return packSprite('scrollbar/transparent_arrow_up.png');
  },
  get transparentArrowDown() {
    return packSprite('scrollbar/transparent_arrow_down.png');
  },
  get transparentThumbTop() {
    return packSprite('scrollbar/transparent_thumb_top.png');
  },
  get transparentThumbMiddle() {
    return packSprite('scrollbar/transparent_thumb_middle.png');
  },
  get transparentThumbBottom() {
    return packSprite('scrollbar/transparent_thumb_bottom.png');
  },
  get transparentTrack() {
    return packSprite('scrollbar/transparent_thumb_background.png');
  },
};

export const DIALOG = {
  get background() {
    return packSprite('dialog/background.png');
  },
  get backgroundBrighter() {
    return packSprite('dialog/background_brighter.png');
  },
};

export const CHATBOX = {
  get background() {
    return packSprite('chatbox/chat_background.png');
  },
  get buttonsBackgroundStones() {
    return packSprite('chatbox/chatbox_buttons_background_stones.png');
  },
  get button() {
    return packSprite('chatbox/chatbox_button.png');
  },
  get buttonHovered() {
    return packSprite('chatbox/chatbox_button_hovered.png');
  },
  get buttonSelected() {
    return packSprite('chatbox/chatbox_button_selected.png');
  },
  get buttonSelectedHovered() {
    return packSprite('chatbox/chatbox_button_selected_hovered.png');
  },
  get reportButton() {
    return packSprite('chatbox/chatbox_report_button.png');
  },
  get reportButtonHovered() {
    return packSprite('chatbox/chatbox_report_button_hovered.png');
  },
};

export const OPTIONS = {
  get checkboxEmpty() {
    return packSprite('options/checkbox_empty.png');
  },
  get checkboxChecked() {
    return packSprite('options/checkbox_checked_red.png');
  },
  get squareCheckbox() {
    return packSprite('options/square_check_box.png');
  },
  get squareCheckboxChecked() {
    return packSprite('options/square_check_box_checked.png');
  },
};

export const WINDOW = {
  get closeButton() {
    return packSprite('other/window_close_button.png');
  },
  get closeButtonHovered() {
    return packSprite('other/window_close_button_hovered.png');
  },
};

export const MINIMAP = {
  get frame() {
    return packSprite('panel/minimap_and_compass_frame.png');
  },
  /**
   * Fixed mode's own minimap surround (sprite 1182, 172x156) plus the stone the
   * client packs around it inside the 249-wide column. Distinct art from the
   * resizable frame above (1177, 182x166); the two gameframe sprite sets are not
   * interchangeable — see `PANEL.fixed*`.
   */
  get fixedFrame() {
    return packSprite('panel/fixed_mode_minimap_and_compass_frame.png');
  },
  get fixedLeftEdge() {
    return packSprite('panel/fixed_mode_minimap_left_edge.png');
  },
  get fixedRightEdge() {
    return packSprite('panel/fixed_mode_minimap_right_edge.png');
  },
  get fixedBottom() {
    return packSprite('panel/fixed_mode_minimap_frame_bottom.png');
  },
  get compass() {
    return packSprite('other/compass.png');
  },

  get orbFrame() {
    return packSprite('other/minimap_orb_frame.png');
  },
  get orbFrameHovered() {
    return packSprite('other/minimap_orb_frame_hovered.png');
  },
  get orbFrameFlashing() {
    return packSprite('other/minimap_orb_frame_flashing.png');
  },
  get orbXp() {
    return packSprite('other/minimap_orb_xp.png');
  },
  get orbXpActivated() {
    return packSprite('other/minimap_orb_xp_activated.png');
  },
  get orbXpHovered() {
    return packSprite('other/minimap_orb_xp_hovered.png');
  },
  get orbXpActivatedHovered() {
    return packSprite('other/minimap_orb_xp_activated_hovered.png');
  },

  get orbEmpty() {
    return packSprite('other/minimap_orb_empty.png');
  },
  get orbHitpoints() {
    return packSprite('other/minimap_orb_hitpoints.png');
  },
  get orbHitpointsPoison() {
    return packSprite('other/minimap_orb_hitpoints_poison.png');
  },
  get orbHitpointsDisease() {
    return packSprite('other/minimap_orb_hitpoints_disease.png');
  },
  get orbHitpointsVenom() {
    return packSprite('other/minimap_orb_hitpoints_venom.png');
  },
  get orbPrayer() {
    return packSprite('other/minimap_orb_prayer.png');
  },
  get orbPrayerActivated() {
    return packSprite('other/minimap_orb_prayer_activated.png');
  },
  get orbRun() {
    return packSprite('other/minimap_orb_run.png');
  },
  get orbRunActivated() {
    return packSprite('other/minimap_orb_run_activated.png');
  },
  get orbSpecial() {
    return packSprite('other/minimap_orb_special.png');
  },
  get orbSpecialActivated() {
    return packSprite('other/minimap_orb_special_activated.png');
  },

  get orbHitpointsIcon() {
    return packSprite('other/minimap_orb_hitpoints_icon.png');
  },
  get orbHitpointsLowLifeIcon() {
    return packSprite('other/minimap_orb_hitpoints_low_life_icon.png');
  },
  get orbPrayerIcon() {
    return packSprite('other/minimap_orb_prayer_icon.png');
  },
  get orbPrayerIconActivated() {
    return packSprite('other/minimap_orb_prayer_icon_activated.png');
  },
  get orbRunIcon() {
    return packSprite('other/minimap_orb_run_icon.png');
  },
  get orbRunIconActivated() {
    return packSprite('other/minimap_orb_run_icon_activated.png');
  },
  get orbRunIconSlowedDepletion() {
    return packSprite('other/minimap_orb_run_icon_slowed_depletion.png');
  },
  get orbSpecialIcon() {
    return packSprite('other/minimap_orb_special_icon.png');
  },
  /** orb_icon,16: the special orb's icon while the Soulreaper axe is worn. */
  get orbSoulreaperAxeIcon() {
    return packSprite('other/minimap_orb_soulreaper_axe_icon.png');
  },

  get orbWorldMapFrame() {
    return packSprite('other/minimap_orb_world_map_frame.png');
  },
  get orbWorldMapPlanet() {
    return packSprite('other/minimap_orb_world_map_planet.png');
  },
  get orbWorldMapPlanetHovered() {
    return packSprite('other/minimap_orb_world_map_planet_hovered.png');
  },
};

/**
 * Mobile client chrome (interface group 601 `toplevel_osm` and its orbs group 897), cut from
 * the cache by `npm run setup` (scripts/assets/sprite-manifest.json).
 */
export const MOBILE = {
  get tabStone() {
    return mobileSprite('tab_stone.png');
  },
  get tabStoneSelected() {
    return mobileSprite('tab_stone_selected.png');
  },
  get showLess() {
    return mobileSprite('show_less.png');
  },
  get showMore() {
    return mobileSprite('show_more.png');
  },
  get mapCompassFrame() {
    return mobileSprite('map_compass_frame.png');
  },
  get orbFrame() {
    return mobileSprite('orb_frame.png');
  },
  get orbFrameHovered() {
    return mobileSprite('orb_frame_hovered.png');
  },
  get popoutStone() {
    return mobileSprite('popout_stone.png');
  },
  get popoutExpand() {
    return mobileSprite('popout_expand.png');
  },
  get popoutStoneSelected() {
    return mobileSprite('popout_stone_selected.png');
  },
  get popoutClose() {
    return mobileSprite('popout_close.png');
  },
  get hotkeyStoneSpecial() {
    return mobileSprite('hotkey_stone_special.png');
  },
  get hotkeyStoneSpecialOn() {
    return mobileSprite('hotkey_stone_special_on.png');
  },
  get hotkeyStoneDisabled() {
    return mobileSprite('hotkey_stone_disabled.png');
  },
  get hotkeysAccordion() {
    return mobileSprite('hotkeys_accordion.png');
  },
  get hotkeysAccordionBody() {
    return mobileSprite('hotkeys_accordion_body.png');
  },
  get hotkeysAccordionLip() {
    return mobileSprite('hotkeys_accordion_lip.png');
  },
  get hotkeysHide() {
    return mobileSprite('hotkeys_hide.png');
  },
  get hotkeysShow() {
    return mobileSprite('hotkeys_show.png');
  },
  get railTopLeft() {
    return mobileSprite('rail_top_left.png');
  },
  get railTop() {
    return mobileSprite('rail_top.png');
  },
  get railTopRight() {
    return mobileSprite('rail_top_right.png');
  },
  get railLeft() {
    return mobileSprite('rail_left.png');
  },
  get railMiddle() {
    return mobileSprite('rail_middle.png');
  },
  get railRight() {
    return mobileSprite('rail_right.png');
  },
  get railBottomLeft() {
    return mobileSprite('rail_bottom_left.png');
  },
  get railBottom() {
    return mobileSprite('rail_bottom.png');
  },
  get railBottomRight() {
    return mobileSprite('rail_bottom_right.png');
  },
};

export function collectPackAssetPaths(): string[] {
  const paths: string[] = [];
  for (const obj of [
    PANEL,
    PANEL_BORDER,
    PRAYER,
    STATS,
    TAB_ICONS,
    EQUIPMENT_SLOTS,
    COMBAT_BUTTONS,
    BUTTON,
    EQUIPMENT_FRAME,
    EQUIPMENT_BUTTONS,
    IRON_RIVETS,
    SCROLLBAR,
    DIALOG,
    CHATBOX,
    OPTIONS,
    FILTER_TOGGLE,
    AUDIO_SLIDER,
    RESET_BUTTON,
    WINDOW,
    MINIMAP,
    MOBILE,
  ]) {
    for (const value of Object.values(obj)) {
      if (typeof value === 'string') {
        paths.push(value);
      }
    }
  }
  for (const name of CLASSIC_SKILL_NAMES) {
    paths.push(STATS.skillIcon(name));
  }
  return paths;
}
