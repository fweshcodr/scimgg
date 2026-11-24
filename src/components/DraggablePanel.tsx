import type React from 'react';
import { useCallback, useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useReplayPresentation } from '../contexts/ReplayPresentationContext';
import type { UIPosition } from '../hooks/usePersistedSettings';
import { useRafDrag } from '../hooks/useRafDrag';
import { subscribeModifiers } from '../input/keyState';
import { isTouchPointer } from '../input/touchHold';
import { framePaintScale } from '../util/viewportBounds';
import { useAltHeld, useAltWheelResize } from './altWheelResize';
import { CHROME_RESIZE_TIMING, unscaledPxVars } from './chromeZoom';
import { PanelContentScaleProvider } from './panelContentScale';
import { projectPlacement } from './panelPlacement';
import { PANEL_SCALE_STOPS } from './panelScale';
import { constrainPanelRect, snapPanelRect } from './snap/layoutSolver';
import {
  type ContactKind,
  createPanelLayoutStore,
  type LayoutTransition,
  type PanelLayoutInput,
  type PanelRect,
  resolveSnap,
  type SnapEngagement,
  usePanelSnapRegistry,
} from './snap/PanelSnapRegistry';
import { useTooltipScaleLocked } from './Tooltip/useTooltip';
import './DraggablePanel.css';

export interface ExclusionRect {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

interface DraggablePanelProps {
  children: React.ReactNode;
  defaultPosition: UIPosition;
  /**
   * `defaultPosition` is where the panel goes in the current frame at its rendered size, derived
   * by its owner from live geometry (the boss bar's slot), rather than a 1x design position that
   * is projected to the frame and scale. It is used as it is, and recomputed by the owner.
   */
  defaultInFrame?: boolean;
  defaultScale?: number;
  position?: UIPosition;
  scale?: number;
  width: number;
  height: number;
  zIndex?: number;
  exclusionRects?: ExclusionRect[];
  viewportWidth?: number;
  viewportHeight?: number;
  onPositionChange?: (position: UIPosition) => void;
  /**
   * Alt+right-click's "back to default", for an owner that derives its default rather than
   * holding a 1x design one: the owner clears its saved position instead of this panel
   * saving a projected copy of `defaultPosition`.
   */
  onResetPosition?: () => void;
  onScaleChange?: (scale: number) => void;
  /**
   * Adds a resize lock to the shared fixed-layout/replay lock; never overrides it. A locked
   * panel swallows Alt+wheel over it but never takes the burst from a panel that can resize.
   */
  scaleLocked?: boolean;
  dataTutorial?: string;
  /** When set, marks this panel's root as a gameplay input surface (data-tutorial-input-surface), so tutorial watch blocks input here while leaving chrome interactive. */
  inputSurface?: string;
  edgeInset?: number;
  /**
   * When true, the panel's ENTIRE content layer is `pointer-events: none`, so the
   * mouse reaches whatever is under it — normally the 3D scene. Not "empty regions
   * only": a readout's own text and bars are transparent too, which is the point for
   * the plugin overlays (boss health bar, set timer, prayer flick, XP drops, infobox
   * strip), where every pixel of the rect is paint the player must be able to click
   * and camera-drag straight through.
   *
   * Because `pointer-events` is inherited, an interactive descendant — including a
   * native `<button>` — must EXPLICITLY set `pointer-events: auto`. That is how the
   * minimap keeps its orbs and compass clickable while the transparent corners of its
   * bounding rect pass clicks to the world.
   *
   * Alt suspends it: while the modifier is held the layer goes hit-testable again so
   * the whole rect is grabbable for Alt+drag and targetable for Alt+wheel resize. This
   * is the only thing that makes a fully-transparent panel movable at all, so a panel
   * here that also opts out of Alt gestures becomes unreachable by the mouse entirely.
   */
  pointerPassthrough?: boolean;
  /** Whether Alt+wheel may change this panel's scale. */
  scaleEnabled?: boolean;
  /**
   * When true, all pointer-driven gestures (Alt-drag, Alt+right-click reset,
   * Alt+middle-click scale reset) are suppressed at `handleMouseDown`. The
   * panel still renders, still consumes Alt+wheel resize (intentional — the
   * UI-scale control is global), and still emits its rect to the snap
   * registry, but it cannot be moved by direct manipulation.
   */
  locked?: boolean;
  /**
   * A layout edit mode is on (the Mobile layout's "Edit layout"): a plain press, by touch or
   * mouse, drags the panel with no Alt key, and the movability affordance shows throughout.
   * Ignored while `locked` or while a recorded layout is on screen.
   */
  editDrag?: boolean;
  /** Optional name rendered inside the Alt-held movability affordance. */
  altHintLabel?: string;
  /**
   * Set when this panel's position is written straight to the DOM every frame
   * by its owner (the infobox strip mirrors the chatbox / GamePanel anchor from an
   * rAF loop) rather than being driven solely by React commits.
   */
  externallyPositioned?: boolean;
  /**
   * Physical CSS pixel box this panel occupies, overriding `width/height x scale`.
   * Leave unset for the movable layouts.
   *
   * Fixed mode pins its chrome to the client frame, so a panel's box is a
   * frame-space rectangle like any other and is snapped by `scaleRect` there —
   * see the fixed-mode rule in osrsClientLayout. Deriving it here instead lands
   * the box on a fraction at almost every scale, which resamples the panel's
   * whole compositing layer and blends a row at every sprite boundary inside it.
   */
  physicalSize?: { readonly width: number; readonly height: number };
  /**
   * NOTE ON RESIZING (there is deliberately no prop for this).
   *
   * When the viewport or the scale the panel RENDERS at changes, the panel is placed
   * by `projectPlacement` (panelPlacement.ts): it keeps its fraction of the free space
   * on each axis, whichever edge its position is
   * stored against. A fixed-size overlay (`scale={1}`) therefore does not move on a
   * UI-scale change, because neither its box nor its viewport changed. A panel docked
   * against another is then carried along by its host (snap/panelAttachment.ts).
   *
   * Offsets are not multiplied by the scale: that would walk a panel 600px from its edge
   * to 1200px at 2x, and walk the fixed-size overlays into the middle of the fight.
   */
}

/** WAAPI retargets ambient moves from the current interpolated transform without
 * a write/reflow/write cycle. Direct gestures snap, as classified by the registry. */
const FLIP_ANIMATION_TIMING: KeyframeAnimationOptions = {
  duration: 120,
  easing: 'cubic-bezier(0, 0, 0.2, 1)',
};

/**
 * Emitted while panels are moved by drag or by persisted-position updates.
 *
 * Despite the `tutorial:` prefix, the event is a generic
 * "a panel just moved" signal used by any compositor-friendly consumer
 * that needs to mirror a drag without paying for a React re-render.
 */
export const TUTORIAL_PANEL_MOVED_EVENT = 'tutorial:panel-moved';

export const TUTORIAL_PANEL_RESIZED_EVENT = 'tutorial:panel-resized';

/**
 * Drag-lifecycle events. Fired on a refcounted basis: `:start` once when any
 * DraggablePanel begins a drag, `:end` once when the last drag finishes.
 */
export const PANEL_DRAG_START_EVENT = 'panel:drag-start';
export const PANEL_DRAG_END_EVENT = 'panel:drag-end';

// Module-level refcount so simultaneous drags (rare — e.g. two pointers, or
// a drag interrupted by a window blur that gets resumed) don't desync the
// fire-once-per-edge contract above.
let activeDragCount = 0;

function notifyDragStart(): void {
  activeDragCount++;
  if (activeDragCount === 1) {
    // Mark the document while a drag is in flight; DraggablePanel.css uses this
    // to suppress the affordance's hover tier.
    document.documentElement.setAttribute('data-panel-dragging', '');
    window.dispatchEvent(new CustomEvent(PANEL_DRAG_START_EVENT));
  }
}
function notifyDragEnd(): void {
  activeDragCount = Math.max(0, activeDragCount - 1);
  if (activeDragCount === 0) {
    document.documentElement.removeAttribute('data-panel-dragging');
    window.dispatchEvent(new CustomEvent(PANEL_DRAG_END_EVENT));
  }
}

function positionToScreen(
  pos: UIPosition,
  sw: number,
  sh: number,
  vw: number,
  vh: number,
): { left: number; top: number } {
  return {
    left: pos.anchorX === 'left' ? pos.x : vw - sw - pos.x,
    top: pos.anchorY === 'top' ? pos.y : vh - sh - pos.y,
  };
}

function screenToPosition(
  screenLeft: number,
  screenTop: number,
  sw: number,
  sh: number,
  vw: number,
  vh: number,
  anchorX: 'left' | 'right',
  anchorY: 'top' | 'bottom',
): UIPosition {
  return {
    x: Math.max(0, anchorX === 'left' ? screenLeft : vw - sw - screenLeft),
    y: Math.max(0, anchorY === 'top' ? screenTop : vh - sh - screenTop),
    anchorX,
    anchorY,
  };
}

function samePosition(a: UIPosition, b: UIPosition): boolean {
  return a.x === b.x && a.y === b.y && a.anchorX === b.anchorX && a.anchorY === b.anchorY;
}

/**
 * `steps` is a NET count (+N up / -N down): coalesced Alt+wheel bursts pass the
 * accumulated step count, so many notches collapse into one jump.
 *
 * If the current scale sits exactly on a stop, we index off it directly. If it
 * sits BETWEEN stops (e.g. after a viewport rescale), the first stop in the
 * scroll direction consumes one step, then the remainder indexes from there.
 * The final index is clamped to the stops range, so scrolling past either end
 * pins to the ladder's ends.
 */
export function stepScale(prev: number, steps: number, stops: number[]): number {
  if (steps === 0 || stops.length === 0) return prev;
  const exactIdx = stops.findIndex((s) => Math.abs(s - prev) < 0.001);
  let idx: number;
  if (exactIdx !== -1) {
    idx = exactIdx + steps;
  } else if (steps > 0) {
    const nextUp = stops.findIndex((s) => s > prev + 0.001);
    idx = (nextUp === -1 ? stops.length - 1 : nextUp) + (steps - 1);
  } else {
    let nextDown = -1;
    for (let i = stops.length - 1; i >= 0; i--) {
      if (stops[i] < prev - 0.001) {
        nextDown = i;
        break;
      }
    }
    idx = (nextDown === -1 ? 0 : nextDown) + (steps + 1);
  }
  return stops[Math.max(0, Math.min(stops.length - 1, idx))];
}

export const DraggablePanel: React.FC<DraggablePanelProps> = ({
  children,
  defaultPosition,
  defaultInFrame = false,
  defaultScale = 1.0,
  position: controlledPosition,
  scale: controlledScale,
  width,
  height,
  zIndex = 10,
  exclusionRects,
  viewportWidth,
  viewportHeight,
  onPositionChange,
  onResetPosition,
  onScaleChange,
  scaleLocked,
  dataTutorial,
  inputSurface,
  edgeInset = 0,
  pointerPassthrough = false,
  scaleEnabled = true,
  locked = false,
  editDrag = false,
  altHintLabel,
  externallyPositioned = false,
  physicalSize,
}) => {
  const onPositionChangeRef = useRef(onPositionChange);
  onPositionChangeRef.current = onPositionChange;
  /**
   * Single chokepoint for writing a position back to settings.
   *
   * While a recorded layout is on screen the panel renders the RECORDER's
   * position, so none of its placement updates may be saved over the viewer's
   * own. The projection below also defers to the snapshot's frame coordinates.
   */
  const persistPosition = useCallback((next: UIPosition) => {
    if (replaySnapRef.current) return;
    onPositionChangeRef.current?.(next);
  }, []);
  const onScaleChangeRef = useRef(onScaleChange);
  onScaleChangeRef.current = onScaleChange;

  const [position, setPositionState] = useState(controlledPosition ?? defaultPosition);
  const [scale, setScaleState] = useState(controlledScale ?? defaultScale);
  const [isHovering, setIsHovering] = useState(false);
  // Mirrored into a ref so the window wheel listener can read it without
  // re-subscribing (see the wheel effect below).
  const isHoveringRef = useRef(isHovering);
  isHoveringRef.current = isHovering;
  // Movability affordance state: ambient while Alt is held, full-strength on
  // the panel actually being dragged (drag may outlive the Alt press).
  const altHeld = useAltHeld();
  const [isAltDragging, setIsAltDragging] = useState(false);
  // Read through a ref because the layout effect that uses it runs outside render.
  const replaySnapRef = useRef(false);
  replaySnapRef.current = useReplayPresentation() !== null;
  const scaleLockedRef = useRef(false);
  const sharedScaleLocked = useTooltipScaleLocked();
  scaleLockedRef.current = scaleLocked || sharedScaleLocked;

  const prevClientRef = useRef({ x: 0, y: 0 });
  const dragPaintScaleRef = useRef({ x: 1, y: 1 });
  const scaleRef = useRef(controlledScale ?? defaultScale);
  const localScaleChangeRef = useRef(false);

  const innerScaleRef = useRef<HTMLDivElement>(null);
  // Direct DOM ref for zero-rerender drag; screen position tracked outside React state.
  const panelRef = useRef<HTMLDivElement>(null);
  // Raw position always follows mouse deltas. Rendered position may temporarily
  // include a snap correction while Shift snap-mode is active.
  const dragScreenPosRef = useRef({ left: 0, top: 0 });
  const renderedDragScreenPosRef = useRef({ left: 0, top: 0 });
  // DraggablePanel-owned "a drag is live" flag. Unlike useRafDrag's
  // isDraggingRef — whose OWN unmount cleanup clears it FIRST, before this
  // component's cleanup effect runs — this is cleared ONLY by our onEnd (which
  // never fires on unmount). So on unmount-mid-drag it is still true, letting
  // the cleanup below fire notifyDragEnd(); otherwise activeDragCount and the
  // <html> data-panel-dragging marker leak. See useRafDrag's cleanup ordering.
  const dragActiveRef = useRef(false);
  // Mutable refs for values needed during drag — avoids recreating handlers when props change
  const positionRef = useRef(position);
  positionRef.current = position;
  // Render scale: prefer the controlled prop to avoid 1-frame desync between panels.
  // When THIS panel triggered the change, internal `scale` is ahead of the prop, so use it.
  // Other panels' changes render directly from the controlled prop.
  const renderScale = controlledScale !== undefined && !localScaleChangeRef.current ? controlledScale : scale;

  // The panel's physical box. `physicalSize` wins when the owner has already
  // snapped it in frame space — see the prop's doc — and every piece of drag,
  // clamp and snap math below reads these instead of multiplying again.
  const panelW = physicalSize ? physicalSize.width : width * renderScale;
  const panelH = physicalSize ? physicalSize.height : height * renderScale;
  // Cover, not fit: a snapped box and the content's own `logical * scale` extent
  // can differ by up to a pixel either way, and only overflow is safe — a
  // shortfall would leave a sliver of whatever sits behind the panel along its
  // outer edge. The excess is clipped, and at <0.5% it is not perceptible.
  const contentZoom = physicalSize ? Math.max(panelW / width, panelH / height) : renderScale;

  // Mutable config ref: onMove/onEnd read from this instead of closing over props,
  // so the useRafDrag callbacks stay stable and window listeners are attached once.
  const dragConfigRef = useRef({
    width: panelW,
    height: panelH,
    viewportWidth,
    viewportHeight,
    edgeInset,
  });
  dragConfigRef.current = { width: panelW, height: panelH, viewportWidth, viewportHeight, edgeInset };
  useEffect(() => {
    if (controlledScale !== undefined) {
      // Always keep scaleRef in sync with the prop so the next wheel step
      // starts from the correct value, even if the parent clamped/delayed.
      scaleRef.current = controlledScale;
      if (localScaleChangeRef.current) {
        localScaleChangeRef.current = false;
      }
    }
  }, [controlledScale]);

  const snapRegistry = usePanelSnapRegistry();
  const reactPanelId = useId();
  // Standalone consumers use the same solver, just with a single-panel registry.
  const standaloneLayout = useMemo(createPanelLayoutStore, []);
  const layout = snapRegistry?.layout ?? standaloneLayout;
  const atDefaultRef = useRef(controlledPosition === undefined);
  const [prevControlledPosition, setPrevControlledPosition] = useState(controlledPosition);
  if (controlledPosition !== prevControlledPosition) {
    setPrevControlledPosition(controlledPosition);
    if (!dragActiveRef.current) {
      // Supplying/removing a saved position changes its interpretation even when
      // its numbers happen to equal the 1x default.
      atDefaultRef.current = controlledPosition === undefined;
      const next = controlledPosition ?? defaultPosition;
      if (!samePosition(position, next)) setPositionState(next);
    }
  }
  const ownerPositioned = externallyPositioned || physicalSize !== undefined || replaySnapRef.current;
  const layoutInputRef = useRef<PanelLayoutInput>(null!);
  layoutInputRef.current = {
    name: dataTutorial,
    position: atDefaultRef.current ? undefined : position,
    defaultPosition,
    defaultInFrame,
    width: panelW,
    height: panelH,
    baseWidth: width,
    baseHeight: height,
    scale: renderScale,
    viewport: { width: viewportWidth ?? window.innerWidth, height: viewportHeight ?? window.innerHeight },
    ownerPositioned,
    replay: replaySnapRef.current,
    dragging: activeDragCount !== 0,
    externallyPositioned,
    exclusions: exclusionRects,
    inset: edgeInset,
  };
  const defaultReferenceRef = useRef({
    position: defaultPosition,
    width,
    height,
    viewportWidth: viewportWidth ?? window.innerWidth,
    viewportHeight: viewportHeight ?? window.innerHeight,
  });
  const isSnapEnabledRef = useRef(false);
  /**
   * Sticky engagement target for hysteresis. Once the user snaps to a
   * (sibling, contact) pair, we keep them snapped until the distance
   * exceeds the release threshold (see resolveSnap). This prevents
   * snap-chatter on small movements at the engagement boundary.
   */
  const prevEngagementRef = useRef<{ targetId: string; contact: ContactKind } | null>(null);

  const exclusionRectsRef = useRef(exclusionRects);
  exclusionRectsRef.current = exclusionRects;

  // React renders the last complete solver snapshot. The registry transaction below
  // applies the next complete snapshot before paint, with no corrective state commit.
  const displayPos =
    layout.getRect(reactPanelId) ??
    positionToScreen(
      position,
      panelW,
      panelH,
      viewportWidth ?? window.innerWidth,
      viewportHeight ?? window.innerHeight,
    );

  // Keep a ref to displayPos for reading in drag start without adding it to callback deps
  const displayPosRef = useRef(displayPos);

  // Snap-registry registration is set up below, AFTER `useRafDrag` runs
  // so we have a stable `isDraggingRef`. See the registerPanel useEffect.

  // After a scale change the outer wrapper snaps to its final position/size
  // instantly.  Without compensation the inner content would appear to grow from
  // the top-left corner, making the anchor (e.g. bottom-right) visibly jump.
  const prevDisplayPosRef = useRef(displayPos);
  const prevRenderScaleRef = useRef(renderScale);
  const previousPaintRef = useRef<PanelRect | null>(null);
  const preparePaintRef = useRef<(rect: PanelRect, transition: LayoutTransition) => (() => void) | undefined>(
    () => undefined,
  );
  useLayoutEffect(
    () =>
      layout.register(
        reactPanelId,
        () => layoutInputRef.current,
        (rect, transition) => preparePaintRef.current(rect, transition),
      ),
    [layout, reactPanelId],
  );
  useLayoutEffect(() => {
    layout.update(reactPanelId);
    layout.commit();
  });

  const { startDrag, isDraggingRef } = useRafDrag({
    cursor: 'grabbing',
    onMove: (clientX, clientY) => {
      const cfg = dragConfigRef.current;
      const sw = cfg.width;
      const sh = cfg.height;
      const vw = cfg.viewportWidth ?? window.innerWidth;
      const vh = cfg.viewportHeight ?? window.innerHeight;

      // Client pixels to frame pixels: Fixed's Stretch to Window draws the frame wider or taller.
      const dx = (clientX - prevClientRef.current.x) / dragPaintScaleRef.current.x;
      const dy = (clientY - prevClientRef.current.y) / dragPaintScaleRef.current.y;
      prevClientRef.current = { x: clientX, y: clientY };

      const left = dragScreenPosRef.current.left + dx;
      const top = dragScreenPosRef.current.top + dy;
      const resolved = constrainPanelRect(
        { id: reactPanelId, left, top, right: left + sw, bottom: top + sh },
        { viewport: { width: vw, height: vh }, inset: cfg.edgeInset, exclusions: exclusionRectsRef.current },
      );

      // Raw mouse-following position; kept separate from the rendered snap
      // position so leaving snap mode returns the panel to the cursor.
      dragScreenPosRef.current = { left: resolved.left, top: resolved.top };

      // Runs after viewport-clamp + exclusion-resolve so neither constraint
      // is violated. Snap is opt-in: holding Shift enables it.
      let snapped = { left: resolved.left, top: resolved.top };
      let engagement: SnapEngagement | null = null;
      if (snapRegistry && isSnapEnabledRef.current) {
        const siblings = snapRegistry.getSiblingRects(reactPanelId);
        if (siblings.length > 0) {
          const result = resolveSnap({
            movingId: reactPanelId,
            movingLeft: resolved.left,
            movingTop: resolved.top,
            movingWidth: sw,
            movingHeight: sh,
            siblings,
            prevEngagement: prevEngagementRef.current,
            // Snapping must not undo the viewport clamp or exclusion resolution.
            isDestinationValid: (dest) => {
              if (
                dest.left < cfg.edgeInset ||
                dest.top < cfg.edgeInset ||
                dest.right > vw - cfg.edgeInset ||
                dest.bottom > vh - cfg.edgeInset
              ) {
                return false;
              }
              const zones = exclusionRectsRef.current;
              if (zones) {
                for (const zone of zones) {
                  const overlaps =
                    dest.left < zone.right &&
                    dest.right > zone.left &&
                    dest.top < zone.bottom &&
                    dest.bottom > zone.top;
                  if (overlaps) return false;
                }
              }
              return true;
            },
          });
          snapped = { left: resolved.left + result.dx, top: resolved.top + result.dy };
          engagement = result.engagement;
          // Update sticky engagement only when actually engaged. While in
          // preview range we keep the last engaged target (or null) so the
          // user can drift in/out of preview without breaking hysteresis.
          if (engagement && engagement.state === 'engaged') {
            prevEngagementRef.current = {
              targetId: engagement.targetId,
              contact: engagement.contact,
            };
          } else if (!engagement) {
            prevEngagementRef.current = null;
          }
        }
      } else {
        prevEngagementRef.current = null;
      }

      renderedDragScreenPosRef.current = { left: snapped.left, top: snapped.top };
      if (panelRef.current) {
        panelRef.current.style.transform = `translate3d(${snapped.left}px, ${snapped.top}px, 0)`;
      }
      snapRegistry?.setSnapState({ active: engagement !== null, engagement });
      // Notify tutorial system so driver.js spotlight follows the panel in real-time.
      // When no tutorial is active this hits 0 listeners (~free). When active,
      // SpotlightRunner.scheduleRefresh coalesces via rAF to one refresh per frame.
      window.dispatchEvent(new CustomEvent(TUTORIAL_PANEL_MOVED_EVENT));
    },
    onEnd: (clientX, clientY) => {
      const cfg = dragConfigRef.current;
      const sw = cfg.width;
      const sh = cfg.height;
      const vw = cfg.viewportWidth ?? window.innerWidth;
      const vh = cfg.viewportHeight ?? window.innerHeight;
      const { anchorX, anchorY } = positionRef.current;
      const finalPos = screenToPosition(
        renderedDragScreenPosRef.current.left,
        renderedDragScreenPosRef.current.top,
        sw,
        sh,
        vw,
        vh,
        anchorX,
        anchorY,
      );
      // Anchor the FLIP baseline to the position actually painted during the
      // drag. React state still holds the pre-drag position (drag moves the
      // DOM directly), so without this the drag-end commit would look like a
      // huge programmatic move and the position-aware FLIP below would warp
      // the content back and glide it in.
      prevDisplayPosRef.current = {
        left: renderedDragScreenPosRef.current.left,
        top: renderedDragScreenPosRef.current.top,
      };
      setPosition(finalPos);
      // Clear hover so Alt+Scroll can't resize from outside the panel.
      setIsHovering(false);
      requestAnimationFrame(() => {
        // Re-check hover: if the cursor is still over the panel after
        // dragging, restore isHovering so Alt+Scroll continues to work.
        // onMouseEnter won't re-fire because the cursor never left.
        const elUnderCursor = document.elementFromPoint(clientX, clientY);
        if (elUnderCursor && innerScaleRef.current?.contains(elUnderCursor)) {
          setIsHovering(true);
        }
      });
      snapRegistry?.setSnapState({ active: false, engagement: null });
      prevEngagementRef.current = null;
      setIsAltDragging(false);
      dragActiveRef.current = false;
      notifyDragEnd();
    },
    // A touch drag the browser took over (or the window lost focus under) drops nothing:
    // the panel goes back to where it was, and nothing is saved.
    onCancel: () => {
      if (panelRef.current) {
        panelRef.current.style.transform = `translate3d(${displayPosRef.current.left}px, ${displayPosRef.current.top}px, 0)`;
      }
      snapRegistry?.setSnapState({ active: false, engagement: null });
      prevEngagementRef.current = null;
      setIsAltDragging(false);
      dragActiveRef.current = false;
      notifyDragEnd();
    },
  });

  // Read lazily by the Alt overlap guide and other panels' drag snap targets, which run
  // outside this panel's render: the size must be the one just rendered, not the one the
  // registration effect last closed over.
  const stackMetaRef = useRef({ locked, altHintLabel });
  stackMetaRef.current = { locked, altHintLabel };
  const panelSizeRef = useRef({ width: panelW, height: panelH });
  panelSizeRef.current = { width: panelW, height: panelH };

  // Register live rect with the snap registry. Use a getter (not a snapshot)
  // so siblings always read the freshest position even mid-drag.
  useEffect(() => {
    if (!snapRegistry) return;
    const getRect = (): PanelRect | null => {
      const sw = panelSizeRef.current.width;
      const sh = panelSizeRef.current.height;
      const left = isDraggingRef.current ? renderedDragScreenPosRef.current.left : displayPosRef.current.left;
      const top = isDraggingRef.current ? renderedDragScreenPosRef.current.top : displayPosRef.current.top;
      return {
        id: reactPanelId,
        left,
        top,
        right: left + sw,
        bottom: top + sh,
      };
    };
    return snapRegistry.registerPanel(reactPanelId, getRect, {
      getElement: () => panelRef.current,
      getLabel: () => stackMetaRef.current.altHintLabel,
      isMovable: () => !stackMetaRef.current.locked,
    });
    // Refs are read lazily inside getRect; no need to depend on them.
  }, [snapRegistry, reactPanelId, isDraggingRef]);

  // If this panel unmounts while a drag is in flight (e.g. an InfoBoxPanel
  // disappears because the simulation cleared its last infobox mid-drag), the
  // useRafDrag `onEnd` callback never fires and the side effects we set up
  // in `handleMouseDown` leak: `activeDragCount` stays elevated (HintBar
  // permanently shows "dragging"), and the snap registry keeps the last
  // engagement state. Mirror what `onEnd` would do so the rest of the UI
  // returns to a clean state.
  useEffect(() => {
    return () => {
      if (dragActiveRef.current) {
        dragActiveRef.current = false;
        notifyDragEnd();
        snapRegistry?.setSnapState({ active: false, engagement: null });
      }
    };
  }, [snapRegistry]);

  const flipAnimRef = useRef<Animation | null>(null);

  // Cancel any in-flight FLIP on unmount so a running WAAPI animation can't
  // keep the removed inner element alive until it finishes.
  useEffect(() => {
    return () => {
      flipAnimRef.current?.cancel();
    };
  }, []);

  preparePaintRef.current = (rect, transition) => {
    if (isDraggingRef.current) return;
    const painted = replaySnapRef.current ? rect : snapPanelRect(rect, window.devicePixelRatio || 1);
    const displayPos = { left: painted.left, top: painted.top };
    const previousPaint = previousPaintRef.current;
    const scaleChanged = prevRenderScaleRef.current !== renderScale;
    const posChanged =
      Math.abs(prevDisplayPosRef.current.left - displayPos.left) > 1e-9 ||
      Math.abs(prevDisplayPosRef.current.top - displayPos.top) > 1e-9;
    const boxChanged =
      previousPaint &&
      (previousPaint.right - previousPaint.left !== painted.right - painted.left ||
        previousPaint.bottom - previousPaint.top !== painted.bottom - painted.top);
    const changed = previousPaint && (scaleChanged || posChanged || boxChanged);
    const animation = flipAnimRef.current;
    // Identity is known at rest. Only an interrupted animation needs a browser
    // read; getComputedStyle can flush layout, so it belongs to the registry's
    // read phase, before ANY panel's geometry writes.
    const computed =
      changed &&
      transition.kind !== 'snap' &&
      innerScaleRef.current &&
      (animation?.playState === 'running' || animation?.playState === 'paused')
        ? getComputedStyle(innerScaleRef.current).transform
        : 'none';

    return () => {
      displayPosRef.current = rect;
      if (panelRef.current) {
        panelRef.current.style.transform = `translate3d(${rect.left}px, ${rect.top}px, 0)`;
        panelRef.current.style.translate = `${painted.left - rect.left}px ${painted.top - rect.top}px`;
        panelRef.current.style.width = `${painted.right - painted.left}px`;
        panelRef.current.style.height = `${painted.bottom - painted.top}px`;
        // Constrain the zoom layer's used box to the quantized edges without a
        // persistent transform (which would disable LCD text at rest). Its logical
        // width/height remain intact for content and geometry consumers.
        const zoomLayer = panelRef.current.firstElementChild as HTMLElement | null;
        if (zoomLayer) {
          const w = `${(painted.right - painted.left) / contentZoom}px`;
          const h = `${(painted.bottom - painted.top) / contentZoom}px`;
          zoomLayer.style.minWidth = w;
          zoomLayer.style.maxWidth = w;
          zoomLayer.style.minHeight = h;
          zoomLayer.style.maxHeight = h;
        }
      }
      // Transition policy belongs to the registry; this applier only performs it.
      if (changed && transition.kind === 'snap') {
        // Cancel any in-flight glide so the inner layer reverts to its inline
        // `transform: none`, landing the content at the new rect this frame.
        flipAnimRef.current?.cancel();
        flipAnimRef.current = null;
      } else if (changed && innerScaleRef.current) {
        const el = innerScaleRef.current;
        const prevScale = prevRenderScaleRef.current;

        // Retarget from the transform sampled in the read phase, or known identity.
        let curX = 0;
        let curY = 0;
        let curScale = 1;
        let curScaleY = 1;
        if (computed && computed !== 'none') {
          // Our inner transforms are always `translate(...) scale(...)`, which
          // computes to `matrix(s, 0, 0, s, tx, ty)` — tx/ty in content px of
          // the PREVIOUS zoom's coordinate space.
          const m = /^matrix\(([^)]+)\)$/.exec(computed);
          if (m) {
            const p = m[1].split(',');
            curScale = Number.parseFloat(p[0]);
            curScaleY = Number.parseFloat(p[3]);
            curX = Number.parseFloat(p[4]);
            curY = Number.parseFloat(p[5]);
          }
        }

        // The DOM already shows the FINAL state: outer wrapper at displayPos,
        // middle layer at `zoom: renderScale`. Solve for the start transform
        // that reproduces the last-painted visual state under the new zoom,
        // for every content point p:
        //   newPos + newZoom·(start + startScale·p)
        //     = prevPos + prevZoom·(cur + curScale·p)
        // With cur = identity this degenerates to the classic FLIP invert.
        const startX = (prevDisplayPosRef.current.left - displayPos.left + prevScale * curX) / renderScale;
        const startY = (prevDisplayPosRef.current.top - displayPos.top + prevScale * curY) / renderScale;
        // The painted box already includes content damping and device-pixel rounding.
        const startScale = (curScale * (previousPaint.right - previousPaint.left)) / (painted.right - painted.left);
        const startScaleY = (curScaleY * (previousPaint.bottom - previousPaint.top)) / (painted.bottom - painted.top);

        if (
          Math.abs(startX) > 1e-9 ||
          Math.abs(startY) > 1e-9 ||
          Math.abs(startScale - 1) > 1e-9 ||
          Math.abs(startScaleY - 1) > 1e-9
        ) {
          // Cancel AFTER the computed-style read above — canceling first would
          // snap the computed transform back to identity and lose the anchor.
          flipAnimRef.current?.cancel();
          // jsdom (tests) has no Web Animations API; resting state is already
          // correct without the animation (inline transform stays 'none').
          if (typeof el.animate === 'function') {
            flipAnimRef.current = el.animate(
              [
                {
                  transform: `translate(${startX}px, ${startY}px) scale(${startScale}${startScale === startScaleY ? '' : `, ${startScaleY}`})`,
                },
                { transform: 'none' },
              ],
              transition.kind === 'scale' ? CHROME_RESIZE_TIMING : FLIP_ANIMATION_TIMING,
            );
            const next = flipAnimRef.current;
            next.startTime = transition.startTime;
            next.onfinish = () => {
              if (flipAnimRef.current === next) flipAnimRef.current = null;
            };
          }
        }
      }

      prevDisplayPosRef.current = displayPos;
      prevRenderScaleRef.current = renderScale;
      previousPaintRef.current = painted;
    };
  };

  // Only intentional gestures write settings. The registry owns normalization;
  // solving, docking, constraints and painting never mutate the stored position.
  const setPosition = useCallback(
    (next: UIPosition) => {
      atDefaultRef.current = false;
      layout.arrange(reactPanelId);
      setPositionState(next);
      persistPosition(next);
      window.dispatchEvent(new CustomEvent(TUTORIAL_PANEL_MOVED_EVENT));
    },
    [layout, reactPanelId, persistPosition],
  );

  const setScale = useCallback((s: number | ((prev: number) => number)) => {
    if (replaySnapRef.current || scaleLockedRef.current) return;
    const prev = scaleRef.current;
    const newVal = typeof s === 'function' ? s(prev) : s;
    if (newVal !== prev) {
      scaleRef.current = newVal;
      localScaleChangeRef.current = true;
      setScaleState(newVal);
      onScaleChangeRef.current?.(newVal);
      window.dispatchEvent(new CustomEvent(TUTORIAL_PANEL_RESIZED_EVENT));
    }
  }, []);

  // Alt+right-click: back to the 1x default as it projects at this size (or, placed in frame, the
  // default as it is now), saved like any other move. Read through a ref so the mouse handler does
  // not rebind every render.
  const resetToDefaultRef = useRef(() => {});
  resetToDefaultRef.current = () => {
    if (onResetPosition) {
      onResetPosition();
      return;
    }
    if (defaultInFrame) {
      setPosition(defaultPosition);
      return;
    }
    setPosition(
      projectPlacement(
        defaultReferenceRef.current,
        {
          viewportWidth: viewportWidth ?? window.innerWidth,
          viewportHeight: viewportHeight ?? window.innerHeight,
        },
        panelW,
        panelH,
      ),
    );
  };

  const beginDrag = useCallback(
    (e: { clientX: number; clientY: number; shiftKey: boolean; timeStamp: number }, touchPointerId?: number) => {
      prevClientRef.current = { x: e.clientX, y: e.clientY };
      dragPaintScaleRef.current = framePaintScale(panelRef.current);
      dragScreenPosRef.current = { left: displayPosRef.current.left, top: displayPosRef.current.top };
      renderedDragScreenPosRef.current = { left: displayPosRef.current.left, top: displayPosRef.current.top };
      // Kill any in-flight FLIP so the drag starts from a clean identity
      // transform (the drag writes the OUTER transform 1:1 with the mouse).
      flipAnimRef.current?.cancel();
      flipAnimRef.current = null;
      setIsHovering(false); // Prevent stale hover during drag
      // Capture the Shift modifier at drag start so the user can opt in
      // to snapping for exact panel alignment. Live tracking via
      // window keydown/keyup keeps it responsive if Shift is toggled mid-drag.
      isSnapEnabledRef.current = e.shiftKey;
      // A new drag starts with no sticky engagement — the panel can find
      // a fresh snap target if the user moves into one.
      prevEngagementRef.current = null;
      setIsAltDragging(true);
      dragActiveRef.current = true;
      notifyDragStart();
      startDrag(e, touchPointerId);
    },
    [startDrag],
  );

  const handleMouseDown = useCallback(
    (e: React.MouseEvent) => {
      if (locked) return;
      // While a recorded layout is on screen the panel renders the RECORDER's
      // position, so a drag would appear to do nothing while quietly rewriting the
      // viewer's own saved position on release.
      if (replaySnapRef.current) return;

      if (e.ctrlKey && !e.altKey && !editDrag && e.button === 0) {
        /**
         * Emitted when users attempt panel dragging with Ctrl instead of Alt.
         * App listens and shows an onboarding hint toast for the correct shortcut.
         */
        window.dispatchEvent(new CustomEvent('shortcut-hint:ctrl-drag'));
      }

      // Edit mode drags on a plain press too; a finger's press is handled in handlePointerDown.
      if ((e.altKey || editDrag) && e.button === 0) {
        e.preventDefault();
        e.stopPropagation();
        beginDrag(e);
      } else if (e.altKey && e.button === 2) {
        e.preventDefault();
        e.stopPropagation();
        resetToDefaultRef.current();
      } else if (e.altKey && e.button === 1) {
        e.preventDefault();
        e.stopPropagation();
        setScale(defaultScale);
      }
    },
    [locked, editDrag, defaultScale, setScale, beginDrag],
  );

  // Edit mode: a plain primary press drags, and never reaches the panel's own controls. A finger
  // drags from here, because it sends no mousedown once the page takes the touch, and is prevented
  // so it does not also turn into compatibility mouse events. A mouse press must NOT be prevented:
  // that suppresses the mousemove/mouseup its drag is tracked by, so it drags from the mousedown.
  const handlePointerDown = useCallback(
    (e: React.PointerEvent) => {
      if (!editDrag || locked || replaySnapRef.current || !e.isPrimary) return;
      if (!isTouchPointer(e)) {
        if (e.button === 0) e.stopPropagation();
        return;
      }
      e.preventDefault();
      e.stopPropagation();
      beginDrag(e, e.pointerId);
    },
    [editDrag, locked, beginDrag],
  );

  const handleContextMenu = useCallback((e: React.MouseEvent) => {
    if (e.altKey) {
      // Alt+right-click is a panel-level reset (handled in handleMouseDown).
      // stopPropagation here keeps descendant context-menus (e.g. orb right-click
      // menus, inventory item right-click menus) from opening on alt-gestures.
      e.preventDefault();
      e.stopPropagation();
    }
  }, []);

  // When pointerPassthrough is true, isHovering is never updated (the inner-scale
  // layer is `pointer-events: none`, so mouseenter/leave can't fire on it).
  // Instead, hit-test via elementFromPoint at wheel time so Alt+scroll only
  // resizes when the cursor is over actual interactive content. `isHovering` is read
  // through a ref so the shared wheel listener subscribes once per mount.
  useAltWheelResize({
    id: reactPanelId,
    enabled: scaleEnabled,
    // The same conditions under which setScale ignores a step.
    locked: scaleLockedRef.current || replaySnapRef.current,
    isOver: (e) => {
      if (!pointerPassthrough) return isHoveringRef.current;
      const target = document.elementFromPoint(e.clientX, e.clientY);
      return !!(target && innerScaleRef.current?.contains(target));
    },
    onSteps: (steps) => setScale((prev) => stepScale(prev, steps, PANEL_SCALE_STOPS)),
  });

  // Live Shift tracking: lets the user toggle snap on/off mid-drag without
  // having to release the mouse. Active only while dragging is in flight.
  useEffect(() => {
    if (!snapRegistry) return;
    return subscribeModifiers(({ shift }) => {
      if (!isDraggingRef.current) return;
      if (isSnapEnabledRef.current === shift) return;
      isSnapEnabledRef.current = shift;
      if (shift) return;
      prevEngagementRef.current = null;
      snapRegistry?.setSnapState({ active: false, engagement: null });
      renderedDragScreenPosRef.current = { ...dragScreenPosRef.current };
      if (panelRef.current) {
        panelRef.current.style.transform = `translate3d(${dragScreenPosRef.current.left}px, ${dragScreenPosRef.current.top}px, 0)`;
      }
    });
  }, [snapRegistry, isDraggingRef]);

  // During drag, use the live screen position from the ref so that if React re-renders
  // (e.g. from a simulation tick), the panel doesn't snap back to the pre-drag position.
  // Use the rendered drag position, not the raw mouse-following position, so
  // snap-mode re-renders don't briefly flick the panel away from its snapped spot.
  const paintedPos = isDraggingRef.current ? renderedDragScreenPosRef.current : displayPos;
  const currentTransform = `translate3d(${paintedPos.left}px, ${paintedPos.top}px, 0)`;
  // Proportional placement leaves panels on fractional pixels, which resamples their text
  // and sprites. The painted box is nudged onto the device-pixel grid by the separate
  // `translate` property; the placement, the rect siblings snap and dock to, and the
  // transform every consumer reads all stay exact.
  const devicePixelRatio = window.devicePixelRatio || 1;
  const snapOffset = (value: number) => Math.round(value * devicePixelRatio) / devicePixelRatio - value;
  const pixelSnap = replaySnapRef.current
    ? '0px 0px'
    : `${snapOffset(paintedPos.left)}px ${snapOffset(paintedPos.top)}px`;

  // Deliberately NOT gated on `locked`, unlike the affordance below it: a locked panel
  // still consumes Alt+wheel (the UI scale is global), and that path hit-tests with
  // elementFromPoint, which cannot see through a layer left `pointer-events: none`.
  // Sharing showAffordance would make the pinned infobox strip the one panel Alt+scroll
  // cannot resize while the cursor is over it.
  const editing = editDrag && !locked;
  const altInteractive = altHeld || isAltDragging || editing;

  const showAffordance = altInteractive && !locked;

  return (
    // eslint-disable-next-line jsx-a11y/no-static-element-interactions
    <div
      ref={panelRef}
      role="presentation"
      className={showAffordance ? 'dp-alt-move' : undefined}
      style={{
        position: 'absolute',
        left: 0,
        top: 0,
        transform: currentTransform,
        translate: pixelSnap,
        width: panelW,
        height: panelH,
        userSelect: 'none',
        zIndex,
        // A pinned panel clips: `contentZoom` covers its snapped box, so the
        // sub-pixel excess has to go somewhere. Safe here because a pinned panel
        // is also locked, and the movability affordance a movable panel paints
        // outside this box never shows. Movable panels stay `visible`.
        overflow: physicalSize ? 'hidden' : 'visible',
        pointerEvents: 'none',
      }}
      data-tutorial={dataTutorial}
      data-tutorial-input-surface={inputSurface}
      // What the player cannot do to this panel, so a tour skips the step that asks them to.
      data-locked={locked || undefined}
      data-scale-locked={!scaleEnabled || scaleLockedRef.current || undefined}
      // Capture-phase listeners so alt-modified mousedown / contextmenu are
      // intercepted BEFORE descendant buttons (orbs, compass, inventory slots,
      // etc.) see them. Holding Alt should JUST be a panel gesture (drag /
      // reset / scale-reset) and never activate the underlying control.
      onMouseDownCapture={handleMouseDown}
      onPointerDownCapture={editing ? handlePointerDown : undefined}
      onContextMenuCapture={handleContextMenu}
    >
      {/* Descendants read `contentZoom`, not the global UI scale, because a pinned
          panel is zoomed to cover its snapped box — see `physicalSize`. */}
      <PanelContentScaleProvider value={contentZoom}>
        {/* eslint-disable-next-line jsx-a11y/no-static-element-interactions */}
        <div
          style={
            {
              width,
              height,
              zoom: contentZoom,
              // For borders that keep their 1x look inside the zoom (chromeZoom.ts).
              ...unscaledPxVars(contentZoom),
            } as React.CSSProperties
          }
        >
          {/* eslint-disable-next-line jsx-a11y/no-static-element-interactions */}
          {/* biome-ignore lint/a11y/noStaticElementInteractions: Hover tracking is required for wheel-to-scale behavior. */}
          <div
            ref={innerScaleRef}
            role="presentation"
            style={{
              width: '100%',
              height: '100%',
              transform: 'none',
              transformOrigin: '0 0',
              // No `will-change: transform` here: it is a hard Blink LCD-text veto that
              // would force this panel's text into blurry grayscale AA at rest. The layer
              // is `transform: none` at rest and a running WAAPI transform self-composites.
              // Passthrough panels hand the mouse to the world — except while Alt is held,
              // where the whole rect must be grabbable.
              pointerEvents: pointerPassthrough && !altInteractive ? 'none' : 'auto',
              // A finger dragging the panel must not scroll or zoom the page instead.
              touchAction: editing ? 'none' : undefined,
            }}
            onMouseEnter={() => {
              if (!isDraggingRef.current) setIsHovering(true);
            }}
            onMouseLeave={() => {
              if (!isDraggingRef.current) setIsHovering(false);
            }}
          >
            {children}
          </div>
        </div>
      </PanelContentScaleProvider>
      {/* Always mounted so the exit transition can play on Alt release;
          visibility is driven by [data-visible] in DraggablePanel.css. */}
      <MoveAffordance visible={showAffordance} active={isAltDragging} label={altHintLabel} />
    </div>
  );
};

/**
 * The Alt-held outline and nameplate. Always mounted so the exit transition can play on
 * Alt release; visibility is driven by [data-visible] in DraggablePanel.css. Its host
 * must be a positioned box it can cover (`inset: -1px`).
 */
export function MoveAffordance({
  visible,
  active = false,
  label,
}: {
  visible: boolean;
  active?: boolean;
  label?: string;
}) {
  return (
    <div
      className={`dp-move-affordance${active ? ' dp-move-affordance--active' : ''}`}
      data-visible={visible || undefined}
      aria-hidden="true"
    >
      <span className="dp-move-affordance__corner dp-move-affordance__corner--tl" />
      <span className="dp-move-affordance__corner dp-move-affordance__corner--tr" />
      <span className="dp-move-affordance__corner dp-move-affordance__corner--bl" />
      <span className="dp-move-affordance__corner dp-move-affordance__corner--br" />
      {label && <span className="dp-move-affordance__label">{label}</span>}
    </div>
  );
}
