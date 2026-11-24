// @vitest-environment happy-dom
import { cleanup, render } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { TooltipScaleContext } from '../Tooltip/tooltipTypes';

/**
 * The store is mocked so these tests drive the component's sizing decisions directly, with no
 * image loading involved. `src/test/setup.ts` hands every canvas a 2D context built of noops, so
 * a draw runs but leaves nothing behind to read: asserting on one means installing a stand-in
 * with `mockContext`. The backing-store size is set on the canvas either way, and that is what
 * makes the bitmap land on the device pixel grid.
 */
const store = vi.hoisted(() => ({
  sprite: { naturalWidth: 27, naturalHeight: 27 } as { naturalWidth: number; naturalHeight: number } | null | undefined,
  loaded: [] as string[],
  resamples: [] as { src: string; width: number; height: number }[],
  regionResamples: [] as {
    src: string;
    sourceRect: { readonly x: number; readonly y: number; readonly width: number; readonly height: number };
    target: { readonly width: number; readonly height: number };
  }[],
  regionBitmap: { kind: 'region-bitmap' } as { readonly kind: 'region-bitmap' } | null,
}));

vi.mock('../pixelSpriteStore', () => ({
  subscribe: () => () => {},
  getSprite: () => store.sprite,
  loadSprite: (src: string) => {
    store.loaded.push(src);
    return Promise.resolve(null);
  },
  getResampled: (src: string, image: unknown, width: number, height: number) => {
    store.resamples.push({ src, width, height });
    return image;
  },
  getResampledRegion: (
    src: string,
    _image: unknown,
    request: {
      readonly sourceRect: { readonly x: number; readonly y: number; readonly width: number; readonly height: number };
      readonly target: { readonly width: number; readonly height: number };
    },
  ) => {
    store.regionResamples.push({ src, ...request });
    return store.regionBitmap;
  },
}));

const { PixelSprite } = await import('../PixelSprite');

const SRC = '/assets/ui/prayers/Protect_from_Magic.png';
const ORB_SRC = '/assets/ui/other/minimap_orb_hitpoints_icon.png';
const originalGetContext = HTMLCanvasElement.prototype.getContext;

const canvasOf = (container: HTMLElement) => container.querySelector('canvas');

/**
 * A descriptor's `value` is untyped, so a stand-in carrying only the members the paint touches
 * satisfies it. `vi.spyOn` with `mockReturnValue` types that slot as a full
 * `CanvasRenderingContext2D`, which no stand-in meets without a cast asserting one into being.
 */
function defineGetContext(value: unknown): void {
  Object.defineProperty(HTMLCanvasElement.prototype, 'getContext', { configurable: true, writable: true, value });
}

function mockContext(): ReturnType<typeof vi.fn> {
  const drawImage = vi.fn();
  const context = { clearRect: () => {}, drawImage, imageSmoothingEnabled: true };
  defineGetContext(() => context);
  return drawImage;
}

afterEach(() => {
  // Before anything that can throw: a patched prototype outlives this file, so a failure in
  // `cleanup()` would hand every later suite in this worker a canvas with a fake 2D context.
  defineGetContext(originalGetContext);
  cleanup();
  store.sprite = { naturalWidth: 27, naturalHeight: 27 };
  store.loaded.length = 0;
  store.resamples.length = 0;
  store.regionResamples.length = 0;
  store.regionBitmap = { kind: 'region-bitmap' };
});

describe('PixelSprite layout box', () => {
  it('lays out at the sprite size, not the device bitmap size, when the call site sets no dimensions', () => {
    // Prayer icons pass only cosmetic style. A 27px sprite at uiScale 2 resamples to a 54px
    // bitmap; if that bitmap sized the element it would overflow its slot.
    const { container } = render(
      <TooltipScaleContext.Provider value={2}>
        <PixelSprite src={SRC} style={{ imageRendering: 'pixelated' }} />
      </TooltipScaleContext.Provider>,
    );

    const canvas = canvasOf(container);
    expect(canvas?.style.width).toBe('27px');
    expect(canvas?.style.height).toBe('27px');
  });

  it('sizes the backing store to the device box so the bitmap lands on the pixel grid', () => {
    const { container } = render(
      <TooltipScaleContext.Provider value={2}>
        <PixelSprite src={SRC} />
      </TooltipScaleContext.Provider>,
    );

    // 27 CSS px at uiScale 2, dpr 1.
    expect(canvasOf(container)?.width).toBe(54);
  });

  it('honors an explicit box from the call site', () => {
    store.sprite = { naturalWidth: 36, naturalHeight: 32 };
    const { container } = render(<PixelSprite src={SRC} style={{ maxWidth: 36, maxHeight: 36 }} />);
    const canvas = canvasOf(container);
    expect(canvas?.style.width).toBe('36px');
    expect(canvas?.style.height).toBe('32px');
  });

  it('rounds a fractional device box to whole pixels', () => {
    const { container } = render(
      <TooltipScaleContext.Provider value={4 / 3}>
        <PixelSprite src={SRC} />
      </TooltipScaleContext.Provider>,
    );
    // 27 * 4/3 = 36 exactly; the CSS box stays the sprite's own size.
    expect(canvasOf(container)?.width).toBe(36);
    expect(canvasOf(container)?.style.width).toBe('27px');
  });

  it('takes up no space until the sprite resolves, rather than a canvas default box', () => {
    // A canvas with no dimensions of its own is 300x150. Preloading normally means a sprite is
    // decoded before its first render, but a cold cache does reach here, and
    // the `<img>` this replaced collapsed to nothing while loading.
    store.sprite = undefined;
    const { container } = render(<PixelSprite src={SRC} />);
    expect(canvasOf(container)?.style.width).toBe('0px');
    expect(canvasOf(container)?.style.height).toBe('0px');
  });

  it('holds the box the call site asked for while the sprite is still loading', () => {
    store.sprite = undefined;
    const { container } = render(<PixelSprite src={SRC} width={22} height={22} />);
    expect(canvasOf(container)?.style.width).toBe('22px');
    expect(canvasOf(container)?.style.height).toBe('22px');
  });
});

describe('PixelSprite loading', () => {
  it('asks for a sprite nothing has loaded yet', () => {
    store.sprite = undefined;
    render(<PixelSprite src={SRC} />);
    expect(store.loaded).toContain(SRC);
  });

  it('occupies its slot but shows nothing when the sprite fails', () => {
    store.sprite = null;
    const { container } = render(<PixelSprite src={SRC} />);
    expect(canvasOf(container)?.style.opacity).toBe('0');
  });

  it('repaints from the new sprite when src changes', () => {
    const { container, rerender } = render(<PixelSprite src={SRC} />);
    expect(canvasOf(container)?.getAttribute('data-src')).toBe(SRC);

    const other = '/assets/ui/prayers/Protect_from_Melee.png';
    rerender(<PixelSprite src={other} />);
    expect(canvasOf(container)?.getAttribute('data-src')).toBe(other);
  });

  it('exposes the alt text as an accessible name', () => {
    const { container } = render(<PixelSprite src={SRC} alt="Protect from Magic" />);
    const canvas = canvasOf(container);
    expect(canvas?.getAttribute('role')).toBe('img');
    expect(canvas?.getAttribute('aria-label')).toBe('Protect from Magic');
  });
});

describe('PixelSprite source region', () => {
  const REGION = { x: 5, y: 6, width: 16, height: 16 } as const;
  const ORB = { naturalWidth: 26, naturalHeight: 26 };

  const renderRegion = (scale: number) =>
    render(
      <TooltipScaleContext.Provider value={scale}>
        <PixelSprite src={ORB_SRC} sourceRect={REGION} />
      </TooltipScaleContext.Provider>,
    );

  it('lays out at the region, not at the sprite it is cut from', () => {
    store.sprite = ORB;
    const { container } = renderRegion(1);
    const canvas = canvasOf(container);
    expect(canvas?.style.width).toBe(`${REGION.width}px`);
    expect(canvas?.style.height).toBe(`${REGION.height}px`);
  });

  it("sizes the backing store to the region's device box", () => {
    store.sprite = ORB;
    const { container } = renderRegion(2);
    expect(canvasOf(container)?.width).toBe(REGION.width * 2);
    expect(canvasOf(container)?.height).toBe(REGION.height * 2);
  });

  it('blits one exact region bitmap without cropping a separately rounded full sprite', () => {
    store.sprite = ORB;
    const drawImage = mockContext();
    renderRegion(1.25);

    expect(store.resamples).toEqual([]);
    expect(store.regionResamples).toEqual([{ src: ORB_SRC, sourceRect: REGION, target: { width: 20, height: 20 } }]);
    expect(drawImage).toHaveBeenCalledWith(store.regionBitmap, 0, 0);
  });

  it('draws the requested source rectangle when region resampling is unavailable', () => {
    store.sprite = ORB;
    store.regionBitmap = null;
    const drawImage = mockContext();
    renderRegion(1.25);

    expect(drawImage).toHaveBeenCalledWith(ORB, REGION.x, REGION.y, REGION.width, REGION.height, 0, 0, 20, 20);
  });

  it('leaves a sprite with no region drawing its whole bitmap', () => {
    const sprite = { naturalWidth: 27, naturalHeight: 27 };
    store.sprite = sprite;
    const drawImage = mockContext();
    render(<PixelSprite src={SRC} />);

    expect(store.resamples).toEqual([{ src: SRC, width: sprite.naturalWidth, height: sprite.naturalHeight }]);
    expect(drawImage).toHaveBeenCalledWith(sprite, 0, 0);
  });
});

describe('PixelSprite context loss', () => {
  it('repaints when a lost 2D context is restored', () => {
    const drawImage = mockContext();
    const { container } = render(<PixelSprite src={SRC} />);
    expect(drawImage).toHaveBeenCalledTimes(1);

    canvasOf(container)?.dispatchEvent(new Event('contextrestored'));
    expect(drawImage).toHaveBeenCalledTimes(2);
  });
});
