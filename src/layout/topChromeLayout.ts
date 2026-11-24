import { HUD_TOOL_GAP } from '../util/viewportLayout';
import { type Box, launcherRowFits, protectedPlayArea, sceneInFrame } from './chromeBreakpoints';
import { FIXED_FRAME, FIXED_FRAME_EDGE_LEFT } from './osrsClientLayout';

/**
 * Where the chrome around the game sits: the launcher row (Menu, Practice, Actions, Replay)
 * at the top left, Plugins at the window's top-right corner, the FPS readout, the boss bar's default slot, the pane a
 * launcher opens, and the Chatbox infobox rows. Pure geometry in window CSS pixels unless a function
 * says otherwise; the components measure the live rectangles and pass them in.
 *
 * One inset everywhere: HUD_TOOL_GAP, scaled with the chrome. The launcher row measures it from the
 * window's edge (or the open Settings drawer's), or, where it would otherwise sit over the Fixed
 * frame, from the inner edge of that frame's stone border, as the left and bottom insets inside the
 * frame are. Plugins always measures it from the window's corner.
 */

export type Rect = Box;

/** The launcher row's and Plugins' height at zoom 1: one stone button. */
export const LAUNCHER_BUTTON_HEIGHT = 28;
/** A pane's widest, at zoom 1. Narrower only where the play area leaves less room. */
export const PANE_WIDTH = 240;
/** A pane's tallest, at zoom 1. Panes size to their content below this and never reserve empty height. */
export const PANE_MAX_HEIGHT = 400;
/**
 * The least room a pane opens in under its launcher, at zoom 1, scrolling its body for the rest:
 * Practice keeps its tabs, section nav and a few rows; Actions and Menu keep three rows. With less,
 * the pane opens in the right-side column instead (see `placePane`).
 */
export const PANE_MIN_HEIGHT = { practice: 140, actions: 96, menu: 96 } as const;
/**
 * The narrowest a pane opens under its launcher, at zoom 1: just under Fixed 1×'s 152, the narrowest
 * designed case. A launcher row moved right (by the Settings drawer) can leave less room left of the
 * play area than that; then the pane opens in the right-side column.
 */
export const PANE_MIN_WIDTH = 150;
export type PaneKind = keyof typeof PANE_MIN_HEIGHT;
/** How far the boss bar's default slot keeps from the launcher row beside it, at zoom 1. */
export const BOSS_BAR_ROW_CLEARANCE = 8;

export interface ChromeFrame {
  /** The laid-out game frame, in window pixels. */
  readonly rect: Rect;
  readonly fixed: boolean;
}

export interface Size {
  readonly width: number;
  readonly height: number;
}

export function intersects(a: Rect, b: Rect): boolean {
  return a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + b.height && a.y + a.height > b.y;
}

/** The Fixed frame's stone border, in window pixels; 0 for the resizable layouts. */
export function frameBorder(frame: ChromeFrame): number {
  // Snapped as the bezel is drawn.
  return frame.fixed ? Math.round((FIXED_FRAME_EDGE_LEFT.width * frame.rect.width) / FIXED_FRAME.width) : 0;
}

/**
 * The launcher row's top-left corner for a row of `size`: one gap in from the window's corner, or,
 * where that would put it over the Fixed frame, one gap in from the frame's border. `leftInset` is
 * the room the open Settings drawer takes from the window (0 when it is closed): the row moves right
 * past it, so it stays on screen and usable while the drawer is open.
 */
export function launcherRowPosition(
  size: Size,
  frame: ChromeFrame,
  zoom: number,
  leftInset = 0,
): { x: number; y: number } {
  const gap = HUD_TOOL_GAP * zoom;
  const atWindow = { x: leftInset + gap, y: gap };
  if (!frame.fixed || !intersects({ ...atWindow, ...size }, frame.rect)) return atWindow;
  const border = frameBorder(frame);
  return { x: Math.max(frame.rect.x + border + gap, atWindow.x), y: frame.rect.y + border + gap };
}

/**
 * Plugins: always the window's top-right corner, one gap in, in every layout. It is chrome over the
 * game, drawn on top: where the minimap or Fixed's stone column holds that corner, Plugins covers a
 * little of it rather than moving, so it is always where the player last saw it. `rightInset` is the
 * room the open Plugins drawer takes from the window (0 when it is closed): Plugins moves left past
 * it, as the launcher row moves right past the Settings drawer, so it stays on screen to close it.
 */
export function pluginsPosition(size: Size, window: Size, zoom: number, rightInset = 0): { x: number; y: number } {
  const gap = HUD_TOOL_GAP * zoom;
  return { x: window.width - rightInset - gap - size.width, y: gap };
}

/**
 * Whether Plugins, at `plugins`, keeps one gap clear of the launcher row. Only both drawers open on a
 * narrow desktop window bring the two together (Settings pushing the row right, the Plugins drawer
 * pushing Plugins left); there Plugins gives way to the row and hides, as it hid under its drawer
 * before, and the drawer's own close still closes it.
 */
export function pluginsClearOfRow(plugins: Rect, row: Rect | null, zoom: number): boolean {
  if (!row || row.y >= plugins.y + plugins.height || plugins.y >= row.y + row.height) return true;
  return row.x + row.width + HUD_TOOL_GAP * zoom <= plugins.x;
}

/**
 * The FPS readout's top-right corner, as `right` from the window's right edge and `top`: one gap
 * under Plugins, flush with its right edge, whenever Plugins is showing (moved past its open drawer
 * or not), so the readout has one fixed place beside it and grows leftward. Without Plugins (not yet
 * loaded) the readout keeps its own corner, `corner`; TopChrome skips it where a drawer covers that.
 */
export function fpsPosition(
  window: Size,
  plugins: Rect | null,
  zoom: number,
  corner: { readonly right: number; readonly top: number },
): { right: number; top: number } {
  if (!plugins) return { right: corner.right, top: corner.top };
  return { right: window.width - (plugins.x + plugins.width), top: plugins.y + plugins.height + HUD_TOOL_GAP * zoom };
}

/** The boss bar's compact form's height at its overlay's zoom 1: name, then HP, then the track. */
export const BOSS_BAR_COMPACT_HEIGHT = 56;

export interface BossBarSlot {
  readonly x: number;
  readonly y: number;
  /**
   * The bar takes its compact form here (name on its own line, HP under it, no badge or
   * percentage), `width` wide: it could not sit beside the launcher row.
   */
  readonly compact: boolean;
  readonly width: number;
}

export interface BossBarDefaultInput {
  readonly scene: Rect;
  /** The bar's normal form, at its overlay's scale. */
  readonly bar: Size;
  /** The launcher row on screen, or null where there is none. */
  readonly row: Rect | null;
  readonly zoom: number;
  /** The compact form's widest and its height, at the bar's overlay scale. */
  readonly compact: { readonly maxWidth: number; readonly height: number };
  /**
   * The fixed chrome the bar keeps clear of, beside the row: the minimap with its orbs (or the
   * Compact Orbs block) and Plugins. Never the boss bar's own neighbors that move with the fight.
   */
  readonly chrome?: readonly Rect[];
}

/**
 * The boss bar's default slot, in window pixels. It places itself around the launcher row and the
 * fixed chrome, never the other way round: nothing here feeds back into the row's form
 * (`launcherRowUsesIcons`).
 *
 * 1. The row's line, at the scene's top inset: centered on the scene, moved right to stay
 *    BOSS_BAR_ROW_CLEARANCE after the row and left to stay one gap short of the scene's right inset
 *    and of the chrome on that line (in Fixed the scene's inset is the minimap column's edge; in
 *    Modern and Classic the minimap and Plugins sit over the scene).
 * 2. Else the next line, one gap under the row, by the same rule from the row's left: a pane under
 *    the row drops below it.
 * 3. Else the compact form on that line at the row's left (name, then HP, then the track), as wide as
 *    the room to the scene's inset and the chrome allows, up to `compact.maxWidth` (Fixed 1× with
 *    the Settings drawer open: 188×56 at 324,40).
 */
export function bossBarDefault(input: BossBarDefaultInput): BossBarSlot {
  const { scene, bar, row, zoom, compact, chrome = [] } = input;
  const gap = HUD_TOOL_GAP * zoom;
  const sceneRight = scene.x + scene.width - gap;
  const centred = scene.x + scene.width / 2 - bar.width / 2;
  // Where a bar on the band from `top`, `height` tall and starting at `from`, must end.
  const rightEdge = (top: number, height: number, from: number) =>
    Math.min(
      sceneRight,
      ...chrome
        .filter((c) => c.width > 0 && c.y < top + height && c.y + c.height > top && c.x + c.width > from)
        .map((c) => c.x - gap),
    );
  // The bar's place on a line, centered as nearly as the room from `from` allows, or null.
  const onLine = (y: number, from: number): BossBarSlot | null => {
    const last = rightEdge(y, bar.height, from) - bar.width;
    if (from > last) return null;
    return { x: Math.min(Math.max(centred, from), last), y, compact: false, width: bar.width };
  };
  const y = scene.y + gap;
  const sameLine = row !== null && row.y < y + bar.height && row.y + row.height > y;
  if (!row || !sameLine) {
    return (
      onLine(y, scene.x + gap) ?? { x: Math.min(centred, sceneRight - bar.width), y, compact: false, width: bar.width }
    );
  }
  const beside = onLine(y, row.x + row.width + BOSS_BAR_ROW_CLEARANCE * zoom);
  if (beside) return beside;
  const below = row.y + row.height + gap;
  const next = onLine(below, row.x);
  if (next) return next;
  const width = Math.max(0, Math.min(compact.maxWidth, rightEdge(below, compact.height, row.x) - row.x));
  return { x: row.x, y: below, compact: true, width };
}

/**
 * Whether the launcher row takes its icon form (every launcher, Menu too, as its icon) rather than
 * its labeled one: where the labeled row, `labelledWidth` in window pixels,
 * would cover more than its share of the room from where it starts to the scene's right inset, with
 * the chat open (chromeBreakpoints.ts `LAUNCHER_ROW_MAX_SHARE`). Decided from the viewport alone,
 * never from an overlay, so the boss bar or the infoboxes cannot change it; they place themselves
 * around the row.
 */
export function launcherRowUsesIcons(input: {
  readonly labelledWidth: number;
  readonly frame: ChromeFrame;
  readonly zoom: number;
  readonly leftInset: number;
}): boolean {
  const { labelledWidth: width, frame, zoom, leftInset } = input;
  const scene = sceneInFrame(frame.rect, frame.fixed, true);
  const sceneRight = scene.x + scene.width - HUD_TOOL_GAP * zoom;
  const { x } = launcherRowPosition({ width, height: LAUNCHER_BUTTON_HEIGHT * zoom }, frame, zoom, leftInset);
  return !launcherRowFits(width, sceneRight - x);
}

export interface PanePlacement {
  /** Window pixels. */
  readonly x: number;
  readonly y: number;
  /** CSS pixels at the chrome's zoom. */
  readonly width: number;
  readonly maxHeight: number;
  /**
   * Under its launcher; the right-side column; or, where neither can host it, the narrow-window tool
   * window (`window`). Away from its launcher (right column, tool window) the pane carries its own
   * title row and close.
   */
  readonly column: 'launcher' | 'right' | 'window';
}

export interface PanePlacementInput {
  readonly kind: PaneKind;
  readonly zoom: number;
  /** The launcher row, in window pixels. */
  readonly row: Rect;
  readonly frame: ChromeFrame;
  readonly window: Size;
  /** The chatbox's top (or its controls row's, collapsed); the frame's bottom without one. */
  readonly chatTop: number;
  /**
   * The fixed chrome a pane keeps clear of, where it is now: the minimap with its orbs (or the
   * Compact Orbs block), Plugins, and the side panel and its tab bar. Never the click-through
   * overlays (infoboxes, the boss bar, XP drops, the DPS and timer overlays): panes draw over those,
   * so nothing they do moves a pane.
   */
  readonly chrome?: readonly Rect[];
}

/**
 * A column's vertical span once the fixed chrome over it is cleared: chrome reaching into its upper
 * half pushes its top one gap below; chrome further down ends it one gap above.
 */
function clearOfChrome(
  column: { readonly x: number; readonly width: number; readonly top: number; readonly bottom: number },
  chrome: readonly Rect[],
  gap: number,
): { top: number; bottom: number } {
  let { top, bottom } = column;
  for (const c of [...chrome].sort((a, b) => a.y - b.y)) {
    const overlaps =
      c.width > 0 && c.x < column.x + column.width && c.x + c.width > column.x && c.y < bottom && c.y + c.height > top;
    if (!overlaps) continue;
    if (c.y <= (top + bottom) / 2) top = Math.max(top, c.y + c.height + gap);
    else bottom = Math.min(bottom, c.y - gap);
  }
  return { top, bottom };
}

/**
 * Where a pane opens, decided once when it opens and kept while it is open. Only the viewport and
 * the fixed chrome decide it (the row, the Settings drawer through the row, the minimap, Plugins,
 * the side panel, the chatbox); the click-through overlays never do, and the pane draws over them.
 *
 * Under its launcher, one gap below the row, PANE_WIDTH wide or as wide as the room left of the
 * play area allows. Width is measured against the play area with the chat collapsed, the wider of
 * the two, so collapsing the chat never reflows it. Height runs to one gap above the chat.
 *
 * A Fixed frame with margin around it puts the whole pane outside the frame: then nothing in the
 * frame limits it, only the window.
 *
 * A row the Settings drawer pushed past the play area's left edge opens its pane under itself
 * anyway, as wide as the room to the scene's right inset and one gap short of the chrome beside it
 * (the minimap and its orbs, Plugins): the drawer has taken the scene's left. Modern 765 with the
 * drawer open: 193 wide, ending one gap before the minimap.
 *
 * Where the room under the launcher is less than the pane's minimum height or width (the row moved
 * right by the drawer, up against the play area or the minimap; a narrow window), the pane opens in
 * the right-side column instead: right of the play area, below the row and the chrome over it, by
 * the same width rule.
 *
 * Where that column cannot host it either (narrower than PANE_MIN_WIDTH, or too short below the
 * minimap: Modern 480 portrait), the pane opens as the narrow-window tool window: at the row's
 * left, clamped one gap inside the window, one gap below the row and ending one gap above the chat;
 * PANE_WIDTH wide, or one gap short of the minimap's panel beside it where that still leaves
 * PANE_MIN_WIDTH (Modern 480: 228). It may cover scene ground while it is open: there is no room
 * that does not.
 */
export function placePane(input: PanePlacementInput): PanePlacement {
  const { kind, zoom, row, frame, window, chatTop, chrome = [] } = input;
  const gap = HUD_TOOL_GAP * zoom;
  const widest = sceneInFrame(frame.rect, frame.fixed, false);
  const playArea = protectedPlayArea(widest);
  const exterior = frame.fixed && row.x + PANE_WIDTH * zoom + gap <= frame.rect.x;
  // A row the Settings drawer pushed past the play area's left edge (Fixed 1× with the drawer open):
  // the drawer holds the scene's left, so the column runs from the row to the scene's right inset,
  // stopping one gap short of any chrome beside the pane's height (the Modern minimap).
  const pushedPast = !exterior && row.x + gap >= playArea.left;
  const scene = sceneInFrame(frame.rect, frame.fixed, true);
  const paneTop = row.y + row.height + gap;
  const columnRight = pushedPast
    ? Math.min(
        scene.x + scene.width - gap,
        ...chrome
          .filter((c) => c.width > 0 && c.x + c.width > row.x && c.y < chatTop && c.y + c.height > paneTop)
          .map((c) => c.x - gap),
      )
    : playArea.left - gap;
  const width = exterior ? PANE_WIDTH : Math.min(PANE_WIDTH, Math.floor((columnRight - row.x) / zoom));
  const under = exterior
    ? { top: paneTop, bottom: window.height - gap }
    : clearOfChrome({ x: row.x, width: width * zoom, top: paneTop, bottom: chatTop - gap }, chrome, gap);
  const room = (under.bottom - under.top) / zoom;
  if (exterior || (room >= PANE_MIN_HEIGHT[kind] && width >= PANE_MIN_WIDTH)) {
    return { x: row.x, y: under.top, width, maxHeight: Math.min(PANE_MAX_HEIGHT, room), column: 'launcher' };
  }

  const rightX = playArea.right + gap;
  const rightWidth = Math.min(PANE_WIDTH, Math.floor((scene.x + scene.width - gap - rightX) / zoom));
  // Under whatever reaches over the column: a row the drawer moved right, the minimap, Plugins.
  const right = clearOfChrome(
    { x: rightX, width: rightWidth * zoom, top: scene.y + gap, bottom: chatTop - gap },
    [row, ...chrome],
    gap,
  );
  const rightRoom = (right.bottom - right.top) / zoom;
  if (rightWidth >= PANE_MIN_WIDTH && rightRoom >= PANE_MIN_HEIGHT[kind]) {
    return {
      x: rightX,
      y: right.top,
      width: rightWidth,
      maxHeight: Math.min(PANE_MAX_HEIGHT, rightRoom),
      column: 'right',
    };
  }

  // The narrow-window tool window: at the row's left, one gap inside the window. Where chrome beside
  // it on its band (the minimap's panel) leaves it at least PANE_MIN_WIDTH, it stops one gap short
  // of that chrome; otherwise it is PANE_WIDTH and starts below the chrome over it.
  const fullWidth = Math.min(PANE_WIDTH, Math.floor((window.width - 2 * gap) / zoom));
  const toolX = Math.max(gap, Math.min(row.x, window.width - gap - fullWidth * zoom));
  const toolBottom = chatTop - gap;
  const besideRight = Math.min(
    window.width - gap,
    ...chrome
      .filter(
        (c) =>
          c.width > 0 &&
          c.x > toolX &&
          c.x < toolX + fullWidth * zoom + gap &&
          c.y < toolBottom &&
          c.y + c.height > paneTop,
      )
      .map((c) => c.x - gap),
  );
  const besideWidth = Math.min(fullWidth, Math.floor((besideRight - toolX) / zoom));
  const toolWidth = besideWidth >= PANE_MIN_WIDTH ? besideWidth : fullWidth;
  const tool = clearOfChrome({ x: toolX, width: toolWidth * zoom, top: paneTop, bottom: toolBottom }, chrome, gap);
  return {
    x: toolX,
    y: tool.top,
    width: toolWidth,
    maxHeight: Math.max(0, Math.min(PANE_MAX_HEIGHT, (tool.bottom - tool.top) / zoom)),
    column: 'window',
  };
}

/**
 * The Chatbox infobox rows' anchor, in the frame's own pixels: one gap in from the frame's left (from
 * the inner edge of Fixed's border) and one gap above the chatbox. `chat` is the chatbox (or its
 * controls row) in frame pixels.
 *
 * The rows may run the chatbox's width, one gap short of its right edge and never past the scene's
 * right inset, so they read as one band sitting on the chat. They may cross the protected play area:
 * the strip is click-through (DraggablePanel `pointerPassthrough`), so a tile over the ground never
 * takes the click meant for it. Wide rows mean few rows, which leaves the height above them to the
 * panes under the launchers. The width does not depend on the chat being open or collapsed (both
 * have the same width), so collapsing it only moves the rows down.
 */
export function chatboxInfoboxAnchor(input: {
  readonly frame: Size;
  readonly fixed: boolean;
  readonly chat: Rect;
  readonly zoom: number;
}): { left: number; bottom: number; maxWidth: number } {
  const { frame, fixed, chat, zoom } = input;
  const gap = HUD_TOOL_GAP * zoom;
  const box = { x: 0, y: 0, width: frame.width, height: frame.height };
  const left = (fixed ? frameBorder({ rect: box, fixed }) : chat.x) + gap;
  const scene = sceneInFrame(box, fixed, false);
  const sceneRight = scene.x + scene.width;
  const right = chat.width > 0 ? Math.min(chat.x + chat.width, sceneRight) : sceneRight;
  return { left, bottom: chat.y - gap, maxWidth: Math.max(0, right - gap - left) };
}

/**
 * The Chatbox strip's grid for `count` tiles: as many a row as fit `maxWidth` (frame pixels, from
 * `chatboxInfoboxAnchor`), spread evenly over the fewest rows. `tile` and `gap` are in the strip's
 * own pixels, which its panel draws at `scale`.
 */
export function chatboxInfoboxGrid(input: {
  readonly count: number;
  readonly maxWidth: number;
  readonly tile: number;
  readonly gap: number;
  readonly scale: number;
}): { columns: number; rows: number } {
  const { count, maxWidth, tile, gap, scale } = input;
  const fit = scale > 0 ? Math.floor((maxWidth / scale + gap) / (tile + gap)) : 1;
  const columns = balancedColumns(count, Math.max(1, fit));
  return { columns, rows: Math.ceil(Math.max(1, count) / columns) };
}

/**
 * Balanced rows for `count` tiles where at most `maxColumns` fit a row: as few rows as that allows,
 * with the tiles spread evenly over them (3 + 3, never 5 + 1).
 */
export function balancedColumns(count: number, maxColumns: number): number {
  const fit = Math.max(1, maxColumns);
  if (count <= fit) return Math.max(1, count);
  const rows = Math.ceil(count / fit);
  return Math.ceil(count / rows);
}
