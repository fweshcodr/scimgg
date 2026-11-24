import { type RefObject, useEffect } from 'react';
import { type PanelRect, usePanelSnapRegistry } from './PanelSnapRegistry';

/**
 * Read live bounds only during snapping. Owners must disable targets that stay
 * laid out while hidden, such as navigation tucked behind an open sidebar.
 */
export function usePassiveSnapTarget(id: string, targetRef: RefObject<HTMLElement | null>, enabled = true): void {
  const registry = usePanelSnapRegistry();

  useEffect(() => {
    if (!registry || !enabled) return;
    const getRect = (): PanelRect | null => {
      const element = targetRef.current;
      if (!element) return null;
      const origin = registry.getFrameOrigin();
      if (!origin) return null;
      const rect = element.getBoundingClientRect();
      if (rect.width <= 0 || rect.height <= 0) return null;
      const scaleX = origin.scaleX ?? 1;
      const scaleY = origin.scaleY ?? 1;
      return {
        id,
        left: (rect.left - origin.left) / scaleX,
        top: (rect.top - origin.top) / scaleY,
        right: (rect.right - origin.left) / scaleX,
        bottom: (rect.bottom - origin.top) / scaleY,
      };
    };
    return registry.registerPanel(id, getRect);
  }, [registry, id, enabled, targetRef]);
}
