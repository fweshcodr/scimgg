import { createContext, type ReactNode, useContext, useLayoutEffect, useState } from 'react';
import { DisplayTimeline, type DisplayTimelineReader } from '../core/displayTimeline';
import type { ReplayDisplayFrame } from '../core/ReplayRecorder';
import type { SimulationState } from '../types/simulation';
import { useReplayFrameStore } from './ReplayFrameContext';
import { useTickProgressStore } from './TickProgressContext';

const DisplayTimelineContext = createContext<DisplayTimelineReader | null>(null);

interface DisplayTimelineProviderProps {
  /** The recorder's own frame array, never a copy: consumers key their indexes on its identity. */
  history: readonly ReplayDisplayFrame[];
  state: SimulationState;
  replaying: boolean;
  children: ReactNode;
}

/**
 * Consumers subscribe to the reader imperatively; nothing here re-renders when
 * the clock moves.
 *
 * The source lands in a layout effect, after the consumers' own layout effects
 * have drawn against whatever the reader held: the facade publishes the change,
 * so a consumer that drew a null snapshot first is redrawn in the same commit,
 * before the browser paints.
 */
export function DisplayTimelineProvider({ history, state, replaying, children }: DisplayTimelineProviderProps) {
  const tickProgressStore = useTickProgressStore();
  const replayFrameStore = useReplayFrameStore();
  const [timeline] = useState(() =>
    tickProgressStore && replayFrameStore ? new DisplayTimeline(tickProgressStore, replayFrameStore) : null,
  );

  useLayoutEffect(() => {
    timeline?.setSource({ history, state, replaying });
  }, [timeline, history, state, replaying]);

  return <DisplayTimelineContext.Provider value={timeline}>{children}</DisplayTimelineContext.Provider>;
}

export function useDisplayTimeline(): DisplayTimelineReader | null {
  return useContext(DisplayTimelineContext);
}
