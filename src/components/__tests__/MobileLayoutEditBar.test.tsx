// @vitest-environment happy-dom

import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { EDIT_LAYOUT_HELP, MobileLayoutEditBar } from '../MobileLayoutEditBar';

const card = () => document.querySelector('[role="tooltip"]');

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe('MobileLayoutEditBar', () => {
  it('opens the hint from a tap anywhere on the "Editing layout" pill', () => {
    render(<MobileLayoutEditBar />);
    const pill = screen.getByRole('button', { name: /^Editing layout/ });
    expect(card()).toBeNull();

    // On the pill's word, not on its `?`.
    fireEvent.pointerEnter(pill, { pointerType: 'touch' });
    fireEvent.pointerDown(pill.querySelector('.layout-edit-pill__label') as HTMLElement, { pointerType: 'touch' });
    act(() => {
      vi.advanceTimersByTime(50);
    });
    fireEvent.pointerUp(pill, { pointerType: 'touch' });
    fireEvent.pointerLeave(pill, { pointerType: 'touch' });
    fireEvent.click(pill);

    expect(card()?.textContent).toBe(EDIT_LAYOUT_HELP);
  });

  it('names the pill with what the mode does, for a reader that cannot see the card', () => {
    render(<MobileLayoutEditBar />);
    expect(screen.getByRole('button', { name: `Editing layout. ${EDIT_LAYOUT_HELP}` })).toBeDefined();
  });
});
