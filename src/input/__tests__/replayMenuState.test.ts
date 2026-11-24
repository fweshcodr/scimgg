import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ReplayMenuState } from '../../core/replayMenu';
import { getLiveReplayMenuState, publishLiveReplayMenuState, subscribeLiveReplayMenuState } from '../replayMenuState';

afterEach(() => publishLiveReplayMenuState(null));

describe('live replay menu store', () => {
  it('publishes changed states and retains identity for identical observations', () => {
    const state: ReplayMenuState = {
      entries: [{ action: 'Cancel' }],
      x: 10,
      y: 20,
      scale: 1,
      hoveredIndex: -1,
      submenuParentIndex: -1,
      hoveredSubmenuIndex: -1,
      submenuPosition: null,
    };
    const listener = vi.fn();
    const unsubscribe = subscribeLiveReplayMenuState(listener);

    publishLiveReplayMenuState(state);
    publishLiveReplayMenuState({ ...state });

    expect(getLiveReplayMenuState()).toBe(state);
    expect(listener).toHaveBeenCalledExactlyOnceWith(state);
    unsubscribe();
    publishLiveReplayMenuState(null);
    expect(listener).toHaveBeenCalledTimes(1);
  });
});
