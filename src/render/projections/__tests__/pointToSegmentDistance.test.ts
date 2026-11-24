import { describe, expect, it } from 'vitest';
import { pointToSegmentDistance } from '../Projection3D';

describe('pointToSegmentDistance', () => {
  it('returns perpendicular distance when the projection lands inside the segment', () => {
    expect(pointToSegmentDistance({ x: 5, y: 3 }, { x: 0, y: 0 }, { x: 10, y: 0 })).toBeCloseTo(3);
  });

  it('clamps to endpoint A when the projection falls before the segment start', () => {
    expect(pointToSegmentDistance({ x: -4, y: 0 }, { x: 0, y: 0 }, { x: 10, y: 0 })).toBeCloseTo(4);
  });

  it('clamps to endpoint B when the projection falls past the segment end', () => {
    expect(pointToSegmentDistance({ x: 13, y: 4 }, { x: 0, y: 0 }, { x: 10, y: 0 })).toBeCloseTo(5);
  });

  it('returns point-to-point distance for a degenerate zero-length segment', () => {
    expect(pointToSegmentDistance({ x: 3, y: 4 }, { x: 0, y: 0 }, { x: 0, y: 0 })).toBeCloseTo(5);
  });

  it('returns 0 when the point lies exactly on the segment', () => {
    expect(pointToSegmentDistance({ x: 4, y: 0 }, { x: 0, y: 0 }, { x: 10, y: 0 })).toBeCloseTo(0);
  });

  it('picks the nearest of four tile edges (edge-selection use case)', () => {
    const sw = { x: 0, y: 0 };
    const se = { x: 10, y: 0 };
    const ne = { x: 10, y: 10 };
    const nw = { x: 0, y: 10 };
    const cursor = { x: 5, y: 9 };
    const south = pointToSegmentDistance(cursor, sw, se);
    const east = pointToSegmentDistance(cursor, se, ne);
    const north = pointToSegmentDistance(cursor, nw, ne);
    const west = pointToSegmentDistance(cursor, sw, nw);
    const min = Math.min(south, east, north, west);
    expect(north).toBe(min);
  });
});
