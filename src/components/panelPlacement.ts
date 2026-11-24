/**
 * Where a movable panel goes when its viewport or its rendered scale changes.
 *
 * One rule per axis, whichever edge the position happens to be stored against:
 *   - every panel keeps its fraction of the free space (`left / (viewport - size)`),
 *     so a centered panel stays centered and a panel a third of the way across stays a
 *     third of the way across. Equivalently it grows about the point that same fraction
 *     across itself.
 * The stored anchor only decides which edge the resulting offset is written against;
 * left- and right-anchored saves of the same spot land on the same spot.
 *
 * The projection always runs from a fixed reference (the last intentional placement), so
 * it is exact at the reference geometry and independent of the order changes arrive in.
 */
import type { UIPosition } from '../hooks/usePersistedSettings';

export interface PlacementGeometry {
  viewportWidth: number;
  viewportHeight: number;
}

export interface PanelPlacement extends PlacementGeometry {
  position: UIPosition;
  width: number;
  height: number;
}

/**
 * The reference fraction is continuous across the entire free space. Degenerate
 * reference frames use the center; destination overflow is handled by the solver.
 */
function projectAxis(
  referenceStart: number,
  referenceViewport: number,
  referenceSize: number,
  viewport: number,
  size: number,
): number {
  const referenceSlack = referenceViewport - referenceSize;
  const fraction = referenceSlack > 0 ? Math.max(0, Math.min(1, referenceStart / referenceSlack)) : 0.5;
  return fraction * Math.max(0, viewport - size);
}

/**
 * `width` and `height` are the NEXT rendered box. The reference box is explicit,
 * so a content reflow cannot silently change how the original offset is interpreted.
 */
export function projectPlacement(
  placement: PanelPlacement,
  next: PlacementGeometry,
  width: number,
  height: number,
): UIPosition {
  const { position } = placement;
  if (
    placement.viewportWidth === next.viewportWidth &&
    placement.viewportHeight === next.viewportHeight &&
    placement.width === width &&
    placement.height === height &&
    placement.viewportWidth > width &&
    placement.viewportHeight > height
  ) {
    return position;
  }
  const referenceWidth = placement.width;
  const referenceHeight = placement.height;
  const referenceLeft =
    position.anchorX === 'left' ? position.x : placement.viewportWidth - referenceWidth - position.x;
  const referenceTop =
    position.anchorY === 'top' ? position.y : placement.viewportHeight - referenceHeight - position.y;

  const left = projectAxis(referenceLeft, placement.viewportWidth, referenceWidth, next.viewportWidth, width);
  const top = projectAxis(referenceTop, placement.viewportHeight, referenceHeight, next.viewportHeight, height);
  return {
    ...position,
    x: position.anchorX === 'left' ? left : next.viewportWidth - width - left,
    y: position.anchorY === 'top' ? top : next.viewportHeight - height - top,
  };
}
