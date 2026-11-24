/**
 * Fractional `uiScale * devicePixelRatio` makes nearest-neighbor outlines uneven
 * and bilinear filtering blurry. `resampleSharp` blends only source-pixel edges,
 * within one device pixel and 0.45 source pixels.
 */

import type { LayoutSize } from './pixelSpriteLayout';

export interface PixelRaster {
  readonly data: Uint8ClampedArray;
  readonly width: number;
  readonly height: number;
}

export interface SpriteSourceRect {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

export type { LayoutConstraints, LayoutSize } from './pixelSpriteLayout';
export { fitLayoutSize } from './pixelSpriteLayout';

export type SpriteSource = HTMLImageElement | HTMLCanvasElement | ImageBitmap;

/**
 * Use premultiplied color so transparent-neighbor RGB cannot form a fringe.
 * Fold the vertical blur into the final combine to avoid a third full-frame buffer.
 * `Math.fround` preserves Float32 precision; double precision changes output pixels.
 */
export function sharpenPremultiplied(data: Uint8ClampedArray, width: number, height: number, amount: number): void {
  if (amount <= 0 || width < 3 || height < 3) return;
  const count = width * height;
  const premultiplied = new Float32Array(count * 4);
  for (let i = 0; i < count; i++) {
    const o = i * 4;
    const alpha = data[o + 3];
    const scale = alpha / 255;
    premultiplied[o] = data[o] * scale;
    premultiplied[o + 1] = data[o + 1] * scale;
    premultiplied[o + 2] = data[o + 2] * scale;
    premultiplied[o + 3] = alpha;
  }

  const rows = new Float32Array(count * 4);
  for (let y = 0; y < height; y++) {
    const base = y * width;
    for (let x = 0; x < width; x++) {
      const o = (base + x) * 4;
      const left = (base + (x > 0 ? x - 1 : 0)) * 4;
      const right = (base + (x < width - 1 ? x + 1 : width - 1)) * 4;
      for (let c = 0; c < 4; c++) {
        rows[o + c] = (premultiplied[left + c] + 2 * premultiplied[o + c] + premultiplied[right + c]) * 0.25;
      }
    }
  }

  const fround = Math.fround;
  for (let y = 0; y < height; y++) {
    const up = (y > 0 ? y - 1 : 0) * width * 4;
    const mid = y * width * 4;
    const down = (y < height - 1 ? y + 1 : height - 1) * width * 4;
    for (let x = 0; x < width; x++) {
      const xo = x * 4;
      const o = mid + xo;
      const ownAlpha = premultiplied[o + 3];
      const blurAlpha = fround((rows[up + xo + 3] + 2 * rows[mid + xo + 3] + rows[down + xo + 3]) * 0.25);
      const alpha = Math.min(255, Math.max(0, ownAlpha + amount * (ownAlpha - blurAlpha)));
      if (alpha <= 0) {
        data[o] = 0;
        data[o + 1] = 0;
        data[o + 2] = 0;
        data[o + 3] = 0;
        continue;
      }
      for (let c = 0; c < 3; c++) {
        const blur = fround((rows[up + xo + c] + 2 * rows[mid + xo + c] + rows[down + xo + c]) * 0.25);
        const own = premultiplied[o + c];
        // Premultiplied color can never exceed its own alpha; clamping there instead of at 255
        // is what keeps an overshoot from unpremultiplying to a blown-out channel.
        const value = Math.min(alpha, Math.max(0, own + amount * (own - blur)));
        data[o + c] = (value * 255) / alpha;
      }
      data[o + 3] = alpha;
    }
  }
}

/**
 * Both ramp ceilings are load-bearing: the source-pixel cap prevents low-scale
 * sprites from being mostly blurred. Do not raise `SHARPEN_AMOUNT`; it adds
 * ringing without visible sharpness. Narrow a ramp ceiling instead.
 *
 * Device scale 3/2 does not move at ANY ramp — every third output pixel lands exactly on a
 * source-pixel boundary, so it is a 50/50 blend however narrow the band is. Tuning the ramp at
 * 1.5 and concluding it is dead is wrong.
 */
const EDGE_RAMP_DEVICE_PX = 1;
const EDGE_RAMP_SOURCE_PX = 0.45;
const SHARPEN_AMOUNT = 0.4;

interface AxisBlend {
  readonly idx0: Int32Array;
  readonly idx1: Int32Array;
  readonly frac: Float32Array;
}

interface AxisWindow {
  readonly sourceLength: number;
  readonly start: number;
  readonly length: number;
  readonly outputLength: number;
}

function axisBlend(window: AxisWindow, maxRampDevicePx: number): AxisBlend {
  const scale = window.outputLength / window.length;
  const ramp = scale / Math.min(maxRampDevicePx, EDGE_RAMP_SOURCE_PX * scale);
  const idx0 = new Int32Array(window.outputLength);
  const idx1 = new Int32Array(window.outputLength);
  const frac = new Float32Array(window.outputLength);
  for (let o = 0; o < window.outputLength; o++) {
    const texel = window.start + (o + 0.5) / scale;
    const base = Math.floor(texel - 0.5);
    const between = texel - 0.5 - base;
    const f = (between - 0.5) * ramp + 0.5;
    idx0[o] = Math.min(window.sourceLength - 1, Math.max(0, base));
    idx1[o] = Math.min(window.sourceLength - 1, Math.max(0, base + 1));
    frac[o] = f < 0 ? 0 : f > 1 ? 1 : f;
  }
  return { idx0, idx1, frac };
}

// Scratch for the separable pass. One sprite is resampled at a time and the result is copied
// out before the next call, so a single growable buffer serves every sprite in the app.
let scratch = new Float32Array(0);

/**
 * Filtering runs in JS rather than through `drawImage` + `imageSmoothingQuality: 'high'` because
 * that path cannot be read back cheaply: Skia downscales lazily on the GPU, so the `getImageData`
 * needed to post-process it forces a synchronous flush — 5.2ms per sprite against 0.77ms here,
 * and a panel repaints 20-70 sprites per Alt+scroll step.
 */
interface SharpWindow {
  readonly source: PixelRaster;
  readonly sourceRect: SpriteSourceRect;
  readonly target: LayoutSize;
  readonly maxRampDevicePx: number;
}

function resampleSharpWindow(window: SharpWindow): Uint8ClampedArray<ArrayBuffer> {
  const { source, sourceRect, target, maxRampDevicePx } = window;
  const outW = Math.max(1, Math.round(target.width));
  const outH = Math.max(1, Math.round(target.height));
  const out = new Uint8ClampedArray(outW * outH * 4);
  if (source.width <= 0 || source.height <= 0) return out;

  const x = axisBlend(
    { sourceLength: source.width, start: sourceRect.x, length: sourceRect.width, outputLength: outW },
    maxRampDevicePx,
  );
  const y = axisBlend(
    { sourceLength: source.height, start: sourceRect.y, length: sourceRect.height, outputLength: outH },
    maxRampDevicePx,
  );

  // Premultiplied throughout: blending straight alpha drags whatever RGB the encoder left
  // under a fully transparent pixel into the sprite as a fringe.
  const needed = source.width * source.height * 4 + source.height * outW * 4;
  if (scratch.length < needed) scratch = new Float32Array(needed);
  const premultiplied = scratch;
  const rowsOffset = source.width * source.height * 4;

  for (let i = 0; i < source.width * source.height; i++) {
    const o = i * 4;
    const alpha = source.data[o + 3];
    const a = alpha / 255;
    premultiplied[o] = source.data[o] * a;
    premultiplied[o + 1] = source.data[o + 1] * a;
    premultiplied[o + 2] = source.data[o + 2] * a;
    premultiplied[o + 3] = alpha;
  }

  for (let row = 0; row < source.height; row++) {
    const inRow = row * source.width * 4;
    const outRow = rowsOffset + row * outW * 4;
    for (let o = 0; o < outW; o++) {
      const a = inRow + x.idx0[o] * 4;
      const b = inRow + x.idx1[o] * 4;
      const f = x.frac[o];
      const g = 1 - f;
      const d = outRow + o * 4;
      premultiplied[d] = premultiplied[a] * g + premultiplied[b] * f;
      premultiplied[d + 1] = premultiplied[a + 1] * g + premultiplied[b + 1] * f;
      premultiplied[d + 2] = premultiplied[a + 2] * g + premultiplied[b + 2] * f;
      premultiplied[d + 3] = premultiplied[a + 3] * g + premultiplied[b + 3] * f;
    }
  }

  for (let row = 0; row < outH; row++) {
    const a0 = rowsOffset + y.idx0[row] * outW * 4;
    const a1 = rowsOffset + y.idx1[row] * outW * 4;
    const f = y.frac[row];
    const g = 1 - f;
    for (let o = 0; o < outW; o++) {
      const a = a0 + o * 4;
      const b = a1 + o * 4;
      const d = (row * outW + o) * 4;
      const alpha = premultiplied[a + 3] * g + premultiplied[b + 3] * f;
      out[d + 3] = alpha;
      if (alpha <= 0) continue;
      const inv = 255 / alpha;
      out[d] = (premultiplied[a] * g + premultiplied[b] * f) * inv;
      out[d + 1] = (premultiplied[a + 1] * g + premultiplied[b + 1] * f) * inv;
      out[d + 2] = (premultiplied[a + 2] * g + premultiplied[b + 2] * f) * inv;
    }
  }
  return out;
}

export function resampleSharp(
  source: Uint8ClampedArray,
  sourceW: number,
  sourceH: number,
  targetW: number,
  targetH: number,
  maxRampDevicePx: number = EDGE_RAMP_DEVICE_PX,
  // Pinned to a plain ArrayBuffer so the result can go straight into an `ImageData`.
): Uint8ClampedArray<ArrayBuffer> {
  return resampleSharpWindow({
    source: { data: source, width: sourceW, height: sourceH },
    sourceRect: { x: 0, y: 0, width: sourceW, height: sourceH },
    target: { width: targetW, height: targetH },
    maxRampDevicePx,
  });
}

/**
 * The mask is skipped when BOTH axes land on a whole multiple of the source, because the
 * reconstruction is plain nearest there and there is no blur to put back. Sharpening anyway
 * lifts the pixel beside every outline — measurably, 200 -> 220 on a flat fill — so an
 * unscaled sprite would stop matching the client's own art.
 */
export function resampleForDisplay(
  source: Uint8ClampedArray,
  sourceW: number,
  sourceH: number,
  targetW: number,
  targetH: number,
): Uint8ClampedArray<ArrayBuffer> {
  const outW = Math.max(1, Math.round(targetW));
  const outH = Math.max(1, Math.round(targetH));
  const pixels = resampleSharp(source, sourceW, sourceH, outW, outH);
  const nearest = sourceW > 0 && sourceH > 0 && outW % sourceW === 0 && outH % sourceH === 0;
  if (!nearest) sharpenPremultiplied(pixels, outW, outH, SHARPEN_AMOUNT);
  return pixels;
}

export function resampleRegionForDisplay(
  source: PixelRaster,
  sourceRect: SpriteSourceRect,
  target: LayoutSize,
): Uint8ClampedArray<ArrayBuffer> {
  const outW = Math.max(1, Math.round(target.width));
  const outH = Math.max(1, Math.round(target.height));
  const nearest =
    Number.isInteger(sourceRect.x) &&
    Number.isInteger(sourceRect.y) &&
    Number.isInteger(sourceRect.width) &&
    Number.isInteger(sourceRect.height) &&
    outW % sourceRect.width === 0 &&
    outH % sourceRect.height === 0;
  if (nearest) {
    return resampleSharpWindow({
      source,
      sourceRect,
      target: { width: outW, height: outH },
      maxRampDevicePx: EDGE_RAMP_DEVICE_PX,
    });
  }

  // The unsharp kernel needs one reconstructed device pixel beyond each requested edge;
  // clamping that halo to `sourceRect` changes the first and last output pixels.
  const sourcePixelsPerX = sourceRect.width / outW;
  const sourcePixelsPerY = sourceRect.height / outH;
  const paddedW = outW + 2;
  const paddedH = outH + 2;
  const padded = resampleSharpWindow({
    source,
    sourceRect: {
      x: sourceRect.x - sourcePixelsPerX,
      y: sourceRect.y - sourcePixelsPerY,
      width: sourceRect.width + sourcePixelsPerX * 2,
      height: sourceRect.height + sourcePixelsPerY * 2,
    },
    target: { width: paddedW, height: paddedH },
    maxRampDevicePx: EDGE_RAMP_DEVICE_PX,
  });
  sharpenPremultiplied(padded, paddedW, paddedH, SHARPEN_AMOUNT);

  const out = new Uint8ClampedArray(outW * outH * 4);
  for (let y = 0; y < outH; y++) {
    const sourceOffset = ((y + 1) * paddedW + 1) * 4;
    out.set(padded.subarray(sourceOffset, sourceOffset + outW * 4), y * outW * 4);
  }
  return out;
}
