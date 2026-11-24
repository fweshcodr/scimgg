import type { CanvasHTMLAttributes, CSSProperties } from 'react';
import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useLayoutEffect,
  useRef,
  useSyncExternalStore,
} from 'react';
import { useDevicePixelRatio } from '../hooks/useDevicePixelRatio';
import type { SpriteSourceRect } from '../util/pixelSprite';
import { fitLayoutSize } from '../util/pixelSprite';
import { usePanelContentScaleOrNull } from './panelContentScale';
import { getResampled, getResampledRegion, getSprite, loadSprite, subscribe } from './pixelSpriteStore';

export type { SpriteSourceRect } from '../util/pixelSprite';

export type PixelSpriteProps = Omit<CanvasHTMLAttributes<HTMLCanvasElement>, 'width' | 'height'> & {
  src: string;
  alt?: string;
  scale?: number;
  /**
   * Layout size in CSS px, as the `width`/`height` attributes meant on the `<img>` this
   * replaces. They never reach the canvas, whose own width/height ARE its backing store and
   * are set to the device box instead. An inline style wins over these.
   */
  width?: number;
  height?: number;
  /**
   * The window of the sprite to show, in the sprite's OWN pixels: it takes the place of the
   * sprite's natural size everywhere below, so a call site never scales it by the panel or the
   * device. Hoist it to a module constant — an object literal is a new value every render.
   */
  sourceRect?: SpriteSourceRect;
};

/**
 * Pixel-art sprite that paints at the display's real pixel grid.
 *
 * OSRS UI sprites are drawn 1:1 in the real client. Here they sit inside a panel scaled by
 * `uiScale * devicePixelRatio`, which is rarely an integer, and neither browser filter handles
 * that: `image-rendering: pixelated` duplicates some source rows more times than others, so a
 * 1px outline lands 2px on one edge and 3px on the other, while bilinear smears every hard
 * edge. This reconstructs the sprite (see `util/pixelSprite`) onto the exact device-pixel
 * box, so the browser has nothing left to interpolate.
 *
 * It paints a `<canvas>` rather than an `<img>` because there is no way to hand a bitmap to an
 * `<img>` without a URL, and routing one through `canvas.toBlob` costs 27ms to encode the PNG
 * and another 21-37ms for the browser to decode it back, against a resample that costs ~0.8ms.
 * Drawing into a canvas skips both, and takes with it the queue, frame budget, priority rules
 * and refcounted URL lifetimes that ~50ms an icon had required.
 *
 * The CSS box is pinned to the layout size the ORIGINAL sprite would have occupied, so swapping
 * in a device-resolution bitmap can never change layout.
 */
export const PixelSprite = forwardRef<HTMLCanvasElement, PixelSpriteProps>(
  ({ src, alt = '', style, scale, width, height, sourceRect, ...props }, ref) => {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    useImperativeHandle(ref, () => canvasRef.current as HTMLCanvasElement);

    // The APPLIED panel zoom, not the global UI scale: a pinned panel covers a snapped
    // frame-space box, and a sprite rasterized at the raw scale is resampled by the difference.
    const contextScale = usePanelContentScaleOrNull() ?? 1;
    const uiScale = scale ?? contextScale;
    // Exact density: resampling an icon is a single draw, so there is no reason to cap it the
    // way a full-screen backing buffer must be.
    const dpr = useDevicePixelRatio(Number.POSITIVE_INFINITY);

    const image = useSyncExternalStore(
      subscribe,
      () => getSprite(src),
      () => undefined,
    );

    useEffect(() => {
      if (image === undefined) void loadSprite(src);
    }, [image, src]);

    const styleWidth = typeof style?.width === 'number' ? style.width : width;
    const styleHeight = typeof style?.height === 'number' ? style.height : height;
    const styleMaxWidth = typeof style?.maxWidth === 'number' ? style.maxWidth : undefined;
    const styleMaxHeight = typeof style?.maxHeight === 'number' ? style.maxHeight : undefined;

    const box = image
      ? fitLayoutSize(sourceRect?.width ?? image.naturalWidth, sourceRect?.height ?? image.naturalHeight, {
          width: styleWidth,
          height: styleHeight,
          maxWidth: styleMaxWidth,
          maxHeight: styleMaxHeight,
        })
      : null;

    const deviceW = box ? Math.max(1, Math.round(box.width * uiScale * dpr)) : 0;
    const deviceH = box ? Math.max(1, Math.round(box.height * uiScale * dpr)) : 0;

    const paint = useCallback(() => {
      const canvas = canvasRef.current;
      if (!canvas || !image || deviceW <= 0 || deviceH <= 0) return;
      if (canvas.width !== deviceW) canvas.width = deviceW;
      if (canvas.height !== deviceH) canvas.height = deviceH;

      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      ctx.clearRect(0, 0, deviceW, deviceH);

      ctx.imageSmoothingEnabled = false;
      if (!sourceRect) {
        ctx.drawImage(getResampled(src, image, deviceW, deviceH), 0, 0);
        return;
      }

      const region = getResampledRegion(src, image, {
        sourceRect,
        target: { width: deviceW, height: deviceH },
      });
      if (region) {
        ctx.drawImage(region, 0, 0);
        return;
      }
      ctx.drawImage(image, sourceRect.x, sourceRect.y, sourceRect.width, sourceRect.height, 0, 0, deviceW, deviceH);
    }, [image, src, deviceW, deviceH, sourceRect]);

    // Layout effect, so the bitmap is on the canvas in the same frame the element appears —
    // there is no intermediate state where the sprite is missing or the wrong size.
    useLayoutEffect(paint, [paint]);

    // A 2D context can be lost under GPU pressure or a driver reset, which empties the canvas.
    // Nothing else brings the sprite back: the paint effect's inputs (src, image, device box) are
    // all unchanged by a context loss, so without this the sprite stays blank for the rest of the
    // session. Never `preventDefault()` the loss event — that is what opts OUT of restoration.
    useEffect(() => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const onRestored = () => paint();
      canvas.addEventListener('contextrestored', onRestored);
      return () => canvas.removeEventListener('contextrestored', onRestored);
    }, [paint]);

    // A sprite that failed to load keeps its slot but shows nothing. Until it resolves there is
    // no natural size to fit, and a canvas with no dimensions of its own is 300x150 — so an
    // unwarmed sprite has to be pinned to whatever the call site asked for, or to nothing.
    const hidden = image === null;
    const resolvedStyle: CSSProperties = {
      ...style,
      ...(box ? { width: box.width, height: box.height } : { width: styleWidth ?? 0, height: styleHeight ?? 0 }),
      ...(hidden ? { opacity: 0 } : null),
    };

    return (
      <canvas
        ref={canvasRef}
        role="img"
        aria-label={alt || undefined}
        data-src={src}
        style={resolvedStyle}
        {...props}
      />
    );
  },
);

PixelSprite.displayName = 'PixelSprite';
