import type React from 'react';
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { useRafDrag } from '../hooks/useRafDrag';
import { suppressKeyUntilRelease } from '../input/keyState';
import {
  type CompatMouseSwallow,
  isTouchPointer,
  listenCompatMouseSwallow,
  pulseLongPressHaptic,
  takeHeldTouch,
  watchTouchPress,
} from '../input/touchHold';

/**
 * How far the mouse may travel on a slot and still be the click it began as. Short, because
 * the alternative outcome is only "the picker opens", which the next click undoes; a threshold
 * long enough to never surprise anyone is also long enough to make a deliberate drag feel stuck.
 */
const MOUSE_LIFT_THRESHOLD_PX = 5;

/** Marks a cell as a drag source and a drop target, and carries which slot it is. */
export const SLOT_INDEX_ATTRIBUTE = 'data-inventory-index';

/**
 * The slot under (`x`, `y`), or null when the pointer is off the grid entirely.
 *
 * Inside the grid the nearest cell center wins rather than a strict box test: the cells are
 * separated by 2px gutters, and a release that lands in one is a release the player aimed at a
 * slot, not a cancel. Outside the grid there is no nearest cell, which is what makes "drop it
 * anywhere else" the cancel.
 *
 * Measured on every call, never cached at the lift: the grid sits in a scrolling panel body,
 * and the wheel scrolls it under an item in hand.
 */
function slotAtPoint(grid: HTMLElement | null, x: number, y: number): number | null {
  if (!grid) return null;
  const gridBox = grid.getBoundingClientRect();
  if (x < gridBox.left || x > gridBox.right || y < gridBox.top || y > gridBox.bottom) {
    return null;
  }
  let nearest: number | null = null;
  let nearestDistance = Number.POSITIVE_INFINITY;
  for (const cell of grid.querySelectorAll<HTMLElement>(`[${SLOT_INDEX_ATTRIBUTE}]`)) {
    const box = cell.getBoundingClientRect();
    const dx = x - (box.left + box.width / 2);
    const dy = y - (box.top + box.height / 2);
    const distance = dx * dx + dy * dy;
    if (distance < nearestDistance) {
      nearestDistance = distance;
      nearest = Number(cell.getAttribute(SLOT_INDEX_ATTRIBUTE));
    }
  }
  return nearest;
}

interface Press {
  readonly index: number;
  readonly startX: number;
  readonly startY: number;
  /** A finger or a pen, which the browser follows with compatibility mouse events of its own. */
  readonly touch: boolean;
  /** Travel has promoted the press, so the item is in hand and a release will drop it. */
  lifted: boolean;
  /**
   * Escape was pressed, or the grid's contents changed under the press. The gesture plays out,
   * but its release commits nothing.
   */
  cancelled: boolean;
  /** Ends the touch's press watch early; absent for a mouse press. */
  endWatch?: () => void;
  /** {@link InventorySlotDragOptions.contentsKey} when the press began. */
  readonly contentsKey: string;
}

export interface InventorySlotDragOptions {
  /** Whether slot `index` holds something that can be picked up. An empty cell cannot. */
  readonly canLift: (index: number) => boolean;
  /**
   * What the grid holds, by value. A change during a press cancels it, as Escape does: the
   * slot the item came from, and the one it is aimed at, no longer hold what they did when it
   * was picked up (an imported setup replaced them, say). By value rather than by reference,
   * because the owner may hand over an equal copy on any render.
   */
  readonly contentsKey: string;
  /** Put `from` into `to` and `to` into `from`. Called once, on a release over another slot. */
  readonly onSwap: (from: number, to: number) => void;
  /** The item has left its cell. The caller puts down anything that would fight the drag. */
  readonly onLift?: () => void;
}

export interface InventorySlotDrag {
  /** The slot in hand, or null. Its cell draws as the hole the item left. */
  readonly carrying: number | null;
  /** The slot a release would land in, or null while the pointer is off the grid. */
  readonly over: number | null;
  /** The grid element. Its box is the drop area, and it is where the cells are found. */
  readonly gridRef: React.RefObject<HTMLDivElement | null>;
  /** The element that follows the pointer. Rendered by the caller only while carrying. */
  readonly ghostRef: React.RefObject<HTMLDivElement | null>;
  /** Spread on every inventory cell, alongside whatever else it already carries. */
  readonly slotProps: (index: number) => {
    readonly [SLOT_INDEX_ATTRIBUTE]: number;
    readonly onMouseDown: React.MouseEventHandler<HTMLElement>;
    readonly onPointerDown: React.PointerEventHandler<HTMLElement>;
    readonly onClickCapture: React.MouseEventHandler<HTMLElement>;
  };
}

/**
 * Press-and-drag an inventory item onto another slot to trade the two places.
 *
 * The two inputs reach it differently, because they are already spoken for differently. A mouse
 * press on a slot means "open this slot's picker", so the drag has to out-argue that: travel
 * past a few pixels is the whole signal, and a press that never travels stays a click. A finger
 * swipe is the panel's scroll, which is not something to take away from a 28-cell grid that
 * fills most of a phone screen, so touch picks an item up on a short hold instead and leaves
 * every swipe to the scroller.
 *
 * Both then run the same gesture: the item leaves its cell, follows the pointer, and lands on
 * the cell nearest the release. Escape, or a release anywhere off the grid, ends it with the
 * loadout exactly as it was.
 */
export function useInventorySlotDrag({
  canLift,
  contentsKey,
  onSwap,
  onLift,
}: InventorySlotDragOptions): InventorySlotDrag {
  const gridRef = useRef<HTMLDivElement>(null);
  const ghostRef = useRef<HTMLDivElement>(null);
  const pressRef = useRef<Press | null>(null);
  /** The last pointer position, so the ghost can be placed in the frame it first renders. */
  const pointerRef = useRef({ x: 0, y: 0 });
  /**
   * A drag's release also produces a click, on whatever element the two ends share: a cell, or
   * the grid around them. Swallowing it is what keeps a drag from opening a picker on top of the
   * swap it just made. A mouse's click arrives in the same task as its release, so the guard
   * expires with that task (see {@link endGesture}): a click that landed on the grid instead, or
   * never came, cannot eat a later one. A finger's click is the compatibility swallow's below.
   */
  const swallowClickRef = useRef(false);
  const swallowExpiryRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  /**
   * The same job for a finger, which the browser replays as a whole mouse press once the touch
   * is over. Those arrive at the window before any React handler, so the cell's own capture
   * guard above cannot see them, and a replayed mousedown would otherwise start a second,
   * mouse-shaped press on the slot the finger happened to end over.
   */
  const compatSwallowRef = useRef<CompatMouseSwallow | null>(null);
  /**
   * The last press on a cell was a touch pointer (see `isTouchPointer`), whose own pointer events
   * already run its gesture, so the compatibility mousedown it brings is not a second,
   * mouse-shaped press. An on-screen pen sends that mousedown at once, while its press is still
   * waiting for the hold, and it would otherwise replace the press and drag by travel like a
   * mouse. A mouse-model pen leaves this false, so its mousedown drives the mouse drag. Cleared by the next press on a
   * cell, which a real mouse's mousedown always follows.
   */
  const touchPressOwnsMouseDownRef = useRef(false);
  const [carrying, setCarrying] = useState<number | null>(null);
  const [over, setOver] = useState<number | null>(null);

  const optionsRef = useRef({ canLift, contentsKey, onSwap, onLift });
  optionsRef.current = { canLift, contentsKey, onSwap, onLift };

  /**
   * Put the ghost on the pointer. The pointer's own position, not a centered one: the element
   * carries a negative margin of half its box, so its size stays in the stylesheet with the
   * rest of its geometry rather than being a number here that has to match one there.
   */
  const placeGhost = useCallback(() => {
    const { x, y } = pointerRef.current;
    if (ghostRef.current) ghostRef.current.style.transform = `translate3d(${x}px, ${y}px, 0)`;
  }, []);

  // The ghost mounts the render after the item lifts, so its first position has to be applied
  // here; the rAF move that lifted it had no element to write to yet.
  useLayoutEffect(() => {
    if (carrying !== null) placeGhost();
  }, [carrying, placeGhost]);

  /** Take the item out of its cell. Everything after this is a drag, never a click. */
  const lift = useCallback((press: Press) => {
    press.lifted = true;
    optionsRef.current.onLift?.();
    setCarrying(press.index);
    setOver(null);
  }, []);

  /**
   * Put the item back without dropping it anywhere. The press is still live, so it is marked
   * rather than forgotten: the release that follows has to find a canceled gesture, not a fresh
   * one.
   */
  const cancelPress = useCallback((press: Press) => {
    press.cancelled = true;
    // The gesture is over for the player now, even with the button still down; only the commit
    // waited for the release, and the click that comes with it says nothing.
    if (press.lifted) swallowClickRef.current = true;
    setCarrying(null);
    setOver(null);
  }, []);

  /** The gesture is over, however it ended. */
  const endGesture = useCallback(() => {
    pressRef.current?.endWatch?.();
    pressRef.current = null;
    setCarrying(null);
    setOver(null);
    if (swallowClickRef.current) {
      clearTimeout(swallowExpiryRef.current);
      swallowExpiryRef.current = setTimeout(() => {
        swallowClickRef.current = false;
      }, 0);
    }
  }, []);

  const { startDrag, isDraggingRef } = useRafDrag({
    cursor: 'grabbing',
    onMove: (clientX, clientY) => {
      const press = pressRef.current;
      if (!press || press.cancelled) return;
      pointerRef.current = { x: clientX, y: clientY };

      if (!press.lifted) {
        if (Math.hypot(clientX - press.startX, clientY - press.startY) < MOUSE_LIFT_THRESHOLD_PX) return;
        lift(press);
      }
      placeGhost();
      setOver(slotAtPoint(gridRef.current, clientX, clientY));
    },
    onEnd: (clientX, clientY) => {
      const press = pressRef.current;
      if (!press) return;
      if (press.lifted) {
        // A release is a drag's whole answer, so the press the browser replays after it says
        // nothing. Armed even for a canceled drag: Escape already answered, and a picker
        // opening on the cell the finger stopped over would be the gesture speaking twice.
        swallowClickRef.current = true;
        if (press.touch) compatSwallowRef.current?.arm();
      }
      const target = press.lifted && !press.cancelled ? slotAtPoint(gridRef.current, clientX, clientY) : null;
      // Over before the commit, so the contents changing under it cannot read as a live press.
      endGesture();
      if (target !== null && target !== press.index) optionsRef.current.onSwap(press.index, target);
    },
    // The finger was taken from the page. Nothing was dropped anywhere, so the loadout keeps the
    // order it had.
    onCancel: endGesture,
  });

  // Unmounting ends any press, tracked or not. useRafDrag only knows a press once it tracks it,
  // and a touch is not tracked until its hold: a hold timer outliving the cell would pick an
  // item up into a component that is gone, and keep the page's pan block and cursor with it.
  useEffect(
    () => () => {
      const press = pressRef.current;
      pressRef.current = null;
      press?.endWatch?.();
      clearTimeout(swallowExpiryRef.current);
    },
    [],
  );

  // One listener for the component's life, because a browser decides whether to replay a touch
  // as mouse events long before this could install one in response.
  useEffect(() => {
    const swallow = listenCompatMouseSwallow(['mousedown', 'mouseup', 'click']);
    compatSwallowRef.current = swallow;
    return () => {
      compatSwallowRef.current = null;
      swallow.dispose();
    };
  }, []);

  // The grid's contents changed under a press: whatever replaced them was not what was picked
  // up, nor what it was aimed at.
  useEffect(() => {
    const press = pressRef.current;
    if (press && !press.cancelled && press.contentsKey !== contentsKey) cancelPress(press);
  }, [contentsKey, cancelPress]);

  // Escape puts the item back, and the press is spent there, so the panel underneath does not
  // also close. Document capture: after the held-key tracker's window-capture listener has
  // recorded the press, so the suppression below can take it back out, and before any overlay's
  // own Escape handling.
  useEffect(() => {
    if (carrying === null) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      event.preventDefault();
      event.stopPropagation();
      // Spent on the drag, so nothing polling held keys may see it either.
      suppressKeyUntilRelease(event);
      // Carrying is only ever set by lifting the current press, so there is one to cancel.
      const press = pressRef.current;
      if (press) cancelPress(press);
    };
    document.addEventListener('keydown', onKeyDown, true);
    return () => document.removeEventListener('keydown', onKeyDown, true);
  }, [carrying, cancelPress]);

  const beginPress = useCallback(
    (index: number, clientX: number, clientY: number, touch: boolean): Press | null => {
      // One gesture at a time: a pointer that arrives while another is tracked must not take
      // over the press that pointer's release will end.
      if (isDraggingRef.current) return null;
      swallowClickRef.current = false;
      // A touch still waiting for its hold, superseded: its timer must not lift anything.
      pressRef.current?.endWatch?.();
      pressRef.current = null;
      if (!optionsRef.current.canLift(index)) return null;
      const press: Press = {
        index,
        startX: clientX,
        startY: clientY,
        touch,
        lifted: false,
        cancelled: false,
        contentsKey: optionsRef.current.contentsKey,
      };
      pressRef.current = press;
      pointerRef.current = { x: clientX, y: clientY };
      return press;
    },
    [isDraggingRef],
  );

  const slotProps = useCallback(
    (index: number) => ({
      [SLOT_INDEX_ATTRIBUTE]: index,
      onMouseDown: (event: React.MouseEvent<HTMLElement>) => {
        if (touchPressOwnsMouseDownRef.current) {
          touchPressOwnsMouseDownRef.current = false;
          return;
        }
        if (event.button !== 0 || event.altKey) return;
        if (!beginPress(index, event.clientX, event.clientY, false)) return;
        // No preventDefault: the cell is a roving-focus tab stop and a press is how the pointer
        // hands it the stop. Text selection is held off by the grid's own `user-select`.
        startDrag(event);
      },
      onPointerDown: (event: React.PointerEvent<HTMLElement>) => {
        // The mouse has its own path above, with a travel threshold a finger cannot use. Only the
        // first finger of a gesture can pick anything up; a later one is a pinch or a stray, and
        // ends the first's hold (see watchTouchPress) rather than starting one of its own.
        touchPressOwnsMouseDownRef.current = isTouchPointer(event) && event.isPrimary;
        if (!touchPressOwnsMouseDownRef.current) return;
        const press = beginPress(index, event.clientX, event.clientY, true);
        if (!press) return;
        const cell = event.currentTarget;
        const forget = () => {
          if (pressRef.current === press) pressRef.current = null;
        };
        press.endWatch = watchTouchPress(event.nativeEvent, {
          // The press stayed on the cell long enough to mean something other than a scroll.
          onHold: () => {
            // A press since superseded or canceled, or a cell no longer on the page: the watch
            // ends with nothing picked up.
            if (pressRef.current !== press || press.cancelled || !cell.isConnected) {
              forget();
              return true;
            }
            const held = takeHeldTouch();
            if (!held) return false;
            pointerRef.current = { x: held.clientX, y: held.clientY };
            lift(press);
            pulseLongPressHaptic();
            startDrag({ clientX: held.clientX, clientY: held.clientY }, held.pointerId);
            return true;
          },
          // The finger left before the hold: that is the panel being scrolled, and this press
          // never happened. A release before it is a tap, which the picker already answers.
          onTravel: forget,
          onTap: forget,
          within: cell,
        });
      },
      onClickCapture: (event: React.MouseEvent<HTMLElement>) => {
        // A keyboard or assistive activation (`detail` 0) is never the click a drag left behind.
        if (!swallowClickRef.current || event.detail === 0) return;
        swallowClickRef.current = false;
        event.preventDefault();
        event.stopPropagation();
      },
    }),
    [beginPress, lift, startDrag],
  );

  return { carrying, over, gridRef, ghostRef, slotProps };
}
