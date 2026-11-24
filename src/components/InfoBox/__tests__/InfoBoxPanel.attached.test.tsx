// @vitest-environment happy-dom

import { act, cleanup, render, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { UIPosition } from '../../../hooks/usePersistedSettings';
import type { SimulationState } from '../../../types/simulation';
import { TUTORIAL_PANEL_MOVED_EVENT, TUTORIAL_PANEL_RESIZED_EVENT } from '../../DraggablePanel';
import { computeStripScreenPosition, dampedInfoboxScale, InfoBoxPanel, parseTranslate3d } from '../InfoBoxPanel';

/** Mutable so a test can change the global UI scale mid-mount. Defaults to 1. */
const uiScaleRef = vi.hoisted(() => ({ current: 1 }));

vi.mock('../../Tooltip', () => ({
  useTooltip: () => ({
    setScale: vi.fn(),
    bindTooltip: () => ({}),
    showTooltip: vi.fn(),
  }),
  useTooltipScale: () => uiScaleRef.current,
  TOOLTIP_COLORS: { action: '#fff', item: '#f5c080' },
}));

vi.mock('../selectInfoboxes', () => ({
  selectInfoboxes: () => infoboxStubs,
}));

// Eight tiles: enough to wrap into more than one row at every width these tests give.
const infoboxStubs = Array.from({ length: 8 }, (_, i) => ({
  id: `stub-${i}`,
  text: '0',
  textColor: '#fff',
  tooltipTitle: 'Stub',
  tooltipDetail: 'Stub',
}));

let lastPanelHeight = 0;
let lastPanelWidth = 0;
let rafCallbacks: FrameRequestCallback[] = [];

vi.mock('../../DraggablePanel', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../DraggablePanel')>();
  return {
    ...actual,
    DraggablePanel: ({
      children,
      dataTutorial,
      height,
      position,
      width,
    }: {
      readonly children: ReactNode;
      readonly dataTutorial?: string;
      readonly height: number;
      readonly position: UIPosition;
      readonly width: number;
    }) => {
      lastPanelHeight = height;
      lastPanelWidth = width;
      return (
        <div data-tutorial={dataTutorial} style={{ transform: `translate3d(${position.x}px, ${position.y}px, 0)` }}>
          {children}
        </div>
      );
    },
  };
});

const STUB_STATE = {} as SimulationState;

function addGamePanel(left: number, top: number): HTMLDivElement {
  const element = document.createElement('div');
  element.setAttribute('data-tutorial', 'game-panel');
  element.style.transform = `translate3d(${left}px, ${top}px, 0)`;
  document.body.appendChild(element);
  return element;
}

function readInfoboxPanelTransform(): { left: number; top: number } {
  const panel = document.querySelector<HTMLElement>('[data-tutorial="infobox-panel"]');
  if (!panel) {
    throw new Error('Expected infobox panel to be rendered');
  }
  const parsed = parseTranslate3d(panel.style.transform);
  if (!parsed) {
    throw new Error(`Expected translate3d transform, received: ${panel.style.transform}`);
  }
  return parsed;
}

function expectedAttachedPosition(left: number, top: number): { left: number; top: number } {
  return computeStripScreenPosition({
    gamePanelLeft: left,
    gamePanelTop: top,
    stripScaledHeight: lastPanelHeight,
  });
}

function flushAnimationFrame(): void {
  const callbacks = rafCallbacks;
  rafCallbacks = [];
  for (const callback of callbacks) {
    callback(performance.now());
  }
}

describe('InfoBoxPanel attached position', () => {
  beforeEach(() => {
    rafCallbacks = [];
    vi.stubGlobal(
      'requestAnimationFrame',
      vi.fn((callback: FrameRequestCallback) => {
        rafCallbacks.push(callback);
        return rafCallbacks.length;
      }),
    );
    vi.stubGlobal('cancelAnimationFrame', vi.fn());
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
    document.querySelectorAll('[data-tutorial="game-panel"]').forEach((element) => {
      element.remove();
    });
    lastPanelHeight = 0;
  });

  it('positions attached infoboxes from the rendered GamePanel transform on mount', async () => {
    addGamePanel(800, 500);

    render(<InfoBoxPanel simulationState={STUB_STATE} pinTarget="inventory" />);

    await waitFor(() => {
      expect(readInfoboxPanelTransform()).toEqual(expectedAttachedPosition(800, 500));
    });
  });

  it('re-reads the rendered GamePanel transform on the next commit after it moves', async () => {
    const gamePanel = addGamePanel(800, 500);
    const { rerender } = render(<InfoBoxPanel simulationState={STUB_STATE} pinTarget="inventory" />);

    await waitFor(() => {
      expect(readInfoboxPanelTransform()).toEqual(expectedAttachedPosition(800, 500));
    });

    gamePanel.style.transform = 'translate3d(640px, 360px, 0)';

    // Any commit re-reads the rendered transform in a pre-paint layout
    // effect (no event needed) — e.g. the re-render every UI-scale change
    // produces via the tooltip context. Landing pre-paint is what lets the
    // strip's FLIP glide in lockstep with the GamePanel's resize animation.
    rerender(<InfoBoxPanel simulationState={{ ...STUB_STATE }} pinTarget="inventory" />);

    await waitFor(() => {
      expect(readInfoboxPanelTransform()).toEqual(expectedAttachedPosition(640, 360));
    });
  });

  it('live-follows rendered GamePanel movement while attached', async () => {
    const gamePanel = addGamePanel(800, 500);
    render(<InfoBoxPanel simulationState={STUB_STATE} pinTarget="inventory" />);

    await waitFor(() => {
      expect(readInfoboxPanelTransform()).toEqual(expectedAttachedPosition(800, 500));
    });

    gamePanel.style.transform = 'translate3d(500px, 320px, 0)';

    act(() => {
      window.dispatchEvent(new Event(TUTORIAL_PANEL_MOVED_EVENT));
    });

    expect(readInfoboxPanelTransform()).toEqual(expectedAttachedPosition(500, 320));
  });

  it('does not follow rendered GamePanel changes when detached', async () => {
    const gamePanel = addGamePanel(800, 500);
    render(<InfoBoxPanel simulationState={STUB_STATE} pinTarget="free" />);
    const transformBefore = readInfoboxPanelTransform();

    gamePanel.style.transform = 'translate3d(500px, 320px, 0)';

    act(() => {
      window.dispatchEvent(new Event(TUTORIAL_PANEL_RESIZED_EVENT));
      window.dispatchEvent(new Event(TUTORIAL_PANEL_MOVED_EVENT));
      flushAnimationFrame();
    });

    expect(readInfoboxPanelTransform()).toEqual(transformBefore);
  });
});

describe('InfoBoxPanel at the Chatbox', () => {
  afterEach(() => {
    cleanup();
    uiScaleRef.current = 1;
    lastPanelHeight = 0;
    lastPanelWidth = 0;
  });

  it('spreads the tiles over balanced rows no wider than the room, with their bottom on the anchor', () => {
    // 100px of room fits three 32px tiles a row (2px gaps): eight tiles take 3 + 3 + 2.
    render(
      <InfoBoxPanel
        simulationState={STUB_STATE}
        pinTarget="hud"
        chatboxAnchor={{ left: 8, bottom: 334, maxWidth: 100 }}
      />,
    );
    expect(lastPanelWidth).toBe(3 * 32 + 2 * 2);
    expect(lastPanelHeight).toBe(3 * 32 + 2 * 2);
    expect(readInfoboxPanelTransform()).toEqual({ left: 8, top: 334 - 100 });
  });

  it('lays the rows out in reading order, still growing upward from the anchor', () => {
    render(
      <InfoBoxPanel
        simulationState={STUB_STATE}
        pinTarget="hud"
        chatboxAnchor={{ left: 8, bottom: 334, maxWidth: 220 }}
      />,
    );
    // Room for six a row: eight tiles take 4 + 4, never 6 + 2.
    expect(lastPanelWidth).toBe(4 * 32 + 3 * 2);
    expect(lastPanelHeight).toBe(2 * 32 + 2);
    expect(document.querySelector('.infobox-strip--reading-order')).not.toBeNull();
  });

  it('measures the room in its own scaled pixels, so scaled tiles take more rows', () => {
    uiScaleRef.current = 2;
    render(
      <InfoBoxPanel
        simulationState={STUB_STATE}
        pinTarget="hud"
        chatboxAnchor={{ left: 8, bottom: 334, maxWidth: 200 }}
      />,
    );
    const tile = (32 * dampedInfoboxScale(2)) / 2;
    const gap = (2 * dampedInfoboxScale(2)) / 2;
    const columns = Math.floor((200 / 2 + gap) / (tile + gap));
    expect(lastPanelWidth * 2).toBeLessThanOrEqual(200);
    expect(lastPanelWidth).toBeCloseTo(columns * tile + (columns - 1) * gap, 5);
    expect(readInfoboxPanelTransform().top).toBeCloseTo(334 - lastPanelHeight * 2, 5);
  });

  it('keeps the free strip to rows of up to six, in OSRS order', () => {
    render(<InfoBoxPanel simulationState={STUB_STATE} pinTarget="free" />);
    expect(lastPanelWidth).toBe(6 * 32 + 5 * 2);
    expect(document.querySelector('.infobox-strip--reading-order')).toBeNull();
  });
});
