import { describe, expect, it } from 'vitest';
import { REPLAY_CLICK_PIXEL_SCALE } from '../replayClickVisuals';
import { innerSpans, pixelDisc, pixelDiscSpans, TAP_PIXEL_EDGES_MIN_DEVICE_PX, tapEdgesFor } from '../replayTapDisc';

/** The disc as a set of pixels, by the rule it is defined by: center inside the circle. */
function bruteForceDisc(diameter: number): Set<string> {
  const radius = diameter / 2;
  const pixels = new Set<string>();
  for (let y = 0; y < diameter; y++) {
    for (let x = 0; x < diameter; x++) {
      if ((x + 0.5 - radius) ** 2 + (y + 0.5 - radius) ** 2 <= radius ** 2) pixels.add(`${x},${y}`);
    }
  }
  return pixels;
}

function spanPixels(spans: ReturnType<typeof pixelDiscSpans>): Set<string> {
  const pixels = new Set<string>();
  for (const { y, left, right } of spans) for (let x = left; x < right; x++) pixels.add(`${x},${y}`);
  return pixels;
}

describe('pixelDisc', () => {
  it.each([12, 14, 16, 18])('traces exactly the pixels of a %s-pixel disc, one run per row', (diameter) => {
    const spans = pixelDiscSpans(diameter);

    expect(spanPixels(spans)).toEqual(bruteForceDisc(diameter));
    expect(spans.map(({ y }) => y)).toEqual(Array.from({ length: diameter }, (_, y) => y));
    // Symmetric, so it centers on the click point.
    for (const { left, right } of spans) expect(left).toBe(diameter - right);
  });

  it.each([12, 14, 16, 18])('makes the rim of a %s-pixel disc its outermost pixels', (diameter) => {
    const disc = bruteForceDisc(diameter);
    const inner = [...disc].filter((pixel) => {
      const [x = 0, y = 0] = pixel.split(',').map(Number);
      return [`${x - 1},${y}`, `${x + 1},${y}`, `${x},${y - 1}`, `${x},${y + 1}`].every((n) => disc.has(n));
    });

    expect(spanPixels(innerSpans(pixelDiscSpans(diameter)))).toEqual(new Set(inner));
  });

  it('draws the disc as one outline and the rim as two, so nothing inside them can seam', () => {
    const { disc, rim } = pixelDisc(18);

    expect(disc.match(/M/g)).toHaveLength(1);
    expect(rim.match(/M/g)).toHaveLength(2);
    expect(rim.startsWith(disc)).toBe(true);
  });
});

describe('tapEdgesFor', () => {
  it.each([
    ['a desktop at 1x', 1, 1, 'smooth'],
    ['a 2x screen at full frame size', 2, 1, 'pixel'],
    ['a 2x screen with the frame fitted to 0.45', 2, 0.45, 'smooth'],
    ['a 3x phone at full frame size', 3, 1, 'pixel'],
    ['a 3x phone with the frame fitted to 0.45', 3, 0.45, 'pixel'],
  ] as const)('snaps steps only where they hold: %s', (_, dpr, frameScale, expected) => {
    expect(tapEdgesFor(REPLAY_CLICK_PIXEL_SCALE * frameScale * dpr)).toBe(expected);
  });

  it('switches at the threshold', () => {
    expect(tapEdgesFor(TAP_PIXEL_EDGES_MIN_DEVICE_PX)).toBe('pixel');
    expect(tapEdgesFor(TAP_PIXEL_EDGES_MIN_DEVICE_PX - 0.01)).toBe('smooth');
  });
});
