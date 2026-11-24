import type React from 'react';
import { describe, expect, it } from 'vitest';
import type { ContactKind, SnapEngagement } from '../PanelSnapRegistry';
import { buildFacingEdgeTickStyles, buildGapMarkerStyle } from '../SnapGuideOverlay';

const MARKER_LONG_PX = 28;
const EDGE_TICK_THICKNESS_PX = 1;

function engagement(contact: ContactKind): SnapEngagement {
  const vertical = contact === 'right-to-left' || contact === 'left-to-right';
  return {
    targetId: 'target',
    contact,
    linePosition: vertical ? 50 : 60,
    perpendicularStart: 10,
    perpendicularEnd: 110,
    state: 'engaged',
    movingRect: { left: 20, top: 30, right: 70, bottom: 80 },
    targetRect: { left: 75, top: 25, right: 125, bottom: 75 },
    gapChannel: vertical ? { left: 70, top: 10, width: 5, height: 100 } : { left: 20, top: 80, width: 100, height: 5 },
  };
}

function expectStyle(style: React.CSSProperties, expected: React.CSSProperties): void {
  expect(style).toEqual(expected);
}

describe('SnapGuideOverlay style builders', () => {
  it('centers the right-to-left gap marker and bounds its long axis', () => {
    expectStyle(buildGapMarkerStyle(engagement('right-to-left')), {
      left: 70,
      top: 10 + (100 - MARKER_LONG_PX) / 2,
      width: 5,
      height: MARKER_LONG_PX,
    });
  });

  it('centers the left-to-right gap marker and bounds its long axis', () => {
    expectStyle(buildGapMarkerStyle(engagement('left-to-right')), {
      left: 70,
      top: 10 + (100 - MARKER_LONG_PX) / 2,
      width: 5,
      height: MARKER_LONG_PX,
    });
  });

  it('centers the bottom-to-top gap marker and bounds its long axis', () => {
    expectStyle(buildGapMarkerStyle(engagement('bottom-to-top')), {
      left: 20 + (100 - MARKER_LONG_PX) / 2,
      top: 80,
      width: MARKER_LONG_PX,
      height: 5,
    });
  });

  it('centers the top-to-bottom gap marker and bounds its long axis', () => {
    expectStyle(buildGapMarkerStyle(engagement('top-to-bottom')), {
      left: 20 + (100 - MARKER_LONG_PX) / 2,
      top: 80,
      width: MARKER_LONG_PX,
      height: 5,
    });
  });

  it('places right-to-left facing edge ticks on moving right and target left edges', () => {
    expect(buildFacingEdgeTickStyles(engagement('right-to-left'))).toEqual([
      { left: 70 - EDGE_TICK_THICKNESS_PX, top: 46, width: EDGE_TICK_THICKNESS_PX, height: MARKER_LONG_PX },
      { left: 75, top: 46, width: EDGE_TICK_THICKNESS_PX, height: MARKER_LONG_PX },
    ]);
  });

  it('places left-to-right facing edge ticks on moving left and target right edges', () => {
    expect(buildFacingEdgeTickStyles(engagement('left-to-right'))).toEqual([
      { left: 20, top: 46, width: EDGE_TICK_THICKNESS_PX, height: MARKER_LONG_PX },
      { left: 125 - EDGE_TICK_THICKNESS_PX, top: 46, width: EDGE_TICK_THICKNESS_PX, height: MARKER_LONG_PX },
    ]);
  });

  it('places bottom-to-top facing edge ticks on moving bottom and target top edges', () => {
    expect(buildFacingEdgeTickStyles(engagement('bottom-to-top'))).toEqual([
      { left: 56, top: 80 - EDGE_TICK_THICKNESS_PX, width: MARKER_LONG_PX, height: EDGE_TICK_THICKNESS_PX },
      { left: 56, top: 25, width: MARKER_LONG_PX, height: EDGE_TICK_THICKNESS_PX },
    ]);
  });

  it('places top-to-bottom facing edge ticks on moving top and target bottom edges', () => {
    expect(buildFacingEdgeTickStyles(engagement('top-to-bottom'))).toEqual([
      { left: 56, top: 30, width: MARKER_LONG_PX, height: EDGE_TICK_THICKNESS_PX },
      { left: 56, top: 75 - EDGE_TICK_THICKNESS_PX, width: MARKER_LONG_PX, height: EDGE_TICK_THICKNESS_PX },
    ]);
  });
});
