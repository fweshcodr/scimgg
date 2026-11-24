// @vitest-environment happy-dom

import { act, fireEvent, render } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { PANEL_DRAG_END_EVENT, PANEL_DRAG_START_EVENT } from '../../DraggablePanel';
import { HintBar } from '../HintBar';

function renderHintBar(insets?: { left: number; right: number }) {
  const result = render(<HintBar insets={insets} />);
  const anchor = result.container.querySelector('.hint-bar-anchor');
  if (!(anchor instanceof HTMLDivElement)) throw new Error('missing hint-bar anchor');
  return { ...result, anchor };
}

describe('HintBar', () => {
  it('centers in the part of the frame the sidebars leave visible', () => {
    expect(renderHintBar({ left: 320, right: 0 }).anchor.style).toMatchObject({ left: '320px', right: '0px' });
  });

  it('spans the whole frame from its stylesheet without insets', () => {
    expect(renderHintBar().anchor.getAttribute('style')).toBeNull();
  });

  it('does not expose data-visible on initial render', () => {
    const { anchor } = renderHintBar();

    expect(anchor.hasAttribute('data-visible')).toBe(false);
  });

  it('shows while Alt is held', () => {
    const { anchor } = renderHintBar();

    fireEvent.keyDown(window, { key: 'Alt' });

    expect(anchor.getAttribute('data-visible')).toBe('true');
  });

  it('hides after Alt is released', () => {
    const { anchor } = renderHintBar();

    fireEvent.keyDown(window, { key: 'Alt' });
    fireEvent.keyUp(window, { key: 'Alt' });

    expect(anchor.hasAttribute('data-visible')).toBe(false);
  });

  it('clears Alt state on window blur', () => {
    const { anchor } = renderHintBar();

    fireEvent.keyDown(window, { key: 'Alt' });
    act(() => {
      window.dispatchEvent(new Event('blur'));
    });

    expect(anchor.hasAttribute('data-visible')).toBe(false);
  });

  it('shows during panel drag even without Alt and hides when drag ends', () => {
    const { anchor } = renderHintBar();

    act(() => {
      window.dispatchEvent(new Event(PANEL_DRAG_START_EVENT));
    });
    expect(anchor.getAttribute('data-visible')).toBe('true');

    act(() => {
      window.dispatchEvent(new Event(PANEL_DRAG_END_EVENT));
    });
    expect(anchor.hasAttribute('data-visible')).toBe(false);
  });

  it('prevents and stops Alt+letter browser shortcuts', () => {
    renderHintBar();
    const event = new KeyboardEvent('keydown', { key: 'd', altKey: true, bubbles: true, cancelable: true });
    const stopPropagation = vi.spyOn(event, 'stopPropagation');

    window.dispatchEvent(event);

    expect(event.defaultPrevented).toBe(true);
    expect(stopPropagation).toHaveBeenCalledOnce();
  });

  it('does not prevent Alt+Shift modifier-only snap chord', () => {
    renderHintBar();
    const event = new KeyboardEvent('keydown', {
      key: 'Shift',
      altKey: true,
      shiftKey: true,
      bubbles: true,
      cancelable: true,
    });

    window.dispatchEvent(event);

    expect(event.defaultPrevented).toBe(false);
  });

  it('does not prevent Alt+letter from editable inputs', () => {
    renderHintBar();
    const input = document.createElement('input');
    document.body.appendChild(input);
    const event = new KeyboardEvent('keydown', { key: 'd', altKey: true, bubbles: true, cancelable: true });

    input.dispatchEvent(event);

    expect(event.defaultPrevented).toBe(false);

    input.remove();
  });
});
