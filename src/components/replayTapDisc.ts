/**
 * Geometry for the touch tap cue's pixel-art disc, in art pixels (one unit per pixel of the
 * X sprite).
 *
 * Each shape is ONE traced outline, not a square per pixel, so nothing inside it can seam or
 * snap apart. The disc is shown inside a frame fitted to the viewer's screen, so how many
 * device pixels an art pixel covers varies widely; `tapEdgesFor` picks how that outline is
 * rasterized for the density it actually lands at.
 */

/**
 * How the disc's stepped edge is rasterized. `pixel` snaps it to device pixels, matching the
 * X sprite's own nearest-neighbor look; `smooth` antialiases it.
 */
export type TapEdges = 'pixel' | 'smooth';

/**
 * Snapping holds up while an art pixel spans at least 1.5 device pixels: each step then snaps
 * to 1-2 or more device pixels, and the one-pixel rim never rounds away. Below that, steps
 * alternate between one device pixel and none, so the silhouette goes lumpy and the rim breaks
 * up; antialiased, the same outline reads as an even, round pad instead.
 */
export const TAP_PIXEL_EDGES_MIN_DEVICE_PX = 1.5;

/** `devicePxPerArtPx`: device pixels one art pixel covers on screen (CSS size x frame scale x DPR). */
export function tapEdgesFor(devicePxPerArtPx: number): TapEdges {
  return devicePxPerArtPx >= TAP_PIXEL_EDGES_MIN_DEVICE_PX ? 'pixel' : 'smooth';
}

export interface PixelDiscPaths {
  readonly diameter: number;
  /** The whole disc's stepped outline. */
  readonly disc: string;
  /** The disc's outermost pixels: the outline plus the fill's outline, for `fill-rule: evenodd`. */
  readonly rim: string;
}

/** Inclusive-exclusive pixel columns `[left, right)` of each row that has pixels, top to bottom. */
export type PixelRowSpan = { readonly y: number; readonly left: number; readonly right: number };

export function pixelDisc(diameter: number): PixelDiscPaths {
  const discSpans = pixelDiscSpans(diameter);
  return {
    diameter,
    disc: outlinePath(discSpans),
    rim: `${outlinePath(discSpans)}${outlinePath(innerSpans(discSpans))}`,
  };
}

/** The pixels whose centers fall inside the circle that fills a `diameter`-pixel square. */
export function pixelDiscSpans(diameter: number): readonly PixelRowSpan[] {
  const radius = diameter / 2;
  const spans: PixelRowSpan[] = [];
  for (let y = 0; y < diameter; y++) {
    const dy = y + 0.5 - radius;
    const halfWidth = Math.sqrt(Math.max(0, radius ** 2 - dy ** 2));
    // Pixel x is inside when |x + 0.5 - radius| <= halfWidth.
    const left = Math.max(0, Math.ceil(radius - halfWidth - 0.5));
    const right = Math.min(diameter, Math.floor(radius + halfWidth - 0.5) + 1);
    if (right > left) spans.push({ y, left, right });
  }
  return spans;
}

/** The disc less its outermost pixels: those with all four neighbors inside it. */
export function innerSpans(spans: readonly PixelRowSpan[]): readonly PixelRowSpan[] {
  const byRow = new Map(spans.map((span) => [span.y, span]));
  const inner: PixelRowSpan[] = [];
  for (const span of spans) {
    const above = byRow.get(span.y - 1);
    const below = byRow.get(span.y + 1);
    if (!above || !below) continue;
    const left = Math.max(span.left + 1, above.left, below.left);
    const right = Math.min(span.right - 1, above.right, below.right);
    if (right > left) inner.push({ y: span.y, left, right });
  }
  return inner;
}

/**
 * One closed outline around contiguous rows that each hold one run of pixels: down the right
 * edge, then back up the left.
 */
function outlinePath(spans: readonly PixelRowSpan[]): string {
  if (spans.length === 0) return '';
  const points: string[] = [];
  for (const { y, right } of spans) points.push(`${right} ${y}`, `${right} ${y + 1}`);
  for (const { y, left } of [...spans].reverse()) points.push(`${left} ${y + 1}`, `${left} ${y}`);
  return `M${points.join('L')}Z`;
}
