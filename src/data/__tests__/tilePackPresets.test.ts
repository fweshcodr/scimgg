import { describe, expect, it } from 'vitest';
import { getPresetsForEncounter } from '../tilePackPresets';

describe('Zuk tile-marker preset', () => {
  it('registers the Zuk Inferno markers with the shared semantic colors', () => {
    const presets = getPresetsForEncounter('zuk');

    const preset = presets.find((candidate) => candidate.id === 'zuk_inferno');

    expect(preset).toBeDefined();
    expect(preset?.description).toBe('Zuk safe columns, danger tiles, and positional references');
    expect(preset?.markers).toHaveLength(14);
    expect(preset?.markers.map(({ x, y }) => [x, y])).toEqual([
      [36, 46],
      [42, 46],
      [26, 46],
      [20, 46],
      [40, 46],
      [39, 46],
      [38, 46],
      [31, 45],
      [23, 46],
      [22, 46],
      [24, 46],
      [33, 43],
      [32, 29],
      [26, 34],
    ]);
    expect(preset?.markers.filter((marker) => marker.color === '#00BFA5')).toHaveLength(4);
    expect(preset?.markers.filter((marker) => marker.color === '#FF6B35')).toHaveLength(7);
    expect(preset?.markers.filter((marker) => marker.color === '#90A4AE')).toHaveLength(3);
    expect(preset?.markers).toContainEqual({ x: 31, y: 45, color: '#FF6B35', opacity: 0.8, label: 'UNSAFE' });
  });
});
