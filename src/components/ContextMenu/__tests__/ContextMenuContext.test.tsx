// @vitest-environment happy-dom

import { act, fireEvent, render, screen } from '@testing-library/react';
import type React from 'react';
import { useRef } from 'react';
import { afterEach, beforeEach, describe, expect, it, type MockInstance, vi } from 'vitest';
import { __resetKeyStateForTest, getMouseButtons } from '../../../input/keyState';
import { getLiveReplayMenuState } from '../../../input/replayMenuState';
import { listenCompatMouseSwallow, TOUCH_SLOP_PX } from '../../../input/touchHold';
import { DEFAULT_TOUCH_PREFS, setTouchPrefs, TOUCH_LONG_PRESS_DEFAULT_MS } from '../../../input/touchPrefs';
import { useTouchCamera } from '../../../input/useTouchCamera';
import { stubMaxTouchPoints } from '../../../test/helpers/maxTouchPoints';
import { TooltipProvider, useTooltip } from '../../Tooltip';
import { ContextMenuProvider } from '../ContextMenuContext';
import { ContextMenuOverlay } from '../ContextMenuOverlay';
import type { ContextMenuContent } from '../contextMenuTypes';
import { useContextMenu } from '../useContextMenu';

describe('ContextMenuProvider press-and-hold (touch-only devices)', () => {
  let matchMediaSpy: MockInstance<typeof window.matchMedia> | undefined;

  function stubPointers(kind: 'touch-only' | 'touchscreen-laptop'): void {
    matchMediaSpy = vi.spyOn(window, 'matchMedia').mockImplementation(
      (query: string) =>
        ({
          // A touchscreen laptop also has a fine pointer, so the touch-only query fails.
          matches: kind === 'touch-only' && query.includes('coarse'),
          media: query,
          addEventListener: vi.fn(),
          removeEventListener: vi.fn(),
        }) as unknown as MediaQueryList,
    );
  }

  afterEach(() => {
    matchMediaSpy?.mockRestore();
    matchMediaSpy = undefined;
    vi.useRealTimers();
    __resetKeyStateForTest();
    setTouchPrefs(DEFAULT_TOUCH_PREFS);
  });

  const entryClick = vi.fn();
  const tapAction = vi.fn();
  const clickAction = vi.fn();
  const factory = vi.fn<() => ContextMenuContent | null>(() => ({
    entries: [{ action: 'Use', target: 'Thing', onClick: entryClick }, { action: 'Cancel' }],
  }));
  const otherFactory = vi.fn<() => ContextMenuContent | null>(() => ({ entries: [{ action: 'Other' }] }));
  const outerFactory = vi.fn<() => ContextMenuContent | null>(() => ({ entries: [{ action: 'Outer' }] }));

  /**
   * Merges the binding the way panel consumers do: the slot acts on left mousedown and click,
   * and also binds a tooltip, which has pointer handlers of its own.
   */
  function Slot({ name, contentFactory }: { name: string; contentFactory: () => ContextMenuContent | null }) {
    const { bindContextMenu, visible, menuX, menuY } = useContextMenu();
    const { bindTooltip } = useTooltip();
    const binding = bindContextMenu(contentFactory);
    return (
      <button
        type="button"
        data-visible={visible}
        data-menu-at={`${menuX},${menuY}`}
        data-binds-pointer={binding.onPointerDownCapture !== undefined}
        onMouseDown={(e) => {
          binding.onMouseDown(e);
          if (e.button === 0) tapAction({ shiftKey: e.shiftKey });
        }}
        onContextMenu={binding.onContextMenu}
        onPointerDownCapture={binding.onPointerDownCapture}
        onClick={clickAction}
        {...bindTooltip({ lines: [{ spans: [{ text: name, color: '#fff' }] }] })}
      >
        {name}
      </button>
    );
  }

  /** A bound element holding another, like a menu-bearing panel around a menu-bearing slot. */
  function BoundGroup({ children }: { children: React.ReactNode }) {
    const { bindContextMenu } = useContextMenu();
    const { onPointerDownCapture, onMouseDown, onContextMenu } = bindContextMenu(outerFactory);
    return (
      <fieldset onPointerDownCapture={onPointerDownCapture} onMouseDown={onMouseDown} onContextMenu={onContextMenu}>
        {children}
      </fieldset>
    );
  }

  interface TreeOptions {
    readonly isReplaying?: boolean;
    readonly showSlot?: boolean;
  }

  function tree({ isReplaying = false, showSlot = true }: TreeOptions = {}) {
    return (
      <TooltipProvider>
        <ContextMenuProvider isReplaying={isReplaying}>
          <BoundGroup>{showSlot && <Slot name="Slot" contentFactory={factory} />}</BoundGroup>
          <Slot name="Other" contentFactory={otherFactory} />
          <ContextMenuOverlay />
        </ContextMenuProvider>
      </TooltipProvider>
    );
  }

  /** The slot's box: x 30-57, y 40-67, a 34 px prayer at the smallest Mobile scale. */
  const SLOT_BOX = new DOMRect(30, 40, 27, 27);

  function renderSlot(options: TreeOptions = {}) {
    vi.clearAllMocks();
    const view = render(tree(options));
    const slot = screen.getByRole('button', { name: 'Slot' });
    slot.getBoundingClientRect = () => SLOT_BOX;
    return {
      slot,
      rerender: (next: TreeOptions) => view.rerender(tree(next)),
    };
  }

  const FIRST_FINGER = { id: 1, primary: true };
  const SECOND_FINGER = { id: 2, primary: false };

  /** Returns the event, so a test can see whether the page took the press over. */
  function touch(
    target: Element,
    type: 'pointerdown' | 'pointermove' | 'pointerup' | 'pointercancel',
    x: number,
    finger = FIRST_FINGER,
    init: PointerEventInit = {},
  ): PointerEvent {
    const event = new PointerEvent(type, {
      bubbles: true,
      cancelable: true,
      pointerType: 'touch',
      pointerId: finger.id,
      isPrimary: finger.primary,
      clientX: x,
      clientY: 50,
      ...init,
    });
    fireEvent(target, event);
    return event;
  }

  /**
   * All the browser sends after a touch whose `pointerdown` the page canceled: compatibility
   * mousedown and mouseup are suppressed, but the click is not.
   */
  function browserClick(target: Element, x: number) {
    fireEvent.click(target, { button: 0, detail: 1, clientX: x, clientY: 50 });
  }

  /** What the browser sends at the finger after a touch nobody canceled. */
  function compatMouse(target: Element, x: number) {
    fireEvent.mouseDown(target, { button: 0, clientX: x, clientY: 50 });
    fireEvent.mouseUp(target, { button: 0, clientX: x, clientY: 50 });
    fireEvent.click(target, { button: 0, detail: 1, clientX: x, clientY: 50 });
  }

  /** A real mouse's left click, which a pointerdown begins. */
  function mouseClick(target: Element, x: number) {
    const init = { bubbles: true, cancelable: true, pointerType: 'mouse', isPrimary: true, clientX: x, clientY: 50 };
    fireEvent(target, new PointerEvent('pointerdown', { ...init, buttons: 1 }));
    fireEvent.mouseDown(target, { button: 0, buttons: 1, clientX: x, clientY: 50 });
    fireEvent(target, new PointerEvent('pointerup', init));
    fireEvent.mouseUp(target, { button: 0, clientX: x, clientY: 50 });
    fireEvent.click(target, { button: 0, detail: 1, clientX: x, clientY: 50 });
  }

  function hold(target: Element, x: number) {
    touch(target, 'pointerdown', x);
    act(() => vi.advanceTimersByTime(TOUCH_LONG_PRESS_DEFAULT_MS));
  }

  it('opens the bound menu at the touch point after a still hold', () => {
    stubPointers('touch-only');
    vi.useFakeTimers();
    const { slot } = renderSlot();

    touch(slot, 'pointerdown', 40);
    act(() => vi.advanceTimersByTime(TOUCH_LONG_PRESS_DEFAULT_MS - 1));
    expect(factory).not.toHaveBeenCalled();
    touch(slot, 'pointermove', 40 + TOUCH_SLOP_PX - 1);
    act(() => vi.advanceTimersByTime(1));

    expect(factory).toHaveBeenCalledOnce();
    expect(slot).toHaveAttribute('data-visible', 'true');
    expect(slot).toHaveAttribute('data-menu-at', '40,50');
    expect(screen.getByRole('menu')).toHaveTextContent('Use');
  });

  it("swallows the release's click after a hold, then handles the next taps itself", () => {
    stubPointers('touch-only');
    vi.useFakeTimers();
    const { slot } = renderSlot();

    hold(slot, 40);
    touch(slot, 'pointerup', 40);
    browserClick(slot, 40);

    expect(tapAction).not.toHaveBeenCalled();
    expect(clickAction).not.toHaveBeenCalled();
    expect(entryClick).not.toHaveBeenCalled();
    expect(slot).toHaveAttribute('data-visible', 'true');

    // Away from the menu, a tap closes it.
    touch(screen.getByRole('dialog'), 'pointerdown', 400);
    touch(screen.getByRole('dialog'), 'pointerup', 400);
    expect(slot).toHaveAttribute('data-visible', 'false');

    touch(slot, 'pointerdown', 40);
    touch(slot, 'pointerup', 40);
    browserClick(slot, 40);
    expect(tapAction).toHaveBeenCalledOnce();
    expect(clickAction).toHaveBeenCalledOnce();
  });

  it('takes the press over, so a tap activates exactly once whatever the browser sends', () => {
    stubPointers('touch-only');
    vi.useFakeTimers();
    const { slot } = renderSlot();

    // Canceled, so the browser sends no compatibility mousedown, before the release or after.
    expect(touch(slot, 'pointerdown', 40).defaultPrevented).toBe(true);
    act(() => vi.advanceTimersByTime(TOUCH_LONG_PRESS_DEFAULT_MS - 1));
    touch(slot, 'pointerup', 40);
    expect(tapAction).toHaveBeenCalledOnce();
    expect(clickAction).toHaveBeenCalledOnce();

    // Its click still comes, after ours.
    browserClick(slot, 40);
    expect(factory).not.toHaveBeenCalled();
    expect(tapAction).toHaveBeenCalledOnce();
    expect(clickAction).toHaveBeenCalledOnce();
  });

  it('carries the keyboard modifiers of the release into the tap', () => {
    stubPointers('touch-only');
    vi.useFakeTimers();
    const { slot } = renderSlot();

    touch(slot, 'pointerdown', 40);
    touch(slot, 'pointerup', 40, FIRST_FINGER, { shiftKey: true });

    expect(tapAction).toHaveBeenCalledWith({ shiftKey: true });
  });

  it('does not open once the touch leaves the slot, even to come back, or is canceled', () => {
    stubPointers('touch-only');
    vi.useFakeTimers();
    const { slot } = renderSlot();

    touch(slot, 'pointerdown', 40);
    touch(slot, 'pointermove', SLOT_BOX.right + TOUCH_SLOP_PX + 1);
    touch(slot, 'pointermove', 40);
    act(() => vi.advanceTimersByTime(TOUCH_LONG_PRESS_DEFAULT_MS * 2));
    touch(slot, 'pointerup', 40);

    touch(slot, 'pointerdown', 40);
    touch(slot, 'pointercancel', 40);
    act(() => vi.advanceTimersByTime(TOUCH_LONG_PRESS_DEFAULT_MS * 2));

    expect(factory).not.toHaveBeenCalled();
    expect(slot).toHaveAttribute('data-visible', 'false');
  });

  it('taps once on the release of a hold that finds no menu, as a native button does', () => {
    stubPointers('touch-only');
    vi.useFakeTimers();
    const { slot } = renderSlot();
    factory.mockReturnValueOnce(null);

    hold(slot, 40);
    act(() => vi.advanceTimersByTime(TOUCH_LONG_PRESS_DEFAULT_MS * 3));
    touch(slot, 'pointerup', 50);
    browserClick(slot, 50);

    expect(factory).toHaveBeenCalledOnce();
    expect(tapAction).toHaveBeenCalledOnce();
    expect(clickAction).toHaveBeenCalledOnce();
    expect(screen.queryByRole('menu')).toBeNull();
  });

  it('does not tap after a declined hold whose finger then left the slot', () => {
    stubPointers('touch-only');
    vi.useFakeTimers();
    const { slot } = renderSlot();
    factory.mockReturnValueOnce(null);

    hold(slot, 40);
    touch(slot, 'pointermove', SLOT_BOX.right + TOUCH_SLOP_PX + 1);
    touch(slot, 'pointerup', 40);
    browserClick(slot, 40);

    expect(factory).toHaveBeenCalledOnce();
    expect(tapAction).not.toHaveBeenCalled();
    expect(clickAction).not.toHaveBeenCalled();
  });

  it('does not open while a replay owns the menu', () => {
    stubPointers('touch-only');
    vi.useFakeTimers();
    const { slot } = renderSlot({ isReplaying: true });

    hold(slot, 40);

    expect(factory).not.toHaveBeenCalled();
    expect(slot).toHaveAttribute('data-visible', 'false');
  });

  /** Lays the open menu out at x 100-160, its first entry ("Use") filling the top 20px. */
  function layOutMenu() {
    screen.getByRole('menu').getBoundingClientRect = () => new DOMRect(100, 40, 60, 40);
    const [useEntry] = screen.getAllByRole('menuitem');
    useEntry.getBoundingClientRect = () => new DOMRect(100, 40, 60, 20);
  }

  it('picks a menu entry on a slow tap, leaving no button held', () => {
    stubPointers('touch-only');
    vi.useFakeTimers();
    getMouseButtons();
    const { slot } = renderSlot();

    hold(slot, 40);
    touch(slot, 'pointerup', 40);
    layOutMenu();
    const dialog = screen.getByRole('dialog');
    expect(touch(dialog, 'pointerdown', 110).defaultPrevented).toBe(true);
    act(() => vi.advanceTimersByTime(TOUCH_LONG_PRESS_DEFAULT_MS * 2));
    touch(dialog, 'pointerup', 110);

    expect(entryClick).toHaveBeenCalledOnce();
    expect(slot).toHaveAttribute('data-visible', 'false');
    expect(getMouseButtons().left).toBe(false);

    // The browser's click lands under the closed menu, here the slot.
    browserClick(slot, 110);
    expect(entryClick).toHaveBeenCalledOnce();
    expect(tapAction).not.toHaveBeenCalled();
    expect(clickAction).not.toHaveBeenCalled();
  });

  it('does not pick with the release of the hold that opened the menu under the finger', () => {
    stubPointers('touch-only');
    vi.useFakeTimers();
    const { slot } = renderSlot();

    hold(slot, 110);
    layOutMenu();
    touch(slot, 'pointerup', 110);
    browserClick(screen.getByRole('dialog'), 110);

    expect(entryClick).not.toHaveBeenCalled();
    expect(slot).toHaveAttribute('data-visible', 'true');
  });

  it('closes the menu on a slow tap outside it, without acting on what was underneath', () => {
    stubPointers('touch-only');
    vi.useFakeTimers();
    const { slot } = renderSlot();

    hold(slot, 40);
    touch(slot, 'pointerup', 40);
    layOutMenu();
    const dialog = screen.getByRole('dialog');
    touch(dialog, 'pointerdown', 400);
    act(() => vi.advanceTimersByTime(TOUCH_LONG_PRESS_DEFAULT_MS * 2));
    touch(dialog, 'pointerup', 400);
    browserClick(slot, 400);

    expect(slot).toHaveAttribute('data-visible', 'false');
    expect(entryClick).not.toHaveBeenCalled();
    expect(clickAction).not.toHaveBeenCalled();
  });

  it('activates a slow tap the browser sent no compatibility events for, exactly once', () => {
    stubPointers('touch-only');
    vi.useFakeTimers();
    const { slot } = renderSlot();

    touch(slot, 'pointerdown', 40);
    act(() => vi.advanceTimersByTime(TOUCH_LONG_PRESS_DEFAULT_MS - 50));
    touch(slot, 'pointermove', 44);
    touch(slot, 'pointerup', 44);

    expect(tapAction).toHaveBeenCalledOnce();
    expect(clickAction).toHaveBeenCalledOnce();
    expect(factory).not.toHaveBeenCalled();
  });

  it('activates once on a release anywhere on the slot, however far the finger wobbled across it', () => {
    stubPointers('touch-only');
    vi.useFakeTimers();
    const { slot } = renderSlot();

    // 20 px from where it landed and back, all on the slot.
    touch(slot, 'pointerdown', 32, FIRST_FINGER, { clientY: 42 });
    touch(slot, 'pointermove', 52, FIRST_FINGER, { clientY: 42 });
    touch(slot, 'pointermove', 55, FIRST_FINGER, { clientY: 64 });
    act(() => vi.advanceTimersByTime(TOUCH_LONG_PRESS_DEFAULT_MS - 50));
    touch(slot, 'pointerup', 50, FIRST_FINGER, { clientY: 62 });
    browserClick(slot, 50);

    expect(tapAction).toHaveBeenCalledOnce();
    expect(clickAction).toHaveBeenCalledOnce();
    expect(factory).not.toHaveBeenCalled();
  });

  it('activates on a release within the slop of the slot, and on none beyond it, the click included', () => {
    stubPointers('touch-only');
    vi.useFakeTimers();
    const { slot } = renderSlot();

    touch(slot, 'pointerdown', 40);
    touch(slot, 'pointerup', SLOT_BOX.right + TOUCH_SLOP_PX);
    expect(tapAction).toHaveBeenCalledOnce();

    touch(slot, 'pointerdown', 40);
    touch(slot, 'pointerup', SLOT_BOX.right + TOUCH_SLOP_PX + 1);
    // Should the browser still send its click for that touch, it lands nowhere.
    browserClick(slot, SLOT_BOX.right + TOUCH_SLOP_PX + 1);

    expect(tapAction).toHaveBeenCalledOnce();
    expect(clickAction).toHaveBeenCalledOnce();
  });

  it('opens the menu after the finger moved about on the slot', () => {
    stubPointers('touch-only');
    vi.useFakeTimers();
    const { slot } = renderSlot();

    touch(slot, 'pointerdown', 32, FIRST_FINGER, { clientY: 42 });
    touch(slot, 'pointermove', 55, FIRST_FINGER, { clientY: 64 });
    act(() => vi.advanceTimersByTime(TOUCH_LONG_PRESS_DEFAULT_MS));
    touch(slot, 'pointerup', 55, FIRST_FINGER, { clientY: 64 });
    browserClick(slot, 55);

    expect(slot).toHaveAttribute('data-visible', 'true');
    expect(tapAction).not.toHaveBeenCalled();
    expect(clickAction).not.toHaveBeenCalled();
  });

  it('keeps the browser from panning the press away, until it lifts', () => {
    stubPointers('touch-only');
    vi.useFakeTimers();
    const { slot } = renderSlot();
    const touchMove = () => {
      const event = new Event('touchmove', { bubbles: true, cancelable: true });
      slot.dispatchEvent(event);
      return event.defaultPrevented;
    };

    touch(slot, 'pointerdown', 40);
    touch(slot, 'pointermove', 52);
    expect(touchMove()).toBe(true);
    touch(slot, 'pointerup', 52);
    expect(touchMove()).toBe(false);
    expect(tapAction).toHaveBeenCalledOnce();
  });

  it('lets a keyboard click through after a canceled touch, as the click it is', () => {
    stubPointers('touch-only');
    vi.useFakeTimers();
    const { slot } = renderSlot();

    touch(slot, 'pointerdown', 40);
    touch(slot, 'pointercancel', 40);
    act(() => vi.advanceTimersByTime(TOUCH_LONG_PRESS_DEFAULT_MS * 2));
    fireEvent.click(slot, { detail: 0 });

    expect(clickAction).toHaveBeenCalledOnce();
    expect(tapAction).not.toHaveBeenCalled();
    expect(screen.queryByRole('menu')).toBeNull();
  });

  it('lets a mouse click through after a canceled touch', () => {
    stubPointers('touch-only');
    vi.useFakeTimers();
    const { slot } = renderSlot();

    touch(slot, 'pointerdown', 40);
    touch(slot, 'pointercancel', 40);
    mouseClick(slot, 40);

    expect(tapAction).toHaveBeenCalledOnce();
    expect(clickAction).toHaveBeenCalledOnce();
  });

  it('lets a mouse take over after a tap whose browser click never came', () => {
    stubPointers('touch-only');
    vi.useFakeTimers();
    const { slot } = renderSlot();

    touch(slot, 'pointerdown', 40);
    touch(slot, 'pointerup', 40);
    expect(tapAction).toHaveBeenCalledOnce();
    expect(clickAction).toHaveBeenCalledOnce();

    mouseClick(slot, 40);
    expect(tapAction).toHaveBeenCalledTimes(2);
    expect(clickAction).toHaveBeenCalledTimes(2);
  });

  it("lets a fresh tap through while both the camera's and the menu's swallows are armed", () => {
    stubPointers('touch-only');
    vi.useFakeTimers();
    const { slot } = renderSlot();
    // Stands in for the camera's, armed by a canvas tap.
    const cameraSwallow = listenCompatMouseSwallow(['mousedown', 'mouseup']);
    try {
      cameraSwallow.arm();
      hold(slot, 40);
      touch(slot, 'pointerup', 40);

      // Away from the entries, a tap reaches the menu's mousedown listener and closes it.
      const dialog = screen.getByRole('dialog');
      touch(dialog, 'pointerdown', 400);
      touch(dialog, 'pointerup', 400);
      expect(slot).toHaveAttribute('data-visible', 'false');

      touch(slot, 'pointerdown', 40);
      touch(slot, 'pointerup', 40);
      expect(tapAction).toHaveBeenCalledOnce();
      expect(clickAction).toHaveBeenCalledOnce();
    } finally {
      cameraSwallow.dispose();
    }
  });

  it('opens only the innermost bound menu', () => {
    stubPointers('touch-only');
    vi.useFakeTimers();
    const { slot } = renderSlot();

    hold(slot, 40);

    expect(factory).toHaveBeenCalledOnce();
    expect(outerFactory).not.toHaveBeenCalled();
  });

  it('lets a second finger cancel a hold rather than start its own', () => {
    stubPointers('touch-only');
    vi.useFakeTimers();
    const { slot } = renderSlot();
    const other = screen.getByRole('button', { name: 'Other' });

    touch(slot, 'pointerdown', 40);
    touch(other, 'pointerdown', 40, SECOND_FINGER);
    act(() => vi.advanceTimersByTime(TOUCH_LONG_PRESS_DEFAULT_MS * 2));
    touch(other, 'pointerup', 40, SECOND_FINGER);
    touch(slot, 'pointerup', 40);

    // The first finger landed on something without a menu, such as the game canvas.
    touch(document.body, 'pointerdown', 40);
    touch(other, 'pointerdown', 40, SECOND_FINGER);
    act(() => vi.advanceTimersByTime(TOUCH_LONG_PRESS_DEFAULT_MS * 2));

    expect(factory).not.toHaveBeenCalled();
    expect(otherFactory).not.toHaveBeenCalled();
    expect(screen.queryByRole('menu')).toBeNull();
  });

  it('drops a pending hold whose element unmounts under the finger', () => {
    stubPointers('touch-only');
    vi.useFakeTimers();
    const { slot, rerender } = renderSlot();

    touch(slot, 'pointerdown', 40);
    rerender({ showSlot: false });
    act(() => vi.advanceTimersByTime(TOUCH_LONG_PRESS_DEFAULT_MS));

    expect(factory).not.toHaveBeenCalled();
    expect(screen.queryByRole('menu')).toBeNull();
  });

  it('drops a pending hold when a replay takes over, even once it hands back', () => {
    stubPointers('touch-only');
    vi.useFakeTimers();
    const { slot, rerender } = renderSlot();

    touch(slot, 'pointerdown', 40);
    rerender({ isReplaying: true });
    act(() => vi.advanceTimersByTime(TOUCH_LONG_PRESS_DEFAULT_MS / 2));
    rerender({ isReplaying: false });
    act(() => vi.advanceTimersByTime(TOUCH_LONG_PRESS_DEFAULT_MS));

    expect(factory).not.toHaveBeenCalled();
    expect(screen.queryByRole('menu')).toBeNull();
  });

  describe('the long-press finger slides onto the menu', () => {
    const subClick = vi.fn();
    const withSubmenu = (): ContextMenuContent => ({
      entries: [
        { action: 'Use', target: 'Thing', onClick: entryClick },
        { action: 'Tag', target: 'Thing', submenu: [{ action: 'Red', onClick: subClick }] },
      ],
    });

    /** A touch at (x, y); the helper above fixes y at 50. */
    function at(target: Element, type: Parameters<typeof touch>[1], x: number, y: number, finger = FIRST_FINGER) {
      return touch(target, type, x, finger, { clientY: y });
    }

    function rows(): HTMLElement[] {
      return Array.from(screen.getAllByRole('menu')[0].querySelectorAll<HTMLElement>('[role="menuitem"]'));
    }

    /** The menu at x 100-160: its header at y 20-40, then a row at 40-60 and one at 60-80. */
    function layOutRows() {
      screen.getAllByRole('menu')[0].getBoundingClientRect = () => new DOMRect(100, 20, 60, 60);
      const [first, second] = rows();
      first.getBoundingClientRect = () => new DOMRect(100, 40, 60, 20);
      if (second) second.getBoundingClientRect = () => new DOMRect(100, 60, 60, 20);
    }

    /** The open submenu, its only entry level with the second row. */
    function layOutSubmenu(left = 161) {
      const submenu = screen.getAllByRole('menu')[1];
      submenu.getBoundingClientRect = () => new DOMRect(left, 45, 60, 40);
      const entry = submenu.querySelector<HTMLElement>('[data-submenu-index]')!;
      entry.getBoundingClientRect = () => new DOMRect(left, 60, 60, 20);
    }

    /** Makes the rows a list showing y 40-80 of a taller, scrollable one. */
    function layOutScrollingList(): HTMLElement {
      layOutRows();
      const list = document.querySelector<HTMLElement>('[data-menu-entries]')!;
      Object.defineProperty(list, 'scrollHeight', { value: 200, configurable: true });
      Object.defineProperty(list, 'clientHeight', { value: 40, configurable: true });
      Object.defineProperty(list, 'scrollTop', { value: 0, configurable: true, writable: true });
      list.getBoundingClientRect = () => new DOMRect(100, 40, 60, 40);
      return list;
    }

    const isHighlighted = (row: HTMLElement) => row.style.backgroundColor !== 'transparent';

    it('selects the entry the finger slides onto and lifts on, exactly once', () => {
      stubPointers('touch-only');
      vi.useFakeTimers();
      const { slot } = renderSlot();

      hold(slot, 110);
      layOutRows();
      at(slot, 'pointermove', 110, 72);
      at(slot, 'pointermove', 110, 52);
      at(slot, 'pointerup', 110, 52);

      expect(entryClick).toHaveBeenCalledOnce();
      expect(slot).toHaveAttribute('data-visible', 'false');

      // Whatever compatibility events the browser still sends land nowhere.
      compatMouse(slot, 110);
      expect(entryClick).toHaveBeenCalledOnce();
      expect(tapAction).not.toHaveBeenCalled();
      expect(clickAction).not.toHaveBeenCalled();
    });

    it('highlights the entry under the finger, and nothing once it leaves the entries', () => {
      stubPointers('touch-only');
      vi.useFakeTimers();
      const { slot } = renderSlot();

      hold(slot, 110);
      layOutRows();
      at(slot, 'pointermove', 110, 72);
      expect(rows().map(isHighlighted)).toEqual([false, true]);
      at(slot, 'pointermove', 110, 45);
      expect(rows().map(isHighlighted)).toEqual([true, false]);
      at(slot, 'pointermove', 110, 30);
      expect(rows().map(isHighlighted)).toEqual([false, false]);
    });

    it('stays open for a tap after a release that never left the slop, even over an entry', () => {
      stubPointers('touch-only');
      vi.useFakeTimers();
      const { slot } = renderSlot();

      hold(slot, 110);
      layOutRows();
      at(slot, 'pointermove', 110 + TOUCH_SLOP_PX - 1, 50);
      at(slot, 'pointerup', 110 + TOUCH_SLOP_PX - 1, 50);
      browserClick(slot, 119);

      expect(entryClick).not.toHaveBeenCalled();
      expect(slot).toHaveAttribute('data-visible', 'true');
      expect(rows().map(isHighlighted)).toEqual([false, false]);

      const dialog = screen.getByRole('dialog');
      at(dialog, 'pointerdown', 110, 50);
      at(dialog, 'pointerup', 110, 50);
      expect(entryClick).toHaveBeenCalledOnce();
      expect(slot).toHaveAttribute('data-visible', 'false');
    });

    it('ignores a pen hovering after the hold it opened the menu with, while a mouse still hovers and leaves', () => {
      stubPointers('touch-only');
      vi.useFakeTimers();
      const { slot } = renderSlot();
      const pen = (type: 'pointerdown' | 'pointermove' | 'pointerup', x: number, y: number) => {
        touch(slot, type, x, FIRST_FINGER, { clientY: y, pointerType: 'pen' });
        // A hovering pen's moves also reach the page as compatibility mousemoves.
        if (type === 'pointermove') fireEvent.mouseMove(window, { clientX: x, clientY: y });
      };
      const mouseMove = (x: number, y: number) => {
        fireEvent(window, new PointerEvent('pointermove', { pointerType: 'mouse', clientX: x, clientY: y }));
        fireEvent.mouseMove(window, { clientX: x, clientY: y });
      };

      pen('pointerdown', 110, 50);
      act(() => vi.advanceTimersByTime(TOUCH_LONG_PRESS_DEFAULT_MS));
      pen('pointerup', 110, 50);
      layOutRows();
      pen('pointermove', 110, 72);
      pen('pointermove', 400, 400);
      expect(slot).toHaveAttribute('data-visible', 'true');
      expect(rows().map(isHighlighted)).toEqual([false, false]);

      mouseMove(110, 72);
      expect(rows().map(isHighlighted)).toEqual([false, true]);
      mouseMove(400, 400);
      expect(slot).toHaveAttribute('data-visible', 'false');
    });

    it('closes on a release away from the menu after moving, acting on nothing underneath', () => {
      stubPointers('touch-only');
      vi.useFakeTimers();
      const { slot } = renderSlot();

      hold(slot, 110);
      layOutRows();
      // Past the entry it last highlighted, which the release must not choose.
      at(slot, 'pointermove', 130, 45);
      at(slot, 'pointermove', 400, 50);
      at(slot, 'pointerup', 400, 50);
      browserClick(slot, 400);

      expect(slot).toHaveAttribute('data-visible', 'false');
      expect(entryClick).not.toHaveBeenCalled();
      expect(tapAction).not.toHaveBeenCalled();
      expect(clickAction).not.toHaveBeenCalled();
    });

    it('stays open on a release over its own header', () => {
      stubPointers('touch-only');
      vi.useFakeTimers();
      const { slot } = renderSlot();

      hold(slot, 110);
      layOutRows();
      at(slot, 'pointermove', 110, 25);
      at(slot, 'pointerup', 110, 25);

      expect(slot).toHaveAttribute('data-visible', 'true');
      expect(entryClick).not.toHaveBeenCalled();
    });

    it('opens a submenu by sliding onto its parent, keeps it across the gap, and picks from it', () => {
      stubPointers('touch-only');
      vi.useFakeTimers();
      const { slot } = renderSlot();
      factory.mockReturnValueOnce(withSubmenu());

      hold(slot, 110);
      layOutRows();
      at(slot, 'pointermove', 110, 72);
      expect(screen.getAllByRole('menu')).toHaveLength(2);
      layOutSubmenu();
      at(slot, 'pointermove', 160.5, 70);
      expect(screen.getAllByRole('menu')).toHaveLength(2);
      at(slot, 'pointermove', 170, 70);
      at(slot, 'pointerup', 170, 70);

      expect(subClick).toHaveBeenCalledOnce();
      expect(entryClick).not.toHaveBeenCalled();
      expect(slot).toHaveAttribute('data-visible', 'false');
    });

    it('leaves the submenu open on a release over its parent', () => {
      stubPointers('touch-only');
      vi.useFakeTimers();
      const { slot } = renderSlot();
      factory.mockReturnValueOnce(withSubmenu());

      hold(slot, 110);
      layOutRows();
      at(slot, 'pointermove', 110, 72);
      at(slot, 'pointerup', 110, 72);

      expect(slot).toHaveAttribute('data-visible', 'true');
      expect(screen.getAllByRole('menu')).toHaveLength(2);
      expect(subClick).not.toHaveBeenCalled();
    });

    it('picks from a submenu laid over its parent rather than the row beneath', () => {
      stubPointers('touch-only');
      vi.useFakeTimers();
      const { slot } = renderSlot();
      factory.mockReturnValueOnce(withSubmenu());

      hold(slot, 110);
      layOutRows();
      at(slot, 'pointermove', 110, 72);
      // Clamped back over the menu at a screen edge.
      layOutSubmenu(130);
      at(slot, 'pointermove', 140, 70);
      expect(screen.getAllByRole('menu')).toHaveLength(2);
      at(slot, 'pointerup', 140, 70);

      expect(subClick).toHaveBeenCalledOnce();
    });

    it('opens a submenu with a tap on its parent, then picks from it with another', () => {
      stubPointers('touch-only');
      vi.useFakeTimers();
      const { slot } = renderSlot();
      factory.mockReturnValueOnce(withSubmenu());

      hold(slot, 40);
      touch(slot, 'pointerup', 40);
      layOutRows();
      const dialog = screen.getByRole('dialog');
      at(dialog, 'pointerdown', 110, 70);
      at(dialog, 'pointerup', 110, 70);
      browserClick(dialog, 110);

      expect(slot).toHaveAttribute('data-visible', 'true');
      expect(screen.getAllByRole('menu')).toHaveLength(2);
      layOutSubmenu();
      at(dialog, 'pointerdown', 170, 70);
      at(dialog, 'pointerup', 170, 70);

      expect(subClick).toHaveBeenCalledOnce();
      expect(slot).toHaveAttribute('data-visible', 'false');
    });

    it.each([
      [
        'tap',
        (dialog: HTMLElement) => {
          at(dialog, 'pointerdown', 140, 50);
          at(dialog, 'pointerup', 140, 50);
        },
      ],
      ['mouse click', (dialog: HTMLElement) => mouseClick(dialog, 140)],
    ])("picks nothing on a %s on a submenu's header, not the parent row it covers", (_, press) => {
      stubPointers('touch-only');
      vi.useFakeTimers();
      const { slot } = renderSlot();
      factory.mockReturnValueOnce(withSubmenu());

      hold(slot, 40);
      touch(slot, 'pointerup', 40);
      layOutRows();
      const dialog = screen.getByRole('dialog');
      at(dialog, 'pointerdown', 110, 70);
      at(dialog, 'pointerup', 110, 70);
      browserClick(dialog, 110);
      expect(screen.getAllByRole('menu')).toHaveLength(2);
      // Clamped back over the menu: its header (130-190, 45-60) covers the first row's right end.
      layOutSubmenu(130);
      press(dialog);

      expect(entryClick).not.toHaveBeenCalled();
      expect(subClick).not.toHaveBeenCalled();
      expect(slot).toHaveAttribute('data-visible', 'false');
    });

    it('picks nothing when the slide is canceled, joined by a second finger, or loses focus', () => {
      stubPointers('touch-only');
      vi.useFakeTimers();
      const { slot } = renderSlot();
      const dialog = () => screen.getByRole('dialog');

      hold(slot, 110);
      layOutRows();
      at(slot, 'pointermove', 130, 45);
      at(slot, 'pointercancel', 130, 45);
      at(slot, 'pointerup', 130, 45);
      expect(slot).toHaveAttribute('data-visible', 'true');
      expect(rows().map(isHighlighted)).toEqual([false, false]);

      touch(dialog(), 'pointerdown', 400);
      touch(dialog(), 'pointerup', 400);
      hold(slot, 110);
      layOutRows();
      at(slot, 'pointermove', 130, 45);
      at(dialog(), 'pointerdown', 300, 50, SECOND_FINGER);
      at(slot, 'pointerup', 130, 45);
      at(dialog(), 'pointerup', 300, 50, SECOND_FINGER);
      expect(slot).toHaveAttribute('data-visible', 'true');

      touch(dialog(), 'pointerdown', 400);
      touch(dialog(), 'pointerup', 400);
      hold(slot, 110);
      layOutRows();
      at(slot, 'pointermove', 130, 45);
      fireEvent.blur(window);
      at(slot, 'pointerup', 130, 45);
      expect(slot).toHaveAttribute('data-visible', 'false');

      expect(entryClick).not.toHaveBeenCalled();
      expect(tapAction).not.toHaveBeenCalled();
      expect(clickAction).not.toHaveBeenCalled();
    });

    it('picks nothing once the menu unmounts under the finger', () => {
      stubPointers('touch-only');
      vi.useFakeTimers();
      vi.clearAllMocks();
      const view = render(tree());
      const slot = screen.getByRole('button', { name: 'Slot' });

      hold(slot, 110);
      layOutRows();
      at(slot, 'pointermove', 130, 45);
      view.unmount();
      fireEvent(
        window,
        new PointerEvent('pointerup', { pointerType: 'touch', pointerId: 1, clientX: 130, clientY: 45 }),
      );

      expect(entryClick).not.toHaveBeenCalled();
    });

    it('scrolls a tall menu under a dragged tap without picking, and still picks on a tap', () => {
      stubPointers('touch-only');
      vi.useFakeTimers();
      const { slot } = renderSlot();

      hold(slot, 40);
      touch(slot, 'pointerup', 40);
      const list = layOutScrollingList();
      const dialog = screen.getByRole('dialog');
      at(dialog, 'pointerdown', 110, 55);
      at(dialog, 'pointermove', 110, 40);
      at(dialog, 'pointermove', 110, 30);
      expect(list.scrollTop).toBe(10);
      at(dialog, 'pointermove', 110, 50);
      at(dialog, 'pointerup', 110, 50);
      browserClick(dialog, 110);

      expect(list.scrollTop).toBe(-10);
      expect(entryClick).not.toHaveBeenCalled();
      expect(slot).toHaveAttribute('data-visible', 'true');

      at(dialog, 'pointerdown', 110, 50);
      at(dialog, 'pointerup', 110, 50);
      expect(entryClick).toHaveBeenCalledOnce();
    });

    it('does not pick a row scrolled out of view', () => {
      stubPointers('touch-only');
      vi.useFakeTimers();
      const { slot } = renderSlot();

      hold(slot, 40);
      touch(slot, 'pointerup', 40);
      layOutScrollingList();
      // Scrolled up past the list's top, under the header.
      rows()[0].getBoundingClientRect = () => new DOMRect(100, 22, 60, 16);
      const dialog = screen.getByRole('dialog');
      at(dialog, 'pointerdown', 110, 30);
      at(dialog, 'pointerup', 110, 30);

      expect(entryClick).not.toHaveBeenCalled();
    });

    it('auto-scrolls while the sliding finger rests at the bottom edge of a tall menu', () => {
      stubPointers('touch-only');
      vi.useFakeTimers();
      const { slot } = renderSlot();

      hold(slot, 110);
      const list = layOutScrollingList();
      at(slot, 'pointermove', 110, 78);
      act(() => vi.advanceTimersByTime(16 * 5));
      expect(list.scrollTop).toBe(20);

      at(slot, 'pointermove', 110, 60);
      act(() => vi.advanceTimersByTime(16 * 5));
      expect(list.scrollTop).toBe(20);

      at(slot, 'pointermove', 110, 42);
      act(() => vi.advanceTimersByTime(16 * 5));
      expect(list.scrollTop).toBe(0);
      at(slot, 'pointerup', 110, 60);
      act(() => vi.advanceTimersByTime(16 * 5));
      expect(list.scrollTop).toBe(0);
    });

    it('takes the world finger the same way: a slide off the menu walks nowhere', () => {
      stubPointers('touch-only');
      vi.useFakeTimers();
      vi.clearAllMocks();
      const walk = vi.fn();
      const walkHere = vi.fn();
      function World() {
        const ref = useRef<HTMLCanvasElement>(null);
        const { showContextMenu } = useContextMenu();
        useTouchCamera(ref, {
          rotate: () => {},
          pinchStart: () => {},
          pinch: () => {},
          longPress: (x, y) => showContextMenu({ entries: [{ action: 'Walk here', onClick: walkHere }] }, x, y),
        });
        // The game canvas, which walks on a left mousedown.
        return <canvas ref={ref} data-testid="world" onMouseDown={walk} />;
      }
      render(
        <TooltipProvider>
          <ContextMenuProvider>
            <World />
            <ContextMenuOverlay />
          </ContextMenuProvider>
        </TooltipProvider>,
      );
      const world = screen.getByTestId('world');

      hold(world, 110);
      layOutRows();
      at(world, 'pointermove', 130, 45);
      at(world, 'pointermove', 400, 50);
      at(world, 'pointerup', 400, 50);
      browserClick(world, 400);
      expect(screen.queryByRole('menu')).toBeNull();
      expect(walk).not.toHaveBeenCalled();
      expect(walkHere).not.toHaveBeenCalled();

      hold(world, 110);
      layOutRows();
      at(world, 'pointermove', 130, 45);
      at(world, 'pointerup', 130, 45);
      compatMouse(world, 130);
      expect(walkHere).toHaveBeenCalledOnce();
      expect(walk).not.toHaveBeenCalled();
    });

    it('gives finger-sized rows to a menu a long-press opened, keeping the native text size', () => {
      stubPointers('touch-only');
      vi.useFakeTimers();
      const { slot } = renderSlot();

      hold(slot, 110);
      expect(rows()[0].style.minHeight).toBe('28px');
      const touchFontSize = (rows()[0].firstElementChild as HTMLElement).style.fontSize;
      touch(slot, 'pointerup', 110);
      touch(screen.getByRole('dialog'), 'pointerdown', 400);
      touch(screen.getByRole('dialog'), 'pointerup', 400);

      setTouchPrefs({ ...DEFAULT_TOUCH_PREFS, menuRowHeight: 40 });
      hold(slot, 110);
      expect(rows()[0].style.minHeight).toBe('40px');
      expect((rows()[0].firstElementChild as HTMLElement).style.fontSize).toBe(touchFontSize);
      expect(screen.getAllByRole('menu')[0].style.maxHeight).not.toBe('');
    });

    it('records its row height and scroll for replay, and a mouse menu without them', () => {
      stubPointers('touch-only');
      vi.useFakeTimers();
      // The recording measures the menu against the game frame.
      const frame = document.createElement('div');
      frame.className = 'game-viewport-frame';
      frame.getBoundingClientRect = () => new DOMRect(0, 0, 844, 390);
      document.body.appendChild(frame);
      try {
        const { slot } = renderSlot();

        hold(slot, 110);
        expect(getLiveReplayMenuState()).toMatchObject({ rowHeight: 28, scrollTop: 0 });

        const list = document.querySelector<HTMLElement>('[data-menu-entries]')!;
        Object.defineProperty(list, 'scrollTop', { value: 42, configurable: true, writable: true });
        fireEvent.scroll(list);
        expect(getLiveReplayMenuState()).toMatchObject({ rowHeight: 28, scrollTop: 42 });

        touch(slot, 'pointerup', 110);
        touch(screen.getByRole('dialog'), 'pointerdown', 400);
        touch(screen.getByRole('dialog'), 'pointerup', 400);
        expect(getLiveReplayMenuState()).toBeNull();

        // The menu tap armed the compatibility swallow; a new touch disarms it, as it would live.
        touch(document.body, 'pointerdown', 0);
        touch(document.body, 'pointerup', 0);
        fireEvent.mouseDown(slot, { button: 2, clientX: 110, clientY: 50 });
        expect(getLiveReplayMenuState()).not.toBeNull();
        expect(getLiveReplayMenuState()).not.toHaveProperty('rowHeight');
        expect(getLiveReplayMenuState()).not.toHaveProperty('scrollTop');
      } finally {
        frame.remove();
      }
    });

    it('holds for a custom long-press time on panels too', () => {
      stubPointers('touch-only');
      vi.useFakeTimers();
      setTouchPrefs({ ...DEFAULT_TOUCH_PREFS, longPressMs: 600 });
      const { slot } = renderSlot();

      touch(slot, 'pointerdown', 40);
      act(() => vi.advanceTimersByTime(599));
      expect(factory).not.toHaveBeenCalled();
      act(() => vi.advanceTimersByTime(1));
      expect(slot).toHaveAttribute('data-visible', 'true');
    });

    describe('haptics', () => {
      const original = Object.getOwnPropertyDescriptor(navigator, 'vibrate');
      afterEach(() => {
        if (original) Object.defineProperty(navigator, 'vibrate', original);
        else Reflect.deleteProperty(navigator, 'vibrate');
      });

      it('pulses once when a long-press opens a menu, and not on sliding or choosing', () => {
        stubPointers('touch-only');
        vi.useFakeTimers();
        const vibrate = vi.fn(() => true);
        Object.defineProperty(navigator, 'vibrate', { value: vibrate, configurable: true, writable: true });
        const { slot } = renderSlot();

        hold(slot, 110);
        expect(vibrate).toHaveBeenCalledExactlyOnceWith(15);
        layOutRows();
        at(slot, 'pointermove', 110, 72);
        at(slot, 'pointermove', 110, 52);
        at(slot, 'pointerup', 110, 52);
        expect(entryClick).toHaveBeenCalledOnce();

        // A hold that finds no menu opens nothing, so it does not pulse.
        factory.mockReturnValueOnce(null);
        hold(slot, 110);
        touch(slot, 'pointerup', 110);
        expect(vibrate).toHaveBeenCalledOnce();
      });

      it('opens the menu as usual where vibration is unsupported', () => {
        stubPointers('touch-only');
        vi.useFakeTimers();
        Object.defineProperty(navigator, 'vibrate', { value: undefined, configurable: true, writable: true });
        const { slot } = renderSlot();

        hold(slot, 110);

        expect(slot).toHaveAttribute('data-visible', 'true');
      });
    });
  });

  describe('on a device with a mouse or trackpad too', () => {
    // A touchscreen laptop unless a case takes the touchscreen away (see isTouchPointer).
    let restoreTouchPoints = () => {};
    beforeEach(() => {
      restoreTouchPoints = stubMaxTouchPoints(10);
    });
    afterEach(() => {
      restoreTouchPoints();
    });

    it.each([
      'touch',
      'pen',
    ])('takes a %s press over as on a phone: a tap clicks once, a hold opens the menu', (pointerType) => {
      stubPointers('touchscreen-laptop');
      vi.useFakeTimers();
      const { slot } = renderSlot();
      const kind = { pointerType };

      expect(slot).toHaveAttribute('data-binds-pointer', 'true');
      expect(touch(slot, 'pointerdown', 40, FIRST_FINGER, kind).defaultPrevented).toBe(true);
      touch(slot, 'pointerup', 40, FIRST_FINGER, kind);
      browserClick(slot, 40);
      expect(tapAction).toHaveBeenCalledOnce();
      expect(clickAction).toHaveBeenCalledOnce();

      touch(slot, 'pointerdown', 40, FIRST_FINGER, kind);
      act(() => vi.advanceTimersByTime(TOUCH_LONG_PRESS_DEFAULT_MS));
      touch(slot, 'pointerup', 40, FIRST_FINGER, kind);
      browserClick(slot, 40);
      expect(slot).toHaveAttribute('data-visible', 'true');
      expect(tapAction).toHaveBeenCalledOnce();

      layOutMenu();
      const dialog = screen.getByRole('dialog');
      expect(touch(dialog, 'pointerdown', 110, FIRST_FINGER, kind).defaultPrevented).toBe(true);
      touch(dialog, 'pointerup', 110, FIRST_FINGER, kind);
      browserClick(slot, 110);
      expect(entryClick).toHaveBeenCalledOnce();
      expect(slot).toHaveAttribute('data-visible', 'false');
      expect(clickAction).toHaveBeenCalledOnce();
    });

    it('leaves a pen on a separate pad (no touchscreen) on the mouse path, right-click included', () => {
      restoreTouchPoints();
      restoreTouchPoints = stubMaxTouchPoints(0);
      stubPointers('touchscreen-laptop');
      vi.useFakeTimers();
      const { slot } = renderSlot();
      const pen = { pointerType: 'pen' };

      // Not taken over, so the browser sends the pen's compatibility mouse events, which click.
      expect(touch(slot, 'pointerdown', 40, FIRST_FINGER, pen).defaultPrevented).toBe(false);
      act(() => vi.advanceTimersByTime(TOUCH_LONG_PRESS_DEFAULT_MS * 2));
      touch(slot, 'pointerup', 40, FIRST_FINGER, pen);
      compatMouse(slot, 40);
      expect(factory).not.toHaveBeenCalled();
      expect(tapAction).toHaveBeenCalledOnce();
      expect(clickAction).toHaveBeenCalledOnce();

      // The barrel button's press is a right mousedown, which opens the menu at once.
      expect(touch(slot, 'pointerdown', 40, FIRST_FINGER, { ...pen, button: 2, buttons: 2 }).defaultPrevented).toBe(
        false,
      );
      fireEvent.mouseDown(slot, { button: 2, buttons: 2, clientX: 40, clientY: 50 });
      expect(slot).toHaveAttribute('data-visible', 'true');
    });

    it('leaves the mouse as it was, even straight after a tap whose browser click never came', () => {
      stubPointers('touchscreen-laptop');
      vi.useFakeTimers();
      const { slot } = renderSlot();

      // The tap arms the swallow for a click the browser then never sends.
      touch(slot, 'pointerdown', 40);
      touch(slot, 'pointerup', 40);
      expect(clickAction).toHaveBeenCalledOnce();

      mouseClick(slot, 40);
      expect(tapAction).toHaveBeenCalledTimes(2);
      expect(clickAction).toHaveBeenCalledTimes(2);
      expect(factory).not.toHaveBeenCalled();

      fireEvent.mouseDown(slot, { button: 2, clientX: 40, clientY: 50 });
      expect(slot).toHaveAttribute('data-visible', 'true');
    });
  });

  describe('a pen', () => {
    const PEN = { pointerType: 'pen' } as const;

    it('taps like a finger on a touch-only device, exactly once whatever the browser sends', () => {
      stubPointers('touch-only');
      vi.useFakeTimers();
      const { slot } = renderSlot();

      expect(touch(slot, 'pointerdown', 40, FIRST_FINGER, PEN).defaultPrevented).toBe(true);
      touch(slot, 'pointerup', 40, FIRST_FINGER, PEN);
      browserClick(slot, 40);

      expect(tapAction).toHaveBeenCalledOnce();
      expect(clickAction).toHaveBeenCalledOnce();
      expect(factory).not.toHaveBeenCalled();
    });

    it('opens the menu on a hold on a touch-only device, and picks an entry with a tap', () => {
      stubPointers('touch-only');
      vi.useFakeTimers();
      const { slot } = renderSlot();

      touch(slot, 'pointerdown', 40, FIRST_FINGER, PEN);
      act(() => vi.advanceTimersByTime(TOUCH_LONG_PRESS_DEFAULT_MS));
      touch(slot, 'pointerup', 40, FIRST_FINGER, PEN);
      browserClick(slot, 40);
      expect(slot).toHaveAttribute('data-visible', 'true');
      expect(tapAction).not.toHaveBeenCalled();

      layOutMenu();
      const dialog = screen.getByRole('dialog');
      expect(touch(dialog, 'pointerdown', 110, FIRST_FINGER, PEN).defaultPrevented).toBe(true);
      touch(dialog, 'pointerup', 110, FIRST_FINGER, PEN);
      browserClick(slot, 110);

      expect(entryClick).toHaveBeenCalledOnce();
      expect(slot).toHaveAttribute('data-visible', 'false');
      expect(clickAction).not.toHaveBeenCalled();
    });
  });
});
