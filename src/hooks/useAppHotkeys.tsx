import { type ReactNode, useEffect, useRef } from 'react';
import { isCapturingKeybind } from '../input/keybindCapture';
import { matchesKeyboardKey } from '../util/hotkey';
import { loadUnifiedKeybindStore } from './keybindStore';

/** Ctrl+(+ / - / 0): the browser's page zoom, which the app turns into a hint instead. */
function isZoomKey(event: KeyboardEvent): boolean {
  if (!event.ctrlKey) return false;
  return (
    event.key === '+' ||
    event.key === '=' ||
    event.code === 'Equal' ||
    event.code === 'NumpadAdd' ||
    event.key === '-' ||
    event.key === '_' ||
    event.code === 'Minus' ||
    event.code === 'NumpadSubtract' ||
    event.key === '0' ||
    event.code === 'Digit0' ||
    event.code === 'Numpad0'
  );
}

/** F1–F12: the browser's help, reload, fullscreen and the like. */
function isFunctionKey(event: KeyboardEvent): boolean {
  return /^F\d{1,2}$/.test(event.key);
}

/** Ctrl/Cmd+R restarts the simulation instead of reloading; Ctrl+Shift+R still hard-reloads. */
function isRestartKey(event: KeyboardEvent): boolean {
  return (event.ctrlKey || event.metaKey) && !event.shiftKey && matchesKeyboardKey(event.key, 'r');
}

function isQuickSearchKey(event: KeyboardEvent): boolean {
  return event.ctrlKey && event.key.toLowerCase() === 'k';
}

function isShowFpsKey(event: KeyboardEvent): boolean {
  return event.ctrlKey && event.shiftKey && event.key.toLowerCase() === 'f';
}

/**
 * Keys this hook handles at window level whatever has focus: they cancel a browser default that
 * would lose the session or scale the page (reload, help, zoom), or run an app command (restart,
 * quick search, FPS). A text field that keeps its other keys from the game by stopping their
 * propagation must let these through, or the browser acts on them instead. Text editing keys
 * (Ctrl+A/C/V/X/Z, arrows, Home/End, Backspace) are not among them.
 */
export function isAppShortcut(event: KeyboardEvent): boolean {
  return (
    isFunctionKey(event) || isZoomKey(event) || isRestartKey(event) || isQuickSearchKey(event) || isShowFpsKey(event)
  );
}

interface UseAppHotkeysParams {
  onReset: () => void;
  onToggleQuickSearch: () => void;
  onToggleShowFps: () => void;
  triggerHintToast: (type: string, content: ReactNode) => void;
}

export function useAppHotkeys({
  onReset,
  onToggleQuickSearch,
  onToggleShowFps,
  triggerHintToast,
}: UseAppHotkeysParams): void {
  const handleResetRef = useRef(onReset);
  const lastCtrlRRef = useRef(0);
  // Refs, not effect dependencies: callers pass inline callbacks, and depending on
  // them re-installed these window listeners on every App render (every tick).
  const toggleQuickSearchRef = useRef(onToggleQuickSearch);
  const toggleShowFpsRef = useRef(onToggleShowFps);

  handleResetRef.current = onReset;
  toggleQuickSearchRef.current = onToggleQuickSearch;
  toggleShowFpsRef.current = onToggleShowFps;

  useEffect(() => {
    const preventBrowserWheelActions = (event: WheelEvent) => {
      if (event.altKey) {
        // Alt+scroll is the panel-resize gesture, but Firefox on Windows and Linux maps it
        // to history back/forward (mousewheel.with_alt.action). Panels only cancel the wheel
        // they resize, so one that lands anywhere else (chrome, a gap between slots) would
        // leave the site. Cancel it everywhere.
        event.preventDefault();
        return;
      }
      if (!event.ctrlKey) return;
      triggerHintToast(
        'resize',
        <>
          Use <span className="zoom-hint-toast__emph">Alt + Scroll</span> to resize UI panels
        </>,
      );
      event.preventDefault();
    };

    window.addEventListener('wheel', preventBrowserWheelActions, { passive: false });
    return () => window.removeEventListener('wheel', preventBrowserWheelActions);
  }, [triggerHintToast]);

  useEffect(() => {
    const interceptZoomKeys = (event: KeyboardEvent) => {
      if (!isZoomKey(event)) return;

      triggerHintToast(
        'resize',
        <>
          Use <span className="zoom-hint-toast__emph">Alt + Scroll</span> to resize UI panels
        </>,
      );
      event.preventDefault();
    };

    window.addEventListener('keydown', interceptZoomKeys, { passive: false });
    return () => window.removeEventListener('keydown', interceptZoomKeys);
  }, [triggerHintToast]);

  useEffect(() => {
    const preventFKeys = (event: KeyboardEvent) => {
      if (isFunctionKey(event)) event.preventDefault();
    };

    window.addEventListener('keydown', preventFKeys, { passive: false });
    return () => window.removeEventListener('keydown', preventFKeys);
  }, []);

  useEffect(() => {
    const handleCtrlDrag = () => {
      triggerHintToast(
        'drag',
        <>
          Use <span className="zoom-hint-toast__emph">Alt + Drag</span> to move UI panels
        </>,
      );
    };

    window.addEventListener('shortcut-hint:ctrl-drag', handleCtrlDrag);
    return () => window.removeEventListener('shortcut-hint:ctrl-drag', handleCtrlDrag);
  }, [triggerHintToast]);

  useEffect(() => {
    const handleUnboundKey = (event: KeyboardEvent) => {
      if (event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement) return;
      if (event.ctrlKey || event.altKey || event.metaKey) return;
      if (!/^[1-9]$/.test(event.key)) return;

      const { gamePanel, camera, ui } = loadUnifiedKeybindStore();
      const allBound = new Set([...Object.values(gamePanel), ...Object.values(camera), ...Object.values(ui)]);
      if (allBound.has(event.key)) return;

      // "Settings" is the LEFT SIDEBAR's name; this tab is labeled Keybinds in both its tooltip and
      // the panel's own sub-nav (SettingsContent.tsx), and the tabs are icon-only, so Keybinds is the
      // only word a player can match to something on screen.
      triggerHintToast(
        'keybind',
        <>
          Rebind keys in the <span className="zoom-hint-toast__emph">Keybinds</span> tab
        </>,
      );
      window.dispatchEvent(new CustomEvent('shortcut-hint:highlight-settings'));
    };

    window.addEventListener('keydown', handleUnboundKey);
    return () => window.removeEventListener('keydown', handleUnboundKey);
  }, [triggerHintToast]);

  useEffect(() => {
    const preventAltMenu = (event: KeyboardEvent) => {
      if (event.key === 'Alt') {
        event.preventDefault();
      }
    };

    window.addEventListener('keyup', preventAltMenu);
    return () => window.removeEventListener('keyup', preventAltMenu);
  }, []);

  useEffect(() => {
    const preventTabFocus = (event: KeyboardEvent) => {
      if (event.key !== 'Tab') return;
      event.preventDefault();
      const active = document.activeElement;
      if (active instanceof HTMLElement && active !== document.body) {
        active.blur();
      }
    };

    window.addEventListener('keydown', preventTabFocus);
    return () => window.removeEventListener('keydown', preventTabFocus);
  }, []);

  useEffect(() => {
    const handleCtrlK = (event: KeyboardEvent) => {
      if (isQuickSearchKey(event)) {
        event.preventDefault();
        // Held down, it would flicker the search open and shut.
        if (event.repeat) return;
        toggleQuickSearchRef.current();
      }
    };

    window.addEventListener('keydown', handleCtrlK);
    return () => window.removeEventListener('keydown', handleCtrlK);
  }, []);

  useEffect(() => {
    const handleCtrlShiftF = (event: KeyboardEvent) => {
      if (isShowFpsKey(event)) {
        event.preventDefault();
        toggleShowFpsRef.current();
      }
    };

    window.addEventListener('keydown', handleCtrlShiftF);
    return () => window.removeEventListener('keydown', handleCtrlShiftF);
  }, []);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (isRestartKey(event)) {
        event.preventDefault();
        if (event.repeat || isCapturingKeybind()) return;
        handleResetRef.current();

        const now = Date.now();
        if (now - lastCtrlRRef.current < 1500) {
          triggerHintToast(
            'reload',
            <>
              Trying to reload the page? Use <kbd className="kbd">Ctrl+Shift+R</kbd> instead.
            </>,
          );
        }
        lastCtrlRRef.current = now;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [triggerHintToast]);

  useEffect(() => {
    // Swallow browser-default Ctrl/Cmd shortcuts (bookmark, save, print, find,
    // view-source, etc.) so users mid-ctrl-click don't accidentally trigger them.
    const preventBrowserCtrlShortcuts = (event: KeyboardEvent) => {
      if (!event.ctrlKey && !event.metaKey) return;
      if (event.key === 'Control' || event.key === 'Meta') return;

      const target = event.target;
      if (
        target instanceof HTMLInputElement ||
        target instanceof HTMLTextAreaElement ||
        (target instanceof HTMLElement && target.isContentEditable)
      ) {
        return;
      }

      const key = event.key.toLowerCase();
      // Hard reload (Ctrl/Cmd+Shift+R) — keep working.
      if (event.shiftKey && key === 'r') return;
      // Clipboard + select-all — keep working (e.g. copying loadout strings).
      if (key === 'c' || key === 'v' || key === 'x' || key === 'a' || key === 'z' || key === 'y') return;

      event.preventDefault();
    };

    window.addEventListener('keydown', preventBrowserCtrlShortcuts, { passive: false });
    return () => window.removeEventListener('keydown', preventBrowserCtrlShortcuts);
  }, []);

  useEffect(() => {
    // Firefox opens its native menu on Shift+right-click and never fires a
    // `contextmenu` event we could cancel — but the mousedown still fires with
    // shiftKey. Only Firefox hijacks Shift+right-click (other browsers suppress
    // the native menu via preventDefault on the contextmenu event), so hint only
    // there.
    if (!/firefox/i.test(navigator.userAgent)) return;
    const handleShiftRightClick = (event: MouseEvent) => {
      if (event.button !== 2 || !event.shiftKey) return;
      const target = event.target;
      if (!(target instanceof HTMLElement) || !target.closest('[data-tutorial-input-surface="gameplay"]')) {
        return;
      }
      triggerHintToast(
        'firefox-shift-rclick',
        <>
          Firefox opens its own menu on <span className="zoom-hint-toast__emph">Shift + Right-click</span>. Use{' '}
          <span className="zoom-hint-toast__emph">Ctrl + Right-click</span> instead.
        </>,
      );
    };

    window.addEventListener('mousedown', handleShiftRightClick, true);
    return () => window.removeEventListener('mousedown', handleShiftRightClick, true);
  }, [triggerHintToast]);
}
