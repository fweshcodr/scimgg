import { useCallback, useRef } from 'react';
import { type ToastItem, useZoomHintToast } from '../components/ZoomHintToast';
import { useAppHotkeys } from './useAppHotkeys';

interface UseGlobalUiShortcutsArgs {
  disabledShortcutHints: string[];
  onReset: () => void;
  onToggleQuickSearch: () => void;
  onToggleShowFps: () => void;
  showShortcutHints: boolean;
  updateDisabledShortcutHints: (disabledTypes: string[]) => void;
}
interface UseGlobalUiShortcutsReturn {
  dismissHintToast: (id: number) => void;
  handleHintOptOut: (type: string) => void;
  hintToasts: ToastItem[];
}

export function useGlobalUiShortcuts({
  disabledShortcutHints,
  onReset,
  onToggleQuickSearch,
  onToggleShowFps,
  showShortcutHints,
  updateDisabledShortcutHints,
}: UseGlobalUiShortcutsArgs): UseGlobalUiShortcutsReturn {
  const {
    toasts: hintToasts,
    trigger: triggerHintToast,
    dismiss: dismissHintToast,
  } = useZoomHintToast({ enabled: showShortcutHints, disabledTypes: disabledShortcutHints });

  // The list as last written, not as last rendered: the setting takes a whole value, so two
  // opt-outs before a re-render would otherwise each append to the same stale list, and the
  // second would drop the first.
  const disabledShortcutHintsRef = useRef(disabledShortcutHints);
  disabledShortcutHintsRef.current = disabledShortcutHints;
  const handleHintOptOut = useCallback(
    (type: string) => {
      const current = disabledShortcutHintsRef.current;
      if (current.includes(type)) return;
      const next = [...current, type];
      disabledShortcutHintsRef.current = next;
      updateDisabledShortcutHints(next);
    },
    [updateDisabledShortcutHints],
  );

  useAppHotkeys({
    onReset,
    onToggleQuickSearch,
    onToggleShowFps,
    triggerHintToast,
  });

  return {
    dismissHintToast,
    handleHintOptOut,
    hintToasts,
  };
}
