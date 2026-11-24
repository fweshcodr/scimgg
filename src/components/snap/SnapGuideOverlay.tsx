/**
 * SnapGuideOverlay — restrained visual feedback for cross-panel snap.
 *
 * Mounted inside Grid's frame-local overlay layer so panel rects and visuals
 * share the same coordinate space in both fit-window and fixed-resolution mode.
 */
import type React from 'react';
import { useSyncExternalStore } from 'react';
import { type SnapEngagement, type SnapState, usePanelSnapRegistry } from './PanelSnapRegistry';
import './SnapGuideOverlay.css';

const EMPTY_STATE: SnapState = { active: false, engagement: null };
const MARKER_LONG_PX = 28;
const EDGE_TICK_THICKNESS_PX = 1;

function isVerticalContact(eng: SnapEngagement): boolean {
  return eng.contact === 'right-to-left' || eng.contact === 'left-to-right';
}

export function buildGapMarkerStyle(eng: SnapEngagement): React.CSSProperties {
  const c = eng.gapChannel;
  if (isVerticalContact(eng)) {
    const height = Math.min(MARKER_LONG_PX, c.height);
    return {
      left: c.left,
      top: c.top + (c.height - height) / 2,
      width: c.width,
      height,
    };
  }

  const width = Math.min(MARKER_LONG_PX, c.width);
  return {
    left: c.left + (c.width - width) / 2,
    top: c.top,
    width,
    height: c.height,
  };
}

export function buildFacingEdgeTickStyles(eng: SnapEngagement): [React.CSSProperties, React.CSSProperties] {
  const marker = buildGapMarkerStyle(eng);
  const m = eng.movingRect;
  const t = eng.targetRect;

  switch (eng.contact) {
    case 'right-to-left':
      return [
        {
          left: m.right - EDGE_TICK_THICKNESS_PX,
          top: marker.top,
          width: EDGE_TICK_THICKNESS_PX,
          height: marker.height,
        },
        { left: t.left, top: marker.top, width: EDGE_TICK_THICKNESS_PX, height: marker.height },
      ];
    case 'left-to-right':
      return [
        { left: m.left, top: marker.top, width: EDGE_TICK_THICKNESS_PX, height: marker.height },
        {
          left: t.right - EDGE_TICK_THICKNESS_PX,
          top: marker.top,
          width: EDGE_TICK_THICKNESS_PX,
          height: marker.height,
        },
      ];
    case 'bottom-to-top':
      return [
        {
          left: marker.left,
          top: m.bottom - EDGE_TICK_THICKNESS_PX,
          width: marker.width,
          height: EDGE_TICK_THICKNESS_PX,
        },
        { left: marker.left, top: t.top, width: marker.width, height: EDGE_TICK_THICKNESS_PX },
      ];
    case 'top-to-bottom':
      return [
        { left: marker.left, top: m.top, width: marker.width, height: EDGE_TICK_THICKNESS_PX },
        {
          left: marker.left,
          top: t.bottom - EDGE_TICK_THICKNESS_PX,
          width: marker.width,
          height: EDGE_TICK_THICKNESS_PX,
        },
      ];
  }
}

export const SnapGuideOverlay: React.FC = () => {
  const registry = usePanelSnapRegistry();

  const subscribe = registry?.subscribeSnapState;
  const getSnapStateRaw = registry?.getSnapState;

  const snapState = useSyncExternalStore(
    subscribe ?? (() => () => {}),
    getSnapStateRaw ?? (() => EMPTY_STATE),
    () => EMPTY_STATE,
  );

  if (!registry || !snapState.active || !snapState.engagement) return null;

  const eng = snapState.engagement;
  const stateClass = eng.state === 'engaged' ? 'is-engaged' : 'is-preview';
  const [movingTickStyle, targetTickStyle] = buildFacingEdgeTickStyles(eng);

  return (
    <div className="snap-guide-overlay" aria-hidden>
      <div className={`snap-gap-marker ${stateClass}`} style={buildGapMarkerStyle(eng)} />
      {eng.state === 'engaged' && (
        <>
          <div className="snap-edge-tick" style={movingTickStyle} />
          <div className="snap-edge-tick" style={targetTickStyle} />
        </>
      )}
    </div>
  );
};
