// @vitest-environment happy-dom

import { render } from '@testing-library/react';
import { useRef } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { CHROME_RESIZE_TIMING, chromeZoomStyle, useZoomTransition } from '../chromeZoom';

function Zoomed({ zoom, enabled = true }: { zoom: number; enabled?: boolean }) {
  const ref = useRef<HTMLDivElement>(null);
  useZoomTransition(ref, zoom, 'left bottom', enabled);
  return <div ref={ref} data-testid="zoomed" style={chromeZoomStyle(zoom)} />;
}

describe('useZoomTransition', () => {
  const animate = vi.fn(() => ({ cancel: vi.fn(), onfinish: null }) as unknown as Animation);
  const originalAnimate = HTMLElement.prototype.animate;
  const originalMatchMedia = window.matchMedia;

  afterEach(() => {
    HTMLElement.prototype.animate = originalAnimate;
    window.matchMedia = originalMatchMedia;
    animate.mockClear();
  });

  function setup({ reduced = false } = {}) {
    HTMLElement.prototype.animate = animate;
    window.matchMedia = ((query: string) => ({ matches: reduced && query.includes('reduce') })) as never;
  }

  it('lays out at the new zoom at once and eases from the old painted size to none', () => {
    setup();
    const view = render(<Zoomed zoom={1.5} />);
    expect(animate).not.toHaveBeenCalled();
    view.rerender(<Zoomed zoom={2} />);
    const el = view.getByTestId('zoomed');
    // The layout is the committed zoom; the animation only ever ends on `none`, so at rest
    // the element is exactly that zoom with nothing transformed.
    expect(el.style.zoom).toBe('2');
    expect(el.style.getPropertyValue('--unscaled-px')).toBe('0.5px');
    expect(el.style.transformOrigin).toBe('left bottom');
    expect(animate).toHaveBeenCalledOnce();
    expect(animate).toHaveBeenCalledWith([{ transform: 'scale(0.75)' }, { transform: 'none' }], CHROME_RESIZE_TIMING);
  });

  it('changes size in one frame with reduced motion, and when disabled', () => {
    setup({ reduced: true });
    const reduced = render(<Zoomed zoom={1} />);
    reduced.rerender(<Zoomed zoom={2} />);
    expect(reduced.getByTestId('zoomed').style.zoom).toBe('2');
    reduced.unmount();

    setup();
    const disabled = render(<Zoomed zoom={1} enabled={false} />);
    disabled.rerender(<Zoomed zoom={2} enabled={false} />);
    expect(animate).not.toHaveBeenCalled();
  });

  it('cancels an in-flight transition when disabled without another zoom change', () => {
    setup();
    const view = render(<Zoomed zoom={1} />);
    view.rerender(<Zoomed zoom={2} />);
    const animation = animate.mock.results[0].value;

    view.rerender(<Zoomed zoom={2} enabled={false} />);
    expect(animation.cancel).toHaveBeenCalledOnce();
    expect(animate).toHaveBeenCalledOnce();
    expect(view.getByTestId('zoomed').style.zoom).toBe('2');

    view.rerender(<Zoomed zoom={2} />);
    expect(animate).toHaveBeenCalledOnce();
    view.unmount();
    expect(animation.cancel).toHaveBeenCalledOnce();
  });
});
