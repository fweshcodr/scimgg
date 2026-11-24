// @vitest-environment happy-dom

import { fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, type MockInstance, vi } from 'vitest';
import { stubMaxTouchPoints } from '../../test/helpers/maxTouchPoints';
import { TileMarkerColorPicker } from '../TileMarkerColorPicker';

function sliderFor(label: string): HTMLInputElement {
  const section = Array.from(document.querySelectorAll('.tile-marker-picker-section')).find((el) =>
    el.querySelector('.tile-marker-picker-section-label span')?.textContent?.startsWith(label),
  );
  const input = section?.querySelector<HTMLInputElement>('input[type="range"]');
  if (!input) throw new Error(`${label} slider not found`);
  return input;
}

function renderPicker(props: Partial<React.ComponentProps<typeof TileMarkerColorPicker>> = {}) {
  const onApply = vi.fn();
  render(
    <TileMarkerColorPicker
      isOpen
      anchor={{ x: 10, y: 10 }}
      initialColor="#3BA9FF"
      initialOpacity={1}
      onApply={onApply}
      onCancel={vi.fn()}
      {...props}
    />,
  );
  return { onApply };
}

describe('TileMarkerColorPicker fill opacity', () => {
  // The picker is shared with the line-marker, inventory-tag and NPC-tag flows,
  // none of which have a fill — the slider must stay opt-in.
  it('offers the fill slider only where a fill exists', () => {
    renderPicker();

    expect(() => sliderFor('Fill opacity')).toThrow();
    expect(() => sliderFor('Opacity')).not.toThrow();
  });

  it('applies the fill the slider was moved to, alongside the border opacity', () => {
    const { onApply } = renderPicker({ showFill: true, initialFillOpacity: 0.2 });

    expect(sliderFor('Fill opacity').value).toBe('0.2');

    fireEvent.change(sliderFor('Fill opacity'), { target: { value: '0.6' } });
    fireEvent.change(sliderFor('Opacity'), { target: { value: '0.4' } });
    fireEvent.click(screen.getByRole('button', { name: 'Apply' }));

    expect(onApply).toHaveBeenCalledWith('#3BA9FF', 0.4, 0.6);
  });

  // Without a fill section there is no fill to report, and passing the internal
  // state through anyway would silently give every line marker a fill.
  it('reports no fill when the section is hidden', () => {
    const { onApply } = renderPicker({ initialFillOpacity: 0.5 });

    fireEvent.click(screen.getByRole('button', { name: 'Apply' }));

    expect(onApply).toHaveBeenCalledWith('#3BA9FF', 1, 0);
  });
});

describe('TileMarkerColorPicker touch drag (fingers and pens)', () => {
  let matchMediaSpy: MockInstance<typeof window.matchMedia> | undefined;

  function stubPointers(kind: 'touch-only' | 'touchscreen-laptop'): void {
    matchMediaSpy = vi.spyOn(window, 'matchMedia').mockImplementation(
      (query: string) =>
        ({
          matches: kind === 'touch-only' && query.includes('coarse'),
          media: query,
          addEventListener: vi.fn(),
          removeEventListener: vi.fn(),
        }) as unknown as MediaQueryList,
    );
  }

  let restoreTouchPoints = () => {};

  afterEach(() => {
    matchMediaSpy?.mockRestore();
    matchMediaSpy = undefined;
    restoreTouchPoints();
    restoreTouchPoints = () => {};
  });

  function hueSurface(): HTMLElement {
    const hue = screen.getByRole('button', { name: 'Hue' });
    hue.getBoundingClientRect = () => new DOMRect(0, 0, 20, 360);
    return hue;
  }

  const FIRST_FINGER = { id: 1, primary: true };
  const SECOND_FINGER = { id: 2, primary: false };

  /** Returns the event, so a test can see whether the surface took the press over. */
  function touch(
    target: Element,
    type: 'pointerdown' | 'pointermove' | 'pointerup',
    y: number,
    finger = FIRST_FINGER,
    pointerType = 'touch',
  ): PointerEvent {
    const event = new PointerEvent(type, {
      bubbles: true,
      cancelable: true,
      pointerType,
      pointerId: finger.id,
      isPrimary: finger.primary,
      clientY: y,
    });
    fireEvent(target, event);
    return event;
  }

  const appliedColor = (onApply: ReturnType<typeof vi.fn>) => {
    fireEvent.click(screen.getByRole('button', { name: 'Apply' }));
    return onApply.mock.lastCall?.[0];
  };

  it('follows a finger dragged along the hue strip', () => {
    stubPointers('touch-only');
    const { onApply } = renderPicker({ initialColor: '#FF0000' });
    const hue = hueSurface();

    touch(hue, 'pointerdown', 0);
    touch(hue, 'pointermove', 120);
    touch(hue, 'pointerup', 120);
    // Lifted: later movement over the strip no longer drags.
    touch(hue, 'pointermove', 240);

    expect(appliedColor(onApply)).toBe('#00FF00');
  });

  it('keeps the drag with the first finger when a second one lands', () => {
    stubPointers('touch-only');
    const { onApply } = renderPicker({ initialColor: '#FF0000' });
    const hue = hueSurface();

    touch(hue, 'pointerdown', 0);
    touch(hue, 'pointerdown', 300, SECOND_FINGER);
    touch(hue, 'pointermove', 300, SECOND_FINGER);
    touch(hue, 'pointerup', 300, SECOND_FINGER);
    touch(hue, 'pointermove', 240);

    expect(appliedColor(onApply)).toBe('#0000FF');
  });

  it.each(['touch', 'pen'])('follows a %s on a touchscreen laptop too', (pointerType) => {
    stubPointers('touchscreen-laptop');
    restoreTouchPoints = stubMaxTouchPoints(10);
    const { onApply } = renderPicker({ initialColor: '#FF0000' });
    const hue = hueSurface();

    expect(touch(hue, 'pointerdown', 0, FIRST_FINGER, pointerType).defaultPrevented).toBe(true);
    touch(hue, 'pointermove', 120, FIRST_FINGER, pointerType);
    touch(hue, 'pointerup', 120, FIRST_FINGER, pointerType);

    expect(appliedColor(onApply)).toBe('#00FF00');
  });

  it.each([
    { pointer: 'a mouse', pointerType: 'mouse', maxTouchPoints: 10 },
    { pointer: 'a pen on a separate pad (no touchscreen)', pointerType: 'pen', maxTouchPoints: 0 },
  ])('leaves $pointer to the mouse drag path', ({ pointerType, maxTouchPoints }) => {
    stubPointers('touchscreen-laptop');
    restoreTouchPoints = stubMaxTouchPoints(maxTouchPoints);
    const { onApply } = renderPicker({ initialColor: '#FF0000' });
    const hue = hueSurface();

    expect(touch(hue, 'pointerdown', 0, FIRST_FINGER, pointerType).defaultPrevented).toBe(false);
    touch(hue, 'pointermove', 120, FIRST_FINGER, pointerType);

    expect(appliedColor(onApply)).toBe('#FF0000');
  });
});
