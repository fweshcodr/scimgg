// @vitest-environment happy-dom

import { act, cleanup, render } from '@testing-library/react';
import { useRef } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useCenteredModalSnap } from '../useCenteredModalSnap';

const X = '--centered-modal-snap-x';
const Y = '--centered-modal-snap-y';
let origin = { x: 338.5, y: 49.5 };
let fullscreen = false;
let transform = 'none';
let quantizeOffsets = false;
let densityListeners: Set<() => void>;
let observers: TestResizeObserver[];

class TestResizeObserver {
  targets: Element[] = [];
  disconnect = vi.fn();
  constructor(readonly callback: ResizeObserverCallback) {
    observers.push(this);
  }
  observe(target: Element) {
    this.targets.push(target);
  }
  notify() {
    act(() => this.callback([], this as unknown as ResizeObserver));
  }
}

function Fixture({ open = true }: { open?: boolean }) {
  const ref = useRef<HTMLDivElement>(null);
  useCenteredModalSnap(ref, open);
  return open ? (
    <div data-testid="overlay">
      <div ref={ref} className="fixture centered-modal-snap" data-testid="card">
        <span>Text</span>
      </div>
    </div>
  ) : null;
}

beforeEach(() => {
  origin = { x: 338.5, y: 49.5 };
  fullscreen = false;
  transform = 'none';
  quantizeOffsets = false;
  densityListeners = new Set();
  observers = [];
  vi.stubGlobal('devicePixelRatio', 1);
  vi.stubGlobal('ResizeObserver', TestResizeObserver);
  vi.stubGlobal(
    'matchMedia',
    vi.fn(() => ({
      addEventListener: (_event: string, listener: () => void) => densityListeners.add(listener),
      removeEventListener: (_event: string, listener: () => void) => densityListeners.delete(listener),
    })),
  );
  const originalStyle = window.getComputedStyle.bind(window);
  vi.spyOn(window, 'getComputedStyle').mockImplementation((element) => {
    const style = originalStyle(element);
    if (!element.classList.contains('fixture')) return style;
    return new Proxy(style, {
      get(target, property) {
        if (property === 'transform') return transform;
        if (property === 'left')
          return fullscreen ? '0px' : (element as HTMLElement).style.getPropertyValue(X) || '0px';
        if (property === 'top') return fullscreen ? '0px' : (element as HTMLElement).style.getPropertyValue(Y) || '0px';
        return Reflect.get(target, property);
      },
    });
  });
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (this: HTMLElement) {
    const style = getComputedStyle(this);
    const offset = (value: string) => {
      const parsed = Number.parseFloat(value) || 0;
      return quantizeOffsets ? Math.round(parsed * 64) / 64 : parsed;
    };
    return DOMRect.fromRect({
      x: origin.x + offset(style.left),
      y: origin.y + offset(style.top),
      width: 922,
      height: 802,
    });
  });
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  observers = [];
  densityListeners.clear();
  fullscreen = false;
  transform = 'none';
  quantizeOffsets = false;
  origin = { x: 0, y: 0 };
});

describe('useCenteredModalSnap', () => {
  it('aligns before paint and is idempotent after subtracting the applied correction', () => {
    const view = render(<Fixture />);
    const card = view.getByTestId('card');
    expect(card.style.getPropertyValue(X)).toBe('0.5px');
    expect(card.style.getPropertyValue(Y)).toBe('0.5px');
    expect(observers).toHaveLength(1);
    expect(observers[0].targets).toEqual([card, view.getByTestId('overlay')]);
    const write = vi.spyOn(card.style, 'setProperty');
    observers[0].notify();
    observers[0].notify();
    act(() => window.dispatchEvent(new Event('resize')));
    expect(write).not.toHaveBeenCalled();
    expect(card.getBoundingClientRect().left).toBe(339);
  });

  it('remeasures card/content, overlay available space and window resizes', () => {
    const view = render(<Fixture />);
    const card = view.getByTestId('card');
    origin = { x: 338.25, y: 68.75 };
    observers[0].notify();
    expect(card.style.getPropertyValue(X)).toBe('-0.25px');
    expect(card.style.getPropertyValue(Y)).toBe('0.25px');
    origin = { x: 340, y: 70 };
    act(() => window.dispatchEvent(new Event('resize')));
    expect(card.style.getPropertyValue(X)).toBe('0px');
    expect(card.style.getPropertyValue(Y)).toBe('0px');
  });

  it('does not alternate when layout quantizes the requested fractional-DPR offset', () => {
    vi.stubGlobal('devicePixelRatio', 1.25);
    quantizeOffsets = true;
    origin = { x: 338.5, y: 73.5 };
    const view = render(<Fixture />);
    const card = view.getByTestId('card');
    const initial = card.getBoundingClientRect();
    const write = vi.spyOn(card.style, 'setProperty');
    for (let i = 0; i < 8; i++) {
      observers[0].notify();
      act(() => window.dispatchEvent(new Event('resize')));
    }
    expect(write).not.toHaveBeenCalled();
    expect(card.getBoundingClientRect()).toEqual(initial);
    expect(initial.left).toBeCloseTo(338.4, 1);
    expect(initial.top).toBeCloseTo(73.6, 1);
  });

  it.each([1, 1.25, 2, 3])('uses the actual uncapped DPR %s', (dpr) => {
    vi.stubGlobal('devicePixelRatio', dpr);
    origin = { x: 338.3, y: 49.3 };
    const view = render(<Fixture />);
    const rect = view.getByTestId('card').getBoundingClientRect();
    expect(rect.left * dpr).toBeCloseTo(Math.round(origin.x * dpr));
    expect(rect.top * dpr).toBeCloseTo(Math.round(origin.y * dpr));
  });

  it('updates on monitor density changes and rebinds the resolution listener', () => {
    const view = render(<Fixture />);
    expect(densityListeners.size).toBe(1);
    act(() => {
      vi.stubGlobal('devicePixelRatio', 2);
      for (const listener of [...densityListeners]) listener();
    });
    expect(view.getByTestId('card').style.getPropertyValue(X)).toBe('0px');
    expect(observers[0].disconnect).toHaveBeenCalledOnce();
    expect(densityListeners.size).toBe(1);
  });

  it('only observes while open, cleans up offsets and listeners, and remeasures on reopen', () => {
    const view = render(<Fixture open={false} />);
    expect(observers).toHaveLength(0);
    view.rerender(<Fixture />);
    const card = view.getByTestId('card');
    const observer = observers[0];
    view.rerender(<Fixture open={false} />);
    expect(observer.disconnect).toHaveBeenCalledOnce();
    expect(card.style.getPropertyValue(X)).toBe('');
    const write = vi.spyOn(card.style, 'setProperty');
    act(() => {
      window.dispatchEvent(new Event('resize'));
      card.dispatchEvent(new Event('animationend'));
    });
    expect(write).not.toHaveBeenCalled();
    origin = { x: 200.25, y: 30.25 };
    view.rerender(<Fixture />);
    expect(view.getByTestId('card').style.getPropertyValue(X)).toBe('-0.25px');
    view.unmount();
    expect(observers[1].disconnect).toHaveBeenCalledOnce();
    expect(densityListeners.size).toBe(0);
  });

  it.each(['animationend', 'animationcancel'])('waits for its own entrance %s, ignoring child events', (event) => {
    transform = 'matrix(1, 0, 0, 1, 0, 12)';
    const view = render(<Fixture />);
    const card = view.getByTestId('card');
    expect(card.style.getPropertyValue(X)).toBe('');
    transform = 'none';
    act(() => card.firstElementChild?.dispatchEvent(new Event(event, { bubbles: true })));
    expect(card.style.getPropertyValue(X)).toBe('');
    act(() => card.dispatchEvent(new Event(event)));
    expect(card.style.getPropertyValue(X)).toBe('0.5px');
  });

  it('subtracts the applied zero, not a stale requested offset, across fullscreen and desktop return', () => {
    const view = render(<Fixture />);
    const card = view.getByTestId('card');
    expect(card.style.getPropertyValue(X)).toBe('0.5px');
    fullscreen = true;
    origin = { x: 0, y: 0 };
    observers[0].notify();
    expect(card.style.getPropertyValue(X)).toBe('0px');
    expect(card.style.getPropertyValue(Y)).toBe('0px');
    fullscreen = false;
    origin = { x: 338.5, y: 49.5 };
    observers[0].notify();
    expect(card.style.getPropertyValue(X)).toBe('0.5px');
    expect(card.getBoundingClientRect().left).toBe(339);
  });
});
