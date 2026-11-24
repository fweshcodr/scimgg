// @vitest-environment happy-dom

import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ReplayPresentationState } from '../../core/replayPresentation';
import { ReplayPresentationStateSchema } from '../../replay/format/presentationFormat';
import { projectReplayPresentation } from '../../replay/replayCapture';
import { useWorkspaceDockLayout } from '../useWorkspaceDockLayout';

type LayoutInputs = Parameters<typeof useWorkspaceDockLayout>[0];

const PRESENTATION = {
  clientLayoutMode: 'fixed',
  insets: { left: 0, right: 0 },
  uiScale: 1,
  panels: {
    gamePanel: { x: 0, y: 0, anchorX: 'right', anchorY: 'bottom' },
    minimap: { x: 0, y: 0, anchorX: 'right', anchorY: 'top' },
    compactOrbs: { x: 0, y: 0, anchorX: 'right', anchorY: 'top' },
    infobox: null,
    zukSetTimer: null,
  },
  variants: {
    activeGamePanelTab: 'inventory',
    compactOrbsEnabled: false,
    compactOrbsLayout: 'vertical',
    compactOrbsOrder: ['hitpoints', 'prayer', 'run', 'special'],
    infoboxPinTarget: 'hud',
    showCoordinates: false,
  },
} as const;

function measuredViewport() {
  const stageElement = document.createElement('div');
  stageElement.className = 'game-viewport-stage';
  const frameElement = document.createElement('div');
  frameElement.className = 'game-viewport-frame';
  stageElement.append(frameElement);
  document.body.append(stageElement);
  const stageRect = vi.spyOn(stageElement, 'getBoundingClientRect').mockReturnValue(new DOMRect(0, 0, 1280, 720));
  const frameRect = vi.spyOn(frameElement, 'getBoundingClientRect').mockReturnValue(new DOMRect(258, 109, 765, 503));
  vi.spyOn(frameElement, 'offsetWidth', 'get').mockImplementation(() => Math.round(frameRect().width));
  vi.spyOn(frameElement, 'offsetHeight', 'get').mockImplementation(() => Math.round(frameRect().height));
  vi.stubGlobal('innerWidth', 1280);
  vi.stubGlobal('innerHeight', 1000);
  const inputs: LayoutInputs = {
    stage: stageRect(),
    frameStyle: { width: 765, height: 503 },
    frameSize: { width: 765, height: 503 },
    replaying: false,
  };
  return { stageRect, frameRect, inputs };
}

function captureDuringRender(inputs: LayoutInputs) {
  const presentations: ReplayPresentationState[] = [];
  const hook = renderHook(
    (props: LayoutInputs) => {
      const layout = useWorkspaceDockLayout(props);
      if (props.frameSize) {
        presentations.push(
          projectReplayPresentation(
            {
              ...PRESENTATION,
              frame: layout?.frame ?? props.frameSize,
              ...(layout ? { workspace: layout.workspace } : {}),
            },
            null,
          ),
        );
      }
      return layout;
    },
    { initialProps: inputs },
  );
  return { ...hook, presentations };
}

afterEach(() => {
  cleanup();
  document.body.replaceChildren();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('useWorkspaceDockLayout capture', () => {
  it('is the game frame itself, whatever the window leaves around it', () => {
    const { inputs, stageRect, frameRect } = measuredViewport();
    stageRect.mockReturnValue(new DOMRect(0, 0, 2400, 1200));
    frameRect.mockReturnValue(new DOMRect(100, 100, 1000, 800));
    const { result, presentations } = captureDuringRender(inputs);
    expect(result.current?.frame).toEqual({ width: 1000, height: 800 });
    expect(result.current?.bounds).toEqual({ x: 100, y: 100, width: 1000, height: 800 });
    expect(result.current?.workspace).toEqual({ width: 1000, height: 800 });
    expect(ReplayPresentationStateSchema.safeParse(presentations.at(-1)).success).toBe(true);
  });

  it('publishes measured game dimensions when the conditionally mounted frame first becomes available', () => {
    const { inputs } = measuredViewport();
    const { rerender, result, presentations } = captureDuringRender({ ...inputs, frameSize: null });
    expect(result.current).toBeNull();
    expect(presentations).toEqual([]);

    rerender(inputs);

    expect(result.current?.frame).toEqual({ width: 765, height: 503 });
    expect(presentations.at(-1)?.workspace).toEqual({ width: 765, height: 503 });
  });

  it('keeps every render replayable when a larger frame arrives before workspace measurement', () => {
    const { inputs, stageRect, frameRect } = measuredViewport();
    const { rerender, presentations } = captureDuringRender(inputs);
    stageRect.mockReturnValue(new DOMRect(0, 0, 1600, 1000));
    frameRect.mockReturnValue(new DOMRect(300, 150, 1000, 700));

    rerender({ ...inputs, stage: stageRect(), frameSize: { width: 1000, height: 700 } });

    expect(presentations.length).toBeGreaterThan(2);
    for (const presentation of presentations) {
      expect(ReplayPresentationStateSchema.safeParse(presentation).success).toBe(true);
    }
    expect(presentations.at(-1)?.frame).toEqual({ width: 1000, height: 700 });
    expect(presentations.at(-1)?.workspace).toMatchObject({ width: 1000, height: 700 });
  });

  it('uses the committed smaller game size when a layout change precedes the frame observer', () => {
    const { inputs, frameRect } = measuredViewport();
    const { rerender, result, presentations } = captureDuringRender(inputs);
    frameRect.mockReturnValue(new DOMRect(100, 150, 600, 400));

    rerender({ ...inputs, frameStyle: { width: 600, height: 400 } });

    expect(result.current?.frame).toEqual({ width: 600, height: 400 });
    expect(presentations.at(-1)?.frame).toEqual({ width: 600, height: 400 });
    expect(presentations.at(-1)?.workspace).toMatchObject({ width: 600, height: 400 });
  });

  it('retains the coherent live snapshot when entering a larger, scaled replay', () => {
    const { inputs, frameRect } = measuredViewport();
    const { rerender, result, presentations } = captureDuringRender(inputs);
    const liveLayout = result.current;
    frameRect.mockReturnValue(new DOMRect(100, 50, 900, 500));

    rerender({ ...inputs, replaying: true, frameSize: { width: 1800, height: 1000 } });

    expect(result.current).toBe(liveLayout);
    expect(presentations.at(-1)?.frame).toEqual({ width: 765, height: 503 });
    expect(presentations.at(-1)?.workspace).toEqual(liveLayout?.workspace);
  });

  it('measures the restored live frame when leaving replay before its observer delivers', () => {
    const { inputs, frameRect } = measuredViewport();
    const replayInputs = { ...inputs, replaying: true, frameSize: { width: 1800, height: 1000 } };
    const { rerender, result, presentations } = captureDuringRender(replayInputs);
    frameRect.mockReturnValue(new DOMRect(100, 50, 900, 600));

    rerender({ ...replayInputs, replaying: false });

    expect(result.current?.frame).toEqual({ width: 900, height: 600 });
    expect(presentations.at(-1)?.frame).toEqual({ width: 900, height: 600 });
    expect(presentations.at(-1)?.workspace).toMatchObject({ width: 900, height: 600 });
  });

  it('publishes a coherent snapshot when scroll measurement runs before the frame observer', () => {
    const { inputs, frameRect } = measuredViewport();
    const { result, presentations } = captureDuringRender(inputs);
    frameRect.mockReturnValue(new DOMRect(100, 150, 600, 400));

    act(() => window.dispatchEvent(new Event('scroll')));

    expect(result.current?.frame).toEqual({ width: 600, height: 400 });
    expect(presentations.at(-1)?.frame).toEqual({ width: 600, height: 400 });
    expect(presentations.at(-1)?.workspace).toMatchObject({ width: 600, height: 400 });
  });

  it('contains the logical offset dimensions when the bounding rectangle has fractional dimensions', () => {
    const { inputs, frameRect } = measuredViewport();
    frameRect.mockReturnValue(new DOMRect(258, 109, 765.6, 503.6));

    const { result, presentations } = captureDuringRender({ ...inputs, frameSize: { width: 766, height: 504 } });

    expect(result.current?.frame).toEqual({ width: 766, height: 504 });
    expect(presentations.at(-1)?.workspace).toMatchObject({ width: 766, height: 504 });
  });

  it('preserves layout identity when an observer reports unchanged geometry', () => {
    const { inputs } = measuredViewport();
    const { result, rerender } = captureDuringRender(inputs);
    const previous = result.current;

    rerender({ ...inputs, frameSize: { width: 765, height: 503 } });

    expect(result.current).toBe(previous);
  });
});
