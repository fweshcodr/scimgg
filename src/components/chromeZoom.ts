import type React from 'react';
import { useEffect, useLayoutEffect, useRef } from 'react';

/**
 * Custom properties for a subtree zoomed by `zoom`:
 * - `--unscaled-px`, one 1x pixel. Borders and corner radii use it so they keep their 1x
 *   look at any size instead of thickening and rounding off.
 * - `--border-give`, what a 1x-thin 1px border no longer takes (`1px - --unscaled-px`).
 *   Padding beside such a border adds it back, so content sits exactly where it does at
 *   1x. That is what keeps zoomed pixel text crisp: Chrome floors a zoomed border to
 *   whole CSS pixels, so a 1px border at 4/3 laid out 1 CSS px where the content expected
 *   1.33 and pushed every glyph off the device-pixel grid (measured: 51% soft
 *   glyph pixels at 4/3 on a 150% display, 0% with the give-back).
 */
export function unscaledPxVars(zoom: number): React.CSSProperties {
  return { '--unscaled-px': `${1 / zoom}px`, '--border-give': `${1 - 1 / zoom}px` } as React.CSSProperties;
}

/** Zoom chrome by `zoom`, with `--overlay-scale` for offsets that must be divided back out. */
export function chromeZoomStyle(zoom: number): React.CSSProperties {
  return { zoom, '--overlay-scale': zoom, ...unscaledPxVars(zoom) } as React.CSSProperties;
}

/**
 * One motion for every size change Auto makes, so the launcher row, replay bar and
 * the panels all grow or shrink together: short, decelerating, and landing on the
 * committed zoom, where the text is pixel-exact again.
 */
export const CHROME_RESIZE_TIMING: KeyframeAnimationOptions = {
  duration: 200,
  easing: 'cubic-bezier(0.16, 1, 0.3, 1)',
};

export function prefersReducedMotion(): boolean {
  return typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

/**
 * Animates a zoomed element from the size it was painted at to its new zoom. The element
 * is laid out at the new zoom at once (a zoom change is a layout change, not something to
 * interpolate per frame); a transform scales it back to where it was, about the corner it
 * is anchored by, and eases to none. At rest nothing is transformed, so text keeps its LCD
 * antialiasing and lands exactly on the committed zoom.
 *
 * A change mid-animation starts from the size on screen, so a second step never jumps.
 * Reduced motion, and `enabled: false` (replay snapshots), change size in one frame.
 */
export function useZoomTransition(
  ref: React.RefObject<HTMLElement | null>,
  zoom: number,
  origin: string,
  enabled = true,
): void {
  const previousRef = useRef(zoom);
  const animationRef = useRef<Animation | null>(null);

  useLayoutEffect(() => {
    const previous = previousRef.current;
    previousRef.current = zoom;
    const el = ref.current;
    if (!enabled) {
      animationRef.current?.cancel();
      animationRef.current = null;
      return;
    }
    if (previous === zoom || !el) return;
    // The painted scale right now, including a transition still running.
    let painted = previous;
    const running = animationRef.current;
    if (running) {
      const matrix = /^matrix\(([^,]+),/.exec(getComputedStyle(el).transform);
      if (matrix) painted = previous * Number.parseFloat(matrix[1]);
      running.cancel();
      animationRef.current = null;
    }
    if (prefersReducedMotion() || typeof el.animate !== 'function') return;
    el.style.transformOrigin = origin;
    const animation = el.animate(
      [{ transform: `scale(${painted / zoom})` }, { transform: 'none' }],
      CHROME_RESIZE_TIMING,
    );
    animationRef.current = animation;
    animation.onfinish = () => {
      if (animationRef.current === animation) animationRef.current = null;
    };
  }, [ref, zoom, origin, enabled]);

  useEffect(() => () => animationRef.current?.cancel(), []);
}
