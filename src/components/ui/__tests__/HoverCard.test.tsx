// @vitest-environment happy-dom

import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { useRef } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useHoverCard } from '../HoverCard';

const TEXT = 'What this control does.';

/** A focusable trigger that is its own region, on every default: open on focus, toggle on a tap. */
function Trigger() {
  const ref = useRef<HTMLButtonElement>(null);
  const { card } = useHoverCard({ content: TEXT, anchorRef: ref, cardId: 'card' });
  return (
    <>
      <button ref={ref} type="button">
        Trigger
      </button>
      <button type="button">Elsewhere</button>
      {card}
    </>
  );
}

const card = () => document.querySelector('[role="tooltip"]');

function focus(element: HTMLElement): void {
  act(() => {
    element.focus();
  });
}

/**
 * A tap as Chrome on Android delivers it: the press, its release, then the focus a tap brings to a
 * button (a frame or more after the press), then the click. iOS sends no focus.
 */
function tap(target: HTMLElement, { focuses = true } = {}): void {
  fireEvent.pointerEnter(target, { pointerType: 'touch' });
  fireEvent.pointerDown(target, { pointerType: 'touch' });
  act(() => {
    vi.advanceTimersByTime(50);
  });
  fireEvent.pointerUp(target, { pointerType: 'touch' });
  fireEvent.pointerLeave(target, { pointerType: 'touch' });
  if (focuses && document.activeElement !== target) focus(target);
  fireEvent.click(target);
  act(() => {
    vi.advanceTimersByTime(50);
  });
}

function setup() {
  render(<Trigger />);
  return {
    trigger: screen.getByRole('button', { name: 'Trigger' }),
    elsewhere: screen.getByRole('button', { name: 'Elsewhere' }),
  };
}

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe('useHoverCard on a focusable trigger', () => {
  it.each([
    ['Chrome, which focuses the trigger mid-tap', true],
    ['Safari, which does not', false],
  ])('opens on a tap and shuts on the next, whatever focus the tap brought (%s)', (_, focuses) => {
    const { trigger } = setup();

    tap(trigger, { focuses });
    expect(card()?.textContent).toBe(TEXT);

    tap(trigger, { focuses });
    expect(card()).toBeNull();

    tap(trigger, { focuses });
    expect(card()?.textContent).toBe(TEXT);
  });

  it('shuts a card keyboard focus opened on a tap', () => {
    const { trigger } = setup();

    focus(trigger);
    expect(card()).not.toBeNull();

    // The tap takes the card over from focus: the first opens it as a tap's, the next shuts it.
    tap(trigger);
    expect(card()).not.toBeNull();
    tap(trigger);
    expect(card()).toBeNull();
  });

  it('still opens on keyboard focus, and closes when it leaves', () => {
    const { trigger, elsewhere } = setup();

    focus(trigger);
    expect(card()?.textContent).toBe(TEXT);

    focus(elsewhere);
    expect(card()).toBeNull();
  });

  it('lets keyboard focus open after a tap that never clicked, or a key pressed mid-tap', () => {
    const { trigger, elsewhere } = setup();

    // A touch that turned into a scroll, its card then shut by a press elsewhere.
    fireEvent.pointerDown(trigger, { pointerType: 'touch' });
    fireEvent.pointerCancel(trigger, { pointerType: 'touch' });
    act(() => {
      vi.advanceTimersByTime(50);
    });
    fireEvent.pointerDown(elsewhere, { pointerType: 'touch' });
    expect(card()).toBeNull();
    focus(trigger);
    expect(card()).not.toBeNull();

    focus(elsewhere);
    expect(card()).toBeNull();

    // A press whose gesture is still pending when the keyboard takes over.
    fireEvent.pointerDown(trigger, { pointerType: 'touch' });
    expect(card()).not.toBeNull();
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(card()).toBeNull();
    focus(trigger);
    expect(card()).not.toBeNull();
  });
});

describe('useHoverCard card width', () => {
  // happy-dom has no layout, so this stands one in for the card: copy whose single line is
  // `inkWidth` px long, wrapping into lines of at most the card's width, under a 176px ceiling,
  // with no word longer than 40px. Height is lines x 16px plus 10px of padding and border.
  const CEILING = 176;
  const LONGEST_WORD = 40;
  let inkWidth = 0;
  const usedWidth = (el: HTMLElement): number => {
    const { width, maxWidth } = el.style;
    if (width === 'min-content') return LONGEST_WORD;
    if (width.endsWith('px')) return Number.parseInt(width, 10);
    return maxWidth === 'none' ? inkWidth : Math.min(inkWidth, CEILING);
  };

  beforeEach(() => {
    vi.spyOn(HTMLElement.prototype, 'offsetHeight', 'get').mockImplementation(function (this: HTMLElement) {
      if (!this.classList.contains('hover-card')) return 0;
      return Math.ceil(inkWidth / usedWidth(this)) * 16 + 10;
    });
    const computed = window.getComputedStyle.bind(window);
    vi.spyOn(window, 'getComputedStyle').mockImplementation((el, pseudo) => {
      if (!(el instanceof HTMLElement) || !el.classList.contains('hover-card')) return computed(el, pseudo);
      return { width: `${usedWidth(el)}px` } as CSSStyleDeclaration;
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  function Card({ content }: { content: string }) {
    const ref = useRef<HTMLButtonElement>(null);
    const { card } = useHoverCard({ content, anchorRef: ref, cardId: 'card', forceOpen: true });
    return (
      <>
        <button ref={ref} type="button">
          Trigger
        </button>
        {card}
      </>
    );
  }

  const cardWidth = () => (card() as HTMLElement).style.width;

  it('leaves a one-line label at its own width', () => {
    inkWidth = 89;
    render(<Card content="Close Settings" />);
    expect(cardWidth()).toBe('');
  });

  it('narrows wrapped copy to the narrowest width that keeps its line count', () => {
    // Two lines at the 176px ceiling; 150px is the narrowest that still holds 300px in two.
    inkWidth = 300;
    render(<Card content="A hint long enough to wrap." />);
    expect(cardWidth()).toBe('150px');
  });

  it('refits when the copy changes while the card is open', () => {
    inkWidth = 300;
    const { rerender } = render(<Card content="A hint long enough to wrap." />);
    expect(cardWidth()).toBe('150px');

    // Five lines at the ceiling; 160px is the narrowest that holds 800px in five.
    inkWidth = 800;
    rerender(<Card content="An outcome, a good deal longer than the hint it replaced." />);
    expect(cardWidth()).toBe('160px');

    inkWidth = 60;
    rerender(<Card content="Short again." />);
    expect(cardWidth()).toBe('');
  });
});
