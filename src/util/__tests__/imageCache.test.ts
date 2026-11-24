import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  getCachedImage,
  getStylesheetUrl,
  IMAGE_CROSS_ORIGIN,
  isImageCached,
  loadCachedImage,
  loadStylesheetUrl,
  resetImageCache,
} from '../imageCache';

interface FakeImageOptions {
  /** Hold every load open, so the pool's queue can be observed while it is still full. */
  readonly hold?: boolean;
  readonly fails?: (src: string) => boolean;
}

/**
 * Records the order requests are actually ISSUED in, which is the only way to see queue
 * position: every caller gets a promise immediately, but a queued job does not touch the
 * network until the pool gives it a slot.
 */
function installFakeImage({ hold = false, fails = () => false }: FakeImageOptions = {}) {
  const real = globalThis.Image;
  const issued: string[] = [];
  const held: Array<() => void> = [];
  class FakeImage {
    onload: (() => void) | null = null;
    onerror: (() => void) | null = null;
    naturalWidth = 10;
    naturalHeight = 10;
    crossOrigin = '';
    decoding = '';
    private requested = '';
    get src() {
      return this.requested;
    }
    set src(value: string) {
      this.requested = value;
      issued.push(value);
      const settle = () => {
        if (fails(value)) this.onerror?.();
        else this.onload?.();
      };
      if (hold) held.push(settle);
      else queueMicrotask(settle);
    }
    decode() {
      return Promise.resolve();
    }
  }
  globalThis.Image = FakeImage as unknown as typeof Image;
  return {
    issued,
    /**
     * Settling frees pool slots, which lets queued jobs start and hold in turn, so this has
     * to drain rather than sweep once.
     */
    settleAll: async () => {
      while (held.length > 0) {
        for (const settle of held.splice(0)) settle();
        await new Promise((resolve) => setTimeout(resolve, 0));
      }
    },
    restore: () => {
      globalThis.Image = real;
    },
  };
}

const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

describe('imageCache', () => {
  let fake: ReturnType<typeof installFakeImage>;

  afterEach(async () => {
    // The pool is a module singleton, and `resetImageCache` cannot free a slot that a held
    // load still occupies — leaving one open would deadlock every later suite in this file.
    await fake.settleAll();
    fake.restore();
    resetImageCache();
  });

  describe('priority', () => {
    beforeEach(() => {
      resetImageCache();
      fake = installFakeImage({ hold: true });
    });

    it('lets an on-screen sprite overtake speculation already queued for it', async () => {
      // 40 queued is far more than the pool's 8 concurrent slots.
      for (let index = 0; index < 40; index++) void loadCachedImage(`/bg-${index}.png`, 'background');
      await flush();
      const queued = '/bg-39.png';
      expect(fake.issued).not.toContain(queued);

      void loadCachedImage(queued, 'immediate');
      await flush();

      expect(fake.issued).toContain(queued);
    });

    it('leaves the rest of the queue in order behind a promoted sprite', async () => {
      for (let index = 0; index < 40; index++) void loadCachedImage(`/bg-${index}.png`, 'background');
      await flush();

      void loadCachedImage('/bg-30.png', 'immediate');
      await flush();
      await fake.settleAll();

      const rest = fake.issued.filter((src) => src !== '/bg-30.png').map((src) => Number(/\d+/.exec(src)?.[0]));
      expect(rest).toEqual([...rest].sort((left, right) => left - right));
    });
  });

  describe('caching', () => {
    beforeEach(() => {
      resetImageCache();
      fake = installFakeImage({ fails: (src) => src.includes('broken') });
    });

    it('issues one request no matter how many callers ask at once', async () => {
      const results = await Promise.all([
        loadCachedImage('/icon.png'),
        loadCachedImage('/icon.png'),
        loadCachedImage('/icon.png', 'immediate'),
      ]);
      expect(fake.issued.filter((src) => src === '/icon.png')).toHaveLength(1);
      expect(new Set(results).size).toBe(1);
    });

    it('answers a finished load from memory without touching the network again', async () => {
      await loadCachedImage('/icon.png');
      expect(isImageCached('/icon.png')).toBe(true);

      await loadCachedImage('/icon.png', 'immediate');
      expect(fake.issued.filter((src) => src === '/icon.png')).toHaveLength(1);
    });

    // `undefined` and `null` mean different things to the components: one starts a load, the
    // other means there is nothing to paint. Collapsing them would retry a missing sprite on
    // every mount.
    it('remembers a failure instead of re-requesting it', async () => {
      expect(getCachedImage('/broken.png')).toBeUndefined();

      expect(await loadCachedImage('/broken.png')).toBeNull();
      expect(getCachedImage('/broken.png')).toBeNull();
      expect(isImageCached('/broken.png')).toBe(false);

      await loadCachedImage('/broken.png');
      expect(fake.issued.filter((src) => src === '/broken.png')).toHaveLength(1);
    });
  });

  // A stylesheet cannot set `crossOrigin`, so pointing one at a sprite's path loads and decodes it
  // a second time. It paints an object URL made from the same bytes instead.
  describe('stylesheet URLs', () => {
    const realCreate = URL.createObjectURL;
    const realRevoke = URL.revokeObjectURL;
    let made = 0;
    const revoked: string[] = [];
    const fetched: { url: string; init?: RequestInit }[] = [];

    beforeEach(() => {
      resetImageCache();
      fake = installFakeImage({ fails: (src) => src.includes('broken') });
      made = 0;
      revoked.length = 0;
      fetched.length = 0;
      vi.stubGlobal('fetch', async (url: string, init?: RequestInit) => {
        fetched.push({ url, init });
        return { ok: true, blob: async () => new Blob(['png']) };
      });
      URL.createObjectURL = () => `blob:sprite-${++made}`;
      URL.revokeObjectURL = (url: string) => {
        revoked.push(url);
      };
    });

    afterEach(() => {
      vi.unstubAllGlobals();
      URL.createObjectURL = realCreate;
      URL.revokeObjectURL = realRevoke;
    });

    it('makes one object URL per sprite from its cached bytes, then answers synchronously', async () => {
      expect(getStylesheetUrl('/stone.png')).toBeUndefined();

      const urls = await Promise.all([loadStylesheetUrl('/stone.png'), loadStylesheetUrl('/stone.png', 'immediate')]);
      expect(urls).toEqual(['blob:sprite-1', 'blob:sprite-1']);
      expect(getStylesheetUrl('/stone.png')).toBe('blob:sprite-1');
      expect(await loadStylesheetUrl('/stone.png')).toBe('blob:sprite-1');
      expect(made).toBe(1);

      // The bytes come from the image the cache already holds: one image request, and one fetch
      // in the same CORS mode, which the HTTP cache answers.
      expect(isImageCached('/stone.png')).toBe(true);
      expect(fake.issued.filter((src) => src === '/stone.png')).toHaveLength(1);
      expect(IMAGE_CROSS_ORIGIN).toBe('anonymous');
      expect(fetched).toEqual([{ url: '/stone.png', init: { mode: 'cors', credentials: 'same-origin' } }]);
      // Decoded under its object URL ahead of the stylesheet's first paint.
      expect(fake.issued).toContain('blob:sprite-1');
    });

    it('gives nothing to paint for a sprite that failed to load', async () => {
      expect(await loadStylesheetUrl('/broken.png')).toBeNull();
      expect(getStylesheetUrl('/broken.png')).toBeNull();
      expect(fetched).toEqual([]);
    });

    it('falls back to the file itself where object URLs are unavailable', async () => {
      URL.createObjectURL = undefined as unknown as typeof URL.createObjectURL;
      expect(await loadStylesheetUrl('/stone.png')).toBe('/stone.png');
    });

    it('revokes only the object URLs it made, when the cache is reset', async () => {
      await loadStylesheetUrl('/stone.png');
      resetImageCache();
      expect(revoked).toEqual(['blob:sprite-1']);
      expect(getStylesheetUrl('/stone.png')).toBeUndefined();
    });
  });
});
