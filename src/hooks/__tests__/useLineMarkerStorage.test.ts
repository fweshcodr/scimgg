// @vitest-environment happy-dom

import { renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { LinePackPreset } from '../../types/lineMarkers';
import { LINE_MARKER_STORAGE_KEY } from '../lineMarkerState';
import { useLineMarkerStorage } from '../useLineMarkerStorage';

const TEST_PRESET: LinePackPreset = {
  id: 'test_paths',
  name: 'Test Paths',
  description: 'Test line-marker preset',
  encounterKind: 'yama_p3',
  lines: [],
};

describe('useLineMarkerStorage', () => {
  beforeEach(() => {
    localStorage.removeItem(LINE_MARKER_STORAGE_KEY);
  });

  afterEach(() => {
    localStorage.removeItem(LINE_MARKER_STORAGE_KEY);
  });

  it('reads the stored choices per encounter kind', () => {
    localStorage.setItem(
      LINE_MARKER_STORAGE_KEY,
      JSON.stringify({ presetOverrides: { [TEST_PRESET.encounterKind]: { [TEST_PRESET.id]: false } } }),
    );

    const { result } = renderHook(() => useLineMarkerStorage());

    expect(result.current.state.presetOverrides).toEqual({
      [TEST_PRESET.encounterKind]: { [TEST_PRESET.id]: false },
    });
  });

  describe('retired Zuk data', () => {
    const zukLine = { x: 30, y: 30, orientation: 'horizontal', color: '#111111', opacity: 0.5, label: 'zuk' } as const;
    const infernoSameLine = { ...zukLine, color: '#222222', label: 'inferno' } as const;
    const infernoLine = { x: 31, y: 31, orientation: 'vertical', color: '#333333', opacity: 0.7 } as const;

    function storeLines(value: unknown): void {
      localStorage.setItem(LINE_MARKER_STORAGE_KEY, JSON.stringify(value));
    }

    afterEach(() => {
      localStorage.removeItem(LINE_MARKER_STORAGE_KEY);
    });

    it("moves a Zuk-only player's lines, hidden defaults and choices onto the Inferno", () => {
      storeLines({
        linesByEncounter: { zuk: [zukLine] },
        hiddenDefaultLineKeysByEncounter: { zuk: ['h:1:1'] },
        presetOverrides: { zuk: { [TEST_PRESET.id]: false } },
      });

      const { result } = renderHook(() => useLineMarkerStorage());

      expect(result.current.state.linesByEncounter).toEqual({ inferno: [zukLine] });
      expect(result.current.state.hiddenDefaultLineKeysByEncounter).toEqual({ inferno: ['h:1:1'] });
      expect(result.current.state.presetOverrides).toEqual({ inferno: { [TEST_PRESET.id]: false } });
    });

    it('merges both kinds, Zuk winning a shared segment, whatever the stored key order', () => {
      const owned = {
        lines: [infernoSameLine, infernoLine],
        hidden: ['h:1:1', 'v:2:2'],
      };
      const retired = { lines: [zukLine], hidden: ['v:2:2', 'h:3:3'] };
      for (const zukFirst of [false, true]) {
        const pair = (inferno: unknown, zuk: unknown) =>
          zukFirst ? { zuk, inferno: inferno } : { inferno: inferno, zuk };
        storeLines({
          linesByEncounter: pair(owned.lines, retired.lines),
          hiddenDefaultLineKeysByEncounter: pair(owned.hidden, retired.hidden),
        });
        const { result, unmount } = renderHook(() => useLineMarkerStorage());
        expect(result.current.state.linesByEncounter).toEqual({ inferno: [zukLine, infernoLine] });
        expect(result.current.state.hiddenDefaultLineKeysByEncounter).toEqual({
          inferno: ['h:1:1', 'v:2:2', 'h:3:3'],
        });
        unmount();
      }
    });
  });
});
