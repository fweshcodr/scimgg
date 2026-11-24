// @vitest-environment happy-dom
import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { runSyntheticInput } from '../../../input/inputProvenance';
import { stubMaxTouchPoints } from '../../../test/helpers/maxTouchPoints';
import type { SimulationState } from '../../../types/simulation';
import type { TooltipContent } from '../../Tooltip';
import { InfoBoxOverlay } from '../InfoBoxOverlay';
import type { InfoBoxData } from '../infoboxTypes';

/**
 * The provider's ownership, as far as the overlay can see it: whose tap tooltip is up. A
 * hover elsewhere or a release of its trigger ends it, and `hideTooltip` from another owner
 * (a menu opening, a tab change) is `externalHide`.
 */
const tooltipMocks = vi.hoisted(() => {
  const mocks = {
    selectInfoboxesResult: [] as InfoBoxData[],
    tapOwner: null as HTMLElement | null,
    showVirtualTooltip: vi.fn((trigger: HTMLElement, _content: TooltipContent) => {
      if (trigger !== mocks.tapOwner) mocks.tapOwner = null;
    }),
    showTapTooltip: vi.fn((trigger: HTMLElement, _content: TooltipContent, _clientX: number, _clientY: number) => {
      mocks.tapOwner = trigger;
    }),
    ownsTapTooltip: (trigger: HTMLElement) => mocks.tapOwner === trigger,
    hideVirtualTooltip: vi.fn((trigger: HTMLElement) => {
      if (trigger === mocks.tapOwner) mocks.tapOwner = null;
    }),
    externalHide: () => {
      mocks.tapOwner = null;
    },
    setSelectInfoboxesResult: (infoboxes: InfoBoxData[]) => {
      mocks.selectInfoboxesResult = infoboxes;
    },
  };
  return mocks;
});

vi.mock('../../Tooltip', () => ({
  MOBILE_TAP_TOOLTIP_MS: 4800,
  TOOLTIP_COLORS: {
    action: '#fff',
    item: '#f5c080',
  },
  useTooltip: () => ({
    showVirtualTooltip: tooltipMocks.showVirtualTooltip,
    showTapTooltip: tooltipMocks.showTapTooltip,
    ownsTapTooltip: tooltipMocks.ownsTapTooltip,
    hideVirtualTooltip: tooltipMocks.hideVirtualTooltip,
  }),
}));

vi.mock('../selectInfoboxes', () => ({
  selectInfoboxes: () => tooltipMocks.selectInfoboxesResult,
}));

const createInfobox = (text: string): InfoBoxData => ({
  id: `tick-counter-${text}`,
  text,
  textColor: '#fff',
  tooltipTitle: 'Tick Counter',
  tooltipDetail: 'Tick 0 of 4',
});

/**
 * The tiles are `pointer-events: none`, so hover is a cursor-position hit test rather
 * than a mouseenter. Both halves have to be faked: the tile's rect (happy-dom lays
 * nothing out, so every getBoundingClientRect is 0x0) and `elementFromPoint`, which the
 * overlay probes to confirm the tile is the frontmost thing painted at the cursor.
 */
function placeTile(tile: HTMLElement, rect: { x: number; y: number; size: number }): void {
  vi.spyOn(tile, 'getBoundingClientRect').mockReturnValue({
    left: rect.x,
    top: rect.y,
    right: rect.x + rect.size,
    bottom: rect.y + rect.size,
    width: rect.size,
    height: rect.size,
    x: rect.x,
    y: rect.y,
    toJSON: () => ({}),
  } as DOMRect);
}

/** A real mouse move: its pointer event, then the mouse event. */
function moveMouse(x: number, y: number): void {
  fireEvent(window, new PointerEvent('pointermove', { pointerType: 'mouse', clientX: x, clientY: y }));
  fireEvent.mouseMove(window, { clientX: x, clientY: y });
  act(() => {
    vi.advanceTimersToNextFrame();
  });
}

describe('InfoBoxOverlay', () => {
  beforeEach(() => {
    tooltipMocks.setSelectInfoboxesResult([createInfobox('0')]);
  });

  afterEach(() => {
    tooltipMocks.showVirtualTooltip.mockClear();
    tooltipMocks.showTapTooltip.mockClear();
    tooltipMocks.hideVirtualTooltip.mockClear();
    tooltipMocks.externalHide();
  });

  describe('virtual hover', () => {
    beforeEach(() => {
      vi.useFakeTimers();
    });

    afterEach(() => {
      vi.useRealTimers();
      vi.restoreAllMocks();
    });

    it('raises the tooltip for the tile under the cursor without any mouse event on the tile', () => {
      render(<InfoBoxOverlay simulationState={{} as SimulationState} />);
      const item = screen.getByRole('img', { name: 'Tick Counter. Tick 0 of 4' });
      placeTile(item, { x: 40, y: 20, size: 32 });
      vi.spyOn(document, 'elementFromPoint').mockReturnValue(item);

      moveMouse(50, 30);

      expect(tooltipMocks.showVirtualTooltip).toHaveBeenCalledWith(item, {
        lines: [
          { spans: [{ text: 'Tick Counter', color: '#f5c080' }] },
          { spans: [{ text: 'Tick 0 of 4', color: '#fff' }] },
        ],
      });
      expect(item).toHaveClass('is-hovered');
    });

    it('releases the tooltip once the cursor leaves the tile', () => {
      render(<InfoBoxOverlay simulationState={{} as SimulationState} />);
      const item = screen.getByRole('img', { name: 'Tick Counter. Tick 0 of 4' });
      placeTile(item, { x: 40, y: 20, size: 32 });
      vi.spyOn(document, 'elementFromPoint').mockReturnValue(item);

      moveMouse(50, 30);
      moveMouse(400, 300);

      expect(tooltipMocks.hideVirtualTooltip).toHaveBeenCalledWith(item);
      expect(item).not.toHaveClass('is-hovered');
    });

    it('stays silent when something else is painted over the tile', () => {
      render(<InfoBoxOverlay simulationState={{} as SimulationState} />);
      const item = screen.getByRole('img', { name: 'Tick Counter. Tick 0 of 4' });
      placeTile(item, { x: 40, y: 20, size: 32 });
      vi.spyOn(document, 'elementFromPoint').mockReturnValue(document.createElement('div'));

      moveMouse(50, 30);

      expect(tooltipMocks.showVirtualTooltip).not.toHaveBeenCalled();
      expect(item).not.toHaveClass('is-hovered');
    });

    it('hands the provider the same content object while the text is unchanged', () => {
      render(<InfoBoxOverlay simulationState={{} as SimulationState} />);
      const item = screen.getByRole('img', { name: 'Tick Counter. Tick 0 of 4' });
      placeTile(item, { x: 40, y: 20, size: 32 });
      vi.spyOn(document, 'elementFromPoint').mockReturnValue(item);

      moveMouse(50, 30);
      moveMouse(52, 31);

      expect(tooltipMocks.showVirtualTooltip).toHaveBeenCalledTimes(2);
      const [, first] = tooltipMocks.showVirtualTooltip.mock.calls[0];
      const [, second] = tooltipMocks.showVirtualTooltip.mock.calls[1];
      expect(second).toBe(first);
    });

    it("follows the replay cursor's mousemove, which has no pointer event", () => {
      render(<InfoBoxOverlay simulationState={{} as SimulationState} />);
      const item = screen.getByRole('img', { name: 'Tick Counter. Tick 0 of 4' });
      placeTile(item, { x: 40, y: 20, size: 32 });
      vi.spyOn(document, 'elementFromPoint').mockReturnValue(item);

      runSyntheticInput(() => fireEvent.mouseMove(window, { clientX: 50, clientY: 30 }));
      act(() => {
        vi.advanceTimersToNextFrame();
      });

      expect(tooltipMocks.showVirtualTooltip).toHaveBeenCalledWith(item, expect.anything());
    });

    describe("the viewer's own replay chrome over the tile", () => {
      const originalElementsFromPoint = Object.getOwnPropertyDescriptor(document, 'elementsFromPoint');
      let chrome: HTMLElement;
      let item: HTMLElement;

      beforeEach(() => {
        render(<InfoBoxOverlay simulationState={{} as SimulationState} />);
        item = screen.getByRole('img', { name: 'Tick Counter. Tick 0 of 4' });
        placeTile(item, { x: 40, y: 20, size: 32 });
        chrome = document.createElement('div');
        chrome.setAttribute('data-replay-viewer-chrome', '');
        document.body.appendChild(chrome);
        vi.spyOn(document, 'elementFromPoint').mockReturnValue(chrome);
        Object.defineProperty(document, 'elementsFromPoint', { configurable: true, value: () => [chrome, item] });
      });

      afterEach(() => {
        chrome.remove();
        if (originalElementsFromPoint) Object.defineProperty(document, 'elementsFromPoint', originalElementsFromPoint);
        else Reflect.deleteProperty(document, 'elementsFromPoint');
      });

      it("does not hide the recorded cursor's hover, which the recorder had no chrome over", () => {
        runSyntheticInput(() => fireEvent.mouseMove(window, { clientX: 50, clientY: 30 }));
        act(() => {
          vi.advanceTimersToNextFrame();
        });

        expect(tooltipMocks.showVirtualTooltip).toHaveBeenCalledWith(item, expect.anything());
        expect(item).toHaveClass('is-hovered');
      });

      it("still hides the viewer's own cursor's hover", () => {
        moveMouse(50, 30);

        expect(tooltipMocks.showVirtualTooltip).not.toHaveBeenCalled();
      });
    });
  });

  describe('touch: tap to toggle, as the mobile buff bar does', () => {
    beforeEach(() => {
      vi.useFakeTimers();
      tooltipMocks.setSelectInfoboxesResult([createInfobox('0'), createInfobox('1')]);
    });

    let restoreTouchPoints = () => {};

    afterEach(() => {
      vi.useRealTimers();
      vi.restoreAllMocks();
      restoreTouchPoints();
      restoreTouchPoints = () => {};
    });

    function renderTiles() {
      const world = document.createElement('div');
      document.body.appendChild(world);
      const worldTouches = vi.fn();
      world.addEventListener('pointerdown', worldTouches);
      const view = render(<InfoBoxOverlay simulationState={{} as SimulationState} />);
      const [first, second] = screen.getAllByRole('img', { name: 'Tick Counter. Tick 0 of 4' });
      placeTile(first, { x: 40, y: 20, size: 32 });
      placeTile(second, { x: 80, y: 20, size: 32 });
      vi.spyOn(document, 'elementFromPoint').mockImplementation((x) => (x < 72 ? first : second));
      // The strip passes pointers through, so a touch on it targets the world beneath.
      const tap = (x: number, y = 30) => {
        const down = new PointerEvent('pointerdown', {
          bubbles: true,
          cancelable: true,
          pointerType: 'touch',
          isPrimary: true,
          clientX: x,
          clientY: y,
        });
        fireEvent(world, down);
        return down;
      };
      return {
        world,
        first,
        second,
        tap,
        worldTouches,
        cleanup: () => {
          view.unmount();
          world.remove();
        },
      };
    }

    it('shows the tapped tile beside the finger and keeps the tap from the world', () => {
      const { first, tap, worldTouches, cleanup } = renderTiles();

      const down = tap(50);

      expect(tooltipMocks.showTapTooltip).toHaveBeenCalledWith(first, expect.anything(), 50, 30);
      expect(down.defaultPrevented).toBe(true);
      expect(worldTouches).not.toHaveBeenCalled();
      cleanup();
    });

    it('hides it on a second tap of the same tile, and moves it on a tap of another', () => {
      const { first, second, tap, cleanup } = renderTiles();

      tap(50);
      tap(90);
      expect(tooltipMocks.showTapTooltip).toHaveBeenLastCalledWith(second, expect.anything(), 90, 30);
      expect(tooltipMocks.hideVirtualTooltip).not.toHaveBeenCalled();

      tap(90);
      expect(tooltipMocks.hideVirtualTooltip).toHaveBeenCalledWith(second);
      expect(tooltipMocks.showTapTooltip).toHaveBeenCalledTimes(2);

      // Toggled off, the next tap shows it again.
      tap(50);
      expect(tooltipMocks.showTapTooltip).toHaveBeenLastCalledWith(first, expect.anything(), 50, 30);
      cleanup();
    });

    it('removes itself after the native 240 client cycles, counted from the latest tap', () => {
      const { second, tap, cleanup } = renderTiles();

      tap(50);
      act(() => vi.advanceTimersByTime(3000));
      tap(90);
      act(() => vi.advanceTimersByTime(4799));
      expect(tooltipMocks.hideVirtualTooltip).not.toHaveBeenCalled();
      act(() => vi.advanceTimersByTime(1));
      expect(tooltipMocks.hideVirtualTooltip).toHaveBeenCalledExactlyOnceWith(second);
      cleanup();
    });

    it('dismisses it on a tap anywhere else, and lets that tap through', () => {
      const { first, tap, worldTouches, cleanup } = renderTiles();

      tap(50);
      const elsewhere = tap(400, 300);

      expect(tooltipMocks.hideVirtualTooltip).toHaveBeenCalledExactlyOnceWith(first);
      expect(elsewhere.defaultPrevented).toBe(false);
      expect(worldTouches).toHaveBeenCalledOnce();

      // Dismissed, not toggled: the next tap on the tile shows it again.
      tap(50);
      expect(tooltipMocks.showTapTooltip).toHaveBeenCalledTimes(2);
      cleanup();
    });

    it('dismisses it on a tap of a tile something else is painted over, and lets that tap through', () => {
      const { first, second, tap, worldTouches, cleanup } = renderTiles();
      const cover = document.createElement('div');
      vi.spyOn(document, 'elementFromPoint').mockImplementation((x) => (x < 72 ? first : cover));

      tap(50);
      const covered = tap(90);

      expect(tooltipMocks.hideVirtualTooltip).toHaveBeenCalledExactlyOnceWith(first);
      expect(tooltipMocks.showTapTooltip).not.toHaveBeenCalledWith(second, expect.anything(), 90, 30);
      expect(covered.defaultPrevented).toBe(false);
      expect(worldTouches).toHaveBeenCalledOnce();
      cleanup();
    });

    it.each([
      { where: 'on a touchscreen, as a finger does', maxTouchPoints: 10, tapped: true },
      { where: 'on a separate pad (no touchscreen), not at all: it hovers instead', maxTouchPoints: 0, tapped: false },
    ])('lets a pen tap a tile $where', ({ maxTouchPoints, tapped }) => {
      restoreTouchPoints = stubMaxTouchPoints(maxTouchPoints);
      const { first, world, worldTouches, cleanup } = renderTiles();

      const press = new PointerEvent('pointerdown', {
        bubbles: true,
        cancelable: true,
        pointerType: 'pen',
        isPrimary: true,
        clientX: 50,
        clientY: 30,
      });
      fireEvent(world, press);

      if (tapped) expect(tooltipMocks.showTapTooltip).toHaveBeenCalledWith(first, expect.anything(), 50, 30);
      else expect(tooltipMocks.showTapTooltip).not.toHaveBeenCalled();
      expect(press.defaultPrevented).toBe(tapped);
      expect(worldTouches).toHaveBeenCalledTimes(tapped ? 0 : 1);
      cleanup();
    });

    it.each(['mouse', 'pen'])('dismisses it on a %s press elsewhere, and lets that press through', (pointerType) => {
      const { first, world, worldTouches, tap, cleanup } = renderTiles();

      tap(50);
      const press = new PointerEvent('pointerdown', {
        bubbles: true,
        cancelable: true,
        pointerType,
        isPrimary: true,
        clientX: 400,
        clientY: 300,
      });
      fireEvent(world, press);

      expect(tooltipMocks.hideVirtualTooltip).toHaveBeenCalledExactlyOnceWith(first);
      expect(press.defaultPrevented).toBe(false);
      expect(worldTouches).toHaveBeenCalledOnce();
      cleanup();
    });

    it('keeps it through a mouse press on the tapped tile itself', () => {
      const { tap, cleanup } = renderTiles();

      tap(50);
      fireEvent(
        document.body,
        new PointerEvent('pointerdown', {
          bubbles: true,
          pointerType: 'mouse',
          isPrimary: true,
          clientX: 50,
          clientY: 30,
        }),
      );

      expect(tooltipMocks.hideVirtualTooltip).not.toHaveBeenCalled();
      cleanup();
    });

    it('reopens it on a tap of its tile after another owner hid it, rather than toggling it off', () => {
      const { first, tap, cleanup } = renderTiles();

      tap(50);
      // A context menu opening or a tab change calls the provider's hideTooltip.
      tooltipMocks.externalHide();
      const again = tap(50);

      expect(tooltipMocks.showTapTooltip).toHaveBeenCalledTimes(2);
      expect(tooltipMocks.showTapTooltip).toHaveBeenLastCalledWith(first, expect.anything(), 50, 30);
      expect(tooltipMocks.hideVirtualTooltip).not.toHaveBeenCalled();
      expect(again.defaultPrevented).toBe(true);
      cleanup();
    });

    it("is not raised again by a tap's compatibility mouse events, only by a real mouse's move", () => {
      const { first, tap, cleanup } = renderTiles();

      tap(50);
      tap(400, 300);
      // The tap elsewhere was not canceled, so the browser follows it with mouse events there,
      // and the tile's own tap with a mousemove over it.
      fireEvent.mouseMove(window, { clientX: 400, clientY: 300 });
      fireEvent.mouseMove(window, { clientX: 50, clientY: 30 });
      act(() => {
        vi.advanceTimersToNextFrame();
      });
      expect(tooltipMocks.showVirtualTooltip).not.toHaveBeenCalled();

      moveMouse(50, 30);
      expect(tooltipMocks.showVirtualTooltip).toHaveBeenCalledExactlyOnceWith(first, expect.anything());
      cleanup();
    });

    it("swallows the browser's click for the tap, so nothing underneath acts on it", () => {
      const { tap, cleanup } = renderTiles();
      const clicks = vi.fn();
      document.body.addEventListener('click', clicks);

      tap(50);
      fireEvent.click(document.body, { detail: 1 });
      fireEvent.click(document.body, { detail: 1 });

      document.body.removeEventListener('click', clicks);
      expect(clicks).toHaveBeenCalledOnce();
      cleanup();
    });
  });

  it('lays the tiles out as the mobile buff bar: bottom-right cell first, upward, twelve at most', () => {
    tooltipMocks.setSelectInfoboxesResult(Array.from({ length: 14 }, (_, index) => createInfobox(String(index))));
    render(<InfoBoxOverlay simulationState={{} as SimulationState} osmBuffBarScale={2} />);
    const tiles = screen.getAllByRole('img', { name: 'Tick Counter. Tick 0 of 4' });

    expect(tiles).toHaveLength(12);
    // osmBuffTile at 2 CSS px per logical px: (56, 214), (56, 177), ... then (19, 214).
    expect([tiles[0].style.left, tiles[0].style.top]).toEqual(['112px', '428px']);
    expect([tiles[1].style.left, tiles[1].style.top]).toEqual(['112px', '354px']);
    expect([tiles[6].style.left, tiles[6].style.top]).toEqual(['38px', '428px']);
    const bar = tiles[0].parentElement as HTMLElement;
    expect([bar.style.width, bar.style.height]).toEqual(['182px', '498px']);
  });

  it('sets every value the same way, however long, so no value switches to another face', () => {
    tooltipMocks.setSelectInfoboxesResult(
      ['1', '90', '112', '0:01', '5:00', '14:51'].map((text) => ({ ...createInfobox(text), itemId: 30875 })),
    );

    render(<InfoBoxOverlay simulationState={{} as SimulationState} />);

    for (const text of ['1', '90', '112', '0:01', '5:00', '14:51']) {
      expect(screen.getByText(text).className).toBe('infobox-text');
    }
  });

  it('leaves every countdown to the shared timer color, and keeps color for values that are not timers', () => {
    tooltipMocks.setSelectInfoboxesResult([
      {
        id: 'surge-potion-cooldown',
        itemId: 30875,
        text: '5:00',
        ticksRemaining: 500,
        sampledAtTick: 10,
        tooltipTitle: 'Surge potion',
        tooltipDetail: 'Cooldown (5:00 remaining)',
      },
      // A stray color on a timer does not survive: the renderer owns timer color, not the data.
      {
        ...createInfobox('0:18'),
        id: 'death-charge-cooldown',
        ticksRemaining: 30,
        sampledAtTick: 10,
        textColor: '#d4a848',
      },
      { ...createInfobox('112'), id: 'stat-magic', textColor: undefined, tone: 'boost' },
      { ...createInfobox('90'), id: 'stat-defence', textColor: undefined, tone: 'drain' },
      // The tick counter keeps the player's own color, which is data, not a tone.
      { ...createInfobox('1'), id: 'tick-counter', textColor: '#d4a848' },
    ]);

    render(<InfoBoxOverlay simulationState={{} as SimulationState} />);

    expect(screen.getByRole('img', { name: 'Surge potion. Cooldown (5:00 remaining)' })).toBeInTheDocument();
    // No inline color, so `.infobox-text` paints them in the pack's --color-text-body.
    expect(screen.getByText('5:00').style.color).toBe('');
    expect(screen.getByText('0:18').style.color).toBe('');
    // A stat's color comes from its tone, mixed from the pack in CSS, never an inline hex.
    expect(screen.getByText('112')).toHaveClass('infobox-text--boost');
    expect(screen.getByText('112').style.color).toBe('');
    expect(screen.getByText('90')).toHaveClass('infobox-text--drain');
    expect(screen.getByText('1')).toHaveStyle({ color: '#d4a848' });
  });

  it('rests a value on the bottom edge under its icon, and centers it only in a tile with no icon', () => {
    tooltipMocks.setSelectInfoboxesResult([
      createInfobox('1'), // the tick counter: no icon
      { ...createInfobox('112'), id: 'stat-magic', spriteUrl: '/assets/ui/skill-magic.png', tone: 'boost' },
    ]);

    const { container } = render(<InfoBoxOverlay simulationState={{} as SimulationState} />);

    expect(container.querySelectorAll('.infobox-sprite')).toHaveLength(1);
    expect(screen.getByText('1')).toHaveClass('infobox-text--solo');
    expect(screen.getByText('112')).not.toHaveClass('infobox-text--solo');
  });

  it('applies the outline class and color var when the outline is enabled', () => {
    const { container } = render(
      <InfoBoxOverlay
        simulationState={{} as SimulationState}
        infoBoxSettings={{ infoboxTextOutlineEnabled: true, infoboxTextOutlineColor: '#ff0000' }}
      />,
    );

    const strip = container.querySelector('.infobox-strip');
    expect(strip).toHaveClass('infobox-strip--outlined');
    expect((strip as HTMLElement).style.getPropertyValue('--infobox-outline-color')).toBe('#ff0000');
  });

  it('omits the outline class when the outline is disabled', () => {
    const { container } = render(
      <InfoBoxOverlay
        simulationState={{} as SimulationState}
        infoBoxSettings={{ infoboxTextOutlineEnabled: false, infoboxTextOutlineColor: '#ff0000' }}
      />,
    );

    const strip = container.querySelector('.infobox-strip');
    expect(strip).not.toHaveClass('infobox-strip--outlined');
  });
});
