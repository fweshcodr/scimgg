import { createContext, type ReactNode, useContext } from 'react';
import type { GridProps } from '../components/Grid';

export type SettingsGridContextValue = Pick<
  GridProps,
  | 'areaVolume'
  | 'brightness'
  | 'contrast'
  | 'gamePanelPosition'
  | 'masterVolume'
  | 'muteWhenUnfocused'
  | 'onMuteWhenUnfocusedChange'
  | 'minimapPosition'
  | 'compactOrbsPosition'
  | 'infoboxPosition'
  | 'infoboxPinTarget'
  | 'onGamePanelPositionChange'
  | 'onMinimapPositionChange'
  | 'onCompactOrbsPositionChange'
  | 'onInfoboxPositionChange'
  | 'onUiScaleChange'
  | 'onVolumeChange'
  | 'renderScale'
  | 'fpsCap'
  | 'rendererType'
  | 'saturation'
  | 'sfxVolume'
  | 'showCoordinates'
  | 'showTickCounter'
  | 'showTickCounterInfobox'
  | 'showTickCounterOverhead'
  | 'smoothTerrain'
  | 'tileGrid'
  | 'speedMultiplier'
  | 'tickCounterAbovePrayerIcon'
  | 'tickCounterColors'
  | 'tickCounterOffsetX'
  | 'tickCounterOffsetY'
  | 'tickCounterFontSize'
  | 'tickCounterMax'
  | 'uiInsets'
  | 'viewportInsets'
  | 'uiScale'
  | 'viewportOffsetX'
> & {
  /** Context creation choice, fixed for the page; preference changes take effect after reload. */
  antialias: boolean;
};

const SettingsContext = createContext<SettingsGridContextValue | null>(null);

export function SettingsProvider({ children, value }: { children: ReactNode; value: SettingsGridContextValue }) {
  return <SettingsContext.Provider value={value}>{children}</SettingsContext.Provider>;
}

export function useSettingsContext(): SettingsGridContextValue | null {
  return useContext(SettingsContext);
}
