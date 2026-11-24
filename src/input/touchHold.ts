import { hasTouchscreen, isTouchOnlyDevice } from '../util/mobileDetection';
import { getTouchPrefs } from './touchPrefs';

/**
 * Whether `e` comes from a pointer the page's touch model drives (taps, camera drags, holds for
 * menus, tap tooltips, panel drags) rather than the mouse model. A finger always does. A pen does
 * when it writes on the screen, and keeps the mouse model (hover, right- and middle-drag camera,
 * instant barrel-button right-click) when it is on a separate pad.
 *
 * Browsers do not say which, so the device decides. Phones and tablets are asked first
 * (`isTouchOnlyDevice`), so an S Pen or Apple Pencil gets the touch model whatever
 * `maxTouchPoints` claims. Otherwise a pen counts as on-screen only where there is a touchscreen
 * (`hasTouchscreen`): Chromium on Windows counts only touch digitizers in `maxTouchPoints`
 * (ui/base/pointer/pointer_device_win.cc), so a pen-only pad such as a Wacom Intuos on a PC
 * without a touchscreen reports 0, and Macs have no touchscreens. Accepted misreads: a pad on a
 * touchscreen laptop gets the touch model, and a pen display without finger touch (some Cintiqs)
 * the mouse model.
 */
export function isTouchPointer(e: Pick<PointerEvent, 'pointerType'>): boolean {
  if (e.pointerType === 'touch') return true;
  return e.pointerType === 'pen' && (isTouchOnlyDevice() || hasTouchscreen());
}

/**
 * How far, in CSS px, a touch may wander and still be the press it began as. CSS px track
 * Android dp and iOS pt, and a finger's wobble is physical, so this is not scaled with the UI.
 *
 * Like Android's single `ViewConfiguration` touch slop, it has two uses (see
 * {@link TouchPressHandlers.within}): on a surface where moving drags something (the world's
 * camera, an inventory item, a scrolling menu), the travel from the landing point that starts
 * the drag; on a target that does not drag, the margin around it that the finger may stray
 * into and keep its press.
 *
 * The platform slops are 8 dp (Android) and about 10 pt (iOS). Ours is larger because a lost
 * tap costs a game action, while a drag that starts a few pixels later costs nothing visible:
 * drags and camera turns begin from where the finger is, without a jump. It stays under half
 * the inventory's 36-row pitch at a Pixel 10 Pro's default Mobile chrome (`osmChromeScale`:
 * about 0.79 CSS px per logical px, a 28.4 CSS px pitch) and on tablets (1.3 or more), so a
 * deliberate drag is underway before the finger reaches the next slot. Smaller phones (a 667x375
 * iPhone: 26.8 px) and a lower Interface scaling setting shrink the pitch below that.
 */
export const TOUCH_SLOP_PX = 14;

/** The finger whose hold is being reported, still down, where it is at the hold. */
export interface HeldTouch {
  readonly pointerId: number;
  readonly clientX: number;
  readonly clientY: number;
}

export interface TouchPressHandlers {
  /**
   * The touch stayed on its press for the long-press time (see `touchPrefs`), read when the
   * press began. A menu opened synchronously from here can take the finger over with
   * {@link takeHeldTouch}.
   *
   * Returning `false` declines the hold, as a target with no menu does: the press carries on,
   * and its release can still tap. Anything else ends the watch.
   */
  readonly onHold?: () => boolean | undefined;
  /** The touch lifted on its press, before any hold that was not declined. */
  readonly onTap?: (up: PointerEvent) => void;
  /** The touch left its press before any hold or release. The watch has ended. */
  readonly onTravel?: (move: PointerEvent) => void;
  /**
   * The pressed element, for a target that does not drag. The press then lasts while the
   * finger stays within {@link TOUCH_SLOP_PX} of the element's box, however far it moves
   * inside it, as a native button's does. Without it, the press is the circle of that radius
   * around the landing point, so a drag can begin promptly.
   */
  readonly within?: Element;
}

let heldTouch: HeldTouch | null = null;

/**
 * The finger whose `onHold` is running right now, for whatever that hold opens (a context
 * menu) to own its remaining slide and release. Null outside an `onHold` call, and after the
 * first take, so only one opener can claim it.
 *
 * Read during the call rather than passed as an argument because the world's hold reaches
 * `showContextMenu` through the viewport's generic right-click resolution, which has no
 * business carrying a touch.
 */
export function takeHeldTouch(): HeldTouch | null {
  const touch = heldTouch;
  heldTouch = null;
  return touch;
}

/**
 * Whether (`clientX`, `clientY`) is still on the press that `down` began (see
 * {@link TouchPressHandlers.within}). The element's box is read once, at the press: panel
 * chrome does not move under a finger, and a box read after an unmount would be empty.
 */
function pressRegion(down: PointerEvent, within: Element | undefined): (clientX: number, clientY: number) => boolean {
  const { clientX: x, clientY: y } = down;
  if (!within) return (clientX, clientY) => Math.hypot(clientX - x, clientY - y) < TOUCH_SLOP_PX;
  const box = within.getBoundingClientRect();
  // Joined with the landing point, which a child drawn outside the element can lie beyond.
  const left = Math.min(box.left, x) - TOUCH_SLOP_PX;
  const right = Math.max(box.right, x) + TOUCH_SLOP_PX;
  const top = Math.min(box.top, y) - TOUCH_SLOP_PX;
  const bottom = Math.max(box.bottom, y) + TOUCH_SLOP_PX;
  return (clientX, clientY) => clientX >= left && clientX <= right && clientY >= top && clientY <= bottom;
}

/**
 * Watches the touch that produced `down` for one of a hold, a tap, or travel, the first to
 * happen winning: a hold or a release while the finger is still on its press (see
 * {@link TouchPressHandlers.within}), or its leaving the press. A cancel, a second finger, or
 * the window losing focus ends the watch with none. Returns a function that ends it early.
 */
export function watchTouchPress(
  down: PointerEvent,
  { onHold, onTap, onTravel, within }: TouchPressHandlers,
): () => void {
  const { pointerId } = down;
  // Snapshotted, so a settings change mid-press cannot move the deadline under the finger.
  const { longPressMs } = getTouchPrefs();
  const onPress = pressRegion(down, within);
  let lastX = down.clientX;
  let lastY = down.clientY;
  // Window capture: a touch's events stay with its own target, which can stop propagation.
  const onMove = (e: PointerEvent) => {
    if (e.pointerId !== pointerId) return;
    lastX = e.clientX;
    lastY = e.clientY;
    if (onPress(lastX, lastY)) return;
    stop();
    onTravel?.(e);
  };
  const onUp = (e: PointerEvent) => {
    if (e.pointerId !== pointerId) return;
    stop();
    if (onPress(e.clientX, e.clientY)) onTap?.(e);
  };
  const onCancel = (e: PointerEvent) => {
    if (e.pointerId === pointerId) stop();
  };
  const onOtherDown = (e: PointerEvent) => {
    if (e.pointerId !== pointerId) stop();
  };
  const timer =
    onHold &&
    setTimeout(() => {
      // Where the finger is now: whatever takes it over measures its slide from here.
      heldTouch = { pointerId, clientX: lastX, clientY: lastY };
      let held = true;
      try {
        held = onHold() !== false;
      } finally {
        heldTouch = null;
        // A throwing hold still ends the watch.
        if (held) stop();
      }
    }, longPressMs);

  function stop(): void {
    clearTimeout(timer);
    window.removeEventListener('pointermove', onMove, true);
    window.removeEventListener('pointerup', onUp, true);
    window.removeEventListener('pointercancel', onCancel, true);
    window.removeEventListener('pointerdown', onOtherDown, true);
    window.removeEventListener('blur', stop);
  }

  window.addEventListener('pointermove', onMove, true);
  window.addEventListener('pointerup', onUp, true);
  window.addEventListener('pointercancel', onCancel, true);
  window.addEventListener('pointerdown', onOtherDown, true);
  window.addEventListener('blur', stop);
  return stop;
}

type CompatMouseType = 'mousedown' | 'mouseup' | 'click';
type TapModifiers = Pick<MouseEventInit, 'shiftKey' | 'ctrlKey' | 'altKey' | 'metaKey'>;

/** Set while {@link dispatchTap} sends the page's own tap, which no swallow may take. */
let dispatchingTap = false;

/**
 * Sends `target` the left-button mouse events of a tap at (`clientX`, `clientY`), for a touch the
 * page recognized itself: browsers drop their compatibility mouse events for a touch held a
 * little long, which would lose slow taps. `modifiers` is usually the release, so a shift-tap
 * on a tablet keyboard is still a shift-click.
 *
 * The page owns such a touch from its `pointerdown`, which it cancels so the browser sends no
 * compatibility mousedown, mousemove or mouseup for it. The browser still sends `click`; pair
 * with {@link listenCompatMouseSwallow} so that one does not land a second time. The events sent
 * here are never swallowed, so a swallow may be armed before them.
 */
export function dispatchTap(
  target: Element,
  clientX: number,
  clientY: number,
  modifiers: TapModifiers,
  types: readonly CompatMouseType[],
): void {
  const { shiftKey, ctrlKey, altKey, metaKey } = modifiers;
  dispatchingTap = true;
  try {
    for (const type of types) {
      // A mousedown can unmount its target. The release still ends any press it began (drags end
      // on a window mouseup), but a click needs the element it started on.
      const at = target.isConnected ? target : type === 'mouseup' ? document : null;
      at?.dispatchEvent(
        new MouseEvent(type, {
          bubbles: true,
          cancelable: true,
          view: window,
          button: 0,
          buttons: type === 'mousedown' ? 1 : 0,
          clientX,
          clientY,
          shiftKey,
          ctrlKey,
          altKey,
          metaKey,
        }),
      );
    }
  } finally {
    dispatchingTap = false;
  }
}

export interface CompatMouseSwallow {
  /** Swallow the next event of each watched type, until the next pointer begins or one is canceled. */
  arm(): void;
  dispose(): void;
}

/**
 * Swallows the compatibility mouse events a browser sends after a touch sequence the page has
 * already handled itself: a tap it dispatched with {@link dispatchTap}, a hold that opened a
 * menu under the finger, or any press the page owned from its `pointerdown`. With the touch's
 * `pointerdown` canceled, that is only the `click`; the other types are a backstop. The page's
 * own {@link dispatchTap} events pass through, as do keyboard and assistive-technology clicks
 * (`detail` 0), which are never compatibility events.
 *
 * Listens in window capture, so it runs before every listener except window-capture ones
 * registered earlier. That covers the context menu's entry pick, which registers only once the
 * menu is visible. Any `pointerdown` (a new touch, or a mouse or pen taking over) or a
 * `pointercancel` disarms it, so a compatibility event the browser never sent cannot eat the
 * next input's. An owner arming from a touch's `pointerdown` must listen after this disarm. A
 * release does not disarm: the browser's click arrives after it.
 */
export function listenCompatMouseSwallow(types: readonly CompatMouseType[]): CompatMouseSwallow {
  const pending = new Set<string>();
  const disarm = () => pending.clear();
  const onMouse = (e: MouseEvent) => {
    if (dispatchingTap || (e.type === 'click' && e.detail === 0) || !pending.delete(e.type)) return;
    e.stopImmediatePropagation();
    e.preventDefault();
  };

  window.addEventListener('pointerdown', disarm, true);
  window.addEventListener('pointercancel', disarm, true);
  for (const type of types) window.addEventListener(type, onMouse, true);
  return {
    arm() {
      for (const type of types) pending.add(type);
    },
    dispose() {
      pending.clear();
      window.removeEventListener('pointerdown', disarm, true);
      window.removeEventListener('pointercancel', disarm, true);
      for (const type of types) window.removeEventListener(type, onMouse, true);
    },
  };
}

/**
 * One short best-effort vibration for a long-press that opened a menu, as the mobile client
 * gives by default. Silent where the Vibration API is missing (iOS Safari) or refuses.
 */
export function pulseLongPressHaptic(): void {
  if (!getTouchPrefs().hapticsEnabled) return;
  try {
    if (typeof (navigator as Partial<Navigator>).vibrate !== 'function') return;
    // Typed as boolean, but some wrappers return a promise; never let one reject unhandled.
    const result: unknown = navigator.vibrate(15);
    if (result instanceof Promise) result.catch(() => {});
  } catch {
    // Best effort: a blocked vibration (no user activation, permissions policy) is not an error.
  }
}

let panBlockHolds = 0;

/**
 * Keeps the browser from panning for touch gestures the page tracks itself after they began,
 * such as sliding from a panel slot onto a menu entry or dragging an item. Those start on
 * chrome whose `touch-action` allows panning, and a browser that starts a pan cancels the
 * pointer (`pointercancel`) mid-gesture.
 *
 * The listener must already be in place when the touch starts, since a browser decides at
 * touchstart whether it has to wait for page touch listeners, so it is installed for the
 * page's lifetime, on every device since any may have a touchscreen, and cancels only while
 * {@link holdTouchPanBlock} holds it. Returns its remover.
 */
export function listenTouchPanBlock(): () => void {
  const onTouchMove = (e: TouchEvent) => {
    if (panBlockHolds > 0 && e.cancelable) e.preventDefault();
  };
  window.addEventListener('touchmove', onTouchMove, { capture: true, passive: false });
  return () => window.removeEventListener('touchmove', onTouchMove, { capture: true });
}

/** Blocks touch panning (see {@link listenTouchPanBlock}) until the returned release runs. */
export function holdTouchPanBlock(): () => void {
  panBlockHolds++;
  let released = false;
  return () => {
    if (released) return;
    released = true;
    panBlockHolds--;
  };
}

/**
 * Blocks touch panning (see {@link listenTouchPanBlock}) for the rest of the touch `down`
 * began: until it lifts or is canceled, a second finger lands (so a pinch can zoom), or the
 * window loses focus.
 *
 * For a press the page owns on chrome whose `touch-action` allows panning. A finger that
 * wobbles past the browser's own, smaller slop would otherwise start a pan, and the
 * `pointercancel` that comes with it would drop the tap however long the page's slop is. It
 * outlives the press's watch, so a hold's menu still has the finger when it takes it over.
 */
export function holdTouchPanBlockUntilLift(down: PointerEvent): void {
  const { pointerId } = down;
  const release = holdTouchPanBlock();
  const onEnd = (e: PointerEvent) => {
    if (e.pointerId === pointerId) end();
  };
  const onOtherDown = (e: PointerEvent) => {
    if (e.pointerId !== pointerId) end();
  };
  function end(): void {
    release();
    window.removeEventListener('pointerup', onEnd, true);
    window.removeEventListener('pointercancel', onEnd, true);
    window.removeEventListener('pointerdown', onOtherDown, true);
    window.removeEventListener('blur', end);
  }
  window.addEventListener('pointerup', onEnd, true);
  window.addEventListener('pointercancel', onEnd, true);
  window.addEventListener('pointerdown', onOtherDown, true);
  window.addEventListener('blur', end);
}
