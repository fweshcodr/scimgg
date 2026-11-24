import { createContext, type ReactNode, useCallback, useContext, useMemo, useState } from 'react';
import {
  DEFAULT_MOBILE_PANEL_MODES,
  type ReplayMobilePanelModes,
  type ReplayPanelPresentation,
  type ReplayPresentationState,
  resolveReplayMobilePanelModes,
} from '../core/replayPresentation';

interface ReplayPresentationContextValue {
  /**
   * The recorder's layout, while replaying a recording that captured one.
   * Non-null means every in-frame component should render the RECORDER's layout,
   * not the viewer's — that is what makes the replayed cursor land on the same
   * thing they were pointing at.
   */
  readonly presentation: ReplayPresentationState | null;
  /**
   * Called by `GamePanel`, which owns both halves of the prayer/spellbook
   * arrangement — the modes in local state, the filters in `usePanelFilters`. App
   * never reads that storage itself: a second `usePanelFilters` up there would be a
   * separate `useState` that never sees the panel's edits, and would record a stale
   * arrangement for the whole run.
   */
  readonly reportPanelPresentation: (panel: ReplayPanelPresentation) => void;
  /**
   * Called by `Minimap`, which owns its zoom:
   * `useState` seeded from a constant, moved by the wheel, persisted nowhere — and it
   * decides which stretch of map a recorded cursor over the minimap is pointing at.
   */
  readonly reportMinimapZoom: (zoom: number) => void;
}

const ReplayPresentationContext = createContext<ReplayPresentationContextValue>({
  presentation: null,
  reportPanelPresentation: () => {},
  reportMinimapZoom: () => {},
});

/**
 * The Mobile side panel and hotkeys bar as they are on screen: the recorder's while a recording
 * owns the panel, else the viewer's as GamePanel last reported them. Split from the main value
 * so a panel toggle re-renders only what places itself around the panel (the Mobile HUD).
 */
const MobilePanelModesContext = createContext<ReplayMobilePanelModes>(DEFAULT_MOBILE_PANEL_MODES);

function sameMobileModes(a: ReplayMobilePanelModes | null, b: ReplayMobilePanelModes | null): boolean {
  if (a === b) return true;
  if (!a || !b) return false;
  return (
    a.panelOpen === b.panelOpen &&
    a.tabsCollapsed === b.tabsCollapsed &&
    a.panelFromHotkey === b.panelFromHotkey &&
    a.hotkeysCollapsed === b.hotkeysCollapsed &&
    a.hotkeysOpenOnLeft === b.hotkeysOpenOnLeft &&
    a.hotkeys.length === b.hotkeys.length &&
    a.hotkeys.every((slot, index) => slot === b.hotkeys[index])
  );
}

export function ReplayPresentationProvider({
  presentation,
  reportPanelPresentation,
  reportMinimapZoom,
  children,
}: {
  readonly presentation: ReplayPresentationState | null;
  readonly reportPanelPresentation: (panel: ReplayPanelPresentation) => void;
  readonly reportMinimapZoom: (zoom: number) => void;
  readonly children: ReactNode;
}) {
  // GamePanel reports its own Mobile state with every panel report; kept here as well, so the
  // Mobile HUD can place itself around the panel without a second report path through App.
  const [liveMobileModes, setLiveMobileModes] = useState<ReplayMobilePanelModes | null>(null);
  const reportPanel = useCallback(
    (panel: ReplayPanelPresentation) => {
      const mobile = panel.modes.mobile ?? null;
      setLiveMobileModes((previous) => (sameMobileModes(previous, mobile) ? previous : mobile));
      reportPanelPresentation(panel);
    },
    [reportPanelPresentation],
  );
  const value = useMemo(
    () => ({ presentation, reportPanelPresentation: reportPanel, reportMinimapZoom }),
    [presentation, reportPanel, reportMinimapZoom],
  );
  const recordedModes = presentation?.variants.panelPresentation?.modes;
  const mobileModes = useMemo(
    () => resolveReplayMobilePanelModes(recordedModes, liveMobileModes ?? DEFAULT_MOBILE_PANEL_MODES),
    [recordedModes, liveMobileModes],
  );
  return (
    <ReplayPresentationContext.Provider value={value}>
      <MobilePanelModesContext.Provider value={mobileModes}>{children}</MobilePanelModesContext.Provider>
    </ReplayPresentationContext.Provider>
  );
}

/** See {@link MobilePanelModesContext}. */
export function useMobilePanelModes(): ReplayMobilePanelModes {
  return useContext(MobilePanelModesContext);
}

/** The recorder's layout to render instead of the viewer's, or null when not replaying one. */
export function useReplayPresentation(): ReplayPresentationState | null {
  return useContext(ReplayPresentationContext).presentation;
}

export function useReportPanelPresentation(): (panel: ReplayPanelPresentation) => void {
  return useContext(ReplayPresentationContext).reportPanelPresentation;
}

export function useReportMinimapZoom(): (zoom: number) => void {
  return useContext(ReplayPresentationContext).reportMinimapZoom;
}

/**
 * The recorder's prayer/spellbook arrangement to render instead of the viewer's, or
 * null when not replaying one. Read by `GamePanel` (modes) and `usePanelFilters`
 * (filters), which is why it is one lookup rather than two.
 */
export function useReplayPanelPresentation(): ReplayPanelPresentation | null {
  return useContext(ReplayPresentationContext).presentation?.variants.panelPresentation ?? null;
}
