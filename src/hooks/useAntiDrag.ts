import { useCallback, useEffect, useRef, useState } from 'react';
import { loadSetting, saveSetting } from '../util/storage';

const STORAGE_KEY = 'osrs-anti-drag';

interface AntiDragStorage {
  enabled: boolean;
  onShiftOnly: boolean;
  dragDelay: number;
  ctrlToDrag: boolean;
}

export const ANTI_DRAG_DEFAULTS: AntiDragStorage = {
  enabled: true,
  onShiftOnly: false,
  dragDelay: 300,
  ctrlToDrag: true,
};

function load(): AntiDragStorage {
  const stored = loadSetting<Record<string, unknown>>(STORAGE_KEY);
  if (!stored) return ANTI_DRAG_DEFAULTS;

  return {
    enabled: typeof stored.enabled === 'boolean' ? stored.enabled : ANTI_DRAG_DEFAULTS.enabled,
    onShiftOnly: typeof stored.onShiftOnly === 'boolean' ? stored.onShiftOnly : ANTI_DRAG_DEFAULTS.onShiftOnly,
    dragDelay:
      typeof stored.dragDelay === 'number'
        ? Math.max(0, Math.min(2000, stored.dragDelay))
        : ANTI_DRAG_DEFAULTS.dragDelay,
    ctrlToDrag: typeof stored.ctrlToDrag === 'boolean' ? stored.ctrlToDrag : ANTI_DRAG_DEFAULTS.ctrlToDrag,
  };
}

export function useAntiDrag() {
  const [state, setState] = useState<AntiDragStorage>(load);
  const isInitial = useRef(true);

  useEffect(() => {
    if (isInitial.current) {
      isInitial.current = false;
      return;
    }
    saveSetting(STORAGE_KEY, state);
  }, [state]);

  const toggleEnabled = useCallback(() => {
    setState((prev) => ({ ...prev, enabled: !prev.enabled }));
  }, []);

  const setOnShiftOnly = useCallback((onShiftOnly: boolean) => {
    setState((prev) => ({ ...prev, onShiftOnly }));
  }, []);

  const setDragDelay = useCallback((dragDelay: number) => {
    setState((prev) => ({ ...prev, dragDelay: Math.max(0, Math.min(2000, dragDelay)) }));
  }, []);

  const setCtrlToDrag = useCallback((ctrlToDrag: boolean) => {
    setState((prev) => ({ ...prev, ctrlToDrag }));
  }, []);

  return {
    enabled: state.enabled,
    onShiftOnly: state.onShiftOnly,
    dragDelay: state.dragDelay,
    ctrlToDrag: state.ctrlToDrag,
    toggleEnabled,
    setOnShiftOnly,
    setDragDelay,
    setCtrlToDrag,
  } as const;
}
