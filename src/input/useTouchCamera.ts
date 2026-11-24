import { type RefObject, useEffect, useRef } from 'react';
import { dispatchTap, isTouchPointer, listenCompatMouseSwallow, TOUCH_SLOP_PX, watchTouchPress } from './touchHold';

export interface TouchCameraHandlers {
  rotate(dx: number, dy: number): void;
  pinchStart(): void;
  /** Finger spread relative to {@link pinchStart} (>1 = spread apart). */
  pinch(scale: number): void;
  longPress(clientX: number, clientY: number): void;
}

/**
 * Mobile OSRS touch controls on `target`, for touch pointers (see `isTouchPointer`); a mouse, or
 * a pen on the mouse model, passes through to the desktop handlers untouched. One finger drags
 * to rotate, two pinch to zoom, and a stationary hold opens the right-click menu. A menu
 * `longPress` opens takes the held finger over (see `takeHeldTouch`); the camera then ignores that
 * finger until it lifts.
 *
 * A tap (released before the hold, without traveling) is sent to `target` as a left-button
 * `mousedown` (see `dispatchTap`), so it walks through the desktop left-click path. Whatever
 * compatibility mouse events the browser sends after a touch sequence are swallowed, so a tap never
 * lands twice and a drag or hold never also walks. That includes the `click`, which the browser
 * sends even for a canceled `pointerdown`: a tap that opens something (a lobby encounter's
 * configurer) has already put it under the finger, and the click would press whatever is there.
 */
export function useTouchCamera(target: RefObject<HTMLElement | null>, handlers: TouchCameraHandlers): void {
  const handlersRef = useRef(handlers);
  handlersRef.current = handlers;

  useEffect(() => {
    const element = target.current;
    if (!element) return;

    // Insertion-ordered: the pinch is always between the two earliest fingers still down.
    const touches = new Map<number, { x: number; y: number }>();
    let origin = { x: 0, y: 0 };
    // 'pinched': a pinch lost a finger, and the rest of the gesture neither rotates nor taps.
    let mode: 'tap' | 'rotate' | 'pinch' | 'pinched' = 'tap';
    let consumed = false;
    let pinchStartDistance = 0;
    // Ends itself when the touch travels, lifts, or a second finger lands.
    let stopHoldWatch = () => {};
    const compatSwallow = listenCompatMouseSwallow(['mousedown', 'mouseup', 'click']);

    const spread = () => {
      const [a, b] = touches.values();
      return Math.hypot(b.x - a.x, b.y - a.y);
    };

    const onPointerDown = (e: PointerEvent) => {
      if (!isTouchPointer(e)) return;
      // The camera owns the touch: no compatibility mousedown, mousemove or mouseup for it.
      e.preventDefault();
      // A primary touch starts a new sequence: any finger still tracked lifted where the canvas
      // never heard of it, and would otherwise hold the next pinch off or skew its spread.
      if (e.isPrimary && touches.size > 0) {
        stopHoldWatch();
        touches.clear();
      }
      touches.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (touches.size === 1) {
        origin = { x: e.clientX, y: e.clientY };
        mode = 'tap';
        consumed = false;
        // Hold only: a tap is decided here, since it must also end every other finger.
        stopHoldWatch = watchTouchPress(e, {
          onHold: () => {
            consumed = true;
            handlersRef.current.longPress(origin.x, origin.y);
          },
        });
      } else if (touches.size === 2) {
        mode = 'pinch';
        consumed = true;
        pinchStartDistance = spread();
        handlersRef.current.pinchStart();
      }
    };

    const onPointerMove = (e: PointerEvent) => {
      const touch = touches.get(e.pointerId);
      if (!touch) return;
      const dx = e.clientX - touch.x;
      const dy = e.clientY - touch.y;
      touch.x = e.clientX;
      touch.y = e.clientY;

      if (mode === 'pinch') {
        // A third contact (a resting palm or thumb) neither stops nor skews the pinch.
        if (touches.size >= 2 && pinchStartDistance > 0) handlersRef.current.pinch(spread() / pinchStartDistance);
        return;
      }
      if (mode === 'pinched') return;
      if (mode === 'tap') {
        // A finger that already held long enough to open the menu stays put.
        if (consumed || Math.hypot(e.clientX - origin.x, e.clientY - origin.y) < TOUCH_SLOP_PX) return;
        mode = 'rotate';
        consumed = true;
        // Crossing the slop only starts the drag, so the camera does not jump by the slop.
        return;
      }
      if (dx !== 0 || dy !== 0) handlersRef.current.rotate(dx, dy);
    };

    const onPointerEnd = (e: PointerEvent) => {
      if (!touches.delete(e.pointerId)) return;
      // A canceled touch was taken by the browser or OS (e.g. a system gesture), not tapped.
      if (e.type === 'pointercancel') consumed = true;
      if (touches.size >= 2) {
        // The pinch carries on between the two earliest fingers left, from their current spread.
        mode = 'pinch';
        pinchStartDistance = spread();
        handlersRef.current.pinchStart();
      } else if (touches.size === 1 && mode === 'pinch') {
        // The finger left does not rotate: it is still mid-pinch, so turning with it would spin
        // the camera. Touchscreens drop one of two pinching fingers on their own, when they close
        // together or one reaches the edge. A finger landing again resumes the pinch.
        mode = 'pinched';
      } else if (touches.size === 0) {
        if (!consumed) dispatchTap(element, origin.x, origin.y, e, ['mousedown', 'mouseup']);
        // Not on a cancel: the swallow's own cancel disarm has already run, so an arm here would
        // outlast it and eat the next mouse or keyboard input.
        if (e.type === 'pointerup') compatSwallow.arm();
      }
    };

    const reset = () => {
      stopHoldWatch();
      touches.clear();
    };

    element.addEventListener('pointerdown', onPointerDown);
    element.addEventListener('pointermove', onPointerMove);
    element.addEventListener('pointerup', onPointerEnd);
    element.addEventListener('pointercancel', onPointerEnd);
    window.addEventListener('blur', reset);
    return () => {
      reset();
      element.removeEventListener('pointerdown', onPointerDown);
      element.removeEventListener('pointermove', onPointerMove);
      element.removeEventListener('pointerup', onPointerEnd);
      element.removeEventListener('pointercancel', onPointerEnd);
      compatSwallow.dispose();
      window.removeEventListener('blur', reset);
    };
  }, [target]);
}
