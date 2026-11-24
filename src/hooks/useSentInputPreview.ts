import { useCallback, useRef, useState } from 'react';

export interface SentInputPreviewRef<T> {
  readonly get: () => T | undefined;
  readonly show: (value: T) => () => void;
  readonly reset: () => void;
}

export interface SentInputPreview<T> extends SentInputPreviewRef<T> {
  readonly value: T | undefined;
}

/**
 * A sent input's preview, held until the server answers, without rendering: for a preview read
 * every animation frame (the walk destination), where re-rendering the app on each click would
 * only repeat what the frame already draws. `onChange` hears every change.
 */
export function useSentInputPreviewRef<T>(onChange?: (value: T | undefined) => void): SentInputPreviewRef<T> {
  const valueRef = useRef<T | undefined>(undefined);
  const sequenceRef = useRef(0);
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  const get = useCallback(() => valueRef.current, []);

  const show = useCallback((next: T): (() => void) => {
    const sequence = sequenceRef.current + 1;
    sequenceRef.current = sequence;
    valueRef.current = next;
    onChangeRef.current?.(next);

    return () => {
      // An earlier server arrival must not clear a newer click still in flight.
      if (sequenceRef.current !== sequence) return;
      valueRef.current = undefined;
      onChangeRef.current?.(undefined);
    };
  }, []);

  const reset = useCallback(() => {
    sequenceRef.current += 1;
    valueRef.current = undefined;
    onChangeRef.current?.(undefined);
  }, []);

  return { get, show, reset };
}

/** A sent input's preview, rendered: for UI that shows it through React (orbs, panel slots). */
export function useSentInputPreview<T>(): SentInputPreview<T> {
  const [value, setValue] = useState<T | undefined>(undefined);
  const { get, show, reset } = useSentInputPreviewRef<T>(setValue);
  return { value, get, show, reset };
}
