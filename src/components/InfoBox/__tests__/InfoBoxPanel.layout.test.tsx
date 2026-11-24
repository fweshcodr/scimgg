// @vitest-environment jsdom
// The real DraggablePanel and layout registry place the strip here (the sibling suites mock
// DraggablePanel out), and Alt+right-click needs the same event delivery as its own suites.
import { act, fireEvent, render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_GAME_PANEL_POSITION, type UIPosition } from '../../../hooks/usePersistedSettings';
import type { SimulationState } from '../../../types/simulation';
import { DraggablePanel } from '../../DraggablePanel';
import { GAME_PANEL_HEIGHT, GAME_PANEL_ICON_BAR_HEIGHT, GAME_PANEL_WIDTH } from '../../GamePanel';
import { PanelSnapRegistryProvider } from '../../snap/PanelSnapRegistry';
import { useTooltipScale } from '../../Tooltip';
import { TooltipProvider } from '../../Tooltip/TooltipContext';
import { InfoBoxPanel, infoboxContentScale } from '../InfoBoxPanel';

const infoboxCount = vi.hoisted(() => ({ current: 9 }));
vi.mock('../selectInfoboxes', () => ({
  selectInfoboxes: () =>
    Array.from({ length: infoboxCount.current }, (_, i) => ({
      id: `stub-${i}`,
      text: '0',
      tooltipTitle: 'Stub',
      tooltipDetail: 'Stub',
    })),
}));

const STATE = {} as SimulationState;

interface Frame {
  width: number;
  height: number;
  scale: number;
}

/**
 * The modern game panel body as GamePanel mounts it: the settings default in the corner,
 * kept out of the tab bar's band above the frame bottom.
 */
function GameBody({ frame }: { frame: Frame }) {
  const scale = useTooltipScale();
  return (
    <DraggablePanel
      dataTutorial="game-panel"
      defaultPosition={DEFAULT_GAME_PANEL_POSITION}
      position={DEFAULT_GAME_PANEL_POSITION}
      width={GAME_PANEL_WIDTH}
      height={GAME_PANEL_HEIGHT}
      scale={scale}
      viewportWidth={frame.width}
      viewportHeight={frame.height}
      exclusionRects={[
        {
          left: 0,
          top: frame.height - GAME_PANEL_ICON_BAR_HEIGHT * scale - 2,
          right: frame.width,
          bottom: frame.height,
        },
      ]}
    >
      <div />
    </DraggablePanel>
  );
}

function Workspace({
  frame,
  position = null,
  onPositionChange,
}: {
  frame: Frame;
  position?: UIPosition | null;
  onPositionChange?: (position: UIPosition | null) => void;
}) {
  return (
    <TooltipProvider initialScale={frame.scale}>
      <PanelSnapRegistryProvider>
        <GameBody frame={frame} />
        <InfoBoxPanel
          simulationState={STATE}
          clientLayoutMode="modern"
          pinTarget="free"
          position={position}
          onPositionChange={onPositionChange}
          // Deliberately NOT the body's position: the free default ignores where the
          // game panel was moved to and sits above its default slot.
          gamePanelPosition={{ x: 400, y: 300, anchorX: 'right', anchorY: 'bottom' }}
          viewportWidth={frame.width}
          viewportHeight={frame.height}
        />
      </PanelSnapRegistryProvider>
    </TooltipProvider>
  );
}

function renderWorkspace(frame: Frame, props: Omit<Parameters<typeof Workspace>[0], 'frame'> = {}) {
  const view = render(<Workspace frame={frame} {...props} />);
  const element = (id: string) => view.container.querySelector<HTMLElement>(`[data-tutorial="${id}"]`)!;
  /** The solved logical rect (before paint-only device-pixel rounding). */
  const rect = (id: string) => {
    const el = element(id);
    const [left, top] = /translate3d\(([-\d.e]+)px, ([-\d.e]+)px/.exec(el.style.transform)!.slice(1).map(Number);
    const content = el.firstElementChild as HTMLElement;
    const zoom = Number(content.style.zoom);
    const width = Number.parseFloat(content.style.width) * zoom;
    const height = Number.parseFloat(content.style.height) * zoom;
    return { left, top, right: left + width, bottom: top + height };
  };
  const rerender = async (next: Frame, nextProps = props) =>
    act(async () => view.rerender(<Workspace frame={next} {...nextProps} />));
  return { ...view, element, rect, rerender };
}

function expectAboveGamePanel(ws: ReturnType<typeof renderWorkspace>) {
  const strip = ws.rect('infobox-panel');
  const body = ws.rect('game-panel');
  expect(body.top - strip.bottom).toBeCloseTo(5, 6);
  expect(strip.left).toBeCloseTo(body.left, 6);
}

beforeEach(() => {
  infoboxCount.current = 9;
  vi.stubGlobal('devicePixelRatio', 1);
  Object.defineProperty(document, 'elementFromPoint', { configurable: true, value: () => null });
});
afterEach(() => {
  fireEvent.keyUp(window, { key: 'Alt' });
  fireEvent.blur(window);
  vi.unstubAllGlobals();
  Reflect.deleteProperty(document, 'elementFromPoint');
});

describe('the unmoved free infobox strip', () => {
  it.each([
    [1, 1600, 900],
    [1, 1920, 1080],
    [1.5, 1600, 900],
    [1.5, 1920, 1080],
  ])('sits just above the default game panel at UI scale %s in a %sx%s frame', async (scale, width, height) => {
    const onPositionChange = vi.fn();
    const ws = renderWorkspace({ scale, width, height }, { onPositionChange });
    await act(async () => {});
    expectAboveGamePanel(ws);
    expect(onPositionChange).not.toHaveBeenCalled();
  });

  it('stays above it through a UI-scale change and the window resizes after it', async () => {
    const onPositionChange = vi.fn();
    const ws = renderWorkspace({ scale: 1, width: 1600, height: 900 }, { onPositionChange });
    await act(async () => {});
    for (const frame of [
      { scale: 1.5, width: 1600, height: 900 },
      { scale: 1.5, width: 1920, height: 1080 },
      { scale: 1.5, width: 1280, height: 720 },
      { scale: 1, width: 1280, height: 720 },
      { scale: 1, width: 1920, height: 1080 },
    ]) {
      await ws.rerender(frame, { onPositionChange });
      expectAboveGamePanel(ws);
    }
    expect(onPositionChange).not.toHaveBeenCalled();
  });
});

describe('a free infobox strip the user moved', () => {
  const moved: UIPosition = { x: 300, y: 200, anchorX: 'left', anchorY: 'top' };

  it('keeps its placement, and Alt+right-click hands it back to the default', async () => {
    const onPositionChange = vi.fn();
    const ws = renderWorkspace({ scale: 1.5, width: 1600, height: 900 }, { position: moved, onPositionChange });
    await act(async () => {});
    expect(ws.rect('infobox-panel')).toMatchObject({ left: 300, top: 200 });

    await act(async () => {
      fireEvent.mouseDown(ws.element('infobox-panel'), { altKey: true, button: 2 });
    });
    // Cleared, not a saved copy of today's default: the default keeps following the scale.
    expect(onPositionChange).toHaveBeenCalledExactlyOnceWith(null);
    await ws.rerender({ scale: 1.5, width: 1600, height: 900 }, { position: null, onPositionChange });
    expectAboveGamePanel(ws);
  });
});

describe('free infobox strip wrapping', () => {
  const rowOf = (element: HTMLElement) => element.querySelector<HTMLElement>('.infobox-strip')!;

  it.each([
    [5, 1.5],
    [6, 1.5],
    [9, 1.5],
    [5, 2.5],
    [9, 3],
  ])('lays %i boxes out at scale %s in rows of up to six, whatever the painted box rounds to', async (count, scale) => {
    infoboxCount.current = count;
    const ws = renderWorkspace({ scale, width: 1600, height: 900 });
    await act(async () => {});
    const contentScale = infoboxContentScale(scale);
    const tile = 32 * contentScale;
    const gap = 2 * contentScale;
    const columns = Math.min(count, 6);
    const tilesExtent = columns * tile + (columns - 1) * gap;

    const strip = ws.element('infobox-panel');
    const zoomLayer = strip.firstElementChild as HTMLElement;
    // The panel's box is the tiles' exact extent; its painted box is rounded to device
    // pixels and may come out a fraction narrower.
    expect(Number.parseFloat(zoomLayer.style.width)).toBeCloseTo(tilesExtent, 9);
    const row = Number.parseFloat(rowOf(strip).style.width);
    // The row wraps at its own width, one gap wider than `columns` tiles and a tile short
    // of another, not at the rounded box.
    expect(row).toBeCloseTo(tilesExtent + gap, 9);
    expect(row).toBeGreaterThan(Number.parseFloat(zoomLayer.style.maxWidth));
    expect(row).toBeLessThan(tilesExtent + tile + gap);
  });
});

/**
 * Structural, as for the boss bar (overlays.test.tsx): no DOM here hit-tests CSS, so the
 * declaration is what fails if the strip ever starts taking clicks. Every placement relies on it:
 * the Chatbox rows run across the scene's play area, over ground the player clicks on.
 */
describe('infobox strip clicks', () => {
  it.each(['hud', 'inventory', 'free'] as const)('pass through the %s strip to the scene', (pinTarget) => {
    infoboxCount.current = 9;
    const view = render(
      <TooltipProvider initialScale={1}>
        <PanelSnapRegistryProvider>
          <InfoBoxPanel
            simulationState={STATE}
            clientLayoutMode="modern"
            pinTarget={pinTarget}
            chatboxAnchor={{ left: 4, bottom: 578, maxWidth: 511 }}
            gamePanelPosition={DEFAULT_GAME_PANEL_POSITION}
            viewportWidth={1270}
            viewportHeight={747}
          />
        </PanelSnapRegistryProvider>
      </TooltipProvider>,
    );
    const strip = view.container.querySelector<HTMLElement>('[data-tutorial="infobox-panel"]');
    const content = strip?.querySelector<HTMLElement>('.infobox-strip')?.parentElement;
    expect(strip?.style.pointerEvents).toBe('none');
    expect(content?.style.pointerEvents).toBe('none');
    for (const tile of view.container.querySelectorAll<HTMLElement>('.infobox-item')) {
      expect(getComputedStyle(tile).pointerEvents).not.toBe('auto');
    }
    view.unmount();
  });
});
