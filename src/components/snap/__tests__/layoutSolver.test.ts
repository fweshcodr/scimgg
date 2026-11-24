import { describe, expect, it } from 'vitest';
import { PANEL_SCALE_STOPS } from '../../panelScale';
import { type LayoutPanel, projectPanel, snapPanelRect, solvePanelLayout } from '../layoutSolver';
import { type Attachment, detectAttachments } from '../panelAttachment';

const viewport = { width: 1000, height: 800 };
const anchors = [
  { anchorX: 'left', anchorY: 'top' },
  { anchorX: 'right', anchorY: 'top' },
  { anchorX: 'left', anchorY: 'bottom' },
  { anchorX: 'right', anchorY: 'bottom' },
] as const;
function panel(id: string, left: number, top: number, width = 200, height = 100): LayoutPanel {
  return {
    id,
    width,
    height,
    viewport,
    placement: {
      position: { x: left, y: top, anchorX: 'left', anchorY: 'top' },
      width,
      height,
      viewportWidth: 1000,
      viewportHeight: 800,
    },
  };
}
const resized = (p: LayoutPanel, scale: number, frame = viewport): LayoutPanel => ({
  ...p,
  width: p.placement.width * scale,
  height: p.placement.height * scale,
  viewport: frame,
});

describe('layout solver properties', () => {
  const scales = [...PANEL_SCALE_STOPS, 1.001, 1.32, 1.7842];
  const frames = [viewport, { width: 2000, height: 1600 }, { width: 765, height: 503 }];
  const fractions = [0, 8 / 800, 8.001 / 800, 10 / 800, 50 / 800, 150 / 800, 200 / 800, 1 / 3, 0.5, 2 / 3, 1];

  it.each(anchors)('round-trips, composes and is anchor-symmetric: $anchorX/$anchorY', (anchor) => {
    for (const t of fractions) {
      const initial = panel('panel', 800 * t, 700 * (1 - t));
      initial.placement.position = {
        ...anchor,
        x: anchor.anchorX === 'left' ? 800 * t : 800 * (1 - t),
        y: anchor.anchorY === 'top' ? 700 * (1 - t) : 700 * t,
      };
      const reference = structuredClone(initial);
      const start = solvePanelLayout([initial], new Map()).get('panel')!;
      for (const frame of frames)
        for (const scale of scales) {
          const destination = resized(initial, scale, frame);
          const direct = solvePanelLayout([destination], new Map()).get('panel')!;
          // Stepped delivery never changes the normalized reference.
          for (const step of [1.001, 7 / 6, 1.32, scale]) solvePanelLayout([resized(initial, step)], new Map());
          const stepped = solvePanelLayout([destination], new Map()).get('panel')!;
          expect(stepped).toEqual(direct);
          expect(direct.left).toBeCloseTo(Math.max(0, frame.width - destination.width) * t, 9);
          expect(direct.top).toBeCloseTo(Math.max(0, frame.height - destination.height) * (1 - t), 9);
          expect(solvePanelLayout([initial], new Map()).get('panel')).toEqual(start);
          expect(initial).toEqual(reference);
        }
    }
  });

  it('uses the center for zero and negative reference slack, for every stored anchor', () => {
    for (const size of [1000, 1100])
      for (const anchor of anchors) {
        const p = panel('panel', 8, 8, size, size);
        p.placement.position = { ...anchor, x: 8, y: 8 };
        p.width = 400;
        p.height = 200;
        const rect = solvePanelLayout([p], new Map()).get('panel')!;
        expect(rect.left).toBe(300);
        expect(rect.top).toBe(300);
      }
  });

  it('is continuous around an 8px gap and through small scale changes', () => {
    const epsilon = 0.001;
    for (const gap of [0, 7.999, 8, 8.001, 10, 150, 400]) {
      const a = resized(panel('a', gap, gap), 2);
      const b = resized(panel('a', gap + epsilon, gap + epsilon), 2);
      const ra = solvePanelLayout([a], new Map()).get('a')!;
      const rb = solvePanelLayout([b], new Map()).get('a')!;
      expect(Math.abs(ra.left - rb.left)).toBeLessThanOrEqual(epsilon + 1e-10);
      expect(Math.abs(ra.top - rb.top)).toBeLessThanOrEqual(epsilon + 1e-10);
      const rc = solvePanelLayout([resized(a, 2 + epsilon)], new Map()).get('a')!;
      expect(Math.abs(ra.left - rc.left)).toBeLessThanOrEqual(200 * epsilon + 1e-10);
    }
  });

  it('quantizes both shared end edges, not independent top-left points', () => {
    for (const dpr of [1, 1.25, 1.5, 2]) {
      const body = snapPanelRect(
        { id: 'body', left: 1820 - (204 * 7) / 6, right: 1820, top: 200.4, bottom: 440.6 },
        dpr,
      );
      const tabs = snapPanelRect(
        { id: 'tabs', left: 1820 - (237 * 7) / 6, right: 1820, top: 442.6, bottom: 484.6 },
        dpr,
      );
      expect(body.right).toBe(tabs.right);
      for (const value of [body.left, body.right, body.top, body.bottom, tabs.left, tabs.right]) {
        expect(value * dpr).toBeCloseTo(Math.round(value * dpr), 9);
      }
    }
  });
});

describe('assembly constraints', () => {
  const host = panel('host', 650, 300, 200, 200);
  const child = panel('child', 855, 300, 100, 100);
  const graph = detectAttachments([projectPanel(host), projectPanel(child)], viewport);

  it.each([
    'above',
    'below',
    'left',
    'right',
  ] as const)('preserves every alignment for fitting %s attachments across the scale ladder', (side) => {
    for (const align of ['start', 'center', 'end'] as const) {
      const root = panel('root', 400, 300, 200, 200);
      const child = panel('child', 0, 0, 100, 50);
      const horizontal = side === 'above' || side === 'below';
      const start = horizontal ? root.placement.position.x : root.placement.position.y;
      const childSize = horizontal ? child.width : child.height;
      const along = start + (align === 'start' ? 0 : align === 'end' ? 200 - childSize : (200 - childSize) / 2);
      child.placement.position = {
        anchorX: 'left',
        anchorY: 'top',
        x: horizontal ? along : side === 'left' ? 295 : 605,
        y: horizontal ? (side === 'above' ? 245 : 505) : along,
      };
      const edges = detectAttachments([projectPanel(root), projectPanel(child)], viewport);
      expect(edges.get('child')).toMatchObject({ hostId: 'root', side, align });
      for (const scale of [...PANEL_SCALE_STOPS, 1.32, 1.005]) {
        const result = solvePanelLayout([resized(child, scale), resized(root, scale)], edges);
        const a = result.get('root')!;
        const b = result.get('child')!;
        const gap =
          side === 'above'
            ? a.top - b.bottom
            : side === 'below'
              ? b.top - a.bottom
              : side === 'left'
                ? a.left - b.right
                : b.left - a.right;
        expect(gap).toBeCloseTo(5, 9);
        const reference = (r: typeof a) => {
          const start = horizontal ? r.left : r.top;
          const end = horizontal ? r.right : r.bottom;
          return align === 'start' ? start : align === 'end' ? end : (start + end) / 2;
        };
        expect(reference(a)).toBeCloseTo(reference(b), 9);
      }
    }
  });

  it('translates a fitting assembly rather than clamping the follower into its host', () => {
    const result = solvePanelLayout([resized(host, 2), resized(child, 2)], graph);
    expect(result.get('host')).toEqual({ id: 'host', left: 395, right: 795, top: 200, bottom: 600 });
    expect(result.get('child')).toEqual({ id: 'child', left: 800, right: 1000, top: 200, bottom: 400 });
    expect(solvePanelLayout([host, child], graph).get('child')?.left).toBe(855);
  });

  it('translates the whole assembly around a member exclusion', () => {
    const result = solvePanelLayout(
      [host, { ...child, exclusions: [{ left: 900, top: 0, right: 1000, bottom: 800 }] }],
      graph,
    );
    expect(result.get('child')?.right).toBe(900);
    expect(result.get('child')!.left - result.get('host')!.right).toBe(5);
    expect(result.get('child')!.top).toBe(result.get('host')!.top);
  });

  it('only breaks gaps for an overflowing assembly, restoring the arranged layout afterwards', () => {
    const small = { width: 500, height: 800 };
    const result = solvePanelLayout([resized(host, 2, small), resized(child, 2, small)], graph);
    const root = result.get('host')!;
    const follower = result.get('child')!;
    expect(root.left).toBeGreaterThanOrEqual(0);
    expect(root.right).toBeLessThanOrEqual(500);
    expect(follower.left).toBeGreaterThanOrEqual(0);
    expect(follower.right).toBeLessThanOrEqual(500);
    expect(follower.left - root.right).not.toBe(5);
    expect(solvePanelLayout([host, child], graph).get('child')?.left).toBe(855);
  });

  it('orders chains root-first and preserves gap and end alignment at every scale', () => {
    const root = panel('root', 400, 500, 200, 200);
    const middle = panel('middle', 450, 415, 150, 80);
    const leaf = panel('leaf', 500, 370, 100, 40);
    const panels = [leaf, root, middle];
    const edges = detectAttachments(panels.map(projectPanel), viewport);
    for (const scale of [1, 1.001, 7 / 6, 1.32, 2]) {
      const result = solvePanelLayout(
        panels.map((p) => resized(p, scale)),
        edges,
      );
      for (const [childId, hostId] of [
        ['leaf', 'middle'],
        ['middle', 'root'],
      ]) {
        expect(result.get(hostId)!.top - result.get(childId)!.bottom).toBeCloseTo(5, 9);
        expect(result.get(hostId)!.right).toBeCloseTo(result.get(childId)!.right, 9);
      }
    }
  });

  it('defends against cycles, vanished hosts and replay participation', () => {
    const edge: Attachment = { id: 'host', hostId: 'child', side: 'left', gap: 5, align: 'start', offset: 0 };
    const cyclic = new Map([...graph, ['host', edge] as const]);
    expect(solvePanelLayout([host, child], cyclic).size).toBe(2);
    expect(solvePanelLayout([child], cyclic).get('child')).toEqual(projectPanel(child));
    const fixed = { left: 650.4, top: 300.6, right: 850.4, bottom: 500.6 };
    const result = solvePanelLayout([{ ...host, fixed, replay: true }, child], graph);
    expect(result.get('host')).toEqual({ id: 'host', ...fixed });
    expect(result.get('child')).toEqual(projectPanel(child));
  });
});
