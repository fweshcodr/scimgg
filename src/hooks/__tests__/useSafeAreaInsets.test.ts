// @vitest-environment happy-dom

import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useSafeAreaInsets } from '../useSafeAreaInsets';

/** What `env(safe-area-inset-*)` resolves to on the probe; happy-dom cannot resolve it itself. */
let padding = { top: '0px', right: '0px', bottom: '0px', left: '0px' };

/** The hook's hidden, zero-sized measuring element (happy-dom drops the `env()` padding itself). */
function isProbe(element: Element): element is HTMLElement {
  return (
    element instanceof HTMLElement &&
    element.getAttribute('aria-hidden') === 'true' &&
    element.style.position === 'fixed' &&
    element.style.visibility === 'hidden'
  );
}

function probes(): HTMLElement[] {
  return [...document.body.children].filter(isProbe);
}

describe('useSafeAreaInsets', () => {
  beforeEach(() => {
    padding = { top: '0px', right: '0px', bottom: '0px', left: '0px' };
    const real = window.getComputedStyle.bind(window);
    vi.spyOn(window, 'getComputedStyle').mockImplementation((element, pseudo) => {
      const style = real(element, pseudo);
      if (!isProbe(element)) return style;
      return {
        ...style,
        paddingTop: padding.top,
        paddingRight: padding.right,
        paddingBottom: padding.bottom,
        paddingLeft: padding.left,
      } as CSSStyleDeclaration;
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
    for (const probe of probes()) probe.remove();
  });

  it('reads the insets, rounded to whole CSS pixels', () => {
    padding = { top: '0px', right: '47.4px', bottom: '20.6px', left: '47.5px' };
    const { result } = renderHook(() => useSafeAreaInsets());
    expect(result.current).toEqual({ top: 0, right: 47, bottom: 21, left: 48 });
  });

  it('is zero and measures nothing while disabled', () => {
    padding = { top: '10px', right: '10px', bottom: '10px', left: '10px' };
    const { result } = renderHook(() => useSafeAreaInsets(false));
    expect(result.current).toEqual({ top: 0, right: 0, bottom: 0, left: 0 });
    expect(probes()).toHaveLength(0);
  });

  it('re-reads on resize and orientation change, keeping the same object when nothing moved', () => {
    const { result } = renderHook(() => useSafeAreaInsets());
    const initial = result.current;
    act(() => window.dispatchEvent(new Event('resize')));
    expect(result.current).toBe(initial);

    // A phone rotated: the notch moves to the other side.
    padding = { top: '0px', right: '0px', bottom: '21px', left: '47px' };
    act(() => window.dispatchEvent(new Event('orientationchange')));
    expect(result.current).toEqual({ top: 0, right: 0, bottom: 21, left: 47 });
  });

  it('removes its probe and stops listening on unmount', () => {
    const { result, unmount } = renderHook(() => useSafeAreaInsets());
    expect(probes()).toHaveLength(1);
    const last = result.current;
    unmount();
    expect(probes()).toHaveLength(0);
    padding = { top: '9px', right: '9px', bottom: '9px', left: '9px' };
    window.dispatchEvent(new Event('resize'));
    expect(result.current).toBe(last);
  });
});
