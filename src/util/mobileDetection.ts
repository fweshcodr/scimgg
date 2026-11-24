import { type DeviceMode, getDeviceMode } from './deviceMode';

/** iPhone, iPod, or iPad, including iPadOS 13+ which reports a Macintosh user agent. */
export function isAppleTouchDevice(nav: Navigator = navigator): boolean {
  const ua = nav.userAgent ?? '';
  if (/iPhone|iPod|iPad/i.test(ua)) return true;
  return /Macintosh/.test(ua) && (nav.maxTouchPoints ?? 0) > 1;
}

/**
 * Whether to treat this device as a phone or tablet: the user's forced choice in Settings, or
 * {@link detectMobileDevice} on Automatic.
 */
export function isMobileDevice(mode: DeviceMode = getDeviceMode()): boolean {
  return mode === 'auto' ? detectMobileDevice() : mode === 'mobile';
}

/** Reports touch hardware, not the active input; offers touch settings on hybrid devices. */
export function hasTouchscreen(): boolean {
  return typeof navigator !== 'undefined' && navigator.maxTouchPoints > 0;
}

/**
 * Phone/tablet detection. There is no single reliable signal, so this combines several, any one of
 * which is enough. Hard requirements break it:
 *
 * - Samsung phones and foldables report a fine pointer with no mouse attached (stylus digitizer, or
 *   a virtual mouse device), so `any-pointer: fine` must never veto a device.
 * - iPadOS 13+ sends a Macintosh user agent; only its touch points give it away.
 * - Android browsers in "desktop site" mode send an `X11; Linux x86_64` user agent; only touch
 *   hardware, a touch-primary pointer or an ARM platform give them away.
 *
 * Whatever the user agent says, a touchscreen with no mouse or trackpad is treated as a tablet:
 * the desktop layout needs a mouse. That includes a Windows or ChromeOS tablet with its keyboard
 * detached, which goes back to desktop when the keyboard (and its trackpad) returns. Touchscreen
 * laptops keep the desktop layout, since they also have a fine pointer.
 */
export function detectMobileDevice(): boolean {
  if (typeof navigator === 'undefined') return false;

  const ua = navigator.userAgent ?? '';
  if (MOBILE_UA_PATTERN.test(ua)) return true;
  if (userAgentDataMobile()) return true;

  const maxTouchPoints = typeof navigator.maxTouchPoints === 'number' ? navigator.maxTouchPoints : 0;
  // Touch points rule out coarse-only screens with no touch, such as TV remotes.
  if (maxTouchPoints > 0 && matchesMedia(TOUCH_ONLY_QUERY)) return true;
  if (maxTouchPoints <= 1) return false;

  // iPadOS 13+ (Macs report no touch points).
  if (/Macintosh/.test(ua)) return true;

  return desktopSiteAndroid(ua, maxTouchPoints);
}

/** An `X11; Linux` user agent on multi-touch hardware. ChromeOS also says Linux but is a laptop. */
function desktopSiteAndroid(ua: string, maxTouchPoints: number): boolean {
  if (maxTouchPoints <= 1 || !/\bLinux\b/.test(ua) || /\bCrOS\b/.test(ua)) return false;
  return matchesMedia(TOUCH_PRIMARY_QUERY) || /arm|aarch64/i.test(navigator.platform ?? '');
}

/**
 * Whether touch is the device's input: no mouse or trackpad, or a phone or tablet. The device check
 * catches the Samsung phones that advertise a fine pointer they do not have. Forcing Desktop
 * leaves only the raw input check, so a touch-only screen keeps working touch controls.
 */
export function isTouchOnlyDevice(mode: DeviceMode = getDeviceMode()): boolean {
  return matchesMedia(TOUCH_ONLY_QUERY) || isMobileDevice(mode);
}

/** Module-level so the regex is allocated once, and so tests can assert against it directly. */
export const MOBILE_UA_PATTERN = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini|Mobile/i;

/** A finger and no mouse or trackpad. False on phones that advertise a stylus or virtual mouse. */
export const TOUCH_ONLY_QUERY = '(any-pointer: coarse) and (not (any-pointer: fine))';
/** The primary input is a finger. Survives a stylus or extra pointer being present. */
export const TOUCH_PRIMARY_QUERY = '(pointer: coarse) and (hover: none)';
/** The media queries the detection reads, for hooks that recompute when input devices change. */
export const DEVICE_DETECTION_QUERIES = [TOUCH_ONLY_QUERY, TOUCH_PRIMARY_QUERY] as const;

function matchesMedia(query: string): boolean {
  return typeof window !== 'undefined' && typeof window.matchMedia === 'function' && window.matchMedia(query).matches;
}

/** Chromium's client-hint flag; absent in Safari and Firefox. */
function userAgentDataMobile(): boolean {
  const data = (navigator as Navigator & { userAgentData?: { mobile?: unknown } }).userAgentData;
  return data?.mobile === true;
}
