import { type CSSProperties, useLayoutEffect, useState } from 'react';
import { frameWorkspace, type WorkspaceDockLayout } from '../layout/workspaceLayout';

interface MeasuredWorkspaceDockLayout extends WorkspaceDockLayout {
  readonly frame: { readonly width: number; readonly height: number };
}

/**
 * The live workspace, measured from the laid-out stage and frame: the frame's place in the stage,
 * which the recorder stores so a replay can rebuild where the frame and cursor were.
 */
export function useWorkspaceDockLayout({
  stage,
  frameStyle,
  frameSize,
  replaying,
}: {
  readonly stage: DOMRect | null;
  readonly frameStyle: CSSProperties;
  readonly frameSize: { readonly width: number; readonly height: number } | null;
  readonly replaying: boolean;
}): MeasuredWorkspaceDockLayout | null {
  const [layout, setLayout] = useState<MeasuredWorkspaceDockLayout | null>(null);

  // biome-ignore lint/correctness/useExhaustiveDependencies: stage/frameStyle changes can move the measured frame without resizing it.
  useLayoutEffect(() => {
    if (replaying || !frameSize) return;
    const measure = () => {
      const stageElement = document.querySelector('.game-viewport-stage');
      const frameElement = document.querySelector<HTMLElement>('.game-viewport-frame');
      if (!stageElement || !frameElement) return;
      const stageRect = stageElement.getBoundingClientRect();
      const frame = frameElement.getBoundingClientRect();
      const measuredFrameSize = { width: frameElement.offsetWidth, height: frameElement.offsetHeight };
      if (measuredFrameSize.width <= 0 || measuredFrameSize.height <= 0) return;
      const next = {
        ...frameWorkspace({ x: frame.left - stageRect.left, y: frame.top - stageRect.top, ...measuredFrameSize }),
        frame: measuredFrameSize,
      };
      setLayout((previous) => (JSON.stringify(previous) === JSON.stringify(next) ? previous : next));
    };
    measure();
    window.addEventListener('scroll', measure, { passive: true });
    return () => window.removeEventListener('scroll', measure);
  }, [stage, frameSize, frameStyle, replaying]);

  return layout;
}
