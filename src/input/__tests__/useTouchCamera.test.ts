// @vitest-environment happy-dom

import { renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { stubMaxTouchPoints } from '../../test/helpers/maxTouchPoints';
import { type HeldTouch, TOUCH_SLOP_PX, takeHeldTouch } from '../touchHold';
import { DEFAULT_TOUCH_PREFS, setTouchPrefs } from '../touchPrefs';
import { useTouchCamera } from '../useTouchCamera';

describe('useTouchCamera tap, hold and drag arbitration', () => {
  let canvas: HTMLDivElement;

  beforeEach(() => {
    vi.useFakeTimers();
    canvas = document.createElement('div');
    document.body.appendChild(canvas);
  });

  afterEach(() => {
    canvas.remove();
    vi.useRealTimers();
    setTouchPrefs(DEFAULT_TOUCH_PREFS);
  });

  function mount() {
    const taken: (HeldTouch | null)[] = [];
    const handlers = {
      rotate: vi.fn(),
      pinchStart: vi.fn(),
      pinch: vi.fn(),
      // The world's menu opens synchronously from here, which is when it takes the finger.
      longPress: vi.fn(() => {
        taken.push(takeHeldTouch());
      }),
    };
    const walk = vi.fn();
    canvas.addEventListener('mousedown', walk);
    const view = renderHook(() => useTouchCamera({ current: canvas }, handlers));
    return { handlers, walk, taken, unmount: view.unmount };
  }

  function touch(type: string, x: number) {
    canvas.dispatchEvent(
      new PointerEvent(type, {
        bubbles: true,
        cancelable: true,
        pointerType: 'touch',
        pointerId: 3,
        isPrimary: true,
        clientX: x,
        clientY: 50,
      }),
    );
  }

  it('walks on a tap released before the 300 ms hold', () => {
    const { handlers, walk } = mount();

    touch('pointerdown', 40);
    vi.advanceTimersByTime(299);
    touch('pointerup', 40);

    expect(walk).toHaveBeenCalledOnce();
    expect(handlers.longPress).not.toHaveBeenCalled();
  });

  it('walks, once and where the touch landed, on a tap that wobbles inside the slop', () => {
    const { handlers, walk } = mount();

    touch('pointerdown', 40);
    touch('pointermove', 40 + TOUCH_SLOP_PX - 1);
    touch('pointermove', 34);
    vi.advanceTimersByTime(200);
    touch('pointerup', 46);

    expect(walk).toHaveBeenCalledOnce();
    expect(walk.mock.calls[0][0]).toMatchObject({ clientX: 40, clientY: 50, button: 0 });
    expect(handlers.rotate).not.toHaveBeenCalled();
    expect(handlers.longPress).not.toHaveBeenCalled();
  });

  it('opens the menu at the 300 ms hold, handing it the finger, and never walks', () => {
    const { handlers, walk, taken } = mount();

    touch('pointerdown', 40);
    vi.advanceTimersByTime(300);
    // The menu now owns the slide; the camera neither rotates nor walks for it.
    touch('pointermove', 90);
    touch('pointerup', 90);

    expect(handlers.longPress).toHaveBeenCalledExactlyOnceWith(40, 50);
    expect(taken).toEqual([{ pointerId: 3, clientX: 40, clientY: 50 }]);
    expect(handlers.rotate).not.toHaveBeenCalled();
    expect(walk).not.toHaveBeenCalled();
  });

  it('rotates once the touch travels before the hold, and never holds', () => {
    const { handlers, walk } = mount();

    touch('pointerdown', 40);
    touch('pointermove', 40 + TOUCH_SLOP_PX);
    touch('pointermove', 70);
    vi.advanceTimersByTime(1000);
    touch('pointerup', 70);

    expect(handlers.rotate).toHaveBeenCalled();
    expect(handlers.longPress).not.toHaveBeenCalled();
    expect(walk).not.toHaveBeenCalled();
  });

  it('turns a swipe into rotation from where it crossed the slop, and never walks', () => {
    const { handlers, walk } = mount();

    touch('pointerdown', 40);
    touch('pointermove', 50);
    touch('pointermove', 40 + TOUCH_SLOP_PX + 2);
    touch('pointermove', 120);
    touch('pointerup', 120);

    // Only the travel past the crossing turns the camera, so it does not jump by the slop.
    expect(handlers.rotate.mock.calls.reduce((sum, [dx]) => sum + dx, 0)).toBe(120 - (40 + TOUCH_SLOP_PX + 2));
    expect(walk).not.toHaveBeenCalled();
  });

  it("swallows the browser's click for a tap, so it cannot press what the tap opened", () => {
    const { walk } = mount();
    // What the tap opens (e.g. the lobby encounter's configurer) lands under the finger.
    const opened = document.createElement('button');
    const press = vi.fn();
    opened.addEventListener('click', press);
    walk.mockImplementation(() => document.body.appendChild(opened));

    touch('pointerdown', 40);
    touch('pointerup', 40);
    // The click the browser still sends for the touch, hit-testing what is now on top.
    opened.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, detail: 1 }));
    expect(walk).toHaveBeenCalledOnce();
    expect(press).not.toHaveBeenCalled();

    // A later, real tap on it is a press again.
    touch('pointerdown', 40);
    opened.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, detail: 1 }));
    expect(press).toHaveBeenCalledOnce();
    opened.remove();
  });

  it('neither walks nor holds for a canceled touch, and leaves the mouse events after it alone', () => {
    const { handlers, walk } = mount();
    const click = vi.fn();
    canvas.addEventListener('click', click);

    touch('pointerdown', 40);
    touch('pointercancel', 40);
    vi.advanceTimersByTime(1000);
    expect(walk).not.toHaveBeenCalled();
    expect(handlers.longPress).not.toHaveBeenCalled();

    // The camera handled nothing for the canceled touch, so it has no mouse events to swallow.
    for (const type of ['mousedown', 'mouseup', 'click']) {
      canvas.dispatchEvent(new MouseEvent(type, { bubbles: true, cancelable: true, detail: 1 }));
    }
    expect(walk).toHaveBeenCalledOnce();
    expect(click).toHaveBeenCalledOnce();
  });

  function finger(type: string, pointerId: number, x: number) {
    canvas.dispatchEvent(
      new PointerEvent(type, {
        bubbles: true,
        cancelable: true,
        pointerType: 'touch',
        pointerId,
        isPrimary: pointerId === 1,
        clientX: x,
        clientY: 50,
      }),
    );
  }

  it('does not spin the camera with the finger left when a pinch loses the other', () => {
    const { handlers, walk } = mount();

    finger('pointerdown', 1, 100);
    finger('pointerdown', 2, 200);
    finger('pointermove', 2, 300);
    expect(handlers.pinch).toHaveBeenLastCalledWith(2);

    // The screen drops one contact while both fingers are still pinching.
    finger('pointerup', 2, 300);
    finger('pointermove', 1, 20);
    finger('pointermove', 1, -60);
    expect(handlers.rotate).not.toHaveBeenCalled();

    // A finger landing again picks the pinch up from the current spread.
    finger('pointerdown', 3, 140);
    finger('pointermove', 3, 340);
    expect(handlers.pinch).toHaveBeenLastCalledWith(2);

    finger('pointerup', 3, 340);
    finger('pointerup', 1, -60);
    expect(handlers.rotate).not.toHaveBeenCalled();
    expect(walk).not.toHaveBeenCalled();
  });

  it('keeps pinching between the first two fingers when a third contact rests on the screen', () => {
    const { handlers } = mount();

    finger('pointerdown', 1, 100);
    finger('pointerdown', 2, 200);
    finger('pointerdown', 4, 400);
    finger('pointermove', 2, 300);
    expect(handlers.pinch).toHaveBeenLastCalledWith(2);

    // The resting contact lifts; the pinch carries on from the spread it had.
    finger('pointerup', 4, 400);
    finger('pointermove', 2, 500);
    expect(handlers.pinch).toHaveBeenLastCalledWith(2);
    expect(handlers.rotate).not.toHaveBeenCalled();
  });

  it('forgets a finger whose lift it never saw, so the next gesture rotates and pinches normally', () => {
    const { handlers } = mount();

    finger('pointerdown', 1, 100);
    finger('pointerdown', 2, 200);
    finger('pointerup', 2, 200);
    // Finger 1's lift went elsewhere. A new primary touch starts afresh.
    finger('pointerdown', 1, 100);
    finger('pointermove', 1, 100 + TOUCH_SLOP_PX);
    finger('pointermove', 1, 150);
    expect(handlers.rotate).toHaveBeenCalled();

    finger('pointerdown', 2, 250);
    finger('pointermove', 2, 350);
    expect(handlers.pinch).toHaveBeenLastCalledWith(2);
  });

  it('follows a custom long-press time', () => {
    setTouchPrefs({ ...DEFAULT_TOUCH_PREFS, longPressMs: 700 });
    const { handlers, walk } = mount();

    touch('pointerdown', 40);
    vi.advanceTimersByTime(500);
    touch('pointerup', 40);
    expect(walk).toHaveBeenCalledOnce();
    expect(handlers.longPress).not.toHaveBeenCalled();

    touch('pointerdown', 40);
    vi.advanceTimersByTime(700);
    expect(handlers.longPress).toHaveBeenCalledOnce();
  });

  describe('a pen, and a mouse beside it', () => {
    // A touchscreen, so the pen writes on the screen (see isTouchPointer); one case below takes it away.
    let restoreTouchPoints = () => {};
    beforeEach(() => {
      restoreTouchPoints = stubMaxTouchPoints(10);
    });
    afterEach(() => {
      restoreTouchPoints();
    });

    /** Returns the event, so a test can see whether the camera took the press over. */
    function pointer(pointerType: 'pen' | 'mouse', type: string, x: number, init: PointerEventInit = {}): PointerEvent {
      const event = new PointerEvent(type, {
        bubbles: true,
        cancelable: true,
        pointerType,
        pointerId: pointerType === 'pen' ? 7 : 1,
        isPrimary: true,
        clientX: x,
        clientY: 50,
        ...init,
      });
      canvas.dispatchEvent(event);
      return event;
    }
    const pen = (type: string, x: number, init?: PointerEventInit) => pointer('pen', type, x, init);

    it('taps like a finger: one walk, and the browser click swallowed', () => {
      const { handlers, walk } = mount();
      const release = vi.fn();
      const click = vi.fn();
      canvas.addEventListener('mouseup', release);
      canvas.addEventListener('click', click);

      // Canceled, so the browser sends no compatibility mousedown or mouseup for the pen.
      expect(pen('pointerdown', 40, { buttons: 1 }).defaultPrevented).toBe(true);
      pen('pointerup', 40);
      canvas.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, detail: 1 }));

      expect(walk).toHaveBeenCalledOnce();
      expect(release).toHaveBeenCalledOnce();
      expect(click).not.toHaveBeenCalled();
      expect(handlers.longPress).not.toHaveBeenCalled();
    });

    it('rotates on a drag and opens the menu on a hold', () => {
      const { handlers, walk, taken } = mount();

      pen('pointerdown', 40, { buttons: 1 });
      pen('pointermove', 40 + TOUCH_SLOP_PX, { buttons: 1 });
      pen('pointermove', 70, { buttons: 1 });
      pen('pointerup', 70);
      expect(handlers.rotate).toHaveBeenCalled();

      pen('pointerdown', 40, { buttons: 1 });
      vi.advanceTimersByTime(300);
      pen('pointerup', 40);
      expect(handlers.longPress).toHaveBeenCalledExactlyOnceWith(40, 50);
      expect(taken).toEqual([{ pointerId: 7, clientX: 40, clientY: 50 }]);
      expect(walk).not.toHaveBeenCalled();
    });

    it('ignores a pen hovering above the screen before and after its tap', () => {
      const { handlers, walk } = mount();

      pen('pointermove', 40);
      pen('pointermove', 120);
      pen('pointerdown', 120, { buttons: 1 });
      pen('pointerup', 120);
      pen('pointermove', 200);
      vi.advanceTimersByTime(1000);

      expect(walk).toHaveBeenCalledOnce();
      expect(handlers.rotate).not.toHaveBeenCalled();
      expect(handlers.longPress).not.toHaveBeenCalled();
    });

    it('leaves a pen on a separate pad (no touchscreen) to the desktop handlers, as a mouse', () => {
      restoreTouchPoints();
      restoreTouchPoints = stubMaxTouchPoints(0);
      const { handlers, walk } = mount();

      expect(pen('pointerdown', 40, { buttons: 1 }).defaultPrevented).toBe(false);
      pen('pointermove', 40 + TOUCH_SLOP_PX, { buttons: 1 });
      pen('pointermove', 90, { buttons: 1 });
      vi.advanceTimersByTime(1000);
      pen('pointerup', 90);

      expect(walk).not.toHaveBeenCalled();
      expect(handlers.rotate).not.toHaveBeenCalled();
      expect(handlers.longPress).not.toHaveBeenCalled();
    });

    it("leaves a mouse's press to the desktop handlers, and lets its click through after a tap", () => {
      const { handlers, walk } = mount();
      const click = vi.fn();
      canvas.addEventListener('click', click);

      // A pen tap arms the swallow for the browser's click, which here never comes.
      pen('pointerdown', 40, { buttons: 1 });
      pen('pointerup', 40);
      expect(walk).toHaveBeenCalledOnce();

      expect(pointer('mouse', 'pointerdown', 40, { buttons: 1 }).defaultPrevented).toBe(false);
      pointer('mouse', 'pointermove', 40 + TOUCH_SLOP_PX, { buttons: 1 });
      pointer('mouse', 'pointermove', 90, { buttons: 1 });
      vi.advanceTimersByTime(1000);
      pointer('mouse', 'pointerup', 90);
      canvas.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, detail: 1 }));

      expect(walk).toHaveBeenCalledOnce();
      expect(click).toHaveBeenCalledOnce();
      expect(handlers.rotate).not.toHaveBeenCalled();
      expect(handlers.longPress).not.toHaveBeenCalled();
    });
  });
});
