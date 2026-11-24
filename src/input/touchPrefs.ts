/**
 * Touch-input preferences, as the gesture code reads them.
 *
 * The persisted settings own these values (`touchLongPressMs`, `touchMenuRowHeight`,
 * `touchHapticsEnabled`); `usePersistedSettings` mirrors them here so that the gesture
 * recognizers, which live outside any one React subtree (the 3D canvas, every panel's menu
 * binding), can read the current value at the moment a gesture starts.
 */

/**
 * Official mobile client "Long Tap Delay" default; the client lets the player adjust it.
 * The range and step are Scim's.
 */
export const TOUCH_LONG_PRESS_DEFAULT_MS = 300;
export const TOUCH_LONG_PRESS_MIN_MS = 100;
export const TOUCH_LONG_PRESS_MAX_MS = 1000;
export const TOUCH_LONG_PRESS_STEP_MS = 50;

/**
 * Minimum height of a context-menu row opened by touch. Provisional Scim default: the
 * mobile client's entry spacing is adjustable, but its default has not been measured, so
 * 28 CSS px is a finger-sized starting point rather than a reproduction.
 */
const TOUCH_MENU_ROW_HEIGHT_DEFAULT_PX = 28;
export const TOUCH_MENU_ROW_HEIGHT_MIN_PX = 20;
export const TOUCH_MENU_ROW_HEIGHT_MAX_PX = 48;
export const TOUCH_MENU_ROW_HEIGHT_STEP_PX = 2;

export interface TouchPrefs {
  /** Hold time that turns a stationary touch into a right-click. */
  readonly longPressMs: number;
  /** Minimum row height, in CSS px, of a menu a long-press opened. */
  readonly menuRowHeight: number;
  /** One short vibration when a long-press opens a menu. */
  readonly hapticsEnabled: boolean;
}

export const DEFAULT_TOUCH_PREFS: TouchPrefs = {
  longPressMs: TOUCH_LONG_PRESS_DEFAULT_MS,
  menuRowHeight: TOUCH_MENU_ROW_HEIGHT_DEFAULT_PX,
  hapticsEnabled: true,
};

let current: TouchPrefs = DEFAULT_TOUCH_PREFS;

export function getTouchPrefs(): TouchPrefs {
  return current;
}

export function setTouchPrefs(next: TouchPrefs): void {
  current = next;
}
