// @vitest-environment happy-dom

import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { useRef, useState } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { InfoHint } from '../InfoHint';
import { OsrsCheckbox } from '../OsrsCheckbox';

const HINT = 'Manually track when the next set spawns.';

/** The shape every checkbox consumer uses: the checkbox and the mark side by side in one region. */
function HintedToggle({ onChange }: { onChange: (checked: boolean) => void }) {
  const [checked, setChecked] = useState(false);
  const regionRef = useRef<HTMLDivElement>(null);
  return (
    <>
      <div ref={regionRef} className="info-hint-region">
        <OsrsCheckbox
          checked={checked}
          onChange={(next) => {
            setChecked(next);
            onChange(next);
          }}
          label="Set Timer"
        />
        <InfoHint label="Set Timer" text={HINT} hoverRegionRef={regionRef} />
      </div>
      <button type="button">Elsewhere</button>
    </>
  );
}

function setup() {
  const onChange = vi.fn();
  render(<HintedToggle onChange={onChange} />);
  const checkbox = screen.getByRole('checkbox', { name: 'Set Timer' });
  const mark = screen.getByRole('button', { name: 'About Set Timer' });
  const region = checkbox.parentElement;
  if (!region) throw new Error('hint region did not render');
  return { onChange, checkbox, mark, region, elsewhere: screen.getByRole('button', { name: 'Elsewhere' }) };
}

const card = () => document.querySelector('[role="tooltip"]');

/**
 * A tap as Chrome on Android delivers it: the press, then its release and leave, then the focus a
 * tap brings to a button (a frame or more after the press), then the click. iOS sends no focus.
 */
function tap(target: HTMLElement, region: HTMLElement, { focuses = true } = {}): void {
  fireEvent.pointerEnter(region, { pointerType: 'touch' });
  fireEvent.pointerDown(target, { pointerType: 'touch' });
  act(() => {
    vi.advanceTimersByTime(50);
  });
  fireEvent.pointerUp(target, { pointerType: 'touch' });
  fireEvent.pointerLeave(region, { pointerType: 'touch' });
  if (focuses && document.activeElement !== target) focus(target);
  fireEvent.click(target);
}

/** Real focus, so `document.activeElement` and the blur that leaving brings are both real. */
function focus(element: HTMLElement): void {
  act(() => {
    element.focus();
  });
}

function hover(region: HTMLElement): void {
  fireEvent.pointerEnter(region, { pointerType: 'mouse' });
  act(() => {
    vi.advanceTimersByTime(100);
  });
}

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe('InfoHint on touch', () => {
  it('leaves a tap on the row to the row: the checkbox toggles once and no hint opens', () => {
    const { onChange, checkbox, region } = setup();

    tap(checkbox, region);
    act(() => {
      vi.runAllTimers();
    });

    expect(onChange).toHaveBeenCalledExactlyOnceWith(true);
    expect(card()).toBeNull();
  });

  it('does not open on a touch held on the row', () => {
    const { region } = setup();

    fireEvent.pointerEnter(region, { pointerType: 'touch' });
    fireEvent.pointerDown(region, { pointerType: 'touch' });
    act(() => {
      vi.advanceTimersByTime(2000);
    });

    expect(card()).toBeNull();
  });

  it.each([
    ['Chrome, which focuses the mark mid-tap', true],
    ['Safari, which does not', false],
  ])('opens from a tap on the mark without touching the checkbox, and shuts on a second tap (%s)', (_, focuses) => {
    const { onChange, mark, region } = setup();

    tap(mark, region, { focuses });
    expect(card()?.textContent).toBe(HINT);
    expect(mark).toHaveAttribute('aria-expanded', 'true');

    tap(mark, region, { focuses });
    expect(card()).toBeNull();
    expect(mark).toHaveAttribute('aria-expanded', 'false');

    tap(mark, region, { focuses });
    expect(card()).not.toBeNull();
    expect(onChange).not.toHaveBeenCalled();
  });

  it('shuts on a press outside, on a tap on the row, and on Escape', () => {
    const { onChange, checkbox, mark, region, elsewhere } = setup();

    tap(mark, region);
    fireEvent.pointerDown(elsewhere, { pointerType: 'touch' });
    expect(card()).toBeNull();

    tap(mark, region);
    tap(checkbox, region);
    expect(card()).toBeNull();
    expect(onChange).toHaveBeenCalledExactlyOnceWith(true);

    tap(mark, region);
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(card()).toBeNull();
  });

  it('reopens on the next tap after a dismissal, whatever focus the mark kept', () => {
    const { mark, region } = setup();

    tap(mark, region);
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(card()).toBeNull();
    // Escape keeps focus on the mark, so this tap brings none: the click alone must open it.
    expect(document.activeElement).toBe(mark);

    tap(mark, region);
    expect(card()).not.toBeNull();
  });

  it('forgets a press that never became a click', () => {
    const { mark, region } = setup();

    // A tap that turned into a scroll, begun while the card was open.
    tap(mark, region);
    fireEvent.pointerDown(mark, { pointerType: 'touch' });
    fireEvent.pointerCancel(mark, { pointerType: 'touch' });
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(card()).toBeNull();
    // Judged by the canceled press's "was open", this activation would shut a shut card.
    fireEvent.click(mark);
    expect(card()).not.toBeNull();
    fireEvent.keyDown(window, { key: 'Escape' });

    // A mouse press dragged off the mark before release.
    fireEvent.pointerDown(mark, { pointerType: 'mouse' });
    fireEvent.pointerLeave(mark, { pointerType: 'mouse' });
    fireEvent.click(mark);
    expect(card()).not.toBeNull();
  });

  it('treats a pen as touch', () => {
    const { mark } = setup();

    fireEvent.pointerDown(mark, { pointerType: 'pen' });
    fireEvent.click(mark);
    expect(card()).not.toBeNull();
  });
});

describe('InfoHint with a mouse', () => {
  it('opens after the dwell on the row and closes when the pointer leaves', () => {
    const { region } = setup();

    fireEvent.pointerEnter(region, { pointerType: 'mouse' });
    act(() => {
      vi.advanceTimersByTime(40);
    });
    expect(card()).toBeNull();
    act(() => {
      vi.advanceTimersByTime(60);
    });
    expect(card()?.textContent).toBe(HINT);

    fireEvent.pointerLeave(region, { pointerType: 'mouse' });
    expect(card()).toBeNull();
  });

  it('leaves the hint to the hover when the mark is clicked, and the checkbox to its own click', () => {
    const { onChange, checkbox, mark, region } = setup();

    hover(region);
    fireEvent.pointerDown(mark, { pointerType: 'mouse' });
    focus(mark);
    fireEvent.click(mark);
    expect(card()).not.toBeNull();

    fireEvent.pointerDown(checkbox, { pointerType: 'mouse' });
    fireEvent.click(checkbox);
    expect(onChange).toHaveBeenCalledExactlyOnceWith(true);
    expect(card()).not.toBeNull();

    fireEvent.pointerLeave(region, { pointerType: 'mouse' });
    expect(card()).toBeNull();
  });
});

describe('InfoHint from the keyboard', () => {
  it('closes what Enter opened when focus leaves the mark', () => {
    const { mark, elsewhere } = setup();

    focus(mark);
    fireEvent.keyDown(window, { key: 'Escape' });
    fireEvent.keyDown(mark, { key: 'Enter' });
    fireEvent.click(mark);
    expect(card()).not.toBeNull();

    focus(elsewhere);
    expect(card()).toBeNull();
  });

  it("keeps open what an assistive technology's activation opens, focus and click together", () => {
    const { mark } = setup();

    // A screen reader's activation moves focus and clicks with no key or pointer before it; the
    // focus opens the card first, and the click must not read that as an open to shut.
    focus(mark);
    fireEvent.click(mark);
    expect(card()).not.toBeNull();

    fireEvent.click(mark);
    expect(card()).toBeNull();
  });
});

describe('InfoHint with mixed input', () => {
  it('shuts a card a mouse opened on one tap, and keeps a tapped card through a mouse passing over', () => {
    const { mark, region, elsewhere } = setup();

    hover(region);
    expect(card()).not.toBeNull();
    tap(mark, region);
    expect(card()).toBeNull();

    tap(mark, region);
    expect(card()).not.toBeNull();
    hover(region);
    fireEvent.pointerLeave(region, { pointerType: 'mouse' });
    expect(card()).not.toBeNull();

    fireEvent.pointerDown(elsewhere, { pointerType: 'touch' });
    expect(card()).toBeNull();
  });

  it('still opens on mouse hover after touch has been used', () => {
    const { checkbox, region } = setup();

    tap(checkbox, region);
    expect(card()).toBeNull();

    hover(region);
    expect(card()).not.toBeNull();
  });
});
