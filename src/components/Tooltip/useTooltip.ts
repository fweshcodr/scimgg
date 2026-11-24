import { useContext } from 'react';
import {
  TooltipAPIContext,
  TooltipDisplayContext,
  TooltipScaleContext,
  TooltipScaleLockedContext,
} from './tooltipTypes';

/**
 * Uses the stable API context — subscribing to this NEVER causes re-renders
 * from tooltip content/visibility changes.
 */
export const useTooltip = () => {
  const context = useContext(TooltipAPIContext);
  if (context === undefined) {
    throw new Error('useTooltip must be used within a TooltipProvider');
  }
  return context;
};

/**
 * Hook for TooltipOverlay only — subscribes to display state (content, visible).
 * Changes to these values ONLY re-render the overlay, not the entire app.
 */
export const useTooltipDisplay = () => {
  const context = useContext(TooltipDisplayContext);
  if (context === undefined) {
    throw new Error('useTooltipDisplay must be used within a TooltipProvider');
  }
  return context;
};

/**
 * Hook for components that RENDER from the live UI scale (panels, scaled
 * content). Subscribing re-renders on every Alt+scroll resize step, so
 * bindTooltip-only consumers should stick to useTooltip() — its value is
 * fully stable and never re-renders them.
 */
export const useTooltipScale = (): number => {
  const scale = useContext(TooltipScaleContext);
  if (scale === undefined) {
    throw new Error('useTooltipScale must be used within a TooltipProvider');
  }
  return scale;
};

export const useTooltipScaleLocked = (): boolean => useContext(TooltipScaleLockedContext);
