// @vitest-environment happy-dom

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { act, fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { CHAT_HIGHLIGHT_COLORS } from '../../core/events/gameMessages';
import { chatboxPlacement } from '../../layout/chatboxLayout';
import {
  FIXED_CHAT,
  FIXED_CHAT_BUTTON_Y,
  FIXED_CHAT_CONTROLS,
  FIXED_CHAT_SCROLL_ARROW,
  FIXED_CHAT_SCROLL_THUMB_MIN,
  FIXED_CHAT_SCROLLAREA,
  FIXED_CHAT_SCROLLBAR,
  FIXED_CHAT_TAB_SLOT_X,
} from '../../layout/osrsClientLayout';
import { GRAPPLE_TARGETS, grappleWarningMessage } from '../../npcs/colosseum/grapple';
import { Chatbox } from '../Chatbox';
import { CHAT_BOTTOM_GAP, chatScrollFromDragger, chatScrollGeometry } from '../chatboxScroll';
import type { ChatLogEntry } from '../chatLog';

const SCALE = 2;

/** The chatbox where the Fixed layout puts it, which is where the cache rectangles are measured. */
const renderChatbox = (
  visible: boolean,
  onToggle = vi.fn(),
  messages: readonly ChatLogEntry[] = [],
  transparent = false,
) => {
  const placement = chatboxPlacement({
    layout: 'fixed',
    visible,
    frame: { width: 765 * SCALE, height: 503 * SCALE },
    fixedScale: SCALE,
    resizableScale: 1,
    insetLeft: 0,
  });
  if (!placement) throw new Error('fixed has a chatbox');
  render(
    <Chatbox
      rect={placement.rect}
      scale={placement.scale}
      visible={visible}
      transparent={transparent}
      onToggle={onToggle}
      messages={messages}
    />,
  );
  return { onToggle, root: document.querySelector<HTMLElement>('.chatbox') };
};

const HANDS = GRAPPLE_TARGETS.find((target) => target.slot === 'hands');
if (!HANDS) throw new Error('hands grapple target missing');

/** One of each line the Sol fight sends, oldest first. */
const SOL_LINES: readonly ChatLogEntry[] = [
  {
    key: '1',
    tick: 10,
    kind: 'public',
    speaker: 'Sol Heredit',
    segments: [{ text: "Let's start by testing your footwork." }],
  },
  { key: '2', tick: 20, kind: 'game', segments: grappleWarningMessage(HANDS) },
  {
    key: '3',
    tick: 21,
    kind: 'game',
    segments: [{ text: 'You defended the wrong body part!', color: CHAT_HIGHLIGHT_COLORS.red }],
  },
  {
    key: '4',
    tick: 22,
    kind: 'game',
    segments: [{ text: "You perfectly parry Sol Heredit's grapple!", color: CHAT_HIGHLIGHT_COLORS.green }],
  },
  {
    key: '5',
    tick: 30,
    kind: 'spam',
    segments: [{ text: "Sol Heredit doesn't take kindly to your eager prayer.", color: CHAT_HIGHLIGHT_COLORS.red }],
  },
];

const lines = () => Array.from(document.querySelectorAll<HTMLElement>('.chatbox__line'));
const lineTexts = () => lines().map((line) => line.textContent);
const spanColor = (text: string) =>
  Array.from(document.querySelectorAll<HTMLElement>('.chatbox__line span')).find((span) => span.textContent === text)
    ?.style.color;

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

const tabs = () => Array.from(document.querySelectorAll<HTMLElement>('.chatbox__tab'));

/** A client rect, for stubbing the layout happy-dom does not do. */
const clientBox = (left: number, top: number, width: number, height: number): DOMRect =>
  ({
    x: left,
    y: top,
    left,
    top,
    width,
    height,
    right: left + width,
    bottom: top + height,
    toJSON: () => ({}),
  }) as DOMRect;

/**
 * The line column's laid-out height, `content` cache pixels at the chatbox's `SCALE`. The layout
 * height is what the chat measures: a fitted replay's outer transform is not in it.
 */
const stubLinesHeight = (content: number) =>
  vi.spyOn(HTMLElement.prototype, 'offsetHeight', 'get').mockImplementation(function (this: HTMLElement) {
    return this.classList.contains('chatbox__lines') ? content * SCALE : 0;
  });

describe('Chatbox', () => {
  it('covers the whole cache rectangle while the chat is shown', () => {
    const { root } = renderChatbox(true);

    expect(root?.style.left).toBe(`${FIXED_CHAT.x * SCALE}px`);
    expect(root?.style.top).toBe(`${FIXED_CHAT.y * SCALE}px`);
    expect(root?.style.height).toBe(`${FIXED_CHAT.height * SCALE}px`);
  });

  it('collapses to the controls row alone, which is the only part left on screen', () => {
    // Collapsed the surface STARTS at the controls row, so every offset inside it is
    // measured from a different origin. Keeping the chat rectangle here would leave the
    // scene covered by 142 rows of nothing and put the tab row off the bottom of it.
    const { root } = renderChatbox(false);

    expect(root?.style.top).toBe(`${FIXED_CHAT_CONTROLS.y * SCALE}px`);
    expect(root?.style.height).toBe(`${FIXED_CHAT_CONTROLS.height * SCALE}px`);
  });

  it('leaves the tab row on the same stone whether the chat is open or shut', () => {
    // Every offset inside the surface is measured from whichever origin is in play, so
    // collapsing must move the CONTAINER and leave the row where it was. Get the swap
    // wrong and the row the user clicks to reopen the chat slides 142 rows up the screen.
    const rowTops = (visible: boolean): number[] => {
      document.body.innerHTML = '';
      const { root } = renderChatbox(visible);
      const containerTop = Number.parseFloat(root?.style.top ?? '');
      return tabs().map((tab) => containerTop + Number.parseFloat(tab.style.top));
    };
    const expected = FIXED_CHAT_TAB_SLOT_X.map(() => (FIXED_CHAT_CONTROLS.y + FIXED_CHAT_BUTTON_Y) * SCALE);

    expect(rowTops(true)).toEqual(expected);
    expect(rowTops(false)).toEqual(expected);
  });

  it('scales the tab slots out of the cache rather than laying them out itself', () => {
    const { root } = renderChatbox(true);
    const containerLeft = Number.parseFloat(root?.style.left ?? '');

    expect(tabs().map((tab) => containerLeft + Number.parseFloat(tab.style.left))).toEqual(
      FIXED_CHAT_TAB_SLOT_X.map((x) => (FIXED_CHAT.x + x) * SCALE),
    );
  });

  it('mounts the input row only where there is a chat to type into', () => {
    renderChatbox(true);
    expect(document.querySelector('.chatbox__input')).not.toBeNull();

    document.body.innerHTML = '';
    renderChatbox(false);
    expect(document.querySelector('.chatbox__input')).toBeNull();
  });

  it('reports the collapse control by what it does, not by the sprite it borrows', () => {
    // The cache calls this sprite `report_button`; announcing it as "Report" would be the
    // one control the chatbox has, mislabeled.
    const { onToggle } = renderChatbox(true);
    const collapse = screen.getByRole('button', { name: 'Collapse the chatbox' });

    expect(collapse.getAttribute('aria-expanded')).toBe('true');
    fireEvent.click(collapse);
    expect(onToggle).toHaveBeenCalledOnce();

    document.body.innerHTML = '';
    renderChatbox(false);
    expect(screen.getByRole('button', { name: 'Expand the chatbox' }).getAttribute('aria-expanded')).toBe('false');
  });

  it('leaves All and Collapse the only controls on the row', () => {
    renderChatbox(true);

    expect(tabs()).toHaveLength(7);
    expect(screen.getAllByRole('button')).toEqual([
      screen.getByRole('button', { name: 'All' }),
      screen.getByRole('button', { name: 'Collapse the chatbox' }),
    ]);
  });

  // Keyboard and focus policy: a focused All or Collapse would take Space from the replay's pause.
  it.each(['All', 'Collapse the chatbox'])('leaves no focus on %s after a click', async (name) => {
    const user = userEvent.setup();
    const { onToggle } = renderChatbox(true);
    const button = screen.getByRole('button', { name });

    expect(fireEvent.mouseDown(button)).toBe(false);
    await user.click(button);

    expect(onToggle).toHaveBeenCalledOnce();
    expect(document.activeElement).toBe(document.body);
  });

  describe('the All tab', () => {
    /** The main raster's state tail: `…|reportHovered|allSelected|allLit`. */
    const allState = () =>
      document.querySelector('.chatbox > canvas')?.getAttribute('data-composed')?.split('|').slice(-2).join('|');
    const renderResizable = (visible: boolean, onToggle = vi.fn()) => {
      const placement = chatboxPlacement({
        layout: 'modern',
        visible,
        frame: { width: 1280, height: 760 },
        fixedScale: 1,
        resizableScale: SCALE,
        insetLeft: 0,
      });
      if (!placement) throw new Error('modern has a chatbox');
      render(
        <Chatbox
          rect={placement.rect}
          scale={placement.scale}
          visible={visible}
          onToggle={onToggle}
          messages={SOL_LINES}
        />,
      );
      return onToggle;
    };
    const allButton = () => screen.getByRole('button', { name: 'All' });

    it('collapses the chat when the selected All tab is clicked, as the resizable client does', () => {
      const onToggle = renderResizable(true);

      expect(allButton().getAttribute('aria-expanded')).toBe('true');
      expect(allState()).toBe('true|false');
      fireEvent.click(allButton());
      expect(onToggle).toHaveBeenCalledOnce();
    });

    it('reopens the chat from All while collapsed, where no tab is drawn selected', () => {
      const onToggle = renderResizable(false);

      expect(allButton().getAttribute('aria-expanded')).toBe('false');
      expect(allState()).toBe('false|false');
      fireEvent.click(allButton());
      expect(onToggle).toHaveBeenCalledOnce();
    });

    it('lights All under the pointer, selected or not', () => {
      renderResizable(true);
      fireEvent.mouseEnter(allButton());
      expect(allState()).toBe('true|true');
      fireEvent.mouseLeave(allButton());
      expect(allState()).toBe('true|false');

      document.body.innerHTML = '';
      renderResizable(false);
      fireEvent.mouseEnter(allButton());
      expect(allState()).toBe('false|true');
    });

    it('leaves the other six tabs inert', () => {
      const onToggle = renderResizable(true);
      const others = tabs().filter((tab) => tab.tagName !== 'BUTTON');

      expect(others).toHaveLength(6);
      const resting = allState();
      for (const tab of others) {
        fireEvent.mouseEnter(tab);
        fireEvent.click(tab);
      }
      expect(onToggle).not.toHaveBeenCalled();
      expect(allState()).toBe(resting);
    });

    it('toggles in Fixed too, a deliberate departure from the client', () => {
      // The client only hides the chat from the selected tab in the resizable modes.
      for (const open of [true, false]) {
        document.body.innerHTML = '';
        const { onToggle } = renderChatbox(open);
        expect(allState()).toBe(`${open}|false`);
        fireEvent.click(allButton());
        expect(onToggle).toHaveBeenCalledOnce();
      }
    });
  });

  it('keeps the six filter tabs still under the pointer, and keeps Collapse hovering', () => {
    const { onToggle } = renderChatbox(true);
    const composed = () => document.querySelector('.chatbox > canvas')?.getAttribute('data-composed');
    const resting = composed();

    for (const tab of tabs().filter((tab) => tab.tagName !== 'BUTTON')) {
      fireEvent.mouseEnter(tab);
      fireEvent.click(tab);
    }
    expect(onToggle).not.toHaveBeenCalled();
    expect(composed()).toBe(resting);

    fireEvent.mouseEnter(screen.getByRole('button', { name: 'Collapse the chatbox' }));
    expect(composed()).not.toBe(resting);
  });

  it('leaves All as the one single-line tab', () => {
    // The client writes the filter state from the second tab up; giving All one
    // too would push a second line into a 22px stone and spill it under the button.
    renderChatbox(true);
    const lineCounts = tabs().map((tab) => tab.querySelectorAll('span').length);

    expect(lineCounts).toEqual([1, 2, 2, 2, 2, 2, 2]);
  });

  describe('chat lines', () => {
    it('skips tick-only renders and preserves existing lines through hovering, scrolling and new messages', () => {
      const segments = vi.fn(() => SOL_LINES[0].segments);
      const entry: ChatLogEntry = {
        ...SOL_LINES[0],
        get segments() {
          return segments();
        },
      };
      const messages = [entry];
      const projectLines = vi.spyOn(messages, 'map');
      const height = stubLinesHeight(300);
      const props = {
        rect: { x: 0, y: 338, width: 519, height: 165 },
        scale: SCALE,
        visible: true,
        onToggle: vi.fn(),
        messages,
      };
      const view = render(
        <div data-tick={0}>
          <Chatbox {...props} />
        </div>,
      );
      segments.mockClear();
      projectLines.mockClear();
      height.mockClear();

      view.rerender(
        <div data-tick={1}>
          <Chatbox {...props} />
        </div>,
      );
      expect(projectLines).not.toHaveBeenCalled();
      fireEvent.mouseEnter(screen.getByRole('button', { name: 'All' }));
      fireEvent.mouseEnter(screen.getByRole('button', { name: 'Collapse the chatbox' }));
      fireEvent.wheel(document.querySelector('.chatbox__scrollarea') as HTMLElement, { deltaY: -100 });
      expect(segments).not.toHaveBeenCalled();
      expect(height).not.toHaveBeenCalled();

      view.rerender(
        <div data-tick={2}>
          <Chatbox {...props} messages={[entry, SOL_LINES[1]]} />
        </div>,
      );
      expect(height).toHaveBeenCalled();
      expect(segments).not.toHaveBeenCalled();
      expect(lineTexts()).toHaveLength(2);
    });

    it('measures real content, scale, reopening and observer changes, not position-only changes', () => {
      let resized = () => {};
      const disconnect = vi.fn();
      vi.stubGlobal(
        'ResizeObserver',
        class {
          constructor(callback: () => void) {
            resized = callback;
          }
          observe() {}
          disconnect = disconnect;
        },
      );
      const height = stubLinesHeight(300);
      const props = {
        rect: { x: 0, y: 338, width: 519, height: 165 },
        scale: SCALE,
        visible: true,
        onToggle: vi.fn(),
        messages: SOL_LINES,
      };
      const view = render(<Chatbox {...props} />);
      expect(height).toHaveBeenCalled();
      height.mockClear();
      view.rerender(<Chatbox {...props} rect={{ ...props.rect, x: 10 }} />);
      expect(height).not.toHaveBeenCalled();
      act(() => resized());
      expect(height).toHaveBeenCalledOnce();
      height.mockClear();
      view.rerender(<Chatbox {...props} scale={1} />);
      expect(height).toHaveBeenCalled();
      view.rerender(<Chatbox {...props} visible={false} />);
      height.mockClear();
      view.rerender(<Chatbox {...props} />);
      expect(height).toHaveBeenCalled();
      view.unmount();
      expect(disconnect).toHaveBeenCalled();
    });

    it('stacks the lines oldest first, so the newest is the bottom one', () => {
      renderChatbox(true, vi.fn(), SOL_LINES);

      expect(lineTexts()).toEqual([
        "Sol Heredit:Let's start by testing your footwork.",
        "Sol Heredit: I'LL TWIST YOUR HANDS OFF!",
        'You defended the wrong body part!',
        "You perfectly parry Sol Heredit's grapple!",
        "Sol Heredit doesn't take kindly to your eager prayer.",
      ]);
    });

    it('hangs the lines 2px above the bottom of the scroll area', () => {
      // The stack is bottom-aligned: a short chat sits on the input row, not at the top of the
      // parchment.
      renderChatbox(true, vi.fn(), SOL_LINES);
      const column = document.querySelector<HTMLElement>('.chatbox__lines');

      expect(column?.style.bottom).toBe(`${CHAT_BOTTOM_GAP * SCALE}px`);
    });

    it('draws public chat as a black "Name:" and blue text, 3px apart', () => {
      renderChatbox(true, vi.fn(), SOL_LINES);
      const speaker = document.querySelector<HTMLElement>('.chatbox__speaker');
      const said = document.querySelector<HTMLElement>('.chatbox__said');

      expect(speaker?.textContent).toBe('Sol Heredit:');
      expect(speaker?.style.color).toBe('');
      expect(speaker?.style.marginRight).toBe(`${3 * SCALE}px`);
      expect(said?.style.color).toBe('#0000ff');
    });

    it('draws the grapple warning as sent: plain name, highlight red, white body part, red tail', () => {
      renderChatbox(true, vi.fn(), SOL_LINES);

      expect(spanColor('Sol Heredit: ')).toBe('');
      expect(spanColor("I'LL TWIST YOUR ")).toBe('#e00a19');
      expect(spanColor('HANDS')).toBe('#ffffff');
      expect(spanColor(' OFF!')).toBe('#ff0000');
    });

    it("maps the highlight tags to the opaque chatbox's darker pair", () => {
      // ff3045/229628 are the transparent and mobile pair.
      renderChatbox(true, vi.fn(), SOL_LINES);

      expect(spanColor('You defended the wrong body part!')).toBe('#e00a19');
      expect(spanColor("You perfectly parry Sol Heredit's grapple!")).toBe('#06600c');
    });

    it('draws the transparent chatbox in white with the client shadow and the brighter colors', () => {
      // The messages and input row turn white with a shadow, and the highlight tags take the
      // ff3045/229628 pair.
      renderChatbox(true, vi.fn(), SOL_LINES, true);
      const column = document.querySelector<HTMLElement>('.chatbox__lines');
      const input = document.querySelector<HTMLElement>('.chatbox__input');

      expect(document.querySelector('.chatbox')?.classList.contains('chatbox--transparent')).toBe(true);
      expect(column?.style.color).toBe('#ffffff');
      expect(column?.style.textShadow).toBe(`${SCALE}px ${SCALE}px 0 #000`);
      expect(input?.style.color).toBe('#ffffff');
      expect(input?.style.textShadow).toBe(`${SCALE}px ${SCALE}px 0 #000`);
      expect(document.querySelector<HTMLElement>('.chatbox__said')?.style.color).toBe('#9090ff');
      expect(spanColor("I'LL TWIST YOUR ")).toBe(CHAT_HIGHLIGHT_COLORS.red);
      expect(spanColor('HANDS')).toBe('#ffffff');
      expect(spanColor("You perfectly parry Sol Heredit's grapple!")).toBe(CHAT_HIGHLIGHT_COLORS.green);
    });

    it('keeps the opaque chatbox black and unshadowed', () => {
      renderChatbox(true, vi.fn(), SOL_LINES);
      const column = document.querySelector<HTMLElement>('.chatbox__lines');

      expect(document.querySelector('.chatbox')?.classList.contains('chatbox--transparent')).toBe(false);
      expect(column?.style.color).toBe('#000000');
      expect(column?.style.textShadow).toBe('');
    });

    it('swaps the scrollbar to the transparent art', () => {
      renderChatbox(true, vi.fn(), SOL_LINES, true);
      const composed = document.querySelector('.chatbox__scrollbar canvas')?.getAttribute('data-composed') ?? '';

      expect(composed).toContain('transparent_thumb_background.png');
      expect(composed).toContain('transparent_arrow_up.png');
    });

    it('shows every message whatever its kind, with no tab to filter it', () => {
      renderChatbox(true, vi.fn(), SOL_LINES);
      for (const tab of tabs()) fireEvent.click(tab);

      expect(new Set(SOL_LINES.map((entry) => entry.kind))).toEqual(new Set(['game', 'spam', 'public']));
      expect(lines()).toHaveLength(SOL_LINES.length);
    });

    it('drops the lines and the scroll area when the chat is collapsed', () => {
      renderChatbox(false, vi.fn(), SOL_LINES);

      expect(document.querySelector('.chatbox__scrollarea')).toBeNull();
      expect(document.querySelector('.chatbox__scrollbar')).toBeNull();
    });

    it('scrolls back through history on the wheel, 45px a notch, and no further than the top', () => {
      // happy-dom does no layout, so the measured height of the line column is stubbed.
      const contentHeight = 300;
      stubLinesHeight(contentHeight);
      renderChatbox(true, vi.fn(), SOL_LINES);
      const area = document.querySelector<HTMLElement>('.chatbox__scrollarea');
      const column = () => document.querySelector<HTMLElement>('.chatbox__lines');
      if (!area) throw new Error('no scroll area');

      expect(column()?.style.bottom).toBe(`${CHAT_BOTTOM_GAP * SCALE}px`);

      act(() => {
        fireEvent.wheel(area, { deltaY: -100, deltaMode: 0 });
      });
      expect(column()?.style.bottom).toBe(`${(CHAT_BOTTOM_GAP - 45) * SCALE}px`);

      for (let i = 0; i < 20; i++) {
        act(() => {
          fireEvent.wheel(area, { deltaY: -100, deltaMode: 0 });
        });
      }
      const maxScroll = contentHeight + CHAT_BOTTOM_GAP - FIXED_CHAT_SCROLLAREA.height;
      expect(column()?.style.bottom).toBe(`${(CHAT_BOTTOM_GAP - maxScroll) * SCALE}px`);
    });

    it('reaches the oldest line inside a fitted replay frame scaled apart from the chat', () => {
      // The replay fits the whole frame with transform: scale(0.5) on top of the chat's own 2x, so
      // on screen the 300 cache px of lines are 300 client px, not 600.
      const contentHeight = 300;
      const outer = 0.5;
      stubLinesHeight(contentHeight);
      vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (this: HTMLElement) {
        return this.classList.contains('chatbox__lines')
          ? clientBox(0, 0, 0, contentHeight * SCALE * outer)
          : clientBox(0, 0, 0, 0);
      });
      renderChatbox(true, vi.fn(), SOL_LINES);
      const area = document.querySelector<HTMLElement>('.chatbox__scrollarea');
      if (!area) throw new Error('no scroll area');

      for (let i = 0; i < 20; i++) {
        act(() => {
          fireEvent.wheel(area, { deltaY: -100, deltaMode: 0 });
        });
      }
      const maxScroll = contentHeight + CHAT_BOTTOM_GAP - FIXED_CHAT_SCROLLAREA.height;
      expect(document.querySelector<HTMLElement>('.chatbox__lines')?.style.bottom).toBe(
        `${(CHAT_BOTTOM_GAP - maxScroll) * SCALE}px`,
      );
    });
  });

  describe('dragging the scrollbar', () => {
    // 300 cache px of lines: a 302-tall scroll over a 114 view, so 188 to scroll and a 30px
    // dragger that sits at 68 down the scrollbar while pinned to the newest line.
    const contentHeight = 300;
    const maxScroll = contentHeight + CHAT_BOTTOM_GAP - FIXED_CHAT_SCROLLAREA.height;
    const linesBottom = (fromBottom: number) => `${(CHAT_BOTTOM_GAP - fromBottom) * SCALE}px`;

    /**
     * The scrollbar drawn at `top` in the window, through an outer transform of `outer` on top of
     * the chat's own `SCALE` (a fitted replay's frame), so a cache pixel is `SCALE * outer` client px.
     */
    const setUp = (transparent: boolean, outer = 1, top = 0) => {
      stubLinesHeight(contentHeight);
      vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (this: HTMLElement) {
        if (this.classList.contains('chatbox__lines')) return clientBox(0, 0, 0, contentHeight * SCALE * outer);
        if (this.classList.contains('chatbox__scrollbar')) {
          const unit = SCALE * outer;
          return clientBox(0, top, FIXED_CHAT_SCROLLBAR.width * unit, FIXED_CHAT_SCROLLBAR.height * unit);
        }
        return clientBox(0, 0, 0, 0);
      });
      renderChatbox(true, vi.fn(), SOL_LINES, transparent);
      const trough = document.querySelector<HTMLElement>('.chatbox__trough');
      if (!trough) throw new Error('no trough');
      return { trough, column: () => document.querySelector<HTMLElement>('.chatbox__lines') };
    };

    it.each([
      false,
      true,
    ])('carries the dragger with the pointer and pins again at the bottom (transparent %s)', (transparent) => {
      const { trough, column } = setUp(transparent);
      expect(chatScrollGeometry(contentHeight, 0).thumbTop).toBe(68);

      // Taken 2px into the dragger, then dragged to the top of the trough.
      act(() => {
        fireEvent.pointerDown(trough, { button: 0, pointerId: 1, clientY: 70 * SCALE });
      });
      act(() => {
        fireEvent.pointerMove(trough, { pointerId: 1, clientY: (FIXED_CHAT_SCROLL_ARROW + 2) * SCALE });
      });
      expect(column()?.style.bottom).toBe(linesBottom(maxScroll));

      // Past the bottom is clamped, and the bottom is the newest line again.
      act(() => {
        fireEvent.pointerMove(trough, { pointerId: 1, clientY: 500 * SCALE });
      });
      expect(column()?.style.bottom).toBe(linesBottom(0));

      act(() => {
        fireEvent.pointerUp(trough, { pointerId: 1, clientY: 500 * SCALE });
        fireEvent.pointerMove(trough, { pointerId: 1, clientY: 20 * SCALE });
      });
      expect(column()?.style.bottom).toBe(linesBottom(0));
    });

    it('jumps the dragger to center on a press in the trough', () => {
      // The dragger is picked up at half its height. At 50 the 30px dragger's top lands 50 - 15 - 16 = 19 down the trough: scroll 19 * 188 / 52 = 68.
      const { trough, column } = setUp(false);
      act(() => {
        fireEvent.pointerDown(trough, { button: 0, pointerId: 1, clientY: 50 * SCALE });
      });
      expect(column()?.style.bottom).toBe(linesBottom(maxScroll - 68));
    });

    it('follows the pointer through a fitted replay scaled apart from the chat', () => {
      // Outer 0.5 over the chat's 2x: one cache px is one client px, from wherever the scrollbar is.
      const outer = 0.5;
      const top = 300;
      const at = (cacheY: number) => top + cacheY * SCALE * outer;
      const { trough, column } = setUp(false, outer, top);

      // The same jump as above: 50 down the scrollbar is a scroll of 68 below the oldest line.
      act(() => {
        fireEvent.pointerDown(trough, { button: 0, pointerId: 1, clientY: at(50) });
      });
      expect(column()?.style.bottom).toBe(linesBottom(maxScroll - 68));

      // Dragged to the top of the trough, the oldest line: the full 300 measured, not 150.
      act(() => {
        fireEvent.pointerMove(trough, { pointerId: 1, clientY: at(FIXED_CHAT_SCROLL_ARROW - 20) });
      });
      expect(column()?.style.bottom).toBe(linesBottom(maxScroll));
    });
  });

  describe('click through the transparent chatbox', () => {
    const renderInLayer = (transparent: boolean, clickThrough: boolean) => {
      const placement = chatboxPlacement({
        layout: 'modern',
        visible: true,
        frame: { width: 1280, height: 760 },
        fixedScale: 1,
        resizableScale: SCALE,
        insetLeft: 0,
      });
      if (!placement) throw new Error('modern has a chatbox');
      const scene = document.createElement('div');
      scene.className = 'scene';
      // The viewport inside the scene's box is what the wheel lands on.
      const canvas = document.createElement('canvas');
      scene.append(canvas);
      document.body.append(scene);
      render(
        <div className="overlay-layer">
          <Chatbox
            rect={placement.rect}
            scale={placement.scale}
            visible
            transparent={transparent}
            clickThrough={clickThrough}
            sceneRef={{ current: scene }}
            onToggle={vi.fn()}
            messages={SOL_LINES}
          />
        </div>,
      );
      return scene;
    };

    it('takes the message area out of hit-testing only while transparent and clicking through', () => {
      renderInLayer(true, true);
      expect(document.querySelector('.chatbox')?.classList.contains('chatbox--click-through')).toBe(true);

      document.body.innerHTML = '';
      renderInLayer(true, false);
      expect(document.querySelector('.chatbox')?.classList.contains('chatbox--click-through')).toBe(false);

      document.body.innerHTML = '';
      renderInLayer(false, true);
      expect(document.querySelector('.chatbox')?.classList.contains('chatbox--click-through')).toBe(false);
    });

    it('keeps the controls row, All, Collapse and the scrollbar hit-testable', () => {
      // happy-dom does not hit-test, so the contract is the stylesheet's.
      const css = readFileSync(join(__dirname, '..', 'Chatbox.css'), 'utf8').replace(/\s+/g, ' ');
      expect(css).toContain('.chatbox--click-through { pointer-events: none; }');
      for (const part of ['controls', 'tab--toggle', 'report', 'scrollbar']) {
        expect(css).toContain(`.chatbox--click-through .chatbox__${part}`);
      }
      expect(css).toMatch(/\.chatbox--click-through \.chatbox__scrollbar \{ pointer-events: auto; \}/);
    });

    /**
     * The chatbox drawn with its top-left at (`left`, `top`) in the window, `unit` client px to a
     * cache px: the chat's own scale times any outer transform on the frame.
     */
    const stubChatOnScreen = (left: number, top: number, unit: number) => {
      stubLinesHeight(300);
      vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (this: HTMLElement) {
        if (this.classList.contains('chatbox')) {
          return clientBox(left, top, FIXED_CHAT.width * unit, FIXED_CHAT.height * unit);
        }
        if (this.classList.contains('chatbox__scrollarea')) {
          return clientBox(
            left + FIXED_CHAT_SCROLLAREA.x * unit,
            top + (FIXED_CHAT_SCROLLAREA.y - FIXED_CHAT.y) * unit,
            FIXED_CHAT_SCROLLAREA.width * unit,
            FIXED_CHAT_SCROLLAREA.height * unit,
          );
        }
        return clientBox(0, 0, 0, 0);
      });
    };
    const column = () => document.querySelector<HTMLElement>('.chatbox__lines');
    const scrolledOneNotch = `${(CHAT_BOTTOM_GAP - 45) * SCALE}px`;
    const wheelAt = (target: Element, clientX: number, clientY: number) => {
      const event = new WheelEvent('wheel', { deltaY: -100, deltaMode: 0, bubbles: true, cancelable: true });
      // happy-dom's WheelEvent drops clientX/clientY from its init dict.
      Object.defineProperties(event, { clientX: { value: clientX }, clientY: { value: clientY } });
      act(() => {
        target.dispatchEvent(event);
      });
      return event;
    };
    const sceneCanvas = (scene: HTMLElement) => {
      const canvas = scene.querySelector('canvas');
      if (!canvas) throw new Error('no scene canvas');
      return canvas;
    };

    it('scrolls the chat with a wheel that lands on the scene under the message area, and keeps it off the scene', () => {
      // Modern 1280x760 at 2x: the chatbox from (0, 430).
      stubChatOnScreen(0, 430, SCALE);
      const scene = renderInLayer(true, true);
      const sceneWheel = vi.fn();
      scene.addEventListener('wheel', sceneWheel);

      const onLines = wheelAt(sceneCanvas(scene), 200, 500);
      expect(onLines.defaultPrevented).toBe(true);
      expect(sceneWheel).not.toHaveBeenCalled();
      expect(column()?.style.bottom).toBe(scrolledOneNotch);

      // Above the chatbox it is the scene's: the camera zoom.
      const above = wheelAt(sceneCanvas(scene), 200, 300);
      expect(above.defaultPrevented).toBe(false);
      expect(sceneWheel).toHaveBeenCalledOnce();
    });

    it('leaves the wheel to a dialog mounted elsewhere that overlaps the message area', () => {
      // A modal's body, portalled outside the frame's overlay layer, over the chat.
      stubChatOnScreen(0, 430, SCALE);
      const scene = renderInLayer(true, true);
      const dialog = document.createElement('div');
      dialog.className = 'modifiers-modal-body';
      document.body.append(dialog);
      const dialogWheel = vi.fn();
      dialog.addEventListener('wheel', dialogWheel);

      const onDialog = wheelAt(dialog, 200, 500);
      expect(onDialog.defaultPrevented).toBe(false);
      expect(dialogWheel).toHaveBeenCalledOnce();
      expect(column()?.style.bottom).toBe(`${CHAT_BOTTOM_GAP * SCALE}px`);

      // The scene under the same point is still the chat's.
      expect(wheelAt(sceneCanvas(scene), 200, 500).defaultPrevented).toBe(true);
      expect(column()?.style.bottom).toBe(scrolledOneNotch);
    });

    it('finds the message area through a fitted replay frame scaled apart from the chat', () => {
      // transform: scale(0.5) on the frame over the chat's 2x: a cache px is one client px, and
      // the chat sits at (40, 600) in the window.
      stubChatOnScreen(40, 600, SCALE * 0.5);
      const scene = renderInLayer(true, true);
      const sceneWheel = vi.fn();
      scene.addEventListener('wheel', sceneWheel);

      // 60 cache px down: on the lines.
      expect(wheelAt(sceneCanvas(scene), 140, 660).defaultPrevented).toBe(true);
      expect(column()?.style.bottom).toBe(scrolledOneNotch);

      // 150 cache px down is the controls row, under the 142px chat area: not the message area's.
      // Divided by the chat's scale alone, the area would run on to 284 client px down.
      const onControls = wheelAt(sceneCanvas(scene), 140, 750);
      expect(onControls.defaultPrevented).toBe(false);
      expect(sceneWheel).toHaveBeenCalledOnce();
      expect(column()?.style.bottom).toBe(scrolledOneNotch);
    });
  });
});

describe('chatScrollFromDragger', () => {
  const content = 300;
  const { maxScroll, thumbHeight } = chatScrollGeometry(content, 0);
  const travel = FIXED_CHAT_SCROLLBAR.height - FIXED_CHAT_SCROLL_ARROW * 2 - thumbHeight;

  it('maps the top of the trough to the oldest line and the bottom back to the newest', () => {
    expect(chatScrollFromDragger(content, 0)).toBe(maxScroll);
    expect(chatScrollFromDragger(content, travel)).toBe(0);
  });

  it('clamps a dragger pulled past either end', () => {
    expect(chatScrollFromDragger(content, -40)).toBe(maxScroll);
    expect(chatScrollFromDragger(content, travel + 40)).toBe(0);
  });

  it('scales the offset in truncating integer arithmetic', () => {
    expect(chatScrollFromDragger(content, 19)).toBe(maxScroll - Math.trunc((19 * maxScroll) / travel));
  });

  it('has nothing to scroll while the chat fits', () => {
    expect(chatScrollFromDragger(3 * 14, 20)).toBe(0);
  });
});

describe('chatScrollGeometry', () => {
  const viewport = FIXED_CHAT_SCROLLAREA.height;
  const trough = FIXED_CHAT_SCROLLBAR.height - FIXED_CHAT_SCROLL_ARROW * 2;

  it('fills the whole trough while the chat fits', () => {
    expect(chatScrollGeometry(3 * 14, 0)).toMatchObject({
      scrollY: 0,
      maxScroll: 0,
      linesBottom: CHAT_BOTTOM_GAP,
      thumbTop: FIXED_CHAT_SCROLL_ARROW,
      thumbHeight: trough,
    });
  });

  it('sizes the dragger by the visible fraction and parks it at the bottom when pinned', () => {
    const content = 40 * 14;
    const scrollHeight = content + CHAT_BOTTOM_GAP;
    const thumbHeight = Math.trunc((trough * viewport) / scrollHeight);
    const geometry = chatScrollGeometry(content, 0);

    expect(geometry.thumbHeight).toBe(thumbHeight);
    expect(geometry.thumbTop + geometry.thumbHeight).toBe(FIXED_CHAT_SCROLL_ARROW + trough);
    expect(geometry.linesBottom).toBe(CHAT_BOTTOM_GAP);
  });

  it('never shrinks the dragger below its minimum', () => {
    expect(chatScrollGeometry(100 * 14 * 4, 0).thumbHeight).toBe(FIXED_CHAT_SCROLL_THUMB_MIN);
  });

  it('clamps a stale distance from the bottom to the top of the history', () => {
    const geometry = chatScrollGeometry(20 * 14, 10_000);

    expect(geometry.scrollY).toBe(0);
    expect(geometry.fromBottom).toBe(geometry.maxScroll);
    expect(geometry.thumbTop).toBe(FIXED_CHAT_SCROLL_ARROW);
  });
});
