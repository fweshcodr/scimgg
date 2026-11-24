import type React from 'react';
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import './HoverCard.css';

const VIEWPORT_MARGIN = 8;
const ANCHOR_GAP = 7;
const CARET_HALF = 6;
/** `.hover-card`'s border, which its absolutely positioned caret is offset from rather than the card's own edge. */
const CARD_BORDER = 1;

/**
 * For a card whose region is one cell of a grid the pointer crosses to reach another: long
 * enough that passing over a cell never raises a card, short enough that stopping on one does.
 * It is also what keeps two adjacent marks from trading cards as the pointer crosses between
 * them.
 *
 * A region the pointer can only arrive at deliberately pays none of that, and must not be
 * charged this: see `dwellMs`.
 */
const DEFAULT_DWELL_MS = 350;

/**
 * Narrows a card whose copy wraps to the narrowest whole-pixel width that keeps its line count, so
 * the box hugs its longest line. CSS cannot do this: once anything wraps, shrink-to-fit stops at
 * the max-width whatever the lines then measure, and `text-wrap: balance` shortens the lines
 * without narrowing the box around them.
 *
 * Height stands in for the line count, and it only grows as the width shrinks (`balance` keeps the
 * line count a plain wrap would give), so a bisection finds the edge. The floor is the card's
 * min-content width, because below its longest word a card overflows instead of growing taller.
 */
function hugWrappedLines(card: HTMLElement): void {
  const { style } = card;
  style.width = '';
  const height = card.offsetHeight;
  // Unwrapped copy is already exactly as wide as its words: that is every label, which so pays one
  // extra layout here rather than a search.
  style.maxWidth = 'none';
  const unwrappedHeight = card.offsetHeight;
  style.maxWidth = '';
  if (!height || height === unwrappedHeight) return;

  const contentWidth = () => Math.ceil(Number.parseFloat(getComputedStyle(card).width));
  let wide = contentWidth();
  style.width = 'min-content';
  let narrow = contentWidth();
  if (!(narrow < wide)) {
    style.width = '';
    return;
  }
  while (narrow < wide) {
    const mid = (narrow + wide) >> 1;
    style.width = `${mid}px`;
    if (card.offsetHeight === height) wide = mid;
    else narrow = mid + 1;
  }
  style.width = `${wide}px`;
}

/**
 * Whether a pointer is one that hovers, which decides which of the two paths in it takes.
 *
 * Anything not explicitly touch or pen counts, so an unrecognized `pointerType` falls to the
 * dwell rather than the press: hovering is the path a mouse-like pointer can actually perform,
 * and mistaking a real mouse for a tap would make its every press toggle the card.
 */
export function pointerHovers(pointerType: string): boolean {
  return pointerType !== 'touch' && pointerType !== 'pen';
}

function hovers(event: PointerEvent): boolean {
  return pointerHovers(event.pointerType);
}

/**
 * Which axis the card leaves its anchor on.
 *
 * `inline` puts it beside the anchor, for marks in a stacked list where a card over its own
 * anchor would cover the row the player is comparing against. `block` puts it under, for a
 * control in a horizontal row, where beside is where that row's neighbors are. `above` is
 * `block` for a row whose own content is below it, so under is where that content is.
 *
 * Each is a preference, not a demand: a card takes the other side rather than leave the viewport.
 */
export type HoverCardPlacement = 'inline' | 'block' | 'above';

interface UseHoverCardOptions {
  content: React.ReactNode;
  /** What the caret points at, and what the card is measured against. */
  anchorRef: React.RefObject<HTMLElement | null>;
  /**
   * The larger element whose hover opens the card, when the anchor is too small to aim at.
   * Defaults to the anchor.
   */
  regionRef?: React.RefObject<HTMLElement | null>;
  placement?: HoverCardPlacement;
  /**
   * How long the pointer must rest before the card opens. The default guards a region sitting
   * in a field of siblings, where the delay is the only thing separating "reading this one"
   * from "on the way to that one". Lower it for a region a pointer reaches on purpose and
   * rests on to read — there is no crossing traffic to filter, so the wait is pure latency
   * between asking for the explanation and getting it.
   */
  dwellMs?: number;
  /** Extra class on the card, for a caller that needs a different measure. */
  cardClassName?: string;
  cardId: string;
  /** Held open by the caller, for a trigger that manages its own focus. */
  forceOpen?: boolean;
  /** Open on keyboard focus reaching the region. Off for callers that do their own focus. */
  openOnFocus?: boolean;
  /**
   * The card was dismissed from inside. A caller passing `forceOpen` MUST clear it here, or
   * Escape closes a card its own prop immediately reopens.
   */
  onDismiss?: () => void;
  /**
   * Close when the anchor is pressed. On for a control whose press produces something where the
   * card is sitting: a mark that confirms in place, or a slot that opens a picker over itself.
   * Off for a hint on a label, where the press belongs to the control and a reader may still be
   * partway through the explanation of it.
   */
  dismissOnPress?: boolean;
  /**
   * Whether a touch or pen press on the region toggles the card. On by default: a tap is the only
   * way such a pointer reaches a card whose region is the very thing it explains.
   *
   * Off for a region that holds a control of its own, where a tap belongs to that control and
   * must not also raise a card over it. The caller then supplies its own touch trigger, at the
   * anchor, and toggles the card itself (`forceOpen` with `onDismiss`, and the returned `close`).
   * Mouse hover and keyboard focus on the region are unaffected; a touch press anywhere but the
   * anchor then dismisses an open card, as one outside the region does.
   */
  regionTouch?: boolean;
}

/**
 * The one hover card in the app: an opaque, portalled, caret-anchored panel that opens after a
 * dwell and dismisses on Escape, scroll, resize or a press outside.
 *
 * Portalled to `<body>` rather than rendered beside its anchor because the surfaces that host
 * these clip and blur: a tray on `overflow: hidden` truncates the card, and a `backdrop-filter`
 * ancestor is one of Blink's LCD text-AA vetoes (docs/agent-reference.md, "LCD text") that would
 * soften every glyph inside it.
 */
export function useHoverCard({
  content,
  anchorRef,
  regionRef,
  placement = 'inline',
  dwellMs = DEFAULT_DWELL_MS,
  cardClassName,
  cardId,
  forceOpen = false,
  openOnFocus = true,
  onDismiss,
  dismissOnPress = false,
  regionTouch = true,
}: UseHoverCardOptions): { open: boolean; card: React.ReactNode; close: () => void } {
  const [hovered, setHovered] = useState(false);
  const [focused, setFocused] = useState(false);
  const open = hovered || focused || forceOpen;
  const cardRef = useRef<HTMLDivElement>(null);
  const caretRef = useRef<HTMLSpanElement>(null);

  // A press focuses the anchor, and focus outlives the pointer, so without this the focus that
  // arrives WITH a click reopens the card the same click just dismissed. Keyboard focus has no
  // preceding pointerdown, so it still opens.
  const focusFromPointer = useRef(false);
  const dwellRef = useRef<number | null>(null);
  const cancelDwell = useCallback(() => {
    if (dwellRef.current !== null) {
      window.clearTimeout(dwellRef.current);
      dwellRef.current = null;
    }
  }, []);

  useEffect(() => {
    const region = regionRef?.current ?? anchorRef.current;
    if (!region) return;
    const enter = (event: PointerEvent) => {
      cancelDwell();
      // A dwell is a mouse idea. A tap enters and leaves inside it, so waiting one out on a touch
      // pointer is the same as having no pointer path at all; touch takes the press below, or the
      // caller's own trigger under `regionTouch: false`.
      if (!hovers(event)) return;
      dwellRef.current = window.setTimeout(() => setHovered(true), dwellMs);
    };
    const leave = (event: PointerEvent) => {
      cancelDwell();
      // The same tap's `pointerleave` lands immediately after the `pointerdown` that opened the
      // card, so honoring it here would shut a touch card before it painted. Touch closes on the
      // next press outside instead.
      if (!hovers(event)) return;
      setHovered(false);
    };
    // How long a press's focus is suppressed for. A hovering pointer's focus is dispatched during
    // the press itself, so the flag clears on the next frame; it must clear, because Safari does
    // not focus a button on press at all, and a flag that waited for that focus (or a blur) would
    // stay set there and swallow the user's next Tab into the anchor. A tap's focus arrives later,
    // between its pointerup and its click and possibly frames after the press, so a touch or pen
    // press holds the flag until the gesture ends in a click or a cancel. A key pressed before
    // that releases it at once: whatever focus follows is the keyboard's.
    let releaseHold = () => {};
    let holdGeneration = 0;
    const holdPointerFocus = (hovering: boolean) => {
      releaseHold();
      focusFromPointer.current = true;
      // An earlier press's pending frame must not clear the hold of the press after it.
      const generation = ++holdGeneration;
      const clearNextFrame = () =>
        requestAnimationFrame(() => {
          if (generation === holdGeneration) focusFromPointer.current = false;
        });
      if (hovering) {
        releaseHold = () => {};
        clearNextFrame();
        return;
      }
      const stop = () => {
        window.removeEventListener('click', endGesture, true);
        window.removeEventListener('pointercancel', endGesture, true);
        window.removeEventListener('keydown', keyPressed, true);
      };
      const endGesture = () => {
        stop();
        releaseHold = () => {};
        clearNextFrame();
      };
      const keyPressed = () => {
        stop();
        releaseHold = () => {};
        focusFromPointer.current = false;
      };
      window.addEventListener('click', endGesture, true);
      window.addEventListener('pointercancel', endGesture, true);
      window.addEventListener('keydown', keyPressed, true);
      releaseHold = stop;
    };
    const press = (event: PointerEvent) => {
      cancelDwell();
      // Raised for EVERY press, not only a dismissing one: the region may itself be a focusable
      // control, and under `openOnFocus` the focus its own press brings would latch the card open
      // — after a mouse has left the control, or through the tap meant to toggle it shut.
      holdPointerFocus(hovers(event));
      // Touch gets the opposite rule from `dismissOnPress` whatever that is set to, because a
      // tap is the only way a touch pointer can open one of these at all — unless the caller
      // has given touch a trigger of its own (`regionTouch`).
      if (hovers(event)) {
        if (!dismissOnPress) return;
        setHovered(false);
        setFocused(false);
        return;
      }
      if (!regionTouch) return;
      setHovered((wasOpen) => !wasOpen);
      // The tap now owns the card: a keyboard focus that opened it must not hold it open through
      // the tap that toggles it shut.
      setFocused(false);
    };
    const focusIn = () => {
      if (focusFromPointer.current) return;
      cancelDwell();
      setFocused(true);
    };
    const focusOut = () => setFocused(false);
    // `pointerenter`/`pointerleave`, not the `over`/`out` pair: a region may contain the anchor
    // and other elements, and the bubbling pair fires a leave on every crossing between them,
    // which restarts the dwell each time the pointer moves inside the region it is dwelling on.
    region.addEventListener('pointerenter', enter);
    region.addEventListener('pointerleave', leave);
    region.addEventListener('pointerdown', press);
    if (openOnFocus) {
      region.addEventListener('focusin', focusIn);
      region.addEventListener('focusout', focusOut);
    }
    return () => {
      region.removeEventListener('pointerenter', enter);
      region.removeEventListener('pointerleave', leave);
      region.removeEventListener('pointerdown', press);
      region.removeEventListener('focusin', focusIn);
      region.removeEventListener('focusout', focusOut);
      releaseHold();
      focusFromPointer.current = false;
      cancelDwell();
    };
  }, [anchorRef, regionRef, cancelDwell, openOnFocus, dismissOnPress, dwellMs, regionTouch]);

  // biome-ignore lint/correctness/useExhaustiveDependencies: content and class can change while open (an import hint becomes its outcome), and the new copy needs its own width and place.
  useLayoutEffect(() => {
    if (!open) return;
    const anchorEl = anchorRef.current;
    const card = cardRef.current;
    const caret = caretRef.current;
    if (!anchorEl || !card) return;

    // Sized before it is measured for placement, so the flip and the clamps see the final box.
    hugWrappedLines(card);
    const anchor = anchorEl.getBoundingClientRect();
    const box = card.getBoundingClientRect();
    const maxLeft = window.innerWidth - box.width - VIEWPORT_MARGIN;
    const maxTop = window.innerHeight - box.height - VIEWPORT_MARGIN;

    let side: 'right' | 'left' | 'bottom' | 'top';
    let left: number;
    let top: number;
    if (placement === 'inline') {
      side = anchor.right + ANCHOR_GAP + box.width <= window.innerWidth - VIEWPORT_MARGIN ? 'right' : 'left';
      left = side === 'right' ? anchor.right + ANCHOR_GAP : anchor.left - ANCHOR_GAP - box.width;
      top = anchor.top + anchor.height / 2 - box.height / 2;
    } else {
      const fitsBelow = anchor.bottom + ANCHOR_GAP + box.height <= window.innerHeight - VIEWPORT_MARGIN;
      const fitsAbove = anchor.top - ANCHOR_GAP - box.height >= VIEWPORT_MARGIN;
      side = placement === 'above' ? (fitsAbove ? 'top' : 'bottom') : fitsBelow ? 'bottom' : 'top';
      top = side === 'bottom' ? anchor.bottom + ANCHOR_GAP : anchor.top - ANCHOR_GAP - box.height;
      left = anchor.left + anchor.width / 2 - box.width / 2;
    }

    // Whole pixels: the RuneScape faces are pixel fonts, and a half-pixel offset resamples every
    // glyph in the card into a blur.
    const placedLeft = Math.round(Math.min(Math.max(VIEWPORT_MARGIN, left), Math.max(VIEWPORT_MARGIN, maxLeft)));
    const placedTop = Math.round(Math.min(Math.max(VIEWPORT_MARGIN, top), Math.max(VIEWPORT_MARGIN, maxTop)));
    card.style.left = `${placedLeft}px`;
    card.style.top = `${placedTop}px`;
    // Set here rather than in CSS because only this effect knows which way the flip went, and it
    // has to land before first paint or the reveal scales from the card's center instead of out
    // of the anchor.
    card.style.transformOrigin =
      side === 'right'
        ? 'left center'
        : side === 'left'
          ? 'right center'
          : side === 'bottom'
            ? 'center top'
            : 'center bottom';
    if (caret) {
      caret.dataset.side = side;
      // Against the anchor's own center rather than the card's, so the caret still points at it
      // after a clamp has slid the card away from centered.
      if (placement === 'inline') {
        caret.style.top = `${Math.round(anchor.top + anchor.height / 2 - placedTop - CARD_BORDER - CARET_HALF)}px`;
        caret.style.left = '';
      } else {
        caret.style.left = `${Math.round(anchor.left + anchor.width / 2 - placedLeft - CARD_BORDER - CARET_HALF)}px`;
        caret.style.top = '';
      }
    }
  }, [open, anchorRef, placement, content, cardClassName]);

  // Clears both triggers without blurring: a keyboard trigger keeps focus so Escape dismisses the
  // card where the user is rather than throwing them back to the top of the tab order.
  // Through a ref so `close` stays stable: an inline `onDismiss` would otherwise re-register the
  // window listeners below on every render the card is open for.
  const dismissRef = useRef(onDismiss);
  dismissRef.current = onDismiss;

  const close = useCallback(() => {
    cancelDwell();
    setHovered(false);
    setFocused(false);
    dismissRef.current?.();
  }, [cancelDwell]);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') close();
    };
    // A touch card has no pointer that can leave, so without this it would outlive the control it
    // belongs to. Presses on the card's own trigger are that trigger's toggle and must not close
    // it here: the whole region, except for a touch press where the region does not toggle on
    // touch — there only the anchor is the trigger, and the rest of the region is the control's.
    const onPointerDown = (event: PointerEvent) => {
      const trigger = regionTouch || hovers(event) ? (regionRef?.current ?? anchorRef.current) : anchorRef.current;
      if (trigger && event.target instanceof Node && trigger.contains(event.target)) return;
      close();
    };
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('pointerdown', onPointerDown);
    // The card is positioned once against the anchor's box, so anything that moves the anchor —
    // a scrolling column, a resize, a dragged panel — would strand it mid-air.
    window.addEventListener('scroll', close, true);
    window.addEventListener('resize', close);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('pointerdown', onPointerDown);
      window.removeEventListener('scroll', close, true);
      window.removeEventListener('resize', close);
    };
  }, [open, close, anchorRef, regionRef, regionTouch]);

  const card =
    open &&
    createPortal(
      <div ref={cardRef} id={cardId} role="tooltip" className={`hover-card${cardClassName ? ` ${cardClassName}` : ''}`}>
        <span ref={caretRef} className="hover-card-caret" data-side="right" aria-hidden="true" />
        {content}
      </div>,
      document.body,
    );

  return { open, card: card || null, close };
}
