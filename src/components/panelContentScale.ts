import { createContext, useContext } from 'react';
import { TooltipScaleContext } from './Tooltip/tooltipTypes';

/**
 * The zoom a `DraggablePanel` actually applied to its content.
 *
 * Not always the global UI scale: a pinned panel is sized from a snapped
 * frame-space rect, so it zooms by whatever covers that box (see `physicalSize`).
 * Anything inverting a pointer coordinate or sizing a raster buffer has to use
 * the applied factor, or it works in a space the panel is not drawn in.
 */
const PanelContentScaleContext = createContext<number | null>(null);

export const PanelContentScaleProvider = PanelContentScaleContext.Provider;

export function usePanelContentScale(): number {
  const applied = useContext(PanelContentScaleContext);
  // Read the context rather than `useTooltipScale`, which throws without a provider:
  // a panel that supplies its own zoom must not also require the tooltip tree.
  const uiScale = useContext(TooltipScaleContext);
  const scale = applied ?? uiScale;
  if (scale === undefined) {
    throw new Error('usePanelContentScale must be used within a DraggablePanel or TooltipProvider');
  }
  return scale;
}

/**
 * Same factor, but `null` outside both providers, for sprites that also render in chrome
 * that has neither — they fall back to their own default rather than failing to render.
 */
export function usePanelContentScaleOrNull(): number | null {
  const applied = useContext(PanelContentScaleContext);
  const uiScale = useContext(TooltipScaleContext);
  return applied ?? uiScale ?? null;
}
