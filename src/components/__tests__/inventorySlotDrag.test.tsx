// @vitest-environment happy-dom

import { act, fireEvent, render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { listenTouchPanBlock } from '../../input/touchHold';
import { getTouchPrefs } from '../../input/touchPrefs';
import { stubMaxTouchPoints } from '../../test/helpers/maxTouchPoints';
import { useInventorySlotDrag } from '../inventorySlotDrag';

/**
 * The touch side of the drag, which the loadout editor's own suite drives by mouse. One row of
 * four cells is enough: what these pin down is who owns the gesture, not where it lands.
 */
describe('useInventorySlotDrag — a touch gesture', () => {
  const CELL = 40;
  const ROW_TOP = 100;
  const FILLED = [0, 3];

  let rafCallbacks: Map<number, FrameRequestCallback>;
  let nextRafId: number;
  let stopPanBlock: () => void;

  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    rafCallbacks = new Map();
    nextRafId = 1;
    vi.stubGlobal(
      'requestAnimationFrame',
      vi.fn((callback: FrameRequestCallback) => {
        const id = nextRafId++;
        rafCallbacks.set(id, callback);
        return id;
      }),
    );
    vi.stubGlobal(
      'cancelAnimationFrame',
      vi.fn((id: number) => {
        rafCallbacks.delete(id);
      }),
    );
    // Installed for the page's life on a touch device; the drag only holds it.
    stopPanBlock = listenTouchPanBlock();
  });

  let restoreTouchPoints = () => {};

  afterEach(() => {
    restoreTouchPoints();
    restoreTouchPoints = () => {};
    stopPanBlock();
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  function flushRaf(): void {
    const callbacks = Array.from(rafCallbacks.values());
    rafCallbacks.clear();
    for (const callback of callbacks) callback(0);
  }

  function rect(left: number, top: number, width: number, height: number): DOMRect {
    return {
      left,
      top,
      width,
      height,
      right: left + width,
      bottom: top + height,
      x: left,
      y: top,
      toJSON: () => ({}),
    } as DOMRect;
  }

  function slotCentre(index: number): { x: number; y: number } {
    return { x: index * CELL + CELL / 2, y: ROW_TOP + CELL / 2 };
  }

  function Row({ onSwap, onLift }: { onSwap: (from: number, to: number) => void; onLift: () => void }) {
    const drag = useInventorySlotDrag({
      canLift: (index) => FILLED.includes(index),
      contentsKey: 'unchanged',
      onSwap,
      onLift,
    });
    return (
      <div ref={drag.gridRef}>
        {[0, 1, 2, 3].map((index) => (
          <button key={index} type="button" {...drag.slotProps(index)}>
            {`Slot ${index}`}
          </button>
        ))}
      </div>
    );
  }

  function renderRow() {
    const onSwap = vi.fn<(from: number, to: number) => void>();
    const onLift = vi.fn<() => void>();
    const view = render(<Row onSwap={onSwap} onLift={onLift} />);
    const grid = view.container.firstElementChild as HTMLElement;
    grid.getBoundingClientRect = () => rect(0, ROW_TOP, 4 * CELL, CELL);
    for (const [index, cell] of Array.from(grid.children).entries()) {
      (cell as HTMLElement).getBoundingClientRect = () => rect(index * CELL, ROW_TOP, CELL, CELL);
    }
    const cell = (index: number) => grid.children[index] as HTMLElement;
    return { view, onSwap, onLift, cell };
  }

  const FIRST_FINGER = { id: 1, primary: true };
  const SECOND_FINGER = { id: 2, primary: false };

  function touch(
    target: EventTarget,
    type: 'pointerdown' | 'pointermove' | 'pointerup',
    at: { x: number; y: number },
    finger = FIRST_FINGER,
  ): void {
    fireEvent(
      target as Element,
      new PointerEvent(type, {
        bubbles: true,
        cancelable: true,
        pointerType: 'touch',
        pointerId: finger.id,
        isPrimary: finger.primary,
        clientX: at.x,
        clientY: at.y,
      }),
    );
  }

  function holdPast(): void {
    act(() => {
      vi.advanceTimersByTime(getTouchPrefs().longPressMs + 50);
    });
  }

  function slide(to: { x: number; y: number }, finger = FIRST_FINGER): void {
    act(() => {
      touch(window, 'pointermove', to, finger);
      flushRaf();
    });
  }

  function cursorOverride(): Element | null {
    return document.head.querySelector('style[data-use-raf-drag-cursor]');
  }

  /** Whether the page is holding the browser's touch panning off. */
  function panBlocked(): boolean {
    const move = new Event('touchmove', { cancelable: true });
    window.dispatchEvent(move);
    return move.defaultPrevented;
  }

  it('picks the item up on a hold, holding panning and the cursor for the drag', () => {
    const { onLift, cell } = renderRow();

    touch(cell(0), 'pointerdown', slotCentre(0));
    holdPast();

    expect(onLift).toHaveBeenCalledTimes(1);
    expect(cursorOverride()).not.toBeNull();
    expect(panBlocked()).toBe(true);
  });

  it('lets a hold that comes due after the row unmounted pick nothing up', () => {
    const { view, onLift, cell } = renderRow();

    touch(cell(0), 'pointerdown', slotCentre(0));
    view.unmount();
    holdPast();

    expect(onLift).not.toHaveBeenCalled();
    expect(cursorOverride()).toBeNull();
    expect(panBlocked()).toBe(false);
  });

  it('gives panning and the cursor back when the row unmounts with an item in hand', () => {
    const { view, onSwap, cell } = renderRow();

    touch(cell(0), 'pointerdown', slotCentre(0));
    holdPast();
    slide(slotCentre(2));
    view.unmount();
    touch(window, 'pointerup', slotCentre(2));

    expect(onSwap).not.toHaveBeenCalled();
    expect(cursorOverride()).toBeNull();
    expect(panBlocked()).toBe(false);
  });

  it('keeps the first finger on the item it picked up when a second finger lands on another', () => {
    const { onSwap, onLift, cell } = renderRow();

    touch(cell(0), 'pointerdown', slotCentre(0));
    holdPast();
    slide(slotCentre(2));
    // A second finger on another filled slot: neither a new press nor a new source.
    touch(cell(3), 'pointerdown', slotCentre(3), SECOND_FINGER);
    holdPast();
    touch(window, 'pointerup', slotCentre(3), SECOND_FINGER);
    slide(slotCentre(1));
    touch(window, 'pointerup', slotCentre(1));

    expect(onLift).toHaveBeenCalledTimes(1);
    expect(onSwap).toHaveBeenCalledTimes(1);
    expect(onSwap).toHaveBeenCalledWith(0, 1);
  });

  it('keeps the finger on its item when a mouse presses another slot mid-drag', () => {
    const { onSwap, cell } = renderRow();

    touch(cell(0), 'pointerdown', slotCentre(0));
    holdPast();
    slide(slotCentre(2));
    fireEvent.mouseDown(cell(3), { button: 0, clientX: slotCentre(3).x, clientY: slotCentre(3).y });
    slide(slotCentre(1));
    touch(window, 'pointerup', slotCentre(1));

    expect(onSwap).toHaveBeenCalledTimes(1);
    expect(onSwap).toHaveBeenCalledWith(0, 1);
  });

  /** A pen's pointer event, then the compatibility mouse event a pen sends at once, unlike a finger. */
  function pen(target: EventTarget, type: 'pointerdown' | 'pointermove' | 'pointerup', at: { x: number; y: number }) {
    act(() => {
      fireEvent(
        target as Element,
        new PointerEvent(type, {
          bubbles: true,
          cancelable: true,
          pointerType: 'pen',
          pointerId: 9,
          isPrimary: true,
          buttons: type === 'pointerup' ? 0 : 1,
          clientX: at.x,
          clientY: at.y,
        }),
      );
      const init = { button: 0, buttons: type === 'pointerup' ? 0 : 1, clientX: at.x, clientY: at.y };
      if (type === 'pointerdown') fireEvent.mouseDown(target as Element, init);
      else if (type === 'pointermove') fireEvent.mouseMove(window, init);
      else fireEvent.mouseUp(window, init);
      flushRaf();
    });
  }

  it("picks up with a pen's hold as with a finger, its compatibility mousedown starting no mouse drag", () => {
    // A touchscreen, so the pen writes on the screen (see isTouchPointer).
    restoreTouchPoints = stubMaxTouchPoints(10);
    const { onSwap, onLift, cell } = renderRow();

    // Travel before the hold is a scroll, not a mouse-style drag.
    pen(cell(0), 'pointerdown', slotCentre(0));
    pen(window, 'pointermove', slotCentre(2));
    holdPast();
    pen(window, 'pointerup', slotCentre(2));
    expect(onLift).not.toHaveBeenCalled();

    pen(cell(0), 'pointerdown', slotCentre(0));
    holdPast();
    pen(window, 'pointermove', slotCentre(1));
    pen(window, 'pointerup', slotCentre(1));

    expect(onLift).toHaveBeenCalledTimes(1);
    expect(onSwap).toHaveBeenCalledExactlyOnceWith(0, 1);
  });

  it('drags a pen on a separate pad (no touchscreen) by travel, as a mouse, and only once', () => {
    restoreTouchPoints = stubMaxTouchPoints(0);
    const { onSwap, onLift, cell } = renderRow();

    pen(cell(0), 'pointerdown', slotCentre(0));
    pen(window, 'pointermove', slotCentre(2));
    // Held past the long-press time as well: no second, touch-shaped pick-up.
    holdPast();
    pen(window, 'pointerup', slotCentre(2));

    expect(onLift).toHaveBeenCalledTimes(1);
    expect(onSwap).toHaveBeenCalledExactlyOnceWith(0, 2);
  });

  it('leaves a mouse dragging by travel after a finger tap', () => {
    const { onSwap, cell } = renderRow();

    touch(cell(0), 'pointerdown', slotCentre(0));
    touch(cell(0), 'pointerup', slotCentre(0));

    const at = slotCentre(3);
    fireEvent(
      cell(3),
      new PointerEvent('pointerdown', {
        bubbles: true,
        pointerType: 'mouse',
        isPrimary: true,
        clientX: at.x,
        clientY: at.y,
      }),
    );
    act(() => {
      fireEvent.mouseDown(cell(3), { button: 0, buttons: 1, clientX: at.x, clientY: at.y });
      fireEvent.mouseMove(window, { buttons: 1, clientX: slotCentre(1).x, clientY: slotCentre(1).y });
      flushRaf();
      fireEvent.mouseUp(window, { button: 0, clientX: slotCentre(1).x, clientY: slotCentre(1).y });
    });

    expect(onSwap).toHaveBeenCalledExactlyOnceWith(3, 1);
  });
});
