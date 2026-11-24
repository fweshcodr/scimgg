import type React from 'react';
import './ViewportSizeWarning.css';

interface ViewportSizeWarningProps {
  visible: boolean;
  width: number;
  height: number;
}

/**
 * Compact viewport-level strip that warns when the locked resolution exceeds
 * the current window size. Shown at the bottom of the viewport when the
 * settings sidebar is closed — the fuller warning lives inside the sidebar's
 * Viewport section.
 */
export const ViewportSizeWarning: React.FC<ViewportSizeWarningProps> = ({ visible, width, height }) => {
  if (!visible) return null;

  return (
    <div className="viewport-size-strip" role="status">
      <span className="viewport-size-strip__lead">Window too small</span>
      <span>
        for {width}×{height}
      </span>
    </div>
  );
};
