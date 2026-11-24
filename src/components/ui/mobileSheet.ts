import { useEffect } from 'react';
import './MobileSheet.css';

/**
 * The mobile modal system. Every modal, drawer and popover opts in by marking its own parts with
 * a sheet role; the rules in MobileSheet.css act on those roles only while the root carries
 * `data-mobile-ui`, so desktop never sees them.
 *
 * - On a phone (short or narrow viewport) a modal becomes a full-screen sheet: no outer margin,
 *   the safe area as its padding, a compact header, one scrolling body, and a single-row action
 *   footer pinned at the bottom.
 * - On a tablet it keeps its desktop size and gets thumb-sized controls.
 *
 * Containers come in three kinds. A `card` is a modal and becomes the full-screen sheet on a
 * phone. A `drawer` (Settings, Plugins) stays a side panel beside the game, so a setting can be
 * watched taking effect. A `popover` stays anchored to what opened it. All three get the touch
 * sizing: 44px close and action targets, 40px rows, and 16px fields.
 */

/** The same rule the Settings drawer uses for its touch rows: a touch-only device, or Mobile. */
export function isMobileUi(options: { readonly touchOnly: boolean; readonly mobileLayout: boolean }): boolean {
  return options.touchOnly || options.mobileLayout;
}

export const MOBILE_UI_ATTRIBUTE = 'data-mobile-ui';

/**
 * Publishes the mobile-UI decision on the document root. Modals portal outside the app's own
 * container, so the root is the one place they all inherit from.
 */
export function useMobileUiRoot(active: boolean): void {
  useEffect(() => {
    if (typeof document === 'undefined') return;
    const root = document.documentElement;
    if (active) root.setAttribute(MOBILE_UI_ATTRIBUTE, '');
    else root.removeAttribute(MOBILE_UI_ATTRIBUTE);
    return () => root.removeAttribute(MOBILE_UI_ATTRIBUTE);
  }, [active]);
}

/** A phone held either way. Must match the phone media query in MobileSheet.css. */
export const PHONE_SHEET_QUERY = '(max-height: 540px), (max-width: 600px)';

/** Whether opted-in modals are currently full-screen sheets. For components that place themselves in JS. */
export function isPhoneSheet(): boolean {
  if (typeof document === 'undefined' || typeof window.matchMedia !== 'function') return false;
  return document.documentElement.hasAttribute(MOBILE_UI_ATTRIBUTE) && window.matchMedia(PHONE_SHEET_QUERY).matches;
}

type SheetRole = 'overlay' | 'card' | 'drawer' | 'popover' | 'head' | 'close' | 'body' | 'foot';

/** Spread onto a modal's own elements: `<div className="x-card" {...sheet.card}>`. */
export const sheet: { readonly [R in SheetRole]: { readonly 'data-msheet': R } } = {
  overlay: { 'data-msheet': 'overlay' },
  card: { 'data-msheet': 'card' },
  drawer: { 'data-msheet': 'drawer' },
  popover: { 'data-msheet': 'popover' },
  head: { 'data-msheet': 'head' },
  close: { 'data-msheet': 'close' },
  body: { 'data-msheet': 'body' },
  foot: { 'data-msheet': 'foot' },
};
