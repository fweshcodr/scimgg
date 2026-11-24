import type { Rect } from '../../layout/osrsClientLayout';

/**
 * `BarRenderer`'s half of RuneLite's Status Bars plugin. Every constant below
 * cites the field it is a port of, because they are all magic numbers upstream
 * too and a "tidier" round value silently stops matching the real client.
 * The BSD-2-Clause headers of BarRenderer.java and StatusBarsOverlay.java, read
 * at RuneLite ced4c4a, are reproduced in licenses.txt and listed in
 * THIRD_PARTY_NOTICES.md.
 */

/** `BarRenderer.BORDER_SIZE`. */
const BORDER = 1;

/** `skill_icons_small`, the size upstream's bar icons are drawn at. */
export const BAR_ICON_SIZE = 16;
/** `BarRenderer.renderIconsAndCounters` draws the icon this far below the bar's top. */
export const BAR_ICON_TOP_INSET = 4;

const rgba = (red: number, green: number, blue: number, alpha255: number): string =>
  `rgba(${red}, ${green}, ${blue}, ${alpha255 / 255})`;

/** `BarRenderer.BACKGROUND` plus the three `StatusBarsOverlay` colors the default bars use. */
export const STATUS_BAR_COLORS = {
  background: rgba(0, 0, 0, 150),
  hitpoints: rgba(225, 35, 0, 125),
  prayer: rgba(50, 200, 200, 175),
  prayerActive: rgba(57, 255, 186, 225),
} as const;

export function prayerBarColor(anyPrayerActive: boolean): string {
  return anyPrayerActive ? STATUS_BAR_COLORS.prayerActive : STATUS_BAR_COLORS.prayer;
}

/** `BarRenderer.getBarHeight`. Rounds rather than truncating, and saturates at the maximum. */
export function barFillHeight(max: number, current: number, height: number): number {
  if (max <= 0 || current <= 0) return 0;
  const ratio = current / max;
  return ratio >= 1 ? height : Math.round(ratio * height);
}

/**
 * The colored interior of a bar, inset by the border and pinned to the bottom.
 *
 * `null` where upstream's `filledHeight - BORDER_SIZE * 2` goes non-positive:
 * Java's `fillRect` draws nothing for a negative height, but a canvas normalizes
 * the rect and would paint a sliver growing UPWARD out of the bar.
 */
export function barFillRect(bar: Rect, max: number, current: number): Rect | null {
  const filled = barFillHeight(max, current, bar.height);
  const height = filled - BORDER * 2;
  if (height <= 0) return null;
  return {
    x: bar.x + BORDER,
    y: bar.y + BORDER + (bar.height - filled),
    width: bar.width - BORDER * 2,
    height,
  };
}

/**
 * A real `CanvasRenderingContext2D` satisfies this as written. Narrowing it to
 * the two members the fills use is what lets the paint be driven without a
 * canvas at all; replacing it with the context type forces every caller that
 * only wants the rects back through `getContext` and a type assertion.
 */
export interface BarFillTarget {
  fillStyle: CanvasRenderingContext2D['fillStyle'];
  fillRect: (x: number, y: number, width: number, height: number) => void;
}

export interface BarPaintSpec {
  readonly bar: Rect;
  /** The canvas' own box, which every rect is painted relative to — not the bar's. */
  readonly bounds: Rect;
  readonly deviceScale: number;
  readonly max: number;
  readonly current: number;
  readonly color: string;
}

export function paintBar(target: BarFillTarget, spec: BarPaintSpec): void {
  const { bar, bounds, deviceScale, max, current, color } = spec;
  // Both edges of every rect go through the same rounding, so abutting
  // pieces cannot round apart and leave a hairline between them.
  const fill = (rect: Rect, fillColor: string) => {
    const x = Math.round((rect.x - bounds.x) * deviceScale);
    const y = Math.round((rect.y - bounds.y) * deviceScale);
    const width = Math.round((rect.x - bounds.x + rect.width) * deviceScale) - x;
    const height = Math.round((rect.y - bounds.y + rect.height) * deviceScale) - y;
    target.fillStyle = fillColor;
    target.fillRect(x, y, width, height);
  };

  fill(bar, STATUS_BAR_COLORS.background);
  // Upstream strokes the same translucent black over the border ring it
  // has just filled, so those pixels carry the color twice. Dropping
  // the second pass loses the bar's outline entirely.
  fill({ ...bar, height: BORDER }, STATUS_BAR_COLORS.background);
  fill({ ...bar, y: bar.y + bar.height - BORDER, height: BORDER }, STATUS_BAR_COLORS.background);
  const sideY = bar.y + BORDER;
  const sideHeight = bar.height - BORDER * 2;
  fill({ x: bar.x, y: sideY, width: BORDER, height: sideHeight }, STATUS_BAR_COLORS.background);
  fill({ x: bar.x + bar.width - BORDER, y: sideY, width: BORDER, height: sideHeight }, STATUS_BAR_COLORS.background);

  const filled = barFillRect(bar, max, current);
  if (filled) fill(filled, color);
}

/**
 * The counter under a bar's icon.
 *
 * 16px is the only crisp size for this face — `unitsPerEm = 16`, so any other
 * size lands glyph edges mid-pixel (DESIGN.md, Pixel-font rules) — and the
 * offset black copy below is canvas' equivalent of the `text-shadow: 1px 1px 0
 * #000` every other RuneScape Small readout in this app carries.
 */
export const STATUS_BAR_VALUE = {
  fontPx: 16,
  fontFamily: '"RuneScape Small", sans-serif',
  color: '#ffffff',
  shadowColor: '#000000',
} as const;

const VALUE_TOP = BAR_ICON_TOP_INSET + BAR_ICON_SIZE;

/** The text half of `BarFillTarget`, narrowed for the same reason. */
export interface BarTextTarget {
  fillStyle: CanvasRenderingContext2D['fillStyle'];
  font: CanvasRenderingContext2D['font'];
  textAlign: CanvasRenderingContext2D['textAlign'];
  textBaseline: CanvasRenderingContext2D['textBaseline'];
  fillText: (text: string, x: number, y: number) => void;
}

export interface BarValuePaintSpec {
  readonly bar: Rect;
  readonly bounds: Rect;
  readonly deviceScale: number;
  readonly current: number;
}

export function paintBarValue(target: BarTextTarget, spec: BarValuePaintSpec): void {
  const { bar, bounds, deviceScale, current } = spec;
  // Rounded to whole device pixels: a pixel face drawn at a fractional size or
  // on a half-pixel row antialiases into mush at the fractional panel scales.
  const x = Math.round((bar.x + bar.width / 2 - bounds.x) * deviceScale);
  const y = Math.round((bar.y + VALUE_TOP - bounds.y) * deviceScale);
  const shadowOffset = Math.round(deviceScale);
  const text = String(current);

  target.font = `${Math.round(STATUS_BAR_VALUE.fontPx * deviceScale)}px ${STATUS_BAR_VALUE.fontFamily}`;
  target.textAlign = 'center';
  target.textBaseline = 'top';
  target.fillStyle = STATUS_BAR_VALUE.shadowColor;
  target.fillText(text, x + shadowOffset, y + shadowOffset);
  target.fillStyle = STATUS_BAR_VALUE.color;
  target.fillText(text, x, y);
}
