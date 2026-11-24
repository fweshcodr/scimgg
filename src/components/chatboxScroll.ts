import {
  FIXED_CHAT_SCROLL_ARROW,
  FIXED_CHAT_SCROLL_THUMB_MIN,
  FIXED_CHAT_SCROLLAREA,
  FIXED_CHAT_SCROLLBAR,
} from '../layout/osrsClientLayout';

/**
 * The chat stacks lines upward from 0 and sets the scroll height to the stack plus 2, so the
 * newest line ends 2px above the bottom of the scroll area.
 */
export const CHAT_BOTTOM_GAP = 2;

/** One wheel notch moves the scroll position 45px. */
export const CHAT_WHEEL_STEP = 45;

/** 4px per step while an arrow is held. */
export const CHAT_ARROW_STEP = 4;

export interface ChatScrollGeometry {
  /** How far the scroll area is scrolled from its top, in logical pixels. */
  readonly scrollY: number;
  readonly maxScroll: number;
  /** `fromBottom` clamped into range: how far the view sits above the newest line. */
  readonly fromBottom: number;
  /** Offset of the newest line's bottom edge from the scroll area's bottom edge. */
  readonly linesBottom: number;
  /** Dragger position and size inside the scrollbar, arrows included. */
  readonly thumbTop: number;
  readonly thumbHeight: number;
}

/**
 * The chat's scroll state is kept as distance from the bottom because that is what the game
 * preserves: a new line keeps a reader pinned to the newest line, and a reader who has scrolled
 * up stays the same distance above it.
 *
 * Dragger size and position are computed in truncating integer arithmetic.
 */
export function chatScrollGeometry(contentHeight: number, fromBottom: number): ChatScrollGeometry {
  const viewport = FIXED_CHAT_SCROLLAREA.height;
  const scrollHeight = Math.max(viewport, contentHeight + CHAT_BOTTOM_GAP);
  const maxScroll = scrollHeight - viewport;
  const clampedFromBottom = Math.min(Math.max(fromBottom, 0), maxScroll);
  const scrollY = maxScroll - clampedFromBottom;

  const trough = FIXED_CHAT_SCROLLBAR.height - FIXED_CHAT_SCROLL_ARROW * 2;
  const thumbHeight = Math.max(FIXED_CHAT_SCROLL_THUMB_MIN, Math.trunc((trough * viewport) / scrollHeight));
  const thumbTop = FIXED_CHAT_SCROLL_ARROW + Math.trunc(((trough - thumbHeight) * scrollY) / Math.max(maxScroll, 1));

  return {
    scrollY,
    maxScroll,
    fromBottom: clampedFromBottom,
    linesBottom: viewport - (scrollHeight - CHAT_BOTTOM_GAP - scrollY),
    thumbTop,
    thumbHeight,
  };
}

/**
 * Where a dragged dragger puts the chat, as distance from the bottom (see `chatScrollGeometry`).
 *
 * The dragger's top is read as an offset down the trough and scrolls to
 * `offset * (scrollHeight - height) / max(1, trough - dragger)`, clamped to the scrollable
 * range. Dragged to the bottom, the
 * result is 0: the view is pinned to the newest line again.
 */
export function chatScrollFromDragger(contentHeight: number, draggerOffset: number): number {
  const { maxScroll, thumbHeight } = chatScrollGeometry(contentHeight, 0);
  const trough = FIXED_CHAT_SCROLLBAR.height - FIXED_CHAT_SCROLL_ARROW * 2;
  const scrollY = Math.trunc((draggerOffset * maxScroll) / Math.max(1, trough - thumbHeight));
  return maxScroll - Math.min(Math.max(scrollY, 0), maxScroll);
}
