import { useEffect, useRef, useState } from 'react';
import { type AutoScales, type OverlaySpaces, resolveAutoScales } from '../layout/overlayScale';

/**
 * How long the window must hold still before Auto changes size. Longer than
 * DraggablePanel's resize settle window, so the size change arrives as its own calm
 * transition rather than as one more snapped step of the resize.
 */
export const AUTO_SETTLE_MS = 250;

/**
 * Auto's two sizes, changed only once a resize has settled. While a window edge is being
 * dragged every surface keeps its size and just tracks the window; when the drag stops
 * both sizes change together, once, past the hysteresis band of the sizes they had, so one
 * transition moves everything. The first measurement is taken as it is, so a page loads at
 * its final sizes.
 */
export function useAutoOverlayScales(spaces: OverlaySpaces, devicePixelRatio: number): AutoScales {
  const [scales, setScales] = useState(() => resolveAutoScales(spaces, devicePixelRatio));
  const scalesRef = useRef(scales);
  scalesRef.current = scales;
  const { window, gameView } = spaces;

  useEffect(() => {
    const current = scalesRef.current;
    const next = resolveAutoScales(
      {
        window: { width: window.width, height: window.height },
        gameView: { width: gameView.width, height: gameView.height },
      },
      devicePixelRatio,
      current,
    );
    if (next.chrome === current.chrome && next.scene === current.scene) return;
    const timer = setTimeout(() => setScales(next), AUTO_SETTLE_MS);
    return () => clearTimeout(timer);
  }, [window.width, window.height, gameView.width, gameView.height, devicePixelRatio]);

  return scales;
}
