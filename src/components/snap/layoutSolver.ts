import { type PanelPlacement, projectPlacement } from '../panelPlacement';
import { type Attachment, type AttachRect, type AttachViewport, resolveAttachedRects } from './panelAttachment';

export type LayoutRect = Omit<AttachRect, 'id'>;

export interface LayoutPanel {
  id: string;
  placement: PanelPlacement;
  width: number;
  height: number;
  viewport: AttachViewport;
  /** Pins and recorder geometry are fixed inputs, not candidates for projection. */
  fixed?: LayoutRect;
  replay?: boolean;
  exclusions?: readonly LayoutRect[];
  inset?: number;
}

export function moveRect(rect: AttachRect, dx: number, dy: number): AttachRect {
  return { ...rect, left: rect.left + dx, right: rect.right + dx, top: rect.top + dy, bottom: rect.bottom + dy };
}

export function projectPanel(panel: LayoutPanel): AttachRect {
  if (panel.fixed) return { id: panel.id, ...panel.fixed };
  const { viewport, width, height } = panel;
  const pos = projectPlacement(
    panel.placement,
    {
      viewportWidth: viewport.width,
      viewportHeight: viewport.height,
    },
    width,
    height,
  );
  const left = pos.anchorX === 'left' ? pos.x : viewport.width - width - pos.x;
  const top = pos.anchorY === 'top' ? pos.y : viewport.height - height - pos.y;
  return { id: panel.id, left, top, right: left + width, bottom: top + height };
}

const overlaps = (a: LayoutRect, b: LayoutRect) =>
  a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top;

/** Nearest legal translation of the entire assembly. Boundary candidates suffice
 * for axis-aligned constraints; unlike iterative pushes this cannot oscillate. */
function fitAssembly(
  rects: AttachRect[],
  panels: ReadonlyMap<string, Pick<LayoutPanel, 'viewport' | 'inset' | 'exclusions' | 'fixed'>>,
): { dx: number; dy: number } | null {
  let minX = -Infinity;
  let maxX = Infinity;
  let minY = -Infinity;
  let maxY = Infinity;
  const xs = new Set([0]);
  const ys = new Set([0]);
  for (const rect of rects) {
    const panel = panels.get(rect.id)!;
    const inset = panel.inset ?? 0;
    minX = Math.max(minX, inset - rect.left);
    maxX = Math.min(maxX, panel.viewport.width - inset - rect.right);
    minY = Math.max(minY, inset - rect.top);
    maxY = Math.min(maxY, panel.viewport.height - inset - rect.bottom);
    if (panel.fixed) {
      minX = Math.max(minX, 0);
      maxX = Math.min(maxX, 0);
      minY = Math.max(minY, 0);
      maxY = Math.min(maxY, 0);
    }
    for (const zone of panel.exclusions ?? []) {
      xs.add(zone.left - rect.right);
      xs.add(zone.right - rect.left);
      ys.add(zone.top - rect.bottom);
      ys.add(zone.bottom - rect.top);
    }
  }
  if (minX > maxX || minY > maxY) return null;
  xs.add(minX);
  xs.add(maxX);
  ys.add(minY);
  ys.add(maxY);
  let best: { dx: number; dy: number; distance: number } | null = null;
  for (const dx of xs) {
    if (dx < minX || dx > maxX) continue;
    for (const dy of ys) {
      if (dy < minY || dy > maxY) continue;
      const distance = dx * dx + dy * dy;
      if (best && distance >= best.distance) continue;
      if (
        rects.some((rect) =>
          (panels.get(rect.id)!.exclusions ?? []).some((zone) => overlaps(moveRect(rect, dx, dy), zone)),
        )
      )
        continue;
      best = { dx, dy, distance };
    }
  }
  return best;
}

/** The same nearest-legal placement for a drag and for an overflowing follower.
 * A drag constrains only this rect, never the rest of its former assembly. */
export function constrainPanelRect(
  rect: AttachRect,
  panel: Pick<LayoutPanel, 'viewport' | 'inset' | 'exclusions' | 'fixed'>,
): AttachRect {
  if (panel.fixed) return rect;
  const fit = fitAssembly([rect], new Map([[rect.id, panel]]));
  if (fit) return moveRect(rect, fit.dx, fit.dy);
  const inset = panel.inset ?? 0;
  const left = Math.max(inset, Math.min(rect.left, panel.viewport.width - (rect.right - rect.left) - inset));
  const top = Math.max(inset, Math.min(rect.top, panel.viewport.height - (rect.bottom - rect.top) - inset));
  return moveRect(rect, left - rect.left, top - rect.top);
}

/** One history-independent solve: project roots, follow the arranged forest, then
 * constrain assemblies. Overflow is display-only; references and graph are immutable. */
export function solvePanelLayout(
  inputs: readonly LayoutPanel[],
  arranged: ReadonlyMap<string, Attachment>,
): Map<string, AttachRect> {
  const panels = new Map(inputs.map((panel) => [panel.id, panel]));
  const graph = new Map<string, Attachment>();
  // Defensively reject stale edges and cycles, in deterministic id order.
  for (const [id, edge] of [...arranged].sort(([a], [b]) => a.localeCompare(b))) {
    if (!panels.has(id) || !panels.has(edge.hostId) || panels.get(id)!.fixed || panels.get(edge.hostId)!.replay)
      continue;
    let host: string | undefined = edge.hostId;
    while (host && host !== id) host = graph.get(host)?.hostId;
    if (host !== id) graph.set(id, edge);
  }
  const rects = new Map(inputs.map((panel) => [panel.id, projectPanel(panel)]));
  for (const [id, rect] of resolveAttachedRects(graph, rects)) rects.set(id, rect);
  const assemblies = new Map<string, string[]>();
  for (const panel of inputs) {
    let root = panel.id;
    while (graph.has(root)) root = graph.get(root)!.hostId;
    const ids = assemblies.get(root) ?? [];
    ids.push(panel.id);
    assemblies.set(root, ids);
  }
  for (const [root, ids] of assemblies) {
    if (panels.get(root)!.replay) continue;
    const members = ids.map((id) => rects.get(id)!);
    const fit = fitAssembly(members, panels);
    if (fit) {
      for (const rect of members) rects.set(rect.id, moveRect(rect, fit.dx, fit.dy));
    } else {
      // Keep the root visible first, then reattach to that root before individually
      // clamping overflowing followers. The graph itself is never changed.
      rects.set(root, constrainPanelRect(rects.get(root)!, panels.get(root)!));
      const followers = resolveAttachedRects(graph, rects);
      for (const id of ids) {
        if (id !== root) rects.set(id, constrainPanelRect(followers.get(id) ?? rects.get(id)!, panels.get(id)!));
      }
    }
  }
  return rects;
}

/** Paint only. Shared logical edges quantize identically, including end edges. */
export function snapPanelRect(rect: AttachRect, dpr: number): AttachRect {
  const snap = (n: number) => Math.round(n * dpr) / dpr;
  return {
    id: rect.id,
    left: snap(rect.left),
    top: snap(rect.top),
    right: snap(rect.right),
    bottom: snap(rect.bottom),
  };
}
