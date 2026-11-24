import type React from 'react';
import { type ReactNode, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useReplayFrameStore } from '../../contexts/ReplayFrameContext';
import { isSyntheticInput, runSyntheticInput } from '../../input/inputProvenance';
import { isTouchPointer } from '../../input/touchHold';
import { getReplayPointerTarget, getWorkspaceViewportBounds, toElementLocalPoint } from '../../util/viewportBounds';
import {
  TooltipAPIContext,
  type TooltipContent,
  TooltipDisplayContext,
  type TooltipInput,
  TooltipScaleContext,
  TooltipScaleLockedContext,
} from './tooltipTypes';

const CURSOR_OFFSET = 24;
const VIEWPORT_PADDING = 4;
const TOOLTIP_BOUND_ATTR = 'data-tooltip-bound';
const TOOLTIP_BOUND_VALUE = 'true';
const ACTION_VALIDATION_FRAMES = 4;

/**
 * How long a tap tooltip stays up on the mobile client: 240 client cycles, re-armed by each
 * tap, after which it removes itself. A client cycle is 20 ms (RuneLite `Constants.CLIENT_TICK_LENGTH`), so 4.8 s.
 */
export const MOBILE_TAP_TOOLTIP_MS = 240 * 20;

/**
 * `leftOfCursor` is the mobile client's placement for a tap tooltip: beside the finger,
 * not under it, so the finger does not cover it: at `max(x - width, 0)` on mobile, at `x`
 * everywhere else. Both drop it 24 px lower.
 */
function clampAndApply(el: HTMLElement, mx: number, my: number, leftOfCursor = false): void {
  const frame = el.parentElement?.matches('.game-viewport-frame, .workspace-presentation-surface')
    ? el.parentElement
    : null;
  const clientBounds = frame
    ? getWorkspaceViewportBounds()
    : { left: 0, top: 0, right: window.innerWidth, bottom: window.innerHeight };
  const cursor = frame ? toElementLocalPoint(frame, mx, my) : { x: mx, y: my };
  const topLeft = frame
    ? toElementLocalPoint(frame, clientBounds.left, clientBounds.top)
    : { x: clientBounds.left, y: clientBounds.top };
  const bottomRight = frame
    ? toElementLocalPoint(frame, clientBounds.right, clientBounds.bottom)
    : { x: clientBounds.right, y: clientBounds.bottom };
  const bounds = { left: topLeft.x, top: topLeft.y, right: bottomRight.x, bottom: bottomRight.y };
  const w = el.offsetWidth;
  const h = el.offsetHeight;

  let x = leftOfCursor ? cursor.x - w : cursor.x;
  let y = cursor.y + CURSOR_OFFSET;

  if (x + w + VIEWPORT_PADDING > bounds.right) x = bounds.right - w - VIEWPORT_PADDING;
  if (x < bounds.left + VIEWPORT_PADDING) x = bounds.left + VIEWPORT_PADDING;
  if (y + h + VIEWPORT_PADDING > bounds.bottom) y = cursor.y - h - VIEWPORT_PADDING;
  if (y < bounds.top + VIEWPORT_PADDING) y = bounds.top + VIEWPORT_PADDING;

  el.style.left = `${x}px`;
  el.style.top = `${y}px`;
}

export const TooltipProvider: React.FC<{
  children: ReactNode;
  initialScale?: number;
  /**
   * Pins the UI scale, ignoring both `initialScale` and any `setScale` call.
   *
   * Fixed layout uses this: its chrome is laid out from cache coordinates and
   * scaled by one frame-wide stretch factor, so a panel that could also be
   * resized by Alt+wheel would drift off the frame it is pinned to. Every
   * consumer of `useTooltipScale` — panel chrome, inventory drag math, the
   * context menu — then reads the same factor the frame was built with.
   */
  forcedScale?: number;
  onScaleChange?: (scale: number) => void;
}> = ({ children, initialScale = 1, forcedScale, onScaleChange }) => {
  const replayFrameStore = useReplayFrameStore();
  const replayFrameStoreRef = useRef(replayFrameStore);
  replayFrameStoreRef.current = replayFrameStore;
  const [content, setContent] = useState<TooltipContent | null>(null);
  const [visible, setVisible] = useState(false);
  const [viewerChrome, setViewerChrome] = useState(false);
  const [ownScale, setScaleState] = useState(initialScale);
  const scale = forcedScale ?? ownScale;
  const visibleRef = useRef(false);
  const mouseXRef = useRef(0);
  const mouseYRef = useRef(0);
  const syntheticMouseRef = useRef(false);
  // Mirrors the live MouseEvent.buttons bitmask. The synthetic mousemove below
  // has to carry it: the 3D viewport ends a middle-button camera drag the moment
  // it sees a mousemove with the middle bit clear, so a recheck defaulting to 0
  // reads to it as the user letting go of the wheel.
  const mouseButtonsRef = useRef(0);
  const onScaleChangeRef = useRef(onScaleChange);
  const tooltipElRef = useRef<HTMLDivElement | null>(null);
  onScaleChangeRef.current = onScaleChange;
  const showRafRef = useRef<number | null>(null);
  const recheckRafRef = useRef<number | null>(null);
  const validateRafRef = useRef<number | null>(null);
  const validationFramesRef = useRef(0);
  const triggerElRef = useRef<HTMLElement | null>(null);
  const virtualTriggerRef = useRef<HTMLElement | null>(null);
  /**
   * The viewer's last real pointer was a touch pointer (see `isTouchPointer`), so a hovering
   * on-screen pen raises nothing either. The mobile client shows no hover tooltip at all, and a
   * browser still sends `mouseover`/`mouseenter` for a tap even when its `pointerdown` was
   * canceled, with no `mouseleave` until the next tap lands elsewhere — so
   * without this a tapped prayer or item kept its tooltip up. Decided per input, not per
   * device: a mouse on a touchscreen laptop sends a mouse `pointermove` before any of its mouse
   * events and gets its hover tooltips back.
   */
  const touchInputRef = useRef(false);
  /**
   * A mouse event now is a tap's compatibility event, not hover: it must neither claim nor
   * dismiss a tooltip, or a tap elsewhere would take down a tap tooltip the mobile client
   * keeps up. A replay's recorded cursor is still hover.
   */
  const isCompatMouse = useCallback(() => touchInputRef.current && !isSyntheticInput(), []);
  /** The visible tooltip was opened by a tap (see `showTapTooltip`), not by hover. */
  const tapOwnedRef = useRef(false);

  const forcedScaleRef = useRef(forcedScale);
  forcedScaleRef.current = forcedScale;
  useEffect(() => {
    setScaleState(initialScale);
  }, [initialScale]);

  const setScale = useCallback((s: number) => {
    // Inert while forced — see `forcedScale`.
    if (forcedScaleRef.current !== undefined) return;
    setScaleState(s);
    onScaleChangeRef.current?.(s);
  }, []);

  const hideTooltip = useCallback(() => {
    if (showRafRef.current !== null) {
      cancelAnimationFrame(showRafRef.current);
      showRafRef.current = null;
    }
    setVisible(false);
    visibleRef.current = false;
    tapOwnedRef.current = false;
    setContent(null);
    triggerElRef.current = null;
    virtualTriggerRef.current = null;
  }, []);

  /**
   * Whether a virtual trigger still holds the cursor — see `showVirtualTooltip`.
   *
   * Rect containment rather than `elementFromPoint`, because a virtual trigger is
   * `pointer-events: none` by definition and would never be the element returned.
   */
  const virtualOwnsCursor = useCallback(() => {
    const el = virtualTriggerRef.current;
    if (!el || !el.isConnected) return false;
    const rect = el.getBoundingClientRect();
    const x = mouseXRef.current;
    const y = mouseYRef.current;
    return x >= rect.left && x < rect.right && y >= rect.top && y < rect.bottom;
  }, []);

  const validateActiveTooltip = useCallback(() => {
    const triggerEl = triggerElRef.current;
    if (!visibleRef.current || !triggerEl) return;
    if (triggerEl === virtualTriggerRef.current) {
      if (!virtualOwnsCursor()) hideTooltip();
      return;
    }
    if (!triggerEl.isConnected || triggerEl.getAttribute(TOOLTIP_BOUND_ATTR) !== TOOLTIP_BOUND_VALUE) {
      hideTooltip();
      return;
    }
    if (typeof document.elementFromPoint === 'function') {
      const elementAtCursor = syntheticMouseRef.current
        ? getReplayPointerTarget(mouseXRef.current, mouseYRef.current)
        : document.elementFromPoint(mouseXRef.current, mouseYRef.current);
      if (!elementAtCursor || !triggerEl.contains(elementAtCursor)) {
        hideTooltip();
      }
    }
  }, [hideTooltip, virtualOwnsCursor]);

  const scheduleTooltipValidation = useCallback(() => {
    validationFramesRef.current = Math.max(validationFramesRef.current, ACTION_VALIDATION_FRAMES);
    if (validateRafRef.current !== null) return;

    const runValidationFrame = () => {
      validateRafRef.current = null;
      validateActiveTooltip();
      validationFramesRef.current -= 1;
      if (validationFramesRef.current > 0 && visibleRef.current) {
        validateRafRef.current = requestAnimationFrame(runValidationFrame);
      }
    };

    validateRafRef.current = requestAnimationFrame(runValidationFrame);
  }, [validateActiveTooltip]);

  // Direct DOM positioning — no React state for mouse coordinates.
  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (isCompatMouse()) return;
      syntheticMouseRef.current = isSyntheticInput();
      mouseXRef.current = e.clientX;
      mouseYRef.current = e.clientY;
      mouseButtonsRef.current = e.buttons;
      const triggerEl = triggerElRef.current;
      if (visibleRef.current && triggerEl) {
        // A virtual trigger is hit-test-invisible, so the checks below would dismiss it
        // on the first mousemove. Its owner re-validates it every move and calls
        // hideVirtualTooltip; all this has to catch is the cursor leaving the rect.
        if (triggerEl === virtualTriggerRef.current) {
          if (!virtualOwnsCursor()) {
            hideTooltip();
            return;
          }
        } else {
          if (!triggerEl.isConnected || triggerEl.getAttribute(TOOLTIP_BOUND_ATTR) !== TOOLTIP_BOUND_VALUE) {
            hideTooltip();
            return;
          }
          if (typeof document.elementFromPoint === 'function') {
            const elementAtCursor = syntheticMouseRef.current
              ? getReplayPointerTarget(e.clientX, e.clientY)
              : document.elementFromPoint(e.clientX, e.clientY);
            if (!elementAtCursor || !triggerEl.contains(elementAtCursor)) {
              hideTooltip();
              return;
            }
          }
        }
      }
      if (visibleRef.current && tooltipElRef.current) {
        clampAndApply(tooltipElRef.current, e.clientX, e.clientY, tapOwnedRef.current);
      }
    };
    const handleButtonChange = (e: MouseEvent) => {
      mouseButtonsRef.current = e.buttons;
    };
    const handlePointer = (e: PointerEvent) => {
      // Pointer events, not mouse events: only they say which device moved.
      touchInputRef.current = isTouchPointer(e);
      // A finger has no hover to hold a hover tooltip up. A tap tooltip is the exception: its
      // owner decides which presses dismiss it, and may be the one this press is landing on.
      if (touchInputRef.current && e.type === 'pointerdown' && visibleRef.current && !tapOwnedRef.current) {
        hideTooltip();
      }
    };
    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mousedown', handleButtonChange, true);
    window.addEventListener('mouseup', handleButtonChange, true);
    window.addEventListener('pointerdown', handlePointer, true);
    window.addEventListener('pointermove', handlePointer, true);
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mousedown', handleButtonChange, true);
      window.removeEventListener('mouseup', handleButtonChange, true);
      window.removeEventListener('pointerdown', handlePointer, true);
      window.removeEventListener('pointermove', handlePointer, true);
    };
  }, [hideTooltip, virtualOwnsCursor, isCompatMouse]);

  /** Shows `newContent` at the pointer, whatever opened it. */
  const presentTooltip = useCallback((newContent: TooltipContent, tapOwned: boolean) => {
    if (isSyntheticInput()) {
      const replay = replayFrameStoreRef.current;
      if (
        replay &&
        (!replay.isTrackAvailable('menuEvents') ||
          !replay.isTrackAvailable('presentationSamples') ||
          replay.getMenuState())
      )
        return;
    }
    setContent(newContent);
    setViewerChrome(Boolean(triggerElRef.current?.closest('[data-replay-viewer-chrome]')));
    setVisible(true);
    visibleRef.current = true;
    tapOwnedRef.current = tapOwned;
    // Reclamp position after content change (tooltip size may differ).
    // Uses rAF so the DOM has updated with new content before measuring.
    if (showRafRef.current !== null) cancelAnimationFrame(showRafRef.current);
    showRafRef.current = requestAnimationFrame(() => {
      showRafRef.current = null;
      if (tooltipElRef.current) {
        clampAndApply(tooltipElRef.current, mouseXRef.current, mouseYRef.current, tapOwnedRef.current);
      }
    });
  }, []);

  /**
   * Hover tooltips. None for a finger (see `touchInputRef`); a replay's recorded cursor is
   * the recorder's hover, so it keeps its tooltips on any viewer.
   */
  const showTooltip = useCallback(
    (newContent: TooltipContent) => {
      if (isCompatMouse()) return;
      presentTooltip(newContent, false);
    },
    [presentTooltip, isCompatMouse],
  );

  const updateTooltip = useCallback((triggerEl: HTMLElement | null, newContent: TooltipContent) => {
    // Only refresh a tooltip this element genuinely owns. If the provider has
    // already hidden it (e.g. the cursor-tracking safety net fired without a
    // React mouseleave), triggerElRef is null/different and this is a no-op —
    // preventing a stale hover flag from resurrecting a dismissed tooltip.
    if (!visibleRef.current || !triggerEl || triggerElRef.current !== triggerEl) return;
    setContent(newContent);
    if (showRafRef.current !== null) cancelAnimationFrame(showRafRef.current);
    showRafRef.current = requestAnimationFrame(() => {
      showRafRef.current = null;
      if (tooltipElRef.current) {
        clampAndApply(tooltipElRef.current, mouseXRef.current, mouseYRef.current, tapOwnedRef.current);
      }
    });
  }, []);

  const showTapTooltip = useCallback(
    (trigger: HTMLElement, newContent: TooltipContent, clientX: number, clientY: number) => {
      mouseXRef.current = clientX;
      mouseYRef.current = clientY;
      syntheticMouseRef.current = false;
      virtualTriggerRef.current = trigger;
      triggerElRef.current = trigger;
      presentTooltip(newContent, true);
    },
    [presentTooltip],
  );

  const ownsTapTooltip = useCallback(
    (trigger: HTMLElement) => visibleRef.current && tapOwnedRef.current && triggerElRef.current === trigger,
    [],
  );

  const showVirtualTooltip = useCallback(
    (trigger: HTMLElement, newContent: TooltipContent) => {
      if (visibleRef.current && virtualTriggerRef.current === trigger) {
        // Already ours: refresh in place. Re-running showTooltip here would re-arm the
        // reclamp rAF on every mousemove, and a live timer's content changes each second,
        // so the tooltip would chase the cursor a frame behind instead of sitting still.
        setContent(newContent);
        return;
      }
      virtualTriggerRef.current = trigger;
      triggerElRef.current = trigger;
      showTooltip(newContent);
    },
    [showTooltip],
  );

  const hideVirtualTooltip = useCallback(
    (trigger: HTMLElement) => {
      if (virtualTriggerRef.current !== trigger) return;
      hideTooltip();
    },
    [hideTooltip],
  );

  const recheckHover = useCallback(() => {
    // A finger is not resting anywhere: probing its last tap point would hover it anew.
    if (touchInputRef.current) return;
    if (recheckRafRef.current !== null) cancelAnimationFrame(recheckRafRef.current);
    recheckRafRef.current = requestAnimationFrame(() => {
      recheckRafRef.current = null;
      if (typeof document.elementFromPoint !== 'function') return;
      const el = syntheticMouseRef.current
        ? getReplayPointerTarget(mouseXRef.current, mouseYRef.current)
        : document.elementFromPoint(mouseXRef.current, mouseYRef.current);
      if (el) {
        // Declared synthetic so the key store does not read this hover probe's absent
        // modifier flags as the user having released Shift.
        runSyntheticInput(() =>
          el.dispatchEvent(
            new PointerEvent('mousemove', {
              pointerType: 'mouse',
              clientX: mouseXRef.current,
              clientY: mouseYRef.current,
              buttons: mouseButtonsRef.current,
              bubbles: true,
            }),
          ),
        );
      }
    });
  }, []);

  const registerTooltipEl = useCallback((el: HTMLDivElement | null) => {
    tooltipElRef.current = el;
    if (el) {
      clampAndApply(el, mouseXRef.current, mouseYRef.current, tapOwnedRef.current);
    }
  }, []);

  useEffect(() => {
    return () => {
      if (showRafRef.current !== null) cancelAnimationFrame(showRafRef.current);
      if (recheckRafRef.current !== null) cancelAnimationFrame(recheckRafRef.current);
      if (validateRafRef.current !== null) cancelAnimationFrame(validateRafRef.current);
      validationFramesRef.current = 0;
    };
  }, []);

  const bindTooltip = useCallback(
    (contentOrFactory: TooltipInput | (() => TooltipInput)) => {
      const resolve = () => (typeof contentOrFactory === 'function' ? contentOrFactory() : contentOrFactory);
      const syncTrigger = (e?: React.MouseEvent | React.PointerEvent) => {
        if (!(e?.currentTarget instanceof HTMLElement)) return null;
        mouseXRef.current = e.clientX;
        mouseYRef.current = e.clientY;
        syntheticMouseRef.current = isSyntheticInput();
        // A virtual trigger paints OVER this element and keeps the tooltip while the
        // cursor is inside it — see `showVirtualTooltip`. Bound elements still receive
        // real mouse events through the passthrough panel above them, so without this
        // the one underneath re-claims ownership on every single mousemove.
        if (virtualOwnsCursor()) return null;
        triggerElRef.current = e.currentTarget;
        return e.currentTarget;
      };

      return {
        [TOOLTIP_BOUND_ATTR]: TOOLTIP_BOUND_VALUE,
        onMouseEnter: (e?: React.MouseEvent) => {
          if (isCompatMouse() || !syncTrigger(e)) return;
          const resolved = resolve();
          if (resolved) showTooltip(resolved);
        },
        onMouseLeave: () => {
          // Leaving an element the cursor never visually touched — it is under a virtual
          // trigger that owns the tooltip — must not take that tooltip down with it.
          if (isCompatMouse() || virtualOwnsCursor()) return;
          triggerElRef.current = null;
          hideTooltip();
        },
        onMouseMove: (e?: React.MouseEvent) => {
          if (isCompatMouse()) return;
          const previousTrigger = triggerElRef.current;
          const trigger = syncTrigger(e);
          if (!trigger) return;
          if (!visibleRef.current || trigger !== previousTrigger || isSyntheticInput()) {
            const resolved = resolve();
            if (resolved) showTooltip(resolved);
            else hideTooltip();
          }
        },
        // A finger's press never claims the tooltip: it shows none (see `touchInputRef`), and
        // must not take over a tap tooltip another surface owns.
        onPointerDown: (e?: React.PointerEvent) => {
          if (e && isTouchPointer(e)) return;
          syncTrigger(e);
          scheduleTooltipValidation();
        },
        onPointerUp: (e?: React.PointerEvent) => {
          if (e && isTouchPointer(e)) return;
          syncTrigger(e);
          scheduleTooltipValidation();
        },
      };
    },
    [showTooltip, hideTooltip, scheduleTooltipValidation, virtualOwnsCursor, isCompatMouse],
  );

  // API context value — all-stable references, so it never changes after
  // mount and never re-renders its consumers. The live scale is published
  // through TooltipScaleContext instead, so Alt+scroll resize bursts only
  // touch components that render from the scale.
  const apiValue = useMemo(
    () => ({
      showTooltip,
      hideTooltip,
      updateTooltip,
      showVirtualTooltip,
      showTapTooltip,
      ownsTapTooltip,
      hideVirtualTooltip,
      setScale,
      recheckHover,
      bindTooltip,
      registerTooltipEl,
    }),
    [
      showTooltip,
      hideTooltip,
      updateTooltip,
      showVirtualTooltip,
      showTapTooltip,
      ownsTapTooltip,
      hideVirtualTooltip,
      setScale,
      recheckHover,
      bindTooltip,
      registerTooltipEl,
    ],
  );

  const displayValue = useMemo(
    () => ({
      content,
      visible,
      scale,
      viewerChrome,
    }),
    [content, visible, scale, viewerChrome],
  );

  return (
    <TooltipAPIContext.Provider value={apiValue}>
      <TooltipScaleContext.Provider value={scale}>
        <TooltipScaleLockedContext.Provider value={forcedScale !== undefined}>
          <TooltipDisplayContext.Provider value={displayValue}>{children}</TooltipDisplayContext.Provider>
        </TooltipScaleLockedContext.Provider>
      </TooltipScaleContext.Provider>
    </TooltipAPIContext.Provider>
  );
};
