import { isTouchOnlyDevice } from '../util/mobileDetection';
import { useDeviceDetection } from './useIsMobileDevice';

/**
 * Reports whether touch is the device's input: no mouse or trackpad, or a
 * phone or tablet (see {@link isTouchOnlyDevice}; some Samsung phones claim a
 * fine pointer they do not have). Use this to answer **input capability**
 * questions:
 *
 *   - Can the user perform Alt+click / right-click / scroll wheel?
 *   - Can the user press Ctrl+K or any keyboard shortcut?
 *   - Should a tutorial step be filtered out because it requires a mouse?
 *
 * Touchscreen laptops stay false: they also have a fine pointer and are not
 * phones or tablets.
 *
 * Do NOT use this for layout questions ("is the viewport narrow?"). Use
 * {@link useIsMobile} for that. The two intentionally answer different
 * questions: a tablet in landscape is wide (not "mobile" for layout) but
 * still has no mouse (very much "touch-only" for input).
 *
 * SSR-safe: returns `false` if `window` or `matchMedia` is unavailable.
 */
export function useIsTouchOnly(): boolean {
  return useDeviceDetection(isTouchOnlyDeviceNow);
}

const isTouchOnlyDeviceNow = () => isTouchOnlyDevice();
