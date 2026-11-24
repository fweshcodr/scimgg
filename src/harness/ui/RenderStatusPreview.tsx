import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { ViewportStatusOverlay } from '../../components/ViewportStatusOverlay';
import type { RenderStatus } from '../../render/core/renderer';

/**
 * Dev-only standalone preview of the 3D view's status notice (`?renderStatus=`,
 * `?renderStatusHeld=`).
 *
 * The harness mounts no renderer at all (`rendererType: 'none'`), so there is no context to lose
 * and no app state that reaches this notice: unlike a `HARNESS_SURFACES` entry, this mounts the
 * component rather than reaching a state the player can reach. It portals into Grid's own
 * container so the notice lands on its real layer, over the readouts and under the chrome, which
 * is the part a screenshot has to get right.
 */
export function RenderStatusPreview({
  status,
  heldActivity,
}: {
  status: RenderStatus;
  heldActivity: 'fight' | 'replay' | null;
}) {
  const [host, setHost] = useState<HTMLElement | null>(null);
  const [portrait, setPortrait] = useState(false);
  const [cornerOccupied, setCornerOccupied] = useState(false);

  useEffect(() => {
    const container = document.querySelector('.scene-viewport')?.parentElement ?? null;
    setHost(container);
    if (!container) return;
    // Grid derives these from `visibleSceneRect` and `clientLayoutMode`; with no drawers open in
    // the harness the container is that rectangle, and the corner stones' presence is the same
    // answer as the Mobile layout mode.
    const measure = () => {
      setPortrait(container.clientHeight > container.clientWidth);
      setCornerOccupied(document.querySelector('.osm-menu') !== null);
    };
    measure();
    const sizes = new ResizeObserver(measure);
    sizes.observe(container);
    return () => sizes.disconnect();
  }, []);

  if (!host) return null;
  // No wait: the preview is the state being looked at, not a blip to ride out.
  return createPortal(
    <ViewportStatusOverlay
      status={status}
      portrait={portrait}
      cornerOccupied={cornerOccupied}
      heldActivity={heldActivity}
      recoveringDelayMs={0}
    />,
    host,
  );
}
