import type { ImgHTMLAttributes } from 'react';
import { forwardRef, useCallback, useEffect, useRef, useState } from 'react';

const TRANSPARENT_PIXEL_DATA_URI = 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///ywAAAAAAQABAAACAUwAOw==';

/**
 * Plain `<img>` with an optional fallback source. For CHROME only — icons go through
 * `PixelSprite`, which additionally resamples to the device-pixel box (see AGENTS.md).
 *
 * What keeps this from being folded into that: `fitLayoutSize` reads numeric inline styles and
 * the `width`/`height` props only — the resample target must never depend on a DOM read a panel
 * transform could contaminate. An image sized by a CSS class (loadout silhouettes) would
 * therefore get a box pinned from its natural size, overriding the size the call site asked for.
 *
 * Every surface that TILES a sprite, or butts one sprite against another, has moved off this to
 * `PixelComposedLayer` — independently rounded pieces are what opened hairline seams between
 * them. What is left here is lone chrome with no neighbor to seam against.
 */
export const PackImage = forwardRef<
  HTMLImageElement,
  ImgHTMLAttributes<HTMLImageElement> & { src: string; fallback?: string }
>(({ src, fallback, alt = '', onError, style, ...props }, ref) => {
  const [resolvedSrc, setResolvedSrc] = useState(src);
  const [isHidden, setIsHidden] = useState(false);
  const attemptedFallbackRef = useRef(false);

  useEffect(() => {
    setResolvedSrc(src);
    setIsHidden(false);
    attemptedFallbackRef.current = false;
  }, [src]);

  const handleError = useCallback(
    (event: React.SyntheticEvent<HTMLImageElement>) => {
      if (fallback && !attemptedFallbackRef.current) {
        attemptedFallbackRef.current = true;
        setResolvedSrc(fallback);
        setIsHidden(false);
      } else {
        setResolvedSrc(TRANSPARENT_PIXEL_DATA_URI);
        setIsHidden(true);
      }

      onError?.(event);
    },
    [fallback, onError],
  );

  return (
    <img
      ref={ref}
      // Same request mode as `imageCache`, which is what preloads these: an `<img>` without it
      // is a separate Blink memory-cache entry, so the warmed copy would not be reused.
      crossOrigin="anonymous"
      src={resolvedSrc}
      alt={alt}
      onError={handleError}
      style={isHidden ? { ...style, opacity: 0 } : style}
      {...props}
    />
  );
});

PackImage.displayName = 'PackImage';
