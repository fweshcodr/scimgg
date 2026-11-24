/**
 * Panels docked against each other stay docked through a resize.
 *
 * Attachments are captured on intentional arrangements, never from a resize: two panels
 * are attached when an edge of one sits within a docking gap of the facing edge of the
 * other and they overlap along that edge. The smaller panel follows the larger one,
 * keeping its gap and its alignment (start, end or center) to it; the larger one is
 * placed by its own rule. Dragging a panel away changes its arrangement;
 * automatic movement does not.
 *
 * Host order is a strict ranking, so the attachments always form a forest: a panel
 * docked against more viewport edges outranks one against fewer (a corner fixes its place,
 * an edge fixes one axis), then the larger panel outranks the smaller, then id. So the
 * modern game panel follows its tab bar in the corner, and infoboxes follow the game panel. Each panel follows at most one
 * host, the higher-ranked neighbor it shares the longest edge with, and chains
 * (A above B above C) resolve from the root outwards.
 */
import { MIN_OVERLAP_PX } from './panelOverlap';

/** The empty space left between shift-snapped panels. Re-exported by PanelSnapRegistry. */
export const SNAP_GAP_PX = 5;
/**
 * Widest gap that still reads as docked, to another panel or to a viewport edge: the
 * shift-snap gap plus a few pixels of hand placement.
 */
export const DOCKED_WITHIN_PX = SNAP_GAP_PX + 3;
/** Panels overlapping by a couple of pixels are still side by side, not stacked. */
export const ATTACH_MIN_GAP_PX = -2;

export interface AttachRect {
  id: string;
  left: number;
  top: number;
  right: number;
  bottom: number;
}

export interface AttachViewport {
  width: number;
  height: number;
}

/** `side` is where the attached panel sits relative to its host. */
export type AttachSide = 'above' | 'below' | 'left' | 'right';
export type AttachAlign = 'start' | 'end' | 'center';

export interface Attachment {
  id: string;
  hostId: string;
  side: AttachSide;
  gap: number;
  /** Along the shared edge: which edges line up, and by how much they are offset. */
  align: AttachAlign;
  offset: number;
}

interface Candidate extends Attachment {
  overlap: number;
}

/** How many viewport edges the panel is docked against: 2 in a corner, 1 on an edge. */
function huggedEdges(rect: AttachRect, viewport: AttachViewport): number {
  return [rect.left, rect.top, viewport.width - rect.right, viewport.height - rect.bottom].filter(
    (gap) => gap <= DOCKED_WITHIN_PX,
  ).length;
}

function area(rect: AttachRect): number {
  return (rect.right - rect.left) * (rect.bottom - rect.top);
}

/** True when `a` hosts `b`. A strict total order, so no two panels host each other. */
function outranks(a: AttachRect, b: AttachRect, viewport: AttachViewport): boolean {
  const hugA = huggedEdges(a, viewport);
  const hugB = huggedEdges(b, viewport);
  if (hugA !== hugB) return hugA > hugB;
  const areaA = area(a);
  const areaB = area(b);
  if (areaA !== areaB) return areaA > areaB;
  return a.id < b.id;
}

function alignment(start: number, end: number, hostStart: number, hostEnd: number) {
  const options: Array<{ align: AttachAlign; offset: number }> = [
    { align: 'start', offset: start - hostStart },
    { align: 'end', offset: end - hostEnd },
    { align: 'center', offset: (start + end) / 2 - (hostStart + hostEnd) / 2 },
  ];
  return options.reduce((best, option) => (Math.abs(option.offset) < Math.abs(best.offset) ? option : best));
}

/**
 * Relations are read from painted rects, which carry float noise from fractional scales
 * (a strip at 1.35x). CSS lays out on a 1/64px grid, so nothing finer is a real distance,
 * and snapping to it lets a resize round trip land back on the exact original offsets.
 */
const toLayoutUnit = (value: number) => Math.round(value * 64) / 64;
const withoutFloatNoise = (value: number) => {
  const grid = toLayoutUnit(value);
  return Math.abs(grid - value) < 1e-6 ? grid : value;
};

function relation(child: AttachRect, host: AttachRect): Candidate | null {
  const horizontalOverlap = Math.min(child.right, host.right) - Math.max(child.left, host.left);
  const verticalOverlap = Math.min(child.bottom, host.bottom) - Math.max(child.top, host.top);
  const docked = (gap: number) => gap >= ATTACH_MIN_GAP_PX && gap <= DOCKED_WITHIN_PX;
  const sides: Array<{ side: AttachSide; gap: number; overlap: number }> = [
    { side: 'above', gap: host.top - child.bottom, overlap: horizontalOverlap },
    { side: 'below', gap: child.top - host.bottom, overlap: horizontalOverlap },
    { side: 'left', gap: host.left - child.right, overlap: verticalOverlap },
    { side: 'right', gap: child.left - host.right, overlap: verticalOverlap },
  ];
  const match = sides.find((s) => docked(s.gap) && s.overlap >= MIN_OVERLAP_PX);
  if (!match) return null;
  const horizontalEdge = match.side === 'above' || match.side === 'below';
  const { align, offset } = horizontalEdge
    ? alignment(child.left, child.right, host.left, host.right)
    : alignment(child.top, child.bottom, host.top, host.bottom);
  return {
    id: child.id,
    hostId: host.id,
    side: match.side,
    gap: withoutFloatNoise(match.gap),
    align,
    offset: withoutFloatNoise(offset),
    overlap: match.overlap,
  };
}

/**
 * Each panel's host, from one consistent layout. `attachable` excludes panels whose owner
 * positions them (they can still host).
 */
export function detectAttachments(
  rects: readonly AttachRect[],
  viewport: AttachViewport,
  attachable: (id: string) => boolean = () => true,
): Map<string, Attachment> {
  const result = new Map<string, Attachment>();
  for (const child of rects) {
    if (!attachable(child.id)) continue;
    let best: Candidate | null = null;
    for (const host of rects) {
      if (host === child || !outranks(host, child, viewport)) continue;
      const candidate = relation(child, host);
      if (!candidate) continue;
      if (
        !best ||
        candidate.overlap > best.overlap ||
        (candidate.overlap === best.overlap && Math.abs(candidate.gap) < Math.abs(best.gap))
      ) {
        best = candidate;
      }
    }
    if (best) {
      const { overlap: _overlap, ...attachment } = best;
      result.set(child.id, attachment);
    }
  }
  return result;
}

/**
 * Final rects for every attached panel. Hosts keep their `current` rect (already placed by
 * their own rule); attached panels keep their `current` size and are placed against their
 * host's resolved rect, roots first. Constraints belong to the assembly solver,
 * never to an individual follower in this dependency walk.
 */
export function resolveAttachedRects(
  attachments: ReadonlyMap<string, Attachment>,
  current: ReadonlyMap<string, AttachRect>,
): Map<string, AttachRect> {
  const resolved = new Map<string, AttachRect>();
  const resolving = new Set<string>();

  const place = (id: string): AttachRect | undefined => {
    const done = resolved.get(id);
    if (done) return done;
    const rect = current.get(id);
    const attachment = attachments.get(id);
    // Unattached, vanished, or (defensively) part of a cycle: the panel's own rect.
    if (!rect || !attachment || resolving.has(id)) return rect;
    resolving.add(id);
    const host = place(attachment.hostId);
    resolving.delete(id);
    if (!host) return rect;

    const width = rect.right - rect.left;
    const height = rect.bottom - rect.top;
    const along = (start: number, end: number, size: number) =>
      attachment.align === 'start'
        ? start + attachment.offset
        : attachment.align === 'end'
          ? end + attachment.offset - size
          : (start + end) / 2 + attachment.offset - size / 2;
    let left: number;
    let top: number;
    switch (attachment.side) {
      case 'above':
        top = host.top - attachment.gap - height;
        left = along(host.left, host.right, width);
        break;
      case 'below':
        top = host.bottom + attachment.gap;
        left = along(host.left, host.right, width);
        break;
      case 'left':
        left = host.left - attachment.gap - width;
        top = along(host.top, host.bottom, height);
        break;
      case 'right':
        left = host.right + attachment.gap;
        top = along(host.top, host.bottom, height);
        break;
    }
    // Float noise from the host's projection must not leave a round trip a hair off where
    // it started: a value within a millionth of the layout grid is on it.
    left = withoutFloatNoise(left);
    top = withoutFloatNoise(top);
    const placed = { id, left, top, right: left + width, bottom: top + height };
    resolved.set(id, placed);
    return placed;
  };

  for (const id of attachments.keys()) place(id);
  return resolved;
}
