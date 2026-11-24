import { useEffect, useState } from 'react';
import { NARROW_WINDOW_WIDTH } from '../layout/chromeBreakpoints';

/**
 * The narrow-window line (chromeBreakpoints.ts), which the `@media (max-width: 720px)` queries in
 * component CSS spell out by hand.
 */
const MOBILE_MEDIA_QUERY = `(max-width: ${NARROW_WINDOW_WIDTH}px)`;

/**
 * Reports whether the viewport currently matches the narrow-window breakpoint.
 *
 * This is a PURE viewport-width signal — it answers "is the window narrow",
 * not "is this a mobile device". Input-capability questions (touch input, no
 * mouse) belong to {@link useIsTouchOnly}; device-identity questions (is this a
 * phone or tablet) belong to {@link useIsMobileDevice}.
 *
 * Layout consumers should generally combine this signal with the user's
 * explicit layout choice: when the user has locked a fixed game resolution
 * (`gameResolution.mode === 'fixed'`) they have opted into a desktop-style
 * layout regardless of window width, so the responsive collapse should be
 * suppressed.
 *
 * SSR-safe: returns `false` during the initial render when `window` is
 * unavailable.
 */
export function useIsMobile(): boolean {
  const [isMobile, setIsMobile] = useState<boolean>(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
      return false;
    }
    return window.matchMedia(MOBILE_MEDIA_QUERY).matches;
  });

  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
      return;
    }
    const mql = window.matchMedia(MOBILE_MEDIA_QUERY);
    const handler = (event: MediaQueryListEvent) => setIsMobile(event.matches);
    // Sync once in case the state is stale (e.g. hydration or a race with
    // the constructor read above).
    setIsMobile(mql.matches);
    mql.addEventListener('change', handler);
    return () => mql.removeEventListener('change', handler);
  }, []);

  return isMobile;
}
