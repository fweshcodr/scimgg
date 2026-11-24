import type React from 'react';
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useReplayMenuState } from '../../contexts/ReplayFrameContext';
import { triggerGlobalClickAnimation } from '../../hooks/useClickAnimation';
import { REPLAY_CLICK_OWNERSHIP_PROPS } from '../../input/replayClickFeedback';
import { publishLiveReplayMenuState } from '../../input/replayMenuState';
import { dispatchTap, holdTouchPanBlock, isTouchPointer, TOUCH_SLOP_PX, watchTouchPress } from '../../input/touchHold';
import {
  getGameFrameRect,
  getGameViewportBounds,
  openMenuMappingFor,
  setOpenMenuMapping,
  toFrameLocalPoint,
} from '../../util/viewportBounds';
import { useTooltip, useTooltipScale } from '../Tooltip';
import { type ContextMenuEntry, getContextMenuColors } from './contextMenuTypes';
import { useContextMenu } from './useContextMenu';

const VIEWPORT_PADDING = 4;
const MOUSE_LEAVE_PADDING = 25;

/**
 * Auto-scroll of a tall touch menu while the finger that opened it rests within this distance
 * of the entry list's top or bottom edge. Provisional Scim values, not measured from the client.
 */
const AUTO_SCROLL_EDGE_PX = 24;
const AUTO_SCROLL_INTERVAL_MS = 16;
const AUTO_SCROLL_STEP_PX = 4;

interface ClientRectLike {
  readonly left: number;
  readonly right: number;
  readonly top: number;
  readonly bottom: number;
}

function pointIn(rect: ClientRectLike, x: number, y: number): boolean {
  return x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom;
}

/** The visible box of an entry list that scrolls, or null when every row is on screen. */
function scrollClip(list: HTMLElement | null): DOMRect | null {
  return list && list.scrollHeight > list.clientHeight ? list.getBoundingClientRect() : null;
}

/**
 * Scrolls `list` with the touch `pointerId` from `fromY` until it lifts, for a touch that began
 * on a tall menu's rows after it opened. Returns a function that stops early.
 */
function followListScroll(list: HTMLElement, pointerId: number, fromY: number, onRelease: () => void): () => void {
  let lastY = fromY;
  const onMove = (e: PointerEvent) => {
    if (e.pointerId !== pointerId) return;
    list.scrollTop -= e.clientY - lastY;
    lastY = e.clientY;
  };
  const onEnd = (e: PointerEvent) => {
    if (e.pointerId !== pointerId) return;
    stop();
    if (e.type === 'pointerup') onRelease();
  };
  function stop(): void {
    window.removeEventListener('pointermove', onMove, true);
    window.removeEventListener('pointerup', onEnd, true);
    window.removeEventListener('pointercancel', onEnd, true);
    window.removeEventListener('blur', stop);
  }
  window.addEventListener('pointermove', onMove, true);
  window.addEventListener('pointerup', onEnd, true);
  window.addEventListener('pointercancel', onEnd, true);
  window.addEventListener('blur', stop);
  return stop;
}

function applyPosition(node: HTMLDivElement, cursorX: number, cursorY: number, boundHeight: boolean) {
  const bounds = getGameViewportBounds();
  // A touch menu scrolls rather than run off screen; its entry list takes the shrink.
  node.style.maxHeight = boundHeight ? `${Math.max(0, bounds.bottom - bounds.top - 2 * VIEWPORT_PADDING)}px` : '';
  const w = node.offsetWidth;
  const h = node.offsetHeight;

  let x = cursorX - w / 2;
  let y = cursorY;

  if (x + w + VIEWPORT_PADDING > bounds.right) x = bounds.right - w - VIEWPORT_PADDING;
  if (x < bounds.left + VIEWPORT_PADDING) x = bounds.left + VIEWPORT_PADDING;
  if (y + h + VIEWPORT_PADDING > bounds.bottom) y = bounds.bottom - h - VIEWPORT_PADDING;
  if (y < bounds.top + VIEWPORT_PADDING) y = bounds.top + VIEWPORT_PADDING;

  node.style.left = `${x}px`;
  node.style.top = `${y}px`;
}

export const ContextMenuOverlay: React.FC = () => {
  const {
    content: liveContent,
    visible: liveVisible,
    menuX: liveMenuX,
    menuY: liveMenuY,
    hideContextMenu,
    onReplayCursorClick,
    swallowTouchCompatMouse,
    touchOpener: liveTouchOpener = null,
    isReplaying = false,
  } = useContextMenu();
  const touchOpener = isReplaying ? null : liveTouchOpener;
  const recordedMenu = useReplayMenuState();
  // Finger-sized rows for a menu a long-press opened, whatever the device, and for a recording
  // of one. Typography stays native.
  const touchRowHeight = isReplaying ? (recordedMenu?.rowHeight ?? null) : (touchOpener?.rowHeight ?? null);
  // Held in state, not read off the list, so a scroll re-renders and reaches the recording.
  const [listScrollTop, setListScrollTop] = useState(0);
  const content = isReplaying ? recordedMenu : liveContent;
  const visible = isReplaying ? recordedMenu !== null : liveVisible;
  const menuX = isReplaying ? (recordedMenu?.x ?? 0) : liveMenuX;
  const menuY = isReplaying ? (recordedMenu?.y ?? 0) : liveMenuY;
  const { hideTooltip } = useTooltip();
  const [replayFrame, setReplayFrame] = useState<HTMLElement | null>(null);
  const rawScale = useTooltipScale();
  // Dampen context menu scaling: grows at 40% of the UI scale rate, then 85% base reduction
  const scale = isReplaying ? (recordedMenu?.scale ?? 1) : (1 + (rawScale - 1) * 0.4) * 0.85;
  const menuRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const submenuRef = useRef<HTMLDivElement>(null);
  const overlayRef = useRef<HTMLDivElement>(null);
  const [liveHoveredIndex, setHoveredIndex] = useState(-1);
  const [liveSubmenuParentIndex, setSubmenuParentIndex] = useState(-1);
  const [liveHoveredSubmenuIndex, setHoveredSubmenuIndex] = useState(-1);
  const hoveredIndex = isReplaying ? (recordedMenu?.hoveredIndex ?? -1) : liveHoveredIndex;
  const submenuParentIndex = isReplaying ? (recordedMenu?.submenuParentIndex ?? -1) : liveSubmenuParentIndex;
  const hoveredSubmenuIndex = isReplaying ? (recordedMenu?.hoveredSubmenuIndex ?? -1) : liveHoveredSubmenuIndex;
  const hoveredIndexRef = useRef(-1);
  const submenuParentIndexRef = useRef(-1);
  const hoveredSubmenuIndexRef = useRef(-1);

  // Keep a ref to content so window-level event handlers can read current entries
  // without being in the effect dependency array.
  const contentRef = useRef(liveContent);
  contentRef.current = liveContent;

  const refCallback = useCallback((node: HTMLDivElement | null) => {
    menuRef.current = node;
  }, []);

  useLayoutEffect(() => {
    if (isReplaying || !visible || !menuRef.current) return;
    applyPosition(menuRef.current, menuX, menuY, touchOpener !== null);
    setListScrollTop(0);
    hoveredIndexRef.current = -1;
    submenuParentIndexRef.current = -1;
    hoveredSubmenuIndexRef.current = -1;
    setHoveredIndex(-1);
    setSubmenuParentIndex(-1);
    setHoveredSubmenuIndex(-1);
  }, [visible, menuX, menuY, isReplaying, touchOpener]);

  const getMenuEntryIndexAt = useCallback((clientX: number, clientY: number): number => {
    const el = menuRef.current;
    if (!el) return -1;
    // A row scrolled out of view still has a box, above or below the visible list.
    const clip = scrollClip(listRef.current);
    if (clip && !pointIn(clip, clientX, clientY)) return -1;
    const items = el.querySelectorAll<HTMLElement>('[role="menuitem"]');
    for (let i = 0; i < items.length; i++) {
      const rect = items[i].getBoundingClientRect();
      if (clientX >= rect.left && clientX <= rect.right && clientY >= rect.top && clientY <= rect.bottom) {
        return i;
      }
    }
    return -1;
  }, []);

  const getSubmenuEntryIndexAt = useCallback((clientX: number, clientY: number): number => {
    const el = submenuRef.current;
    if (!el) return -1;
    const items = el.querySelectorAll<HTMLElement>('[data-submenu-index]');
    for (let i = 0; i < items.length; i++) {
      const rect = items[i].getBoundingClientRect();
      if (clientX >= rect.left && clientX <= rect.right && clientY >= rect.top && clientY <= rect.bottom) {
        const idx = parseInt(items[i].getAttribute('data-submenu-index')!, 10);
        return Number.isNaN(idx) ? -1 : idx;
      }
    }
    return -1;
  }, []);

  const getTrackedRect = useCallback((): DOMRect | null => {
    const menuEl = menuRef.current;
    if (!menuEl) return null;
    const menuRect = menuEl.getBoundingClientRect();
    const submenuEl = submenuRef.current;
    if (!submenuEl || submenuParentIndexRef.current < 0) {
      return menuRect;
    }
    const submenuRect = submenuEl.getBoundingClientRect();
    const left = Math.min(menuRect.left, submenuRect.left);
    const top = Math.min(menuRect.top, submenuRect.top);
    const right = Math.max(menuRect.right, submenuRect.right);
    const bottom = Math.max(menuRect.bottom, submenuRect.bottom);
    return new DOMRect(left, top, right - left, bottom - top);
  }, []);

  /** Over the open submenu: on one of its entries, or anywhere in its box. */
  const isOverOpenSubmenu = useCallback(
    (clientX: number, clientY: number): boolean => {
      if (submenuParentIndexRef.current < 0) return false;
      if (getSubmenuEntryIndexAt(clientX, clientY) >= 0) return true;
      const submenuEl = submenuRef.current;
      return submenuEl !== null && pointIn(submenuEl.getBoundingClientRect(), clientX, clientY);
    },
    [getSubmenuEntryIndexAt],
  );

  const openSubmenu = useCallback((parentIndex: number) => {
    if (parentIndex === submenuParentIndexRef.current) return;
    submenuParentIndexRef.current = parentIndex;
    hoveredSubmenuIndexRef.current = -1;
    setSubmenuParentIndex(parentIndex);
    setHoveredSubmenuIndex(-1);
  }, []);

  const setHover = useCallback((menuIndex: number, submenuIndex: number) => {
    if (menuIndex !== hoveredIndexRef.current) {
      hoveredIndexRef.current = menuIndex;
      setHoveredIndex(menuIndex);
    }
    if (submenuIndex !== hoveredSubmenuIndexRef.current) {
      hoveredSubmenuIndexRef.current = submenuIndex;
      setHoveredSubmenuIndex(submenuIndex);
    }
  }, []);

  /**
   * Highlights what is under the pointer and opens or keeps the submenu, for the mouse and for
   * the finger sliding from a long-press alike. Where a submenu overlaps its parent menu (one
   * clamped back over it at a screen edge), the submenu is on top.
   */
  const trackPointer = useCallback(
    (clientX: number, clientY: number) => {
      const entries = contentRef.current?.entries ?? [];
      const submenuIndex = getSubmenuEntryIndexAt(clientX, clientY);
      const menuIndex = isOverOpenSubmenu(clientX, clientY) ? -1 : getMenuEntryIndexAt(clientX, clientY);
      if (menuIndex >= 0 && entries[menuIndex]?.submenu && entries[menuIndex].submenu!.length > 0) {
        openSubmenu(menuIndex);
      } else if (menuIndex >= 0) {
        openSubmenu(-1);
      }
      // Otherwise (in the submenu, or in the gap between parent & submenu) — keep current state
      setHover(menuIndex, submenuIndex);
    },
    [getMenuEntryIndexAt, getSubmenuEntryIndexAt, isOverOpenSubmenu, openSubmenu, setHover],
  );

  /** Runs a chosen entry; the caller closes the menu. */
  const activateEntry = useCallback(
    (entry: ContextMenuEntry, clientX: number, clientY: number, timeStamp: number) => {
      if (entry.clickType) {
        triggerGlobalClickAnimation(clientX, clientY, entry.clickType);
        onReplayCursorClick?.(clientX, clientY, entry.clickType, timeStamp);
      }
      entry.onClick?.();
    },
    [onReplayCursorClick],
  );

  useLayoutEffect(() => {
    if (isReplaying || !visible || submenuParentIndex < 0) return;
    const menuEl = menuRef.current;
    const submenuEl = submenuRef.current;
    const entries = content?.entries;
    if (!menuEl || !submenuEl || !entries) return;
    const parentEntry = entries[submenuParentIndex];
    if (!parentEntry?.submenu || parentEntry.submenu.length === 0) return;

    const items = menuEl.querySelectorAll<HTMLElement>('[role="menuitem"]');
    const parentItem = items[submenuParentIndex];
    if (!parentItem) return;

    const bounds = getGameViewportBounds();
    const parentMenuRect = menuEl.getBoundingClientRect();
    const parentItemRect = parentItem.getBoundingClientRect();
    const submenuWidth = submenuEl.offsetWidth;
    const submenuHeight = submenuEl.offsetHeight;

    // Offset so the first selectable entry (not the header) aligns with the parent item
    const submenuFirstItem = submenuEl.querySelector<HTMLElement>('[role="menuitem"], [data-submenu-index]');
    const headerOffset = submenuFirstItem ? submenuFirstItem.offsetTop : 0;
    let x = parentMenuRect.right - 1;
    let y = parentItemRect.top - headerOffset;
    if (x + submenuWidth + VIEWPORT_PADDING > bounds.right) {
      x = parentMenuRect.left - submenuWidth + 1;
    }
    if (x < bounds.left + VIEWPORT_PADDING) x = bounds.left + VIEWPORT_PADDING;
    if (x + submenuWidth + VIEWPORT_PADDING > bounds.right) x = bounds.right - submenuWidth - VIEWPORT_PADDING;
    if (y < bounds.top + VIEWPORT_PADDING) y = bounds.top + VIEWPORT_PADDING;
    if (y + submenuHeight + VIEWPORT_PADDING > bounds.bottom) y = bounds.bottom - submenuHeight - VIEWPORT_PADDING;

    submenuEl.style.left = `${x}px`;
    submenuEl.style.top = `${y}px`;
  }, [visible, submenuParentIndex, content, isReplaying]);

  // Keyed on the recorded menu opening, not on every render while it stays open: the
  // viewer's own hover tooltip (replay bar, panels) must survive parent re-renders.
  const recordedMenuOpen = isReplaying && recordedMenu !== null;
  useLayoutEffect(() => {
    if (recordedMenuOpen) hideTooltip();
  }, [recordedMenuOpen, hideTooltip]);

  useLayoutEffect(() => {
    if (isReplaying) {
      setOpenMenuMapping(null);
      publishLiveReplayMenuState(null);
      const frame = document.querySelector<HTMLElement>('.game-viewport-frame');
      if (frame !== replayFrame) setReplayFrame(frame);
      return;
    }
    if (!liveVisible || !liveContent || liveContent.entries.length === 0) {
      setOpenMenuMapping(null);
      publishLiveReplayMenuState(null);
      return;
    }
    const liveFrame = getGameFrameRect();
    const menu = menuRef.current;
    if (!liveFrame || !menu) {
      setOpenMenuMapping(null);
      return;
    }
    const rect = menu.getBoundingClientRect();
    const submenuRect = liveSubmenuParentIndex >= 0 ? submenuRef.current?.getBoundingClientRect() : undefined;
    // Under Stretch to Window the menu is drawn unstretched over a stretched frame: it is recorded
    // moved rigidly, and the cursor samples and clicks over it are recorded with the same mapping
    // (see OpenMenuMapping), so a recorded pick lands on the recorded row. It stays set until the
    // menu closes, which is after the pick's click has been recorded.
    const mapping = openMenuMappingFor(liveFrame, rect, submenuRect);
    setOpenMenuMapping(mapping);
    const frame = mapping ? { ...liveFrame, openMenu: mapping } : liveFrame;
    const menuAt = toFrameLocalPoint({ clientX: rect.left, clientY: rect.top }, frame);
    const submenuAt = submenuRect
      ? toFrameLocalPoint({ clientX: submenuRect.left, clientY: submenuRect.top }, frame)
      : null;
    publishLiveReplayMenuState({
      entries: liveContent.entries,
      x: menuAt.x,
      y: menuAt.y,
      scale,
      hoveredIndex: liveHoveredIndex,
      submenuParentIndex: liveSubmenuParentIndex,
      hoveredSubmenuIndex: liveHoveredSubmenuIndex,
      submenuPosition: submenuAt,
      ...(touchRowHeight === null ? {} : { rowHeight: touchRowHeight, scrollTop: listScrollTop }),
    });
  });

  // A recorded touch menu is bounded and scrolled as it was live (see applyPosition), against
  // the recorded frame it was bounded in, so its rows sit where the recorded finger was.
  useLayoutEffect(() => {
    if (!isReplaying) return;
    const menu = menuRef.current;
    if (!menu) return;
    const rowHeight = recordedMenu?.rowHeight;
    menu.style.maxHeight =
      rowHeight !== undefined && replayFrame ? `${Math.max(0, replayFrame.clientHeight - 2 * VIEWPORT_PADDING)}px` : '';
    if (listRef.current) listRef.current.scrollTop = recordedMenu?.scrollTop ?? 0;
  }, [isReplaying, recordedMenu, replayFrame]);

  useEffect(
    () => () => {
      setOpenMenuMapping(null);
      publishLiveReplayMenuState(null);
    },
    [],
  );

  useEffect(() => {
    if (isReplaying || !visible) return;

    // Pointer events, to tell a mouse from a hovering touch pointer, whose compatibility
    // mousemoves would highlight rows and close the menu. A held touch's slide is handled below.
    const handlePointerMove = (e: PointerEvent) => {
      if (isTouchPointer(e)) return;
      const rect = getTrackedRect();
      if (!rect) return;
      const dx = Math.max(rect.left - e.clientX, e.clientX - rect.right, 0);
      const dy = Math.max(rect.top - e.clientY, e.clientY - rect.bottom, 0);
      if (Math.sqrt(dx * dx + dy * dy) > MOUSE_LEAVE_PADDING) {
        hideContextMenu();
        return;
      }
      trackPointer(e.clientX, e.clientY);
    };

    // Left-click handling in capture phase so it fires before any other handler.
    // The click is always consumed (matching OSRS: left-click with menu open never
    // performs the underlying action like walking).
    const handleMouseDown = (e: MouseEvent) => {
      if (e.button !== 0) return;

      const entries = contentRef.current?.entries;
      if (entries) {
        const submenuParent = submenuParentIndexRef.current;
        const subIdx = getSubmenuEntryIndexAt(e.clientX, e.clientY);
        if (submenuParent >= 0 && subIdx >= 0) {
          const subEntry = entries[submenuParent]?.submenu?.[subIdx];
          if (subEntry && !subEntry.disabled) activateEntry(subEntry, e.clientX, e.clientY, e.timeStamp);
        } else if (!isOverOpenSubmenu(e.clientX, e.clientY)) {
          // The submenu's header and padding pick nothing, rather than the parent row they cover.
          const idx = getMenuEntryIndexAt(e.clientX, e.clientY);
          if (idx >= 0) {
            const entry = entries[idx];
            if (!entry.disabled) activateEntry(entry, e.clientX, e.clientY, e.timeStamp);
          }
        }
      }

      e.stopPropagation();
      e.preventDefault();
      hideContextMenu();
    };

    // When the window loses focus — e.g. Firefox opens its native context menu on
    // Shift+right-click (which no page JS can suppress), or the user alt-tabs —
    // dismiss our in-game menu so it can't linger stuck behind the browser's menu.
    const handleWindowBlur = () => {
      hideContextMenu();
    };

    // A touch pointer (see `isTouchPointer`): a tap on the overlay, which covers the viewport, is
    // sent as the left click that picks an entry or dismisses (see `dispatchTap`). Only touches
    // that begin with the menu open; the long-press that opened it is handled by the slide below.
    let stopTouch = () => {};
    const handleTouchDown = (e: PointerEvent) => {
      if (!isTouchPointer(e) || !e.isPrimary) return;
      const { target, clientX, clientY, pointerId } = e;
      if (!(target instanceof Node) || !overlayRef.current?.contains(target)) return;
      e.preventDefault();
      stopTouch();
      const list = listRef.current;
      const clip = scrollClip(list);
      const scrollsList = list !== null && clip !== null && pointIn(clip, clientX, clientY);
      stopTouch = watchTouchPress(e, {
        onTap: (up) => {
          // A tap on a submenu's parent opens the submenu, as hovering does with a mouse.
          const idx = isOverOpenSubmenu(clientX, clientY) ? -1 : getMenuEntryIndexAt(clientX, clientY);
          const submenu = idx >= 0 ? contentRef.current?.entries[idx]?.submenu : undefined;
          if (submenu && submenu.length > 0) {
            openSubmenu(idx);
            setHover(idx, -1);
            swallowTouchCompatMouse();
            return;
          }
          const at = target instanceof Element && target.isConnected ? target : document.body;
          dispatchTap(at, clientX, clientY, up, ['mousedown', 'mouseup']);
          // The menu has closed; the browser's click must not land on what was under it.
          swallowTouchCompatMouse();
        },
        // Past the slop, a touch on a tall menu's entries scrolls them, and picks nothing.
        onTravel: scrollsList
          ? (move) => {
              stopTouch = followListScroll(list, pointerId, move.clientY, swallowTouchCompatMouse);
            }
          : undefined,
      });
    };

    window.addEventListener('pointermove', handlePointerMove);
    window.addEventListener('mousedown', handleMouseDown, true);
    window.addEventListener('blur', handleWindowBlur);
    // A rotation moves everything the menu was opened over, so it closes like on blur.
    window.addEventListener('orientationchange', handleWindowBlur);
    window.addEventListener('pointerdown', handleTouchDown, true);
    return () => {
      stopTouch();
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('mousedown', handleMouseDown, true);
      window.removeEventListener('blur', handleWindowBlur);
      window.removeEventListener('orientationchange', handleWindowBlur);
      window.removeEventListener('pointerdown', handleTouchDown, true);
    };
  }, [
    visible,
    hideContextMenu,
    getMenuEntryIndexAt,
    getSubmenuEntryIndexAt,
    getTrackedRect,
    trackPointer,
    isOverOpenSubmenu,
    openSubmenu,
    setHover,
    activateEntry,
    swallowTouchCompatMouse,
    isReplaying,
  ]);

  // Read through a ref by the slide below, so a new callback identity mid-gesture cannot
  // restart the slide and forget that the finger had already moved.
  const slideActionsRef = useRef({ activateEntry, hideContextMenu, swallowTouchCompatMouse });
  slideActionsRef.current = { activateEntry, hideContextMenu, swallowTouchCompatMouse };

  // The long-press that opened the menu keeps its finger: the hold watcher hands it over (see
  // `takeHeldTouch`), and the menu owns its slide and release from there. Its events still
  // reach the element the touch began on, which forgot it at the hold, so they are read in
  // window capture and left to propagate.
  //
  // Until the finger moves past the tap slop, its release only lifts it, leaving the menu open
  // to be tapped. Once it has moved, the release picks what is under it, or dismisses the menu
  // when that is outside it. A cancel, a second finger, losing focus, or closing the menu ends
  // the slide without picking anything.
  useEffect(() => {
    if (!visible || !touchOpener) return;
    const { pointerId, clientX: originX, clientY: originY } = touchOpener;
    const releasePanBlock = holdTouchPanBlock();
    let armed = false;
    let lastX = originX;
    let lastY = originY;
    let autoScrollTimer: ReturnType<typeof setInterval> | undefined;

    const clearHover = () => setHover(-1, -1);

    /** -1 or 1 while the finger rests at the scrolling list's top or bottom edge, else 0. */
    const autoScrollDirection = (): number => {
      const clip = scrollClip(listRef.current);
      if (!clip || isOverOpenSubmenu(lastX, lastY) || lastX < clip.left || lastX > clip.right) return 0;
      // On a short list the two edges must not meet, or the middle would scroll too.
      const edge = Math.min(AUTO_SCROLL_EDGE_PX, clip.height / 4);
      if (Math.abs(lastY - clip.top) <= edge) return -1;
      if (Math.abs(lastY - clip.bottom) <= edge) return 1;
      return 0;
    };
    const stopAutoScroll = () => {
      clearInterval(autoScrollTimer);
      autoScrollTimer = undefined;
    };
    const stepAutoScroll = () => {
      const direction = autoScrollDirection();
      const list = listRef.current;
      if (direction === 0 || !list) {
        stopAutoScroll();
        return;
      }
      list.scrollTop += direction * AUTO_SCROLL_STEP_PX;
      // The rows moved under a still finger.
      trackPointer(lastX, lastY);
    };

    const pick = (up: PointerEvent) => {
      const { clientX: x, clientY: y } = up;
      const { activateEntry: activate, hideContextMenu: hide } = slideActionsRef.current;
      const entries = contentRef.current?.entries ?? [];
      if (isOverOpenSubmenu(x, y)) {
        const subEntry = entries[submenuParentIndexRef.current]?.submenu?.[getSubmenuEntryIndexAt(x, y)];
        if (subEntry && !subEntry.disabled) {
          activate(subEntry, x, y, up.timeStamp);
          hide();
        }
        return;
      }
      const entry = entries[getMenuEntryIndexAt(x, y)];
      if (entry) {
        // A submenu's parent only opens it, which the slide onto it already did.
        if (!entry.disabled && !(entry.submenu && entry.submenu.length > 0)) {
          activate(entry, x, y, up.timeStamp);
          hide();
        }
        return;
      }
      // The menu's own chrome (its header, the edges around its rows) is not a choice either.
      const menuEl = menuRef.current;
      if (menuEl && pointIn(menuEl.getBoundingClientRect(), x, y)) return;
      hide();
    };

    const onMove = (e: PointerEvent) => {
      if (e.pointerId !== pointerId) return;
      lastX = e.clientX;
      lastY = e.clientY;
      if (!armed) {
        if (Math.hypot(lastX - originX, lastY - originY) < TOUCH_SLOP_PX) return;
        armed = true;
      }
      trackPointer(lastX, lastY);
      if (autoScrollDirection() === 0) stopAutoScroll();
      else if (autoScrollTimer === undefined) autoScrollTimer = setInterval(stepAutoScroll, AUTO_SCROLL_INTERVAL_MS);
    };
    const onUp = (e: PointerEvent) => {
      if (e.pointerId !== pointerId) return;
      end();
      // Whatever the release does, the browser's click for it must not land as well.
      slideActionsRef.current.swallowTouchCompatMouse();
      if (armed) pick(e);
      else clearHover();
    };
    const abandon = () => {
      end();
      clearHover();
    };
    const onCancel = (e: PointerEvent) => {
      if (e.pointerId === pointerId) abandon();
    };

    function end(): void {
      stopAutoScroll();
      releasePanBlock();
      window.removeEventListener('pointermove', onMove, true);
      window.removeEventListener('pointerup', onUp, true);
      window.removeEventListener('pointercancel', onCancel, true);
      // Any new touch: a second finger, or (should the release have been missed) the next one.
      window.removeEventListener('pointerdown', abandon, true);
    }

    window.addEventListener('pointermove', onMove, true);
    window.addEventListener('pointerup', onUp, true);
    window.addEventListener('pointercancel', onCancel, true);
    window.addEventListener('pointerdown', abandon, true);
    return end;
  }, [visible, touchOpener, trackPointer, isOverOpenSubmenu, getMenuEntryIndexAt, getSubmenuEntryIndexAt, setHover]);

  if (!visible || !content || content.entries.length === 0 || (isReplaying && !replayFrame)) {
    return null;
  }

  const colors = getContextMenuColors();

  const submenuEntries = submenuParentIndex >= 0 ? (content.entries[submenuParentIndex]?.submenu ?? null) : null;

  return createPortal(
    <div
      ref={overlayRef}
      {...REPLAY_CLICK_OWNERSHIP_PROPS.explicit}
      role="dialog"
      aria-label={isReplaying ? 'Recorded context menu' : undefined}
      onContextMenu={(e) => e.preventDefault()}
      style={{
        // Live, a fixed `inset: 0` tracks the visible viewport, which `100vh` overshoots
        // behind iOS Safari's toolbar. A replay fills its frame.
        position: isReplaying ? 'absolute' : 'fixed',
        inset: 0,
        zIndex: 100000,
        pointerEvents: isReplaying ? 'none' : 'auto',
        // Touches on the menu are the page's: taps pick, drags scroll the rows (see handleTouchDown).
        touchAction: isReplaying ? undefined : 'none',
      }}
    >
      <div
        ref={refCallback}
        role="menu"
        /* Reproduced OSRS chrome, driven by the pointer alone: its rows take no focus
           (docs/agent-reference.md, Keyboard and focus policy). */
        className="panel-surface"
        style={{
          position: 'absolute',
          left: menuX,
          top: menuY,
          pointerEvents: 'none',
          backgroundColor: colors.background,
          border: `1px solid ${colors.border}`,
          boxShadow: '0 2px 8px rgba(0, 0, 0, 0.5)',
          backdropFilter: 'blur(8px)',
          WebkitBackdropFilter: 'blur(8px)',
          padding: '2px',
          display: 'flex',
          flexDirection: 'column',
          whiteSpace: 'nowrap',
          userSelect: 'none',
          WebkitFontSmoothing: 'none',
          MozOsxFontSmoothing: 'grayscale',
        }}
      >
        <div
          style={{
            padding: '3px 6px',
            fontFamily: '"RuneScape Bold 12", sans-serif',
            fontSize: `${Math.round(18 * scale)}px`,
            color: colors.headerText,
            backgroundColor: 'rgba(0, 0, 0, 0.2)',
            textShadow: '1px 1px 0 rgba(0, 0, 0, 0.7)',
            lineHeight: `${Math.round(15 * scale)}px`,
            textAlign: 'center',
            flexShrink: touchRowHeight === null ? undefined : 0,
          }}
        >
          Choose Option
        </div>

        <div
          style={{
            height: 1,
            backgroundColor: colors.separator,
            margin: '0 2px',
            flexShrink: touchRowHeight === null ? undefined : 0,
          }}
        />

        <div
          ref={listRef}
          data-menu-entries=""
          onScroll={
            isReplaying || touchRowHeight === null
              ? undefined
              : (e) => setListScrollTop(Math.max(0, e.currentTarget.scrollTop))
          }
          style={{
            display: 'flex',
            flexDirection: 'column',
            // A touch menu is held to the viewport (see applyPosition), and only its rows scroll.
            ...(touchRowHeight === null
              ? {}
              : {
                  flex: '1 1 auto',
                  minHeight: 0,
                  overflowY: 'auto',
                  overscrollBehavior: 'contain',
                  backgroundColor: colors.background,
                }),
          }}
        >
          {content.entries.map((entry, i) => {
            const isHovered = hoveredIndex === i;
            const isDisabled = entry.disabled;

            return (
              /* biome-ignore lint/a11y/useFocusableInteractive: pointer-only game chrome; rows take no focus (Keyboard and focus policy). */
              <div
                key={`${entry.action}:${entry.target ?? ''}:${entry.targetColor ?? ''}:${entry.clickType ?? ''}:${entry.disabled ? 'disabled' : 'enabled'}`}
                role="menuitem"
                style={{
                  padding: entry.submenu && entry.submenu.length > 0 ? '2px 16px 2px 4px' : '2px 4px',
                  cursor: 'default',
                  backgroundColor: isHovered && !isDisabled ? colors.backgroundHover : 'transparent',
                  display: 'flex',
                  alignItems: 'center',
                  lineHeight: `${Math.round(14 * scale)}px`,
                  position: 'relative',
                  ...(touchRowHeight === null
                    ? {}
                    : { minHeight: touchRowHeight, boxSizing: 'border-box', flexShrink: 0 }),
                }}
              >
                <span
                  style={{
                    fontFamily: '"RuneScape Bold 12", sans-serif',
                    fontSize: `${Math.round(18 * scale)}px`,
                    color: isDisabled ? colors.disabled : colors.action,
                    textShadow: '1px 1px 0 rgba(0, 0, 0, 0.7)',
                  }}
                >
                  {entry.action}
                </span>
                {entry.target && (
                  <span
                    style={{
                      fontFamily: '"RuneScape Bold 12", sans-serif',
                      fontSize: `${Math.round(18 * scale)}px`,
                      color: isDisabled ? colors.disabled : (entry.targetColor ?? colors.target),
                      textShadow: '1px 1px 0 rgba(0, 0, 0, 0.7)',
                      marginLeft: `${Math.round(4 * scale)}px`,
                    }}
                  >
                    {entry.target}
                  </span>
                )}
                {entry.submenu && entry.submenu.length > 0 && (
                  <span
                    style={{
                      position: 'absolute',
                      right: 6,
                      top: '50%',
                      transform: 'translateY(-50%)',
                      width: 0,
                      height: 0,
                      borderTop: '3px solid transparent',
                      borderBottom: '3px solid transparent',
                      borderLeft: `4px solid ${isDisabled ? colors.disabled : colors.action}`,
                      filter: 'drop-shadow(1px 1px 0px #000)',
                    }}
                  />
                )}
              </div>
            );
          })}
        </div>
      </div>

      {submenuEntries && submenuEntries.length > 0 && (
        <div
          ref={submenuRef}
          role="menu"
          /* Same contract as the parent menu above. */
          className="panel-surface"
          style={{
            position: 'absolute',
            left: isReplaying ? recordedMenu?.submenuPosition?.x : menuX,
            top: isReplaying ? recordedMenu?.submenuPosition?.y : menuY,
            pointerEvents: 'none',
            backgroundColor: colors.background,
            border: `1px solid ${colors.border}`,
            boxShadow: '0 2px 8px rgba(0, 0, 0, 0.5)',
            backdropFilter: 'blur(8px)',
            WebkitBackdropFilter: 'blur(8px)',
            padding: '2px',
            display: 'flex',
            flexDirection: 'column',
            whiteSpace: 'nowrap',
            userSelect: 'none',
            WebkitFontSmoothing: 'none',
            MozOsxFontSmoothing: 'grayscale',
          }}
        >
          {(() => {
            const parentEntry = content.entries[submenuParentIndex];
            const headerText = parentEntry?.target ?? 'Choose Option';
            return (
              <>
                <div
                  style={{
                    padding: '3px 4px 1px 4px',
                    fontFamily: '"RuneScape Bold 12", sans-serif',
                    fontSize: `${Math.round(18 * scale)}px`,
                    color: colors.headerText,
                    backgroundColor: colors.headerBackground,
                    textShadow: '1px 1px 0 #000',
                    lineHeight: `${Math.round(15 * scale)}px`,
                    textAlign: 'center',
                  }}
                >
                  {headerText}
                </div>
                <div style={{ height: 1, backgroundColor: colors.separator, margin: '0' }} />
              </>
            );
          })()}
          {(() => {
            const elements: React.ReactNode[] = [];
            let currentTextEntry: ContextMenuEntry | null = null;
            let currentTextEntryIndex = -1;
            let currentSwatches: { entry: ContextMenuEntry; i: number }[] = [];

            // Shared swatch chip — used by both the NPC-highlight palette rows
            // and the inventory-tag palette row so they share one visual language.
            const renderSwatch = (entry: ContextMenuEntry, i: number) => {
              const isSwatchHovered = hoveredSubmenuIndex === i;
              const isActive = entry.target === 'active';
              const size = Math.round(15 * scale);
              return (
                /* biome-ignore lint/a11y/useFocusableInteractive: pointer-only game chrome; rows take no focus (Keyboard and focus policy). */
                <div
                  key={`swatch-${entry.targetColor}-${i}`}
                  role="menuitem"
                  data-submenu-index={i}
                  style={{
                    cursor: 'default',
                    backgroundColor: entry.targetColor,
                    width: `${size}px`,
                    height: `${size}px`,
                    boxSizing: 'border-box',
                    borderRadius: '2px',
                    border: isActive
                      ? '1px solid var(--color-primary)'
                      : isSwatchHovered
                        ? '1px solid var(--color-primary-structure)'
                        : '1px solid var(--color-border)',
                    boxShadow: isActive ? '0 0 0 1px var(--color-primary)' : 'none',
                    transition: 'border-color 0.15s ease',
                  }}
                />
              );
            };

            const flushSection = () => {
              if (!currentTextEntry && currentSwatches.length === 0) return;

              if (currentTextEntry) {
                // Text entry + optional swatches (e.g. NPC highlights: "Color Name" [swatches])
                const isHovered = hoveredSubmenuIndex === currentTextEntryIndex;
                const isDisabled = currentTextEntry.disabled;

                elements.push(
                  <div
                    key={`section-${currentTextEntryIndex}`}
                    style={{ display: 'flex', alignItems: 'center', width: '100%' }}
                  >
                    {/* biome-ignore lint/a11y/useFocusableInteractive: pointer-only game chrome; rows take no focus (Keyboard and focus policy). */}
                    <div
                      role="menuitem"
                      data-submenu-index={currentTextEntryIndex}
                      style={{
                        flex: 1,
                        padding: '2px 4px',
                        cursor: 'default',
                        backgroundColor: isHovered && !isDisabled ? colors.backgroundHover : 'transparent',
                        display: 'flex',
                        alignItems: 'center',
                        lineHeight: `${Math.round(14 * scale)}px`,
                        ...(touchRowHeight === null ? {} : { minHeight: touchRowHeight, boxSizing: 'border-box' }),
                      }}
                    >
                      <span
                        style={{
                          fontFamily: '"RuneScape Bold 12", sans-serif',
                          fontSize: `${Math.round(18 * scale)}px`,
                          color: isDisabled ? colors.disabled : colors.action,
                          textShadow: '1px 1px 0 rgba(0, 0, 0, 0.7)',
                        }}
                      >
                        {currentTextEntry.action}
                      </span>
                      {currentTextEntry.target && (
                        <span
                          style={{
                            fontFamily: '"RuneScape Bold 12", sans-serif',
                            fontSize: `${Math.round(18 * scale)}px`,
                            color: isDisabled ? colors.disabled : (currentTextEntry.targetColor ?? colors.target),
                            textShadow: '1px 1px 0 rgba(0, 0, 0, 0.7)',
                            marginLeft: `${Math.round(4 * scale)}px`,
                            marginRight: currentSwatches.length > 0 ? `${Math.round(8 * scale)}px` : 0,
                          }}
                        >
                          {currentTextEntry.target}
                        </span>
                      )}
                    </div>
                    {currentSwatches.length > 0 && (
                      <div
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: `${Math.round(5 * scale)}px`,
                          paddingRight: `${Math.round(4 * scale)}px`,
                        }}
                      >
                        {currentSwatches.map(({ entry, i }) => renderSwatch(entry, i))}
                      </div>
                    )}
                  </div>,
                );
              } else {
                // Swatch-only row (e.g. inventory tags: just color squares)
                elements.push(
                  <div
                    key={`swatches-${currentSwatches[0]?.i}`}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: `${Math.round(5 * scale)}px`,
                      padding: `${Math.round(2 * scale)}px ${Math.round(4 * scale)}px`,
                    }}
                  >
                    {currentSwatches.map(({ entry, i }) => renderSwatch(entry, i))}
                  </div>,
                );
              }
            };

            submenuEntries.forEach((entry, i) => {
              if (entry.action === 'swatch') {
                currentSwatches.push({ entry, i });
              } else {
                flushSection();
                currentTextEntry = entry;
                currentTextEntryIndex = i;
                currentSwatches = [];
              }
            });
            flushSection();

            return elements;
          })()}
        </div>
      )}
    </div>,
    isReplaying && replayFrame ? replayFrame : document.body,
  );
};
