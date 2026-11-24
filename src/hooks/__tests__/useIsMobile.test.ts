// @vitest-environment happy-dom

import { act, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { isNarrowWindow, NARROW_WINDOW_WIDTH } from '../../layout/chromeBreakpoints';
import { useIsMobile } from '../useIsMobile';

/** A `matchMedia` that answers `(max-width: Npx)` for a window `width` wide, and can resize it. */
function stubWindowWidth(width: number) {
  const queries: string[] = [];
  const listeners = new Set<(event: MediaQueryListEvent) => void>();
  let current = width;
  const answer = (query: string) => {
    const max = /^\(max-width: (\d+)px\)$/.exec(query);
    if (!max) throw new Error(`unexpected media query ${query}`);
    return current <= Number(max[1]);
  };
  vi.stubGlobal('matchMedia', (query: string) => {
    queries.push(query);
    return {
      get matches() {
        return answer(query);
      },
      media: query,
      addEventListener: (_type: string, listener: (event: MediaQueryListEvent) => void) => listeners.add(listener),
      removeEventListener: (_type: string, listener: (event: MediaQueryListEvent) => void) =>
        listeners.delete(listener),
    };
  });
  return {
    queries,
    resize(next: number) {
      current = next;
      for (const listener of listeners) listener({ matches: answer(queries[0] ?? '') } as MediaQueryListEvent);
    },
  };
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('useIsMobile', () => {
  it('asks for the narrow-window line from chromeBreakpoints', () => {
    const media = stubWindowWidth(1280);
    renderHook(() => useIsMobile());

    expect(media.queries.length).toBeGreaterThan(0);
    expect(new Set(media.queries)).toEqual(new Set([`(max-width: ${NARROW_WINDOW_WIDTH}px)`]));
  });

  it('agrees with isNarrowWindow either side of the line, and follows a resize across it', () => {
    const media = stubWindowWidth(NARROW_WINDOW_WIDTH + 1);
    const { result } = renderHook(() => useIsMobile());
    expect(result.current).toBe(isNarrowWindow(NARROW_WINDOW_WIDTH + 1));
    expect(result.current).toBe(false);

    act(() => media.resize(NARROW_WINDOW_WIDTH));
    expect(result.current).toBe(isNarrowWindow(NARROW_WINDOW_WIDTH));
    expect(result.current).toBe(true);
  });
});
