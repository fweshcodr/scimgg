import type { CSSProperties } from 'react';
import { useLayoutEffect, useRef } from 'react';
import { useDevicePixelRatio } from '../hooks/useDevicePixelRatio';
import { usePanelContentScaleOrNull } from './panelContentScale';
import { getComposedRaster, getSprite, loadSprite, subscribe } from './pixelSpriteStore';

export interface PixelComposedLayerProps {
  /** Must capture everything `draw` reads, sprite paths included — a pack swap changes the art. */
  readonly cacheKey: string;
  /** The surface's LOGICAL size — the space `draw` works in, in unscaled sprite pixels. */
  readonly width: number;
  readonly height: number;
  /**
   * The CSS box to occupy, when the surface is NOT inside a zoom layer and its caller has
   * already scaled its geometry. Omit inside a `DraggablePanel`, where the zoom supplies the
   * density and the logical size IS the CSS size.
   */
  readonly cssSize?: { readonly width: number; readonly height: number };
  /** Every sprite `draw` needs. The surface is not painted until all of them have resolved. */
  readonly sources: readonly string[];
  readonly draw: (ctx: CanvasRenderingContext2D, images: ReadonlyMap<string, HTMLImageElement>) => void;
  readonly style?: CSSProperties;
}

/**
 * A multi-sprite surface painted at 1:1 and resampled as ONE bitmap.
 *
 * `PixelSpriteLayer` puts a group of sprites on a single canvas, which removes the compositing
 * layer boundaries between them, but each sprite is still reconstructed onto its own rounded
 * device box. That is fine for a grid of icons with gaps between them, and wrong for any surface
 * whose pieces MEET: two rects that abut round their shared edge independently, and a CSS-style
 * repeat starts every tile on a different subpixel phase. Either way a hairline appears at some
 * scales and not others.
 *
 * Drawing into a logical-size buffer first makes every internal join an exact integer boundary
 * between whole source pixels, so the reconstruction sees one continuous image with no internal
 * edge left to round. Use this for tiled fills, 9-slices and abutting chrome; use
 * `PixelSpriteLayer` for a grid of independent icons.
 */
export const PixelComposedLayer: React.FC<PixelComposedLayerProps> = ({
  cacheKey,
  width,
  height,
  cssSize,
  sources,
  draw,
  style,
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  // The APPLIED panel zoom, not the global UI scale: a pinned panel covers a snapped frame-space
  // box, and a raster built at the raw scale is resampled by the difference.
  const uiScale = usePanelContentScaleOrNull() ?? 1;
  const dpr = useDevicePixelRatio(Number.POSITIVE_INFINITY);
  const drawRef = useRef(draw);
  drawRef.current = draw;
  // Call sites rebuild these every render; the identity of their CONTENTS is what matters.
  const sourceKey = sources.join('\u0000');
  const boxWidth = cssSize?.width;
  const boxHeight = cssSize?.height;

  useLayoutEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || width <= 0 || height <= 0) return;

    const required = sourceKey.length > 0 ? sourceKey.split('\u0000') : [];
    const paint = (): boolean => {
      const images = new Map<string, HTMLImageElement>();
      for (const src of required) {
        const image = getSprite(src);
        if (image === undefined) return false;
        if (image !== null) images.set(src, image);
      }

      // A caller that supplies a CSS box has already scaled its geometry, so the box carries
      // the density; without one the surface is inside a zoom layer and the zoom does.
      const scaled = boxWidth !== undefined && boxHeight !== undefined;
      const boxW = scaled ? boxWidth : width;
      const boxH = scaled ? boxHeight : height;
      const density = scaled ? dpr : uiScale * dpr;
      const bufferW = Math.max(1, Math.round(boxW * density));
      const bufferH = Math.max(1, Math.round(boxH * density));
      if (canvas.width !== bufferW) canvas.width = bufferW;
      if (canvas.height !== bufferH) canvas.height = bufferH;
      const ctx = canvas.getContext('2d');
      if (!ctx) return true;
      ctx.clearRect(0, 0, bufferW, bufferH);
      ctx.imageSmoothingEnabled = false;

      const composed = getComposedRaster(cacheKey, Math.round(width), Math.round(height), bufferW, bufferH, (flat) =>
        drawRef.current(flat, images),
      );
      if (composed) ctx.drawImage(composed, 0, 0);
      return true;
    };

    if (paint()) return;

    for (const src of required) {
      if (getSprite(src) === undefined) void loadSprite(src);
    }
    let unsubscribe: (() => void) | null = null;
    // `paint` draws straight to the canvas, so a late sprite needs no re-render to become
    // visible — bumping React state here would only cost a render that changes nothing.
    unsubscribe = subscribe(() => {
      if (paint()) unsubscribe?.();
    });
    return () => unsubscribe?.();
  }, [cacheKey, width, height, boxWidth, boxHeight, sourceKey, uiScale, dpr]);

  return (
    <canvas
      ref={canvasRef}
      aria-hidden
      // Dev-only: what this raster is composed from, for tests and DevTools. The guard comes
      // first so the bundler folds it out of a build.
      data-composed={import.meta.env.DEV ? cacheKey : undefined}
      style={{
        position: 'absolute',
        left: 0,
        top: 0,
        width: boxWidth ?? width,
        height: boxHeight ?? height,
        pointerEvents: 'none',
        ...style,
      }}
    />
  );
};

/** Fill `rect` by repeating `image` at 1:1 from `originX/originY`, the CSS `repeat` equivalent. */
export function tileFill(
  ctx: CanvasRenderingContext2D,
  image: HTMLImageElement,
  x: number,
  y: number,
  w: number,
  h: number,
  originX = 0,
  originY = 0,
): void {
  if (w <= 0 || h <= 0) return;
  const pattern = ctx.createPattern(image, 'repeat');
  if (!pattern) return;
  ctx.save();
  ctx.beginPath();
  ctx.rect(x, y, w, h);
  ctx.clip();
  ctx.translate(x + originX, y + originY);
  ctx.fillStyle = pattern;
  ctx.fillRect(-originX, -originY, w, h);
  ctx.restore();
}
