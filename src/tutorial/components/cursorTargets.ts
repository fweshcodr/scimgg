import { runSyntheticInput } from '../../input/inputProvenance';
import { panelTabSelector, prayerSelector } from '../targetSelectors';
import type { DemoCursorTarget } from '../types';

export interface CursorPoint {
  x: number;
  y: number;
}

/** Target resolution must not open tabs: opening is an authored panel-tab cue before its prayer cue. */
export function resolveCursorElement(target: DemoCursorTarget): HTMLElement | null {
  switch (target.kind) {
    case 'panel-tab':
      return document.querySelector<HTMLElement>(panelTabSelector(target.tab));
    case 'prayer':
      return document.querySelector<HTMLElement>(prayerSelector(target.prayer));
    case 'selector':
      return document.querySelector<HTMLElement>(target.selector);
  }
}

export function elementCenter(el: HTMLElement): CursorPoint {
  const r = el.getBoundingClientRect();
  return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
}

/** runSyntheticInput suppresses replay recording while the engine effect still runs. */
export function dispatchSyntheticClick(el: HTMLElement): void {
  const { x, y } = elementCenter(el);
  const init: MouseEventInit = {
    bubbles: true,
    cancelable: true,
    composed: true,
    clientX: x,
    clientY: y,
    button: 0,
    buttons: 1,
  };
  const hasPointer = typeof PointerEvent !== 'undefined';
  const pointerInit = { ...init, pointerId: 1, pointerType: 'mouse', isPrimary: true };

  // Prayer buttons toggle on mousedown rather than click.
  runSyntheticInput(() => {
    if (hasPointer) el.dispatchEvent(new PointerEvent('pointerdown', pointerInit));
    el.dispatchEvent(new MouseEvent('mousedown', init));
    if (hasPointer) el.dispatchEvent(new PointerEvent('pointerup', { ...pointerInit, buttons: 0 }));
    el.dispatchEvent(new MouseEvent('mouseup', { ...init, buttons: 0 }));
    el.dispatchEvent(new MouseEvent('click', { ...init, buttons: 0 }));
  });
}
