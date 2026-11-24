import { OSM_SIDE_PANEL, OSM_TAB_RAIL } from './osmClientLayout';

/**
 * Geometry for the OSRS client display modes.
 *
 * Every rectangle below was decoded from the live OSRS cache — OpenRS2 cache
 * 2485, interface index 3 — by reading the fixed-length IF3 component header
 * (`type, contentType, x, y, width, height, …`) of each file in the toplevel
 * interface groups:
 *
 *   - group 548 `toplevel`            → Fixed
 *   - group 161 `toplevel_osrs_stretch` → Resizable, classic layout
 *   - group 164 `toplevel_pre_eoc`      → Resizable, modern layout
 *   - group 601 `toplevel_osm`          → Mobile (geometry in osmClientLayout.ts)
 *
 * The group→mode mapping is RuneLite's (`InterfaceID.TOPLEVEL`,
 * `TOPLEVEL_OSRS_STRETCH`, `TOPLEVEL_PRE_EOC`); which resizable layout is live
 * is varbit 4607 `RESIZABLE_STONE_ARRANGEMENT` (0 = classic, 1 = modern).
 *
 * This module is deliberately pure geometry: no React, no persisted settings,
 * no UI scale, no knowledge of `UIPosition` or of any component. Callers turn
 * these logical rectangles into physical CSS pixels through `scaleRect`.
 */

export type ClientLayoutMode = 'fixed' | 'classic' | 'modern' | 'mobile';

export const CLIENT_LAYOUT_MODES: readonly ClientLayoutMode[] = ['fixed', 'classic', 'modern', 'mobile'];

export function isClientLayoutMode(value: unknown): value is ClientLayoutMode {
  return value === 'fixed' || value === 'classic' || value === 'modern' || value === 'mobile';
}

/**
 * Labels as the real client's Settings → Display dropdown words them. Desktop offers
 * Fixed and the two Resizable layouts; effective Mobile Device Mode always uses Mobile.
 * Mobile remains a rendering and replay layout, not a desktop dropdown choice.
 */
export const CLIENT_LAYOUT_LABELS: Record<ClientLayoutMode, string> = {
  fixed: 'Fixed',
  classic: 'Resizable - Classic layout',
  modern: 'Resizable - Modern layout',
  mobile: 'Mobile',
};

export interface Rect {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

export interface Size {
  readonly width: number;
  readonly height: number;
}

// Fixed — group 548. Absolute coordinates inside the 765x503 client frame.

/** The whole fixed client. Component 0 spans exactly this. */
export const FIXED_FRAME: Size = { width: 765, height: 503 };

/** Component 10 — the 3D viewport, exactly as the cache lays it out. */
export const FIXED_VIEWPORT: Rect = { x: 4, y: 4, width: 512, height: 334 };

/** Components 7/8 — the tiled top frame edge and its minimap-side corner cap. */
export const FIXED_FRAME_EDGE_TOP: Rect = { x: 0, y: 0, width: 717, height: 4 };
export const FIXED_TOP_RIGHT_CORNER: Rect = { x: 717, y: 0, width: 48, height: 4 };

/**
 * Component 1 — the left frame edge, a 4px stone bezel down the side of the
 * viewport (sprite 4, `other/window_frame_edge_left.png`).
 *
 * The cache stops it at the viewport's own 334 rows because the chatbox below has
 * its own frame. Callers repeat the strip to whatever height the scene is
 * actually drawn at — which is this 334 with the chatbox shown, and the taller
 * FIXED_SCENE with it collapsed — the same treatment component 7 gets across the
 * top.
 *
 * Without it the 4px gutter that the scene's origin leaves on the left paints
 * as bare background, which reads as a stray dark border rather than as frame.
 */
export const FIXED_FRAME_EDGE_LEFT: Rect = { x: 0, y: 4, width: 4, height: 334 };

/** Component 9 — minimap + compass + orbs container. */
export const FIXED_MINIMAP: Rect = { x: 516, y: 4, width: 249, height: 163 };

/** Component 16 — `SIDE_TOP_CONTAINER`, the upper row of seven tab stones. */
export const FIXED_TAB_ROW_TOP: Rect = { x: 516, y: 167, width: 249, height: 38 };

/** Component 17 — the side panel's content box (inventory, prayer, …). */
export const FIXED_PANEL_CONTENT: Rect = { x: 547, y: 205, width: 190, height: 261 };

/** Component 15 — `SIDE_BOTTOM_CONTAINER`, the lower row of seven tab stones. */
export const FIXED_TAB_ROW_BOTTOM: Rect = { x: 519, y: 466, width: 246, height: 37 };

/**
 * Component 11 — `CHAT_CONTAINER`, which group 162 `chatbox` is mounted into.
 * It is what makes the fixed frame 503 tall.
 */
export const FIXED_CHAT: Rect = { x: 0, y: 338, width: 519, height: 165 };

/**
 * Group 162, which fills CHAT_CONTAINER: component 1 `CONTROLS` is a 519x23 row
 * pinned to the BOTTOM, and component 34 `CHATAREA` takes the height that is
 * left. Sprite 1017 is 519x142, which is that remainder — so the split is the
 * cache's, not a guess, and the two must keep summing to FIXED_CHAT.
 */
export const FIXED_CHAT_CONTROLS: Rect = {
  x: FIXED_CHAT.x,
  y: FIXED_CHAT.y + FIXED_CHAT.height - 23,
  width: FIXED_CHAT.width,
  height: 23,
};
export const FIXED_CHAT_AREA: Rect = {
  ...FIXED_CHAT,
  height: FIXED_CHAT.height - FIXED_CHAT_CONTROLS.height,
};

/**
 * Component 56 `CHATDISPLAY` — CHATAREA inset by 14x12 and centered, so 7 to
 * each side and 6 above and below. Everything inside the chat half hangs off
 * this, not off CHATAREA, which is why the insets are named once here.
 */
export const FIXED_CHAT_DISPLAY: Rect = {
  x: FIXED_CHAT_AREA.x + 7,
  y: FIXED_CHAT_AREA.y + 6,
  width: FIXED_CHAT_AREA.width - 14,
  height: FIXED_CHAT_AREA.height - 12,
};

/**
 * Components 58 `SCROLLAREA` and 559 `CHATSCROLLBAR`, which divide CHATDISPLAY
 * horizontally, and component 57 `INPUT`, the typed-line row pinned to its
 * bottom. SCROLLAREA is CHATDISPLAY minus 16 in BOTH axes: the 16 it gives up
 * across is the scrollbar, the 16 down is the input row. The scrollbar is
 * right-anchored and stops at the input row rather than running the full height.
 */
export const FIXED_CHAT_SCROLLBAR_WIDTH = 16;
export const FIXED_CHAT_INPUT_HEIGHT = 16;
export const FIXED_CHAT_SCROLLAREA: Rect = {
  ...FIXED_CHAT_DISPLAY,
  width: FIXED_CHAT_DISPLAY.width - FIXED_CHAT_SCROLLBAR_WIDTH,
  height: FIXED_CHAT_DISPLAY.height - FIXED_CHAT_INPUT_HEIGHT,
};
export const FIXED_CHAT_SCROLLBAR: Rect = {
  x: FIXED_CHAT_DISPLAY.x + FIXED_CHAT_DISPLAY.width - FIXED_CHAT_SCROLLBAR_WIDTH,
  y: FIXED_CHAT_DISPLAY.y,
  width: FIXED_CHAT_SCROLLBAR_WIDTH,
  height: FIXED_CHAT_SCROLLAREA.height,
};
export const FIXED_CHAT_INPUT: Rect = {
  x: FIXED_CHAT_DISPLAY.x,
  y: FIXED_CHAT_DISPLAY.y + FIXED_CHAT_DISPLAY.height - FIXED_CHAT_INPUT_HEIGHT,
  width: FIXED_CHAT_DISPLAY.width,
  height: FIXED_CHAT_INPUT_HEIGHT,
};

/**
 * Components 59+ `LINE0..LINEn`, every one of them at x=3 inside SCROLLAREA and
 * 14 tall — the pitch messages are stepped by.
 */
export const FIXED_CHAT_LINE_X = 3;
export const FIXED_CHAT_LINE_HEIGHT = 14;

/**
 * The dragger is sized against `height - 32`, which is the two 16px arrow
 * buttons, and never falls below 10.
 */
export const FIXED_CHAT_SCROLL_ARROW = 16;
export const FIXED_CHAT_SCROLL_THUMB_MIN = 10;

/**
 * Components 4/7/11/15/19/23/27 — the seven chat tab buttons, and component 31
 * the report button. Each button graphic sits at y=1 inside the 23px row.
 *
 * The report button is x-anchored to the row's RIGHT edge (xMode 2) at an
 * offset of 3, which is why its x is derived rather than listed: at 519 wide it
 * lands on 437, and anyone who re-derives it from the tab pitch gets 437 by
 * coincidence and a wrong number the moment the row width changes.
 *
 * The tab slots on screen are NOT the components' stored positions. All seven run
 * right to left, starting past the report button at 82 and stepping by an even gap:
 *
 *   gap = (519 + 3 - (82 + 58 * 7)) / 8 = 4      (integer division)
 *
 * so each tab's right edge sits `82 + 4 + 58*n` from the row's right, putting
 * its left edge 2px right of the position the cache ships. Reading the stored
 * positions back gives 3, 65, … and a chatbox that is off by two.
 */
export const FIXED_CHAT_TAB_SLOT_X = [5, 67, 129, 191, 253, 315, 377] as const;
export const FIXED_CHAT_TAB_SIZE: Size = { width: 56, height: 22 };
export const FIXED_CHAT_BUTTON_Y = 1;
export const FIXED_CHAT_REPORT_SIZE: Size = { width: 79, height: 22 };
export const FIXED_CHAT_REPORT_X = FIXED_CHAT_CONTROLS.width - 3 - FIXED_CHAT_REPORT_SIZE.width;

/**
 * The rectangle the renderer gets when the chatbox is COLLAPSED. The controls
 * row stays — it carries the button that brings the chatbox back — so the scene
 * takes only the chat half's rows, stopping where that row begins. With the
 * chatbox shown the scene is FIXED_VIEWPORT instead, exactly as the cache lays
 * it out.
 *
 * No bottom bezel in either case: the frame's only border pieces are components
 * 1, 7 and 8 (left, top, top-right cap). What looks like a bottom border in game
 * belongs to CHAT_CONTAINER.
 */
export const FIXED_SCENE: Rect = {
  ...FIXED_VIEWPORT,
  height: FIXED_CHAT_CONTROLS.y - FIXED_VIEWPORT.y,
};

/**
 * The right-hand column's width. Every piece the client stacks on that side —
 * the minimap container, both tab-row containers, the panel and its edges —
 * reaches the frame's right edge, so the column is one unbroken strip.
 */
export const FIXED_COLUMN_WIDTH = FIXED_FRAME.width - FIXED_MINIMAP.x;

/**
 * The minimap block — the stone between the top of the frame and the upper tab
 * row. Component 9 is inset 4px from the top and is followed by an 8px strip
 * (its component 18) carrying the stone down to SIDE_TOP_CONTAINER; the
 * simulator draws one block across that whole span instead, so the column has
 * no seam above the tab row.
 */
export const FIXED_MINIMAP_BLOCK_ORIGIN = { x: FIXED_MINIMAP.x, y: 0 } as const;
export const FIXED_MINIMAP_BLOCK: Size = { width: FIXED_COLUMN_WIDTH, height: FIXED_TAB_ROW_TOP.y };

/**
 * The same block as one frame-space rectangle.
 *
 * Anything that LAYS OUT the block — as opposed to drawing inside it — must
 * snap this rect rather than scale the origin and the size separately, or its
 * bottom edge stops agreeing with the side column's top edge. See `scaleRect`.
 */
export const FIXED_MINIMAP_BLOCK_RECT: Rect = { ...FIXED_MINIMAP_BLOCK_ORIGIN, ...FIXED_MINIMAP_BLOCK };

/**
 * Where the client's 172x156 fixed minimap surround (component 23) sits inside
 * that block, and the stone it packs around it to fill the 249-wide column:
 * left edge (component 19), right edge (component 20) and the strip that
 * carries the stone down to the upper tab row (component 18).
 *
 * 29 + 172 + 48 = 249 tiles the column exactly, which is why the surround is
 * inset rather than centered — the 29px left band is the strip the orbs stack
 * down, and their number tabs overhang it exactly as they do in game.
 */
export const FIXED_MINIMAP_FRAME_ORIGIN = { x: 29, y: FIXED_MINIMAP.y } as const;
export const FIXED_MINIMAP_EDGE_LEFT: Rect = { x: 0, y: FIXED_MINIMAP.y, width: 29, height: 156 };
export const FIXED_MINIMAP_EDGE_RIGHT: Rect = { x: 201, y: FIXED_MINIMAP.y, width: 48, height: 156 };
export const FIXED_MINIMAP_STRIP_BOTTOM: Rect = {
  x: 0,
  y: FIXED_MINIMAP.y + 156,
  width: FIXED_COLUMN_WIDTH,
  height: 8,
};

/**
 * Group 160 `orbs` is mounted into group 548 component 25 at (0,0) inside the
 * minimap container. The group deliberately bends the lower two frames around
 * the minimap instead of stacking all four at one hand-tuned pitch.
 */
export const FIXED_MINIMAP_ORBS_ORIGIN = { x: 0, y: FIXED_MINIMAP.y } as const;
export const FIXED_XP_ORB: Rect = { x: 0, y: 17, width: 27, height: 27 };
export const FIXED_MINIMAP_ORB_FRAME_ORIGINS = {
  hitpoints: { x: 0, y: 37 },
  prayer: { x: 0, y: 71 },
  run: { x: 10, y: 103 },
  special: { x: 32, y: 128 },
} as const;

/**
 * The column below that block: upper tab row, panel body, lower tab row. It runs
 * from SIDE_TOP_CONTAINER's top edge to the bottom of the frame, which is where
 * SIDE_BOTTOM_CONTAINER ends.
 */
export const FIXED_SIDE_COLUMN_ORIGIN = { x: FIXED_MINIMAP.x, y: FIXED_TAB_ROW_TOP.y } as const;
export const FIXED_SIDE_COLUMN_SIZE: Size = {
  width: FIXED_COLUMN_WIDTH,
  height: FIXED_FRAME.height - FIXED_TAB_ROW_TOP.y,
};

/** The same column as one frame-space rectangle — see FIXED_MINIMAP_BLOCK_RECT. */
export const FIXED_SIDE_COLUMN_RECT: Rect = { ...FIXED_SIDE_COLUMN_ORIGIN, ...FIXED_SIDE_COLUMN_SIZE };

/**
 * The stone edges around the fixed content box. Sizes are the sprites' own
 * (RuneLite `old_school_mode_side_panel_edge_*`);
 * positions abut the 190x261 content box at (547, 205). The two left pieces split
 * on CHAT_CONTAINER's top edge, below which the chatbox's own right edge at x=519
 * makes the lower piece 3px narrower.
 */
export const FIXED_EDGE_LEFT_UPPER: Rect = { x: 516, y: 205, width: 31, height: 133 };
export const FIXED_EDGE_LEFT_LOWER: Rect = {
  x: FIXED_CHAT.x + FIXED_CHAT.width,
  y: FIXED_CHAT.y,
  width: 28,
  height: 128,
};
export const FIXED_EDGE_RIGHT: Rect = { x: 737, y: 205, width: 28, height: 261 };

/**
 * The 3px of pillar the lower edge does not cover.
 *
 * Below the chatbox line the client's left edge steps in from x=516 to 519, because
 * CHAT_CONTAINER paints those three columns. This simulator runs the scene there
 * instead, so nothing does, and the lower tab row leaves the same sliver.
 *
 * Filled with the UPPER sprite at its natural 31 width and tiled, so only its left
 * 3 columns show — no stretching and no new art.
 */
export const FIXED_EDGE_LEFT_LOWER_LIP: Rect = {
  x: FIXED_EDGE_LEFT_UPPER.x,
  y: FIXED_CHAT.y,
  width: 3,
  height: FIXED_FRAME.height - FIXED_CHAT.y,
};

// Classic — group 161. Coordinates are local to the side column (component 97),
// which the client anchors to the right/bottom of the screen.

/** Component 97 — the whole side column: tab row, panel, tab row. */
export const CLASSIC_COLUMN: Size = { width: 241, height: 335 };

/** Component 41 — upper tab row artwork (seven stone slots baked into the sprite). */
export const CLASSIC_TAB_ROW_TOP: Rect = { x: 0, y: 0, width: 241, height: 37 };

/** Component 40 — left stone edge running the height of the panel. */
export const CLASSIC_EDGE_LEFT: Rect = { x: 3, y: 37, width: 26, height: 261 };

/** Component 39 — right stone edge. */
export const CLASSIC_EDGE_RIGHT: Rect = { x: 213, y: 37, width: 26, height: 261 };

/** Component 38 — tiled panel background, drawn behind the edges and content. */
export const CLASSIC_BACKGROUND: Rect = { x: 21, y: 27, width: 200, height: 281 };

/** Component 73 — the content box. Same 190x261 as fixed and modern. */
export const CLASSIC_PANEL_CONTENT: Rect = { x: 26, y: 37, width: 190, height: 261 };

/** Component 57 — lower tab row artwork. */
export const CLASSIC_TAB_ROW_BOTTOM: Rect = { x: 0, y: 298, width: 241, height: 37 };

// Modern — group 164. The simulator's original chrome already matches it.

/** Component 96 — side container. Identical to the simulator's GamePanel shell. */
export const MODERN_PANEL: Size = { width: 204, height: 275 };

/** Components 71/72 — content box. */
export const MODERN_PANEL_CONTENT: Size = { width: 190, height: 261 };

/** Every tab stone in every layout is this size. */
export const TAB_STONE: Size = { width: 33, height: 36 };

/**
 * Slot origins within a tab row, by layout. Seven slots per row in fixed and
 * classic; the modern bar packs its stones at a flat 33px pitch.
 *
 * Taken from the unselected stone graphics — the selected variants are 38 wide
 * at the row ends because they overhang the rounded corner, which would give a
 * misleading pitch.
 */
export const CLASSIC_TAB_SLOT_X: readonly number[] = [4, 38, 71, 104, 137, 170, 204];
export const FIXED_TAB_SLOT_X_TOP: readonly number[] = [10, 44, 77, 110, 143, 176, 210];
export const FIXED_TAB_SLOT_X_BOTTOM: readonly number[] = [7, 41, 74, 107, 140, 173, 207];

/** Component 63 sits one pixel down inside the fixed upper row container. */
export const FIXED_TAB_ROW_TOP_STONE_Y = 1;

/**
 * Which `SideStoneHighlights` sprite a slot's selected stone uses, and where it
 * sits relative to that slot's origin.
 *
 * All five sprites share ONE 38x36 canvas and are drawn at that natural size —
 * never scaled to the slot. What differs is how much of the canvas is opaque:
 * the four corner sprites fill all 38 columns, because they carry the panel's
 * rounded corner past the slot; `middle` fills only the left 33 and leaves 5
 * columns transparent. So the middle highlight covers its 33x36 slot exactly
 * while the corner ones hang over the edge, with no scaling anywhere.
 *
 * That is also why the cache's own component widths look inconsistent — 33 for
 * some middles (548/65, 161/45), 38 for others (548/66, 548/49, 161/61). The
 * client draws the sprite at natural size regardless, and the extra columns are
 * transparent, so the two are the same picture. Scaling the canvas to the
 * component width instead is what makes the middle stone come up ~4.4px short.
 *
 * The offsets are the cache's, and both rows of both layouts agree:
 *
 *   fixed upper  548/64-70  selected x = 6,44,77,110,143,176,209  slots 10,44,...,210
 *   fixed lower  548/48-54  selected x = 3,41,74,107,140,173,206  slots  7,41,...,207
 *   classic top  161/59-65  selected x = 0,38,71,104,137,170,203  slots  4,38,...,204
 *   classic btm  161/43-49  selected x = 0,38,71,104,137,170,203  slots  4,38,...,204
 *
 * i.e. -4 on the left end, -1 on the right end, flush everywhere else.
 */
export type SelectedTabStone = 'topLeft' | 'topRight' | 'bottomLeft' | 'bottomRight' | 'middle';

export interface SelectedTabStonePlacement {
  readonly stone: SelectedTabStone;
  /** Offset from the slot's own origin, in logical px. */
  readonly dx: number;
  /** Canvas width to draw at. Always the sprite's own — these are never scaled. */
  readonly width: number;
}

/** Every `SideStoneHighlights` sprite is authored on this canvas. */
export const SELECTED_TAB_STONE_WIDTH = 38;

export function selectedTabStonePlacement(
  row: 'top' | 'bottom',
  slotIndex: number,
  slotCount: number,
): SelectedTabStonePlacement {
  if (slotIndex === 0) {
    return {
      stone: row === 'top' ? 'topLeft' : 'bottomLeft',
      dx: -4,
      width: SELECTED_TAB_STONE_WIDTH,
    };
  }
  if (slotIndex === slotCount - 1) {
    return {
      stone: row === 'top' ? 'topRight' : 'bottomRight',
      dx: -1,
      width: SELECTED_TAB_STONE_WIDTH,
    };
  }
  return { stone: 'middle', dx: 0, width: SELECTED_TAB_STONE_WIDTH };
}

/**
 * Logical cache pixels to physical CSS pixels, rounding EDGES rather than sizes so
 * two rects sharing a boundary compute it from the same expression and meet exactly.
 * Widths therefore come out a pixel off `width * scale`, which is the point.
 *
 * THE FIXED-MODE RULE: every box in fixed mode is positioned and sized by this
 * function from its rect in FRAME space. Never multiply a coordinate by the scale
 * yourself, and never snap a container-local coordinate — `round(local * s)` is not
 * `round((origin + local) * s) - round(origin * s)`, so a locally-snapped edge stops
 * agreeing with the frame-space edge it must meet.
 *
 * Not a cure at fractional devicePixelRatio; collapsing sprites into one raster is
 * the only escape there. Both are measured in docs/architecture/fixed-mode-chrome-seams.md.
 */
export function scaleRect(rect: Rect, scale: number): Rect {
  const x = Math.round(rect.x * scale);
  const y = Math.round(rect.y * scale);
  return {
    x,
    y,
    width: Math.round((rect.x + rect.width) * scale) - x,
    height: Math.round((rect.y + rect.height) * scale) - y,
  };
}

export interface FixedFrameFit {
  /**
   * Uniform logical→physical factor, as `width / FIXED_FRAME.width`. 1 means the
   * frame is at its native size. Derived from the rounded width, so callers that
   * recover it from the laid-out frame get exactly this number back.
   */
  readonly scale: number;
  /** Physical CSS pixel size of the frame. Whole pixels — see below. */
  readonly width: number;
  readonly height: number;
}

/**
 * Bounds for an explicitly chosen fixed-frame scale.
 *
 * The floor is the smallest multiple whose chrome is still legible (382x252);
 * the ceiling covers a 4K display at native size with room to spare. Both only
 * constrain the selected scale, independently of the current window size.
 */
export const FIXED_SCALE_MIN = 0.5;
export const FIXED_SCALE_MAX = 6;

/**
 * The multiples offered as one-click options. Deliberately short: 1x is the
 * authentic client, 2x and 3x are the integer multiples that keep the frame's
 * sprite work crisp, and the halves in between cover the common laptop sizes
 * where an integer step overshoots the window. Anything else is reachable
 * through the Custom option, which takes any float in [MIN, MAX].
 */
export const FIXED_SCALE_PRESETS: readonly number[] = [1, 1.5, 2, 2.5, 3];

/**
 * Preserve an explicitly selected multiple of the 765x503 client. Only the
 * "Fit Window" setting (no requested scale) may shrink with the stage.
 *
 * The frame is sized in whole pixels by `fixedFrameSizeAtScale`. It is the box
 * every rectangle inside is snapped against by `scaleRect`, so if its own edges
 * sat on fractions the snapping would have nothing solid to meet and the
 * outermost pieces would still drift off the frame's right and bottom edges.
 */
export function fitFixedFrame(stageWidth: number, stageHeight: number, requestedScale?: number): FixedFrameFit {
  const stageScale =
    stageWidth > 0 && stageHeight > 0 ? Math.min(stageWidth / FIXED_FRAME.width, stageHeight / FIXED_FRAME.height) : 1;
  const rawScale =
    requestedScale !== undefined && Number.isFinite(requestedScale)
      ? Math.max(FIXED_SCALE_MIN, Math.min(FIXED_SCALE_MAX, requestedScale))
      : stageScale;
  return fixedFrameFitAtScale(rawScale);
}

function fixedFrameFitAtScale(rawScale: number): FixedFrameFit {
  const size = fixedFrameSizeAtScale(rawScale);
  // The factor the frame was ACTUALLY laid out at, not the one we asked for.
  return { scale: size.width / FIXED_FRAME.width, ...size };
}

/**
 * The fixed frame as laid out, and the box it is drawn into in the window.
 *
 * Everything inside the frame (Grid, the chrome, the chatbox, the overlays) is built against
 * `layout`, which is always a uniform whole-pixel multiple of the client. `painted` differs from
 * it only under Stretch to Window, where App draws the laid-out frame into the painted box with a
 * residual `scale(painted / layout)` per axis.
 */
export interface FixedFramePlacement {
  readonly layout: FixedFrameFit;
  readonly painted: Size;
}

/** A whole multiple, or the fraction itself where even 1x does not fit (RuneLite's integerScaling has no 0x). */
function wholeScaleOrFraction(scale: number): number {
  const whole = Math.floor(scale);
  return whole >= 1 ? whole : scale;
}

/**
 * Size the fixed frame for the Stretched Mode plugin's Fixed layout scale.
 *
 * - a number: that multiple, as `fitFixedFrame`.
 * - 'fit': the largest uniform multiple the stage holds (keep aspect ratio).
 * - 'stretch': fill the stage on both axes, as RuneLite's Stretched Mode does with Keep aspect
 *   ratio off (StretchedModeConfig.keepAspectRatio, default false). The frame is laid out at the
 *   smaller axis's multiple, so that axis is painted 1:1 and only the other is stretched.
 *
 * `integerScaling` (RuneLite's StretchedModeConfig.integerScaling) floors Fit's multiple, and each
 * of Stretch's axes independently, to a whole number; an axis with no room for 1x keeps its
 * fraction. It has no effect on an explicit multiple.
 */
export function placeFixedFrame(
  stageWidth: number,
  stageHeight: number,
  sizing: 'fit' | 'stretch' | number,
  integerScaling = false,
): FixedFramePlacement {
  const hasStage = stageWidth > 0 && stageHeight > 0;
  if (typeof sizing === 'number' || !hasStage || (sizing === 'fit' && !integerScaling)) {
    const layout = fitFixedFrame(stageWidth, stageHeight, typeof sizing === 'number' ? sizing : undefined);
    return { layout, painted: { width: layout.width, height: layout.height } };
  }
  const axisX = stageWidth / FIXED_FRAME.width;
  const axisY = stageHeight / FIXED_FRAME.height;
  if (sizing === 'fit') {
    const layout = fixedFrameFitAtScale(wholeScaleOrFraction(Math.min(axisX, axisY)));
    return { layout, painted: { width: layout.width, height: layout.height } };
  }
  const scaleX = integerScaling ? wholeScaleOrFraction(axisX) : axisX;
  const scaleY = integerScaling ? wholeScaleOrFraction(axisY) : axisY;
  const layout = fixedFrameFitAtScale(Math.min(scaleX, scaleY));
  // The axis the layout was sized by keeps the layout's own pixels exactly: rounding it again from
  // its own multiple could land a pixel away and resample the whole frame by a 1.001 scale.
  return {
    layout,
    painted:
      scaleX <= scaleY
        ? { width: layout.width, height: Math.max(layout.height, Math.round(FIXED_FRAME.height * scaleY)) }
        : { width: Math.max(layout.width, Math.round(FIXED_FRAME.width * scaleX)), height: layout.height },
  };
}

/**
 * Physical CSS pixel size the fixed frame occupies at an exact multiple.
 *
 * The height follows the EFFECTIVE scale — the one the rounded width implies —
 * not the requested one. Callers recover the scale from the laid-out width
 * (`measuredWidth / 765`), so a height rounded from the requested scale can sit
 * up to ~0.8px away from `round(503 * effectiveScale)`. That gap lands exactly
 * between the top-anchored minimap block and the bottom-anchored side column,
 * which is a seam straight down the middle of the right-hand column.
 */
export function fixedFrameSizeAtScale(scale: number): Size {
  const width = Math.round(FIXED_FRAME.width * scale);
  return {
    width,
    height: Math.round(FIXED_FRAME.height * (width / FIXED_FRAME.width)),
  };
}

/**
 * Where the simulator's 204x275 panel shell must be placed so that the 190x261
 * content box inside it lands on the layout's real content rectangle.
 *
 * The shell carries a 7px chrome inset on every side (see `skillsPanelLayout`),
 * so its origin is the content origin minus 7. Both consumers of this — the
 * classic column and the fixed frame — need the shell offset, never the raw
 * content rect, because that is the box the tab content is authored in.
 */
export const PANEL_SHELL_INSET = 7;

export function panelShellOrigin(contentRect: Rect): { readonly x: number; readonly y: number } {
  return { x: contentRect.x - PANEL_SHELL_INSET, y: contentRect.y - PANEL_SHELL_INSET };
}

/**
 * The side panel's outer box, for widgets that attach themselves to it.
 *
 * The infobox strip aligns its leading edge with the panel's and sits above the
 * panel's top edge, so it needs the shell the panel actually occupies — modern's
 * 204x275 body, classic's 241x335 column, fixed's 249x336 one, or mobile's side
 * panel beside its expanded tab rail. Reading it from here is what keeps every
 * other overlay layout-unaware.
 */
/**
 * A component's IF3 transparency, 0 opaque to 255 invisible (the GRAPHIC opacity byte), as
 * a CSS alpha.
 */
export function ifTransAlpha(trans: number): number {
  return (255 - trans) / 255;
}

/**
 * Varbit 4609 (RuneLite VarbitID.SIDE_TRANSPARENCY). It starts at 0, and on mobile the
 * setting that changes it is unavailable.
 */
export const SIDE_TRANSPARENCY_DEFAULT = 0;

/**
 * The fill every resizable toplevel paints behind its side panel: 161:38, which enum 1131
 * maps to Modern's 164:70 and enum 1745 to Mobile's 601:113 (both read from cache 2485). Side
 * transparency 1 is TRADEBACKING_DARK (sprite 897) opaque; otherwise TRADEBACKING_LIGHT
 * (sprite 1040) at transparency 150. The component tiles it (IF3 tiling flag on 601:113).
 */
export function sideBackgroundFill(sideTransparency: number): {
  readonly sprite: 'tradebackingDark' | 'tradebackingLight';
  readonly alpha: number;
} {
  return sideTransparency === 1
    ? { sprite: 'tradebackingDark', alpha: ifTransAlpha(0) }
    : { sprite: 'tradebackingLight', alpha: ifTransAlpha(150) };
}

/** Mobile's side panel plus the expanded tab rail it sits against. */
const OSM_SIDE_FOOTPRINT: Size = {
  width: OSM_SIDE_PANEL.width + OSM_TAB_RAIL.expandedWidth,
  height: Math.max(OSM_SIDE_PANEL.height, OSM_TAB_RAIL.height),
};

export function gamePanelAttachmentMetrics(mode: ClientLayoutMode): Size {
  switch (mode) {
    case 'modern':
      return MODERN_PANEL;
    case 'fixed':
      return FIXED_SIDE_COLUMN_SIZE;
    case 'classic':
      return CLASSIC_COLUMN;
    case 'mobile':
      return OSM_SIDE_FOOTPRINT;
  }
}

// Composed side columns
//
// Classic and fixed both draw one contiguous stone strip — a tab row, the panel
// body between two stone edges, and a second tab row — and differ only in where
// it sits, how wide it is, and which edge pieces surround the content box. The
// shape is data so `SidePanelColumn` draws either one without branching.

/**
 * A stone edge piece, named rather than pathed: this module stays free of the
 * sprite paths in resourcePack.ts, and the component resolves each name.
 */
export type SideColumnEdge = 'classicLeft' | 'classicRight' | 'fixedLeftUpper' | 'fixedLeftLower' | 'fixedRight';

export interface SideColumnEdgePiece {
  readonly sprite: SideColumnEdge;
  readonly rect: Rect;
  /**
   * Draw the sprite at this size and clip it to `rect`, instead of fitting it to
   * `rect`. Only the lower-left lip needs it — see FIXED_EDGE_LEFT_LOWER_LIP.
   */
  readonly sourceSize?: Size;
}

/**
 * Which of the client's two gameframe sprite sets a column composes from.
 *
 * Not cosmetic: the fixed rows are 249x38 / 246x37 and the resizable ones
 * 241x37, with different slot pitches, so the set and the geometry have to agree.
 */
export type SideColumnSpriteSet = 'classic' | 'fixed';

export interface SideColumnTabRow {
  /** Where the row sprite is drawn, in column-local coordinates. */
  readonly rect: Rect;
  /** Stone slot origins within the row sprite. */
  readonly slotX: readonly number[];
  /** Vertical offset of the stones inside the row sprite. */
  readonly stoneY: number;
}

export interface SideColumnGeometry {
  readonly spriteSet: SideColumnSpriteSet;
  readonly size: Size;
  /** Stone fill, drawn behind everything else in the column. */
  readonly background: Rect;
  /**
   * Whether that fill is a repeating tile.
   *
   * Classic's `side_panel_background` is an 88x60 seamless tile the client
   * repeats behind a 200x281 area. Fixed's (sprite 1031) is NOT a tile: it is a
   * one-shot 190x261 fill the exact size of the content box, with its own baked
   * border, so repeating it stamps that border across the panel as a dark cross
   * at x=190 / y=261. Fixed draws it once and lets the stone edges and tab rows
   * cover the rest of the column, which is what the client does.
   */
  readonly backgroundTiled: boolean;
  /** Tile phase for a repeating fill, measured from the top of the client. */
  readonly backgroundOffsetY: number;
  readonly edges: readonly SideColumnEdgePiece[];
  readonly tabRowTop: SideColumnTabRow;
  readonly tabRowBottom: SideColumnTabRow;
  /** Origin of the 204x275 panel shell — see `panelShellOrigin`. */
  readonly panelShell: { readonly x: number; readonly y: number };
}

export const CLASSIC_SIDE_COLUMN: SideColumnGeometry = {
  spriteSet: 'classic',
  size: CLASSIC_COLUMN,
  background: CLASSIC_BACKGROUND,
  backgroundTiled: true,
  backgroundOffsetY: 0,
  edges: [
    { sprite: 'classicLeft', rect: CLASSIC_EDGE_LEFT },
    { sprite: 'classicRight', rect: CLASSIC_EDGE_RIGHT },
  ],
  tabRowTop: { rect: CLASSIC_TAB_ROW_TOP, slotX: CLASSIC_TAB_SLOT_X, stoneY: 0 },
  tabRowBottom: { rect: CLASSIC_TAB_ROW_BOTTOM, slotX: CLASSIC_TAB_SLOT_X, stoneY: 0 },
  panelShell: panelShellOrigin(CLASSIC_PANEL_CONTENT),
};

function fixedColumnLocal(rect: Rect): Rect {
  return {
    x: rect.x - FIXED_SIDE_COLUMN_ORIGIN.x,
    y: rect.y - FIXED_SIDE_COLUMN_ORIGIN.y,
    width: rect.width,
    height: rect.height,
  };
}

/**
 * Fixed composes from the client's own fixed-mode gameframe sprites, so each row
 * is drawn at its real container rect and its stones sit on the fixed slot
 * origins. No fudging against the resizable art is needed — see PANEL.fixed* in
 * resourcePack.ts for why the two sets are not interchangeable.
 */

export const FIXED_SIDE_COLUMN: SideColumnGeometry = {
  spriteSet: 'fixed',
  size: FIXED_SIDE_COLUMN_SIZE,
  background: fixedColumnLocal(FIXED_PANEL_CONTENT),
  backgroundTiled: false,
  backgroundOffsetY: 0,
  edges: [
    { sprite: 'fixedLeftUpper', rect: fixedColumnLocal(FIXED_EDGE_LEFT_UPPER) },
    // Before the lower piece, which overdraws all but its visible 3 columns.
    {
      sprite: 'fixedLeftUpper',
      rect: fixedColumnLocal(FIXED_EDGE_LEFT_LOWER_LIP),
      sourceSize: { width: FIXED_EDGE_LEFT_UPPER.width, height: FIXED_EDGE_LEFT_UPPER.height },
    },
    { sprite: 'fixedLeftLower', rect: fixedColumnLocal(FIXED_EDGE_LEFT_LOWER) },
    { sprite: 'fixedRight', rect: fixedColumnLocal(FIXED_EDGE_RIGHT) },
  ],
  tabRowTop: {
    rect: fixedColumnLocal(FIXED_TAB_ROW_TOP),
    slotX: FIXED_TAB_SLOT_X_TOP,
    stoneY: FIXED_TAB_ROW_TOP_STONE_Y,
  },
  tabRowBottom: {
    rect: fixedColumnLocal(FIXED_TAB_ROW_BOTTOM),
    slotX: FIXED_TAB_SLOT_X_BOTTOM,
    stoneY: 0,
  },
  panelShell: {
    x: panelShellOrigin(FIXED_PANEL_CONTENT).x - FIXED_SIDE_COLUMN_ORIGIN.x,
    y: panelShellOrigin(FIXED_PANEL_CONTENT).y - FIXED_SIDE_COLUMN_ORIGIN.y,
  },
};
