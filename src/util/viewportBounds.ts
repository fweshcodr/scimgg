/** Fixed frames can overflow the window, so overlays must clamp to the visible intersection. */
export interface ViewportBounds {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

export interface ClientPoint {
  readonly clientX: number;
  readonly clientY: number;
}

/**
 * Replay samples use the unclamped frame rect because clamping moves their
 * origin, while playback rebuilds the recorded frame size.
 *
 * `left`/`top` are where the frame is painted in the window; `width`/`height`
 * are its LAYOUT size, the frame playback rebuilds. `scaleX`/`scaleY` (default 1)
 * are how much larger it is painted than laid out: Fixed's Stretch to Window.
 * `openMenu` is the open context menu's mapping over such a frame (see `OpenMenuMapping`).
 */
export interface GameFrameRect {
  readonly left: number;
  readonly top: number;
  readonly width: number;
  readonly height: number;
  readonly scaleX?: number;
  readonly scaleY?: number;
  readonly openMenu?: OpenMenuMapping;
}

/**
 * Where an open context menu is recorded over a stretched frame. The menu is drawn unstretched, so
 * it cannot take the per-axis division the rest of the frame records with: it is moved rigidly
 * instead, and every point over it moves with it, so a recorded cursor or click stays on the row
 * it was on. One mapping records both the menu (ContextMenuOverlay) and the points over it
 * (`toFrameLocalPoint`), so the two cannot disagree.
 */
export interface OpenMenuMapping {
  /** The client boxes of the menu and its open submenu. */
  readonly surfaces: readonly ViewportBounds[];
  /** Added to a point's client offset from the frame's origin to give its recorded frame point. */
  readonly shiftX: number;
  readonly shiftY: number;
}

let openMenuMapping: OpenMenuMapping | null = null;

/** Set by ContextMenuOverlay while a live menu is open over a stretched frame; null otherwise. */
export function setOpenMenuMapping(mapping: OpenMenuMapping | null): void {
  openMenuMapping = mapping;
}

type ClientBox = Pick<DOMRectReadOnly, 'left' | 'top' | 'right' | 'bottom' | 'width' | 'height'>;

/**
 * The mapping for a menu at `menu` (and an open submenu at `submenu`), client boxes, over `frame`;
 * null where the frame is not stretched and every point already records one way. The menu keeps
 * its horizontal center on the same frame point (it opens centered on the cursor) and its top on
 * the same frame row, held inside the frame playback rebuilds.
 */
export function openMenuMappingFor(frame: GameFrameRect, menu: ClientBox, submenu?: ClientBox): OpenMenuMapping | null {
  if (frame.scaleX === undefined && frame.scaleY === undefined) return null;
  const clamp = (value: number, max: number) => Math.min(Math.max(value, 0), Math.max(0, max));
  const offsetX = menu.left - frame.left;
  const offsetY = menu.top - frame.top;
  const x = clamp((offsetX + menu.width / 2) / (frame.scaleX ?? 1) - menu.width / 2, frame.width - menu.width);
  const y = clamp(offsetY / (frame.scaleY ?? 1), frame.height - menu.height);
  const box = ({ left, top, right, bottom }: ClientBox): ViewportBounds => ({ left, top, right, bottom });
  return { surfaces: submenu ? [box(menu), box(submenu)] : [box(menu)], shiftX: x - offsetX, shiftY: y - offsetY };
}

export function getGameFrameRect(): GameFrameRect | null {
  if (typeof document === 'undefined') return null;
  const frame = document.querySelector<HTMLElement>('.game-viewport-frame');
  if (!frame) return null;
  const rect = frame.getBoundingClientRect();
  // Nothing is reported until a real frame exists. Falling back to the window
  // would mark those samples as valid frame pixels even though the frame that
  // arrives next can have a different size and origin. Callers retry on every
  // pointer event, so this only skips the samples taken before it mounts.
  if (rect.width <= 0 || rect.height <= 0) return null;
  const { x: scaleX, y: scaleY } = paintScaleOf(frame, rect);
  if (scaleX === 1 && scaleY === 1) return { left: rect.left, top: rect.top, width: rect.width, height: rect.height };
  return {
    left: rect.left,
    top: rect.top,
    width: frame.offsetWidth,
    height: frame.offsetHeight,
    scaleX,
    scaleY,
    ...(openMenuMapping ? { openMenu: openMenuMapping } : {}),
  };
}

export function toFrameLocalPoint(point: ClientPoint, rect: GameFrameRect): { x: number; y: number } {
  const menu = rect.openMenu;
  if (
    menu?.surfaces.some(
      (box) =>
        point.clientX >= box.left &&
        point.clientX <= box.right &&
        point.clientY >= box.top &&
        point.clientY <= box.bottom,
    )
  ) {
    return { x: point.clientX - rect.left + menu.shiftX, y: point.clientY - rect.top + menu.shiftY };
  }
  return { x: (point.clientX - rect.left) / (rect.scaleX ?? 1), y: (point.clientY - rect.top) / (rect.scaleY ?? 1) };
}

/** Painted size over layout size, per axis; 1 where the element has no layout size (jsdom). */
function paintScaleOf(element: HTMLElement, rect: DOMRect): { x: number; y: number } {
  return {
    x: element.offsetWidth > 0 && rect.width > 0 ? rect.width / element.offsetWidth : 1,
    y: element.offsetHeight > 0 && rect.height > 0 ? rect.height / element.offsetHeight : 1,
  };
}

/**
 * How much larger than laid out the game frame holding `element` is painted, per axis: Fixed's
 * Stretch to Window, or a replay fitted into a smaller window. Pointer math that divides client
 * pixels by a panel's own zoom multiplies that zoom by this. 1 outside a frame.
 */
export function framePaintScale(element: Element | null | undefined): { x: number; y: number } {
  const frame = element?.closest<HTMLElement>('.game-viewport-frame');
  return frame ? paintScaleOf(frame, frame.getBoundingClientRect()) : { x: 1, y: 1 };
}

/**
 * A client point moved to where it would be if the game frame holding `element` were painted at
 * its layout size, about `rect`'s top-left (`element`'s client rect). Panel pointer math written
 * as `(clientX - rect.left) / zoom` for a uniformly zoomed panel then stays right under Stretch to
 * Window's per-axis stretch.
 */
export function unstretchedClientPoint(element: Element, rect: DOMRect, clientX: number, clientY: number): ClientPoint {
  const paint = framePaintScale(element);
  return { clientX: rect.left + (clientX - rect.left) / paint.x, clientY: rect.top + (clientY - rect.top) / paint.y };
}

/** Sidebar overlays are not replayable frame content, so exclude their overlap and hide the cursor there. */
export function isInsideFrameRect(
  localPoint: { x: number; y: number },
  rect: GameFrameRect,
  insets?: { readonly left: number; readonly right: number },
): boolean {
  const left = insets?.left ?? 0;
  const right = insets?.right ?? 0;
  return localPoint.x >= left && localPoint.y >= 0 && localPoint.x <= rect.width - right && localPoint.y <= rect.height;
}

export function toReplayCursorPoint(
  point: ClientPoint,
  frameRect: GameFrameRect,
  insets?: { readonly left: number; readonly right: number },
): { readonly x: number; readonly y: number; readonly insideFrame: boolean } {
  const gamePoint = toFrameLocalPoint(point, frameRect);
  return { ...gamePoint, insideFrame: isInsideFrameRect(gamePoint, frameRect, insets) };
}

/**
 * `getBoundingClientRect()` reports painted pixels; downstream tile projection
 * needs layout pixels. Derive scale from the element so transformed ancestors work.
 */
export function toElementLocalPoint(element: HTMLElement, clientX: number, clientY: number): { x: number; y: number } {
  const rect = element.getBoundingClientRect();
  const scaleX = element.offsetWidth > 0 ? rect.width / element.offsetWidth : 1;
  const scaleY = element.offsetHeight > 0 ? rect.height / element.offsetHeight : 1;
  return {
    x: scaleX === 0 ? 0 : (clientX - rect.left) / scaleX,
    y: scaleY === 0 ? 0 : (clientY - rect.top) / scaleY,
  };
}

export function toElementClientPoint(element: HTMLElement, x: number, y: number): ClientPoint {
  const rect = element.getBoundingClientRect();
  const scaleX = element.offsetWidth > 0 ? rect.width / element.offsetWidth : 1;
  const scaleY = element.offsetHeight > 0 ? rect.height / element.offsetHeight : 1;
  return { clientX: rect.left + x * scaleX, clientY: rect.top + y * scaleY };
}

export function getReplayPointerTarget(clientX: number, clientY: number): Element | null {
  const target = document.elementFromPoint(clientX, clientY);
  if (!target?.closest('[data-replay-viewer-chrome]')) return target;
  return (
    document.elementsFromPoint(clientX, clientY).find((element) => !element.closest('[data-replay-viewer-chrome]')) ??
    null
  );
}

/**
 * The whole window: the clamp zone for overlays owned by window-fixed viewer chrome
 * (the replay transport), which is laid out against the viewport rather than against
 * the recorded workspace.
 */
export function getWindowBounds(): ViewportBounds {
  return {
    left: 0,
    top: 0,
    right: typeof window !== 'undefined' ? window.innerWidth : 0,
    bottom: typeof window !== 'undefined' ? window.innerHeight : 0,
  };
}

export function getGameViewportBounds(): ViewportBounds {
  const windowRect = getWindowBounds();

  if (typeof document === 'undefined') {
    return windowRect;
  }

  const frame = document.querySelector<HTMLElement>('.game-viewport-frame');
  if (!frame) {
    return windowRect;
  }

  const rect = frame.getBoundingClientRect();
  if (rect.width <= 0 || rect.height <= 0) {
    return windowRect;
  }

  const left = Math.max(rect.left, 0);
  const top = Math.max(rect.top, 0);
  const right = Math.min(rect.right, windowRect.right);
  const bottom = Math.min(rect.bottom, windowRect.bottom);

  // Return the window rather than a degenerate clamp zone that would place overlays at the origin.
  if (right <= left || bottom <= top) {
    return windowRect;
  }

  return { left, top, right, bottom };
}

export function getWorkspaceViewportBounds(): ViewportBounds {
  const surface = document.querySelector('.workspace-presentation-surface');
  const rect = surface?.getBoundingClientRect();
  if (!rect || rect.width <= 0 || rect.height <= 0) return getGameViewportBounds();
  return {
    left: Math.max(0, rect.left),
    top: Math.max(0, rect.top),
    right: Math.min(window.innerWidth, rect.right),
    bottom: Math.min(window.innerHeight, rect.bottom),
  };
}
