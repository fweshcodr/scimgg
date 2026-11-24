/**
 * Browser fullscreen and orientation helpers for the mobile entry flow.
 *
 * The OSRS mobile client is full screen and landscape-only. A web page can only approach that
 * from a user gesture: element fullscreen plus an orientation lock (Android, iPadOS), or, on an
 * iPhone, which has no element Fullscreen API, by being launched from the Home Screen.
 */

import { isAppleTouchDevice } from './mobileDetection';

/** The prefixed members Safari on iPadOS still needs before 16.4. */
interface WebkitFullscreenDocument {
  webkitFullscreenEnabled?: boolean;
  webkitFullscreenElement?: Element | null;
}

interface WebkitFullscreenElement {
  webkitRequestFullscreen?: () => void;
}

/** `lock` is missing from some DOM lib versions and from every iOS browser. */
interface LockableOrientation {
  lock?: (orientation: 'landscape') => Promise<void>;
}

/**
 * How this browser can reach full screen.
 *
 * - `api`: the element Fullscreen API works (Android, iPadOS, desktop).
 * - `home-screen`: an iPhone or iPod, where the only route is launching from the Home Screen.
 * - `none`: nothing we can offer, such as an in-app webview.
 */
export type FullscreenRoute = 'api' | 'home-screen' | 'none';

export function canRequestFullscreen(doc: Document = document): boolean {
  const root = doc.documentElement as HTMLElement & WebkitFullscreenElement;
  const webkitDoc = doc as Document & WebkitFullscreenDocument;
  if (doc.fullscreenEnabled === true && typeof root.requestFullscreen === 'function') return true;
  return webkitDoc.webkitFullscreenEnabled === true && typeof root.webkitRequestFullscreen === 'function';
}

export function resolveFullscreenRoute(doc: Document = document, nav: Navigator = navigator): FullscreenRoute {
  if (canRequestFullscreen(doc)) return 'api';
  return isAppleTouchDevice(nav) ? 'home-screen' : 'none';
}

export function isDocumentFullscreen(doc: Document = document): boolean {
  return Boolean(doc.fullscreenElement ?? (doc as Document & WebkitFullscreenDocument).webkitFullscreenElement);
}

export const STANDALONE_DISPLAY_QUERY = '(display-mode: fullscreen), (display-mode: standalone)';

/** Launched as an installed app (Home Screen or PWA), which already has no browser bars. */
export function isStandaloneDisplay(win: Window = window): boolean {
  if ((win.navigator as Navigator & { standalone?: boolean }).standalone === true) return true;
  return typeof win.matchMedia === 'function' && win.matchMedia(STANDALONE_DISPLAY_QUERY).matches;
}

/**
 * Enter full screen and lock the screen to landscape. Must run inside a user gesture.
 *
 * Resolves `true` when the document went full screen. The orientation lock is best effort:
 * iPadOS has no lock, and Android only allows it once full screen, so its rejection is ignored.
 */
export async function enterFullscreenLandscape(doc: Document = document, win: Window = window): Promise<boolean> {
  const root = doc.documentElement as HTMLElement & WebkitFullscreenElement;
  try {
    if (typeof root.requestFullscreen === 'function') {
      await root.requestFullscreen({ navigationUI: 'hide' });
    } else if (typeof root.webkitRequestFullscreen === 'function') {
      root.webkitRequestFullscreen();
    } else {
      return false;
    }
  } catch {
    return false;
  }

  const orientation = win.screen?.orientation as (ScreenOrientation & LockableOrientation) | undefined;
  if (typeof orientation?.lock === 'function') {
    await orientation.lock('landscape').catch(() => {});
  }
  return true;
}

interface WebkitExitDocument {
  webkitExitFullscreen?: () => void;
}

/** Leave element full screen (webkit-prefixed fallback). The orientation lock ends with it. */
export async function exitFullscreen(doc: Document = document): Promise<void> {
  try {
    if (typeof doc.exitFullscreen === 'function') {
      await doc.exitFullscreen();
    } else {
      (doc as Document & WebkitExitDocument).webkitExitFullscreen?.();
    }
  } catch {
    // Already out of full screen: nothing to undo.
  }
}

/**
 * Whether entering full screen can also turn the screen to landscape. Android browsers lock
 * orientation once full screen; iPadOS Safari exposes `screen.orientation` but refuses to lock,
 * so a button there would promise a rotation that never comes.
 */
export function canLockLandscape(doc: Document = document, win: Window = window): boolean {
  if (!canRequestFullscreen(doc) || isAppleTouchDevice(win.navigator)) return false;
  const orientation = win.screen?.orientation as (ScreenOrientation & LockableOrientation) | undefined;
  return typeof orientation?.lock === 'function';
}
