import React from 'react';
import { THEME } from '../../theme';
import type { TooltipContent } from './tooltipTypes';

interface TooltipCardProps {
  content: TooltipContent;
  /** UI-scale multiplier for the pixel type (default 1). */
  scale?: number;
  /** Positioning / layering overrides merged onto the box (e.g. fixed vs absolute). */
  style?: React.CSSProperties;
}

/**
 * The single source of truth for tooltip chrome so every surface reads identically.
 *
 * Consumed by the global mouse-following `TooltipOverlay` and the tutorial
 * demonstration cursor's label, which is why positioning is left to the caller
 * via `style` and the element ref is forwarded for direct DOM measurement.
 */
export const TooltipCard = React.forwardRef<HTMLDivElement, TooltipCardProps>(({ content, scale = 1, style }, ref) => {
  return (
    <div
      ref={ref}
      style={{
        backgroundColor: THEME.colors.background,
        border: `1px solid ${THEME.colors.border}`,
        boxShadow: '0 2px 8px rgba(0, 0, 0, 0.5)',
        padding: '4px',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'flex-start',
        whiteSpace: 'nowrap',
        ...style,
      }}
    >
      {content.lines.map((line) => (
        <div
          key={`line-${line.spans.map((s) => s.text).join('')}`}
          style={{ lineHeight: `${Math.round(14 * scale)}px` }}
        >
          {line.spans.map((span) => (
            <span
              key={`${span.text}-${span.color}`}
              style={{
                fontFamily: '"RuneScape Plain 11", sans-serif',
                fontSize: `${Math.round(18 * scale)}px`,
                color: span.color,
                textShadow: '1px 1px 0 rgba(0, 0, 0, 0.7)',
              }}
            >
              {span.text}
            </span>
          ))}
        </div>
      ))}
    </div>
  );
});

TooltipCard.displayName = 'TooltipCard';
