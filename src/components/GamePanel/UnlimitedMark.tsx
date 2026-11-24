import type React from 'react';
import { useCallback, useEffect, useLayoutEffect, useRef } from 'react';
import { useDevicePixelRatio } from '../../hooks/useDevicePixelRatio';
import { resampleForDisplay } from '../../util/pixelSprite';
import { usePanelContentScaleOrNull } from '../panelContentScale';

/**
 * The ∞ for a stack that never depletes (ammunition, runes, thrown weapons), drawn in the
 * corner where the game prints a stack count — the sim has no count to print.
 *
 * No RuneScape face carries U+221E, so the mark is authored the way `RuneScape Small` draws
 * its own glyphs: one-pixel strokes, cut corners, and single-pixel diagonals of the kind its
 * `x` uses. Five rows is that face's x-height and nine columns is under two digits of its
 * advance, so the mark sits in a count's place without taking a count's width.
 */
const GLYPH = ['.##...##.', '#..#.#..#', '#...#...#', '#..#.#..#', '.##...##.'] as const;
const GLYPH_W = GLYPH[0].length;
const GLYPH_H = GLYPH.length;

/**
 * The client prints a count with the small face's ink one pixel in from the item box's
 * top-left corner and a hard black copy one pixel below and right of it. The mark's box is
 * that ink box, so a call site positions it at the corner the count would start from.
 */
const INK_INSET = 1;
const SHADOW_OFFSET = 1;
const MARK_W = INK_INSET + GLYPH_W + SHADOW_OFFSET;
const MARK_H = INK_INSET + GLYPH_H + SHADOW_OFFSET;

/** The color the client prints a stack count in below 100k, and what every Scim count uses. */
const STACK_COUNT_RGB = [0xff, 0xff, 0x00] as const;
const SHADOW_RGB = [0x00, 0x00, 0x00] as const;

/** The mark at 1:1, shadow first so the ink overwrites it where the two overlap. */
function buildSourcePixels(): Uint8ClampedArray<ArrayBuffer> {
  const pixels = new Uint8ClampedArray(MARK_W * MARK_H * 4);
  const paint = (offset: number, [r, g, b]: readonly [number, number, number]): void => {
    GLYPH.forEach((row, y) => {
      for (let x = 0; x < row.length; x++) {
        if (row[x] !== '#') continue;
        const i = ((INK_INSET + y + offset) * MARK_W + INK_INSET + x + offset) * 4;
        pixels[i] = r;
        pixels[i + 1] = g;
        pixels[i + 2] = b;
        pixels[i + 3] = 0xff;
      }
    });
  };
  paint(SHADOW_OFFSET, SHADOW_RGB);
  paint(0, STACK_COUNT_RGB);
  return pixels;
}

const SOURCE_PIXELS = buildSourcePixels();

/**
 * One cached reconstruction, which is all the panel ever needs: every mark on screen shares
 * the one device box, and a scale change retargets all of them at once.
 */
let cached: { readonly key: string; readonly pixels: Uint8ClampedArray<ArrayBuffer> } | null = null;

function markPixels(deviceW: number, deviceH: number): Uint8ClampedArray<ArrayBuffer> {
  const key = `${deviceW}x${deviceH}`;
  if (cached?.key !== key) {
    cached = { key, pixels: resampleForDisplay(SOURCE_PIXELS, MARK_W, MARK_H, deviceW, deviceH) };
  }
  return cached.pixels;
}

/**
 * The mark inside the game panel, which a `DraggablePanel` zooms by a factor that is rarely a
 * whole number. A one-pixel stroke scaled there by the browser lands two device pixels on one
 * edge and one on the other, so the mark is reconstructed onto the exact device box the same
 * way the item sprite under it is (see `PixelSprite`), and the two stay in character.
 *
 * The caller's slot must be the positioned box it sits in.
 */
export const UnlimitedMark: React.FC<{ top: number; left: number }> = ({ top, left }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  // The APPLIED panel zoom, not the global UI scale: a pinned panel covers a snapped
  // frame-space box, and a raster built at the raw scale is resampled by the difference.
  const uiScale = usePanelContentScaleOrNull() ?? 1;
  // Exact density: the mark is one small reconstruction, so there is no buffer to cap.
  const dpr = useDevicePixelRatio(Number.POSITIVE_INFINITY);
  const deviceW = Math.max(1, Math.round(MARK_W * uiScale * dpr));
  const deviceH = Math.max(1, Math.round(MARK_H * uiScale * dpr));

  const paint = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    if (canvas.width !== deviceW) canvas.width = deviceW;
    if (canvas.height !== deviceH) canvas.height = deviceH;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.clearRect(0, 0, deviceW, deviceH);
    ctx.putImageData(new ImageData(markPixels(deviceW, deviceH), deviceW, deviceH), 0, 0);
  }, [deviceW, deviceH]);

  // Layout effect, so the mark is on the canvas in the frame the element appears.
  useLayoutEffect(paint, [paint]);

  // A 2D context can be lost under GPU pressure or a driver reset, which empties the canvas.
  // Nothing else brings the mark back: `paint`'s inputs are unchanged by a context loss.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const onRestored = () => paint();
    canvas.addEventListener('contextrestored', onRestored);
    return () => canvas.removeEventListener('contextrestored', onRestored);
  }, [paint]);

  return (
    <canvas
      ref={canvasRef}
      role="img"
      aria-label="Unlimited"
      style={{
        position: 'absolute',
        top,
        left,
        width: MARK_W,
        height: MARK_H,
        zIndex: 2,
        pointerEvents: 'none',
      }}
    />
  );
};

/** Horizontal runs of ink, so the SVG carries one rect per stroke rather than one per pixel. */
const GLYPH_RUNS: readonly { readonly x: number; readonly y: number; readonly width: number }[] = GLYPH.flatMap(
  (row, y) => {
    const runs: { x: number; y: number; width: number }[] = [];
    for (let x = 0; x < row.length; x++) {
      if (row[x] !== '#') continue;
      const start = x;
      while (row[x + 1] === '#') x++;
      runs.push({ x: start, y, width: x - start + 1 });
    }
    return runs;
  },
);

/**
 * The same mark in the loadout editor, which stands it alone in an empty ammunition cell
 * rather than over a count. That surface is not zoomed, so whole-pixel SVG keeps the strokes
 * exact without a canvas, and the color stays with the cell's own CSS through `currentColor`
 * — the editor deliberately keeps the mark quiet where the panel's is a game-colored count.
 * Doubled, because here it stands in for a 32px sprite instead of sitting beside one.
 */
export const UnlimitedSlotMark: React.FC<{ className?: string }> = ({ className }) => (
  <svg
    className={className}
    role="img"
    aria-label="Unlimited"
    width={GLYPH_W * 2}
    height={GLYPH_H * 2}
    viewBox={`0 0 ${GLYPH_W} ${GLYPH_H}`}
    shapeRendering="crispEdges"
    fill="currentColor"
  >
    {GLYPH_RUNS.map((run) => (
      <rect key={`${run.x}-${run.y}`} x={run.x} y={run.y} width={run.width} height={1} />
    ))}
  </svg>
);
