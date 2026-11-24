import type React from 'react';
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { ESC_PRIORITY, useEscapeLayer } from '../hooks/useEscapeLayer';
import type { Coordinate } from '../types/simulation';
import { getGameViewportBounds } from '../util/viewportBounds';
import './TileMarkerLabelEditor.css';
import './ui/OsrsButton.css';
import { isPhoneSheet, sheet } from './ui/mobileSheet';

interface TileMarkerLabelEditorProps {
  isOpen: boolean;
  tile: Coordinate | null;
  anchor: { x: number; y: number } | null;
  initialLabel: string | undefined;
  onApply: (label: string | undefined) => void;
  onCancel: () => void;
}

export const TileMarkerLabelEditor: React.FC<TileMarkerLabelEditorProps> = ({
  isOpen,
  tile,
  anchor,
  initialLabel,
  onApply,
  onCancel,
}) => {
  const [label, setLabel] = useState(initialLabel ?? '');
  const panelRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!isOpen) return;
    setLabel(initialLabel ?? '');
  }, [isOpen, initialLabel]);

  useEffect(() => {
    if (isOpen && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [isOpen]);

  useEscapeLayer(ESC_PRIORITY.COLOR_PICKER, isOpen, onCancel);

  useEffect(() => {
    if (!isOpen) return;
    const onMouseDown = (event: MouseEvent) => {
      if (!panelRef.current) return;
      if (event.target instanceof Node && panelRef.current.contains(event.target)) {
        return;
      }
      onCancel();
    };
    window.addEventListener('mousedown', onMouseDown);
    return () => {
      window.removeEventListener('mousedown', onMouseDown);
    };
  }, [isOpen, onCancel]);

  useLayoutEffect(() => {
    if (!isOpen || !anchor || !panelRef.current) return;

    const applyPosition = () => {
      const panel = panelRef.current;
      if (!panel) return;
      // A phone's keyboard covers the lower half of a landscape screen, so there the editor
      // docks at the top center (TileMarkerLabelEditor.css) instead of beside its tile.
      if (isPhoneSheet()) {
        panel.style.left = '';
        panel.style.top = '';
        return;
      }
      const panelRect = panel.getBoundingClientRect();
      const bounds = getGameViewportBounds();
      const viewportPadding = 8;
      const left = Math.max(
        bounds.left + viewportPadding,
        Math.min(anchor.x, bounds.right - panelRect.width - viewportPadding),
      );
      const top = Math.max(
        bounds.top + viewportPadding,
        Math.min(anchor.y, bounds.bottom - panelRect.height - viewportPadding),
      );
      panel.style.left = `${left}px`;
      panel.style.top = `${top}px`;
    };

    applyPosition();
    // Re-clamp on window resize so the editor doesn't end up clipped if
    // the viewport shrinks or the fixed-resolution frame changes while
    // the editor is open.
    window.addEventListener('resize', applyPosition);
    return () => window.removeEventListener('resize', applyPosition);
  }, [isOpen, anchor]);

  if (!isOpen || !anchor || !tile) return null;

  const handleApply = () => {
    const trimmed = label.trim();
    onApply(trimmed.length > 0 ? trimmed : undefined);
  };

  const handleClear = () => {
    onApply(undefined);
  };

  return createPortal(
    <div className="tile-marker-label-backdrop">
      <div className="tile-marker-label-editor" {...sheet.popover} ref={panelRef}>
        <div className="tile-marker-label-header">
          <div className="tile-marker-label-title">Tile Label</div>
          <div className="tile-marker-label-subtitle">
            Tile [{tile[0]}, {tile[1]}]
          </div>
        </div>

        <div className="tile-marker-label-body">
          <input
            ref={inputRef}
            className="tile-marker-label-input"
            type="text"
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                handleApply();
              }
            }}
            placeholder="Enter label..."
            autoComplete="off"
            spellCheck={false}
          />

          {initialLabel && (
            <button type="button" className="tile-marker-label-clear" onClick={handleClear}>
              Clear existing label
            </button>
          )}
        </div>

        <div className="tile-marker-label-footer" {...sheet.foot}>
          <button type="button" className="osrs-btn osrs-btn--primary" onClick={handleApply}>
            Apply
          </button>
          <button type="button" className="osrs-btn osrs-btn--default" onClick={onCancel}>
            Cancel
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
};
