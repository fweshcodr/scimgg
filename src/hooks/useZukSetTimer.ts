import { useEffect, useMemo, useRef, useState } from 'react';
import type { PluginKeybindMap } from '../data/pluginKeybinds';
import { isCapturingKeybind } from '../input/keybindCapture';
import type { ZukSetTimerState } from '../types/zukSetTimer';
import { advanceZukSetTimer, ZUK_SET_TIMER_IDLE } from '../types/zukSetTimer';
import { matchesHotkey } from '../util/hotkey';
import { getEffectivePluginKeybinds } from './keybindStore';
import { handleOverlayClose } from './useEscapeLayer';
import { useUnifiedKeybinds } from './useUnifiedKeybinds';

interface UseZukSetTimerParams {
  enabled: boolean;
  /** The countdown is measured in ticks, not wall-clock. */
  currentTick: number;
}

function isTextEntryTarget(target: EventTarget | null): boolean {
  return (
    target instanceof HTMLInputElement ||
    target instanceof HTMLTextAreaElement ||
    (target instanceof HTMLElement && target.isContentEditable)
  );
}

export interface ZukSetTimerControls {
  readonly timer: ZukSetTimerState;
  /** Whether the encounter's authoritative countdown is revealed alongside it. */
  readonly showActual: boolean;
  readonly keybinds: PluginKeybindMap;
}

export function useZukSetTimer({ enabled, currentTick }: UseZukSetTimerParams): ZukSetTimerControls | undefined {
  const [timer, setTimer] = useState<ZukSetTimerState>(ZUK_SET_TIMER_IDLE);
  const [showActual, setShowActual] = useState(false);
  const store = useUnifiedKeybinds();
  const keybinds = useMemo(() => getEffectivePluginKeybinds(store), [store]);

  // Read inside the listener so a per-tick value never re-subscribes it.
  const currentTickRef = useRef(currentTick);
  currentTickRef.current = currentTick;

  const previousTickRef = useRef(currentTick);
  useEffect(() => {
    // A reset or a new encounter rewinds the tick counter. A countdown anchored
    // to the old timeline would read minutes too high, so drop it.
    if (currentTick < previousTickRef.current) {
      setTimer(ZUK_SET_TIMER_IDLE);
    }
    previousTickRef.current = currentTick;
  }, [currentTick]);

  useEffect(() => {
    if (!enabled) {
      setTimer(ZUK_SET_TIMER_IDLE);
      setShowActual(false);
      return;
    }

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.defaultPrevented) return;
      if (handleOverlayClose(event) || isTextEntryTarget(event.target) || isCapturingKeybind()) return;

      const resetsTimer = matchesHotkey(event, keybinds.zukSetTimerReset);
      const advancesTimer = matchesHotkey(event, keybinds.zukSetTimerAdvance);
      const revealsTimer = matchesHotkey(event, keybinds.zukSetTimerReveal);
      if (!resetsTimer && !advancesTimer && !revealsTimer) return;

      event.preventDefault();
      event.stopImmediatePropagation();
      if (event.repeat) return;

      if (resetsTimer) {
        setTimer(ZUK_SET_TIMER_IDLE);
        return;
      }
      if (advancesTimer) {
        setTimer((previous) => advanceZukSetTimer(previous, currentTickRef.current));
        return;
      }
      // Deliberately a separate key from the routine: revealing the answer must
      // never be able to disturb the clock the player is practicing with.
      if (revealsTimer) {
        setShowActual((previous) => !previous);
      }
    };

    // After nested controls and overlay arbitration, before window-level game shortcuts.
    document.addEventListener('keydown', onKeyDown);
    window.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [enabled, keybinds]);

  return enabled ? { timer, showActual, keybinds } : undefined;
}
