import { networkPool, type PooledJob } from './networkPool';

/**
 * 1. ONE ENTRY PER URL, REQUESTED ONE WAY. Everything goes through
 *    `loadCachedImage`, which always sets `crossOrigin`, so a preload and an
 *    on-demand load are the same request and hit the same entry. `anonymous` is
 *    required for item icons (they are canvas-resampled, and a non-CORS image
 *    taints the canvas) and is harmless for same-origin UI sprites.
 *
 *    Any `<img>` that paints a preloaded URL must set `crossOrigin` to
 *    `IMAGE_CROSS_ORIGIN` or it requests a second copy.
 *
 *    A stylesheet cannot set `crossOrigin`, so it never reuses that copy. CSS
 *    paints a sprite through `getStylesheetUrl` instead: an object URL made
 *    once from the same bytes (see `loadStylesheetUrl`).
 * 2. DECODED, NOT JUST FETCHED. A cached-but-never-decoded image still
 *    rasterizes during the first paint that shows it. Preloading awaits
 *    `img.decode()` so that cost is paid while the loading screen is up.
 * 3. SYNCHRONOUS READS AFTER WARMING. `getCachedImage` / `getCachedNaturalSize`
 *    answer from a plain `Map`, so a warmed sprite is fully resolved on a
 *    component's FIRST render — no load, no notification round trip, no frame
 *    where the icon is missing or the wrong size.
 */

export interface NaturalSize {
  readonly width: number;
  readonly height: number;
}

/**
 * `immediate` issues the request straight away; `background` queues it behind
 * the shared network pool. Bulk preloading is `background` so a few hundred
 * icons cannot saturate the connection pool, while anything a component is
 * waiting on right now skips the queue.
 */
export type ImagePriority = 'immediate' | 'background';

/** The request mode every cached image is loaded with; an `<img>` painting one must match it. */
export const IMAGE_CROSS_ORIGIN = 'anonymous';

/** `null` records a load that failed. `undefined` (absent) means never requested. */
const images = new Map<string, HTMLImageElement | null>();
/** Separate from `images` so the getter returns a stable object per src, not a fresh one. */
const naturalSizes = new Map<string, NaturalSize>();
const inFlight = new Map<string, PooledJob<HTMLImageElement | null>>();
const listeners = new Set<() => void>();
let generation = 0;

export function subscribeImageCache(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/**
 * The cached element, `null` if the load failed, `undefined` if this URL has
 * never been requested. Callers distinguish the last two: `undefined` means
 * "kick a load", `null` means "there is nothing to paint".
 */
export function getCachedImage(src: string): HTMLImageElement | null | undefined {
  return images.get(src);
}

export function isImageCached(src: string): boolean {
  return images.get(src) != null;
}

/** Stable per src, so it is safe to return from a `useSyncExternalStore` snapshot. */
export function getCachedNaturalSize(src: string): NaturalSize | null {
  return naturalSizes.get(src) ?? null;
}

function decodeImage(src: string): Promise<HTMLImageElement | null> {
  return new Promise<HTMLImageElement | null>((resolve) => {
    if (typeof Image === 'undefined') {
      resolve(null);
      return;
    }
    const image = new Image();
    image.crossOrigin = IMAGE_CROSS_ORIGIN;
    image.decoding = 'async';
    image.onload = () => resolve(image);
    image.onerror = () => resolve(null);
    image.src = src;
  }).then(async (image) => {
    if (image && typeof image.decode === 'function') {
      try {
        await image.decode();
      } catch {
        // `decode()` rejects on a broken or replaced source. `onload` already
        // fired, so the element is still paintable; the only thing lost is the
        // guarantee that the raster is prepared.
      }
    }
    return image;
  });
}

/**
 * Failures are cached deliberately: a missing sprite would otherwise be
 * re-requested by every mount. Nothing retries it for the rest of the session,
 * so the sprite stays absent — `PixelSprite` keeps its slot at zero opacity and
 * `PixelSpriteLayer` skips it.
 */
export function loadCachedImage(src: string, priority: ImagePriority = 'background'): Promise<HTMLImageElement | null> {
  const cached = images.get(src);
  if (cached !== undefined) return Promise.resolve(cached);

  const existing = inFlight.get(src);
  if (existing) {
    // Promote an on-screen sprite so it does not inherit the preloader's queue position.
    if (priority === 'immediate') existing.promote();
    return existing.promise;
  }

  const gen = generation;
  const run = () => decodeImage(src);
  const job = priority === 'immediate' ? { promise: run(), promote: () => {} } : networkPool.addPromotable(run);
  const promise = job.promise.then((image) => {
    if (gen !== generation) return image;
    inFlight.delete(src);
    images.set(src, image);
    if (image && image.naturalWidth > 0 && image.naturalHeight > 0) {
      naturalSizes.set(src, { width: image.naturalWidth, height: image.naturalHeight });
    }
    for (const listener of listeners) listener();
    return image;
  });

  inFlight.set(src, { promise, promote: job.promote });
  return promise;
}

/**
 * What a stylesheet paints for a sprite: an object URL, `null` if there is nothing to paint (the
 * load failed), `undefined` until `loadStylesheetUrl` has made one. Stable per src.
 */
const stylesheetUrls = new Map<string, string | null>();
const stylesheetInFlight = new Map<string, Promise<string | null>>();
/**
 * Each object URL's image, decoded and kept alive, so the stylesheet that loads that URL is
 * answered from memory rather than decoding it at its first paint.
 */
const stylesheetHolders = new Set<HTMLImageElement>();
/** Object URLs this module created, revoked only when the cache is reset. */
const ownedObjectUrls = new Set<string>();

export function getStylesheetUrl(src: string): string | null | undefined {
  return stylesheetUrls.get(src);
}

/**
 * The URL a stylesheet can paint `src` from without a second request: an object URL made from the
 * cached image's bytes. The fetch uses the image's own request mode, so the HTTP cache answers it. Where object URLs
 * are unavailable or the fetch fails, it is the file's own URL, as a stylesheet would load it.
 */
async function stylesheetUrlFor(image: HTMLImageElement): Promise<string | null> {
  const loaded = typeof image.src === 'string' ? image.src : '';
  if (!loaded) return null;
  if (typeof fetch !== 'function' || typeof URL.createObjectURL !== 'function') return loaded;
  let objectUrl: string;
  try {
    const response = await fetch(loaded, { mode: 'cors', credentials: 'same-origin' });
    if (!response.ok) return loaded;
    objectUrl = URL.createObjectURL(await response.blob());
  } catch {
    return loaded;
  }
  ownedObjectUrls.add(objectUrl);
  if (typeof Image !== 'undefined') {
    const holder = new Image();
    holder.src = objectUrl;
    try {
      await holder.decode();
      stylesheetHolders.add(holder);
    } catch {
      // Still a valid URL; the stylesheet decodes it at first paint instead.
    }
  }
  return objectUrl;
}

/** Made once per src, however many surfaces paint it; preloading it makes the first paint final. */
export function loadStylesheetUrl(src: string, priority: ImagePriority = 'background'): Promise<string | null> {
  const settled = stylesheetUrls.get(src);
  if (settled !== undefined) return Promise.resolve(settled);
  const existing = stylesheetInFlight.get(src);
  if (existing) {
    if (priority === 'immediate') void loadCachedImage(src, 'immediate');
    return existing;
  }

  const gen = generation;
  const promise = loadCachedImage(src, priority)
    .then((image) => (image ? stylesheetUrlFor(image) : null))
    .then((url) => {
      if (gen !== generation) {
        if (url && ownedObjectUrls.delete(url)) URL.revokeObjectURL(url);
        return url;
      }
      stylesheetInFlight.delete(src);
      stylesheetUrls.set(src, url);
      for (const listener of listeners) listener();
      return url;
    });
  stylesheetInFlight.set(src, promise);
  return promise;
}

export function resetImageCache(): void {
  generation++;
  images.clear();
  naturalSizes.clear();
  inFlight.clear();
  stylesheetUrls.clear();
  stylesheetInFlight.clear();
  stylesheetHolders.clear();
  for (const url of ownedObjectUrls) URL.revokeObjectURL(url);
  ownedObjectUrls.clear();
}
