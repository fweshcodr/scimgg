// @vitest-environment happy-dom
import { cleanup, render } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { PanelContentScaleProvider } from '../panelContentScale';

/**
 * The store is mocked so these tests drive the layer's sizing and subscription decisions
 * directly. happy-dom has no 2D context, so `getContext` returns null and the draw is skipped —
 * but the backing store is sized before that, which is the part worth pinning: it is what puts
 * the raster on the device pixel grid.
 */
const store = vi.hoisted(() => {
  const sprites = new Map<string, { naturalWidth: number; naturalHeight: number } | null | undefined>();
  const listeners = new Set<() => void>();
  return {
    sprites,
    listeners,
    loaded: [] as string[],
    notify: () => {
      for (const listener of [...listeners]) listener();
    },
  };
});

vi.mock('../pixelSpriteStore', () => ({
  subscribe: (listener: () => void) => {
    store.listeners.add(listener);
    return () => store.listeners.delete(listener);
  },
  getSprite: (src: string) => store.sprites.get(src),
  loadSprite: (src: string) => {
    store.loaded.push(src);
    return Promise.resolve(null);
  },
  getResampled: (_src: string, image: unknown) => image,
}));

const { PixelSpriteLayer } = await import('../PixelSpriteLayer');

const WARM = '/assets/ui/warm.png';
const COLD = '/assets/ui/cold.png';

const layer = (sprites: { src: string; x: number; y: number; w: number; h: number }[], scale = 1) =>
  render(
    <PanelContentScaleProvider value={scale}>
      <PixelSpriteLayer width={204} height={275} sprites={sprites} />
    </PanelContentScaleProvider>,
  );

const canvasOf = (container: HTMLElement) => container.querySelector('canvas') as HTMLCanvasElement;

afterEach(() => {
  cleanup();
  store.sprites.clear();
  store.listeners.clear();
  store.loaded.length = 0;
});

describe('PixelSpriteLayer', () => {
  it('sizes ONE backing store to the whole layer at the applied panel zoom', () => {
    store.sprites.set(WARM, { naturalWidth: 36, naturalHeight: 32 });
    const { container } = layer([{ src: WARM, x: 0, y: 0, w: 36, h: 32 }], 4 / 3);

    // 204 x 275 CSS px at zoom 4/3, dpr 1.
    expect(container.querySelectorAll('canvas')).toHaveLength(1);
    expect(canvasOf(container).width).toBe(272);
    expect(canvasOf(container).height).toBe(367);
    // The CSS box stays the layer's logical size, so the raster cannot change layout.
    expect(canvasOf(container).style.width).toBe('204px');
  });

  it('cannot swallow a click on the slots it paints over', () => {
    store.sprites.set(WARM, { naturalWidth: 36, naturalHeight: 32 });
    const { container } = layer([{ src: WARM, x: 0, y: 0, w: 36, h: 32 }]);
    expect(canvasOf(container).style.pointerEvents).toBe('none');
  });

  it('requests only the sprites nothing has loaded yet', () => {
    store.sprites.set(WARM, { naturalWidth: 36, naturalHeight: 32 });
    layer([
      { src: WARM, x: 0, y: 0, w: 36, h: 32 },
      { src: COLD, x: 36, y: 0, w: 36, h: 32 },
    ]);
    expect(store.loaded).toEqual([COLD]);
  });

  it('subscribes only while a sprite is outstanding, and drops it once they all settle', () => {
    store.sprites.set(WARM, { naturalWidth: 36, naturalHeight: 32 });
    layer([
      { src: WARM, x: 0, y: 0, w: 36, h: 32 },
      { src: COLD, x: 36, y: 0, w: 36, h: 32 },
    ]);
    expect(store.listeners.size).toBe(1);

    store.sprites.set(COLD, { naturalWidth: 36, naturalHeight: 32 });
    store.notify();

    // A panel that opened cold would otherwise repaint on every unrelated image in the app
    // for as long as it stayed mounted.
    expect(store.listeners.size).toBe(0);
  });

  it('does not subscribe at all when every sprite is already warm', () => {
    store.sprites.set(WARM, { naturalWidth: 36, naturalHeight: 32 });
    layer([{ src: WARM, x: 0, y: 0, w: 36, h: 32 }]);
    expect(store.listeners.size).toBe(0);
  });

  it('treats a sprite that failed to load as settled, not as still outstanding', () => {
    // A failed load resolves to `null`. Nothing retries it, so waiting on it would keep the
    // subscription alive for the life of the panel.
    store.sprites.set(WARM, { naturalWidth: 36, naturalHeight: 32 });
    layer([
      { src: WARM, x: 0, y: 0, w: 36, h: 32 },
      { src: COLD, x: 36, y: 0, w: 36, h: 32 },
    ]);
    store.sprites.set(COLD, null);
    store.notify();
    expect(store.listeners.size).toBe(0);
  });

  it('publishes its placements for tests and DevTools', () => {
    store.sprites.set(WARM, { naturalWidth: 36, naturalHeight: 32 });
    const placements = [{ src: WARM, x: 3, y: 4, w: 36, h: 32 }];
    const { container } = layer(placements);
    expect(JSON.parse(canvasOf(container).dataset.sprites ?? '[]')).toEqual(placements);
  });
});

describe('PixelSpriteLayer repaint after a cold paint', () => {
  const drawn: string[] = [];
  const fakeContext = {
    clearRect: () => {},
    drawImage: (image: { src?: string }) => drawn.push(image.src ?? ''),
    imageSmoothingEnabled: true,
    globalAlpha: 1,
  };
  const original = HTMLCanvasElement.prototype.getContext;

  afterEach(() => {
    HTMLCanvasElement.prototype.getContext = original;
    drawn.length = 0;
  });

  it('paints a sprite that finished decoding between two runs, with no arrival notice', () => {
    HTMLCanvasElement.prototype.getContext = (() => fakeContext) as unknown as typeof original;
    const sprites = () => [{ src: COLD, x: 0, y: 0, w: 10, h: 10 }];
    const { rerender } = layer(sprites());
    expect(drawn).toEqual([]);

    // The decode lands while no subscription is live: the run that asked for it was torn down
    // by a re-render, and the next run finds nothing outstanding to subscribe to.
    store.listeners.clear();
    store.sprites.set(COLD, { naturalWidth: 10, naturalHeight: 10, src: COLD } as never);
    rerender(
      <PanelContentScaleProvider value={1}>
        <PixelSpriteLayer width={204} height={275} sprites={sprites()} />
      </PanelContentScaleProvider>,
    );

    expect(drawn).toEqual([COLD]);
  });
});
