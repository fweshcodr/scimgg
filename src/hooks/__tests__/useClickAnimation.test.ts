// @vitest-environment happy-dom

import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../util/PreloadCache', () => {
  class MockPreloadCache<K, V> {
    private cache = new Map<K, V>();

    get(key: K): V | undefined {
      return this.cache.get(key);
    }

    async load(key: K): Promise<V> {
      const value = `data:image/webp;base64,${String(key)}` as V;
      this.cache.set(key, value);
      return value;
    }

    clear(): void {
      this.cache.clear();
    }
  }

  return { PreloadCache: MockPreloadCache };
});

import { triggerGlobalClickAnimation, useClickAnimation } from '../useClickAnimation';

describe('useClickAnimation', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    document.body.innerHTML = '';
  });

  it('mounts a viewport-local click image below overhead speech', () => {
    const container = document.createElement('div');
    vi.spyOn(container, 'getBoundingClientRect').mockReturnValue(new DOMRect(40, 60, 300, 200));
    document.body.appendChild(container);
    const containerRef = { current: container };

    const { result } = renderHook(() => useClickAnimation(containerRef));

    act(() => {
      result.current(100, 150, 'yellow');
    });

    const img = container.querySelector('img');
    expect(img).not.toBeNull();
    expect(img?.parentElement).toBe(container);
    expect(img?.style.position).toBe('absolute');
    expect(img?.style.zIndex).toBe('8');
    expect(img?.style.display).toBe('block');
    expect(img?.style.left).toBe('49px');
    expect(img?.style.top).toBe('79px');
    expect(img?.src).toContain('data:image/webp;base64,yellow#');
  });

  it('clears animation after timeout', () => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const containerRef = { current: container };

    const { result } = renderHook(() => useClickAnimation(containerRef));

    act(() => {
      result.current(30, 40, 'red');
    });

    const img = container.querySelector('img');
    expect(img?.style.display).toBe('block');

    act(() => {
      vi.advanceTimersByTime(600);
    });

    expect(img?.style.display).toBe('none');
  });

  it('resets hide timer on multiple rapid clicks', () => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const containerRef = { current: container };

    const { result } = renderHook(() => useClickAnimation(containerRef));

    act(() => {
      result.current(10, 20, 'yellow');
    });

    const img = container.querySelector('img');
    expect(img?.style.display).toBe('block');

    act(() => {
      vi.advanceTimersByTime(500);
      result.current(70, 80, 'red');
    });

    expect(img?.style.left).toBe('59px');
    expect(img?.style.top).toBe('69px');
    expect(img?.src).toContain('data:image/webp;base64,red#');

    act(() => {
      vi.advanceTimersByTime(150);
    });
    expect(img?.style.display).toBe('block');

    act(() => {
      vi.advanceTimersByTime(450);
    });
    expect(img?.style.display).toBe('none');
  });

  it('keeps the global click image fixed on document body', () => {
    act(() => {
      triggerGlobalClickAnimation(100, 150, 'yellow');
    });

    const img = document.body.querySelector<HTMLImageElement>(':scope > img');
    expect(img).not.toBeNull();
    expect(img?.parentElement).toBe(document.body);
    expect(img?.style.position).toBe('fixed');
    expect(img?.style.zIndex).toBe('200000');
    expect(img?.style.left).toBe('89px');
    expect(img?.style.top).toBe('139px');
  });
});
