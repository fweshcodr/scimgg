/**
 * While Alt is held, outlines each movable panel that another panel covers, so a panel
 * hidden under an overlay can be found and the overlay dragged aside. Drawn in the same
 * frame-local space as the panels, above all of them, and never hit-testable, so it
 * cannot take the Alt drag or Alt wheel from the panel under the pointer.
 */
import type React from 'react';
import { useEffect, useState } from 'react';
import { useModifiers } from '../../input/keyState';
import { framePaintScale } from '../../util/viewportBounds';
import { type StackedPanel, usePanelSnapRegistry } from './PanelSnapRegistry';
import { findCoveredPanels, type OverlapRect, paintedOnTop } from './panelOverlap';
import './OverlapGuideOverlay.css';

interface Guide {
  id: string;
  rect: OverlapRect;
  /** Only when the panel's own nameplate, centered in its box, is under the cover. */
  label: string | undefined;
  overlaps: OverlapRect[];
}

function containsPoint(rect: OverlapRect, x: number, y: number): boolean {
  return x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom;
}

function measureGuides(panels: StackedPanel[]): Guide[] {
  return findCoveredPanels(panels, (a, b, overlap) => {
    // Registry rects are frame-local; the element's own box gives the frame's client offset, and
    // the frame's paint scale (Stretch to Window) takes frame pixels to client pixels.
    const box = a.element.getBoundingClientRect();
    const paint = framePaintScale(a.element);
    const x = box.left + ((overlap.left + overlap.right) / 2 - a.rect.left) * paint.x;
    const y = box.top + ((overlap.top + overlap.bottom) / 2 - a.rect.top) * paint.y;
    return paintedOnTop(a.element, b.element, x, y) === a.element ? a : b;
  }).map(({ panel, overlaps }) => {
    const { rect } = panel;
    const cx = (rect.left + rect.right) / 2;
    const cy = (rect.top + rect.bottom) / 2;
    const nameplateHidden = overlaps.some((overlap) => containsPoint(overlap, cx, cy));
    return { id: rect.id, rect, label: nameplateHidden ? panel.label : undefined, overlaps };
  });
}

function boxStyle(rect: OverlapRect): React.CSSProperties {
  return { left: rect.left, top: rect.top, width: rect.right - rect.left, height: rect.bottom - rect.top };
}

export const OverlapGuideOverlay: React.FC<{ disabled?: boolean }> = ({ disabled = false }) => {
  const registry = usePanelSnapRegistry();
  const { alt } = useModifiers();
  const active = alt && !disabled && registry !== null;
  const [guides, setGuides] = useState<Guide[]>([]);

  useEffect(() => {
    if (!active || !registry) return;
    // Polled while Alt is held: a panel can be dragged, resized or appear mid-hold, and
    // five or so rects a frame is cheaper than wiring every one of those into a signal.
    let frame = 0;
    let lastKey = '';
    const tick = () => {
      const next = measureGuides(registry.getStackedPanels());
      const key = JSON.stringify(next);
      if (key !== lastKey) {
        lastKey = key;
        setGuides(next);
      }
      frame = requestAnimationFrame(tick);
    };
    tick();
    return () => cancelAnimationFrame(frame);
  }, [active, registry]);

  // The last guides stay mounted after Alt is released so they can fade out.
  if (guides.length === 0) return null;

  return (
    // Inline, not in the stylesheet: never being hit-testable is the contract that keeps the
    // Alt drag and Alt wheel on the panel under the pointer.
    <div
      className="overlap-guide-overlay"
      data-visible={active || undefined}
      aria-hidden="true"
      style={{ pointerEvents: 'none' }}
    >
      {guides.map((guide) => (
        <div key={guide.id} className="overlap-guide" data-testid="overlap-guide">
          {guide.overlaps.map((overlap) => (
            <div
              key={`${overlap.left},${overlap.top},${overlap.right},${overlap.bottom}`}
              className="overlap-guide__overlap"
              style={boxStyle(overlap)}
            />
          ))}
          <div className="overlap-guide__outline" style={boxStyle(guide.rect)}>
            {guide.label && <span className="overlap-guide__label">{guide.label}</span>}
          </div>
        </div>
      ))}
    </div>
  );
};
