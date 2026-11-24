import { describe, expect, it } from 'vitest';
import { buildReplayMenuTimeline, type ReplayMenuState, replayMenuStateAt } from '../replayMenu';

const menu: ReplayMenuState = {
  entries: [{ action: 'Take', target: 'Shark', submenu: [{ action: 'Examine' }] }],
  x: 10,
  y: 20,
  scale: 1.25,
  hoveredIndex: -1,
  submenuParentIndex: -1,
  hoveredSubmenuIndex: -1,
  submenuPosition: null,
};

describe('replay menu timeline', () => {
  it('holds stable states and shares entries when only the view changes', () => {
    const { entries, ...view } = menu;
    const timeline = buildReplayMenuTimeline([
      { kind: 'close', tMs: 0 },
      { kind: 'open', tMs: 20, state: menu },
      { kind: 'update', tMs: 30, view: { ...view, hoveredIndex: 0 } },
      { kind: 'close', tMs: 50 },
    ]);

    const hovered = replayMenuStateAt(timeline, 35);

    expect(replayMenuStateAt(timeline, -1)).toBeNull();
    expect(replayMenuStateAt(timeline, 19)).toBeNull();
    expect(replayMenuStateAt(timeline, 20)).toBe(menu);
    expect(hovered?.entries).toBe(entries);
    expect(hovered?.hoveredIndex).toBe(0);
    expect(replayMenuStateAt(timeline, 49)).toBe(hovered);
    expect(replayMenuStateAt(timeline, 50)).toBeNull();
    expect(replayMenuStateAt(timeline, 20)).toBe(menu);
  });

  it('uses the final event when multiple events have the same time', () => {
    const { entries: _entries, ...view } = menu;
    const timeline = buildReplayMenuTimeline([
      { kind: 'open', tMs: 0, state: menu },
      { kind: 'update', tMs: 0, view: { ...view, hoveredIndex: 0 } },
      { kind: 'close', tMs: 10 },
      { kind: 'open', tMs: 10, state: menu },
    ]);

    expect(replayMenuStateAt(timeline, 0)?.hoveredIndex).toBe(0);
    expect(replayMenuStateAt(timeline, 10)).toBe(menu);
    expect(replayMenuStateAt([], 10)).toBeNull();
  });
});
