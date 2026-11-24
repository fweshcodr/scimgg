import type { PublishedPanelPositions } from '../components/snap/PanelSnapRegistry';
import type { ReplayPresentationPanels, ReplayPresentationState } from '../core/replayPresentation';

/** Replace settings offsets with the targets from the registry's last complete
 * solve. Never sample the DOM: it may still be animating towards these targets.
 * Null means frame metadata and the solver have not yet reached the same resize. */
export function capturePanelLayout(
  source: ReplayPresentationState,
  positions: PublishedPanelPositions,
): ReplayPresentationState | null {
  const panels = { ...source.panels };
  const names: Array<[keyof ReplayPresentationPanels, string]> = [
    ['gamePanel', 'game-panel'],
    // The minimap component renders one of these two mutually exclusive surfaces.
    [source.clientLayoutMode !== 'fixed' && source.variants.compactOrbsEnabled ? 'compactOrbs' : 'minimap', 'minimap'],
    ['zukSetTimer', 'zuk-set-timer-overlay'],
  ];
  if (source.variants.infoboxPinTarget !== 'free') panels.infobox = null;
  else if (source.panels.infobox !== null) names.push(['infobox', 'infobox-panel']);
  // An unpositioned infobox remains null: playback derives it from the recorded
  // host/pin mode. A timer instead keeps the caller's concrete default fallback
  // until mounted; old-recording null interpretation remains in its replay reader.
  for (const [key, name] of names) {
    const solved = positions.get(name);
    if (!solved) continue;
    if (solved.viewport.width !== source.frame.width || solved.viewport.height !== source.frame.height) return null;
    panels[key] = solved.position;
  }
  return { ...source, panels };
}
