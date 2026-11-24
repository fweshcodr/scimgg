import type React from 'react';
import { useEffect, useRef, useState } from 'react';
import './TransitionOverlay.css';

export interface TransitionOverlayProps {
  visible: boolean;
}

const FADE_MS = 300;

export const TransitionOverlay: React.FC<TransitionOverlayProps> = ({ visible }) => {
  const [shouldRender, setShouldRender] = useState(false);
  const [active, setActive] = useState(false);
  const hideTimerRef = useRef<number | null>(null);

  useEffect(() => {
    return () => {
      if (hideTimerRef.current !== null) {
        window.clearTimeout(hideTimerRef.current);
        hideTimerRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    if (visible) {
      if (hideTimerRef.current !== null) {
        window.clearTimeout(hideTimerRef.current);
        hideTimerRef.current = null;
      }
      setShouldRender(true);
      setActive(true);
      return;
    }

    setActive(false);
    if (!shouldRender) return;

    hideTimerRef.current = window.setTimeout(() => {
      hideTimerRef.current = null;
      setShouldRender(false);
    }, FADE_MS);
  }, [visible, shouldRender]);

  if (!visible && !shouldRender) return null;

  return <div className={`transition-overlay ${active ? 'active' : ''}`} aria-hidden="true" />;
};
