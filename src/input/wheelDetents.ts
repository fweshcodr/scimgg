/**
 * Wheel input in notches, shared by every wheel gesture that steps something: the
 * camera zoom and the Alt+scroll panel/overlay resize. One reader per gesture.
 */

/**
 * One wheel notch's worth of `deltaY`, per `deltaMode`, for the browsers that do
 * not report `wheelDeltaY`. A notch is ~100px in pixel mode, 3 lines, one page.
 */
const WHEEL_DELTA_PER_DETENT = [100, 3, 1] as const;

/** `wheelDeltaY` is exactly this per physical notch, on every engine that has it. */
const LEGACY_WHEEL_DELTA_PER_NOTCH = 120;

export interface WheelMotion {
  /** Notches turned — fractional only for a surface. */
  readonly notches: number;
  /** True when the device has physical detents, so this must not be accumulated. */
  readonly detented: boolean;
}

/**
 * How far the wheel turned, and whether it was a wheel at all.
 *
 * Two separate jobs, and conflating them is what made zoom feel slow. Chromium
 * and WebKit report a MULTIPLE OF 120 in `wheelDeltaY` for a real notch and
 * `-deltaY * 3` for a trackpad, so that multiple is the device test. But the
 * notch COUNT must come from `wheelDeltaY` too, not from `deltaY`: `deltaY` is a
 * scroll DISTANCE the browser scales per platform and per settings — 100px on
 * one setup, 53 on another — and a burst of three notches turned quickly may
 * arrive coalesced as a single event whose `deltaY` is nothing like 3 notches'
 * worth. Counting as `deltaY / 100` therefore silently drops motion on any
 * device that does not use 100: five clicks of a 53px mouse came out as two
 * notches, which is why zoom needed the increment cranked to keep up.
 *
 * Firefox reports no `wheelDeltaY`, but reports mice in LINE mode, so the
 * `deltaMode` quantum covers it and pixel mode there means a surface.
 */
export function readWheelMotion(event: WheelEvent): WheelMotion {
  const legacy = (event as WheelEvent & { wheelDeltaY?: number }).wheelDeltaY;
  if (typeof legacy === 'number' && legacy !== 0) {
    // wheelDeltaY runs opposite deltaY: a scroll DOWN is +deltaY and -wheelDeltaY.
    return {
      notches: -legacy / LEGACY_WHEEL_DELTA_PER_NOTCH,
      detented: Math.abs(legacy) % LEGACY_WHEEL_DELTA_PER_NOTCH === 0,
    };
  }
  const perDetent = WHEEL_DELTA_PER_DETENT[event.deltaMode] ?? WHEEL_DELTA_PER_DETENT[0];
  return { notches: event.deltaY / perDetent, detented: event.deltaMode !== 0 };
}

/**
 * Whole notches, carrying finer motion between events.
 *
 * The game's zoom moves 25 units per wheel NOTCH, so the browser side has to count
 * notches too. A trackpad fires a burst of small events
 * per gesture and must be accumulated, or zoom races away in proportion to how
 * fast it is swiped; a detented wheel must never be accumulated, or the first
 * click of every gesture banks a fraction and does nothing, which reads as
 * dropped scrolls.
 */
export function makeWheelDetentReader(): (event: WheelEvent) => number {
  let remainder = 0;
  return (event) => {
    const { notches, detented } = readWheelMotion(event);
    if (notches === 0) return 0;
    if (detented) {
      remainder = 0;
      return Math.round(notches) || Math.sign(notches);
    }
    // A reversal is a new gesture; carrying the old remainder across it would
    // spend the first notch of the new direction early.
    if (remainder !== 0 && Math.sign(notches) !== Math.sign(remainder)) remainder = 0;
    remainder += notches;
    // Fractions like 0.1 do not sum exactly: ten of them make 0.9999…, which would bank the
    // tenth event's notch. Nothing finer than a millionth of a notch is real motion.
    const whole = Math.trunc(remainder + Math.sign(remainder) * 1e-6);
    remainder -= whole;
    return whole;
  };
}
