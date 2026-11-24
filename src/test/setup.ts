// NOTE: `fake-indexeddb/auto` is deliberately NOT imported here. It costs ~40ms of
// CPU per test file, and this setup runs for all ~400 of them while only the cache
// suites touch IndexedDB. Those files import it directly instead.
import { afterEach, vi } from 'vitest';

// jsdom doesn't implement ResizeObserver — provide a minimal mock
if (typeof globalThis.ResizeObserver === 'undefined') {
  globalThis.ResizeObserver = class ResizeObserver {
    observe() {}
    unobserve() {}
    disconnect() {}
  } as unknown as typeof ResizeObserver;
}

// React Testing Library registers afterEach(cleanup) as an import side-effect, which
// only attaches to the first file that imports the (then-cached) module. Register it
// explicitly here so every file unmounts its rendered trees after each test, instead
// of relying on RTL's import-order quirk.
if (typeof document !== 'undefined') {
  const { cleanup } = await import('@testing-library/react');
  afterEach(() => {
    cleanup();
  });
}

if (typeof document !== 'undefined') {
  const jestDomPath = '@testing-library/jest-dom';
  await import(/* @vite-ignore */ jestDomPath);
  localStorage.setItem('osrs-yama-settings', JSON.stringify({ logLevel: 'none' }));

  // happy-dom's Animation.cancel() rejects `finished` without marking it handled, as the Web
  // Animations spec ("cancel an animation") and browsers do, so every canceled panel glide would
  // surface as an unhandled rejection and fail the run. Mark it handled first.
  if (typeof Animation !== 'undefined') {
    const cancel = Animation.prototype.cancel;
    Animation.prototype.cancel = function (this: Animation) {
      this.finished.catch(() => {});
      cancel.call(this);
    };
  }

  // jsdom doesn't implement canvas getContext — provide a minimal 2D context mock
  const originalGetContext = HTMLCanvasElement.prototype.getContext;
  HTMLCanvasElement.prototype.getContext = function (this: HTMLCanvasElement, contextId: string, ...args: any[]) {
    if (contextId === '2d') {
      const noop = () => {};
      return {
        canvas: this,
        fillRect: noop,
        clearRect: noop,
        strokeRect: noop,
        fillText: noop,
        strokeText: noop,
        measureText: () => ({ width: 0 }),
        drawImage: noop,
        getImageData: () => ({ data: new Uint8ClampedArray(0), width: 0, height: 0 }),
        putImageData: noop,
        createImageData: () => ({ data: new Uint8ClampedArray(0), width: 0, height: 0 }),
        setTransform: noop,
        resetTransform: noop,
        transform: noop,
        scale: noop,
        rotate: noop,
        translate: noop,
        save: noop,
        restore: noop,
        beginPath: noop,
        closePath: noop,
        moveTo: noop,
        lineTo: noop,
        arc: noop,
        arcTo: noop,
        rect: noop,
        ellipse: noop,
        bezierCurveTo: noop,
        quadraticCurveTo: noop,
        fill: noop,
        stroke: noop,
        clip: noop,
        createLinearGradient: () => ({ addColorStop: noop }),
        createRadialGradient: () => ({ addColorStop: noop }),
        createPattern: () => null,
        globalAlpha: 1,
        globalCompositeOperation: 'source-over',
        fillStyle: '#000',
        strokeStyle: '#000',
        lineWidth: 1,
        lineCap: 'butt',
        lineJoin: 'miter',
        font: '10px sans-serif',
        textAlign: 'start',
        textBaseline: 'alphabetic',
        imageSmoothingEnabled: true,
      } as unknown as CanvasRenderingContext2D;
    }
    return originalGetContext.call(this, contextId, ...args);
  } as any;
}

const originalFetch = globalThis.fetch?.bind(globalThis);

/** What /osrs-cache/manifest.json answers in tests; its disk.zip is never there. */
const TEST_CACHE_MANIFEST = {
  id: 2437,
  scope: 'runescape',
  game: 'oldschool',
  language: 'en',
  environment: 'live',
  timestamp: '2024-01-01T00:00:00.000Z',
  builds: [{ major: 232, minor: 0 }],
};

function getRequestUrl(input: RequestInfo | URL): string {
  if (typeof input === 'string') return input;
  if (input instanceof URL) return input.toString();
  return input.url;
}

vi.stubGlobal(
  'fetch',
  vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = getRequestUrl(input);

    if (url.endsWith('/osrs-cache/manifest.json')) {
      return Response.json(TEST_CACHE_MANIFEST);
    }

    if (url.includes('/osrs-cache/disk.zip')) {
      return new Response('not found', { status: 404, statusText: 'Not Found' });
    }

    if (url.startsWith('/') && /\.(webp|png|jpg|jpeg|gif|svg|mp3|ogg|wav)$/i.test(url)) {
      return new Response(new Uint8Array(0), {
        headers: { 'Content-Type': 'application/octet-stream' },
      });
    }

    if (!originalFetch) {
      throw new Error(`fetch is unavailable for ${url}`);
    }

    return originalFetch(input, init);
  }),
);
