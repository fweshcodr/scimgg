// @vitest-environment happy-dom
import { act, fireEvent, render, renderHook, screen } from '@testing-library/react';
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ReplayFrameProvider } from '../../../contexts/ReplayFrameContext';
import { ReplayFrameStore } from '../../../core/replayFrameStore';
import { isSyntheticInput, runSyntheticInput } from '../../../input/inputProvenance';
import { lobbySnapshot } from '../../../test/helpers/encounterSnapshot';
import { stubMaxTouchPoints } from '../../../test/helpers/maxTouchPoints';
import type { SimulationState } from '../../../types/simulation';
import { InfoBoxOverlay } from '../../InfoBox/InfoBoxOverlay';
import { TooltipProvider } from '../TooltipContext';
import { TooltipOverlay } from '../TooltipOverlay';
import type { TooltipContent } from '../tooltipTypes';
import { useTooltip, useTooltipScale } from '../useTooltip';

let rafCallbacks: Map<number, FrameRequestCallback>;
let nextRafId: number;

function flushRaf(): void {
  const callbacks = Array.from(rafCallbacks.values());
  rafCallbacks.clear();
  act(() => {
    callbacks.forEach((callback) => {
      callback(0);
    });
  });
}

const TooltipTrigger: React.FC<{ enabled?: boolean; text?: string | null; label?: string }> = ({
  enabled = true,
  text = 'Test tooltip',
  label = 'Hover target',
}) => {
  const { bindTooltip } = useTooltip();
  const tooltipProps = enabled
    ? bindTooltip(text === null ? null : { lines: [{ spans: [{ text, color: '#fff' }] }] })
    : {};

  return (
    <button type="button" {...tooltipProps}>
      {label}
    </button>
  );
};

let capturedUpdateTooltip: ((el: HTMLElement | null, content: TooltipContent) => void) | null = null;
let capturedTriggerEl: HTMLElement | null = null;

const TooltipTriggerWithUpdate: React.FC<{ text?: string }> = ({ text = 'Test tooltip' }) => {
  const { bindTooltip, updateTooltip } = useTooltip();
  const ref = React.useRef<HTMLButtonElement>(null);
  capturedUpdateTooltip = updateTooltip;
  const content: TooltipContent = { lines: [{ spans: [{ text, color: '#fff' }] }] };
  const tooltipProps = bindTooltip(() => content);
  React.useEffect(() => {
    capturedTriggerEl = ref.current;
  });
  return (
    <button type="button" ref={ref} {...tooltipProps}>
      Hover target
    </button>
  );
};

/** A replay whose recorded context menu is open at its start, and closes at 100 ms. */
function recordedMenuOpenStore(): ReplayFrameStore {
  const store = new ReplayFrameStore();
  store.setHistory(
    [],
    [
      {
        kind: 'open',
        tMs: 0,
        state: {
          entries: [{ action: 'Recorded action' }],
          x: 10,
          y: 20,
          scale: 1,
          hoveredIndex: -1,
          submenuParentIndex: -1,
          hoveredSubmenuIndex: -1,
          submenuPosition: null,
        },
      },
      { kind: 'close', tMs: 100 },
    ],
  );
  return store;
}

describe('TooltipProvider', () => {
  beforeEach(() => {
    rafCallbacks = new Map();
    nextRafId = 1;
    vi.stubGlobal(
      'requestAnimationFrame',
      vi.fn((callback: FrameRequestCallback) => {
        const id = nextRafId++;
        rafCallbacks.set(id, callback);
        return id;
      }),
    );
    vi.stubGlobal(
      'cancelAnimationFrame',
      vi.fn((id: number) => {
        rafCallbacks.delete(id);
      }),
    );

    Object.defineProperty(document, 'elementFromPoint', {
      configurable: true,
      value: vi.fn(),
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it.each([
    { clientX: 400, clientY: 300, left: '600px', top: '524px' },
    { clientX: 590, clientY: 340, left: '796px', top: '536px' },
  ])('positions and clamps the complete tooltip inside a scaled frame at $clientX,$clientY', (point) => {
    render(
      <div className="game-viewport-frame" data-testid="frame">
        <TooltipProvider>
          <TooltipTrigger />
          <TooltipOverlay />
        </TooltipProvider>
      </div>,
    );
    const frame = screen.getByTestId('frame');
    Object.defineProperties(frame, {
      offsetWidth: { value: 1000 },
      offsetHeight: { value: 600 },
    });
    vi.spyOn(frame, 'getBoundingClientRect').mockReturnValue(new DOMRect(100, 50, 500, 300));
    const trigger = screen.getByRole('button', { name: 'Hover target' });
    vi.mocked(document.elementFromPoint).mockReturnValue(trigger);
    fireEvent.mouseMove(trigger, point);
    const card = screen.getByText('Test tooltip').parentElement?.parentElement;
    if (!card) throw new Error('Tooltip card missing');
    Object.defineProperties(card, { offsetWidth: { value: 200 }, offsetHeight: { value: 40 } });

    flushRaf();

    expect(card.parentElement).toBe(frame);
    expect(card).toHaveStyle({ position: 'absolute', left: point.left, top: point.top });
  });

  it('keeps external-control tooltips in the recorded workspace coordinate system', () => {
    render(
      <TooltipProvider>
        <div className="game-viewport-frame" data-testid="game" />
        <div className="workspace-presentation-surface" data-testid="workspace">
          <TooltipTrigger />
        </div>
        <TooltipOverlay />
      </TooltipProvider>,
    );
    const workspace = screen.getByTestId('workspace');
    Object.defineProperties(workspace, { offsetWidth: { value: 1000 }, offsetHeight: { value: 600 } });
    vi.spyOn(workspace, 'getBoundingClientRect').mockReturnValue(new DOMRect(100, 50, 500, 300));
    vi.spyOn(screen.getByTestId('game'), 'getBoundingClientRect').mockReturnValue(new DOMRect(100, 50, 200, 300));
    const trigger = screen.getByRole('button', { name: 'Hover target' });
    vi.mocked(document.elementFromPoint).mockReturnValue(trigger);
    fireEvent.mouseMove(trigger, { clientX: 550, clientY: 100 });
    const card = screen.getByText('Test tooltip').parentElement?.parentElement;
    if (!card) throw new Error('Tooltip card missing');
    Object.defineProperties(card, { offsetWidth: { value: 200 }, offsetHeight: { value: 40 } });
    flushRaf();
    expect(card.parentElement).toBe(workspace);
    expect(card).toHaveStyle({ left: '796px', top: '124px' });
  });

  it.each(['Share', 'Take Over'])('keeps %s viewer tooltips outside the scaled workspace', (label) => {
    render(
      <TooltipProvider forcedScale={2}>
        <div className="workspace-presentation-surface" data-testid="workspace">
          <TooltipTrigger label="Recorded control" text="Recorded tooltip" />
        </div>
        <div data-replay-viewer-chrome="">
          <TooltipTrigger label={label} />
        </div>
        <TooltipOverlay />
      </TooltipProvider>,
    );
    const workspace = screen.getByTestId('workspace');
    Object.defineProperties(workspace, { offsetWidth: { value: 1000 }, offsetHeight: { value: 600 } });
    vi.spyOn(workspace, 'getBoundingClientRect').mockReturnValue(new DOMRect(100, 50, 500, 300));
    const trigger = screen.getByRole('button', { name: label });
    vi.mocked(document.elementFromPoint).mockReturnValue(trigger);

    fireEvent.mouseMove(trigger, { clientX: window.innerWidth - 10, clientY: window.innerHeight - 10 });
    const card = screen.getByText('Test tooltip').parentElement?.parentElement;
    if (!card) throw new Error('Tooltip card missing');
    Object.defineProperties(card, { offsetWidth: { value: 200 }, offsetHeight: { value: 40 } });
    flushRaf();

    expect(card.parentElement).toBe(document.body);
    expect(card).toHaveStyle({
      position: 'fixed',
      left: `${window.innerWidth - 204}px`,
      top: `${window.innerHeight - 54}px`,
    });
    expect(screen.getByText('Test tooltip')).toHaveStyle({ fontSize: '18px' });

    const recorded = screen.getByRole('button', { name: 'Recorded control' });
    vi.mocked(document.elementFromPoint).mockReturnValue(recorded);
    fireEvent.mouseMove(recorded, { clientX: 150, clientY: 100 });
    const recordedCard = screen.getByText('Recorded tooltip').parentElement?.parentElement;
    expect(recordedCard?.parentElement).toBe(workspace);
    expect(recordedCard).toHaveStyle({ position: 'absolute' });
  });

  it.each(['Second tooltip', null])('updates a visible tooltip on a direct mousemove to content %s', (text) => {
    render(
      <TooltipProvider>
        <TooltipTrigger label="First target" />
        <TooltipTrigger label="Second target" text={text} />
        <TooltipOverlay />
      </TooltipProvider>,
    );
    const first = screen.getByRole('button', { name: 'First target' });
    const second = screen.getByRole('button', { name: 'Second target' });
    vi.mocked(document.elementFromPoint).mockReturnValue(first);
    fireEvent.mouseMove(first, { clientX: 10, clientY: 10 });
    expect(screen.getByText('Test tooltip')).toBeInTheDocument();

    vi.mocked(document.elementFromPoint).mockReturnValue(second);
    fireEvent.mouseMove(second, { clientX: 100, clientY: 10 });

    expect(screen.queryByText('Test tooltip')).toBeNull();
    if (text !== null) expect(screen.getByText(text)).toBeInTheDocument();
  });

  it('suppresses replay-hover tooltips while a recorded context menu is open', () => {
    const store = recordedMenuOpenStore();
    render(
      <ReplayFrameProvider store={store}>
        <TooltipProvider>
          <TooltipTrigger />
          <TooltipOverlay />
        </TooltipProvider>
      </ReplayFrameProvider>,
    );
    const trigger = screen.getByRole('button', { name: 'Hover target' });
    vi.mocked(document.elementFromPoint).mockReturnValue(trigger);

    runSyntheticInput(() => fireEvent.mouseMove(trigger, { clientX: 20, clientY: 30 }));

    expect(screen.queryByText('Test tooltip')).toBeNull();
    fireEvent.mouseMove(trigger, { clientX: 20, clientY: 30 });
    expect(screen.getByText('Test tooltip')).toBeInTheDocument();
    act(() => store.set(100, undefined));
    fireEvent.mouseMove(trigger, { clientX: 20, clientY: 30 });
    expect(screen.getByText('Test tooltip')).toBeInTheDocument();
  });

  it('hides a tooltip when the cursor is no longer over its trigger even if mouseleave was missed', () => {
    render(
      <TooltipProvider>
        <TooltipTrigger />
        <TooltipOverlay />
      </TooltipProvider>,
    );

    const trigger = screen.getByRole('button', { name: 'Hover target' });
    vi.spyOn(document, 'elementFromPoint').mockReturnValue(trigger);

    fireEvent.mouseEnter(trigger, { clientX: 10, clientY: 10 });
    flushRaf();

    expect(screen.getByText('Test tooltip')).toBeInTheDocument();

    vi.mocked(document.elementFromPoint).mockReturnValue(document.body);
    fireEvent.mouseMove(window, { clientX: 500, clientY: 500 });

    expect(screen.queryByText('Test tooltip')).toBeNull();
  });

  it('keeps a tooltip after pressing its trigger until the trigger loses its tooltip binding', () => {
    const { rerender } = render(
      <TooltipProvider>
        <TooltipTrigger />
        <TooltipOverlay />
      </TooltipProvider>,
    );

    const trigger = screen.getByRole('button', { name: 'Hover target' });
    vi.spyOn(document, 'elementFromPoint').mockReturnValue(trigger);

    fireEvent.mouseEnter(trigger, { clientX: 10, clientY: 10 });
    flushRaf();

    expect(screen.getByText('Test tooltip')).toBeInTheDocument();

    fireEvent.pointerDown(trigger, { clientX: 10, clientY: 10 });
    flushRaf();

    expect(screen.getByText('Test tooltip')).toBeInTheDocument();

    fireEvent.pointerUp(trigger, { clientX: 10, clientY: 10 });
    rerender(
      <TooltipProvider>
        <TooltipTrigger enabled={false} />
        <TooltipOverlay />
      </TooltipProvider>,
    );
    flushRaf();

    expect(screen.queryByText('Test tooltip')).toBeNull();

    fireEvent.mouseLeave(trigger);
    rerender(
      <TooltipProvider>
        <TooltipTrigger />
        <TooltipOverlay />
      </TooltipProvider>,
    );
    fireEvent.mouseEnter(screen.getByRole('button', { name: 'Hover target' }), { clientX: 10, clientY: 10 });
    flushRaf();

    expect(screen.getByText('Test tooltip')).toBeInTheDocument();
  });

  it('updateTooltip does not resurrect a tooltip after the cursor-tracking safety net hid it', () => {
    render(
      <TooltipProvider>
        <TooltipTriggerWithUpdate />
        <TooltipOverlay />
      </TooltipProvider>,
    );

    const trigger = screen.getByRole('button', { name: 'Hover target' });
    vi.spyOn(document, 'elementFromPoint').mockReturnValue(trigger);
    fireEvent.mouseEnter(trigger, { clientX: 10, clientY: 10 });
    flushRaf();
    expect(screen.getByText('Test tooltip')).toBeInTheDocument();

    // Safety net hides it: cursor moved off the trigger with no React mouseleave,
    // so the consumer's local isHovered flag stays stale-true.
    vi.mocked(document.elementFromPoint).mockReturnValue(document.body);
    fireEvent.mouseMove(window, { clientX: 500, clientY: 500 });
    expect(screen.queryByText('Test tooltip')).toBeNull();

    // A live content update from the still-"hovered" item must NOT bring it back.
    act(() => {
      capturedUpdateTooltip?.(capturedTriggerEl, { lines: [{ spans: [{ text: 'Resurrected', color: '#fff' }] }] });
    });
    flushRaf();
    expect(screen.queryByText('Resurrected')).toBeNull();
    expect(screen.queryByText('Test tooltip')).toBeNull();
  });

  it('updateTooltip refreshes content while the trigger still owns a visible tooltip', () => {
    render(
      <TooltipProvider>
        <TooltipTriggerWithUpdate />
        <TooltipOverlay />
      </TooltipProvider>,
    );

    const trigger = screen.getByRole('button', { name: 'Hover target' });
    vi.spyOn(document, 'elementFromPoint').mockReturnValue(trigger);
    fireEvent.mouseEnter(trigger, { clientX: 10, clientY: 10 });
    flushRaf();
    expect(screen.getByText('Test tooltip')).toBeInTheDocument();

    act(() => {
      capturedUpdateTooltip?.(capturedTriggerEl, { lines: [{ spans: [{ text: 'Updated detail', color: '#fff' }] }] });
    });
    flushRaf();
    expect(screen.getByText('Updated detail')).toBeInTheDocument();
  });

  describe('virtual triggers', () => {
    /**
     * A virtual trigger stands in for a `pointerPassthrough` overlay: it is
     * `pointer-events: none`, so `elementFromPoint` returns whatever is UNDER it and the
     * provider validates it by rect containment instead. Both fixtures below therefore
     * pin a rect and leave elementFromPoint pointing at the element beneath.
     */
    const VIRTUAL_RECT = { left: 40, top: 20, right: 72, bottom: 52 };

    function renderVirtualCase() {
      const api: { current: ReturnType<typeof useTooltip> | null } = { current: null };
      const Capture: React.FC = () => {
        api.current = useTooltip();
        return null;
      };

      render(
        <TooltipProvider>
          <TooltipTrigger />
          <Capture />
          <TooltipOverlay />
        </TooltipProvider>,
      );

      const beneath = screen.getByRole('button', { name: 'Hover target' });
      const virtualTrigger = document.createElement('div');
      document.body.appendChild(virtualTrigger);
      vi.spyOn(virtualTrigger, 'getBoundingClientRect').mockReturnValue({
        ...VIRTUAL_RECT,
        width: 32,
        height: 32,
        x: VIRTUAL_RECT.left,
        y: VIRTUAL_RECT.top,
        toJSON: () => ({}),
      } as DOMRect);
      vi.spyOn(document, 'elementFromPoint').mockReturnValue(beneath);

      const show = () => {
        act(() => {
          api.current?.showVirtualTooltip(virtualTrigger, {
            lines: [{ spans: [{ text: 'Virtual tooltip', color: '#fff' }] }],
          });
        });
        flushRaf();
      };

      return { api, beneath, virtualTrigger, show };
    }

    it('survives the cursor-tracking safety net that dismisses hit-testable triggers', () => {
      const { show } = renderVirtualCase();

      show();
      expect(screen.getByText('Virtual tooltip')).toBeInTheDocument();

      // Inside the rect, but elementFromPoint reports the element underneath — the exact
      // condition that hides an ordinary tooltip.
      fireEvent.mouseMove(window, { clientX: 50, clientY: 30 });

      expect(screen.getByText('Virtual tooltip')).toBeInTheDocument();
    });

    it('hides once the cursor leaves the trigger rect', () => {
      const { show } = renderVirtualCase();

      show();
      fireEvent.mouseMove(window, { clientX: 500, clientY: 500 });

      expect(screen.queryByText('Virtual tooltip')).toBeNull();
    });

    it('outranks a bound trigger underneath while the cursor is inside its rect', () => {
      const { beneath, show } = renderVirtualCase();

      show();
      fireEvent.mouseMove(window, { clientX: 50, clientY: 30 });
      fireEvent.mouseEnter(beneath, { clientX: 50, clientY: 30 });
      flushRaf();

      expect(screen.getByText('Virtual tooltip')).toBeInTheDocument();
      expect(screen.queryByText('Test tooltip')).toBeNull();
    });

    it('is not taken down by a mouseleave on the trigger underneath', () => {
      const { beneath, show } = renderVirtualCase();

      show();
      fireEvent.mouseMove(window, { clientX: 50, clientY: 30 });
      fireEvent.mouseLeave(beneath);

      expect(screen.getByText('Virtual tooltip')).toBeInTheDocument();
    });

    it('only releases for the trigger that owns it', () => {
      const { api, virtualTrigger, show } = renderVirtualCase();

      show();
      act(() => {
        api.current?.hideVirtualTooltip(document.createElement('div'));
      });
      expect(screen.getByText('Virtual tooltip')).toBeInTheDocument();

      act(() => {
        api.current?.hideVirtualTooltip(virtualTrigger);
      });
      expect(screen.queryByText('Virtual tooltip')).toBeNull();
    });
  });

  describe('touch input (the mobile client has no hover tooltips)', () => {
    function pointer(target: EventTarget, type: string, pointerType: string, x = 10, y = 10): void {
      fireEvent(target as Element, new PointerEvent(type, { bubbles: true, pointerType, clientX: x, clientY: y }));
    }

    /** What a browser sends for a tap whose pointerdown the page canceled. */
    function tap(target: Element, x = 10, y = 10): void {
      pointer(target, 'pointerdown', 'touch', x, y);
      pointer(target, 'pointerup', 'touch', x, y);
      fireEvent.mouseOver(target, { clientX: x, clientY: y });
      fireEvent.mouseEnter(target, { clientX: x, clientY: y });
      fireEvent.click(target, { clientX: x, clientY: y });
    }

    function renderWithApi() {
      const api: { current: ReturnType<typeof useTooltip> | null } = { current: null };
      const Capture: React.FC = () => {
        api.current = useTooltip();
        return null;
      };
      render(
        <TooltipProvider>
          <TooltipTrigger />
          <TooltipTrigger label="Other target" text="Other tooltip" />
          <Capture />
          <TooltipOverlay />
        </TooltipProvider>,
      );
      const trigger = screen.getByRole('button', { name: 'Hover target' });
      vi.spyOn(document, 'elementFromPoint').mockReturnValue(trigger);
      return { api, trigger, other: screen.getByRole('button', { name: 'Other target' }) };
    }

    it("shows nothing for a tap's compatibility mouseenter, and leaves nothing to get stuck", () => {
      const { api, trigger } = renderWithApi();

      tap(trigger);
      flushRaf();
      expect(screen.queryByText('Test tooltip')).toBeNull();

      // Closing a menu rechecks the hover; a finger is not resting at its last tap point.
      const moves = vi.fn();
      window.addEventListener('mousemove', moves);
      act(() => api.current?.recheckHover());
      flushRaf();
      window.removeEventListener('mousemove', moves);
      expect(moves).not.toHaveBeenCalled();
      expect(screen.queryByText('Test tooltip')).toBeNull();
    });

    it('gives a mouse its hover tooltips back the moment it moves', () => {
      const { trigger } = renderWithApi();

      tap(trigger);
      pointer(trigger, 'pointermove', 'mouse');
      fireEvent.mouseMove(trigger, { clientX: 10, clientY: 10 });
      flushRaf();

      expect(screen.getByText('Test tooltip')).toBeInTheDocument();
    });

    it('takes down a hover tooltip a finger lands while it is up', () => {
      const { trigger, other } = renderWithApi();

      fireEvent.mouseEnter(trigger, { clientX: 10, clientY: 10 });
      flushRaf();
      expect(screen.getByText('Test tooltip')).toBeInTheDocument();

      tap(other, 200, 200);

      expect(screen.queryByText('Test tooltip')).toBeNull();
      expect(screen.queryByText('Other tooltip')).toBeNull();
    });

    it("still shows the replay cursor's hover on a viewer who last touched", () => {
      const { trigger } = renderWithApi();

      tap(trigger);
      runSyntheticInput(() => fireEvent.mouseMove(trigger, { clientX: 10, clientY: 10 }));
      flushRaf();

      expect(screen.getByText('Test tooltip')).toBeInTheDocument();
    });

    it('places a tap tooltip beside the finger and keeps it through taps elsewhere', () => {
      const { api, other } = renderWithApi();
      const tile = document.createElement('div');
      document.body.appendChild(tile);

      act(() =>
        api.current?.showTapTooltip(tile, { lines: [{ spans: [{ text: 'Tap tooltip', color: '#fff' }] }] }, 300, 100),
      );
      const card = screen.getByText('Tap tooltip').parentElement?.parentElement;
      if (!card) throw new Error('Tooltip card missing');
      Object.defineProperties(card, { offsetWidth: { value: 200 }, offsetHeight: { value: 40 } });
      flushRaf();

      // On mobile: left of the finger, 24 px below it.
      expect(card).toHaveStyle({ left: '100px', top: '124px' });

      tap(other, 20, 300);
      expect(screen.getByText('Tap tooltip')).toBeInTheDocument();

      act(() => api.current?.hideVirtualTooltip(tile));
      expect(screen.queryByText('Tap tooltip')).toBeNull();
      tile.remove();
    });

    /** The real buff bar, whose Tick Counter tile sits at (40, 20, 32, 32), beside another control. */
    function renderBuffTile(wrap: (tree: React.ReactElement) => React.ReactElement = (tree) => tree) {
      const simulationState = {
        currentTick: 1,
        encounter: lobbySnapshot(),
        combatTimers: {
          statDecayLocks: {},
          deathChargeActiveTicks: 0,
          deathChargeCooldownTicks: 0,
          surgePotionCooldownTicks: 0,
        },
        markOfDarknessTicksRemaining: 0,
        poisonVarp: 0,
        stats: Object.fromEntries(
          ['attack', 'strength', 'defence', 'ranged', 'magic'].map((stat) => [stat, { current: 1, max: 1 }]),
        ),
      } as unknown as SimulationState;
      render(
        wrap(
          <TooltipProvider>
            <TooltipTrigger label="Other target" text="Other tooltip" />
            <InfoBoxOverlay simulationState={simulationState} />
            <TooltipOverlay />
          </TooltipProvider>,
        ),
      );
      const tile = screen.getByRole('img', { name: 'Tick Counter. Tick 1 of 4' });
      const other = screen.getByRole('button', { name: 'Other target' });
      vi.spyOn(tile, 'getBoundingClientRect').mockReturnValue(new DOMRect(40, 20, 32, 32));
      vi.spyOn(document, 'elementFromPoint').mockImplementation((x, y) =>
        x >= 40 && x < 72 && y >= 20 && y < 52 ? tile : other,
      );
      return { tile, other };
    }

    it('shows the replay cursor hovering a buff tile on a viewer who last touched elsewhere', () => {
      const { tile, other } = renderBuffTile();

      pointer(other, 'pointerdown', 'touch', 200, 200);
      pointer(other, 'pointerup', 'touch', 200, 200);
      // A replay's recorded cursor dispatches only mousemove; the tile's hover is decided a frame later.
      runSyntheticInput(() => fireEvent.mouseMove(document.body, { clientX: 50, clientY: 30 }));
      expect(isSyntheticInput()).toBe(false);
      flushRaf();

      expect(tile).toHaveClass('is-hovered');
      expect(screen.getByText('Tick Counter')).toBeInTheDocument();
      expect(screen.getByText('Tick 1 of 4')).toBeInTheDocument();

      runSyntheticInput(() => fireEvent.mouseMove(document.body, { clientX: 500, clientY: 500 }));
      flushRaf();
      expect(screen.queryByText('Tick Counter')).toBeNull();
      expect(tile).not.toHaveClass('is-hovered');
    });

    it.each([
      { latest: 'real', shown: true },
      { latest: 'replay', shown: false },
    ])("decides a buff tile's hover by its latest sample's provenance, here $latest", ({ latest, shown }) => {
      // The recorded menu is open, so only the viewer's own cursor may raise a hover tooltip.
      const { tile } = renderBuffTile((tree) => (
        <ReplayFrameProvider store={recordedMenuOpenStore()}>{tree}</ReplayFrameProvider>
      ));
      const replayMove = () =>
        runSyntheticInput(() => fireEvent.mouseMove(document.body, { clientX: 50, clientY: 30 }));
      const realMove = () => {
        pointer(tile, 'pointermove', 'mouse', 50, 30);
        fireEvent.mouseMove(document.body, { clientX: 50, clientY: 30 });
      };

      if (latest === 'real') {
        replayMove();
        realMove();
      } else {
        realMove();
        replayMove();
      }
      flushRaf();

      expect(screen.queryByText('Tick Counter') !== null).toBe(shown);
    });

    it("ignores a tap's unmarked compatibility mousemove over a buff tile", () => {
      const { tile, other } = renderBuffTile();

      pointer(other, 'pointerdown', 'touch', 200, 200);
      pointer(other, 'pointerup', 'touch', 200, 200);
      fireEvent.mouseMove(document.body, { clientX: 50, clientY: 30 });
      flushRaf();

      expect(screen.queryByText('Tick Counter')).toBeNull();
      expect(tile).not.toHaveClass('is-hovered');
    });

    it("takes a buff tile's tap tooltip down on another control's tap, without raising that control's", () => {
      const { other } = renderBuffTile();
      const otherPresses = vi.fn();
      other.addEventListener('pointerdown', otherPresses);

      // The strip passes pointers through, so the tile's tap targets what is beneath it.
      fireEvent(
        document.body,
        new PointerEvent('pointerdown', {
          bubbles: true,
          cancelable: true,
          pointerType: 'touch',
          isPrimary: true,
          clientX: 50,
          clientY: 30,
        }),
      );
      flushRaf();
      expect(screen.getByText('Tick Counter')).toBeInTheDocument();

      // An ordinary control does not cancel its tap, so the browser follows it with mouse events.
      tap(other, 200, 200);
      fireEvent.mouseMove(other, { clientX: 200, clientY: 200 });
      fireEvent.mouseLeave(other, { clientX: 200, clientY: 200 });
      flushRaf();
      expect(otherPresses).toHaveBeenCalledOnce();
      expect(screen.queryByText('Tick Counter')).toBeNull();
      expect(screen.queryByText('Other tooltip')).toBeNull();
    });

    it('reports a tap tooltip owned only while it is showing and opened by that tap', () => {
      const { api, trigger } = renderWithApi();
      const tile = document.createElement('div');
      document.body.appendChild(tile);
      const content = { lines: [{ spans: [{ text: 'Tap tooltip', color: '#fff' }] }] };

      act(() => api.current?.showTapTooltip(tile, content, 300, 100));
      expect(api.current?.ownsTapTooltip(tile)).toBe(true);
      expect(api.current?.ownsTapTooltip(trigger)).toBe(false);

      // Another owner hiding it, as a menu opening or a tab change does.
      act(() => api.current?.hideTooltip());
      expect(api.current?.ownsTapTooltip(tile)).toBe(false);

      // A hover of the same element is not a tap tooltip.
      act(() => api.current?.showVirtualTooltip(tile, content));
      expect(api.current?.ownsTapTooltip(tile)).toBe(false);
      tile.remove();
    });

    describe('a pen', () => {
      // A touchscreen, so the pen writes on the screen (see isTouchPointer); the last case takes it away.
      let restoreTouchPoints = () => {};
      beforeEach(() => {
        restoreTouchPoints = stubMaxTouchPoints(10);
      });
      afterEach(() => {
        restoreTouchPoints();
      });

      /** A pen hovering above `target`, as S Pen Air view, Apple Pencil or a drawing tablet reports it. */
      function hoverPen(target: Element, x = 10, y = 10): void {
        pointer(target, 'pointermove', 'pen', x, y);
        fireEvent.mouseEnter(target, { clientX: x, clientY: y });
        fireEvent.mouseMove(target, { clientX: x, clientY: y });
      }

      it('raises no hover tooltip as it hovers, and gives a mouse its tooltips back once that moves', () => {
        const { trigger } = renderWithApi();

        hoverPen(trigger);
        flushRaf();
        expect(screen.queryByText('Test tooltip')).toBeNull();

        pointer(trigger, 'pointermove', 'mouse');
        fireEvent.mouseMove(trigger, { clientX: 10, clientY: 10 });
        flushRaf();
        expect(screen.getByText('Test tooltip')).toBeInTheDocument();
      });

      it("taps a buff tile's tooltip up as a finger does", () => {
        const { tile } = renderBuffTile();

        const down = new PointerEvent('pointerdown', {
          bubbles: true,
          cancelable: true,
          pointerType: 'pen',
          isPrimary: true,
          clientX: 50,
          clientY: 30,
        });
        fireEvent(document.body, down);
        flushRaf();

        expect(down.defaultPrevented).toBe(true);
        expect(screen.getByText('Tick Counter')).toBeInTheDocument();
        expect(tile).not.toHaveClass('is-hovered');
      });

      it('does not hover a buff tile', () => {
        const { tile } = renderBuffTile();

        pointer(tile, 'pointermove', 'pen', 50, 30);
        fireEvent.mouseMove(document.body, { clientX: 50, clientY: 30 });
        flushRaf();

        expect(tile).not.toHaveClass('is-hovered');
        expect(screen.queryByText('Tick Counter')).toBeNull();
      });

      it('hovers as a mouse on a separate pad (no touchscreen), and taps no buff tile', () => {
        restoreTouchPoints();
        restoreTouchPoints = stubMaxTouchPoints(0);
        const { tile } = renderBuffTile();

        pointer(tile, 'pointermove', 'pen', 50, 30);
        fireEvent.mouseMove(document.body, { clientX: 50, clientY: 30 });
        flushRaf();
        expect(tile).toHaveClass('is-hovered');
        expect(screen.getByText('Tick Counter')).toBeInTheDocument();

        const down = new PointerEvent('pointerdown', {
          bubbles: true,
          cancelable: true,
          pointerType: 'pen',
          isPrimary: true,
          clientX: 50,
          clientY: 30,
        });
        fireEvent(document.body, down);
        expect(down.defaultPrevented).toBe(false);
      });
    });
  });

  it('gives the hover-recheck mousemove the buttons still physically held', () => {
    let recheckHover: (() => void) | null = null;
    const RecheckProbe: React.FC = () => {
      recheckHover = useTooltip().recheckHover;
      return null;
    };
    render(
      <TooltipProvider>
        <RecheckProbe />
      </TooltipProvider>,
    );

    const seen: number[] = [];
    const listener = (e: Event) => seen.push((e as MouseEvent).buttons);
    window.addEventListener('mousemove', listener);

    vi.spyOn(document, 'elementFromPoint').mockReturnValue(document.body);
    fireEvent.mouseDown(window, { button: 1, buttons: 4, clientX: 40, clientY: 40 });

    act(() => recheckHover?.());
    flushRaf();

    fireEvent.mouseUp(window, { button: 1, buttons: 0, clientX: 40, clientY: 40 });
    act(() => recheckHover?.());
    flushRaf();

    window.removeEventListener('mousemove', listener);
    expect(seen).toEqual([4, 0]);
  });
});

describe('TooltipScaleContext split', () => {
  it('useTooltipScale returns the provider scale and defaults to 1', () => {
    const { result } = renderHook(() => useTooltipScale(), {
      wrapper: ({ children }) => <TooltipProvider>{children}</TooltipProvider>,
    });
    expect(result.current).toBe(1);
  });

  it('useTooltipScale reflects a non-default initialScale', () => {
    const { result } = renderHook(() => useTooltipScale(), {
      wrapper: ({ children }) => <TooltipProvider initialScale={1.5}>{children}</TooltipProvider>,
    });
    expect(result.current).toBe(1.5);
  });

  it('synchronizes when initialScale changes after mount', () => {
    const ScaleReadout: React.FC = () => <span data-testid="scale">{useTooltipScale()}</span>;
    const tree = (initialScale: number) => (
      <TooltipProvider initialScale={initialScale}>
        <ScaleReadout />
      </TooltipProvider>
    );
    const { rerender } = render(tree(1));

    rerender(tree(3 / 2));

    expect(screen.getByTestId('scale').textContent).toBe('1.5');
  });

  it('useTooltipScale throws outside a provider', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    expect(() => renderHook(() => useTooltipScale())).toThrow(/TooltipProvider/);
    spy.mockRestore();
  });

  it('useTooltip throws outside a provider', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    expect(() => renderHook(() => useTooltip())).toThrow(/TooltipProvider/);
    spy.mockRestore();
  });

  it('scale changes re-render scale consumers but NOT bindTooltip-only consumers', () => {
    let apiRenders = 0;
    let scaleRenders = 0;
    let setScaleFn: (s: number) => void = () => {};

    const ApiConsumer: React.FC = () => {
      apiRenders++;
      // Reads ONLY the stable API context (setScale/bindTooltip), never scale.
      const { setScale } = useTooltip();
      setScaleFn = setScale;
      return <div data-testid="api" />;
    };
    const ScaleConsumer: React.FC = () => {
      scaleRenders++;
      const scale = useTooltipScale();
      return <div data-testid="scale">{scale}</div>;
    };

    render(
      <TooltipProvider>
        <ApiConsumer />
        <ScaleConsumer />
      </TooltipProvider>,
    );

    expect(apiRenders).toBe(1);
    expect(scaleRenders).toBe(1);
    expect(screen.getByTestId('scale').textContent).toBe('1');

    act(() => {
      setScaleFn(1.5);
    });

    // The scale consumer picked up the new value...
    expect(screen.getByTestId('scale').textContent).toBe('1.5');
    expect(scaleRenders).toBe(2);
    // ...but the bindTooltip-only consumer never re-rendered. This isolation
    // is the whole point of splitting scale out of the API context: a rapid
    // Alt+scroll burst must not churn every tooltip-bound control in the app.
    expect(apiRenders).toBe(1);
  });
});

describe('forcedScale', () => {
  // Replay playback pins it to the RECORDER's UI scale, which the test below is the reason
  // for: `initialScale` cannot carry a scale that arrives after mount, and playback always
  // starts after this provider has mounted.
  function readScale(forcedScale?: number, initialScale = 1) {
    return renderHook(() => ({ scale: useTooltipScale(), api: useTooltip() }), {
      wrapper: ({ children }) => (
        <TooltipProvider forcedScale={forcedScale} initialScale={initialScale}>
          {children}
        </TooltipProvider>
      ),
    });
  }

  it('overrides initialScale', () => {
    const { result } = readScale(1.75, 1);
    expect(result.current.scale).toBe(1.75);
  });

  it('makes setScale inert instead of merely ignoring its result', () => {
    const onScaleChange = vi.fn();
    const { result } = renderHook(() => ({ scale: useTooltipScale(), api: useTooltip() }), {
      wrapper: ({ children }) => (
        <TooltipProvider forcedScale={1.75} onScaleChange={onScaleChange}>
          {children}
        </TooltipProvider>
      ),
    });

    act(() => result.current.api.setScale(3));

    expect(result.current.scale).toBe(1.75);
    expect(onScaleChange).not.toHaveBeenCalled();
  });

  it('falls back to its own state when not forced', () => {
    const { result } = readScale(undefined, 1);

    act(() => result.current.api.setScale(2.5));

    expect(result.current.scale).toBe(2.5);
  });

  it("does not become the viewer's own scale when it lifts", () => {
    // Grid can mount inside an already-playing replay. If
    // the forced scale were also handed to `initialScale`, it would seed `ownScale` and
    // strand the viewer at the recorder's scale the moment playback ended.
    const ScaleReadout: React.FC = () => <span data-testid="scale">{useTooltipScale()}</span>;
    const tree = (forcedScale?: number) => (
      <TooltipProvider initialScale={1} forcedScale={forcedScale}>
        <ScaleReadout />
      </TooltipProvider>
    );

    const { rerender } = render(tree(2.5));
    expect(screen.getByTestId('scale').textContent).toBe('2.5');

    rerender(tree(undefined));
    expect(screen.getByTestId('scale').textContent).toBe('1');
  });

  it('keeps forced scale authoritative while initialScale changes', () => {
    const ScaleReadout: React.FC = () => <span data-testid="scale">{useTooltipScale()}</span>;
    const tree = (initialScale: number, forcedScale?: number) => (
      <TooltipProvider initialScale={initialScale} forcedScale={forcedScale}>
        <ScaleReadout />
      </TooltipProvider>
    );
    const readScaleText = () => screen.getByTestId('scale').textContent;

    const { rerender } = render(tree(1));
    expect(readScaleText()).toBe('1');

    rerender(tree(2));
    expect(readScaleText()).toBe('2');

    rerender(tree(3, 2));
    expect(readScaleText()).toBe('2');

    rerender(tree(3));
    expect(readScaleText()).toBe('3');
  });
});
