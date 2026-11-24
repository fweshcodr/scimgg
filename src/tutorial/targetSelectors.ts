import type { GamePanelTab } from '../hooks/keybindStore';
import type { PrayerType } from '../types/simulation';

/**
 * The DOM contract between tutorial targeting and live UI. Producers set these
 * `data-*` attributes (the game-panel tab buttons in GamePanel, the prayer
 * buttons in PrayerContent); consumers query them (the demo-cursor resolver in
 * cursorTargets.ts and the Driver.js onboarding spotlight steps). Centralized so
 * a rename can't silently desync producer and consumer, and so onboarding gets
 * type-checked tab names instead of raw selector strings.
 *
 * Types only, no DOM/React imports, so both the component and content layers
 * can import it.
 */
export const TUTORIAL_TARGET_ATTR = {
  panelTab: 'data-tab',
  prayer: 'data-prayer',
  active: 'data-active',
  /**
   * On the menu's entries (App.tsx `navItems`), in the desktop Menu pane and the Mobile Menu tab
   * alike.
   */
  menuItem: 'data-menu-item',
} as const;

/**
 * What opens Settings: the menu's first row, in the desktop top chrome's Menu pane (a tour pins
 * it open) or the Mobile Menu tab. Never a control tucked away under an open drawer.
 */
export const settingsButtonSelector = (): string =>
  [
    `.top-chrome__item:not([data-tucked="true"]) .launcher-menu [${TUTORIAL_TARGET_ATTR.menuItem}="settings"]`,
    `.sidebar-nav:not(.sidebar-nav--tucked) [${TUTORIAL_TARGET_ATTR.menuItem}="settings"]`,
  ].join(', ');

export const panelTabSelector = (tab: GamePanelTab): string => `[${TUTORIAL_TARGET_ATTR.panelTab}="${tab}"]`;

export const activePanelTabSelector = (tab: GamePanelTab): string =>
  `${panelTabSelector(tab)}[${TUTORIAL_TARGET_ATTR.active}]`;

export const prayerSelector = (prayer: PrayerType): string => `[${TUTORIAL_TARGET_ATTR.prayer}="${prayer}"]`;
