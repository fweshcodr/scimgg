import type React from 'react';
import { useCallback, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { TooltipCard } from './TooltipCard';
import { useTooltip, useTooltipDisplay } from './useTooltip';

export const TooltipOverlay: React.FC = () => {
  const { registerTooltipEl } = useTooltip();
  const { content, visible, scale: rawScale, viewerChrome } = useTooltipDisplay();
  // Dampen tooltip scaling: grows at 40% of the UI scale rate
  const scale = viewerChrome ? 1 : 1 + (rawScale - 1) * 0.4;
  const ref = useRef<HTMLDivElement>(null);

  const measuredRef = useCallback(
    (node: HTMLDivElement | null) => {
      (ref as React.MutableRefObject<HTMLDivElement | null>).current = node;
      registerTooltipEl(node);
    },
    [registerTooltipEl],
  );

  useEffect(() => {
    return () => registerTooltipEl(null);
  }, [registerTooltipEl]);

  const lines = visible && content && content.lines.length > 0 ? content.lines : null;

  if (!lines) {
    return null;
  }

  // Viewer controls sit above the recorded workspace; their hints must escape its scale and stacking context.
  const frame = viewerChrome
    ? null
    : (document.querySelector<HTMLElement>('.workspace-presentation-surface') ??
      document.querySelector<HTMLElement>('.game-viewport-frame'));
  return createPortal(
    <TooltipCard
      ref={measuredRef}
      content={{ lines }}
      scale={scale}
      style={{ position: frame ? 'absolute' : 'fixed', left: 0, top: 0, pointerEvents: 'none', zIndex: 99999 }}
    />,
    frame ?? document.body,
  );
};
