import { useEffect } from 'react';
import { isCapturingKeybind } from '../input/keybindCapture';
import { matchesKeyboardKey } from '../util/hotkey';
import { DEFAULT_KEYBINDS, type GamePanelTab, type KeybindMap } from './keybindStore';
import { handleOverlayClose } from './useEscapeLayer';
import { useUnifiedKeybinds } from './useUnifiedKeybinds';

export type { GamePanelTab, KeybindMap };
export { DEFAULT_KEYBINDS };

export function formatKeyName(key: string): string {
  if (key === 'Escape') return 'Esc';
  if (key === ' ') return 'Space';
  if (key.startsWith('F') && key.length <= 3) return key;
  return key.length === 1 ? key.toUpperCase() : key;
}

export const useKeybinds = () => {
  return { keybinds: useUnifiedKeybinds().gamePanel };
};

export const useGamePanelShortcuts = (onTabChange: (tab: GamePanelTab) => void, keybinds: KeybindMap) => {
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (handleOverlayClose(e) || isCapturingKeybind()) return;
      if (
        e.repeat ||
        e.isComposing ||
        e.target instanceof HTMLInputElement ||
        e.target instanceof HTMLTextAreaElement ||
        (e.target instanceof HTMLElement && e.target.isContentEditable)
      ) {
        return;
      }

      for (const [tab, key] of Object.entries(keybinds)) {
        if (key && matchesKeyboardKey(e.key, key)) {
          if (key !== 'Escape') {
            e.preventDefault();
          }
          onTabChange(tab as GamePanelTab);
          return;
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onTabChange, keybinds]);
};
