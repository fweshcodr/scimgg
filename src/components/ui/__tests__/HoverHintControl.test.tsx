// @vitest-environment happy-dom

import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { createRef } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { HoverHintButton, HoverHintLink, HoverHintRegion } from '../HoverHintControl';

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe('icon control hover hints', () => {
  it.each(['button', 'link'])('blocks an ancestor native title on a custom-hint %s', (kind) => {
    vi.useFakeTimers();
    render(
      <div title="Auto-size explanation">
        {kind === 'button' ? (
          <HoverHintButton aria-label="Reset to default">↻</HoverHintButton>
        ) : (
          <HoverHintLink href="https://example.com" aria-label="Open documentation">
            ?
          </HoverHintLink>
        )}
      </div>,
    );
    const control = screen.getByRole(kind);
    fireEvent.pointerEnter(control, { pointerType: 'mouse' });
    act(() => vi.advanceTimersByTime(0));
    expect(screen.getByRole('tooltip')).toHaveTextContent(control.getAttribute('aria-label') ?? '');
    // An explicit empty title is the HTML opt-out of ancestor tooltip inheritance.
    expect(control.closest('[title]')).toHaveAttribute('title', '');
    expect(control).toHaveAttribute('title', '');
  });

  it('uses the shared card on the zero-delay timer, preserving handlers and ref', () => {
    vi.useFakeTimers();
    const ref = createRef<HTMLButtonElement>();
    const onClick = vi.fn();
    render(
      <HoverHintButton ref={ref} aria-label="Enable XP drops" onClick={onClick}>
        +
      </HoverHintButton>,
    );
    const button = screen.getByRole('button', { name: 'Enable XP drops' });
    expect(ref.current).toBe(button);
    fireEvent.pointerEnter(button, { pointerType: 'mouse' });
    act(() => vi.advanceTimersByTime(0));
    expect(screen.getByRole('tooltip')).toHaveTextContent('Enable XP drops');
    expect(screen.getByRole('tooltip')).toHaveClass('hover-card', 'hover-card--instant');
    fireEvent.pointerDown(button, { pointerType: 'mouse' });
    expect(screen.queryByRole('tooltip')).toBeNull();
    fireEvent.click(button);
    expect(onClick).toHaveBeenCalledOnce();
  });

  it.each(['touch', 'pen'])('never opens on %s enter, press, click or focus', (pointerType) => {
    vi.useFakeTimers();
    render(<HoverHintButton aria-label="Open tools">+</HoverHintButton>);
    const button = screen.getByRole('button');
    fireEvent.pointerEnter(button, { pointerType });
    fireEvent.pointerDown(button, { pointerType });
    fireEvent.focus(button);
    fireEvent.click(button);
    act(() => vi.advanceTimersByTime(1000));
    expect(screen.queryByRole('tooltip')).toBeNull();
  });

  it('removes a native title attribute and allows a shorter link hint than its accessible name', () => {
    vi.useFakeTimers();
    render(
      <HoverHintLink href="https://example.com/" aria-label="Open the project documentation" title="Docs" hint="Docs">
        ↗
      </HoverHintLink>,
    );
    const link = screen.getByRole('link', { name: 'Open the project documentation' });
    expect(link).toHaveAttribute('title', '');
    fireEvent.pointerEnter(link, { pointerType: 'mouse' });
    act(() => vi.advanceTimersByTime(0));
    expect(screen.getByRole('tooltip')).toHaveTextContent('Docs');
    fireEvent.pointerLeave(link, { pointerType: 'mouse' });
    expect(screen.queryByRole('tooltip')).toBeNull();
  });

  it('keeps a disabled control explanation on its existing hoverable wrapper', () => {
    vi.useFakeTimers();
    render(
      <HoverHintRegion hint="The run is over" data-testid="wrapper">
        <button type="button" disabled>
          Take Over
        </button>
      </HoverHintRegion>,
    );
    fireEvent.pointerEnter(screen.getByTestId('wrapper'), { pointerType: 'mouse' });
    act(() => vi.advanceTimersByTime(0));
    expect(screen.getByRole('tooltip')).toHaveTextContent('The run is over');
  });

  it('renders no hint while the control is showing its label', () => {
    vi.useFakeTimers();
    render(
      <HoverHintButton aria-label="Exit replay" hint={null}>
        Exit
      </HoverHintButton>,
    );
    fireEvent.pointerEnter(screen.getByRole('button'), { pointerType: 'mouse' });
    act(() => vi.advanceTimersByTime(0));
    expect(screen.queryByRole('tooltip')).toBeNull();
  });
});
