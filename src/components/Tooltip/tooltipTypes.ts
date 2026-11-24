import type React from 'react';
import { createContext } from 'react';

export interface TooltipSpan {
  text: string;
  color: string;
}
export interface TooltipLine {
  spans: TooltipSpan[];
}
export interface TooltipContent {
  lines: TooltipLine[];
}
export type TooltipInput = TooltipContent | null;

/**
 * API context — stable references only, so the value NEVER changes after
 * mount. All non-overlay consumers subscribe to this (InventoryContent,
 * EquipmentContent, etc.) and are never re-rendered by tooltip or scale
 * churn.
 */
export interface TooltipAPIContextType {
  showTooltip: (content: TooltipContent) => void;
  /**
   * Refresh the content of an already-visible tooltip, but ONLY when `triggerEl`
   * currently owns it. A no-op when the tooltip is hidden or owned by another
   * element, so a stale hover flag can never resurrect a dismissed tooltip.
   */
  updateTooltip: (triggerEl: HTMLElement | null, content: TooltipContent) => void;
  hideTooltip: () => void;
  /**
   * Own the tooltip from a trigger the mouse cannot hit.
   *
   * A `pointerPassthrough` panel's content is `pointer-events: none`, so it receives no
   * mouseenter and the provider's cursor-tracking safety net — which hides a tooltip the
   * moment `elementFromPoint` stops returning its trigger — would dismiss it on the next
   * mousemove. A virtual trigger is validated against its bounding rect instead, and owns
   * the tooltip against elements UNDER it for as long as the cursor stays inside that
   * rect: the caller has already established it is the topmost painted surface there, and
   * without that precedence the trigger below re-claims the tooltip on every mousemove
   * and the two flicker against each other.
   *
   * The caller is the authority on whether the hover still holds and must call
   * {@link hideVirtualTooltip}; nothing else can observe the cursor leaving.
   */
  showVirtualTooltip: (trigger: HTMLElement, content: TooltipContent) => void;
  /**
   * A tap tooltip, the mobile client's only kind: opened by a tap on `trigger` at
   * (`clientX`, `clientY`), placed beside the finger, and not taken down by the provider when
   * a finger lands elsewhere. The caller owns toggling, dismissal and the timeout (see
   * `MOBILE_TAP_TOOLTIP_MS`) and releases it with {@link hideVirtualTooltip}.
   */
  showTapTooltip: (trigger: HTMLElement, content: TooltipContent, clientX: number, clientY: number) => void;
  /**
   * Whether `trigger`'s tap tooltip is still showing. Any owner may hide the tooltip (a menu
   * opening, a tab change), so a tap tooltip's caller asks this rather than remembering
   * that it opened one.
   */
  ownsTapTooltip: (trigger: HTMLElement) => boolean;
  /** Release a virtual or tap tooltip. A no-op unless `trigger` still owns it. */
  hideVirtualTooltip: (trigger: HTMLElement) => void;
  setScale: (scale: number) => void;
  recheckHover: () => void;
  bindTooltip: (contentOrFactory: TooltipInput | (() => TooltipInput)) => {
    'data-tooltip-bound': string;
    onMouseEnter: (e?: React.MouseEvent) => void;
    onMouseLeave: () => void;
    onMouseMove: (e?: React.MouseEvent) => void;
    onPointerDown?: (e?: React.PointerEvent) => void;
    onPointerUp?: (e?: React.PointerEvent) => void;
  };
  /** @internal Overlay plumbing — only TooltipOverlay should call this. */
  registerTooltipEl: (el: HTMLDivElement | null) => void;
}

/**
 * Display context — changes when tooltip content/visibility changes.
 * ONLY TooltipOverlay subscribes to this, so only the overlay re-renders.
 */
export interface TooltipDisplayContextType {
  content: TooltipContent | null;
  visible: boolean;
  scale: number;
  readonly viewerChrome: boolean;
}

export const TooltipAPIContext = createContext<TooltipAPIContextType | undefined>(undefined);
/**
 * Live UI scale. Split out of the API context so Alt+scroll resize bursts
 * only re-render components that actually render from the scale — keeping
 * bindTooltip-only consumers (item slots, orbs, viewport bridges with
 * render-prop children) out of the per-step commit.
 */
export const TooltipScaleContext = createContext<number | undefined>(undefined);
/**
 * True while `forcedScale` pins the UI scale (fixed layout or replay playback).
 * A panel MUST refuse its own Alt+scroll step while this is set: `setScale`
 * going inert in the provider is not enough on its own, because
 * DraggablePanel keeps local scale state and suppresses exactly one sync-back
 * from the controlled prop — so the step would stick on that panel alone and
 * drift it out of the pinned frame.
 *
 * Defaults to false so a DraggablePanel mounted outside any TooltipProvider
 * keeps its own scale.
 */
export const TooltipScaleLockedContext = createContext(false);
export const TooltipDisplayContext = createContext<TooltipDisplayContextType | undefined>(undefined);

export const TOOLTIP_COLORS = {
  action: '#ffffff', // white — matches OSRS tooltip action verb color
  item: '#f5c080', // warm amber
  npc: '#f5ec78', // warm gold
  loc: '#80e8e0', // warm teal
  spell: '#f5c080', // warm amber — same as item/prayer/ui for consistency
  prayer: '#f5c080', // same as item
  ui: '#f5c080', // same as item
} as const;
