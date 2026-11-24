/**
 * The Mobile layout's HUD: the rectangle the native client keeps its HUD overlays in, the
 * native default places of the overlays the simulator reproduces (XP drops, buff bar, boss
 * health bar), and collision-aware places for the simulator's own aids.
 *
 * The geometry starts from cache group 601 and the native client's runtime layout. Each value,
 * and every value the simulator has to assume, is written out beside the code that uses it.
 */
import {
  OSM_LEFT_COLUMN_WIDTH,
  OSM_POPOUT_FRAME,
  OSM_SIDE_PANEL,
  OSM_SYSTEM_STONE_ORIGIN,
  OSM_SYSTEM_STONE_SLOTS,
  OSM_TAB_RAIL,
  osmChromeLayout,
  osmHotkeysPlacement,
  osmPopoutPlacement,
  osmSidePanelPlacement,
  osmXpDropRightInset,
} from './osmClientLayout';
import { type OsmFrame, osmCssRect } from './osmFrame';
import type { Rect, Size } from './osrsClientLayout';

/**
 * 601:8 HUD_CONTAINER_BACK as it sits after a resize.
 *
 * - Its parent 601:7 SAFEZONE_HUDCONTAINER is laid out exactly like 601:19 SAFEZONE: both sit
 *   at the device safe area. The simulator's gameframe (osmFrame) is that safe area, so this
 *   rect is gameframe-local.
 * - After a resize the container is the gameframe less the 58-wide left column (hotkeys,
 *   pop-out), a matching 58 on the right, and 16 rows at the bottom. The cache's enums 1960,
 *   1961, 1135 and 1136, keyed by the toplevel enum 1745, hold those margins: 58, 0 (no entry,
 *   enum default), 58 and 16.
 * - The cache rect (65,30 / MINUS 130,46) is only the value before the first resize.
 *
 * Assumptions, each a dodge input the simulator does not have:
 * - The camera-clamp varbit (4606) is 0. Nonzero only where the game clamps the camera (which
 *   also disables zoom), which the simulator never does.
 * - The safe-zone margin setting is 0: no margin. Its maximum is 0 anyway below 748 logical
 *   pixels of safe width.
 * - The safe zone's 680-pixel minimum width is not modeled: osmFrame does not apply it either.
 *   The live chrome scale keeps the safe area about 894 logical pixels wide in landscape
 *   (osmChromeScale), so it can bind only in portrait, where no native rule applies (see
 *   `placeOsmHud`), or at a recording's own larger scale.
 */
const OSM_HUD_CONTAINER = { left: 58, top: 0, right: 58, bottom: 16 } as const;

/** 601:8 at runtime, gameframe-local; see {@link OSM_HUD_CONTAINER}. */
export function osmHudRect(frame: Size): Rect {
  return {
    x: OSM_HUD_CONTAINER.left,
    y: OSM_HUD_CONTAINER.top,
    width: Math.max(0, frame.width - OSM_HUD_CONTAINER.left - OSM_HUD_CONTAINER.right),
    height: Math.max(0, frame.height - OSM_HUD_CONTAINER.top - OSM_HUD_CONTAINER.bottom),
  };
}

/**
 * On mobile every HUD overlay's dodge box starts 2 rows down (and 2 on the alternative side).
 * Applies to all three native overlays below.
 */
const MOBILE_DODGER_TOP = 2;

/**
 * Where the XP drops' container (122:4) has its top-right corner, gameframe-local.
 *
 * - 601:15 XP_DROPS sits at (0,0) in the HUD, size MINUS (181, 0) while the minimap is shown
 *   (the simulator never hides it).
 * - Its 122:3 CONTAINERDODGER dodges only things that do not apply here: one rule applies only
 *   off mobile, the other dodges a minigame overlay only minigame HUDs register. What is left
 *   is the mobile 2-row top.
 * - The container then sits right 2, top 0 inside the dodger.
 */
export function osmXpDropsTopRight(frame: Size): { readonly x: number; readonly y: number } {
  const hud = osmHudRect(frame);
  const slotWidth = Math.max(0, hud.width - osmXpDropRightInset(false));
  return { x: hud.x + slotWidth - 2, y: hud.y + MOBILE_DODGER_TOP };
}

/** The mobile boss health bar is 150 wide (and left-anchored). */
export const OSM_HPBAR_WIDTH = 150;
/** 303:5's cache height, which the mobile bar keeps. */
export const OSM_HPBAR_HEIGHT = 42;

/**
 * How much the chatbox pushes HUD overlays down: 0 (chat open) adds the open chat's 145 + 2
 * rows, 1 the 30-row filter-stone strip + 2, 2 only 2. The simulator draws no chatbox and no
 * filter stones, which is state 2 (chat minimized, filter stones off).
 */
export type OsmChatboxState = 0 | 1 | 2;
const CHAT_DODGE: Record<OsmChatboxState, number> = { 0: 165 - 20 + 2, 1: 30 + 2, 2: 2 };

/**
 * The boss health bar's top-left corner, gameframe-local.
 *
 * HPBAR_HUD (601:5) hangs off the root, not the HUD. Its dodge box, anchored left/top, is:
 * - top 2 on mobile;
 * - offset to the safe area, i.e. the gameframe origin;
 * - pushed down by the chatbox, see {@link OsmChatboxState};
 * - offset by the HUD (enum 1960/1961 = 58, 0);
 * - with XP drops on the right (their default), a left bar adds a 2/2 margin;
 * - clear of things the simulator does not have (stat boosts HUD, PM lines, minigame overlays)
 *   or that only apply on the right (buff bar).
 * The bar itself is at (0,0) of the dodge box, which keeps it there while it fits.
 */
export function osmHpBarOrigin(chat: OsmChatboxState = 2): { readonly x: number; readonly y: number } {
  return {
    x: OSM_HUD_CONTAINER.left + 2,
    y: MOBILE_DODGER_TOP + CHAT_DODGE[chat] + OSM_HUD_CONTAINER.top + 2,
  };
}

/** The mobile buff bar's content box, right 1 / bottom 29 in its dodge box. */
export const OSM_BUFF_BAR = { right: 1, bottom: 29, width: 91, height: 249 } as const;
/** 37-pixel cells, each holding a 32x32 buff. */
const OSM_BUFF_CELL = 37;
const OSM_BUFF_TILE = OSM_BUFF_CELL - 5;

export interface OsmSidePanelState {
  readonly panelOpen: boolean;
  readonly tabsCollapsed: boolean;
  /** The panel opened from a hotkey with "open on the left" set. */
  readonly panelOnLeft: boolean;
}

/**
 * How far the buff bar's dodge box keeps clear of the right edge. With the side panel closed,
 * only the rail's width beyond the 58 the HUD already leaves (enum 1135); open on the right,
 * the rail plus the 204-wide side container; open on the left, the rail alone again.
 */
export function osmBuffBarRightDodge(side: OsmSidePanelState): number {
  const rail = side.tabsCollapsed ? OSM_TAB_RAIL.collapsedWidth : OSM_TAB_RAIL.expandedWidth;
  const beyondHud = rail - OSM_HUD_CONTAINER.right;
  if (!side.panelOpen || side.panelOnLeft) return Math.max(0, beyondHud);
  return Math.max(0, beyondHud + OSM_SIDE_PANEL.width);
}

/**
 * The buff bar's content box (651:3), gameframe-local. 601:12 BUFF_BAR fills the HUD; its
 * 651:1 DODGER is the HUD less the mobile 2-row top and {@link osmBuffBarRightDodge} (it also
 * dodges the stat boosts HUD, which the simulator does not have).
 */
export function osmBuffBarRect(frame: Size, side: OsmSidePanelState): Rect {
  const hud = osmHudRect(frame);
  const dodgerRight = hud.x + hud.width - osmBuffBarRightDodge(side);
  const dodgerBottom = hud.y + hud.height;
  const nativeBottom = dodgerBottom - OSM_BUFF_BAR.bottom;
  return {
    x: dodgerRight - OSM_BUFF_BAR.right - OSM_BUFF_BAR.width,
    y: Math.min(nativeBottom, osmBuffBarRaisedBottom(frame, side)) - OSM_BUFF_BAR.height,
    width: OSM_BUFF_BAR.width,
    height: OSM_BUFF_BAR.height,
  };
}

/** Frames this many rows tall or more center the side panel. */
const OSM_CENTRED_PANEL_FROM_ROWS = 503;

/**
 * SIMULATOR POLICY: A DELIBERATE DEVIATION FROM NATIVE. From 503 rows the side panel is vertically centered
 * (+87), whichever side it opens on (the side changes only its x), but the buff bar stays
 * anchored to the HUD bottom: its dodge box has no bottom margin, so natively a tall frame leaves the buff column hanging below an open
 * panel. Scim raises the bar until its bottom is level with the panel's bottom instead. Only a
 * raise: where the centered panel already ends lower (a frame just over 503 rows), the native
 * place stands. The horizontal dodge, and with it the 1 px gap, stay native.
 */
function osmBuffBarRaisedBottom(frame: Size, side: OsmSidePanelState): number {
  if (!side.panelOpen || frame.height < OSM_CENTRED_PANEL_FROM_ROWS) return Number.POSITIVE_INFINITY;
  const panel = osmSidePanelPlacement(frame.height, side.tabsCollapsed);
  return panel.top + panel.height;
}

/** How many buffs the mobile bar shows: whole cells across times down. */
export const OSM_BUFF_CAPACITY =
  Math.trunc(OSM_BUFF_BAR.width / OSM_BUFF_CELL) * Math.trunc(OSM_BUFF_BAR.height / OSM_BUFF_CELL);

/**
 * The `index`th buff's 32x32 tile inside the buff bar's content box, or null past
 * {@link OSM_BUFF_CAPACITY}.
 *
 * On mobile: columns from the RIGHT, rows from the BOTTOM, column-major, so the first buff
 * sits in the bottom-right cell and they stack upward, then continue in the next column to the
 * left. The tile is inset by 1 in its cell.
 */
export function osmBuffTile(index: number, box: Size = OSM_BUFF_BAR): Rect | null {
  const cols = Math.trunc(box.width / OSM_BUFF_CELL);
  const rows = Math.trunc(box.height / OSM_BUFF_CELL);
  if (index < 0 || index >= cols * rows) return null;
  const column = Math.trunc(index / rows);
  const fromLeft =
    2 + cols * OSM_BUFF_CELL - OSM_BUFF_CELL * column - OSM_BUFF_CELL + (box.width - (cols * OSM_BUFF_CELL + 1));
  const fromBottom = 2 + OSM_BUFF_CELL * (index % rows);
  return {
    x: fromLeft + 1,
    y: box.height - (fromBottom + 1) - OSM_BUFF_TILE,
    width: OSM_BUFF_TILE,
    height: OSM_BUFF_TILE,
  };
}

/**
 * The part of the buff bar's content box `count` buffs occupy, content-local: the bottom
 * `min(count, rows)` cells of the right column, and of further columns to its left. Null for
 * no buffs.
 */
export function osmBuffBarUsedRect(count: number): Rect | null {
  const shown = Math.min(count, OSM_BUFF_CAPACITY);
  if (shown <= 0) return null;
  const rows = Math.trunc(OSM_BUFF_BAR.height / OSM_BUFF_CELL);
  const top = osmBuffTile(Math.min(shown, rows) - 1);
  const left = osmBuffTile((Math.ceil(shown / rows) - 1) * rows);
  if (!top || !left) return null;
  const x = left.x - 1;
  const y = top.y - 1;
  return { x, y, width: OSM_BUFF_BAR.width - x, height: OSM_BUFF_BAR.height - y };
}

// ---------------------------------------------------------------------------------------------
// Placement in viewport CSS pixels, with collision handling.
// ---------------------------------------------------------------------------------------------

export interface OsmHudAid {
  readonly id: string;
  /** Painted size in CSS pixels. */
  readonly size: Size;
}

export interface OsmHudInput {
  readonly frame: OsmFrame;
  readonly side: OsmSidePanelState;
  readonly hotkeysCollapsed: boolean;
  /** The XP drops overlay's painted box, CSS pixels. */
  readonly xpDrops: Size;
  /** The boss health bar's painted box, CSS pixels. */
  readonly bossBar: Size;
  /** How many buffs (infoboxes) the buff bar shows. Only their cells have to stay clear. */
  readonly buffCount: number;
  /** Simulator-only overlays, placed in this order after the native ones. */
  readonly aids: readonly OsmHudAid[];
  /** Further rects to keep clear (the simulator's own tool window), viewport CSS pixels. */
  readonly occupied?: readonly Rect[];
}

export interface OsmPlacedRect extends Rect {
  /** At its native default. False when that would overlap something and it was moved. */
  readonly native: boolean;
  /** No free spot existed, so this overlaps what it should have kept clear of. */
  readonly overlapping?: true;
}

export interface OsmHudPlacement {
  readonly hud: Rect;
  /** The native chrome the HUD keeps clear of: minimap block, left column, rail, side panel. */
  readonly chrome: readonly Rect[];
  readonly xpDrops: OsmPlacedRect;
  readonly bossBar: OsmPlacedRect;
  /** The buff bar's whole 91x249 content box; its buffs are laid out in it by `osmBuffTile`. */
  readonly buffBar: OsmPlacedRect;
  /** The cells of the buff bar its buffs fill, the only part kept clear; null with no buffs. */
  readonly buffUsed: Rect | null;
  readonly aids: Readonly<Record<string, OsmPlacedRect>>;
}

/**
 * Clearance around each aid, CSS pixels. Wider than the panel registry's docking reach
 * (DOCKED_WITHIN_PX, 8, in snap/panelAttachment): an aid placed closer than that to another panel
 * would be attached to it and moved with it as one assembly, which pushes the locked natives.
 */
const GAP = 12;
/** The fallback search grid, CSS pixels. Coarse enough to stay cheap at desktop sizes. */
const SEARCH_STEP = 4;

function overlaps(a: Rect, b: Rect, gap = 0): boolean {
  return (
    a.x < b.x + b.width + gap && b.x < a.x + a.width + gap && a.y < b.y + b.height + gap && b.y < a.y + a.height + gap
  );
}

function inside(rect: Rect, bounds: Rect): boolean {
  return (
    rect.x >= bounds.x &&
    rect.y >= bounds.y &&
    rect.x + rect.width <= bounds.x + bounds.width &&
    rect.y + rect.height <= bounds.y + bounds.height
  );
}

function isFree(rect: Rect, bounds: Rect, blocked: readonly Rect[], gap: number): boolean {
  return inside(rect, bounds) && blocked.every((b) => !overlaps(rect, b, gap));
}

/** Clamped into `bounds` and left overlapping: what is placed when no free spot exists. */
function clampInto(rect: Rect, bounds: Rect): OsmPlacedRect {
  return {
    x: Math.max(bounds.x, Math.min(rect.x, bounds.x + bounds.width - rect.width)),
    y: Math.max(bounds.y, Math.min(rect.y, bounds.y + bounds.height - rect.height)),
    width: rect.width,
    height: rect.height,
    native: false,
    overlapping: true,
  };
}

/** Every {@link SEARCH_STEP} from `start` both ways within [min, max], plus the two ends. */
function searchAxis(start: number, min: number, max: number): number[] {
  if (max < min) return [];
  const values = new Set([min, max]);
  const from = Math.min(Math.max(start, min), max);
  for (let v = from; v >= min; v -= SEARCH_STEP) values.add(v);
  for (let v = from + SEARCH_STEP; v <= max; v += SEARCH_STEP) values.add(v);
  return [...values];
}

/**
 * `preferred` if it fits inside `bounds` clear of `blocked`, otherwise the free spot of the same
 * size nearest to it, searched on a {@link SEARCH_STEP} grid. When nothing is free (a portrait
 * frame with the side panel open) it goes where it covers the least (`overlapping` set).
 */
function placeNear(preferred: Rect, bounds: Rect, blocked: readonly Rect[], gap: number): OsmPlacedRect {
  if (isFree(preferred, bounds, blocked, gap)) return { ...preferred, native: true };
  let best: Rect | null = null;
  let bestDistance = Number.POSITIVE_INFINITY;
  // The grid runs through `preferred` itself, so a move along one axis leaves the other exact
  // (a buff bar pushed up keeps its native one-pixel gap to the side panel).
  const xs = searchAxis(preferred.x, bounds.x, bounds.x + bounds.width - preferred.width);
  const ys = searchAxis(preferred.y, bounds.y, bounds.y + bounds.height - preferred.height);
  for (const y of ys) {
    for (const x of xs) {
      const distance = (x - preferred.x) ** 2 + (y - preferred.y) ** 2;
      if (distance >= bestDistance) continue;
      const candidate = { x, y, width: preferred.width, height: preferred.height };
      if (isFree(candidate, bounds, blocked, gap)) {
        best = candidate;
        bestDistance = distance;
      }
    }
  }
  return best ? { ...best, native: false } : placeLeastCovering(preferred, bounds, blocked);
}

/**
 * The free spot of `size` inside `bounds` that sits highest, with a quarter-weight
 * preference for the left, or null when there is none. Weighting
 * rather than strict reading order keeps a few rows' difference from pushing an aid across the
 * frame, which scatters several aids and runs a small frame out of room.
 */
function placeTopmost(size: Size, bounds: Rect, blocked: readonly Rect[], gap: number): OsmPlacedRect | null {
  let best: Rect | null = null;
  let bestScore = Number.POSITIVE_INFINITY;
  for (let y = bounds.y; y <= bounds.y + bounds.height - size.height; y += SEARCH_STEP) {
    if (y - bounds.y >= bestScore) break;
    for (let x = bounds.x; x <= bounds.x + bounds.width - size.width; x += SEARCH_STEP) {
      const score = y - bounds.y + (x - bounds.x) / 4;
      if (score >= bestScore) break;
      const candidate = { x, y, width: size.width, height: size.height };
      if (isFree(candidate, bounds, blocked, gap)) {
        best = candidate;
        bestScore = score;
      }
    }
  }
  return best ? { ...best, native: false } : null;
}

function intersection(a: Rect, b: Rect): number {
  const w = Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x);
  const h = Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y);
  return w > 0 && h > 0 ? w * h : 0;
}

/**
 * With no free spot at all: where `size` covers the least of `cover`, highest first on ties,
 * among the spots clear of `avoid` when there are any (an aid would rather cover another aid
 * than a native or the chrome).
 */
function placeLeastCovering(
  size: Size,
  bounds: Rect,
  cover: readonly Rect[],
  avoid: readonly Rect[] = [],
): OsmPlacedRect {
  let best: OsmPlacedRect | null = null;
  let bestCover = Number.POSITIVE_INFINITY;
  for (const respectAvoid of avoid.length > 0 ? [true, false] : [false]) {
    for (let y = bounds.y; y <= bounds.y + bounds.height - size.height; y += SEARCH_STEP) {
      for (let x = bounds.x; x <= bounds.x + bounds.width - size.width; x += SEARCH_STEP) {
        const candidate = { x, y, width: size.width, height: size.height };
        if (respectAvoid && avoid.some((rect) => overlaps(candidate, rect, GAP))) continue;
        const covered = cover.reduce((sum, rect) => sum + intersection(candidate, rect), 0);
        if (covered < bestCover) {
          bestCover = covered;
          best = { ...candidate, native: false, overlapping: true };
        }
      }
    }
    if (best) return best;
  }
  return clampInto({ x: bounds.x, y: bounds.y, width: size.width, height: size.height }, bounds);
}

/** The native chrome in the Mobile layout, viewport CSS pixels. */
function osmChromeRects(input: OsmHudInput): Rect[] {
  const { frame, side, hotkeysCollapsed } = input;
  const layout = osmChromeLayout(frame.size, side.tabsCollapsed, side.panelOnLeft);
  const rects: Rect[] = [
    layout.mapContainer,
    layout.tabRail,
    osmHotkeysPlacement(frame.size.height, hotkeysCollapsed),
    osmPopoutPlacement(frame.size.height),
    // The system stones (full screen, Restart) stacked from Logout's slot, each the pop-out frame.
    {
      ...OSM_SYSTEM_STONE_ORIGIN,
      width: OSM_LEFT_COLUMN_WIDTH,
      height: OSM_SYSTEM_STONE_SLOTS * OSM_POPOUT_FRAME.height,
    },
  ];
  if (side.panelOpen) {
    rects.push(layout.sidePanel);
  }
  return rects.map((rect) => osmCssRect(frame, rect));
}

/**
 * Every HUD overlay's place in the Mobile layout, viewport CSS pixels.
 *
 * The natives (boss bar, XP drops, buff bar) take their native default (the functions above)
 * whenever it is clear of the native chrome, of one another and of `occupied`. The landscape
 * frames the mobile client runs in always leave them clear. Portrait frames do not: the
 * client has no portrait layout at all (its safe zone is never narrower than 680 logical
 * pixels), so there the overlay that would collide moves to the nearest free
 * spot instead. That fallback is the simulator's, not the game's.
 *
 * The aids have no native place. Each takes the highest free spot (see `placeTopmost`), so
 * they fill the top of the frame first, beside the boss bar, and pack downward from there. A
 * frame with no room left for one (several aids in portrait with the side panel open) lets it
 * cover another aid rather than the chrome or a native, and a frame with no room even then puts
 * it where it covers the least (`overlapping` set).
 */
export function placeOsmHud(input: OsmHudInput): OsmHudPlacement {
  const { frame } = input;
  const bounds = osmCssRect(frame, { x: 0, y: 0, width: frame.size.width, height: frame.size.height });
  const hud = osmCssRect(frame, osmHudRect(frame.size));
  const chrome = osmChromeRects(input);
  const blocked: Rect[] = [...chrome, ...(input.occupied ?? [])];

  const hp = osmCssRect(frame, { ...osmHpBarOrigin(), width: OSM_HPBAR_WIDTH, height: OSM_HPBAR_HEIGHT });
  const bossBar = placeNear({ x: hp.x, y: hp.y, ...input.bossBar }, bounds, blocked, 0);
  blocked.push(bossBar);

  // Only the cells in use are kept clear: the box is mostly empty, and in portrait there is no
  // room for all of it. The box moves with its used corner.
  const box = osmCssRect(frame, osmBuffBarRect(frame.size, input.side));
  const used = osmBuffBarUsedRect(input.buffCount);
  let buffBar: OsmPlacedRect = { ...box, native: true };
  let buffUsed: Rect | null = null;
  if (used) {
    const ratioX = box.width / OSM_BUFF_BAR.width;
    const ratioY = box.height / OSM_BUFF_BAR.height;
    const usedCss = {
      x: box.x + used.x * ratioX,
      y: box.y + used.y * ratioY,
      width: used.width * ratioX,
      height: used.height * ratioY,
    };
    const placedUsed = placeNear(usedCss, bounds, blocked, 0);
    buffBar = {
      x: box.x + (placedUsed.x - usedCss.x),
      y: box.y + (placedUsed.y - usedCss.y),
      width: box.width,
      height: box.height,
      native: placedUsed.native,
    };
    blocked.push(placedUsed);
    buffUsed = placedUsed;
  }

  // After the buff bar: where a portrait frame has room for only one of them, the timers keep it
  // and the transient drops move.
  const xpCorner = osmCssRect(frame, { ...osmXpDropsTopRight(frame.size), width: 0, height: 0 });
  const xpDrops = placeNear(
    { x: xpCorner.x - input.xpDrops.width, y: xpCorner.y, ...input.xpDrops },
    bounds,
    blocked,
    0,
  );
  blocked.push(xpDrops);

  // When the frame has no room left, an aid may cover another aid, never the chrome or a native.
  const hard = [...blocked];
  const aids: Record<string, OsmPlacedRect> = {};
  for (const aid of input.aids) {
    aids[aid.id] = placeTopmost(aid.size, bounds, blocked, GAP) ?? placeLeastCovering(aid.size, bounds, blocked, hard);
    blocked.push(aids[aid.id]);
  }
  return { hud, chrome, xpDrops, bossBar, buffBar, buffUsed, aids };
}
