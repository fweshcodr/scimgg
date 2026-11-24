import { THEME } from '../theme';

/**
 * Per-tick color choices, keyed by the tick's position in the cycle as a
 * string ('1'…'max'). Sparse on purpose: an absent key means "still the
 * gradient", so shortening or lengthening the cycle re-grades every tick the
 * player never touched instead of stranding colors picked for another length.
 */
export type TickColorOverrides = Readonly<Record<string, string>>;

/**
 * Bounds for the tick counter's numeric settings. The panel inputs, the stored
 * blob's normalizer, and {@link tickCycle} all read them from here: the stored
 * values are hand-editable, so an input that merely *offers* 2..20 does not
 * constrain what reaches the array allocation below.
 */
export const TICK_CYCLE_MIN = 2;
export const TICK_CYCLE_MAX = 20;
export const TICK_FONT_SIZE_MIN = 8;
export const TICK_FONT_SIZE_MAX = 72;
/** Screen pixels, not tiles or world units, on each axis. */
export const TICK_OFFSET_LIMIT = 200;

export function resolveTickColor(current: number, max: number, overrides?: TickColorOverrides): string {
  return overrides?.[String(current)] ?? getTickColor(current, max);
}

export function tickCycle(max: number): number[] {
  // Clamped, not just floored: `Array.from({length: Infinity})` is a RangeError
  // and a large finite length exhausts memory, both reachable from the stored blob.
  const length = Number.isFinite(max) ? Math.min(TICK_CYCLE_MAX, Math.max(0, Math.floor(max))) : 0;
  return Array.from({ length }, (_, i) => i + 1);
}

/** Merges, so overrides for ticks above the current cycle length survive a single edit. */
export function setTickColor(overrides: TickColorOverrides, tick: number, color: string): TickColorOverrides {
  return { ...overrides, [String(tick)]: color };
}

/**
 * Every tick of the cycle set to one color, REPLACING the map rather than
 * merging into it. Merging would leave overrides for ticks above the current
 * cycle length behind, so lengthening the cycle after a bulk set would reveal
 * colors the player had just painted over.
 */
export function setAllTickColors(max: number, color: string): TickColorOverrides {
  return Object.fromEntries(tickCycle(max).map((tick) => [String(tick), color]));
}

/** Returns the SAME object when there was nothing to clear, so React can bail out on identity. */
export function clearTickColor(overrides: TickColorOverrides, tick: number): TickColorOverrides {
  if (overrides[String(tick)] === undefined) return overrides;
  const next = { ...overrides };
  delete next[String(tick)];
  return next;
}

/**
 * Null for an empty cycle rather than trivially uniform: `every()` over no ticks is vacuously
 * true, so a corrupted stored `tickCounterMax` would report a color that does not exist.
 */
export function uniformTickColor(max: number, overrides: TickColorOverrides): string | null {
  const ticks = tickCycle(max);
  const first = ticks.length > 0 ? overrides[String(ticks[0])] : undefined;
  if (first === undefined) return null;
  return ticks.every((tick) => overrides[String(tick)] === first) ? first : null;
}

export function getTickColor(current: number, max: number): string {
  if (max <= 1) return THEME.colors.textSecondary;

  const ratio = (current - 1) / (max - 1);

  const stops = [
    { pos: 0.0, r: 210, g: 190, b: 160 }, // #d2bea0, body text
    { pos: 0.33, r: 212, g: 168, b: 75 }, // #d4a84b, system gold
    { pos: 0.66, r: 220, g: 140, b: 50 },
    { pos: 1.0, r: 214, g: 124, b: 124 },
  ];

  let start = stops[0];
  let end = stops[stops.length - 1];

  for (let i = 0; i < stops.length - 1; i++) {
    if (ratio >= stops[i].pos && ratio <= stops[i + 1].pos) {
      start = stops[i];
      end = stops[i + 1];
      break;
    }
  }

  const range = end.pos - start.pos;
  const t = range === 0 ? 0 : (ratio - start.pos) / range;

  const r = Math.round(start.r + (end.r - start.r) * t);
  const g = Math.round(start.g + (end.g - start.g) * t);
  const b = Math.round(start.b + (end.b - start.b) * t);

  const toHex = (c: number) => Math.max(0, Math.min(255, c)).toString(16).padStart(2, '0');

  return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}
