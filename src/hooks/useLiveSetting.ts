import { useCallback, useEffect, useRef, useState } from 'react';
import { type DebouncedPersist, useDebouncedPersist } from './useDebouncedPersist';

export interface LiveSetting<T> {
  /** What is on screen now; ahead of storage while a burst is being debounced. */
  readonly value: T;
  /** Show `value` now and store it once the burst goes quiet. */
  readonly change: (value: T) => void;
  /** Show and store `value` now (a discrete choice, like a picker click). */
  readonly commit: (value: T) => void;
}

/**
 * A setting that changes faster than it should be stored: Alt+scroll resize steps.
 * The live value updates every step; storage is written once the burst goes quiet (and
 * flushed on tab hide / pagehide / unmount, see useDebouncedPersist).
 *
 * The stored value comes back as `persisted`, and only a value this hook did not write
 * itself replaces the live one (another tab, a settings reset). Adopting our own writes
 * is what snapped a burst back: a burst that paused past the debounce stored step N,
 * the user turned the wheel again, and step N arriving back from storage overwrote step
 * N+1 on screen until the next write put it back. Several writes can be in flight, so
 * every one is recognized as ours until storage has caught up with it.
 */
export function useLiveSetting<T>(
  persisted: T,
  persist: (value: T) => void,
  { delayMs = 250, equals = Object.is }: { delayMs?: number; equals?: (a: T, b: T) => boolean } = {},
): LiveSetting<T> {
  const [value, setValue] = useState(persisted);
  // Our writes that storage has not echoed back yet, oldest first.
  const inFlightRef = useRef<T[]>([]);
  const equalsRef = useRef(equals);
  equalsRef.current = equals;
  const write = useCallback(
    (next: T) => {
      inFlightRef.current.push(next);
      persist(next);
    },
    [persist],
  );
  const debounced: DebouncedPersist<T> = useDebouncedPersist(write, delayMs);
  const { cancel } = debounced;

  useEffect(() => {
    const inFlight = inFlightRef.current;
    const echo = inFlight.findIndex((written) => equalsRef.current(persisted, written));
    if (echo !== -1) {
      // Storage has caught up to this write; anything older is settled too.
      inFlight.splice(0, echo + 1);
      return;
    }
    inFlightRef.current = [];
    cancel();
    setValue(persisted);
  }, [persisted, cancel]);

  const change = useCallback(
    (next: T) => {
      setValue(next);
      debounced(next);
    },
    [debounced],
  );
  const commit = useCallback(
    (next: T) => {
      setValue(next);
      debounced.supersede(next);
    },
    [debounced],
  );
  return { value, change, commit };
}
