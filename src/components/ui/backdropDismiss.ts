import type React from 'react';
import { useRef } from 'react';

/**
 * Close-on-backdrop for a modal: spread the result onto the element that covers the page behind
 * `card`. It closes on the `click`, the last event of a press, and only for a press that began
 * and ended outside the card, so dragging a selection out of a field does not close it.
 *
 * Closing earlier (on `mousedown`) is what a touch breaks: the browser sends a tap's mouse events
 * after the touch, so the modal is gone before its `click`, which then lands on whatever was
 * behind it — a tab, a panel button, the game.
 */
export function useBackdropDismiss(
  card: React.RefObject<HTMLElement | null>,
  onDismiss: () => void,
): { onPointerDown: (event: React.PointerEvent) => void; onClick: (event: React.MouseEvent) => void } {
  const pressedOutside = useRef(false);
  const outside = (target: EventTarget) => !(target instanceof Node && card.current?.contains(target));
  return {
    onPointerDown: (event) => {
      pressedOutside.current = outside(event.target);
    },
    onClick: (event) => {
      const dismiss = pressedOutside.current && outside(event.target);
      pressedOutside.current = false;
      if (dismiss) onDismiss();
    },
  };
}
