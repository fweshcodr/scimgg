// @vitest-environment happy-dom

import { act, renderHook } from '@testing-library/react';
import { useState } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as linePackPresets from '../../data/linePackPresets';
import { type LineMarker, type LinePackPreset, lineMarkerKeyOf } from '../../types/lineMarkers';
import { LINE_MARKER_DEFAULTS, type LineMarkerStorageState } from '../lineMarkerState';
import { useLineMarkerActions } from '../useLineMarkerActions';

const ENCOUNTER = 'yama_p3';

const DEFAULT_LINES: readonly LineMarker[] = [
  { x: 28, y: 34, orientation: 'horizontal', color: '#00ffff', opacity: 0.5 },
  { x: 29, y: 34, orientation: 'vertical', color: '#00ffff', opacity: 0.5 },
];

const [FIRST_LINE, SECOND_LINE] = DEFAULT_LINES as readonly [LineMarker, LineMarker];

const TEST_PRESET: LinePackPreset = {
  id: 'test_paths',
  name: 'Test Paths',
  description: 'Test line-marker preset',
  encounterKind: ENCOUNTER,
  lines: DEFAULT_LINES,
  defaultActive: true,
};

const FIRST_KEY = lineMarkerKeyOf(FIRST_LINE);

beforeEach(() => {
  vi.spyOn(linePackPresets, 'getLinePresetsForEncounter').mockReturnValue([TEST_PRESET]);
});

afterEach(() => {
  vi.restoreAllMocks();
});

function renderActions(initial: Partial<LineMarkerStorageState> = {}) {
  const view = renderHook(() => {
    const [state, setState] = useState<LineMarkerStorageState>({ ...LINE_MARKER_DEFAULTS, ...initial });
    return {
      state,
      actions: useLineMarkerActions({
        encounterKind: ENCOUNTER,
        availablePresets: [TEST_PRESET],
        state,
        setState,
      }),
    };
  });
  return {
    ...view,
    hidden: () => view.result.current.state.hiddenDefaultLineKeysByEncounter[ENCOUNTER] ?? [],
    userLines: () => view.result.current.state.linesByEncounter[ENCOUNTER] ?? [],
    keys: () => view.result.current.actions.lines.map(lineMarkerKeyOf),
  };
}

describe('useLineMarkerActions default-line overlay', () => {
  it('starts with the defaults visible and nothing stored', () => {
    const { keys, hidden, userLines } = renderActions();

    expect(keys()).toEqual(DEFAULT_LINES.map(lineMarkerKeyOf));
    expect(hidden()).toEqual([]);
    expect(userLines()).toEqual([]);
  });

  it('records a removed default line as hidden rather than deleting nothing', () => {
    const { result, keys, hidden, userLines } = renderActions();

    act(() => result.current.actions.removeLine(FIRST_LINE.x, FIRST_LINE.y, FIRST_LINE.orientation));

    // Then: filtering the user list alone would have been a no-op, so removal has to be
    // remembered as an explicit hide for the line to actually go away.
    expect(keys()).toEqual([lineMarkerKeyOf(SECOND_LINE)]);
    expect(hidden()).toEqual([FIRST_KEY]);
    expect(userLines()).toEqual([]);
  });

  it('does not record a hide when the removed line was the user\u2019s own', () => {
    // Given: a user line that is not part of the default set.
    const own: LineMarker = { x: 50, y: 50, orientation: 'horizontal', color: '#00ff00', opacity: 0.5 };
    const { result, hidden, userLines } = renderActions({ linesByEncounter: { [ENCOUNTER]: [own] } });

    act(() => result.current.actions.removeLine(50, 50, 'horizontal'));

    // Then: deleting it is enough; hiding a default that does not exist would be noise.
    expect(userLines()).toEqual([]);
    expect(hidden()).toEqual([]);
  });

  it('does not hide the same default line twice', () => {
    const { result, hidden } = renderActions();

    act(() => result.current.actions.removeLine(FIRST_LINE.x, FIRST_LINE.y, FIRST_LINE.orientation));
    act(() => result.current.actions.removeLine(FIRST_LINE.x, FIRST_LINE.y, FIRST_LINE.orientation));

    expect(hidden()).toEqual([FIRST_KEY]);
  });

  it('materializes a recolored default line as a user line and un-hides it', () => {
    const { result, keys, hidden, userLines } = renderActions({
      hiddenDefaultLineKeysByEncounter: { [ENCOUNTER]: [FIRST_KEY] },
    });
    expect(keys()).not.toContain(FIRST_KEY);

    // When: it is given a color, which is only possible from the editor.
    act(() =>
      result.current.actions.updateLineColor(FIRST_LINE.x, FIRST_LINE.y, FIRST_LINE.orientation, '#ff0000', 0.25),
    );

    expect(hidden()).toEqual([]);
    expect(userLines()).toEqual([{ ...FIRST_LINE, color: '#ff0000', opacity: 0.25 }]);
    expect(keys()).toContain(FIRST_KEY);
  });

  it('clamps opacity while materializing and remembers the color as the next default', () => {
    const { result, userLines } = renderActions();

    act(() => result.current.actions.updateLineColor(FIRST_LINE.x, FIRST_LINE.y, FIRST_LINE.orientation, '#ff0000', 4));

    expect(userLines()[0]?.opacity).toBe(1);
    expect(result.current.state.lastColor).toBe('#ff0000');
    expect(result.current.state.lastOpacity).toBe(1);
  });

  it('materializes a labeled default line and un-hides it', () => {
    const { result, hidden, userLines } = renderActions({
      hiddenDefaultLineKeysByEncounter: { [ENCOUNTER]: [FIRST_KEY] },
    });

    act(() => result.current.actions.updateLineLabel(FIRST_LINE.x, FIRST_LINE.y, FIRST_LINE.orientation, 'Safe'));

    expect(hidden()).toEqual([]);
    expect(userLines()).toEqual([{ ...FIRST_LINE, label: 'Safe' }]);
  });

  it('treats an empty label as no label', () => {
    const { result, userLines } = renderActions();

    act(() => result.current.actions.updateLineLabel(FIRST_LINE.x, FIRST_LINE.y, FIRST_LINE.orientation, ''));

    expect(userLines()[0]?.label).toBeUndefined();
  });

  it('ignores a style or label edit for a line that is neither stored nor from a preset', () => {
    const { result } = renderActions();

    act(() => result.current.actions.updateLineColor(99, 99, 'horizontal', '#ff0000', 1));
    act(() => result.current.actions.updateLineLabel(99, 99, 'horizontal', 'Nope'));

    expect(result.current.state).toEqual({ ...LINE_MARKER_DEFAULTS });
  });

  it('un-hides a default line that is drawn again', () => {
    const { result, hidden, userLines } = renderActions({
      hiddenDefaultLineKeysByEncounter: { [ENCOUNTER]: [FIRST_KEY] },
    });

    act(() => result.current.actions.addLine(FIRST_LINE.x, FIRST_LINE.y, FIRST_LINE.orientation));

    // Then: the hide is lifted, or the new line would be swallowed by it.
    expect(hidden()).toEqual([]);
    expect(userLines()).toHaveLength(1);
  });

  it('hides every default line when the encounter is cleared', () => {
    const own: LineMarker = { x: 50, y: 50, orientation: 'horizontal', color: '#00ff00', opacity: 0.5 };
    const { result, keys, hidden, userLines } = renderActions({ linesByEncounter: { [ENCOUNTER]: [own] } });

    act(() => result.current.actions.clearAllLines());

    // Then: only the user's own line goes. The preset group is not this button's
    // to remove, since it is not listed beside it.
    expect(userLines()).toEqual([]);
    expect(hidden()).toEqual([]);
    expect(keys()).toEqual(DEFAULT_LINES.map(lineMarkerKeyOf));
  });

  it('un-hides the default lines an import brings back', () => {
    const { result, hidden, userLines } = renderActions({
      hiddenDefaultLineKeysByEncounter: { [ENCOUNTER]: DEFAULT_LINES.map(lineMarkerKeyOf) },
    });

    act(() => result.current.actions.importLines([{ ...FIRST_LINE, color: '#0000ff' }]));

    expect(hidden()).toEqual([lineMarkerKeyOf(SECOND_LINE)]);
    expect(userLines()).toEqual([{ ...FIRST_LINE, color: '#0000ff' }]);
  });

  it('keeps every preset line out of the list while the preset is off', () => {
    const { result } = renderHook(() => {
      const [state, setState] = useState<LineMarkerStorageState>({
        ...LINE_MARKER_DEFAULTS,
        presetOverrides: { [ENCOUNTER]: { [TEST_PRESET.id]: false } },
      });
      return useLineMarkerActions({
        encounterKind: ENCOUNTER,
        availablePresets: [TEST_PRESET],
        state,
        setState,
      });
    });

    expect(result.current.lines).toEqual([]);
    expect(result.current.hasLine(FIRST_LINE.x, FIRST_LINE.y, FIRST_LINE.orientation)).toBe(false);
    expect(result.current.getLine(FIRST_LINE.x, FIRST_LINE.y, FIRST_LINE.orientation)).toBeUndefined();
  });

  it("drops a preset's lines when toggled off and restores them when toggled back on", () => {
    const { result, keys } = renderActions();

    act(() => result.current.actions.togglePreset(TEST_PRESET.id));
    expect(result.current.state.presetOverrides).toEqual({ [ENCOUNTER]: { [TEST_PRESET.id]: false } });
    expect(result.current.actions.activePresetIds).toEqual([]);
    expect(keys()).toEqual([]);

    act(() => result.current.actions.togglePreset(TEST_PRESET.id));
    expect(keys()).toEqual(DEFAULT_LINES.map(lineMarkerKeyOf));
  });

  it('un-hides previously removed lines when its preset is re-enabled', () => {
    const { result, keys, hidden } = renderActions();

    act(() => result.current.actions.removeLine(FIRST_LINE.x, FIRST_LINE.y, FIRST_LINE.orientation));
    expect(hidden()).toEqual([FIRST_KEY]);

    act(() => result.current.actions.togglePreset(TEST_PRESET.id));
    act(() => result.current.actions.togglePreset(TEST_PRESET.id));

    expect(hidden()).toEqual([]);
    expect(keys()).toEqual(DEFAULT_LINES.map(lineMarkerKeyOf));
  });

  it('deactivateAllPresets clears only the presets available here', () => {
    const { result } = renderActions({ presetOverrides: { zuk: { other_encounter_preset: true } } });

    act(() => result.current.actions.deactivateAllPresets());

    expect(result.current.state.presetOverrides).toEqual({
      [ENCOUNTER]: { [TEST_PRESET.id]: false },
      zuk: { other_encounter_preset: true },
    });
  });

  it('starts a defaultActive preset on without storing anything', () => {
    const { result, keys } = renderActions();

    expect(result.current.state.presetOverrides).toEqual({});
    expect(result.current.actions.activePresetIds).toEqual([TEST_PRESET.id]);
    expect(keys()).toEqual(DEFAULT_LINES.map(lineMarkerKeyOf));
  });

  it('keeps a defaultActive preset off once the user has switched it off', () => {
    const { result, keys } = renderActions({ presetOverrides: { [ENCOUNTER]: { [TEST_PRESET.id]: false } } });

    expect(result.current.actions.activePresetIds).toEqual([]);
    expect(keys()).toEqual([]);
  });

  it('drops a recolored preset line once its group is switched off', () => {
    // Restyling copies the segment into linesByEncounter.
    const { result, keys, userLines } = renderActions();

    act(() => result.current.actions.updateLineColor(FIRST_LINE.x, FIRST_LINE.y, FIRST_LINE.orientation, '#ff0000', 1));
    expect(keys()).toContain(FIRST_KEY);

    act(() => result.current.actions.togglePreset(TEST_PRESET.id));

    expect(keys()).toEqual([]);
    // The edit is remembered, just not rendered, so re-enabling restores it.
    expect(userLines()).toHaveLength(1);

    act(() => result.current.actions.togglePreset(TEST_PRESET.id));
    expect(keys()).toContain(FIRST_KEY);
  });

  it('drops preset lines when the preset stops being offered at all', () => {
    const { result } = renderHook(() => {
      const [state, setState] = useState<LineMarkerStorageState>({
        ...LINE_MARKER_DEFAULTS,
        linesByEncounter: { [ENCOUNTER]: [{ ...FIRST_LINE, color: '#ff0000' }] },
      });
      return useLineMarkerActions({ encounterKind: ENCOUNTER, availablePresets: [], state, setState });
    });

    expect(result.current.lines).toEqual([]);
  });

  it("lists only the user's own lines, never the active preset's", () => {
    // The panel's "Your Lines" section reads this; the renderer reads `lines`.
    const own: LineMarker = { x: 50, y: 50, orientation: 'horizontal', color: '#00ff00', opacity: 0.5 };
    const { result } = renderActions({ linesByEncounter: { [ENCOUNTER]: [own] } });

    expect(result.current.actions.userLines).toEqual([own]);
    expect(result.current.actions.lines).toHaveLength(DEFAULT_LINES.length + 1);
  });

  it('keeps an edited preset line in the user list, since the user now owns it', () => {
    const { result } = renderActions();

    act(() => result.current.actions.updateLineColor(FIRST_LINE.x, FIRST_LINE.y, FIRST_LINE.orientation, '#ff0000', 1));

    expect(result.current.actions.userLines).toEqual([{ ...FIRST_LINE, color: '#ff0000', opacity: 1 }]);
  });
});
