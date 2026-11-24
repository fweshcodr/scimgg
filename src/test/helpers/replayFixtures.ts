/**
 * Shared recording fixtures for the replay tests.
 *
 * The presentation state is the reason this is not inlined per test file: the
 * schema requires the complete `ReplayPresentationState`, because playback casts
 * a parsed sample into that trusted type and dereferences every field of it. A
 * short hand-written stand-in can slip through validation and reach the viewer
 * as a crash, so there is exactly one valid copy and the
 * tests that need an INVALID one derive it from this.
 */

const PANEL_POSITION = { x: 0, y: 0, anchorX: 'right', anchorY: 'bottom' } as const;

export function validPresentationSample(tMs = 0) {
  return {
    tMs,
    state: {
      clientLayoutMode: 'modern',
      frame: { width: 1280, height: 720 },
      insets: { left: 0, right: 0 },
      uiScale: 1,
      panels: {
        gamePanel: { ...PANEL_POSITION },
        minimap: { ...PANEL_POSITION, anchorY: 'top' },
        compactOrbs: { ...PANEL_POSITION, anchorY: 'top', y: 60 },
        infobox: null,
        zukSetTimer: null,
      },
      variants: {
        activeGamePanelTab: 'inventory',
        compactOrbsEnabled: false,
        compactOrbsLayout: 'vertical',
        compactOrbsOrder: ['hitpoints', 'prayer', 'run', 'special'],
        infoboxPinTarget: 'inventory',
        showCoordinates: false,
      },
    },
  };
}
