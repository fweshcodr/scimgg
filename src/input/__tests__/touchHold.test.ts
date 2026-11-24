// @vitest-environment happy-dom

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { stubMaxTouchPoints } from '../../test/helpers/maxTouchPoints';
import {
  type CompatMouseSwallow,
  dispatchTap,
  holdTouchPanBlock,
  holdTouchPanBlockUntilLift,
  isTouchPointer,
  listenCompatMouseSwallow,
  listenTouchPanBlock,
  pulseLongPressHaptic,
  TOUCH_SLOP_PX,
  takeHeldTouch,
  watchTouchPress,
} from '../touchHold';
import { DEFAULT_TOUCH_PREFS, setTouchPrefs, TOUCH_LONG_PRESS_DEFAULT_MS } from '../touchPrefs';

function pointer(type: string, x: number, id = 1, primary = true): PointerEvent {
  const event = new PointerEvent(type, {
    bubbles: true,
    cancelable: true,
    pointerType: 'touch',
    pointerId: id,
    isPrimary: primary,
    clientX: x,
    clientY: 50,
  });
  window.dispatchEvent(event);
  return event;
}

function press(x = 40) {
  const handlers = { onHold: vi.fn(), onTap: vi.fn(), onTravel: vi.fn() };
  const stop = watchTouchPress(pointer('pointerdown', x), handlers);
  return { ...handlers, stop };
}

describe('watchTouchPress arbitration', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    setTouchPrefs(DEFAULT_TOUCH_PREFS);
  });

  it('holds at the 300 ms default, the mobile client long tap', () => {
    expect(TOUCH_LONG_PRESS_DEFAULT_MS).toBe(300);
    const { onHold, onTap, onTravel } = press();

    vi.advanceTimersByTime(299);
    expect(onHold).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    pointer('pointerup', 40);

    expect(onHold).toHaveBeenCalledOnce();
    expect(onTap).not.toHaveBeenCalled();
    expect(onTravel).not.toHaveBeenCalled();
  });

  it('taps when the touch lifts in place before the hold', () => {
    const { onHold, onTap, onTravel } = press();

    vi.advanceTimersByTime(299);
    pointer('pointerup', 40 + TOUCH_SLOP_PX - 1);
    vi.advanceTimersByTime(1000);

    expect(onTap).toHaveBeenCalledOnce();
    expect(onHold).not.toHaveBeenCalled();
    expect(onTravel).not.toHaveBeenCalled();
  });

  it('reports travel past the slop first, and then neither a hold nor a tap', () => {
    const { onHold, onTap, onTravel } = press();

    pointer('pointermove', 40 + TOUCH_SLOP_PX - 1);
    expect(onTravel).not.toHaveBeenCalled();
    const crossing = pointer('pointermove', 40 + TOUCH_SLOP_PX);
    vi.advanceTimersByTime(1000);
    pointer('pointerup', 40);

    expect(onTravel).toHaveBeenCalledExactlyOnceWith(crossing);
    expect(onHold).not.toHaveBeenCalled();
    expect(onTap).not.toHaveBeenCalled();
  });

  it('ignores travel once the hold has won', () => {
    const { onHold, onTravel } = press();

    vi.advanceTimersByTime(300);
    pointer('pointermove', 200);

    expect(onHold).toHaveBeenCalledOnce();
    expect(onTravel).not.toHaveBeenCalled();
  });

  it('holds at a custom long-press time, read when the press began', () => {
    setTouchPrefs({ ...DEFAULT_TOUCH_PREFS, longPressMs: 600 });
    const { onHold } = press();
    // A change mid-press does not move this press's deadline.
    setTouchPrefs({ ...DEFAULT_TOUCH_PREFS, longPressMs: 100 });

    vi.advanceTimersByTime(599);
    expect(onHold).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(onHold).toHaveBeenCalledOnce();

    // The next press reads the new value.
    const next = press();
    vi.advanceTimersByTime(100);
    expect(next.onHold).toHaveBeenCalledOnce();
  });

  it('a slow tap under a custom long-press time is still a tap', () => {
    setTouchPrefs({ ...DEFAULT_TOUCH_PREFS, longPressMs: 600 });
    const { onHold, onTap } = press();

    vi.advanceTimersByTime(450);
    pointer('pointerup', 40);

    expect(onTap).toHaveBeenCalledOnce();
    expect(onHold).not.toHaveBeenCalled();
  });

  it('hands the held finger to whatever the hold opens, once, and only during the hold', () => {
    const taken: unknown[] = [];
    watchTouchPress(pointer('pointerdown', 40, 7), {
      onHold: () => {
        taken.push(takeHeldTouch(), takeHeldTouch());
      },
    });
    expect(takeHeldTouch()).toBeNull();

    vi.advanceTimersByTime(300);

    expect(taken).toEqual([{ pointerId: 7, clientX: 40, clientY: 50 }, null]);
    expect(takeHeldTouch()).toBeNull();
  });

  it('forgets the held finger even when the hold throws', () => {
    watchTouchPress(pointer('pointerdown', 40), {
      onHold: () => {
        throw new Error('boom');
      },
    });

    expect(() => vi.advanceTimersByTime(300)).toThrow('boom');
    expect(takeHeldTouch()).toBeNull();
  });

  it('declines a hold that returns false: the press goes on, and its release taps', () => {
    const onTap = vi.fn();
    const onHold = vi.fn(() => false);
    watchTouchPress(pointer('pointerdown', 40), { onHold, onTap });

    vi.advanceTimersByTime(TOUCH_LONG_PRESS_DEFAULT_MS * 3);
    pointer('pointerup', 40);

    expect(onHold).toHaveBeenCalledOnce();
    expect(onTap).toHaveBeenCalledOnce();
  });

  it('hands over the finger where it is at the hold, not where it landed', () => {
    const taken: unknown[] = [];
    watchTouchPress(pointer('pointerdown', 40, 7), {
      onHold: () => {
        taken.push(takeHeldTouch());
      },
    });
    pointer('pointermove', 40 + TOUCH_SLOP_PX - 2, 7);

    vi.advanceTimersByTime(300);

    expect(taken).toEqual([{ pointerId: 7, clientX: 40 + TOUCH_SLOP_PX - 2, clientY: 50 }]);
  });

  it('ends with nothing on a cancel, a second finger, or losing focus', () => {
    const cancelled = press();
    pointer('pointercancel', 40);
    const secondFinger = press();
    pointer('pointerdown', 40, 2, false);
    const blurred = press();
    window.dispatchEvent(new Event('blur'));

    vi.advanceTimersByTime(1000);
    pointer('pointerup', 40);

    for (const watch of [cancelled, secondFinger, blurred]) {
      expect(watch.onHold).not.toHaveBeenCalled();
      expect(watch.onTap).not.toHaveBeenCalled();
      expect(watch.onTravel).not.toHaveBeenCalled();
    }
  });
});

describe('watchTouchPress on a target that does not drag', () => {
  let target: HTMLElement;

  beforeEach(() => {
    vi.useFakeTimers();
    target = document.createElement('button');
    document.body.appendChild(target);
    // A 27 px stone, as a 34 px prayer is at the smallest Mobile scale.
    target.getBoundingClientRect = () => new DOMRect(30, 40, 27, 27);
  });

  afterEach(() => {
    target.remove();
    vi.useRealTimers();
  });

  function at(type: string, x: number, y: number) {
    const event = new PointerEvent(type, {
      bubbles: true,
      cancelable: true,
      pointerType: 'touch',
      pointerId: 1,
      isPrimary: true,
      clientX: x,
      clientY: y,
    });
    window.dispatchEvent(event);
    return event;
  }

  function pressAt(x: number, y: number) {
    const handlers = { onHold: vi.fn(), onTap: vi.fn(), onTravel: vi.fn() };
    watchTouchPress(at('pointerdown', x, y), { ...handlers, within: target });
    return handlers;
  }

  it('taps on a release anywhere on the target, however far the finger wobbled across it', () => {
    const { onTap, onTravel, onHold } = pressAt(32, 42);

    // 20 px and more from where it landed, all on the stone.
    at('pointermove', 52, 42);
    at('pointermove', 55, 64);
    at('pointerup', 50, 62);

    expect(onTap).toHaveBeenCalledOnce();
    expect(onTravel).not.toHaveBeenCalled();
    expect(onHold).not.toHaveBeenCalled();
  });

  it('keeps the press within the slop of the target, and ends it beyond', () => {
    const near = pressAt(50, 50);
    at('pointerup', 57 + TOUCH_SLOP_PX, 50);
    expect(near.onTap).toHaveBeenCalledOnce();

    const off = pressAt(50, 50);
    const leaving = at('pointermove', 57 + TOUCH_SLOP_PX + 1, 50);
    at('pointermove', 50, 50);
    at('pointerup', 50, 50);
    expect(off.onTravel).toHaveBeenCalledExactlyOnceWith(leaving);
    expect(off.onTap).not.toHaveBeenCalled();
  });

  it('does not tap on a release away from the target', () => {
    const { onTap } = pressAt(50, 50);

    at('pointerup', 50, 67 + TOUCH_SLOP_PX + 1);

    expect(onTap).not.toHaveBeenCalled();
  });

  it('still holds after the finger moved about on the target', () => {
    const { onHold, onTap } = pressAt(32, 42);

    at('pointermove', 54, 64);
    vi.advanceTimersByTime(TOUCH_LONG_PRESS_DEFAULT_MS);
    at('pointerup', 54, 64);

    expect(onHold).toHaveBeenCalledOnce();
    expect(onTap).not.toHaveBeenCalled();
  });
});

describe('listenCompatMouseSwallow', () => {
  const WATCHED = ['mousedown', 'mouseup', 'click'] as const;
  let target: HTMLElement;
  let received: string[];
  let swallows: CompatMouseSwallow[];
  const record = (e: Event) => received.push(e.type);

  beforeEach(() => {
    target = document.createElement('div');
    document.body.appendChild(target);
    received = [];
    swallows = [];
    for (const type of WATCHED) target.addEventListener(type, record);
  });

  afterEach(() => {
    for (const swallow of swallows) swallow.dispose();
    target.remove();
  });

  function listen(): CompatMouseSwallow {
    const swallow = listenCompatMouseSwallow(WATCHED);
    swallows.push(swallow);
    return swallow;
  }

  /** A browser's mouse event; its clicks count one press (`detail` 1), as a compatibility click does. */
  function mouse(type: string, detail = 1): MouseEvent {
    const event = new MouseEvent(type, { bubbles: true, cancelable: true, detail });
    target.dispatchEvent(event);
    return event;
  }

  function pointerOn(type: string, pointerType: string): void {
    target.dispatchEvent(new PointerEvent(type, { bubbles: true, cancelable: true, pointerType, isPrimary: true }));
  }

  it('swallows one event of each watched type once armed, and lets the next ones through', () => {
    listen().arm();

    const swallowed = WATCHED.map((type) => mouse(type));
    expect(received).toEqual([]);
    expect(swallowed.every((e) => e.defaultPrevented)).toBe(true);

    const passed = WATCHED.map((type) => mouse(type));
    expect(received).toEqual([...WATCHED]);
    expect(passed.some((e) => e.defaultPrevented)).toBe(false);
  });

  it('lets a keyboard click through without spending the pending click', () => {
    listen().arm();

    const keyboard = mouse('click', 0);
    expect(received).toEqual(['click']);
    expect(keyboard.defaultPrevented).toBe(false);

    expect(mouse('click').defaultPrevented).toBe(true);
    expect(received).toEqual(['click']);
  });

  it.each(['mouse', 'pen'])('disarms on a %s pointerdown, which owns the mouse events that follow', (pointerType) => {
    listen().arm();

    pointerOn('pointerdown', pointerType);
    const events = WATCHED.map((type) => mouse(type));

    expect(received).toEqual([...WATCHED]);
    expect(events.some((e) => e.defaultPrevented)).toBe(false);
  });

  it('disarms on a touch pointercancel, which the browser follows with no compatibility events', () => {
    listen().arm();

    pointerOn('pointercancel', 'touch');
    for (const type of WATCHED) mouse(type);

    expect(received).toEqual([...WATCHED]);
  });

  it('disarms on a new touch, which an owner can then arm for to take its click', () => {
    const swallow = listen();
    swallow.arm();
    // The browser never sent the earlier touch's click; the next touch's click is its own.
    pointerOn('pointerdown', 'touch');
    mouse('click');
    expect(received).toEqual(['click']);

    // An owner claiming the next touch arms from its own pointerdown, after the disarm.
    const claim = () => swallow.arm();
    target.addEventListener('pointerdown', claim);
    pointerOn('pointerdown', 'touch');
    target.removeEventListener('pointerdown', claim);
    expect(mouse('click').defaultPrevented).toBe(true);
    expect(received).toEqual(['click']);
  });

  it("passes the page's own dispatched tap without spending what it swallows", () => {
    listen().arm();

    dispatchTap(target, 10, 20, {}, WATCHED);
    expect(received).toEqual([...WATCHED]);

    for (const type of WATCHED) mouse(type);
    expect(received).toEqual([...WATCHED]);
  });

  it('swallows nothing once disposed', () => {
    const swallow = listen();
    swallow.arm();
    swallow.dispose();

    for (const type of WATCHED) mouse(type);

    expect(received).toEqual([...WATCHED]);
  });
});

describe('pulseLongPressHaptic', () => {
  const original = Object.getOwnPropertyDescriptor(navigator, 'vibrate');

  afterEach(() => {
    if (original) Object.defineProperty(navigator, 'vibrate', original);
    else Reflect.deleteProperty(navigator, 'vibrate');
    setTouchPrefs(DEFAULT_TOUCH_PREFS);
  });

  function stubVibrate(impl: (pattern: VibratePattern) => unknown) {
    const vibrate = vi.fn(impl);
    Object.defineProperty(navigator, 'vibrate', { value: vibrate, configurable: true, writable: true });
    return vibrate;
  }

  it('sends one short pulse', () => {
    const vibrate = stubVibrate(() => true);

    pulseLongPressHaptic();

    expect(vibrate).toHaveBeenCalledExactlyOnceWith(15);
  });

  it('stays silent when turned off', () => {
    const vibrate = stubVibrate(() => true);
    setTouchPrefs({ ...DEFAULT_TOUCH_PREFS, hapticsEnabled: false });

    pulseLongPressHaptic();

    expect(vibrate).not.toHaveBeenCalled();
  });

  it('is harmless where vibration is missing, throws, or rejects', async () => {
    Reflect.deleteProperty(navigator, 'vibrate');
    Object.defineProperty(navigator, 'vibrate', { value: undefined, configurable: true, writable: true });
    expect(() => pulseLongPressHaptic()).not.toThrow();

    stubVibrate(() => {
      throw new Error('blocked');
    });
    expect(() => pulseLongPressHaptic()).not.toThrow();

    const unhandled = vi.fn();
    process.on('unhandledRejection', unhandled);
    try {
      stubVibrate(() => Promise.reject(new Error('denied')));
      expect(() => pulseLongPressHaptic()).not.toThrow();
      await new Promise((resolve) => setTimeout(resolve, 0));
      expect(unhandled).not.toHaveBeenCalled();
    } finally {
      process.off('unhandledRejection', unhandled);
    }
  });
});

describe('touch pan block', () => {
  it('cancels touchmoves only while held', () => {
    const remove = listenTouchPanBlock();
    try {
      const move = () => {
        const event = new Event('touchmove', { bubbles: true, cancelable: true });
        document.body.dispatchEvent(event);
        return event.defaultPrevented;
      };
      expect(move()).toBe(false);

      const release = holdTouchPanBlock();
      expect(move()).toBe(true);
      release();
      release();
      expect(move()).toBe(false);
    } finally {
      remove();
    }
  });

  it('blocks for the rest of a touch: until it lifts or cancels, a second finger lands, or focus goes', () => {
    const remove = listenTouchPanBlock();
    try {
      const move = () => {
        const event = new Event('touchmove', { bubbles: true, cancelable: true });
        document.body.dispatchEvent(event);
        return event.defaultPrevented;
      };

      holdTouchPanBlockUntilLift(pointer('pointerdown', 40));
      pointer('pointermove', 80);
      // Another finger's release is not this touch's.
      pointer('pointerup', 80, 9, false);
      expect(move()).toBe(true);
      pointer('pointerup', 80);
      expect(move()).toBe(false);

      holdTouchPanBlockUntilLift(pointer('pointerdown', 40));
      pointer('pointercancel', 40);
      expect(move()).toBe(false);

      holdTouchPanBlockUntilLift(pointer('pointerdown', 40));
      // A pinch is the browser's to zoom.
      pointer('pointerdown', 90, 2, false);
      expect(move()).toBe(false);

      holdTouchPanBlockUntilLift(pointer('pointerdown', 40));
      window.dispatchEvent(new Event('blur'));
      expect(move()).toBe(false);
    } finally {
      remove();
    }
  });
});

describe('isTouchPointer', () => {
  let restoreTouchPoints = () => {};

  afterEach(() => {
    vi.restoreAllMocks();
    restoreTouchPoints();
    restoreTouchPoints = () => {};
  });

  /** A coarse pointer and no fine one is a phone or tablet; a touchscreen alone is not. */
  function stubDevice(touchOnly: boolean, maxTouchPoints: number): void {
    vi.spyOn(window, 'matchMedia').mockImplementation(
      (query: string) =>
        ({
          matches: touchOnly && query.includes('coarse'),
          media: query,
          addEventListener: vi.fn(),
          removeEventListener: vi.fn(),
        }) as unknown as MediaQueryList,
    );
    restoreTouchPoints = stubMaxTouchPoints(maxTouchPoints);
  }

  it.each([
    { device: 'a phone', touchOnly: true, maxTouchPoints: 5, touch: true, pen: true, mouse: false },
    // A browser misreporting the touchscreen must not take a phone's S Pen off the touch model.
    {
      device: 'a phone reporting no touch points',
      touchOnly: true,
      maxTouchPoints: 0,
      touch: true,
      pen: true,
      mouse: false,
    },
    { device: 'a touchscreen laptop', touchOnly: false, maxTouchPoints: 10, touch: true, pen: true, mouse: false },
    // The pen is on a separate pad (a Wacom Intuos on a PC, any tablet on a Mac).
    {
      device: 'a computer without a touchscreen',
      touchOnly: false,
      maxTouchPoints: 0,
      touch: true,
      pen: false,
      mouse: false,
    },
  ])('on $device: finger $touch, pen $pen, mouse $mouse', ({ touchOnly, maxTouchPoints, touch, pen, mouse }) => {
    stubDevice(touchOnly, maxTouchPoints);

    expect(isTouchPointer({ pointerType: 'touch' })).toBe(touch);
    expect(isTouchPointer({ pointerType: 'pen' })).toBe(pen);
    expect(isTouchPointer({ pointerType: 'mouse' })).toBe(mouse);
  });
});
