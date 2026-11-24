/**
 * Panel snap system — shared registry that lets every DraggablePanel know
 * the live screen rect of its siblings, plus the engaged snap state used by
 * the visual SnapGuideOverlay. Its layout store owns normalized references and
 * the intentional attachment graph, and publishes one complete solve per change.
 *
 * This is **panel docking**, not Figma-style alignment. The user is moving a
 * window-like panel and dropping it next to another with a small intentional
 * air gap. The visual feedback mirrors that intent: a destination preview
 * while in range, then a magnetic channel between the panels when engaged.
 */
import { createContext, type ReactNode, useCallback, useContext, useMemo, useRef } from 'react';
import type { UIPosition } from '../../hooks/usePersistedSettings';
import { getModifiers } from '../../input/keyState';
import { isAltWheelGestureActive } from '../altWheelResize';
import { prefersReducedMotion } from '../chromeZoom';
import type { PanelPlacement } from '../panelPlacement';
import { type LayoutPanel, type LayoutRect, projectPanel, solvePanelLayout } from './layoutSolver';
import { type Attachment, detectAttachments, SNAP_GAP_PX } from './panelAttachment';

export interface PanelRect {
  /** Stable id used to exclude self from candidate lookup. */
  id: string;
  left: number;
  top: number;
  right: number;
  bottom: number;
}

/**
 * What a movable panel adds to its rect so the Alt overlap guide can find it: its element,
 * to ask the browser which panel paints on top, and the name its Alt affordance shows.
 * Passive targets (menu buttons) register without it and never take part.
 */
export interface PanelStackInfo {
  getElement: () => HTMLElement | null;
  getLabel: () => string | undefined;
  /** Locked or pinned panels cannot be dragged aside, so they are not reported. */
  isMovable: () => boolean;
}

/** A movable panel as the overlap guide sees it. */
export interface StackedPanel {
  rect: PanelRect;
  element: HTMLElement;
  label: string | undefined;
}

export interface PanelLayoutInput {
  /** Stable surface name (also used by tutorials and owner-following code). */
  name?: string;
  position?: UIPosition;
  defaultPosition: UIPosition;
  /**
   * `defaultPosition` is already placed for this frame and the panel's rendered box (its owner
   * derives it from live geometry, as the boss bar's slot is), not a 1x design position: it is
   * taken as it is rather than projected from the unscaled box.
   */
  defaultInFrame?: boolean;
  width: number;
  height: number;
  baseWidth: number;
  baseHeight: number;
  scale: number;
  viewport: { width: number; height: number };
  ownerPositioned: boolean;
  replay: boolean;
  dragging: boolean;
  externallyPositioned?: boolean;
  exclusions?: readonly LayoutRect[];
  inset: number;
}

export interface LayoutTransition {
  kind: 'snap' | 'scale' | 'move';
  startTime: number;
}

export interface PublishedPanelPosition {
  /** Solved target in frame-local pixels, before paint-only device pixel rounding. */
  readonly position: UIPosition;
  readonly viewport: { readonly width: number; readonly height: number };
}

export type PublishedPanelPositions = ReadonlyMap<string, PublishedPanelPosition>;

interface LayoutRegistration {
  read: () => PanelLayoutInput;
  /** Read the current visual state and return the deferred DOM writes. */
  preparePaint: (rect: PanelRect, transition: LayoutTransition) => (() => void) | undefined;
  input: PanelLayoutInput;
  signature: string;
  previous?: PanelLayoutInput;
  reference?: PanelPlacement;
}

const equalPosition = (a: UIPosition | undefined, b: UIPosition | undefined) =>
  a === b || (!!a && !!b && a.x === b.x && a.y === b.y && a.anchorX === b.anchorX && a.anchorY === b.anchorY);

function sameSolve(a: ReadonlyMap<string, PanelRect>, b: ReadonlyMap<string, PanelRect>): boolean {
  if (a.size !== b.size) return false;
  for (const [id, rect] of b) {
    const old = a.get(id);
    if (
      !old ||
      old.left !== rect.left ||
      old.top !== rect.top ||
      old.right !== rect.right ||
      old.bottom !== rect.bottom
    )
      return false;
  }
  return true;
}

/** A dirty layout transaction snapshots inputs, solves, reads interrupted visuals,
 * then paints every panel. Registration getters are updated by render, never by
 * an earlier sibling's paint. Unchanged per-panel updates never scan the registry. */
export function createPanelLayoutStore() {
  const entries = new Map<string, LayoutRegistration>();
  const arranged = new Map<string, Attachment>();
  const intentional = new Set<string>();
  let rects = new Map<string, PanelRect>();
  let positions: PublishedPanelPositions = new Map();
  const subscribers = new Set<() => void>();
  const publish = () => {
    const next = new Map<string, PublishedPanelPosition>();
    for (const [id, rect] of rects) {
      const input = entries.get(id)?.previous;
      if (!input?.name || input.replay) continue;
      // Preserve the anchor, but replace its offsets with the solved target's.
      // An unpositioned infobox also uses its recorded host's anchor when deriving
      // its default, so normalizing that host to left/top could change the layout.
      const { anchorX, anchorY } = input.position ?? input.defaultPosition;
      next.set(input.name, {
        position: {
          x: anchorX === 'left' ? rect.left : input.viewport.width - rect.right,
          y: anchorY === 'top' ? rect.top : input.viewport.height - rect.bottom,
          anchorX,
          anchorY,
        },
        viewport: { ...input.viewport },
      });
    }
    if (
      next.size === positions.size &&
      [...next].every(([name, value]) => {
        const old = positions.get(name);
        return (
          old &&
          equalPosition(old.position, value.position) &&
          old.viewport.width === value.viewport.width &&
          old.viewport.height === value.viewport.height
        );
      })
    )
      return;
    positions = next;
    for (const notify of subscribers) notify();
  };
  // Told once a solve has painted panels somewhere new (moved, resized, mounted) or a panel has
  // gone: chrome that measures panels on screen re-measures then rather than on every render.
  const geometryListeners = new Set<() => void>();
  const notifyGeometry = () => {
    for (const notify of geometryListeners) notify();
  };
  let dirty = false;
  const update = (id: string) => {
    const entry = entries.get(id);
    if (!entry) return;
    const input = entry.read();
    const signature = JSON.stringify(input);
    if (signature === entry.signature) return;
    entry.input = input;
    entry.signature = signature;
    dirty = true;
  };
  return {
    register(id: string, read: LayoutRegistration['read'], preparePaint: LayoutRegistration['preparePaint']) {
      const input = read();
      entries.set(id, { read, preparePaint, input, signature: JSON.stringify(input) });
      dirty = true;
      return () => {
        entries.delete(id);
        const painted = rects.delete(id);
        arranged.delete(id);
        for (const [child, edge] of arranged) if (edge.hostId === id) arranged.delete(child);
        intentional.delete(id);
        dirty = true;
        publish();
        if (painted) notifyGeometry();
      };
    },
    arrange(id: string) {
      intentional.add(id);
      dirty = true;
    },
    update,
    getRect(id: string) {
      return rects.get(id);
    },
    getPositions: (): PublishedPanelPositions => positions,
    subscribePositions(notify: () => void) {
      subscribers.add(notify);
      return () => {
        subscribers.delete(notify);
      };
    },
    /**
     * Called after a commit whose solve differs from the last one (a panel moved, resized or
     * mounted), once its DOM writes are done, and when a painted panel unregisters. Unlike
     * `subscribePositions` this covers every panel, replayed ones included, and sizes as well as
     * places. A drag moves its panel's DOM directly and is reported when it drops.
     */
    subscribeGeometry(notify: () => void) {
      geometryListeners.add(notify);
      return () => {
        geometryListeners.delete(notify);
      };
    },
    commit() {
      if (!dirty) return;
      // All renders have finished, but sibling layout effects may not have run.
      // Refresh their inputs once so this is one atomic solve. Their later update()
      // calls will find the cached values, leaving commit() an O(1) no-op.
      for (const id of entries.keys()) update(id);
      dirty = false;
      const inputs = new Map([...entries].map(([id, entry]) => [id, entry.input]));
      let scaleChanged = false;
      let viewportChanged = false;
      let snap = getModifiers().alt || isAltWheelGestureActive() || prefersReducedMotion();
      const mounted = new Set<string>();
      const panels: LayoutPanel[] = [];
      for (const [id, input] of inputs) {
        const entry = entries.get(id)!;
        const previous = entry.previous;
        const resizedViewport =
          previous &&
          (previous.viewport.width !== input.viewport.width || previous.viewport.height !== input.viewport.height);
        const resizedScale = previous && previous.scale !== input.scale;
        scaleChanged ||= !!resizedScale;
        viewportChanged ||= !!resizedViewport;
        snap ||= input.dragging || input.replay;
        const moved = previous && !equalPosition(previous.position, input.position);
        // A panel still at its default follows a default its owner recomputes (the boss bar's slot
        // beside the launcher row, measured after mount, and its width growing to fit the name),
        // rather than projecting the default it mounted with.
        // A default placed in frame is for the box it was placed for, so a new rendered size (a new
        // scale) re-reads it too.
        const defaultChanged =
          !input.position &&
          previous !== undefined &&
          (!equalPosition(previous.defaultPosition, input.defaultPosition) ||
            previous.baseWidth !== input.baseWidth ||
            previous.baseHeight !== input.baseHeight ||
            (!!input.defaultInFrame && (previous.width !== input.width || previous.height !== input.height)));
        if (
          !entry.reference ||
          moved ||
          defaultChanged ||
          previous?.ownerPositioned !== input.ownerPositioned ||
          intentional.has(id)
        ) {
          // A design default is a 1x position, referenced against the unscaled box; a saved position,
          // or a default its owner placed in frame, against the box it was placed for.
          const designDefault = !input.position && !input.defaultInFrame;
          entry.reference = {
            position: input.position ?? input.defaultPosition,
            viewportWidth: input.viewport.width,
            viewportHeight: input.viewport.height,
            width: designDefault ? input.baseWidth : input.width,
            height: designDefault ? input.baseHeight : input.height,
          };
          if (!previous) mounted.add(id);
          else if (moved && !input.ownerPositioned) intentional.add(id);
        }
        const panel: LayoutPanel = {
          id,
          placement: entry.reference,
          width: input.width,
          height: input.height,
          viewport: input.viewport,
          exclusions: input.exclusions,
          inset: input.inset,
          replay: input.replay,
        };
        if (input.ownerPositioned) {
          const pos = input.position ?? input.defaultPosition;
          const left = pos.anchorX === 'left' ? pos.x : input.viewport.width - input.width - pos.x;
          const top = pos.anchorY === 'top' ? pos.y : input.viewport.height - input.height - pos.y;
          panel.fixed = { left, top, right: left + input.width, bottom: top + input.height };
        }
        panels.push(panel);
      }
      // Mounts and intentional arrangements update only edges involving that panel.
      // Never reconstruct an existing graph from a transient, clamped resize result.
      const changed = new Set([...mounted, ...intentional]);
      if (changed.size) {
        const mountingDefaults = [...mounted].some((id) => !inputs.get(id)?.position);
        const byId = new Map(panels.map((panel) => [panel.id, panel]));
        // The other panels are read where the last solve left them, unless this same commit
        // resizes them: an owner that re-derives a panel's position per scale (the unmoved
        // infobox strip) moves it in the commit that grows its host, and comparing it with
        // the host's previous size would drop a docking the resize must keep. The arrangement
        // being replaced is left out of that solve.
        let others = rects;
        if (scaleChanged || viewportChanged) {
          const kept = new Map(arranged);
          for (const id of intentional) {
            if (byId.get(id)?.replay) continue;
            kept.delete(id);
            for (const [child, edge] of kept) if (edge.hostId === id) kept.delete(child);
          }
          others = solvePanelLayout(panels, kept);
        }
        const geometry = panels.map((panel) => {
          // Defaults are arranged in their explicit 1x reference geometry, even
          // when the workspace first mounts already scaled. This preserves default
          // adjacency rather than inferring it from independently projected boxes.
          if (mountingDefaults && !inputs.get(panel.id)?.position && !panel.fixed) {
            return projectPanel({ ...panel, width: panel.placement.width, height: panel.placement.height });
          }
          return changed.has(panel.id) ? projectPanel(panel) : (others.get(panel.id) ?? projectPanel(panel));
        });
        for (const id of changed) {
          const panel = byId.get(id);
          if (!panel || panel.replay) continue;
          if (intentional.has(id)) {
            arranged.delete(id);
            for (const [child, edge] of arranged) if (edge.hostId === id) arranged.delete(child);
          }
          const candidates = detectAttachments(
            geometry.filter((rect) => !byId.get(rect.id)?.replay),
            panel.viewport,
            (child) => !byId.get(child)?.fixed,
          );
          for (const [child, edge] of candidates) {
            if (child !== id && edge.hostId !== id) continue;
            if (arranged.has(child)) continue;
            let host: string | undefined = edge.hostId;
            while (host && host !== child) host = arranged.get(host)?.hostId;
            if (host !== child) arranged.set(child, edge);
          }
        }
      }
      intentional.clear();
      const previousRects = rects;
      rects = solvePanelLayout(panels, arranged);
      const time = document.timeline?.currentTime;
      const transition: LayoutTransition = {
        kind: snap || (viewportChanged && !scaleChanged) ? 'snap' : scaleChanged ? 'scale' : 'move',
        startTime: typeof time === 'number' ? time : performance.now(),
      };
      // Scale solves move neighbors on the shared clock. Otherwise a content
      // reflow has no continuous intermediate layout, and owner-following already
      // moved its DOM: neither should invert and glide back from the old box.
      const paints: Array<() => void> = [];
      for (const [id, rect] of rects) {
        const entry = entries.get(id)!;
        const input = inputs.get(id)!;
        const previous = entry.previous;
        const reflow = previous && (previous.baseWidth !== input.baseWidth || previous.baseHeight !== input.baseHeight);
        const instant = !previous || (transition.kind === 'move' && (reflow || input.externallyPositioned));
        entry.previous = input;
        const paint = entry.preparePaint(rect, instant ? { ...transition, kind: 'snap' } : transition);
        if (paint) paints.push(paint);
      }
      // A computed-style read can flush layout. Finish every read before the first
      // panel writes geometry, rather than forcing one recalculation per panel.
      for (const paint of paints) paint();
      publish();
      if (!sameSolve(previousRects, rects)) notifyGeometry();
    },
  };
}

/**
 * Client-space top-left of the game frame; panel positions are frame-local. `scaleX`/`scaleY`
 * (default 1) are how much larger than laid out the frame is drawn (Fixed's Stretch to Window), so a
 * client-space box divides by them to reach frame pixels.
 */
export interface FrameOrigin {
  left: number;
  top: number;
  scaleX?: number;
  scaleY?: number;
}

/** Distance at which snap engages (panel locks to the contact edge). */
export const SNAP_ENGAGE_PX = 14;
/** Once engaged, panel only releases when distance exceeds this. */
export const SNAP_RELEASE_PX = 24;
/** Within this radius we show a preview (ghost outline) before engagement. */
export const SNAP_PREVIEW_PX = 28;
/** When contact engages, perpendicular-axis edges within this distance also snap. */
export const SNAP_ALIGN_BONUS_PX = 10;
/** The empty space left between snapped panels; owned by the attachment rule it shares. */
export { SNAP_GAP_PX };

/** Single contact placement: which side of moving meets which side of target. */
export type ContactKind = 'right-to-left' | 'left-to-right' | 'bottom-to-top' | 'top-to-bottom';

export interface SnapEngagement {
  /** Identity for hysteresis stickiness. */
  targetId: string;
  contact: ContactKind;
  /**
   * The seam between the two panels in viewport-space. For a vertical seam
   * (right↔left or left↔right), `linePosition` is the X coordinate; for a
   * horizontal seam (bottom↔top or top↔bottom), the Y coordinate.
   */
  linePosition: number;
  /**
   * Endpoints of the seam along the perpendicular axis (where the two panel
   * edges actually overlap in screen space, post-snap).
   */
  perpendicularStart: number;
  perpendicularEnd: number;
  state: 'preview' | 'engaged';
  /** Post-snap rect of the moving panel. The overlay uses this for the ghost. */
  movingRect: { left: number; top: number; right: number; bottom: number };
  /** Post-snap rect of the target sibling. Same role for the overlay. */
  targetRect: { left: number; top: number; right: number; bottom: number };
  /** The channel region between the snapped panels. */
  gapChannel: { left: number; top: number; width: number; height: number };
}

export interface SnapState {
  active: boolean;
  engagement: SnapEngagement | null;
}

const EMPTY_SNAP_STATE: SnapState = { active: false, engagement: null };

interface PanelSnapRegistryValue {
  registerPanel: (id: string, getRect: () => PanelRect | null, stack?: PanelStackInfo) => () => void;
  /** Every mounted, movable, laid-out panel that registered stack info. */
  getStackedPanels: () => StackedPanel[];
  layout: ReturnType<typeof createPanelLayoutStore>;
  getSiblingRects: (excludeId: string) => PanelRect[];
  setSnapState: (state: SnapState) => void;
  subscribeSnapState: (cb: () => void) => () => void;
  getSnapState: () => SnapState;
  registerFrameOrigin: (getOrigin: () => FrameOrigin | null) => () => void;
  getFrameOrigin: () => FrameOrigin | null;
}

const PanelSnapRegistryContext = createContext<PanelSnapRegistryValue | null>(null);

export function PanelSnapRegistryProvider({ children }: { children: ReactNode }) {
  const panelsRef = useRef<Map<string, () => PanelRect | null>>(new Map());
  const stackInfoRef = useRef<Map<string, PanelStackInfo>>(new Map());
  const layout = useMemo(createPanelLayoutStore, []);
  const snapStateRef = useRef<SnapState>(EMPTY_SNAP_STATE);
  const subscribersRef = useRef<Set<() => void>>(new Set());
  const frameOriginRef = useRef<(() => FrameOrigin | null) | null>(null);

  const registerPanel = useCallback((id: string, getRect: () => PanelRect | null, stack?: PanelStackInfo) => {
    panelsRef.current.set(id, getRect);
    if (stack) stackInfoRef.current.set(id, stack);
    return () => {
      panelsRef.current.delete(id);
      stackInfoRef.current.delete(id);
    };
  }, []);

  const getStackedPanels = useCallback((): StackedPanel[] => {
    const result: StackedPanel[] = [];
    for (const [id, stack] of stackInfoRef.current) {
      if (!stack.isMovable()) continue;
      const rect = panelsRef.current.get(id)?.();
      const element = stack.getElement();
      if (!rect || !element || rect.right - rect.left <= 0 || rect.bottom - rect.top <= 0) continue;
      result.push({ rect, element, label: stack.getLabel() });
    }
    return result;
  }, []);

  const getSiblingRects = useCallback((excludeId: string): PanelRect[] => {
    const result: PanelRect[] = [];
    for (const [id, getRect] of panelsRef.current) {
      if (id === excludeId) continue;
      const rect = getRect();
      if (rect) result.push(rect);
    }
    return result;
  }, []);

  const setSnapState = useCallback((state: SnapState) => {
    // Dragging publishes every frame; "still not snapped" is not news to subscribers.
    if (!state.active && !state.engagement && !snapStateRef.current.active && !snapStateRef.current.engagement) return;
    snapStateRef.current = state;
    for (const cb of subscribersRef.current) cb();
  }, []);

  const subscribeSnapState = useCallback((cb: () => void) => {
    subscribersRef.current.add(cb);
    return () => {
      subscribersRef.current.delete(cb);
    };
  }, []);

  const getSnapState = useCallback(() => snapStateRef.current, []);

  const registerFrameOrigin = useCallback((getOrigin: () => FrameOrigin | null) => {
    frameOriginRef.current = getOrigin;
    return () => {
      if (frameOriginRef.current === getOrigin) frameOriginRef.current = null;
    };
  }, []);

  const getFrameOrigin = useCallback(() => frameOriginRef.current?.() ?? null, []);

  const value = useMemo<PanelSnapRegistryValue>(
    () => ({
      registerPanel,
      getStackedPanels,
      layout,
      getSiblingRects,
      setSnapState,
      subscribeSnapState,
      getSnapState,
      registerFrameOrigin,
      getFrameOrigin,
    }),
    [
      registerPanel,
      getStackedPanels,
      layout,
      getSiblingRects,
      setSnapState,
      subscribeSnapState,
      getSnapState,
      registerFrameOrigin,
      getFrameOrigin,
    ],
  );

  return <PanelSnapRegistryContext.Provider value={value}>{children}</PanelSnapRegistryContext.Provider>;
}

export function usePanelSnapRegistry(): PanelSnapRegistryValue | null {
  return useContext(PanelSnapRegistryContext);
}

interface PlacementCandidate {
  target: PanelRect;
  contact: ContactKind;
  /** Signed delta on the contact axis to land on the target edge. */
  delta: number;
  /** |delta| — how far we are from this placement. */
  distance: number;
  /** Full snap displacement, contact delta plus perpendicular alignment bonus. */
  destDx: number;
  destDy: number;
}

/** Post-snap rect of the moving panel, in the same space as its siblings. */
export interface SnapDestination {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

export interface ResolveSnapInput {
  movingId: string;
  movingLeft: number;
  movingTop: number;
  movingWidth: number;
  movingHeight: number;
  siblings: PanelRect[];
  /** Last engaged target+contact, for hysteresis. Pass null when not currently snapped. */
  prevEngagement: { targetId: string; contact: ContactKind } | null;
  /** Validate the full aligned destination before selecting the nearest or sticky candidate. */
  isDestinationValid?: (destination: SnapDestination) => boolean;
}

export interface ResolveSnapOutput {
  /** Snap correction to apply to (movingLeft, movingTop). 0 unless engaged. */
  dx: number;
  dy: number;
  /** Visual state. null when out of range. */
  engagement: SnapEngagement | null;
}

/**
 * Pure function; no React, no DOM.
 */
export function resolveSnap(input: ResolveSnapInput): ResolveSnapOutput {
  const { movingLeft, movingTop, movingWidth, movingHeight, siblings, prevEngagement, isDestinationValid } = input;

  const movingRight = movingLeft + movingWidth;
  const movingBottom = movingTop + movingHeight;

  // We need to evaluate sticky separately because hysteresis must hold the user
  // on their existing snap target even when another panel becomes geometrically
  // closer — picking the closest candidate first and applying hysteresis
  // afterwards dropped already-engaged snaps any time a new neighbor slipped
  // into the preview range while still being closer than the engaged one.
  let bestNew: PlacementCandidate | null = null;
  let sticky: PlacementCandidate | null = null;
  const evaluate = (cand: PlacementCandidate) => {
    if (!bestNew || cand.distance < bestNew.distance) bestNew = cand;
    if (prevEngagement && cand.target.id === prevEngagement.targetId && cand.contact === prevEngagement.contact) {
      sticky = cand;
    }
  };

  const placement = (target: PanelRect, contact: ContactKind, delta: number): PlacementCandidate | null => {
    let destDx = 0;
    let destDy = 0;
    if (contact === 'right-to-left' || contact === 'left-to-right') {
      destDx = delta;
    } else {
      destDy = delta;
    }

    // Alignment bonus: when contact is in range, also align edges on the
    // perpendicular axis to the SAME target if within ALIGN_BONUS_PX.
    if (contact === 'bottom-to-top' || contact === 'top-to-bottom') {
      // Horizontal seam — perpendicular axis is X. Try left=left, right=right.
      const dLeft = target.left - movingLeft;
      const dRight = target.right - movingRight;
      const bestPerpAlign = Math.abs(dLeft) <= Math.abs(dRight) ? dLeft : dRight;
      if (Math.abs(bestPerpAlign) <= SNAP_ALIGN_BONUS_PX) destDx = bestPerpAlign;
    } else {
      // Vertical seam — perpendicular axis is Y. Try top=top, bottom=bottom.
      const dTop = target.top - movingTop;
      const dBottom = target.bottom - movingBottom;
      const bestPerpAlign = Math.abs(dTop) <= Math.abs(dBottom) ? dTop : dBottom;
      if (Math.abs(bestPerpAlign) <= SNAP_ALIGN_BONUS_PX) destDy = bestPerpAlign;
    }

    if (isDestinationValid) {
      const left = movingLeft + destDx;
      const top = movingTop + destDy;
      if (!isDestinationValid({ left, top, right: left + movingWidth, bottom: top + movingHeight })) return null;
    }

    return { target, contact, delta, distance: Math.abs(delta), destDx, destDy };
  };

  for (const t of siblings) {
    // Vertical overlap (required for vertical-seam contacts)
    const vOverlapStart = Math.max(movingTop, t.top);
    const vOverlapEnd = Math.min(movingBottom, t.bottom);
    const hasVOverlap = vOverlapEnd > vOverlapStart;

    // Horizontal overlap (required for horizontal-seam contacts)
    const hOverlapStart = Math.max(movingLeft, t.left);
    const hOverlapEnd = Math.min(movingRight, t.right);
    const hasHOverlap = hOverlapEnd > hOverlapStart;

    // moving.right sits SNAP_GAP_PX left of target.left (docks to LEFT side of target)
    if (hasVOverlap) {
      const cand = placement(t, 'right-to-left', t.left - SNAP_GAP_PX - movingRight);
      if (cand) evaluate(cand);
    }
    // moving.left sits SNAP_GAP_PX right of target.right
    if (hasVOverlap) {
      const cand = placement(t, 'left-to-right', t.right + SNAP_GAP_PX - movingLeft);
      if (cand) evaluate(cand);
    }
    // moving.bottom sits SNAP_GAP_PX above target.top
    if (hasHOverlap) {
      const cand = placement(t, 'bottom-to-top', t.top - SNAP_GAP_PX - movingBottom);
      if (cand) evaluate(cand);
    }
    // moving.top sits SNAP_GAP_PX below target.bottom
    if (hasHOverlap) {
      const cand = placement(t, 'top-to-bottom', t.bottom + SNAP_GAP_PX - movingTop);
      if (cand) evaluate(cand);
    }
  }

  // TS narrows `sticky`/`bestNew` to `null` after declaration because it can't
  // see through the closure-mutated `evaluate` callback.
  const stickyResolved = sticky as PlacementCandidate | null;
  const bestNewResolved = bestNew as PlacementCandidate | null;
  let chosen: PlacementCandidate;
  let isEngaged: boolean;
  if (stickyResolved && stickyResolved.distance <= SNAP_RELEASE_PX) {
    chosen = stickyResolved;
    isEngaged = true;
  } else if (bestNewResolved) {
    chosen = bestNewResolved;
    isEngaged = bestNewResolved.distance <= SNAP_ENGAGE_PX;
    // No sticky claim and bestNew is too far for even a preview — nothing to
    // show. (Sticky path can't reach this branch because we already capped it
    // at SNAP_RELEASE_PX above, which is < SNAP_PREVIEW_PX.)
    if (!isEngaged && bestNewResolved.distance > SNAP_PREVIEW_PX) {
      return { dx: 0, dy: 0, engagement: null };
    }
  } else {
    return { dx: 0, dy: 0, engagement: null };
  }

  const c = chosen;

  // We compute TWO sets of deltas:
  //   - destDx/destDy = where the panel would land if engaged (always set,
  //     used to position the visual overlay including in `preview` state)
  //   - dx/dy        = the deltas actually applied to the live position
  //     (zero in preview so the panel stays under the cursor; only set on
  //     engagement, when the user has crossed the engage threshold)
  const destDx = c.destDx;
  const destDy = c.destDy;

  const dx = isEngaged ? destDx : 0;
  const dy = isEngaged ? destDy : 0;

  const snappedLeft = movingLeft + destDx;
  const snappedTop = movingTop + destDy;
  const snappedRight = snappedLeft + movingWidth;
  const snappedBottom = snappedTop + movingHeight;

  // Compute the seam line + perpendicular extents using the post-snap rect.
  let linePosition: number;
  let perpStart: number;
  let perpEnd: number;
  let gapChannel = { left: 0, top: 0, width: 0, height: 0 };
  switch (c.contact) {
    case 'right-to-left':
      linePosition = snappedRight;
      perpStart = Math.max(snappedTop, c.target.top);
      perpEnd = Math.min(snappedBottom, c.target.bottom);
      gapChannel = { left: snappedRight, top: perpStart, width: SNAP_GAP_PX, height: perpEnd - perpStart };
      break;
    case 'left-to-right':
      linePosition = snappedLeft;
      perpStart = Math.max(snappedTop, c.target.top);
      perpEnd = Math.min(snappedBottom, c.target.bottom);
      gapChannel = { left: c.target.right, top: perpStart, width: SNAP_GAP_PX, height: perpEnd - perpStart };
      break;
    case 'bottom-to-top':
      linePosition = snappedBottom;
      perpStart = Math.max(snappedLeft, c.target.left);
      perpEnd = Math.min(snappedRight, c.target.right);
      gapChannel = { left: perpStart, top: snappedBottom, width: perpEnd - perpStart, height: SNAP_GAP_PX };
      break;
    case 'top-to-bottom':
      linePosition = snappedTop;
      perpStart = Math.max(snappedLeft, c.target.left);
      perpEnd = Math.min(snappedRight, c.target.right);
      gapChannel = { left: perpStart, top: c.target.bottom, width: perpEnd - perpStart, height: SNAP_GAP_PX };
      break;
  }

  // If the post-snap rects don't overlap on the perpendicular axis (because
  // the alignment bonus pushed them apart, or they were never aligned), fall
  // back to the pre-snap moving rect's edge — gives a guide line that points
  // at where the contact would be if the user moved the panel into alignment.
  if (perpEnd <= perpStart) {
    if (c.contact === 'right-to-left' || c.contact === 'left-to-right') {
      perpStart = Math.min(snappedTop, c.target.top);
      perpEnd = Math.max(snappedBottom, c.target.bottom);
    } else {
      perpStart = Math.min(snappedLeft, c.target.left);
      perpEnd = Math.max(snappedRight, c.target.right);
    }
  }

  // Recompute the channel after any fallback adjustment so the visual never
  // collapses to a negative/zero-length sliver when the panels are near but
  // not yet overlapping on the perpendicular axis.
  if (c.contact === 'right-to-left') {
    gapChannel = { left: snappedRight, top: perpStart, width: SNAP_GAP_PX, height: perpEnd - perpStart };
  } else if (c.contact === 'left-to-right') {
    gapChannel = { left: c.target.right, top: perpStart, width: SNAP_GAP_PX, height: perpEnd - perpStart };
  } else if (c.contact === 'bottom-to-top') {
    gapChannel = { left: perpStart, top: snappedBottom, width: perpEnd - perpStart, height: SNAP_GAP_PX };
  } else {
    gapChannel = { left: perpStart, top: c.target.bottom, width: perpEnd - perpStart, height: SNAP_GAP_PX };
  }

  const engagement: SnapEngagement = {
    targetId: c.target.id,
    contact: c.contact,
    linePosition,
    perpendicularStart: perpStart,
    perpendicularEnd: perpEnd,
    state: isEngaged ? 'engaged' : 'preview',
    movingRect: {
      left: snappedLeft,
      top: snappedTop,
      right: snappedRight,
      bottom: snappedBottom,
    },
    targetRect: {
      left: c.target.left,
      top: c.target.top,
      right: c.target.right,
      bottom: c.target.bottom,
    },
    gapChannel,
  };

  return { dx, dy, engagement };
}
