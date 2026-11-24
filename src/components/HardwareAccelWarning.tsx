import type React from 'react';
import { useState } from 'react';
import type { GpuStatus } from '../util/gpuDetection';
import { SystemNotice } from './ui/SystemNotice';
import './HardwareAccelWarning.css';

interface HardwareAccelWarningProps {
  gpuStatus: GpuStatus;
  renderer: string | null;
  variant: 'loading' | 'gameplay';
  hidden: boolean;
}

/** Short: this is a notice, not documentation. */
const SOFTWARE_STEPS = [
  'Turn hardware acceleration back on in your browser settings.',
  'Lower 3D render scale under Graphics & Performance in Settings.',
] as const;

/** Pointer and touch only, per the keyboard and focus policy (docs/agent-reference.md). */
const preventFocusOnClick = (event: React.MouseEvent) => event.preventDefault();

function SmallMark({ className }: { className?: string }) {
  return (
    <svg className={className} width="12" height="12" viewBox="0 0 18 18" fill="none" aria-hidden="true">
      <path
        d="M7.72 2.3a1.46 1.46 0 0 1 2.56 0l6.03 10.9A1.46 1.46 0 0 1 15.03 15.4H2.97a1.46 1.46 0 0 1-1.28-2.2L7.72 2.3Z"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinejoin="round"
      />
      <path d="M9 6.4v3.7" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      <path d="M9 12.4h.01" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

/**
 * Software rendering: the simulator runs, just slowly. A `caution` member of the shared notice
 * family (ui/SystemNotice.tsx).
 *
 * This is the only GPU state it shows. A browser with no WebGL2 at all never reaches the app:
 * `BrowserSupportGate` replaces it with `BrowserSupportScreen` before anything mounts, and the
 * viewport's own status notice covers a context that fails later.
 *
 * The gameplay variant can be put away to a one-line strip, which is the only state here the
 * player chooses; the loading variant is read once and goes with the screen.
 */
export const HardwareAccelWarning: React.FC<HardwareAccelWarningProps> = ({ gpuStatus, renderer, variant, hidden }) => {
  const [dismissed, setDismissed] = useState(false);

  if (gpuStatus !== 'software') return null;
  if (variant === 'gameplay' && hidden) return null;

  if (variant === 'gameplay' && dismissed) {
    return (
      <button
        type="button"
        className="hw-accel-strip"
        tabIndex={-1}
        onMouseDown={preventFocusOnClick}
        onClick={() => setDismissed(false)}
      >
        <SmallMark className="hw-accel-strip-icon" />
        <span className="hw-accel-strip-text">Software rendering, reduced performance</span>
      </button>
    );
  }

  return (
    <div className={`hw-accel-warning variant-${variant}`}>
      <SystemNotice
        role="alert"
        tone="caution"
        title="Software rendering"
        body="Your browser isn't using your graphics card, so the simulator will run slowly."
        detail={renderer ? `Detected: ${renderer}` : undefined}
        steps={SOFTWARE_STEPS}
      />
      {variant === 'gameplay' && (
        <button
          type="button"
          className="hw-accel-dismiss"
          tabIndex={-1}
          onMouseDown={preventFocusOnClick}
          onClick={() => setDismissed(true)}
          aria-label="Hide this warning"
        >
          ✕
        </button>
      )}
    </div>
  );
};
