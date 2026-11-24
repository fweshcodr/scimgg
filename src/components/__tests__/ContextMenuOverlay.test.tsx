// @vitest-environment happy-dom

import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import type React from 'react';
import { useContext } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ReplayFrameProvider } from '../../contexts/ReplayFrameContext';
import { ReplayFrameStore } from '../../core/replayFrameStore';
import { triggerGlobalClickAnimation } from '../../hooks/useClickAnimation';
import { REPLAY_CLICK_OWNER_ATTRIBUTE, REPLAY_CLICK_OWNERS } from '../../input/replayClickFeedback';
import { getLiveReplayMenuState } from '../../input/replayMenuState';
import { stubMaxTouchPoints } from '../../test/helpers/maxTouchPoints';
import { getGameFrameRect, setOpenMenuMapping, toReplayCursorPoint } from '../../util/viewportBounds';
import type { ContextMenuContent, ContextMenuContextType } from '../ContextMenu';
import { ContextMenuProvider } from '../ContextMenu/ContextMenuContext';
import { ContextMenuOverlay } from '../ContextMenu/ContextMenuOverlay';
import { ContextMenuContext } from '../ContextMenu/contextMenuTypes';
import { TooltipOverlay, TooltipProvider, useTooltip } from '../Tooltip';

const mockHideContextMenu = vi.fn();
const mockReplayCursorClick = vi.fn<NonNullable<ContextMenuContextType['onReplayCursorClick']>>();
const mockContextMenuState = {
  content: {
    entries: [] as ContextMenuContent['entries'],
  },
  visible: true,
  isReplaying: false,
  menuX: 120,
  menuY: 80,
  hideContextMenu: mockHideContextMenu,
  onReplayCursorClick: mockReplayCursorClick,
};

vi.mock('../ContextMenu/useContextMenu', () => ({
  useContextMenu: () => mockContextMenuState,
}));

vi.mock('../../hooks/useClickAnimation', () => ({
  triggerGlobalClickAnimation: vi.fn(),
}));

function mouseDownEvent(init: MouseEventInit, timeStamp: number): MouseEvent {
  const event = new MouseEvent('mousedown', { bubbles: true, cancelable: true, ...init });
  Object.defineProperty(event, 'timeStamp', { value: timeStamp, configurable: true });
  return event;
}

function renderOverlay() {
  return render(
    <TooltipProvider>
      <ContextMenuOverlay />
    </TooltipProvider>,
  );
}

const ViewerControl: React.FC = () => {
  const { bindTooltip } = useTooltip();
  return (
    <button type="button" {...bindTooltip({ lines: [{ spans: [{ text: 'Viewer tooltip', color: '#fff' }] }] })}>
      Viewer control
    </button>
  );
};

describe('ContextMenuOverlay', () => {
  let restoreTouchPoints = () => {};

  afterEach(() => {
    restoreTouchPoints();
    restoreTouchPoints = () => {};
  });

  beforeEach(() => {
    vi.clearAllMocks();
    mockContextMenuState.visible = true;
    mockContextMenuState.isReplaying = false;
    mockContextMenuState.content = {
      entries: [
        { action: 'Walk here', target: 'Tile', onClick: vi.fn() },
        { action: 'Examine', target: 'Tile', onClick: vi.fn() },
      ],
    };
  });

  it('replays menu geometry, hover, submenu and close states without live input handlers', () => {
    mockContextMenuState.visible = false;
    mockContextMenuState.isReplaying = true;
    const liveAction = mockContextMenuState.content.entries[0].onClick;
    const view = {
      x: 40,
      y: 50,
      scale: 1,
      hoveredIndex: 0,
      submenuParentIndex: -1,
      hoveredSubmenuIndex: -1,
      submenuPosition: null,
    };
    const store = new ReplayFrameStore();
    store.setHistory(
      [],
      [
        {
          kind: 'open',
          tMs: 100,
          state: {
            ...view,
            entries: [
              {
                action: 'Recorded action',
                target: 'Recorded boss',
                submenu: [{ action: 'First option' }, { action: 'Recorded option' }],
              },
            ],
          },
        },
        {
          kind: 'update',
          tMs: 200,
          view: { ...view, submenuParentIndex: 0, hoveredSubmenuIndex: 1, submenuPosition: { x: 140, y: 50 } },
        },
        { kind: 'close', tMs: 300 },
      ],
    );
    const underlyingInput = vi.fn();
    render(
      <ReplayFrameProvider store={store}>
        <TooltipProvider>
          <div className="game-viewport-frame" data-testid="recorded-frame">
            <button type="button" onMouseDown={underlyingInput}>
              Viewer control
            </button>
            <ContextMenuOverlay />
          </div>
        </TooltipProvider>
      </ReplayFrameProvider>,
    );
    expect(screen.queryByRole('menu')).toBeNull();

    act(() => store.set(100, undefined));

    const menu = screen.getByRole('menu');
    expect(menu).toHaveStyle({ left: '40px', top: '50px' });
    expect(screen.getByTestId('recorded-frame')).toContainElement(menu);
    expect(screen.getByText('Recorded action')).toBeInTheDocument();
    expect(screen.getByRole('dialog', { name: 'Recorded context menu' })).toHaveStyle({ pointerEvents: 'none' });
    expect(screen.getByRole('menuitem')).not.toHaveAttribute('tabIndex');
    fireEvent.mouseDown(screen.getByRole('button', { name: 'Viewer control' }), {
      button: 0,
      clientX: 60,
      clientY: 60,
    });
    fireEvent.blur(window);
    expect(underlyingInput).toHaveBeenCalledOnce();
    expect(liveAction).not.toHaveBeenCalled();
    expect(mockHideContextMenu).not.toHaveBeenCalled();
    expect(mockReplayCursorClick).not.toHaveBeenCalled();

    act(() => store.set(200, undefined));

    expect(screen.getAllByRole('menu')).toHaveLength(2);
    expect(screen.getAllByRole('menu')[1]).toHaveStyle({ left: '140px', top: '50px' });
    expect(screen.getByText('Recorded option')).toBeInTheDocument();

    act(() => store.set(300, undefined));

    expect(screen.queryByRole('menu')).toBeNull();
  });

  it('replays a touch-opened menu at its recorded row height, bound and scroll', () => {
    mockContextMenuState.visible = false;
    mockContextMenuState.isReplaying = true;
    const view = {
      x: 40,
      y: 50,
      scale: 1,
      hoveredIndex: -1,
      submenuParentIndex: -1,
      hoveredSubmenuIndex: -1,
      submenuPosition: null,
    };
    const store = new ReplayFrameStore();
    store.setHistory(
      [],
      [
        {
          kind: 'open',
          tMs: 100,
          state: { ...view, rowHeight: 36, scrollTop: 72, entries: [{ action: 'Walk here' }, { action: 'Examine' }] },
        },
        { kind: 'update', tMs: 200, view: { ...view, rowHeight: 36, scrollTop: 0 } },
        // A mouse menu after it keeps the native rows.
        { kind: 'close', tMs: 300 },
        { kind: 'open', tMs: 400, state: { ...view, entries: [{ action: 'Walk here' }] } },
      ],
    );
    render(
      <ReplayFrameProvider store={store}>
        <TooltipProvider>
          <div className="game-viewport-frame" data-testid="recorded-frame">
            <ContextMenuOverlay />
          </div>
        </TooltipProvider>
      </ReplayFrameProvider>,
    );
    Object.defineProperty(screen.getByTestId('recorded-frame'), 'clientHeight', { value: 390, configurable: true });

    act(() => store.set(100, undefined));
    const list = () => document.querySelector<HTMLElement>('[data-menu-entries]')!;

    expect(screen.getAllByRole('menuitem').map((row) => row.style.minHeight)).toEqual(['36px', '36px']);
    expect(screen.getByRole('menu').style.maxHeight).toBe('382px');
    expect(list().style.overflowY).toBe('auto');
    expect(list().scrollTop).toBe(72);

    act(() => store.set(200, undefined));
    expect(list().scrollTop).toBe(0);

    act(() => store.set(400, undefined));
    expect(screen.getByRole('menuitem').style.minHeight).toBe('');
    expect(screen.getByRole('menu').style.maxHeight).toBe('');
  });

  it('keeps a viewer-owned tooltip across parent rerenders while the recorded menu stays open', () => {
    mockContextMenuState.visible = false;
    mockContextMenuState.isReplaying = true;
    const store = new ReplayFrameStore();
    const recordedMenu = {
      entries: [{ action: 'Recorded action' }],
      x: 40,
      y: 50,
      scale: 1,
      hoveredIndex: -1,
      submenuParentIndex: -1,
      hoveredSubmenuIndex: -1,
      submenuPosition: null,
    };
    const menuEvents = [
      { kind: 'open', tMs: 100, state: recordedMenu },
      { kind: 'close', tMs: 300 },
    ] as const;
    store.setHistory([], menuEvents);
    const tree = (revision: number) => (
      <ReplayFrameProvider store={store}>
        <TooltipProvider>
          <div className="game-viewport-frame" data-revision={revision}>
            <ViewerControl />
            <ContextMenuOverlay />
            <TooltipOverlay />
          </div>
        </TooltipProvider>
      </ReplayFrameProvider>
    );
    const view = render(tree(0));
    act(() => store.set(100, undefined));
    expect(screen.getByRole('menu')).toBeInTheDocument();

    fireEvent.mouseEnter(screen.getByRole('button', { name: 'Viewer control' }), { clientX: 10, clientY: 10 });
    expect(screen.getByText('Viewer tooltip')).toBeInTheDocument();

    view.rerender(tree(1));

    expect(screen.getByRole('menu')).toBeInTheDocument();
    expect(screen.getByText('Viewer tooltip')).toBeInTheDocument();

    act(() => store.set(300, undefined));
    expect(screen.queryByRole('menu')).toBeNull();
    expect(screen.getByText('Viewer tooltip')).toBeInTheDocument();

    act(() => store.set(100, undefined));
    expect(screen.getByRole('menu')).toBeInTheDocument();
    expect(screen.queryByText('Viewer tooltip')).toBeNull();
  });

  it('does not build a live menu from viewer input while replay owns the menu', () => {
    const factory = vi.fn(() => ({ entries: [{ action: 'Live action' }] }));
    function Trigger() {
      const context = useContext(ContextMenuContext);
      if (!context) throw new TypeError('Missing context menu provider');
      return (
        <button type="button" data-visible={context.visible} {...context.bindContextMenu(factory)}>
          Target
        </button>
      );
    }
    const tree = (isReplaying: boolean) => (
      <TooltipProvider>
        <ContextMenuProvider isReplaying={isReplaying}>
          <Trigger />
        </ContextMenuProvider>
      </TooltipProvider>
    );
    const view = render(tree(true));

    fireEvent.mouseDown(screen.getByRole('button', { name: 'Target' }), { button: 2 });

    expect(factory).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'Target' })).toHaveAttribute('data-visible', 'false');
    view.rerender(tree(false));
    fireEvent.mouseDown(screen.getByRole('button', { name: 'Target' }), { button: 2 });
    expect(factory).toHaveBeenCalledOnce();
    expect(screen.getByRole('button', { name: 'Target' })).toHaveAttribute('data-visible', 'true');
  });

  it('renders menu items from context menu entries', () => {
    renderOverlay();

    expect(screen.getByText('Walk here')).toBeInTheDocument();
    expect(screen.getByText('Examine')).toBeInTheDocument();
  });

  it('marks the overlay as explicit-owned replay click feedback', () => {
    renderOverlay();

    const overlay = screen.getByRole('dialog');

    expect(overlay).toHaveAttribute(REPLAY_CLICK_OWNER_ATTRIBUTE, REPLAY_CLICK_OWNERS.explicit);
  });

  it('invokes menu item handler when clicking a menu item', async () => {
    renderOverlay();

    const menuItems = screen.getAllByRole('menuitem');

    Object.defineProperty(menuItems[0], 'getBoundingClientRect', {
      value: () => ({ left: 100, right: 180, top: 90, bottom: 110, width: 80, height: 20 }),
      configurable: true,
    });
    Object.defineProperty(menuItems[1], 'getBoundingClientRect', {
      value: () => ({ left: 100, right: 180, top: 112, bottom: 132, width: 80, height: 20 }),
      configurable: true,
    });

    fireEvent.mouseDown(window, { button: 0, clientX: 120, clientY: 100 });

    await waitFor(() => {
      expect(mockContextMenuState.content.entries[0].onClick).toHaveBeenCalledTimes(1);
    });
    expect(mockHideContextMenu).toHaveBeenCalledTimes(1);
  });

  it('records replay cursor markers for menu entries with clickType', async () => {
    mockContextMenuState.content = {
      entries: [{ action: 'Attack', target: 'NPC', clickType: 'red', onClick: vi.fn() }],
    };
    renderOverlay();

    const menuItems = screen.getAllByRole('menuitem');
    Object.defineProperty(menuItems[0], 'getBoundingClientRect', {
      value: () => ({ left: 100, right: 180, top: 90, bottom: 110, width: 80, height: 20 }),
      configurable: true,
    });

    fireEvent(window, mouseDownEvent({ button: 0, clientX: 120, clientY: 100 }, 4567));

    await waitFor(() => {
      expect(mockContextMenuState.content.entries[0]?.onClick).toHaveBeenCalledTimes(1);
    });
    expect(triggerGlobalClickAnimation).toHaveBeenCalledWith(120, 100, 'red');
    expect(mockReplayCursorClick).toHaveBeenCalledWith(120, 100, 'red', 4567);
  });

  it.each([
    { pointer: 'a mouse', pointerType: 'mouse', maxTouchPoints: 10, closes: true },
    { pointer: 'a pen on a separate pad (no touchscreen)', pointerType: 'pen', maxTouchPoints: 0, closes: true },
    // A touch pointer's hover is not the cursor leaving.
    { pointer: 'a pen hovering over a touchscreen', pointerType: 'pen', maxTouchPoints: 10, closes: false },
  ])('closes the menu when $pointer leaves its bounds: $closes', ({ pointerType, maxTouchPoints, closes }) => {
    restoreTouchPoints = stubMaxTouchPoints(maxTouchPoints);
    renderOverlay();

    const menus = screen.getAllByRole('menu');
    Object.defineProperty(menus[0], 'getBoundingClientRect', {
      value: () => ({ left: 100, right: 200, top: 80, bottom: 180, width: 100, height: 100 }),
      configurable: true,
    });

    fireEvent(window, new PointerEvent('pointermove', { pointerType, clientX: 400, clientY: 400 }));

    expect(mockHideContextMenu).toHaveBeenCalledTimes(closes ? 1 : 0);
  });

  it('keeps its rows out of focus: the menu is pointer-only', () => {
    renderOverlay();

    for (const item of screen.getAllByRole('menuitem')) expect(item).not.toHaveAttribute('tabIndex');
  });

  it('dismisses the menu when the window loses focus (e.g. Firefox native menu opens)', () => {
    renderOverlay();

    fireEvent.blur(window);

    expect(mockHideContextMenu).toHaveBeenCalledTimes(1);
  });

  describe('recording over a stretched frame (Stretch to Window)', () => {
    afterEach(() => {
      setOpenMenuMapping(null);
      for (const frame of document.querySelectorAll('.game-viewport-frame')) frame.remove();
    });

    /** A frame laid out at `layout` and drawn at `painted`, its top-left at the window's. */
    function mountStretchedFrame(
      layout: { width: number; height: number },
      painted: { width: number; height: number },
    ) {
      const frame = document.createElement('div');
      frame.className = 'game-viewport-frame';
      Object.defineProperty(frame, 'offsetWidth', { value: layout.width, configurable: true });
      Object.defineProperty(frame, 'offsetHeight', { value: layout.height, configurable: true });
      stubRect(frame, 0, 0, painted.width, painted.height);
      document.body.appendChild(frame);
    }

    function stubRect(element: Element, left: number, top: number, width: number, height: number): void {
      Object.defineProperty(element, 'getBoundingClientRect', {
        value: () => new DOMRect(left, top, width, height),
        configurable: true,
      });
    }

    /** A client point as the replay recorder takes it (useReplay -> ReplayRecorder). */
    const recordedPoint = (clientX: number, clientY: number) => {
      const frame = getGameFrameRect();
      if (!frame) throw new Error('no frame');
      return toReplayCursorPoint({ clientX, clientY }, frame);
    };

    function moveTo(clientX: number, clientY: number): void {
      fireEvent(window, new PointerEvent('pointermove', { pointerType: 'mouse', clientX, clientY }));
    }

    /** The recorded click, captured when the pick reports it (before the menu closes). */
    function captureClicks(): Array<{ x: number; y: number }> {
      const clicks: Array<{ x: number; y: number }> = [];
      mockReplayCursorClick.mockImplementation((clientX, clientY) => {
        clicks.push(recordedPoint(clientX, clientY));
      });
      return clicks;
    }

    const within = (value: number, start: number, size: number) =>
      expect(value >= start && value <= start + size).toBe(true);

    it('records a pick of a lower row on that recorded row, with the frame stretched vertically', () => {
      // Layout 765x503 drawn 765x1006: a residual stretch of 2 on Y only.
      mountStretchedFrame({ width: 765, height: 503 }, { width: 765, height: 1006 });
      const entries = ['Walk here', 'Attack', 'Examine'].map((action) => ({
        action,
        target: 'NPC',
        clickType: 'yellow' as const,
        onClick: vi.fn(),
      }));
      mockContextMenuState.content = { entries };
      renderOverlay();
      const menu = screen.getAllByRole('menu')[0];
      stubRect(menu, 300, 200, 120, 90);
      for (const [i, row] of screen.getAllByRole('menuitem').entries()) stubRect(row, 302, 222 + 20 * i, 116, 20);
      const clicks = captureClicks();

      moveTo(360, 272);
      const state = getLiveReplayMenuState();
      expect(state?.hoveredIndex).toBe(2);
      // The third row, 62px below the menu's top and 2px in from its left, where it was recorded.
      const rowX = (state?.x ?? 0) + 2;
      const rowY = (state?.y ?? 0) + 62;
      const sample = recordedPoint(360, 272);
      within(sample.x, rowX, 116);
      within(sample.y, rowY, 20);

      fireEvent(window, mouseDownEvent({ button: 0, clientX: 360, clientY: 272 }, 10));
      expect(entries[2].onClick).toHaveBeenCalledTimes(1);
      expect(clicks).toHaveLength(1);
      within(clicks[0].x, rowX, 116);
      within(clicks[0].y, rowY, 20);

      // Off the menu, the frame records per axis as ever.
      expect(recordedPoint(100, 800)).toMatchObject({ x: 100, y: 400 });
    });

    it('records a submenu pick on the recorded submenu row, with the frame stretched horizontally', () => {
      // Layout 765x503 drawn 1530x503: a residual stretch of 2 on X only.
      mountStretchedFrame({ width: 765, height: 503 }, { width: 1530, height: 503 });
      const colours = ['Red', 'Blue'].map((action) => ({ action, clickType: 'yellow' as const, onClick: vi.fn() }));
      mockContextMenuState.content = {
        entries: [
          { action: 'Tag', target: 'NPC', submenu: colours },
          { action: 'Examine', target: 'NPC' },
        ],
      };
      renderOverlay();
      stubRect(screen.getAllByRole('menu')[0], 800, 100, 120, 70);
      for (const [i, row] of screen.getAllByRole('menuitem').entries()) stubRect(row, 802, 122 + 20 * i, 116, 20);

      moveTo(850, 130);
      const submenu = screen.getAllByRole('menu')[1];
      stubRect(submenu, 919, 105, 100, 60);
      for (const [i, row] of Array.from(submenu.querySelectorAll('[data-submenu-index]')).entries()) {
        stubRect(row, 921, 125 + 20 * i, 96, 20);
      }
      const clicks = captureClicks();

      moveTo(970, 155);
      const state = getLiveReplayMenuState();
      expect(state?.hoveredSubmenuIndex).toBe(1);
      const rowX = (state?.submenuPosition?.x ?? 0) + 2;
      const rowY = (state?.submenuPosition?.y ?? 0) + 40;
      const sample = recordedPoint(970, 155);
      within(sample.x, rowX, 96);
      within(sample.y, rowY, 20);
      expect(sample.insideFrame).toBe(true);

      fireEvent(window, mouseDownEvent({ button: 0, clientX: 970, clientY: 155 }, 10));
      expect(colours[1].onClick).toHaveBeenCalledTimes(1);
      expect(clicks).toHaveLength(1);
      within(clicks[0].x, rowX, 96);
      within(clicks[0].y, rowY, 20);
    });

    it('leaves no mapping behind once the menu closes', () => {
      mountStretchedFrame({ width: 765, height: 503 }, { width: 765, height: 1006 });
      const view = renderOverlay();
      stubRect(screen.getAllByRole('menu')[0], 300, 200, 120, 60);
      moveTo(310, 210);
      expect(getGameFrameRect()?.openMenu).toBeDefined();
      mockContextMenuState.visible = false;
      view.rerender(
        <TooltipProvider>
          <ContextMenuOverlay />
        </TooltipProvider>,
      );
      expect(getGameFrameRect()?.openMenu).toBeUndefined();
      expect(recordedPoint(310, 210)).toMatchObject({ x: 310, y: 105 });
    });
  });
});
