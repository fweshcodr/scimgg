import { createContext } from 'react';
import type { ClickType } from '../../hooks/useClickAnimation';
import { THEME } from '../../theme';
import { withAlpha } from '../../util/colorUtils';

export interface ContextMenuEntry {
  action: string;
  target?: string;
  targetColor?: string;
  onClick?: () => void;
  submenu?: ContextMenuEntry[];
  disabled?: boolean;
  clickType?: ClickType;
}

export interface ContextMenuContent {
  entries: ContextMenuEntry[];
}

/** The finger whose long-press opened the visible menu, which the menu owns until it lifts. */
export interface TouchMenuOpener {
  readonly pointerId: number;
  readonly clientX: number;
  readonly clientY: number;
  /** Minimum row height, in CSS px, read from the touch preferences when the menu opened. */
  readonly rowHeight: number;
}

export interface BindContextMenuOptions {
  /**
   * A touch pointer (see `isTouchPointer`): the press traveled past the tap slop before its
   * hold, so it is neither a tap nor a menu. `down` is the press, `move` the event that crossed the slop.
   */
  readonly onTouchDrag?: (down: PointerEvent, move: PointerEvent) => void;
}

export interface ContextMenuContextType {
  readonly isReplaying?: boolean;
  content: ContextMenuContent | null;
  visible: boolean;
  menuX: number;
  menuY: number;
  /** Set while the visible menu was opened by a touch long-press; null for a mouse menu. */
  readonly touchOpener?: TouchMenuOpener | null;
  onReplayCursorClick?: (clientX: number, clientY: number, type: ClickType, nowMs?: number) => void;
  showContextMenu: (content: ContextMenuContent, x: number, y: number) => void;
  hideContextMenu: () => void;
  bindContextMenu: (
    contentFactory: () => ContextMenuContent | null,
    options?: BindContextMenuOptions,
  ) => {
    onMouseDown: (e: React.MouseEvent) => void;
    onContextMenu: (e: React.MouseEvent) => void;
    /**
     * A touch pointer (see `isTouchPointer`): a tap is dispatched as a left click and a
     * press-and-hold opens the menu. A mouse-model press passes through untouched.
     */
    onPointerDownCapture: (e: React.PointerEvent) => void;
  };
  /**
   * Swallows the browser's compatibility mouse events for the touch-pointer press that just
   * ended, after the page handled it itself.
   */
  readonly swallowTouchCompatMouse: () => void;
}

export const ContextMenuContext = createContext<ContextMenuContextType | undefined>(undefined);

export function getContextMenuColors() {
  const borderBase = THEME.colors.borderHighlight;

  return {
    action: THEME.colors.text,
    target: THEME.colors.native.orangeHover,
    background: THEME.colors.background,
    backgroundHover: THEME.colors.primaryDim,
    border: withAlpha(borderBase, 0.5),
    headerText: THEME.colors.native.label,
    headerBackground: THEME.colors.surface,
    separator: withAlpha(borderBase, 0.3),
    disabled: THEME.colors.native.muted,
  };
}
