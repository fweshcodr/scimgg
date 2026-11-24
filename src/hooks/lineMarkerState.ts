import { ReplayMarkerCoordinateSchema } from '../replay/format/presentationFormat';
import {
  DEFAULT_LINE_MARKER_COLOR,
  DEFAULT_LINE_MARKER_OPACITY,
  DEFAULT_LINE_MARKER_WIDTH,
  type LineMarker,
  type LineOrientation,
  lineMarkerKeyOf,
} from '../types/lineMarkers';
import type { PresetOverrides } from './presetState';

export const LINE_MARKER_STORAGE_KEY = 'osrs-line-markers';

export interface LineMarkerStorageState {
  linesByEncounter: Record<string, LineMarker[]>;
  hiddenDefaultLineKeysByEncounter: Record<string, string[]>;
  showLines: boolean;
  showLabels: boolean;
  lastColor: string;
  lastOpacity: number;
  lineWidth: number;
  /** Explicit per-preset choices, keyed by encounter kind; see `presetState` for the model. */
  presetOverrides: PresetOverrides;
}

export const LINE_MARKER_DEFAULTS: LineMarkerStorageState = {
  linesByEncounter: {},
  hiddenDefaultLineKeysByEncounter: {},
  showLines: true,
  showLabels: true,
  lastColor: DEFAULT_LINE_MARKER_COLOR,
  lastOpacity: DEFAULT_LINE_MARKER_OPACITY,
  lineWidth: DEFAULT_LINE_MARKER_WIDTH,
  presetOverrides: {},
};

export function clampOpacity(opacity: number): number {
  // Math.max/Math.min propagate NaN, so a stored `null` or a hand-edited string arrives
  // as an opacity no renderer can use and no recording can carry.
  if (!Number.isFinite(opacity)) return DEFAULT_LINE_MARKER_OPACITY;
  return Math.max(0, Math.min(1, opacity));
}

function isOrientation(value: unknown): value is LineOrientation {
  return value === 'horizontal' || value === 'vertical';
}

/**
 * Coordinates are validated with the replay format's own leaf schema rather than a local
 * rule: a marker outside that range can be neither drawn nor recorded, and stating the
 * bound twice is how the two come to disagree.
 */
function normalizeLine(line: Partial<LineMarker>): LineMarker | null {
  const x = ReplayMarkerCoordinateSchema.safeParse(line.x);
  const y = ReplayMarkerCoordinateSchema.safeParse(line.y);
  if (!x.success || !y.success) return null;
  if (!isOrientation(line.orientation)) return null;
  return {
    x: x.data,
    y: y.data,
    orientation: line.orientation,
    color: typeof line.color === 'string' ? line.color : DEFAULT_LINE_MARKER_COLOR,
    opacity: clampOpacity(typeof line.opacity === 'number' ? line.opacity : DEFAULT_LINE_MARKER_OPACITY),
    ...(typeof line.label === 'string' ? { label: line.label } : {}),
  };
}

/** Dedupe by canonical segment identity (last write wins). */
export function dedupeLines(lines: LineMarker[]): LineMarker[] {
  const byKey = new Map<string, LineMarker>();
  for (const line of lines) byKey.set(lineMarkerKeyOf(line), line);
  return [...byKey.values()];
}

export function normalizeLineArray(raw: unknown): LineMarker[] {
  if (!Array.isArray(raw)) return [];
  return dedupeLines(raw.map(normalizeLine).filter((l): l is LineMarker => l !== null));
}

export function mergeDefaultLineMarkers(
  userLines: LineMarker[],
  defaultLines: readonly LineMarker[],
  hiddenDefaultLineKeys: readonly string[],
  showDefaults: boolean,
): LineMarker[] {
  if (defaultLines.length === 0) return userLines;
  const defaultKeys = new Set(defaultLines.map(lineMarkerKeyOf));
  if (!showDefaults) return userLines.filter((line) => !defaultKeys.has(lineMarkerKeyOf(line)));
  const userKeys = new Set(userLines.map(lineMarkerKeyOf));
  const hiddenKeys = new Set(hiddenDefaultLineKeys);
  return [
    ...userLines,
    ...defaultLines.filter((line) => !userKeys.has(lineMarkerKeyOf(line)) && !hiddenKeys.has(lineMarkerKeyOf(line))),
  ];
}
