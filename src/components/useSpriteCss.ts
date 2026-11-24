import { useEffect, useSyncExternalStore } from 'react';
import { getStylesheetUrl, loadStylesheetUrl } from '../util/imageCache';
import { getSpriteCentreColour, getSpritePixelColour, subscribe } from './pixelSpriteStore';

/**
 * For art a stylesheet paints (`border-image`, `background-image`) rather than a sprite layer:
 * each sprite's object URL from the image cache (`getStylesheetUrl`), so the stylesheet reuses
 * the preloaded bytes instead of fetching the file again. Null until that URL exists; the
 * preloader makes these for every stylesheet-painted sprite (`collectStylesheetSpritePaths`), so
 * they are normally ready at the first paint.
 */
export function useSpriteCssUrls(srcs: readonly string[]): readonly (string | null)[] {
  const key = srcs.join('\n');
  const snapshot = useSyncExternalStore(subscribe, () => srcs.map((src) => getStylesheetUrl(src) ?? '').join('\n'));
  useEffect(() => {
    for (const src of key.split('\n')) {
      if (src && getStylesheetUrl(src) === undefined) void loadStylesheetUrl(src, 'immediate');
    }
  }, [key]);
  return snapshot.split('\n').map((url) => url || null);
}

/**
 * The flat color at the center of a sprite (a 9-slice middle), for a box painted beside the art
 * to meet it without a seam in any pack. Null until the sprite has decoded.
 */
export function useSpriteFill(src: string): string | null {
  return useSyncExternalStore(subscribe, () => getSpriteCentreColour(src) ?? '') || null;
}

/**
 * The colors of chosen pixels of a sprite, in order, for CSS that draws the art's own tones
 * (a stone's body, rims and outline) in any pack. All null until the sprite has decoded.
 */
export function useSpritePixels(
  src: string,
  points: readonly (readonly [x: number, y: number])[],
): readonly (string | null)[] {
  const snapshot = useSyncExternalStore(subscribe, () =>
    points.map(([x, y]) => getSpritePixelColour(src, x, y) ?? '').join('\n'),
  );
  return snapshot.split('\n').map((colour) => colour || null);
}
