// @vitest-environment happy-dom
import { act, cleanup, render } from '@testing-library/react';
import { Profiler } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { DisplayTimelineSnapshot } from '../../core/displayTimeline';
import { SimulationEngine } from '../../core/SimulationEngine';
import { encounterRegistry } from '../../encounters/registry';
import { XpDropOverlay } from '../XpDropOverlay';

const timeline = vi.hoisted(() => ({
  snapshot: null as DisplayTimelineSnapshot | null,
  listeners: new Set<() => void>(),
  getSnapshot: (): DisplayTimelineSnapshot | null => timeline.snapshot,
  subscribe: (listener: () => void) => {
    timeline.listeners.add(listener);
    return () => {
      timeline.listeners.delete(listener);
    };
  },
}));
vi.mock('../../contexts/DisplayTimelineContext', () => ({ useDisplayTimeline: () => timeline }));
vi.mock('../pixelSpriteStore', () => {
  const image = { naturalWidth: 16, naturalHeight: 20 };
  return {
    subscribe: () => () => {},
    getSprite: () => image,
    getResampled: () => image,
    loadSprite: () => Promise.resolve(image),
  };
});

afterEach(() => {
  cleanup();
  timeline.snapshot = null;
  timeline.listeners.clear();
  vi.unstubAllGlobals();
});

describe('XP drop sprite lifecycle', () => {
  it('keeps native sprite boxes and resizes canvas backing stores without recreating moving drops', () => {
    vi.stubGlobal('devicePixelRatio', 1);
    const state = new SimulationEngine({ encounter: encounterRegistry.create('yama_p3') }).getState();
    timeline.snapshot = {
      tick: 0,
      frameIndex: 0,
      state,
      history: [
        {
          state,
          events: [
            { type: 'xp_drop', tick: 0, eventId: 1, skills: [{ skill: 'attack', amount: 100 }], predictedHit: 25 },
          ],
        },
      ],
    };
    const props = { enabled: true, showPredictedHit: true, showIcons: true, grouped: true, speed: 44 };
    const onRender = vi.fn();
    const { container, rerender, unmount } = render(<XpDropOverlay {...props} overlayScale={1} />, {
      wrapper: ({ children }) => (
        <Profiler id="xp" onRender={onRender}>
          {children}
        </Profiler>
      ),
    });
    const drop = container.querySelector<HTMLElement>('.xp-drop');
    const canvas = container.querySelector('canvas');
    expect(drop?.textContent).toBe('100 (25)');
    expect(container.querySelector('img')).toBeNull();
    expect(canvas?.style.width).toBe('16px');
    expect(canvas?.style.height).toBe('20px');
    expect(canvas?.width).toBe(16);

    rerender(<XpDropOverlay {...props} overlayScale={1.5} />);
    expect(container.querySelector('.xp-drop')).toBe(drop);
    expect(container.querySelector('canvas')).toBe(canvas);
    expect(canvas?.width).toBe(24);
    expect(canvas?.height).toBe(30);

    // Fit shrinks the replay workspace, not the overlay's logical panel geometry.
    rerender(<XpDropOverlay {...props} overlayScale={2} overlayOuterScale={0.5} />);
    const panel = container.querySelector<HTMLElement>('[data-tutorial="xp-drops-panel"]');
    expect(panel?.style.width).toBe('340px');
    expect(panel?.style.height).toBe('260px');
    expect(canvas?.style.width).toBe('16px');
    expect(canvas?.width).toBe(16);
    expect(canvas?.height).toBe(20);
    rerender(<XpDropOverlay {...props} overlayScale={2} overlayOuterScale={0.75} />);
    expect(container.querySelector('canvas')).toBe(canvas);
    expect(container.querySelector('.xp-drop')).toBe(drop);
    expect(panel?.style.width).toBe('340px');
    expect(canvas?.width).toBe(24);
    expect(canvas?.height).toBe(30);
    act(() => {
      onRender.mockClear();
      timeline.snapshot = { ...timeline.snapshot!, tick: 1 };
      for (const listener of timeline.listeners) listener();
    });
    expect(drop?.style.transform).toContain('-26.40px');
    expect(onRender).not.toHaveBeenCalled();
    expect(container.querySelector('canvas')).toBe(canvas);
    act(() => {
      timeline.snapshot = { ...timeline.snapshot!, tick: 4 };
      for (const listener of timeline.listeners) listener();
    });
    expect(container.querySelector('.xp-drop')).toBeNull();
    unmount();
    expect(timeline.listeners.size).toBe(0);
  });
});
