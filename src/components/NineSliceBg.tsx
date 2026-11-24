import { useLayoutEffect, useRef, useState } from 'react';
import { useDevicePixelRatio } from '../hooks/useDevicePixelRatio';
import { BUTTON } from '../resourcePack';
import { usePanelContentScaleOrNull } from './panelContentScale';
import { getComposedRaster, getSprite, loadSprite, subscribe } from './pixelSpriteStore';

const NINE_SLICE_INSET = 6;

/**
 * 9-slice button background, composed at 1:1 and resampled as ONE bitmap.
 *
 * The edges and middle are repeats, and that is what makes this a seam surface rather than an
 * ordinary sprite. Tiled through CSS `background-repeat` inside a panel scaled by `zoom`, each
 * repetition starts on a different subpixel phase at a fractional device scale, so the browser
 * rounds every tile boundary independently and a hairline shows up between repeats at some scales
 * and not others. Corners drawn as `<img>` round independently of the edges they butt against.
 *
 * Painting all nine pieces at their logical size first makes every seam an exact integer boundary
 * between whole source pixels; the resample then sees one continuous image with no internal edge
 * left to round. Same fix, and same reason, as the Skills panel raster.
 */
export const NineSliceBg: React.FC<{ selected?: boolean }> = ({ selected }) => {
  const hostRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const uiScale = usePanelContentScaleOrNull() ?? 1;
  const dpr = useDevicePixelRatio(Number.POSITIVE_INFINITY);
  const [, forceRepaint] = useState(0);

  const s = selected;
  const parts = [
    s ? BUTTON.cornerTopLeftSelected : BUTTON.cornerTopLeft,
    s ? BUTTON.cornerTopRightSelected : BUTTON.cornerTopRight,
    s ? BUTTON.cornerBottomLeftSelected : BUTTON.cornerBottomLeft,
    s ? BUTTON.cornerBottomRightSelected : BUTTON.cornerBottomRight,
    s ? BUTTON.edgeTopSelected : BUTTON.edgeTop,
    s ? BUTTON.edgeBottomSelected : BUTTON.edgeBottom,
    s ? BUTTON.edgeLeftSelected : BUTTON.edgeLeft,
    s ? BUTTON.edgeRightSelected : BUTTON.edgeRight,
    s ? BUTTON.middleSelected : BUTTON.middle,
  ] as const;

  useLayoutEffect(() => {
    const host = hostRef.current;
    const canvas = canvasRef.current;
    if (!host || !canvas) return;

    const paint = () => {
      // offsetWidth, not getBoundingClientRect: `zoom` is already folded into the rect, and the
      // logical box is what the 9-slice geometry is expressed in.
      const logicalW = host.offsetWidth;
      const logicalH = host.offsetHeight;
      if (logicalW <= 0 || logicalH <= 0) return true;

      const loaded = parts.map((src) => getSprite(src));
      if (loaded.some((image) => image === undefined)) return false;
      const images = loaded as (HTMLImageElement | null)[];

      const deviceScale = uiScale * dpr;
      const bufferW = Math.max(1, Math.round(logicalW * deviceScale));
      const bufferH = Math.max(1, Math.round(logicalH * deviceScale));
      if (canvas.width !== bufferW) canvas.width = bufferW;
      if (canvas.height !== bufferH) canvas.height = bufferH;
      const ctx = canvas.getContext('2d');
      if (!ctx) return true;
      ctx.clearRect(0, 0, bufferW, bufferH);
      ctx.imageSmoothingEnabled = false;

      const [tl, tr, bl, br, et, eb, el, er, mid] = images;
      const composed = getComposedRaster(
        `nineslice|${parts.join(',')}|${logicalW}x${logicalH}`,
        logicalW,
        logicalH,
        bufferW,
        bufferH,
        (flat) => {
          const I = NINE_SLICE_INSET;
          const innerW = Math.max(0, logicalW - 2 * I);
          const innerH = Math.max(0, logicalH - 2 * I);
          // A pattern at 1:1 repeats on exact pixel boundaries, so no repeat can land off-grid.
          const fill = (image: HTMLImageElement | null, x: number, y: number, w: number, h: number) => {
            if (!image || w <= 0 || h <= 0) return;
            const pattern = flat.createPattern(image, 'repeat');
            if (!pattern) return;
            flat.save();
            flat.translate(x, y);
            flat.fillStyle = pattern;
            flat.fillRect(0, 0, w, h);
            flat.restore();
          };
          fill(mid, I, I, innerW, innerH);
          fill(et, I, 0, innerW, I);
          fill(eb, I, logicalH - I, innerW, I);
          fill(el, 0, I, I, innerH);
          fill(er, logicalW - I, I, I, innerH);
          if (tl) flat.drawImage(tl, 0, 0, I, I);
          if (tr) flat.drawImage(tr, logicalW - I, 0, I, I);
          if (bl) flat.drawImage(bl, 0, logicalH - I, I, I);
          if (br) flat.drawImage(br, logicalW - I, logicalH - I, I, I);
        },
      );
      if (composed) ctx.drawImage(composed, 0, 0);
      return true;
    };

    if (paint()) return;

    for (const src of parts) {
      if (getSprite(src) === undefined) void loadSprite(src);
    }
    const unsubscribe = subscribe(() => {
      if (paint()) {
        unsubscribe();
        forceRepaint((n) => n + 1);
      }
    });
    return unsubscribe;
  });

  return (
    <div ref={hostRef} style={{ position: 'absolute', inset: 0, overflow: 'hidden', pointerEvents: 'none' }}>
      <canvas ref={canvasRef} style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }} />
    </div>
  );
};
