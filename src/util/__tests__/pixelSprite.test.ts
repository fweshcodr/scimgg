import { describe, expect, it } from 'vitest';
import {
  fitLayoutSize,
  resampleForDisplay,
  resampleRegionForDisplay,
  resampleSharp,
  sharpenPremultiplied,
} from '../pixelSprite';

describe('fitLayoutSize', () => {
  it('falls back to the intrinsic size when nothing constrains it', () => {
    expect(fitLayoutSize(27, 27)).toEqual({ width: 27, height: 27 });
  });

  it('uses both explicit axes verbatim', () => {
    expect(fitLayoutSize(27, 27, { width: 34, height: 34 })).toEqual({ width: 34, height: 34 });
  });

  it('derives the free axis from the aspect ratio', () => {
    expect(fitLayoutSize(36, 32, { width: 18 })).toEqual({ width: 18, height: 16 });
    expect(fitLayoutSize(36, 32, { height: 16 })).toEqual({ width: 18, height: 16 });
  });

  it('shrinks both axes together under max constraints (contain)', () => {
    // Equipment slots: a 36x32 item icon capped at 32x32 is width-limited.
    const box = fitLayoutSize(36, 32, { maxWidth: 32, maxHeight: 32 });
    expect(box.width).toBeCloseTo(32, 10);
    expect(box.height).toBeCloseTo(32 * (32 / 36), 10);
  });

  it('leaves a sprite alone when the max constraint is not binding', () => {
    // Inventory slots: ITEM_SIZE 36 caps a 36x32 icon at its intrinsic size.
    expect(fitLayoutSize(36, 32, { maxWidth: 36, maxHeight: 36 })).toEqual({ width: 36, height: 32 });
  });

  it('returns an empty box for an unloaded image instead of NaN', () => {
    expect(fitLayoutSize(0, 0, { width: 34 })).toEqual({ width: 0, height: 0 });
  });
});

describe('resampleSharp', () => {
  /** `w` x `h` of solid opaque white, with a one-pixel black column at `line`. */
  const columnSprite = (w: number, h: number, line: number) => {
    const data = new Uint8ClampedArray(w * h * 4);
    for (let i = 0; i < w * h; i++) {
      const o = i * 4;
      const dark = i % w === line;
      data[o] = dark ? 0 : 255;
      data[o + 1] = dark ? 0 : 255;
      data[o + 2] = dark ? 0 : 255;
      data[o + 3] = 255;
    }
    return data;
  };

  it('reproduces the source exactly at 1:1', () => {
    const src = columnSprite(6, 4, 2);
    expect([...resampleSharp(src, 6, 4, 6, 4)]).toEqual([...src]);
  });

  it('is plain nearest at 300 percent, with no blended pixel anywhere', () => {
    const out = resampleSharp(columnSprite(6, 4, 2), 6, 4, 18, 12);
    // A bilinear upscale would put a ramp either side of the column; the flat-box
    // reconstruction must not.
    for (let i = 0; i < 18 * 12; i++) {
      const v = out[i * 4];
      expect(v === 0 || v === 255).toBe(true);
    }
  });

  it('confines blending to a one-device-pixel ramp at a fractional scale', () => {
    const out = resampleSharp(columnSprite(6, 4, 2), 6, 4, 9, 6);
    const row: number[] = [];
    for (let x = 0; x < 9; x++) row.push(out[(2 * 9 + x) * 4]);
    // One dark core plus at most one partial pixel per side, never a 2-3px gradient.
    const partial = row.filter((v) => v > 0 && v < 255);
    expect(partial.length).toBeLessThanOrEqual(2);
    expect(Math.min(...row)).toBeLessThan(128);
  });

  it('keeps a transparent sprite transparent instead of inventing color', () => {
    const src = new Uint8ClampedArray(6 * 4 * 4);
    for (let i = 0; i < 6 * 4; i++) src[i * 4] = 255;
    const out = resampleSharp(src, 6, 4, 9, 6);
    for (let i = 0; i < 9 * 6; i++) {
      expect(out[i * 4 + 3]).toBe(0);
      expect(out[i * 4]).toBe(0);
    }
  });

  it('returns an empty buffer for a degenerate source rather than throwing', () => {
    expect(resampleSharp(new Uint8ClampedArray(0), 0, 0, 4, 4)).toHaveLength(4 * 4 * 4);
  });
});

describe('edge ramp width', () => {
  const line = (w: number, h: number, at: number) => {
    const data = new Uint8ClampedArray(w * h * 4);
    for (let i = 0; i < w * h; i++) {
      const o = i * 4;
      const on = i % w === at;
      data[o] = on ? 255 : 0;
      data[o + 1] = on ? 255 : 0;
      data[o + 2] = on ? 255 : 0;
      data[o + 3] = 255;
    }
    return data;
  };

  // The band is a ceiling, not a width: `resampleSharp` narrows it further below device scale 2.22
  // so it never covers more than a fraction of a source pixel. Passing a value above that ceiling
  // therefore changes nothing, which is why this compares two values under it.
  it('narrowing the ramp reduces how many pixels a 1px line bleeds into', () => {
    const src = line(12, 4, 5);
    const wide = resampleSharp(src, 12, 4, 20, 7, 0.7);
    const narrow = resampleSharp(src, 12, 4, 20, 7, 0.3);
    const partials = (px: Uint8ClampedArray) => {
      let n = 0;
      for (let x = 0; x < 20; x++) {
        const v = px[(2 * 20 + x) * 4];
        if (v > 0 && v < 255) n++;
      }
      return n;
    };
    expect(partials(narrow)).toBeLessThan(partials(wide));
  });

  /**
   * A field of 1px lines at one device scale, scored as the mean peak each line reaches
   * (1 = its own source color) and how many output pixels per line stay partly blended.
   */
  const measureLines = (numerator: number, denominator: number) => {
    const pitch = 7; // coprime with the ladder's sixths, so all phases are sampled
    const repeats = 24;
    const w = pitch * repeats;
    const h = 5;
    const src = new Uint8ClampedArray(w * h * 4);
    for (let i = 0; i < w * h; i++) {
      const o = i * 4;
      const on = (i % w) % pitch === 0;
      src[o] = on ? 255 : 0;
      src[o + 1] = src[o];
      src[o + 2] = src[o];
      src[o + 3] = 255;
    }
    const scale = numerator / denominator;
    const outW = (w * numerator) / denominator;
    const px = resampleForDisplay(src, w, h, outW, h);
    let total = 0;
    for (let k = 1; k < repeats - 1; k++) {
      const centre = (k * pitch + 0.5) * scale;
      let peak = 0;
      for (let x = Math.floor(centre - (pitch * scale) / 2); x < Math.ceil(centre + (pitch * scale) / 2); x++) {
        peak = Math.max(peak, px[(2 * outW + x) * 4]);
      }
      total += peak / 255;
    }
    let partials = 0;
    for (let x = 1; x < outW - 1; x++) {
      const v = px[(2 * outW + x) * 4];
      if (v > 0 && v < 255) partials++;
    }
    return { meanPeak: total / (repeats - 2), partialsPerLine: partials / repeats };
  };

  // Near the bottom of the ladder, cap the ramp by source-pixel width to avoid smearing most of a source pixel.
  // Reverting to a device-only ramp fails here and nowhere else.
  it.each([
    [7, 6],
    [4, 3],
  ])('renders a 1px line at nearly full contrast at device scale %i/%i', (numerator, denominator) => {
    expect(measureLines(numerator, denominator).meanPeak).toBeGreaterThan(0.94);
  });

  // The other half of the same tradeoff: narrowing the band all the way to nearest would peak at
  // 1.00 and bring back the uneven 2px/3px outline the whole ladder exists to avoid.
  it('still blends across source-pixel boundaries at the bottom of the ladder', () => {
    expect(measureLines(7, 6).partialsPerLine).toBeGreaterThan(0.5);
    expect(measureLines(4, 3).partialsPerLine).toBeGreaterThan(0.5);
  });
});

describe('sharpenPremultiplied', () => {
  const fill = (width: number, height: number, rgba: readonly [number, number, number, number]) => {
    const data = new Uint8ClampedArray(width * height * 4);
    for (let i = 0; i < width * height; i++) data.set(rgba, i * 4);
    return data;
  };

  it('leaves the image untouched at zero amount', () => {
    const data = fill(4, 4, [10, 20, 30, 255]);
    const before = data.slice();
    sharpenPremultiplied(data, 4, 4, 0);
    expect([...data]).toEqual([...before]);
  });

  it('steepens a soft edge on both sides of it', () => {
    const ramp = [40, 60, 128, 196, 216];
    const data = fill(5, 5, [0, 0, 0, 255]);
    for (let y = 0; y < 5; y++) {
      for (let x = 0; x < 5; x++) {
        const o = (y * 5 + x) * 4;
        data[o] = ramp[x];
        data[o + 1] = ramp[x];
        data[o + 2] = ramp[x];
      }
    }
    sharpenPremultiplied(data, 5, 5, 0.8);
    const mid = 2 * 5 * 4;
    expect(data[mid + 1 * 4]).toBeLessThan(60);
    expect(data[mid + 3 * 4]).toBeGreaterThan(196);
  });

  it('does not pull the color of a fully transparent neighbor into the sprite', () => {
    // A PNG encoder is free to leave any RGB under alpha 0; straight-alpha filtering would smear
    // that here into a colored fringe, which is why the filter is premultiplied.
    const data = fill(3, 3, [255, 0, 0, 0]);
    data.set([0, 0, 0, 255], 4 * 4);
    sharpenPremultiplied(data, 3, 3, 0.8);
    expect(data[4 * 4]).toBe(0);
    expect(data[3]).toBe(0);
  });

  it('produces these exact bytes on a known square', () => {
    const data = fill(4, 4, [40, 40, 40, 255]);
    for (const i of [5, 6, 9, 10]) data.set([220, 220, 220, 255], i * 4);

    sharpenPremultiplied(data, 4, 4, 0.4);

    // The vertical half of the blur is folded into the combine, and these bytes are unchanged by it.
    // Only exact equality catches a precision change there — the blur reaches the combine as a
    // float32, and reading it at double precision shifts a scatter of pixels by one.
    const red = Array.from({ length: 4 }, (_, y) => Array.from({ length: 4 }, (_, x) => data[(y * 4 + x) * 4]));
    expect(red).toEqual([
      [36, 26, 26, 36],
      [26, 252, 252, 26],
      [26, 252, 252, 26],
      [36, 26, 26, 36],
    ]);
  });
});

describe('resampleForDisplay', () => {
  /** A dark 1px border around a flat fill — the OSRS chrome case the mask can halo. */
  const outlined = (w: number, h: number) => {
    const data = new Uint8ClampedArray(w * h * 4);
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const o = (y * w + x) * 4;
        const v = x === 0 || y === 0 || x === w - 1 || y === h - 1 ? 0 : 200;
        data.set([v, v, v, 255], o);
      }
    }
    return data;
  };

  it.each([1, 2, 3])('leaves an unscaled or %ix sprite exactly as the client drew it', (scale) => {
    const src = outlined(8, 8);
    const out = resampleForDisplay(src, 8, 8, 8 * scale, 8 * scale);
    expect([...out]).toEqual([...resampleSharp(src, 8, 8, 8 * scale, 8 * scale)]);
  });

  it('sharpens at a fractional scale, where the reconstruction blends', () => {
    const src = outlined(8, 8);
    const out = resampleForDisplay(src, 8, 8, 12, 12);
    expect([...out]).not.toEqual([...resampleSharp(src, 8, 8, 12, 12)]);
  });

  it('sharpens when only one axis lands on a whole multiple', () => {
    const src = outlined(8, 8);
    const out = resampleForDisplay(src, 8, 8, 16, 12);
    expect([...out]).not.toEqual([...resampleSharp(src, 8, 8, 16, 12)]);
  });

  it('returns an empty buffer for a degenerate source rather than throwing', () => {
    expect(resampleForDisplay(new Uint8ClampedArray(0), 0, 0, 4, 4)).toHaveLength(4 * 4 * 4);
  });

  const bandedSource = (width: number, height: number, valueAt: (x: number, y: number) => number) => {
    const data = new Uint8ClampedArray(width * height * 4);
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) data.set([valueAt(x, y), 0, 0, 255], (y * width + x) * 4);
    }
    return { data, width, height };
  };

  it('keeps the final source column and both edge neighbors at effective scale 1.25', () => {
    const source = bandedSource(26, 3, (x) => (x < 5 ? 0 : x < 21 ? 100 : 200));
    const out = resampleRegionForDisplay(source, { x: 5, y: 0, width: 16, height: 3 }, { width: 20, height: 3 });

    expect([out[0], out[10 * 4], out[19 * 4]]).toEqual([110, 100, 90]);
  });

  it('keeps the final source row and both edge neighbors at effective scale 4/3', () => {
    const source = bandedSource(3, 26, (_x, y) => (y < 5 ? 0 : y < 21 ? 100 : 200));
    const out = resampleRegionForDisplay(source, { x: 0, y: 5, width: 3, height: 16 }, { width: 3, height: 21 });

    expect([out[0], out[10 * 3 * 4], out[20 * 3 * 4]]).toEqual([110, 100, 90]);
  });

  it('keeps region pixels exact at an integer scale', () => {
    const source = bandedSource(5, 1, (x) => x * 50);
    const out = resampleRegionForDisplay(source, { x: 1, y: 0, width: 3, height: 1 }, { width: 6, height: 2 });
    expect(Array.from({ length: 6 }, (_, x) => out[x * 4])).toEqual([50, 50, 100, 100, 150, 150]);
  });
});
