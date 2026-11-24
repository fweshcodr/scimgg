import { useCallback, useEffect, useMemo, useRef } from 'react';

export type DebouncedPersist<T = number> = ((value: T) => void) & {
  readonly cancel: () => void;
  readonly supersede: (value: T) => void;
};

/**
 * Debounce a numeric persist call (e.g. UI-scale writes during an Alt+scroll
 * burst) so rapid updates don't thrash localStorage / re-render the app tree on
 * every step. The trailing write fires after `delayMs` of quiet.
 *
 * Crucially, the last pending value is FLUSHED (not dropped) when the tab is
 * hidden (visibilitychange), on `pagehide`, and on unmount — so a change made
 * in the final `delayMs` before the user leaves the page isn't lost. The naive
 * "clear the timer on cleanup" approach silently drops that last value.
 */
export function useDebouncedPersist<T = number>(persist: (value: T) => void, delayMs = 250): DebouncedPersist<T> {
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Boxed, so any T (including null) can be pending.
  const pendingRef = useRef<{ value: T } | null>(null);
  // Keep the latest persist callback without re-subscribing the flush listeners.
  const persistRef = useRef(persist);
  persistRef.current = persist;

  const cancel = useCallback(() => {
    if (timerRef.current !== null) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    pendingRef.current = null;
  }, []);

  const flush = useCallback(() => {
    const pending = pendingRef.current;
    cancel();
    if (pending !== null) persistRef.current(pending.value);
  }, [cancel]);

  const schedule = useCallback(
    (value: T) => {
      pendingRef.current = { value };
      if (timerRef.current !== null) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(flush, delayMs);
    },
    [flush, delayMs],
  );

  const supersede = useCallback(
    (value: T) => {
      cancel();
      persistRef.current(value);
    },
    [cancel],
  );

  useEffect(() => {
    const onVisibility = () => {
      if (document.visibilityState === 'hidden') flush();
    };
    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener('pagehide', flush);
    return () => {
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('pagehide', flush);
      flush();
    };
  }, [flush]);

  return useMemo(() => Object.assign(schedule, { cancel, supersede }), [schedule, cancel, supersede]);
}
