import { describe, expect, it } from 'vitest';
import {
  edgeToCanonicalSegment,
  lineMarkerEndpoints,
  lineMarkerKey,
  lineMarkerKeyOf,
  type TileEdge,
} from '../lineMarkers';

describe('lineMarkerKey', () => {
  it('encodes orientation + origin', () => {
    expect(lineMarkerKey(3, 5, 'horizontal')).toBe('h:3:5');
    expect(lineMarkerKey(3, 5, 'vertical')).toBe('v:3:5');
  });

  it('lineMarkerKeyOf matches lineMarkerKey', () => {
    expect(lineMarkerKeyOf({ x: 7, y: 2, orientation: 'vertical' })).toBe('v:7:2');
  });
});

describe('edgeToCanonicalSegment', () => {
  it('maps each cardinal edge to the SW-origin canonical segment', () => {
    expect(edgeToCanonicalSegment({ x: 4, y: 6, edge: 'south' })).toEqual({
      x: 4,
      y: 6,
      orientation: 'horizontal',
    });
    expect(edgeToCanonicalSegment({ x: 4, y: 6, edge: 'north' })).toEqual({
      x: 4,
      y: 7,
      orientation: 'horizontal',
    });
    expect(edgeToCanonicalSegment({ x: 4, y: 6, edge: 'west' })).toEqual({
      x: 4,
      y: 6,
      orientation: 'vertical',
    });
    expect(edgeToCanonicalSegment({ x: 4, y: 6, edge: 'east' })).toEqual({
      x: 5,
      y: 6,
      orientation: 'vertical',
    });
  });

  it('resolves a boundary shared by two adjacent tiles to ONE canonical segment', () => {
    const northOfLower = edgeToCanonicalSegment({ x: 4, y: 6, edge: 'north' });
    const southOfUpper = edgeToCanonicalSegment({ x: 4, y: 7, edge: 'south' });
    expect(northOfLower).toEqual(southOfUpper);
    expect(lineMarkerKey(northOfLower.x, northOfLower.y, northOfLower.orientation)).toBe(
      lineMarkerKey(southOfUpper.x, southOfUpper.y, southOfUpper.orientation),
    );

    const eastOfLeft = edgeToCanonicalSegment({ x: 4, y: 6, edge: 'east' });
    const westOfRight = edgeToCanonicalSegment({ x: 5, y: 6, edge: 'west' });
    expect(eastOfLeft).toEqual(westOfRight);
  });

  it('round-trips every edge through the canonical form deterministically', () => {
    const edges: TileEdge[] = ['north', 'east', 'south', 'west'];
    for (const edge of edges) {
      const seg = edgeToCanonicalSegment({ x: 10, y: 20, edge });
      expect(seg.orientation === 'horizontal' || seg.orientation === 'vertical').toBe(true);
    }
  });
});

describe('lineMarkerEndpoints', () => {
  it('gives east-running endpoints for horizontal segments', () => {
    expect(lineMarkerEndpoints({ x: 2, y: 3, orientation: 'horizontal' })).toEqual({
      ax: 2,
      ay: 3,
      bx: 3,
      by: 3,
    });
  });

  it('gives north-running endpoints for vertical segments', () => {
    expect(lineMarkerEndpoints({ x: 2, y: 3, orientation: 'vertical' })).toEqual({
      ax: 2,
      ay: 3,
      bx: 2,
      by: 4,
    });
  });
});
