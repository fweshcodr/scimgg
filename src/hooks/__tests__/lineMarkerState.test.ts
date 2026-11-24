import { describe, expect, it } from 'vitest';
import { clampLineWidth, type LineMarker } from '../../types/lineMarkers';
import {
  clampOpacity,
  dedupeLines,
  LINE_MARKER_DEFAULTS,
  mergeDefaultLineMarkers,
  normalizeLineArray,
} from '../lineMarkerState';

describe('clampOpacity', () => {
  it('clamps into [0, 1]', () => {
    expect(clampOpacity(-0.5)).toBe(0);
    expect(clampOpacity(1.5)).toBe(1);
    expect(clampOpacity(0.4)).toBe(0.4);
  });

  // Math.max/Math.min return NaN for NaN, and a NaN opacity is a marker no renderer can
  // draw and no recording can carry.
  it('falls back to the default for input that is not a number', () => {
    expect(clampOpacity(Number.NaN)).toBe(LINE_MARKER_DEFAULTS.lastOpacity);
    expect(clampOpacity(Number.POSITIVE_INFINITY)).toBe(LINE_MARKER_DEFAULTS.lastOpacity);
  });
});

describe('clampLineWidth', () => {
  it('clamps into the shared 0.5–10 UI scale', () => {
    expect(clampLineWidth(0)).toBe(0.5);
    expect(clampLineWidth(99)).toBe(10);
    expect(clampLineWidth(4)).toBe(4);
  });

  it('falls back to the default for non-finite input', () => {
    expect(clampLineWidth(Number.NaN)).toBe(LINE_MARKER_DEFAULTS.lineWidth);
    expect(clampLineWidth(Number.POSITIVE_INFINITY)).toBe(LINE_MARKER_DEFAULTS.lineWidth);
  });
});

describe('dedupeLines', () => {
  it('dedupes by canonical segment identity (last write wins)', () => {
    const lines: LineMarker[] = [
      { x: 1, y: 1, orientation: 'horizontal', color: '#fff', opacity: 1 },
      { x: 1, y: 1, orientation: 'horizontal', color: '#000', opacity: 0.5 },
      { x: 1, y: 1, orientation: 'vertical', color: '#f00', opacity: 1 },
    ];
    const result = dedupeLines(lines);
    expect(result).toHaveLength(2);
    const horizontal = result.find((l) => l.orientation === 'horizontal');
    expect(horizontal?.color).toBe('#000');
    expect(horizontal?.opacity).toBe(0.5);
  });
});

describe('normalizeLineArray', () => {
  it('drops entries missing coordinates or orientation', () => {
    const raw = [
      { x: 1, y: 2, orientation: 'horizontal', color: '#abc', opacity: 1 },
      { x: 1, orientation: 'horizontal' },
      { x: 3, y: 4, orientation: 'diagonal' },
      { x: 5, y: 6, orientation: 'vertical' },
    ];
    const result = normalizeLineArray(raw);
    expect(result).toHaveLength(2);
    expect(result.map((l) => l.orientation).sort()).toEqual(['horizontal', 'vertical']);
  });

  it('fills defaults for missing color/opacity and clamps opacity', () => {
    const result = normalizeLineArray([{ x: 0, y: 0, orientation: 'vertical', opacity: 5 }]);
    expect(result).toHaveLength(1);
    expect(result[0].opacity).toBe(1);
    expect(typeof result[0].color).toBe('string');
  });

  it('returns [] for non-array input', () => {
    expect(normalizeLineArray(null)).toEqual([]);
    expect(normalizeLineArray({})).toEqual([]);
    expect(normalizeLineArray('nope')).toEqual([]);
  });

  // The replay format's coordinate bound, reused rather than restated: a line outside it is
  // neither drawable nor replayable, so it must not reach the format's strict schema.
  it('drops a line whose coordinates are not usable numbers', () => {
    const raw = [
      { x: Number.NaN, y: 2, orientation: 'horizontal' },
      { x: 1, y: Number.POSITIVE_INFINITY, orientation: 'horizontal' },
      { x: 1e9, y: 2, orientation: 'vertical' },
      { x: '3', y: 4, orientation: 'vertical' },
    ];

    expect(normalizeLineArray(raw)).toEqual([]);
  });
});

describe('mergeDefaultLineMarkers', () => {
  const defaults: LineMarker[] = [
    { x: 1, y: 2, orientation: 'horizontal', color: '#00ff00', opacity: 1 },
    { x: 3, y: 4, orientation: 'vertical', color: '#00ff00', opacity: 1 },
  ];

  it('shows defaults only when enabled', () => {
    expect(mergeDefaultLineMarkers([], defaults, [], false)).toEqual([]);
    expect(mergeDefaultLineMarkers([], defaults, [], true)).toEqual(defaults);
  });

  it('keeps user customizations and removed defaults intact', () => {
    const firstDefault = defaults[0];
    const customized = { ...firstDefault, color: '#fff', label: 'custom' };
    const result = mergeDefaultLineMarkers([customized], defaults, ['v:3:4'], true);

    expect(result).toContainEqual(customized);
    expect(result).toHaveLength(1);
    expect(mergeDefaultLineMarkers([customized], defaults, [], false)).toEqual([]);
  });
});
