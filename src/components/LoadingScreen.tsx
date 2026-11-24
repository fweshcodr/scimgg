import type React from 'react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { CacheDownloadState, LoadingStage } from '../cache/CacheManager';
import { TIPS, tipsForDevice } from '../data/tips';
import { useIsTouchOnly } from '../hooks/useIsTouchOnly';
import { detectGpuStatus } from '../util/gpuDetection';
import { HardwareAccelWarning } from './HardwareAccelWarning';
import './LoadingScreen.css';

interface LoadingScreenProps {
  cacheState: CacheDownloadState;
  isFullyLoaded: boolean;
  onRetry?: () => void;
}

const STAGE_LABELS: Record<LoadingStage, string> = {
  downloading: 'Downloading Cache',
  extracting: 'Extracting Archive',
  storing: 'Saving to Browser',
  initializing: 'Preparing Game Data',
  'loading-from-storage': 'Loading Cache',
};

function formatStageName(stage: LoadingStage): string {
  return STAGE_LABELS[stage] ?? stage;
}

/**
 * The status and detail lines, derived during render. They must not be mirrored into state from an
 * effect: cache progress arrives faster than React commits, so every commit's passive effects would
 * schedule another update, and React reports "Maximum update depth exceeded" after 50 in a row.
 */
function loadingText(cacheState: CacheDownloadState, isFullyLoaded: boolean): { status: string; detail: string } {
  if (cacheState.status === 'error') return { status: 'Error', detail: cacheState.message };
  if (isFullyLoaded) return { status: '', detail: '' };
  if (cacheState.status === 'loading') return { status: formatStageName(cacheState.stage), detail: cacheState.detail };
  if (cacheState.status === 'success') return { status: 'Loading Assets', detail: 'Preparing game world...' };
  return { status: 'Initializing...', detail: '' };
}

/** Wraps each key or mouse gesture in a tip in a <kbd>; whole words only, so "Alt" never splits "Alternate". */
export function formatTipText(text: string) {
  const regex =
    /\b(Ctrl\+[Kk]|Alt|Shift\+Right-click|Right-click|Middle-click|Esc|F[1-9][0-2]?|F[1-9]-F[1-9]|WASD|Ctrl\+click)\b/g;
  const parts = text.split(regex);
  return parts.map((part, i) => {
    if (part.match(regex)) {
      return (
        // biome-ignore lint/suspicious/noArrayIndexKey: positional tokens from one String.split. The list is never reordered, filtered or appended to; it is rebuilt wholesale whenever `text` changes, and the same token can legitimately repeat.
        <kbd key={i} className="kbd">
          {part}
        </kbd>
      );
    }
    return part;
  });
}

export const LoadingScreen: React.FC<LoadingScreenProps> = ({ cacheState, isFullyLoaded, onRetry }) => {
  const [shouldRender, setShouldRender] = useState(true);
  const [fadingOut, setFadingOut] = useState(false);
  const { status: statusText, detail: detailText } = loadingText(cacheState, isFullyLoaded);
  const statusElRef = useRef<HTMLDivElement>(null);
  const lastStageRef = useRef(statusText);
  const gpuDetection = detectGpuStatus();
  // Direct DOM refs — progress updates bypass React entirely, no re-renders
  const barRef = useRef<HTMLDivElement>(null);
  const pctRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const targetProgressRef = useRef(0);
  const currentProgressRef = useRef(0);
  const rafRef = useRef<number | null>(null);
  const lastFrameRef = useRef(0);
  const prevStatusRef = useRef<string>('idle');

  // Touch devices get no shortcut or mouse tips. The counter only ever advances and is wrapped at
  // render, so the rotation stays valid if the device's tip list changes length mid-load.
  const isTouchOnly = useIsTouchOnly();
  const tips = useMemo(() => tipsForDevice(isTouchOnly), [isTouchOnly]);
  const [tipCounter, setTipCounter] = useState(() => Math.floor(Math.random() * TIPS.length));
  const [tipVisible, setTipVisible] = useState(true);
  const tip = tips[tipCounter % tips.length];

  useEffect(() => {
    if (isFullyLoaded) return;
    const interval = setInterval(() => {
      setTipVisible(false);
      setTimeout(() => {
        setTipCounter((prev) => prev + 1);
        setTipVisible(true);
      }, 600);
    }, 6000);
    return () => clearInterval(interval);
  }, [isFullyLoaded]);

  useEffect(() => {
    if (statusText === lastStageRef.current) return;
    lastStageRef.current = statusText;
    // Restart CSS animation via DOM — bypasses React's key/reconciliation entirely
    const el = statusElRef.current;
    if (el) {
      el.style.animation = 'none';
      void el.offsetHeight; // force reflow
      el.style.animation = '';
    }
  }, [statusText]);

  const applyProgress = useCallback((value: number) => {
    if (barRef.current) {
      barRef.current.style.transform = `scaleX(${value / 100})`;
    }
    if (pctRef.current) {
      pctRef.current.textContent = `${Math.floor(value)}%`;
    }
    if (containerRef.current) {
      containerRef.current.setAttribute('aria-valuenow', String(Math.floor(value)));
      if (value >= 99.95) {
        containerRef.current.classList.add('ready');
      } else {
        containerRef.current.classList.remove('ready');
      }
    }
  }, []);

  const startRaf = useCallback(() => {
    if (rafRef.current !== null) return;

    const animate = (time: number) => {
      const dt = lastFrameRef.current ? (time - lastFrameRef.current) / 1000 : 0.016;
      lastFrameRef.current = time;

      const target = targetProgressRef.current;
      const current = currentProgressRef.current;
      const diff = target - current;

      if (Math.abs(diff) > 0.05) {
        const speed = target >= 100 ? 12 : 4;
        const next = current + diff * Math.min(speed * dt, 0.9);
        currentProgressRef.current = next;
        applyProgress(next);
        rafRef.current = requestAnimationFrame(animate);
      } else if (diff > 0) {
        currentProgressRef.current = target;
        applyProgress(target);
        rafRef.current = null;
        lastFrameRef.current = 0;
      } else {
        rafRef.current = null;
        lastFrameRef.current = 0;
      }
    };

    rafRef.current = requestAnimationFrame(animate);
  }, [applyProgress]);

  useEffect(() => {
    return () => {
      if (rafRef.current !== null) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    const wasError = prevStatusRef.current === 'error';
    prevStatusRef.current = cacheState.status;

    if (cacheState.status === 'loading') {
      if (wasError) {
        targetProgressRef.current = 0;
        currentProgressRef.current = 0;
        applyProgress(0);
      }
      const mapped = Math.min(95, Math.max(0, cacheState.percent * 0.95));
      targetProgressRef.current = Math.max(targetProgressRef.current, mapped);
      startRaf();
    } else if (cacheState.status === 'success' && !isFullyLoaded) {
      if (targetProgressRef.current < 95) {
        targetProgressRef.current = 95;
      }
      startRaf();
    }
  }, [cacheState, isFullyLoaded, startRaf, applyProgress]);

  useEffect(() => {
    if (cacheState.status === 'success' && !isFullyLoaded) {
      const interval = window.setInterval(() => {
        if (targetProgressRef.current < 99) {
          targetProgressRef.current = Math.min(99, targetProgressRef.current + 0.8);
          startRaf();
        }
      }, 80);
      return () => clearInterval(interval);
    }
    return undefined;
  }, [cacheState.status, isFullyLoaded, startRaf]);

  useEffect(() => {
    if (isFullyLoaded) {
      targetProgressRef.current = 100;
      startRaf();

      const fadeTimer = setTimeout(() => {
        setFadingOut(true);
      }, 1800);

      const removeTimer = setTimeout(() => {
        setShouldRender(false);
      }, 3300);

      return () => {
        clearTimeout(fadeTimer);
        clearTimeout(removeTimer);
      };
    } else {
      setFadingOut(false);
      setShouldRender(true);
    }
  }, [isFullyLoaded, startRaf]);

  if (!shouldRender) return null;

  return (
    <div className={`loading-screen ${fadingOut ? 'hidden' : ''}`} role="alert" aria-busy={!isFullyLoaded}>
      <div className="loading-content">
        {/* h2, not h1: the page <h1> is owned by SeoLandmark, which is mounted throughout. */}
        <h2 className="loading-title">SCIM.GG</h2>
        <div className="loading-subtitle">OSRS Combat Simulator</div>

        <div
          ref={containerRef}
          className="loading-bar-container"
          role="progressbar"
          aria-valuenow={0}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-label="Game loading progress"
        >
          <div ref={barRef} className="loading-bar-progress" style={{ transform: 'scaleX(0)' }} />
          <div ref={pctRef} className="loading-percent-display" aria-hidden="true">
            0%
          </div>
        </div>

        <div className="loading-text-container">
          <div ref={statusElRef} className="loading-status-text" aria-live="polite">
            {statusText}
          </div>
          {detailText && <div className="loading-detail-text">{detailText}</div>}
        </div>
        <div className={`loading-tip-container ${tipVisible ? 'visible' : 'hidden'}`}>
          <div className="loading-tip-content">
            <span className="loading-tip-prefix">Did you know? </span>
            <span className="loading-tip-text">{formatTipText(tip.text)}</span>
          </div>
        </div>

        {gpuDetection.status !== 'hardware' && (
          <HardwareAccelWarning
            variant="loading"
            gpuStatus={gpuDetection.status}
            renderer={gpuDetection.renderer}
            hidden={false}
          />
        )}

        {cacheState.status === 'error' && (
          <div className="loading-error" role="alert">
            {onRetry && (
              <button
                type="button"
                className="loading-retry-button"
                onClick={onRetry}
                aria-label="Retry cache download"
              >
                Retry
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
};
