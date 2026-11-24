import type React from 'react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { HUD_TOOL_GAP } from '../util/viewportLayout';
import './ZoomHintToast.css';

const AUTO_DISMISS_MS = 7_000;
const COOLDOWN_MS = 30_000;
const MAX_SHOWS_PER_SESSION = 5;
const EXIT_ANIMATION_MS = 160;

let toastIdCounter = 0;

/** A single quiet text action at the end of a tip's message ("Setup"). It also closes the tip. */
export interface ToastAction {
  label: string;
  onClick: () => void;
}

export interface ToastItem {
  id: number;
  type: string;
  message: React.ReactNode;
  action?: ToastAction;
}

export function useZoomHintToast(options?: { enabled?: boolean; disabledTypes?: string[] }): {
  toasts: ToastItem[];
  trigger: (type: string, message: React.ReactNode, action?: ToastAction) => void;
  dismiss: (id: number) => void;
  dismissAll: () => void;
} {
  const enabled = options?.enabled ?? true;
  const disabledTypes = options?.disabledTypes;
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  const cooldownPerTypeRef = useRef<Map<string, number>>(new Map());
  const shownCountRef = useRef(0);

  const dismiss = useCallback((id: number) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const dismissAll = useCallback(() => {
    setToasts([]);
  }, []);

  const trigger = useCallback(
    (type: string, message: React.ReactNode, action?: ToastAction) => {
      if (!enabled) return;
      if (disabledTypes?.includes(type)) return;

      const now = Date.now();
      if (shownCountRef.current >= MAX_SHOWS_PER_SESSION) return;

      const lastShown = cooldownPerTypeRef.current.get(type) ?? 0;
      if (now - lastShown < COOLDOWN_MS) return;

      cooldownPerTypeRef.current.set(type, now);
      shownCountRef.current += 1;

      const id = ++toastIdCounter;
      const item: ToastItem = { id, type, message, ...(action ? { action } : {}) };

      setToasts((prev) => {
        const filtered = prev.filter((t) => t.type !== type);
        return [...filtered, item];
      });
    },
    [enabled, disabledTypes],
  );

  return { toasts, trigger, dismiss, dismissAll };
}

interface SingleToastProps {
  item: ToastItem;
  onDismiss: (id: number) => void;
  onOptOut: (type: string) => void;
}

function SingleToast({ item, onDismiss, onOptOut }: SingleToastProps) {
  const [exiting, setExiting] = useState(false);
  const exitTimerRef = useRef<number | null>(null);
  const removedRef = useRef(false);
  // Read through a ref so the timers below live as long as the toast. App passes a fresh
  // `onDismiss` on every render (every tick, and always right after an opt-out writes the
  // setting); keyed on it, the timers were canceled each time, so the toast never auto-hid,
  // and a dismissal that saw a render inside its exit animation never removed the toast.
  const onDismissRef = useRef(onDismiss);
  onDismissRef.current = onDismiss;

  const handleDismiss = useCallback(() => {
    if (removedRef.current) return;
    removedRef.current = true;
    setExiting(true);
    exitTimerRef.current = window.setTimeout(() => {
      onDismissRef.current(item.id);
    }, EXIT_ANIMATION_MS);
  }, [item.id]);

  useEffect(() => {
    const timer = window.setTimeout(handleDismiss, AUTO_DISMISS_MS);
    return () => {
      window.clearTimeout(timer);
      if (exitTimerRef.current != null) {
        window.clearTimeout(exitTimerRef.current);
      }
    };
  }, [handleDismiss]);

  const cls = `zoom-hint-toast ${exiting ? 'zoom-hint-toast--exit' : 'zoom-hint-toast--enter'}`;

  return (
    <div className={cls} aria-live="polite" aria-atomic="true">
      <div className="zoom-hint-toast__main">
        <span className="zoom-hint-toast__tip">Tip</span>
        <div className="zoom-hint-toast__body">
          <div className="zoom-hint-toast__message">
            {item.message}
            {item.action && (
              <>
                {' '}
                <button
                  type="button"
                  className="zoom-hint-toast__action"
                  onClick={() => {
                    item.action?.onClick();
                    handleDismiss();
                  }}
                >
                  {item.action.label}
                </button>
              </>
            )}
          </div>
          <button
            type="button"
            className="zoom-hint-toast__opt-out"
            onClick={() => {
              onOptOut(item.type);
              handleDismiss();
            }}
          >
            Don&apos;t show again
          </button>
        </div>
        <button type="button" className="zoom-hint-toast__close" onClick={handleDismiss} aria-label="Dismiss tip">
          ×
        </button>
      </div>
    </div>
  );
}

/**
 * Where the toast stack rests, in window CSS pixels: its left edge, and the top of what it sits on
 * at the bottom left (the Chatbox infobox rows and readouts over the chatbox, or the Mobile tool
 * window). Grid, which lays that corner out, reports it (`onHintToastAnchorChange`); the toast is
 * fixed to the window and the corner is not, so this is what keeps them together.
 */
export interface HintToastAnchor {
  readonly left: number;
  readonly top: number;
}

type ZoomHintToastStackProps = {
  toasts: ToastItem[];
  onDismiss: (id: number) => void;
  onOptOut: (type: string) => void;
  /** Null until Grid has reported; the stack then rests at its own inset from the window corner. */
  anchor?: HintToastAnchor | null;
};

/** The gap between the toast and what it sits on. */
const ANCHOR_GAP = 8;

const UNANCHORED_STYLE: React.CSSProperties = {
  flexDirection: 'column-reverse',
  left: HUD_TOOL_GAP,
  bottom: `calc(40px + ${HUD_TOOL_GAP}px + ${ANCHOR_GAP}px)`,
};

export function ZoomHintToast({ toasts, onDismiss, onOptOut, anchor = null }: ZoomHintToastStackProps) {
  if (toasts.length === 0) return null;

  // Moved by `left` on the drawer's own duration and curve (`layoutTransition('left')`), the rule
  // the panels pushed by a drawer move by, so the tip and the bottom-left corner it rests on travel
  // as one object. Do not "improve" this to a transform. `bottom` is from the window's bottom edge.
  const stackStyle: React.CSSProperties = anchor
    ? {
        flexDirection: 'column-reverse',
        left: anchor.left,
        bottom: `calc(100% - ${anchor.top}px + ${ANCHOR_GAP}px)`,
      }
    : UNANCHORED_STYLE;

  return (
    <div className="zoom-hint-toast-stack zoom-hint-toast-stack--left" style={stackStyle}>
      {toasts.map((item) => (
        <SingleToast key={item.id} item={item} onDismiss={onDismiss} onOptOut={onOptOut} />
      ))}
    </div>
  );
}
