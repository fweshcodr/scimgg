import { useEffect, useState } from 'react';

export interface SafeAreaInsets {
  readonly top: number;
  readonly right: number;
  readonly bottom: number;
  readonly left: number;
}

const NO_SAFE_AREA_INSETS: SafeAreaInsets = { top: 0, right: 0, bottom: 0, left: 0 };

/**
 * Reads `env(safe-area-inset-*)` through a hidden probe, because CSS environment
 * variables are not exposed to script any other way: a custom property holding
 * `env(...)` reads back unresolved. Rounded to whole CSS pixels so chrome placed
 * inside the safe area keeps landing on whole pixels too.
 */
function measure(probe: HTMLElement): SafeAreaInsets {
  const style = getComputedStyle(probe);
  const px = (value: string) => Math.round(Number.parseFloat(value) || 0);
  return {
    top: px(style.paddingTop),
    right: px(style.paddingRight),
    bottom: px(style.paddingBottom),
    left: px(style.paddingLeft),
  };
}

function sameInsets(a: SafeAreaInsets, b: SafeAreaInsets): boolean {
  return a.top === b.top && a.right === b.right && a.bottom === b.bottom && a.left === b.left;
}

/**
 * The device's safe-area insets (notch, rounded corners, home indicator) in CSS
 * pixels. Zero on desktop and wherever the page is not laid out under them, which
 * needs `viewport-fit=cover` (set in index.html). Re-read on resize, since the
 * notch moves sides when a phone rotates.
 */
export function useSafeAreaInsets(enabled = true): SafeAreaInsets {
  const [insets, setInsets] = useState<SafeAreaInsets>(NO_SAFE_AREA_INSETS);

  useEffect(() => {
    if (!enabled || typeof document === 'undefined') return;
    const probe = document.createElement('div');
    probe.setAttribute('aria-hidden', 'true');
    probe.style.cssText =
      'position:fixed;left:0;top:0;width:0;height:0;visibility:hidden;pointer-events:none;' +
      'padding:env(safe-area-inset-top,0px) env(safe-area-inset-right,0px) ' +
      'env(safe-area-inset-bottom,0px) env(safe-area-inset-left,0px);';
    document.body.appendChild(probe);
    const sync = () => {
      const next = measure(probe);
      setInsets((prev) => (sameInsets(prev, next) ? prev : next));
    };
    sync();
    window.addEventListener('resize', sync);
    window.addEventListener('orientationchange', sync);
    return () => {
      window.removeEventListener('resize', sync);
      window.removeEventListener('orientationchange', sync);
      probe.remove();
    };
  }, [enabled]);

  return enabled ? insets : NO_SAFE_AREA_INSETS;
}
