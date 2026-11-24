import { type RefObject, useLayoutEffect } from 'react';
import { useDevicePixelRatio } from '../../hooks/useDevicePixelRatio';
import './CenteredModalSnap.css';

/** For relative-positioned cards centered by their immediate overlay, with no other placement owner. */
export function useCenteredModalSnap(cardRef: RefObject<HTMLElement | null>, open = true): void {
  const dpr = useDevicePixelRatio(Infinity);

  useLayoutEffect(() => {
    const card = cardRef.current;
    const overlay = card?.parentElement;
    if (!open || !card || !overlay) return;

    let applied = { x: 0, y: 0, left: 0, top: 0 };
    const measure = () => {
      const style = getComputedStyle(card);
      // Entrance transforms are intentional movement, not the resting layout origin.
      if (style.transform && style.transform !== 'none') return;
      const rect = card.getBoundingClientRect();
      // Read the applied offsets, not the last requested ones: fullscreen sheets override them.
      const left = Number.parseFloat(style.left) || 0;
      const top = Number.parseFloat(style.top) || 0;
      const x = rect.left - (left === applied.left ? applied.x : left);
      const y = rect.top - (top === applied.top ? applied.y : top);
      const offsets = [Math.round(x * dpr) / dpr - x, Math.round(y * dpr) / dpr - y];
      let changed = false;
      for (const [index, property] of ['--centered-modal-snap-x', '--centered-modal-snap-y'].entries()) {
        const value = `${offsets[index]}px`;
        if (card.style.getPropertyValue(property) !== value) {
          card.style.setProperty(property, value);
          changed = true;
        }
      }
      if (changed) {
        // Layout can quantize a fractional CSS offset. Subtract its measured displacement on
        // the next pass, not the unquantized request, or repeated resizes slowly alternate it.
        const updated = card.getBoundingClientRect();
        const updatedStyle = getComputedStyle(card);
        applied = {
          x: updated.left - x,
          y: updated.top - y,
          left: Number.parseFloat(updatedStyle.left) || 0,
          top: Number.parseFloat(updatedStyle.top) || 0,
        };
      }
    };
    const onAnimationFinish = (event: AnimationEvent) => {
      if (event.target === card) measure();
    };
    const observer = new ResizeObserver(measure);
    observer.observe(card);
    observer.observe(overlay);
    window.addEventListener('resize', measure);
    card.addEventListener('animationend', onAnimationFinish);
    card.addEventListener('animationcancel', onAnimationFinish);
    measure();

    return () => {
      observer.disconnect();
      window.removeEventListener('resize', measure);
      card.removeEventListener('animationend', onAnimationFinish);
      card.removeEventListener('animationcancel', onAnimationFinish);
      card.style.removeProperty('--centered-modal-snap-x');
      card.style.removeProperty('--centered-modal-snap-y');
    };
  }, [cardRef, open, dpr]);
}
