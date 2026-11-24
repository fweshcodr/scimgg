/**
 * HintBar — keybind helper that surfaces the panel-adjustment shortcuts while
 * Alt is held.
 *
 * Still subscribes to PANEL_DRAG_START_EVENT / PANEL_DRAG_END_EVENT as a
 * fallback so the helper remains visible if a drag starts before this
 * component observes the Alt keydown.
 *
 * Always renders to the DOM so the exit animation can play; visibility is
 * driven by the `data-visible` attribute and CSS transitions.
 */
import type React from 'react';
import { useEffect, useState } from 'react';
import { isEditableTarget, useModifiers } from '../../input/keyState';
import { PANEL_DRAG_END_EVENT, PANEL_DRAG_START_EVENT } from '../DraggablePanel';
import './HintBar.css';

interface ShortcutHint {
  /** Key combo as it should be read in the chip — full form. */
  keys: string;
  /** Compact key string for narrow viewports (e.g. "Alt+RClick" for "Alt + Right Click"). */
  keysCompact: string;
  /** Action the keys perform. Sentence-cased, no trailing period. */
  label: string;
  /** Shorter action label used when the viewport cannot afford full copy. */
  labelCompact: string;
}

const HINTS: readonly ShortcutHint[] = [
  { keys: 'Alt + Drag', keysCompact: 'Alt+Drag', label: 'Move', labelCompact: 'Move' },
  { keys: 'Alt + Scroll', keysCompact: 'Alt+Scroll', label: 'Resize', labelCompact: 'Size' },
  { keys: 'Alt + Right Click', keysCompact: 'Alt+RClick', label: 'Reset position', labelCompact: 'Reset pos' },
  { keys: 'Alt + Middle Click', keysCompact: 'Alt+MClick', label: 'Reset scale', labelCompact: 'Reset scale' },
  { keys: 'Alt + Shift', keysCompact: 'Alt+Shift', label: 'Snap to panels', labelCompact: 'Snap' },
];

function isModifierKey(key: string): boolean {
  return key === 'Alt' || key === 'Shift' || key === 'Control' || key === 'Meta';
}

interface HintBarProps {
  /**
   * How far the sidebars reach over the frame from its left and right edges (Grid's viewport
   * insets): the bar centers in, and sizes its form to, the part of the frame left visible.
   */
  readonly insets?: { readonly left: number; readonly right: number };
}

export const HintBar: React.FC<HintBarProps> = ({ insets }) => {
  const altHeld = useModifiers().alt;
  const [dragging, setDragging] = useState(false);
  const visible = altHeld || dragging;

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      // Alt is UI-layout mode in this app. Prevent browser Alt+key shortcuts
      // like Alt+D focusing the address bar while the game surface has focus.
      // Keep editable fields untouched, and don't block modifier-only chords
      // (Alt alone, Alt+Shift for snap mode, OS-level Alt+Tab/Alt+F4, etc.).
      if (e.altKey && !isModifierKey(e.key) && !isEditableTarget(e.target)) {
        e.preventDefault();
        e.stopPropagation();
      }
    };
    const onStart = () => setDragging(true);
    const onEnd = () => setDragging(false);

    window.addEventListener('keydown', onKeyDown, true);
    window.addEventListener(PANEL_DRAG_START_EVENT, onStart);
    window.addEventListener(PANEL_DRAG_END_EVENT, onEnd);
    return () => {
      window.removeEventListener('keydown', onKeyDown, true);
      window.removeEventListener(PANEL_DRAG_START_EVENT, onStart);
      window.removeEventListener(PANEL_DRAG_END_EVENT, onEnd);
    };
  }, []);

  return (
    <div
      className="hint-bar-anchor"
      data-visible={visible || undefined}
      aria-hidden={!visible}
      style={insets ? { left: insets.left, right: insets.right } : undefined}
    >
      {/* No `role="status"`: the bar's content is static (HINTS never change),
         so a live region would offer nothing on update and would risk SR
         users hearing all five shortcuts read out every time Alt is held.
         An aria-label keeps the helper discoverable for users who explicitly
         query the region without forcing announcements. */}
      {/* `role="group"` rather than a bare div: a generic role does not expose
         aria-label to assistive tech, so the label above would be dropped. */}
      {/* biome-ignore lint/a11y/useSemanticElements: a fieldset's UA box fights the chip row layout. */}
      <div className="hint-bar" role="group" aria-label="UI panel layout shortcuts">
        <span className="hint-bar__scope" aria-hidden="true">
          UI layout
        </span>
        <ul className="hint-bar__chips">
          {HINTS.map((hint) => (
            <li key={hint.keys} className="hint-bar__chip">
              <kbd className="hint-bar__keys">
                <span className="hint-bar__keys-full">{hint.keys}</span>
                <span className="hint-bar__keys-short">{hint.keysCompact}</span>
              </kbd>
              <span className="hint-bar__label">
                <span className="hint-bar__label-full">{hint.label}</span>
                <span className="hint-bar__label-short">{hint.labelCompact}</span>
              </span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
};
