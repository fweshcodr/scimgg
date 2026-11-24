import type React from 'react';
import type { ReplayClickType } from '../core/ReplayRecorder';

/**
 * The orb actions shared by the minimap orbs and the mobile hotkeys bar, which on the mobile
 * client do exactly what the orbs do. The toggles themselves already refuse to act during a replay; this
 * keeps the press, its replay marker and the special-attack display identical in both places.
 */

/** The special attack bar shows the state queued toggles will leave it in. */
export function specialAttackShownActive(isActive: boolean, pendingToggles: number): boolean {
  return pendingToggles % 2 === 1 ? !isActive : isActive;
}

export type ReplayCursorClick = (clientX: number, clientY: number, type: ReplayClickType, nowMs?: number) => void;

/** Presses an orb: the action, then the yellow click marker a recording keeps for it. */
export function pressOrb(
  action: (() => void) | undefined,
  onReplayCursorClick: ReplayCursorClick | undefined,
  event: Pick<React.MouseEvent, 'clientX' | 'clientY' | 'timeStamp'>,
): void {
  if (!action) return;
  action();
  onReplayCursorClick?.(event.clientX, event.clientY, 'yellow', event.timeStamp);
}
