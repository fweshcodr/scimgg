/**
 * Mirrors the RuneLite plugin-hub "Compact Orbs" plugin
 * (github.com/its-cue/compact-orbs). Persisted model only — the pixel geometry
 * lives with the renderer, in components/minimapOrbGeometry.ts.
 */
export const COMPACT_ORBS_LAYOUTS = ['vertical', 'horizontal', 'horizontal-wide'] as const;
export type CompactOrbsLayout = (typeof COMPACT_ORBS_LAYOUTS)[number];

export const COMPACT_ORBS_LAYOUT_LABELS: Record<CompactOrbsLayout, string> = {
  vertical: 'Vertical',
  horizontal: 'Horizontal',
  'horizontal-wide': 'Wide',
};

export const COMPACT_ORB_IDS = ['hitpoints', 'prayer', 'run', 'special'] as const;
export type CompactOrbId = (typeof COMPACT_ORB_IDS)[number];

export const COMPACT_ORB_LABELS: Record<CompactOrbId, string> = {
  hitpoints: 'Hitpoints',
  prayer: 'Prayer',
  run: 'Run Energy',
  special: 'Special Attack',
};

export const DEFAULT_COMPACT_ORBS_LAYOUT: CompactOrbsLayout = 'vertical';
export const DEFAULT_COMPACT_ORBS_ORDER: readonly CompactOrbId[] = COMPACT_ORB_IDS;

function isCompactOrbsLayout(value: unknown): value is CompactOrbsLayout {
  return (COMPACT_ORBS_LAYOUTS as readonly unknown[]).includes(value);
}

function isCompactOrbId(value: unknown): value is CompactOrbId {
  return (COMPACT_ORB_IDS as readonly unknown[]).includes(value);
}

export function normalizeCompactOrbsLayout(value: unknown): CompactOrbsLayout {
  return isCompactOrbsLayout(value) ? value : DEFAULT_COMPACT_ORBS_LAYOUT;
}

/** Slot lookups require a permutation of {@link COMPACT_ORB_IDS}. */
export function normalizeCompactOrbsOrder(value: unknown): CompactOrbId[] {
  const order: CompactOrbId[] = [];
  if (Array.isArray(value)) {
    for (const entry of value) {
      if (isCompactOrbId(entry) && !order.includes(entry)) {
        order.push(entry);
      }
    }
  }
  for (const id of DEFAULT_COMPACT_ORBS_ORDER) {
    if (!order.includes(id)) order.push(id);
  }
  return order;
}

export function swapCompactOrbs(order: readonly CompactOrbId[], a: number, b: number): CompactOrbId[] {
  const next = [...order];
  if (a < 0 || b < 0 || a >= next.length || b >= next.length) return next;
  [next[a], next[b]] = [next[b], next[a]];
  return next;
}

/** Geometry tables have four positions, so duplicate, missing, or extra ids make a slot lookup invalid. */
export function isCompactOrbsOrder(order: readonly CompactOrbId[]): boolean {
  return (
    order.length === DEFAULT_COMPACT_ORBS_ORDER.length && DEFAULT_COMPACT_ORBS_ORDER.every((id) => order.includes(id))
  );
}

export function isDefaultCompactOrbsOrder(order: readonly CompactOrbId[]): boolean {
  return (
    order.length === DEFAULT_COMPACT_ORBS_ORDER.length && order.every((id, i) => id === DEFAULT_COMPACT_ORBS_ORDER[i])
  );
}
