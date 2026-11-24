/**
 * The Alt+scroll resize gesture of the movable panels (DraggablePanel): the shared Alt
 * state, which panel a burst belongs to, and how wheel input turns into ladder steps, so a
 * burst that starts over one panel can never also resize another.
 */
import { useEffect, useRef, useSyncExternalStore } from 'react';
import { getModifiers, subscribeModifiers } from '../input/keyState';
import { makeWheelDetentReader } from '../input/wheelDetents';

// Growing pulls a corner-anchored panel TOWARDS a stationary cursor while shrinking pulls
// it AWAY, so hover-gating every step dead-ended a shrink mid-ladder. Once a surface
// consumes a step it owns the burst, and the whole burst lands on it wherever the cursor
// ends up. The burst ends when Alt is released or the wheel goes quiet.
let gestureOwner: string | null = null;
// Notches per gesture: a trackpad or free-spinning wheel reports many small deltas that
// add up to a notch, and a detented wheel reports whole notches (sometimes several
// coalesced into one event). A fresh reader per gesture so a leftover fraction from the
// last burst cannot spend the first notch of the next one.
let gestureDetents = makeWheelDetentReader();
/**
 * Wheel silence that ends a burst. Spinning a wheel or swiping a trackpad delivers events
 * tens of milliseconds apart, and turning a wheel one deliberate notch at a time still
 * lands well inside this, so a shrink keeps its panel. Stopping, moving to another panel
 * and scrolling again takes longer, so the next surface can take over within one Alt hold.
 */
export const ALT_WHEEL_GESTURE_IDLE_MS = 300;
let idleTimer: ReturnType<typeof setTimeout> | null = null;

function endGesture(): void {
  gestureOwner = null;
  gestureDetents = makeWheelDetentReader();
  if (idleTimer !== null) {
    clearTimeout(idleTimer);
    idleTimer = null;
  }
}

const getAltHeld = () => getModifiers().alt;

export function useAltHeld(): boolean {
  return useSyncExternalStore(subscribeModifiers, getAltHeld, () => false);
}

/** True while some surface owns an Alt+scroll burst; every panel snaps rather than glides. */
export function isAltWheelGestureActive(): boolean {
  return gestureOwner !== null;
}

interface AltWheelResizeOptions {
  /** Stable per surface; identifies the gesture owner. */
  id: string;
  enabled: boolean;
  /**
   * The surface cannot change size right now (sized by Auto, a pinned UI scale, a replay).
   * Alt+scroll over it is still swallowed, so it never reaches the camera, but it never
   * takes the burst: a surface that cannot resize must not block one that can.
   */
  locked: boolean;
  /** Whether a burst may START over this surface. Mid-burst the owner keeps it regardless. */
  isOver: (event: WheelEvent) => boolean;
  /**
   * Called at most once per animation frame with the net whole notches since the last
   * call (+ grows). Notches within a frame collapse into one step, so the ladder moves
   * in one commit per frame however fast the wheel turns.
   */
  onSteps: (steps: number) => void;
}

export function useAltWheelResize({ id, enabled, locked, isOver, onSteps }: AltWheelResizeOptions): void {
  const lockedRef = useRef(locked);
  lockedRef.current = locked;
  const isOverRef = useRef(isOver);
  isOverRef.current = isOver;
  const onStepsRef = useRef(onSteps);
  onStepsRef.current = onSteps;

  useEffect(() => {
    if (!enabled) return;
    const unsubscribe = subscribeModifiers(({ alt }) => {
      if (!alt && gestureOwner === id) endGesture();
    });
    let pending = 0;
    let frame: number | null = null;
    const flush = () => {
      frame = null;
      const steps = pending;
      pending = 0;
      if (steps !== 0) onStepsRef.current(steps);
    };

    const handleWheel = (e: WheelEvent) => {
      if (!e.altKey) {
        // A plain wheel means Alt was let go without a keyup reaching us (focus moved,
        // key swallowed by the OS): end the gesture rather than leave it latched.
        endGesture();
        return;
      }
      if (gestureOwner !== null) {
        if (gestureOwner !== id) return;
      } else {
        // Starting still needs the cursor over this surface, so an Alt+wheel that starts
        // over the scene resizes nothing (the scene ignores Alt+wheel for the camera).
        if (!isOverRef.current(e)) return;
        if (lockedRef.current) {
          e.preventDefault();
          return;
        }
        gestureOwner = id;
      }
      e.preventDefault();
      if (idleTimer !== null) clearTimeout(idleTimer);
      idleTimer = setTimeout(endGesture, ALT_WHEEL_GESTURE_IDLE_MS);
      // Wheel up grows.
      pending -= gestureDetents(e);
      if (pending !== 0 && frame === null) frame = requestAnimationFrame(flush);
    };

    window.addEventListener('wheel', handleWheel, { passive: false });
    return () => {
      unsubscribe();
      window.removeEventListener('wheel', handleWheel);
      // Never strand the gesture on a surface that has gone away (the infobox strip
      // unmounts as soon as its last infobox clears), or nothing consumes the rest.
      if (gestureOwner === id) endGesture();
      if (frame !== null) cancelAnimationFrame(frame);
    };
  }, [id, enabled]);
}
