import { getCachedImage, loadCachedImage, resetImageCache, subscribeImageCache } from '../util/imageCache';
import type { LayoutSize, PixelRaster, SpriteSource, SpriteSourceRect } from '../util/pixelSprite';
import { resampleForDisplay, resampleRegionForDisplay } from '../util/pixelSprite';

/**
 * Shared source pixels and resampled bitmaps behind the pixel-sprite components. Display
 * canvases belong to the components; this store only owns reusable inputs to their 1:1 blits.
 */

const listeners = new Set<() => void>();
let flushScheduled = false;

/**
 * Coalesce on a frame, not a microtask: a batch of sprites finishing their decode should wake
 * React once, not once each.
 */
function notify(): void {
  if (flushScheduled) return;
  flushScheduled = true;
  const flush = () => {
    flushScheduled = false;
    for (const listener of listeners) listener();
  };
  if (typeof requestAnimationFrame === 'function') requestAnimationFrame(flush);
  else queueMicrotask(flush);
}

subscribeImageCache(notify);

export function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** Something is rendering this sprite right now, so it skips the preload queue. */
export function loadSprite(src: string): Promise<HTMLImageElement | null> {
  return loadCachedImage(src, 'immediate');
}

/**
 * The decoded sprite, `null` if it failed to load, `undefined` if nothing has asked for it yet.
 * Stable per src, so it is safe to return from a `useSyncExternalStore` snapshot.
 */
export function getSprite(src: string): HTMLImageElement | null | undefined {
  return getCachedImage(src);
}

/**
 * 16 MiB holds the combat tabs across several scales even at DPR 3 (see the warm-up workload
 * test), while bounding the cache by bytes rather than entry count, regardless of composed-surface
 * size.
 * This covers RGBA rasters only, not decoded images, resampler scratch or caller-owned displays.
 */
export const DEFAULT_PIXEL_SPRITE_BUDGET_BYTES = 16 * 1024 * 1024;
let budgetBytes = DEFAULT_PIXEL_SPRITE_BUDGET_BYTES;

interface RasterCache<T> {
  readonly kind: 'source' | 'canvas';
  readonly entries: Map<string, T>;
  bytes: number;
}

const sources: RasterCache<PixelRaster> = { kind: 'source', entries: new Map(), bytes: 0 };
const resamples: RasterCache<HTMLCanvasElement> = { kind: 'canvas', entries: new Map(), bytes: 0 };
const recency = new Map<string, { cache: RasterCache<PixelRaster | HTMLCanvasElement>; key: string; bytes: number }>();
let transientBytesAllocated = 0;
let transientAllocations = 0;

/** Allocation traffic, not live memory: uncached returns have no caller release signal. */
function recordTransient(bytes: number): void {
  transientBytesAllocated += bytes;
  transientAllocations++;
}

function trim(incomingBytes = 0): void {
  while (sources.bytes + resamples.bytes + incomingBytes > budgetBytes) {
    const oldest = recency.entries().next();
    if (oldest.done) break;
    const [id, entry] = oldest.value;
    recency.delete(id);
    entry.cache.entries.delete(entry.key);
    entry.cache.bytes -= entry.bytes;
    // Only release OUR reference. Never clear/resize an evicted canvas: a caller may still
    // hold it, or have attached it to the DOM. Its backing store then belongs to that caller.
  }
}

/** Applies immediately; zero disables retention without invalidating any returned surface. */
export function configurePixelSpriteStore(config: { budgetBytes: number }): void {
  if (!Number.isSafeInteger(config.budgetBytes) || config.budgetBytes < 0) {
    throw new RangeError('Sprite raster budget must be a non-negative safe integer');
  }
  budgetBytes = config.budgetBytes;
  trim();
}

export function getPixelSpriteStoreStats() {
  return {
    budgetBytes,
    cached: { bytes: sources.bytes + resamples.bytes, entries: recency.size },
    sources: { bytes: sources.bytes, entries: sources.entries.size },
    canvases: { bytes: resamples.bytes, entries: resamples.entries.size },
    // Includes private readback canvases and rasters too large to retain. Cumulative since
    // reset, not a claim to track caller-owned or garbage-collector-managed live surfaces.
    transient: { bytesAllocated: transientBytesAllocated, allocations: transientAllocations },
  };
}

function touch<T>(cache: RasterCache<T>, key: string): T | undefined {
  const hit = cache.entries.get(key);
  if (hit === undefined) return undefined;
  const id = `${cache.kind}|${key}`;
  const entry = recency.get(id);
  if (entry) {
    recency.delete(id);
    recency.set(id, entry);
  }
  return hit;
}

function retain<T extends PixelRaster | HTMLCanvasElement>(cache: RasterCache<T>, key: string, raster: T): void {
  const bytes = raster.width * raster.height * 4;
  // One oversized surface must not flush the entire useful working set on every paint.
  if (bytes > budgetBytes) {
    recordTransient(bytes);
    return;
  }
  trim(bytes);
  cache.entries.set(key, raster);
  cache.bytes += bytes;
  recency.set(`${cache.kind}|${key}`, { cache, key, bytes });
}

/** Private readback surface only; unlike returned bitmaps, it is safe to release immediately. */
function readPixels(width: number, height: number, draw: (ctx: CanvasRenderingContext2D) => void): PixelRaster | null {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  recordTransient(canvas.width * canvas.height * 4);
  try {
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) return null;
    ctx.imageSmoothingEnabled = false;
    draw(ctx);
    return { data: ctx.getImageData(0, 0, width, height).data, width, height };
  } finally {
    canvas.width = 0;
    canvas.height = 0;
  }
}

/** Finished pixels onto a canvas, the form both caches store and every call site blits. */
function toBitmap(pixels: Uint8ClampedArray<ArrayBuffer>, width: number, height: number): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  canvas.getContext('2d')?.putImageData(new ImageData(pixels, width, height), 0, 0);
  return canvas;
}

/**
 * The sprite's own pixels.
 *
 * This is the only `getImageData` in the pipeline, and it reads a canvas drawn 1:1 with no
 * filtering — so it costs a plain copy rather than the synchronous GPU flush that reading back
 * a smoothed `drawImage` result forces. Every target size after this is pure arithmetic over
 * the cached array.
 */
function getSourcePixels(src: string, image: HTMLImageElement): PixelRaster | null {
  const hit = touch(sources, src);
  if (hit) return hit;
  const width = image.naturalWidth;
  const height = image.naturalHeight;
  if (width <= 0 || height <= 0) return null;
  const pixels = readPixels(width, height, (ctx) => ctx.drawImage(image, 0, 0));
  if (!pixels) return null;
  retain(sources, src, pixels);
  return pixels;
}

/**
 * The color at the center of a decoded sprite, as CSS `rgb()`, or null until it has decoded.
 * For the flat fill of a 9-slice middle, so a box painted beside the art matches it in any pack.
 */
export function getSpriteCentreColour(src: string): string | null {
  const image = getCachedImage(src);
  if (!image) return null;
  return getSpritePixelColour(src, Math.floor(image.naturalWidth / 2), Math.floor(image.naturalHeight / 2));
}

/**
 * The color of one pixel of a decoded sprite, as CSS `rgb()`, or null until it has decoded (or
 * if the point is outside it). For CSS drawn to match art a pack may recolor: each tone is read
 * from the pixel it was taken from, so it follows the pack's tint.
 */
export function getSpritePixelColour(src: string, x: number, y: number): string | null {
  const image = getCachedImage(src);
  if (!image) return null;
  const pixels = getSourcePixels(src, image);
  if (!pixels || x < 0 || y < 0 || x >= pixels.width || y >= pixels.height) return null;
  const i = (y * pixels.width + x) * 4;
  return `rgb(${pixels.data[i]} ${pixels.data[i + 1]} ${pixels.data[i + 2]})`;
}

/**
 * The finished device-pixel bitmap for a sprite, ready to blit 1:1 at the target box.
 *
 * At the sprite's own size this hands the sprite straight back and caches nothing. Everything
 * else is reconstructed by `resampleForDisplay` and cached per target box — a panel repaints
 * 20-70 sprites at one unchanging size on every tab switch, and the drag ghost repaints every
 * frame.
 */
export function getResampled(src: string, image: HTMLImageElement, targetW: number, targetH: number): SpriteSource {
  const outW = Math.max(1, Math.round(targetW));
  const outH = Math.max(1, Math.round(targetH));
  if (outW === image.naturalWidth && outH === image.naturalHeight) return image;

  const key = `${src}|${outW}x${outH}`;
  const hit = touch(resamples, key);
  if (hit) return hit;

  const source = getSourcePixels(src, image);
  if (!source) return image;
  const canvas = toBitmap(resampleForDisplay(source.data, source.width, source.height, outW, outH), outW, outH);
  retain(resamples, key, canvas);
  return canvas;
}

export interface SpriteRegionRequest {
  readonly sourceRect: SpriteSourceRect;
  readonly target: LayoutSize;
}

export function getResampledRegion(
  src: string,
  image: HTMLImageElement,
  request: SpriteRegionRequest,
): HTMLCanvasElement | null {
  const outW = Math.max(1, Math.round(request.target.width));
  const outH = Math.max(1, Math.round(request.target.height));
  const { x, y, width, height } = request.sourceRect;
  const key = `region|${src}|${x},${y},${width}x${height}|${outW}x${outH}`;
  const hit = touch(resamples, key);
  if (hit) return hit;

  const source = getSourcePixels(src, image);
  if (!source) return null;
  const canvas = toBitmap(
    resampleRegionForDisplay(source, request.sourceRect, { width: outW, height: outH }),
    outW,
    outH,
  );
  retain(resamples, key, canvas);
  return canvas;
}

/**
 * A multi-sprite surface built at 1:1 and then resampled ONCE, as a single bitmap.
 *
 * This is the seam fix, and the reason it has to be a separate entry point. Composing at the
 * device box instead means every piece rounds its own edges: a repeat lands on a different
 * subpixel phase each time it tiles, and two halves of one tile round their shared join in
 * opposite directions. Either way a hairline of background shows through, at some scales and
 * not others. Drawing the whole surface at its logical size first makes every internal join an
 * exact integer boundary between whole source pixels, so the reconstruction sees one continuous
 * image and there is no internal edge left to round.
 *
 * `key` must capture everything `draw` reads, sprite paths included.
 */
export function getComposedRaster(
  key: string,
  logicalW: number,
  logicalH: number,
  targetW: number,
  targetH: number,
  draw: (ctx: CanvasRenderingContext2D) => void,
): HTMLCanvasElement | null {
  const outW = Math.max(1, Math.round(targetW));
  const outH = Math.max(1, Math.round(targetH));
  if (logicalW <= 0 || logicalH <= 0) return null;

  // The logical size identifies the raster as much as the key does, on BOTH lookups: a caller
  // that keeps one key across a resize would otherwise be handed back what it built at the old
  // size. Same target box at a different logical size is a different image.
  const logicalKey = `${key}|${logicalW}x${logicalH}`;
  const sized = `${logicalKey}|${outW}x${outH}`;
  const cachedResult = touch(resamples, sized);
  if (cachedResult) return cachedResult;

  let source = touch(sources, logicalKey);
  if (!source) {
    source = readPixels(logicalW, logicalH, draw) ?? undefined;
    if (!source) return null;
    retain(sources, logicalKey, source);
  }

  const canvas = toBitmap(resampleForDisplay(source.data, source.width, source.height, outW, outH), outW, outH);
  retain(resamples, sized, canvas);
  return canvas;
}
/** Test-only: drop every cached bitmap, source read and resample. */
export function resetPixelSpriteStore(): void {
  sources.entries.clear();
  resamples.entries.clear();
  sources.bytes = 0;
  resamples.bytes = 0;
  recency.clear();
  budgetBytes = DEFAULT_PIXEL_SPRITE_BUDGET_BYTES;
  transientBytesAllocated = 0;
  transientAllocations = 0;
  resetImageCache();
}
