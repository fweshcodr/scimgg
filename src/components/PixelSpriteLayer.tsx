import type { CSSProperties } from 'react';
import { useLayoutEffect, useRef } from 'react';
import { useDevicePixelRatio } from '../hooks/useDevicePixelRatio';
import { fitLayoutSize } from '../util/pixelSprite';
import { usePanelContentScale } from './panelContentScale';
import { getResampled, getSprite, loadSprite, subscribe } from './pixelSpriteStore';

/** One sprite's placement inside the layer, in the layer's own CSS pixels. */
export interface LayerSprite {
  readonly src: string;
  /** Box the sprite is centered in — normally its slot rect. */
  readonly x: number;
  readonly y: number;
  readonly w: number;
  readonly h: number;
  /** Explicit sprite size. Defaults to the natural size, shrunk to fit the box. */
  readonly width?: number;
  readonly height?: number;
  readonly opacity?: number;
  /** Nudge applied after centering (equipment item icons sit 2px right of center). */
  readonly offsetX?: number;
  readonly offsetY?: number;
}

interface PixelSpriteLayerProps {
  /** Layer size in CSS px. Normally the whole panel, so one canvas serves every slot. */
  readonly width: number;
  readonly height: number;
  /** Rebuilt freely: the layer diffs it and repaints only on a real change. */
  readonly sprites: readonly LayerSprite[];
  readonly style?: CSSProperties;
}

function sameSprites(a: readonly LayerSprite[] | null, b: readonly LayerSprite[]): boolean {
  if (a === b) return true;
  if (a === null || a.length !== b.length) return false;
  return a.every((sprite, index) => {
    const other = b[index];
    return (
      sprite.src === other.src &&
      sprite.x === other.x &&
      sprite.y === other.y &&
      sprite.w === other.w &&
      sprite.h === other.h &&
      sprite.width === other.width &&
      sprite.height === other.height &&
      sprite.opacity === other.opacity &&
      sprite.offsetX === other.offsetX &&
      sprite.offsetY === other.offsetY
    );
  });
}

/**
 * Every sprite of one panel, painted into a SINGLE canvas.
 *
 * `PixelSprite` gives each sprite its own canvas, which is right for a lone icon and wrong for
 * a grid: a game panel holds 20-30 of them, and mounting that many canvas elements at once is
 * a measurable share of a tab switch. Switching to the prayer book mid-fight is something
 * players do constantly, so that cost shows up as a hitch.
 *
 * Painting the whole layer is 0.9ms, so there is nothing to gain from partial repaints.
 *
 * The slots themselves stay in the DOM as transparent buttons, so hit-testing, tooltips,
 * context menus, drag and tutorial targeting are untouched; this only takes over painting.
 * Sprites that need a CSS filter (inventory tag outlines) or that move every frame (the drag
 * ghost) stay on `PixelSprite`, where a canvas apiece is the right trade.
 */
export const PixelSpriteLayer: React.FC<PixelSpriteLayerProps> = ({ width, height, sprites, style }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  // The APPLIED panel zoom, not the global UI scale: classic and fixed cover a snapped
  // frame-space box, and a raster built at the raw scale is resampled by the difference.
  const uiScale = usePanelContentScale();
  // Exact density: resampling a panel of sprites is well under a millisecond, so there is no
  // reason to cap it the way a full-screen backing buffer must be.
  const dpr = useDevicePixelRatio(Number.POSITIVE_INFINITY);
  // What was last painted, so a re-render that changes nothing repaints nothing. Cheaper than
  // asking every call site to memoize, and it keeps a panel that re-renders per tick free.
  const paintedRef = useRef<readonly LayerSprite[] | null>(null);
  const paintedSizeRef = useRef('');

  // Layout effect, so the sprites are on the canvas in the same frame the panel appears.
  useLayoutEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const deviceScale = uiScale * dpr;
    // Round (not ceil) so the canvas-to-device blit stays 1:1 and avoids a fractional
    // whole-canvas resample at fractional UI scales.
    const bufferW = Math.max(1, Math.round(width * deviceScale));
    const bufferH = Math.max(1, Math.round(height * deviceScale));

    const paint = (force: boolean) => {
      const size = `${bufferW}x${bufferH}`;
      if (!force && size === paintedSizeRef.current && sameSprites(paintedRef.current, sprites)) return;
      paintedRef.current = sprites;
      paintedSizeRef.current = size;
      if (canvas.width !== bufferW) canvas.width = bufferW;
      if (canvas.height !== bufferH) canvas.height = bufferH;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      ctx.clearRect(0, 0, bufferW, bufferH);
      // Every sprite arrives already resampled to its exact device box, so each draw is a
      // 1:1 blit onto integer coordinates and there is nothing for the browser to filter.
      ctx.imageSmoothingEnabled = false;

      let complete = true;
      for (const sprite of sprites) {
        const image = getSprite(sprite.src);
        if (image == null) {
          complete = false;
          continue;
        }
        const box = fitLayoutSize(image.naturalWidth, image.naturalHeight, {
          width: sprite.width,
          height: sprite.height,
          maxWidth: sprite.w,
          maxHeight: sprite.h,
        });
        const left = sprite.x + (sprite.w - box.width) / 2 + (sprite.offsetX ?? 0);
        const top = sprite.y + (sprite.h - box.height) / 2 + (sprite.offsetY ?? 0);
        // Snap both edges through the same rounding, so a sprite always lands on whole
        // device pixels — which is exactly the input the sharp-bilinear resample wants.
        const dx = Math.round(left * deviceScale);
        const dy = Math.round(top * deviceScale);
        const dw = Math.round((left + box.width) * deviceScale) - dx;
        const dh = Math.round((top + box.height) * deviceScale) - dy;
        if (dw <= 0 || dh <= 0) continue;

        ctx.globalAlpha = sprite.opacity ?? 1;
        ctx.drawImage(getResampled(sprite.src, image, dw, dh), dx, dy);
      }
      ctx.globalAlpha = 1;
      // A paint that skipped an undecoded sprite is not the final picture. Forget it, so the
      // next run repaints even when the sprite finished decoding between two runs, after the
      // previous run's arrival subscription was torn down and before this one's could be made.
      if (!complete) paintedRef.current = null;
    };

    paint(false);

    // Preloading normally means every sprite is already decoded and the layer is final after
    // one paint. Only an unwarmed sprite needs the repaint-on-arrival subscription, and it is
    // dropped as soon as the last one settles — otherwise a panel that opens cold repaints on
    // every unrelated image in the app for as long as it stays mounted.
    const pending = new Set<string>();
    for (const sprite of sprites) {
      if (getSprite(sprite.src) === undefined) {
        pending.add(sprite.src);
        void loadSprite(sprite.src);
      }
    }
    if (pending.size === 0) return;

    let unsubscribe: (() => void) | null = null;
    unsubscribe = subscribe(() => {
      for (const src of pending) {
        if (getSprite(src) !== undefined) pending.delete(src);
      }
      paint(true);
      if (pending.size === 0) unsubscribe?.();
    });
    return () => unsubscribe?.();
  }, [sprites, width, height, uiScale, dpr]);

  return (
    <canvas
      ref={canvasRef}
      // Dev-only: every sprite's placement, for tests and DevTools. The guard comes first so the bundler folds it out of a build.
      data-sprites={import.meta.env.DEV ? JSON.stringify(sprites) : undefined}
      style={{ position: 'absolute', left: 0, top: 0, width, height, pointerEvents: 'none', ...style }}
    />
  );
};
