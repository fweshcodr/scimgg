// @vitest-environment happy-dom
// (the resample builds a real canvas)
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { loadCachedImage } from '../../util/imageCache';
import { resampleForDisplay, resampleRegionForDisplay } from '../../util/pixelSprite';
import {
  configurePixelSpriteStore,
  DEFAULT_PIXEL_SPRITE_BUDGET_BYTES,
  getComposedRaster,
  getPixelSpriteStoreStats,
  getResampled,
  getResampledRegion,
  getSprite,
  resetPixelSpriteStore,
  subscribe,
} from '../pixelSpriteStore';

const SRC = '/icon.png';
const NATURAL = 20;

describe('sprite lookups', () => {
  let restoreImage: () => void;

  beforeEach(() => {
    resetPixelSpriteStore();
    const realImage = globalThis.Image;
    class FakeImage {
      onload: (() => void) | null = null;
      onerror: (() => void) | null = null;
      naturalWidth = NATURAL;
      naturalHeight = NATURAL;
      set src(_value: string) {
        queueMicrotask(() => this.onload?.());
      }
    }
    Object.defineProperty(globalThis, 'Image', { configurable: true, writable: true, value: FakeImage });
    restoreImage = () => {
      Object.defineProperty(globalThis, 'Image', { configurable: true, writable: true, value: realImage });
    };
  });

  afterEach(() => {
    restoreImage();
    resetPixelSpriteStore();
  });

  // `undefined` and `null` mean different things to the component: one starts a load, the other
  // means there is nothing to paint. Collapsing them would make a failed sprite retry forever.
  it('separates never-requested from failed-to-load', async () => {
    expect(getSprite(SRC)).toBeUndefined();

    await loadCachedImage(SRC);

    expect(getSprite(SRC)).not.toBeNull();
    expect(getSprite(SRC)?.naturalWidth).toBe(NATURAL);
  });

  it('returns the same element every time, as useSyncExternalStore requires', async () => {
    await loadCachedImage(SRC);
    expect(getSprite(SRC)).toBe(getSprite(SRC));
  });
});

describe('getResampled', () => {
  beforeEach(() => resetPixelSpriteStore());
  afterEach(() => resetPixelSpriteStore());

  // At its own size the sprite IS the answer, so nothing is reconstructed, cached, or read back.
  // The resampling itself is a pure function over pixel arrays and is covered in pixelSprite.test.
  it('hands the sprite straight back at its natural size', () => {
    const image = { naturalWidth: NATURAL, naturalHeight: NATURAL } as HTMLImageElement;
    expect(getResampled(SRC, image, NATURAL, NATURAL)).toBe(image);
  });
});

describe('raster caches', () => {
  // happy-dom has no 2D context. Capture the exact bytes passed to putImageData, without
  // introducing a browser's premultiplication rounding into comparisons of the resample path.
  let restoreContext: () => void;
  let pixels: WeakMap<object, Uint8ClampedArray>;
  let readbacks: HTMLCanvasElement[];
  let bitmapWrites: ReturnType<typeof vi.fn<() => void>>;

  function image(width = NATURAL, height = NATURAL): HTMLImageElement {
    return { naturalWidth: width, naturalHeight: height } as HTMLImageElement;
  }

  beforeEach(() => {
    resetPixelSpriteStore();
    pixels = new WeakMap();
    readbacks = [];
    bitmapWrites = vi.fn();
    const original = HTMLCanvasElement.prototype.getContext;
    Object.defineProperty(HTMLCanvasElement.prototype, 'getContext', {
      configurable: true,
      writable: true,
      value: function fake(this: HTMLCanvasElement) {
        return {
          canvas: this,
          imageSmoothingEnabled: false,
          clearRect: () => {},
          drawImage: (source: object) => {
            const data = pixels.get(source);
            if (data) pixels.set(this, data.slice());
          },
          putImageData: (data: ImageData) => {
            bitmapWrites();
            pixels.set(this, data.data.slice());
          },
          getImageData: (_x: number, _y: number, w: number, h: number) => {
            readbacks.push(this);
            return { data: pixels.get(this)?.slice() ?? new Uint8ClampedArray(w * h * 4), width: w, height: h };
          },
        };
      },
    });
    restoreContext = () => {
      Object.defineProperty(HTMLCanvasElement.prototype, 'getContext', {
        configurable: true,
        writable: true,
        value: original,
      });
    };
  });

  afterEach(() => {
    restoreContext();
    resetPixelSpriteStore();
  });

  it('caches a region by source rectangle and exact target dimensions', () => {
    const image = document.createElement('img');
    Object.defineProperties(image, {
      naturalWidth: { value: NATURAL },
      naturalHeight: { value: NATURAL },
    });
    const request = {
      sourceRect: { x: 2, y: 3, width: 8, height: 9 },
      target: { width: 10, height: 12 },
    };

    const first = getResampledRegion(SRC, image, request);
    const same = getResampledRegion(SRC, image, request);
    const variants = [
      getResampledRegion(SRC, image, { ...request, sourceRect: { ...request.sourceRect, x: 3 } }),
      getResampledRegion(SRC, image, { ...request, sourceRect: { ...request.sourceRect, y: 4 } }),
      getResampledRegion(SRC, image, { ...request, sourceRect: { ...request.sourceRect, width: 9 } }),
      getResampledRegion(SRC, image, { ...request, sourceRect: { ...request.sourceRect, height: 10 } }),
      getResampledRegion(SRC, image, { ...request, target: { ...request.target, width: 11 } }),
      getResampledRegion(SRC, image, { ...request, target: { ...request.target, height: 13 } }),
    ];

    expect(same).toBe(first);
    expect(new Set([first, ...variants]).size).toBe(7);
    expect(first).toMatchObject({ width: 10, height: 12 });
  });

  it('draws a surface once and hands the same raster back after that', () => {
    const draw = vi.fn();

    const first = getComposedRaster('surface', 10, 10, 20, 20, draw);
    const second = getComposedRaster('surface', 10, 10, 20, 20, draw);

    expect(draw).toHaveBeenCalledTimes(1);
    expect(second).toBe(first);
  });

  it('rebuilds when the same surface is asked for at a different logical size', () => {
    // A caller that keeps one key across a resize asks for the same target box at a new logical
    // size; handing back the old raster would paint the pre-resize geometry.
    const draw = vi.fn();

    const small = getComposedRaster('surface', 10, 10, 20, 20, draw);
    const large = getComposedRaster('surface', 12, 12, 20, 20, draw);

    expect(draw).toHaveBeenCalledTimes(2);
    expect(large).not.toBe(small);
  });

  it('rebuilds for a new target box without redrawing the surface', () => {
    // The 1:1 drawing is what costs; resampling it to another device box must not repeat it.
    const draw = vi.fn();

    getComposedRaster('surface', 10, 10, 20, 20, draw);
    const scaled = getComposedRaster('surface', 10, 10, 30, 30, draw);

    expect(draw).toHaveBeenCalledTimes(1);
    expect(scaled?.width).toBe(30);
  });

  it('returns nothing for a degenerate surface rather than building one', () => {
    const draw = vi.fn();

    expect(getComposedRaster('surface', 0, 10, 20, 20, draw)).toBeNull();
    expect(draw).not.toHaveBeenCalled();
  });

  it.each([
    [36, 32, 49, 43], // item, fractional upscale
    [24, 24, 17, 17], // prayer, downscale
    [16, 16, 48, 48], // spell, integer upscale
  ])('keeps the existing resample pixels for %ix%i -> %ix%i, including after eviction', (w, h, outW, outH) => {
    const sprite = image(w, h);
    const data = new Uint8ClampedArray(w * h * 4);
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const offset = (y * w + x) * 4;
        data.set([x % 3 === 0 ? 0 : 255, (y * 37) % 256, (x * 19) % 256, [0, 128, 255][(x + y) % 3]], offset);
      }
    }
    pixels.set(sprite, data);
    // This is the same pure resample call used before the cache-policy change.
    const expected = resampleForDisplay(data, w, h, outW, outH);
    const first = getResampled(SRC, sprite, outW, outH);
    expect(pixels.get(first)).toEqual(expected);
    expect(getResampled(SRC, sprite, outW, outH)).toBe(first);

    const request = { sourceRect: { x: 2, y: 3, width: w - 4, height: h - 6 }, target: { width: outW, height: outH } };
    const region = getResampledRegion(SRC, sprite, request);
    expect(pixels.get(region!)).toEqual(
      resampleRegionForDisplay({ data, width: w, height: h }, request.sourceRect, request.target),
    );

    configurePixelSpriteStore({ budgetBytes: 0 });
    const rebuilt = getResampled(SRC, sprite, outW, outH);
    expect(rebuilt).not.toBe(first);
    expect(pixels.get(rebuilt)).toEqual(expected);
    expect(pixels.get(first)).toEqual(expected);
  });

  it('accounts sources and canvases by bytes under one budget, with transient readbacks separate', () => {
    configurePixelSpriteStore({ budgetBytes: 2_000 });
    const result = getResampled(SRC, image(10, 10), 20, 20);
    expect(getPixelSpriteStoreStats()).toEqual({
      budgetBytes: 2_000,
      cached: { bytes: 2_000, entries: 2 },
      sources: { bytes: 400, entries: 1 },
      canvases: { bytes: 1_600, entries: 1 },
      transient: { bytesAllocated: 400, allocations: 1 },
    });
    expect(readbacks).toHaveLength(1);
    expect(readbacks[0]).toMatchObject({ width: 0, height: 0 });
    expect(result).toMatchObject({ width: 20, height: 20 });

    // A smaller budget evicts the oldest source, not an arbitrary entry count.
    configurePixelSpriteStore({ budgetBytes: 1_600 });
    expect(getPixelSpriteStoreStats().cached).toEqual({ bytes: 1_600, entries: 1 });
    expect(getPixelSpriteStoreStats().sources).toEqual({ bytes: 0, entries: 0 });
  });

  it('touches hits and evicts in least-recently-used order across both caches', () => {
    configurePixelSpriteStore({ budgetBytes: 808 });
    const drawA = vi.fn();
    const drawB = vi.fn();
    const first = getComposedRaster('a', 1, 1, 10, 10, drawA);
    const second = getComposedRaster('b', 1, 1, 10, 10, drawB);
    expect(getPixelSpriteStoreStats().cached.bytes).toBe(808);
    expect(getComposedRaster('a', 1, 1, 10, 10, drawA)).toBe(first);

    getComposedRaster('c', 1, 1, 10, 10, () => {});
    expect(getPixelSpriteStoreStats().cached).toEqual({ bytes: 804, entries: 3 });
    expect(getComposedRaster('a', 1, 1, 10, 10, drawA)).toBe(first);
    expect(getComposedRaster('b', 1, 1, 10, 10, drawB)).not.toBe(second);
    expect(drawA).toHaveBeenCalledTimes(1);
    expect(drawB).toHaveBeenCalledTimes(2);
    expect(getPixelSpriteStoreStats().cached.bytes).toBeLessThanOrEqual(808);
  });

  it('preserves returned and displayed canvases when dropping cache ownership', () => {
    configurePixelSpriteStore({ budgetBytes: 404 });
    const first = getComposedRaster('display', 1, 1, 10, 10, () => {});
    document.body.append(first!);
    const before = pixels.get(first!);
    getComposedRaster('replacement', 1, 1, 10, 10, () => {});
    configurePixelSpriteStore({ budgetBytes: 0 });

    expect(first).toMatchObject({ width: 10, height: 10, isConnected: true });
    expect(pixels.get(first!)).toBe(before);
    // Blitting the held reference still works; the store never cleared its backing pixels.
    const displayCopy = document.createElement('canvas');
    displayCopy.getContext('2d')?.drawImage(first!, 0, 0);
    expect(pixels.get(displayCopy)).toEqual(before);
    expect(getPixelSpriteStoreStats().cached).toEqual({ bytes: 0, entries: 0 });
    first?.remove();
  });

  it('does not flush a useful working set to admit an oversized return', () => {
    configurePixelSpriteStore({ budgetBytes: 2_000 });
    const sprite = image(10, 10);
    const first = getResampled(SRC, sprite, 20, 20);
    const oversized = getResampled(SRC, sprite, 30, 30);
    expect(oversized).toMatchObject({ width: 30, height: 30 });
    expect(getResampled(SRC, sprite, 20, 20)).toBe(first);
    expect(getPixelSpriteStoreStats().cached).toEqual({ bytes: 2_000, entries: 2 });
    expect(getPixelSpriteStoreStats().transient).toEqual({ bytesAllocated: 4_000, allocations: 2 });
  });

  it('supports zero retention and accounts uncached source pixels and canvases separately from the cache', () => {
    configurePixelSpriteStore({ budgetBytes: 0 });
    const first = getResampled(SRC, image(10, 10), 20, 20);
    expect(first).toMatchObject({ width: 20, height: 20 });
    expect(getPixelSpriteStoreStats()).toMatchObject({
      cached: { bytes: 0, entries: 0 },
      transient: { bytesAllocated: 2_400, allocations: 3 },
    });
  });

  it('releases private composition canvases even if drawing throws', () => {
    let scratch: HTMLCanvasElement | undefined;
    expect(() =>
      getComposedRaster('failed', 10, 10, 20, 20, (ctx) => {
        scratch = ctx.canvas;
        throw new Error('draw failed');
      }),
    ).toThrow('draw failed');
    expect(scratch).toMatchObject({ width: 0, height: 0 });
    expect(getPixelSpriteStoreStats().cached.bytes).toBe(0);
  });

  it.each([
    -1,
    1.5,
    Number.NaN,
    Number.POSITIVE_INFINITY,
    Number.MAX_SAFE_INTEGER + 1,
  ])('rejects invalid budget %s', (budgetBytes) => {
    expect(() => configurePixelSpriteStore({ budgetBytes })).toThrow(RangeError);
    expect(getPixelSpriteStoreStats().budgetBytes).toBe(DEFAULT_PIXEL_SPRITE_BUDGET_BYTES);
  });

  it('regenerates nothing after warming combat tabs, skills and button chrome at three DPR-3 scales', () => {
    const tabs = [
      { name: 'inventory', count: 28, w: 36, h: 32 },
      { name: 'equipment', count: 14, w: 36, h: 32 },
      { name: 'prayers', count: 29, w: 24, h: 24 },
      { name: 'spells', count: 70, w: 16, h: 16 },
    ];
    const sprites = tabs.flatMap((tab) =>
      Array.from({ length: tab.count }, (_, i) => ({ src: `${tab.name}/${i}`, image: image(tab.w, tab.h), ...tab })),
    );
    const draw = vi.fn();
    const visit = (scales: number[]) => {
      const results = new Map<string, object | null>();
      for (const scale of scales) {
        const density = scale * 3;
        for (const sprite of sprites) {
          results.set(
            `${sprite.src}|${scale}`,
            getResampled(sprite.src, sprite.image, sprite.w * density, sprite.h * density),
          );
        }
        results.set(`skills|${scale}`, getComposedRaster('skills', 190, 260, 190 * density, 260 * density, draw));
        results.set(`button|${scale}`, getComposedRaster('button', 190, 30, 190 * density, 30 * density, draw));
      }
      return results;
    };

    const warm = visit([0.9, 1, 1.1]);
    const stats = getPixelSpriteStoreStats();
    expect(stats).toEqual({
      budgetBytes: DEFAULT_PIXEL_SPRITE_BUDGET_BYTES,
      cached: { bytes: 15_570_096, entries: 572 },
      sources: { bytes: 552_432, entries: 143 },
      canvases: { bytes: 15_017_664, entries: 429 },
      transient: { bytesAllocated: 552_432, allocations: 143 },
    });
    expect(stats.cached.bytes).toBeLessThan(DEFAULT_PIXEL_SPRITE_BUDGET_BYTES);
    const writesAfterWarmup = bitmapWrites.mock.calls.length;
    expect(writesAfterWarmup).toBe(429);
    for (let pass = 0; pass < 4; pass++) {
      for (const [key, raster] of visit(pass % 2 ? [0.9, 1, 1.1] : [1.1, 1, 0.9])) {
        expect(raster).toBe(warm.get(key));
      }
    }
    expect(bitmapWrites).toHaveBeenCalledTimes(writesAfterWarmup);
    expect(readbacks).toHaveLength(143);
    expect(draw).toHaveBeenCalledTimes(2);
    expect(getPixelSpriteStoreStats()).toEqual(stats);
  });
});

describe('subscribe', () => {
  beforeEach(() => resetPixelSpriteStore());
  afterEach(() => resetPixelSpriteStore());

  it('hands back an unsubscribe that detaches the listener', () => {
    const listener = vi.fn();
    subscribe(listener)();
    expect(listener).not.toHaveBeenCalled();
  });
});
