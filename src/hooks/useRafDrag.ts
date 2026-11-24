import { useCallback, useEffect, useRef } from 'react';
import { holdTouchPanBlock } from '../input/touchHold';

/**
 * Low-level hook for rAF-batched drag tracking, of the mouse or of one touch.
 *
 * Does NOT handle: drag thresholds, click-vs-drag promotion, or reorder logic.
 * Those belong in the consumer.
 *
 * ## Cursor override
 *
 * When the `cursor` option is provided, the hook injects a <style> element
 * into <head> for the duration of the drag. A plain
 * `document.body.style.cursor` swap, or a bare `* { !important }` rule, both
 * lose to higher-specificity selectors in real stylesheets.
 */

/**
 * Compile-time allowlist of cursor values this hook will inject into CSS.
 *
 * The value is interpolated into a stylesheet's text content, so accepting
 * an unbounded `string` would be a CSS-injection footgun for future callers.
 */
export type UseRafDragCursor =
  | 'grabbing'
  | 'grab'
  | 'move'
  | 'row-resize'
  | 'col-resize'
  | 'ew-resize'
  | 'ns-resize'
  | 'nesw-resize'
  | 'nwse-resize'
  | 'crosshair';

interface UseRafDragOptions {
  /** Called in rAF with the latest mouse coordinates. Use for direct DOM manipulation. */
  onMove: (clientX: number, clientY: number, eventTime: number) => void;
  /** Called once on drag end after flushing the final onMove. Use for committing state. */
  onEnd?: (clientX: number, clientY: number, eventTime: number) => void;
  /**
   * Called instead of {@link onEnd} when the consumer unmounts with the button still
   * down, so a gesture the user has not finished is decided rather than dropped.
   *
   * Kept separate BECAUSE it is not an ending: there is no release position (the mouse
   * is still held) and no component left to render the result, so an `onEnd` that
   * branches on where the pointer is would take the wrong branch here. The consumer
   * decides what a half-finished gesture meant from its own state.
   *
   * Runs during unmount, so it must not setState on the consumer.
   */
  onUnmount?: () => void;
  /**
   * Called instead of {@link onEnd} when a TOUCH drag is taken from the page: the browser
   * cancels the pointer, or the window loses focus. Nothing was dropped, so a consumer that
   * starts touch drags resets here without committing. Mouse drags never cancel; a lost
   * mouseup still ends them at the last position.
   */
  onCancel?: () => void;
  /**
   * Cursor to force globally during drag via an injected <style> element.
   */
  cursor?: UseRafDragCursor;
}

interface UseRafDragReturn {
  /**
   * Call from a mousedown handler to begin rAF tracking of the mouse, or with `touchPointerId`
   * to track that touch's pointer events instead.
   */
  startDrag: (e: { clientX: number; clientY: number; timeStamp?: number }, touchPointerId?: number) => void;
  isDraggingRef: React.RefObject<boolean>;
}

/**
 * Data attribute used to identify cursor-override <style> elements the hook
 * injects. Only consumed by tests; the selector itself does not rely on it.
 */
const CURSOR_STYLE_MARKER = 'data-use-raf-drag-cursor';

function getEventTimeStamp(e: { timeStamp?: number }): number {
  return typeof e.timeStamp === 'number' && Number.isFinite(e.timeStamp) ? e.timeStamp : performance.now();
}

/**
 * Build the stylesheet body injected during drag.
 *
 * Specificity of `:root:root:root:root *` is 4 pseudo-classes + 1 universal
 * = (0, 4, 0) which beats any reasonable class/attribute-scoped rule in the
 * codebase. The root selector itself is included so <html> also gets the
 * cursor (no element is above it in the tree).
 */
function buildCursorCss(cursor: UseRafDragCursor): string {
  return (
    `:root:root:root:root,` +
    `:root:root:root:root *,` +
    `:root:root:root:root *::before,` +
    `:root:root:root:root *::after` +
    `{cursor:${cursor} !important;}`
  );
}

export function useRafDrag({ onMove, onEnd, onUnmount, onCancel, cursor }: UseRafDragOptions): UseRafDragReturn {
  const isDraggingRef = useRef(false);
  /** The touch being tracked, or null while the mouse is. */
  const touchPointerIdRef = useRef<number | null>(null);
  /** Keeps the browser from panning the tracked touch away; see `holdTouchPanBlock`. */
  const releasePanBlockRef = useRef<(() => void) | null>(null);
  const rafRef = useRef(0);
  const latestRef = useRef({ x: 0, y: 0, timeStamp: 0 });
  const cursorStyleElRef = useRef<HTMLStyleElement | null>(null);

  // Mutable callback refs — keeps handlers stable so listeners are attached once
  const onMoveRef = useRef(onMove);
  onMoveRef.current = onMove;
  const onEndRef = useRef(onEnd);
  onEndRef.current = onEnd;
  const onUnmountRef = useRef(onUnmount);
  onUnmountRef.current = onUnmount;
  const onCancelRef = useRef(onCancel);
  onCancelRef.current = onCancel;
  const cursorRef = useRef(cursor);
  cursorRef.current = cursor;

  // Both cursor helpers touch nothing but cursorStyleElRef, so they are already
  // semantically stable. useCallback makes that identity-stable too, which is what
  // lets the listener effect below list them without re-attaching every render.
  const applyGlobalCursor = useCallback((value: UseRafDragCursor) => {
    // Re-entrancy guard: only one active style tag per hook instance
    if (cursorStyleElRef.current) return;
    const el = document.createElement('style');
    el.setAttribute(CURSOR_STYLE_MARKER, '');
    el.textContent = buildCursorCss(value);
    document.head.appendChild(el);
    cursorStyleElRef.current = el;
  }, []);

  const removeGlobalCursor = useCallback(() => {
    const el = cursorStyleElRef.current;
    if (el) {
      el.remove();
      cursorStyleElRef.current = null;
    }
  }, []);

  /** Forgets the drag's input; true if one was in progress. */
  const stopTracking = useCallback((): boolean => {
    if (!isDraggingRef.current) return false;
    isDraggingRef.current = false;
    touchPointerIdRef.current = null;
    releasePanBlockRef.current?.();
    releasePanBlockRef.current = null;
    removeGlobalCursor();
    return true;
  }, [removeGlobalCursor]);

  const endDrag = useCallback(
    (clientX: number, clientY: number, eventTime = latestRef.current.timeStamp) => {
      if (!stopTracking()) return;

      // Cancel pending rAF and flush final move so no frame is ever lost
      if (rafRef.current !== 0) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = 0;
        onMoveRef.current(clientX, clientY, eventTime);
      }

      onEndRef.current?.(clientX, clientY, eventTime);
    },
    [stopTracking],
  );

  const cancelDrag = useCallback(() => {
    if (!stopTracking()) return;
    if (rafRef.current !== 0) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = 0;
    }
    onCancelRef.current?.();
  }, [stopTracking]);

  const scheduleMove = useCallback((clientX: number, clientY: number, timeStamp: number) => {
    latestRef.current = { x: clientX, y: clientY, timeStamp };
    if (rafRef.current === 0) {
      rafRef.current = requestAnimationFrame(() => {
        rafRef.current = 0;
        onMoveRef.current(latestRef.current.x, latestRef.current.y, latestRef.current.timeStamp);
      });
    }
  }, []);

  const handleMove = useCallback(
    (e: MouseEvent) => {
      if (!isDraggingRef.current || touchPointerIdRef.current !== null) return;

      // Self-heal: if mouseup was missed (e.g. released outside the window or
      // swallowed by an iframe / devtools), the next mousemove will arrive
      // with no buttons pressed. Commit at the last known in-drag position
      // rather than the re-entry position so panels land where the user
      // released, not where they re-entered the window.
      if (e.buttons === 0) {
        endDrag(latestRef.current.x, latestRef.current.y, latestRef.current.timeStamp);
        return;
      }

      scheduleMove(e.clientX, e.clientY, getEventTimeStamp(e));
    },
    [endDrag, scheduleMove],
  );

  const handleUp = useCallback(
    (e: MouseEvent) => {
      if (touchPointerIdRef.current !== null) return;
      endDrag(e.clientX, e.clientY, getEventTimeStamp(e));
    },
    [endDrag],
  );

  // A touch's events stay with the element it began on, which may stop their propagation,
  // so they are read in window capture.
  const handlePointerMove = useCallback(
    (e: PointerEvent) => {
      if (!isDraggingRef.current || e.pointerId !== touchPointerIdRef.current) return;
      scheduleMove(e.clientX, e.clientY, getEventTimeStamp(e));
    },
    [scheduleMove],
  );

  const handlePointerUp = useCallback(
    (e: PointerEvent) => {
      if (e.pointerId !== touchPointerIdRef.current) return;
      if (e.type === 'pointercancel') cancelDrag();
      else endDrag(e.clientX, e.clientY, getEventTimeStamp(e));
    },
    [cancelDrag, endDrag],
  );

  // Window blur: user alt-tabbed, focused devtools, or opened a native
  // dialog. The mouseup will fire in another context and never reach us.
  // A touch drag is canceled instead: the finger may still be down, so
  // there is no drop to honor.
  const handleBlur = useCallback(() => {
    if (!isDraggingRef.current) return;
    if (touchPointerIdRef.current !== null) cancelDrag();
    else endDrag(latestRef.current.x, latestRef.current.y);
  }, [cancelDrag, endDrag]);

  // Tab hidden (visibilitychange): same rationale as blur, but fires for
  // background tabs where blur alone is unreliable.
  const handleVisibility = useCallback(() => {
    if (!isDraggingRef.current) return;
    if (document.visibilityState === 'hidden') handleBlur();
  }, [handleBlur]);

  useEffect(() => {
    window.addEventListener('mousemove', handleMove);
    window.addEventListener('mouseup', handleUp);
    window.addEventListener('pointermove', handlePointerMove, true);
    window.addEventListener('pointerup', handlePointerUp, true);
    window.addEventListener('pointercancel', handlePointerUp, true);
    window.addEventListener('blur', handleBlur);
    document.addEventListener('visibilitychange', handleVisibility);
    return () => {
      window.removeEventListener('mousemove', handleMove);
      window.removeEventListener('mouseup', handleUp);
      window.removeEventListener('pointermove', handlePointerMove, true);
      window.removeEventListener('pointerup', handlePointerUp, true);
      window.removeEventListener('pointercancel', handlePointerUp, true);
      window.removeEventListener('blur', handleBlur);
      document.removeEventListener('visibilitychange', handleVisibility);
      if (rafRef.current !== 0) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = 0;
      }
      // Unmounted mid-drag. `onEnd` is still deliberately NOT called here — see
      // `onUnmount`, which gets the gesture instead so the consumer can decide what a
      // press that never got its mouseup meant.
      //
      // This branch is reachable ONLY at unmount, because every dep above is a stable
      // useCallback and the effect therefore never re-runs. Making one of them
      // unstable would fire `onUnmount` in the middle of a live press and commit a
      // gesture the user is still performing.
      if (stopTracking()) onUnmountRef.current?.();
    };
  }, [handleMove, handleUp, handlePointerMove, handlePointerUp, handleBlur, handleVisibility, stopTracking]);

  const startDrag = useCallback(
    (e: { clientX: number; clientY: number; timeStamp?: number }, touchPointerId?: number) => {
      // Re-entrancy guard: ignore if already tracking
      if (isDraggingRef.current) return;
      isDraggingRef.current = true;
      touchPointerIdRef.current = touchPointerId ?? null;
      if (touchPointerId !== undefined) releasePanBlockRef.current = holdTouchPanBlock();
      latestRef.current = { x: e.clientX, y: e.clientY, timeStamp: getEventTimeStamp(e) };
      if (cursorRef.current) {
        applyGlobalCursor(cursorRef.current);
      }
    },
    [applyGlobalCursor],
  );

  return { startDrag, isDraggingRef };
}
