import type React from 'react';
import { type ReactNode, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { ClickType } from '../../hooks/useClickAnimation';
import {
  type CompatMouseSwallow,
  dispatchTap,
  holdTouchPanBlockUntilLift,
  isTouchPointer,
  listenCompatMouseSwallow,
  listenTouchPanBlock,
  pulseLongPressHaptic,
  takeHeldTouch,
  watchTouchPress,
} from '../../input/touchHold';
import { getTouchPrefs } from '../../input/touchPrefs';
import { useTooltip } from '../Tooltip';
import {
  type BindContextMenuOptions,
  type ContextMenuContent,
  ContextMenuContext,
  type TouchMenuOpener,
} from './contextMenuTypes';

export const ContextMenuProvider: React.FC<{
  children: ReactNode;
  isReplaying?: boolean;
  onReplayCursorClick?: (clientX: number, clientY: number, type: ClickType, nowMs?: number) => void;
}> = ({ children, onReplayCursorClick, isReplaying = false }) => {
  const replayingRef = useRef(isReplaying);
  replayingRef.current = isReplaying;
  const [content, setContent] = useState<ContextMenuContent | null>(null);
  const [visible, setVisible] = useState(false);
  const [menuX, setMenuX] = useState(0);
  const [menuY, setMenuY] = useState(0);
  const [touchOpener, setTouchOpener] = useState<TouchMenuOpener | null>(null);
  const { hideTooltip, recheckHover } = useTooltip();
  const touchHoldStopRef = useRef<(() => void) | null>(null);
  const compatSwallowRef = useRef<CompatMouseSwallow | null>(null);

  // A touch pointer (see `isTouchPointer`), on any device: a bound element's tap is dispatched by
  // the page (see `dispatchTap`), and a press-and-hold opens its menu. Either way, the `click` the
  // browser still sends for the release is swallowed: after a tap it would land twice, and after a
  // hold it would act on the element. Menu taps share this swallow (see `swallowTouchCompatMouse`).
  // A mouse's press disarms it, so it never eats a mouse click.
  useEffect(() => {
    const compatSwallow = listenCompatMouseSwallow(['mousedown', 'mouseup', 'click']);
    compatSwallowRef.current = compatSwallow;
    // A hold's slide onto the menu, and an item drag, begin on panel chrome that lets the
    // browser pan; see `listenTouchPanBlock`. Installed everywhere: it is idle unless a press
    // holds it, and a device without a touchscreen never sends it a touchmove.
    const removePanBlock = listenTouchPanBlock();
    return () => {
      touchHoldStopRef.current?.();
      touchHoldStopRef.current = null;
      compatSwallow.dispose();
      compatSwallowRef.current = null;
      removePanBlock();
    };
  }, []);

  useEffect(() => {
    if (!isReplaying) return;
    // A hold begun live must not open its menu once the replay hands control back.
    touchHoldStopRef.current?.();
    touchHoldStopRef.current = null;
    setVisible(false);
    setContent(null);
    setTouchOpener(null);
  }, [isReplaying]);

  const showContextMenu = useCallback(
    (newContent: ContextMenuContent, x: number, y: number) => {
      if (replayingRef.current) return;
      // Decided by the input that opened it: a long-press still holding its finger, whether
      // it landed on the world or on a panel. Taken whatever happens next, so it never
      // carries over to a later menu.
      const heldTouch = takeHeldTouch();
      hideTooltip();
      setContent(newContent);
      setMenuX(x);
      setMenuY(y);
      setTouchOpener(heldTouch && { ...heldTouch, rowHeight: getTouchPrefs().menuRowHeight });
      setVisible(true);
      if (heldTouch) pulseLongPressHaptic();
    },
    [hideTooltip],
  );

  const hideContextMenu = useCallback(() => {
    if (replayingRef.current) return;
    setVisible(false);
    setContent(null);
    setTouchOpener(null);
    recheckHover();
  }, [recheckHover]);

  const bindContextMenu = useCallback(
    (contentFactory: () => ContextMenuContent | null, options?: BindContextMenuOptions) => {
      const onTouchDrag = options?.onTouchDrag;
      return {
        onMouseDown: (e: React.MouseEvent) => {
          if (e.button !== 2 || e.altKey) return;

          e.preventDefault();
          e.stopPropagation();
          if (replayingRef.current) return;

          const result = contentFactory();
          if (result && result.entries.length > 0) {
            showContextMenu(result, e.clientX, e.clientY);
          }
        },
        onContextMenu: (e: React.MouseEvent) => {
          e.preventDefault();
        },
        // Capture, so it never collides with a tooltip binding's `onPointerDown` on the same
        // element. Capture runs outermost first, so the innermost bound element claims the touch.
        onPointerDownCapture: (e: React.PointerEvent) => {
          const down = e.nativeEvent;
          // Only the first finger of a gesture taps or holds; a later one cancels it (see
          // watchTouchPress) rather than starting one of its own.
          if (!isTouchPointer(down) || !down.isPrimary || replayingRef.current) return;
          // Owns the press: the browser sends no compatibility mousedown or mouseup for it,
          // may not pan it away (see holdTouchPanBlockUntilLift), and its click never lands,
          // whether the press ends in a tap (dispatched below), a hold, a drag, or nothing.
          e.preventDefault();
          holdTouchPanBlockUntilLift(down);
          compatSwallowRef.current?.arm();
          const bound = e.currentTarget;
          touchHoldStopRef.current?.();
          touchHoldStopRef.current = watchTouchPress(down, {
            // A target that drags tells a drag from a tap by distance. One that does not is
            // tapped by any release on it, however the finger wobbled, as a native button is.
            within: onTouchDrag ? undefined : bound,
            onTap: (up) => {
              touchHoldStopRef.current = null;
              if (replayingRef.current || !bound.isConnected) return;
              const target = down.target instanceof Element && down.target.isConnected ? down.target : bound;
              dispatchTap(target, down.clientX, down.clientY, up, ['mousedown', 'mouseup', 'click']);
            },
            onHold: () => {
              // Under a replay, or once the element has unmounted under the finger (e.g. a
              // tab switch), the press is over and is not a click.
              const live = !replayingRef.current && bound.isConnected;
              const result = live ? contentFactory() : null;
              // No menu here: decline, so the release still taps, as a native button's
              // does after a long press nothing claims.
              if (live && (!result || result.entries.length === 0)) return false;
              touchHoldStopRef.current = null;
              if (result) showContextMenu(result, down.clientX, down.clientY);
            },
            onTravel: onTouchDrag
              ? (move) => {
                  touchHoldStopRef.current = null;
                  if (replayingRef.current || !bound.isConnected) return;
                  onTouchDrag(down, move);
                }
              : undefined,
          });
        },
      };
    },
    [showContextMenu],
  );

  const swallowTouchCompatMouse = useCallback(() => compatSwallowRef.current?.arm(), []);

  // Memoized: the provider sits under Grid, which re-renders every tick, and a fresh
  // value would re-render every panel that binds a context menu.
  const value = useMemo(
    () => ({
      content,
      visible,
      menuX,
      menuY,
      touchOpener,
      isReplaying,
      onReplayCursorClick,
      showContextMenu,
      hideContextMenu,
      bindContextMenu,
      swallowTouchCompatMouse,
    }),
    [
      content,
      visible,
      menuX,
      menuY,
      touchOpener,
      isReplaying,
      onReplayCursorClick,
      showContextMenu,
      hideContextMenu,
      bindContextMenu,
      swallowTouchCompatMouse,
    ],
  );

  return <ContextMenuContext.Provider value={value}>{children}</ContextMenuContext.Provider>;
};
