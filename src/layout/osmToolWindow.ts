import { OSM_CHAT_CONTAINER, osmChromeLayout, osmHotkeysPlacement, osmPopoutPlacement } from './osmClientLayout';
import { type OsmFrame, osmCssRect } from './osmFrame';
import { type Rect, type Size, scaleRect } from './osrsClientLayout';

export interface OsmToolWindowInput {
  readonly frame: OsmFrame;
  readonly viewport: Size;
  readonly open: boolean;
  readonly collapsed?: boolean;
  /** The actual side of the game panel, not merely the user's hotkey preference. */
  readonly sidePanelOnLeft?: boolean;
  readonly devicePixelRatio?: number;
}

export interface OsmToolWindowLayout {
  /** Stable native left-column toggle, open or closed. */
  readonly dock: Rect;
  readonly occupied: readonly Rect[];
  readonly window: Rect | null;
}

/**
 * Both controls stay INSIDE their native slots. A touch minimum must never move the dock
 * up into Hotkeys or grow the window over neighboring chrome. Portrait can require a
 * narrower window while the game panel is on the right; covering the left panel is allowed.
 */
export function osmToolWindowLayout({
  frame,
  viewport,
  open,
  collapsed,
  sidePanelOnLeft = false,
  devicePixelRatio = 1,
}: OsmToolWindowInput): OsmToolWindowLayout {
  const safe: Rect = {
    x: Math.max(0, frame.origin.x),
    y: Math.max(0, frame.origin.y),
    width: Math.max(0, Math.floor(Math.min(viewport.width - frame.origin.x, frame.size.width * frame.scale))),
    height: Math.max(0, Math.floor(Math.min(viewport.height - frame.origin.y, frame.size.height * frame.scale))),
  };
  const clip = (rect: Rect): Rect => {
    const x = Math.max(safe.x, rect.x);
    const y = Math.max(safe.y, rect.y);
    return {
      x,
      y,
      width: Math.max(0, Math.min(rect.x + rect.width, safe.x + safe.width) - x),
      height: Math.max(0, Math.min(rect.y + rect.height, safe.y + safe.height) - y),
    };
  };
  const nativeWindow = clip(osmCssRect(frame, osmChromeLayout(frame.size, false, true).sidePanel));
  const nativeDock = clip(osmCssRect(frame, osmPopoutPlacement(frame.size.height)));
  // Native DraggablePanel paint rounds each edge to the device grid (snapPanelRect),
  // while recordings can retain the unsnapped box. Enclose both in CSS pixels: a
  // fractional-DPR outward snap must not paint under Tools' otherwise abutting edge.
  const nativeBounds = (rect: Rect): Rect => {
    const css = osmCssRect(frame, rect);
    const physical = scaleRect(css, devicePixelRatio);
    const x = Math.floor(Math.min(css.x, physical.x / devicePixelRatio));
    const y = Math.floor(Math.min(css.y, physical.y / devicePixelRatio));
    return {
      x,
      y,
      width: Math.ceil(Math.max(css.x + css.width, (physical.x + physical.width) / devicePixelRatio)) - x,
      height: Math.ceil(Math.max(css.y + css.height, (physical.y + physical.height) / devicePixelRatio)) - y,
    };
  };
  // The centered collapsed Hotkeys container can end one logical row below the expanded
  // one. Reserve both snapped bounds so toggling the stones never moves or covers Tools.
  const hotkeys = [false, true].map((collapsed) => nativeBounds(osmHotkeysPlacement(frame.size.height, collapsed)));
  const hotkeyBottom = Math.max(...hotkeys.map((rect) => rect.y + rect.height));
  const dockTop = Math.max(nativeDock.y, hotkeyBottom);
  const bottom = Math.min(nativeWindow.y + nativeWindow.height, nativeDock.y + nativeDock.height);
  const entry = {
    x: nativeDock.x,
    y: dockTop,
    width: nativeDock.width,
    height: Math.max(0, bottom - dockTop),
  };
  if (!open) return { dock: entry, occupied: [entry], window: null };

  const chrome = osmChromeLayout(frame.size, false);
  const right = nativeBounds(sidePanelOnLeft ? chrome.tabRail : chrome.sidePanel);
  const x = Math.max(nativeWindow.x, ...hotkeys.map((rect) => rect.x + rect.width));
  const width = Math.max(0, Math.min(nativeWindow.x + nativeWindow.width, right.x) - x);
  let top = nativeWindow.y;
  for (const upper of [OSM_CHAT_CONTAINER, chrome.mapContainer]) {
    const rect = nativeBounds(upper);
    if (rect.x < x + width && rect.x + rect.width > x) {
      top = Math.max(top, rect.y + rect.height);
    }
  }
  const alignedWindow = { x, y: top, width, height: Math.max(0, bottom - top) };
  // Tutorials can reveal only the tab strip; ordinary tabs all occupy the identical slot.
  const height = collapsed ? Math.min(alignedWindow.height, entry.height + 1) : alignedWindow.height;
  const window = collapsed
    ? { ...alignedWindow, y: alignedWindow.y + alignedWindow.height - height, height }
    : alignedWindow;
  return { dock: entry, occupied: [window, entry], window };
}
