import { describe, expect, it } from 'vitest';
import type { PublishedPanelPositions } from '../../components/snap/PanelSnapRegistry';
import { ReplayRecorder } from '../../core/ReplayRecorder';
import { resolveReplayZukSetTimerPosition } from '../../core/replayPresentation';
import { validPresentationSample } from '../../test/helpers/replayFixtures';
import { capturePanelLayout } from '../capturePanelLayout';
import { ReplayPresentationStateSchema } from '../format/presentationFormat';

const base = () => ReplayPresentationStateSchema.parse(validPresentationSample().state);
const point = (x: number, y: number) => ({ x, y, anchorX: 'left' as const, anchorY: 'top' as const });
function snapshot(source: ReturnType<typeof base>): PublishedPanelPositions {
  return new Map(
    ['game-panel', 'minimap', 'infobox-panel', 'zuk-set-timer-overlay'].map((name, i) => [
      name,
      {
        position: point(100 + 50 * i, 75 + 25 * i),
        viewport: source.frame,
      },
    ]),
  );
}

describe('capturePanelLayout', () => {
  it('captures concrete solved targets without modifying settings or the published snapshot', () => {
    const source = base();
    const original = structuredClone(source);
    const positions = snapshot(source);
    const recorded = capturePanelLayout(source, positions)!;
    expect(recorded.panels.gamePanel).toEqual(point(100, 75));
    expect(recorded.panels.zukSetTimer).toEqual(point(250, 150));
    expect(source).toEqual(original);
    expect(ReplayPresentationStateSchema.parse(recorded)).toEqual(recorded);
    expect(resolveReplayZukSetTimerPosition(recorded)).toEqual(point(250, 150));
  });

  it.each([false, true])('records only the mounted minimap/orb variant (compact=%s)', (compactOrbsEnabled) => {
    const source = base();
    source.variants.compactOrbsEnabled = compactOrbsEnabled;
    source.clientLayoutMode = 'modern';
    const recorded = capturePanelLayout(source, snapshot(source))!;
    const active = compactOrbsEnabled ? 'compactOrbs' : 'minimap';
    const inactive = compactOrbsEnabled ? 'minimap' : 'compactOrbs';
    expect(recorded.panels[active]).toEqual(point(150, 100));
    expect(recorded.panels[inactive]).toEqual(source.panels[inactive]);
  });

  it('records the fixed minimap even if the saved compact-orb preference is enabled', () => {
    const source = base();
    source.clientLayoutMode = 'fixed';
    source.variants.compactOrbsEnabled = true;
    expect(capturePanelLayout(source, snapshot(source))!.panels.minimap).toEqual(point(150, 100));
  });

  it.each(['hud', 'inventory', 'free'] as const)('retains unpositioned infobox null for %s', (infoboxPinTarget) => {
    const source = base();
    source.variants.infoboxPinTarget = infoboxPinTarget;
    source.panels.infobox = null;
    expect(capturePanelLayout(source, snapshot(source))!.panels.infobox).toBeNull();
  });

  it.each(['hud', 'inventory'] as const)('does not mistake a %s pin for a saved free infobox', (infoboxPinTarget) => {
    const source = base();
    source.variants.infoboxPinTarget = infoboxPinTarget;
    source.panels.infobox = point(600, 400);
    expect(capturePanelLayout(source, snapshot(source))!.panels.infobox).toBeNull();
  });

  it('captures a positioned free infobox and leaves an absent timer concrete fallback intact', () => {
    const source = base();
    source.variants.infoboxPinTarget = 'free';
    source.panels.infobox = point(600, 400);
    source.panels.zukSetTimer = point(718, 148);
    const positions = new Map(snapshot(source));
    positions.delete('zuk-set-timer-overlay');
    const recorded = capturePanelLayout(source, positions)!;
    expect(recorded.panels.infobox).toEqual(point(200, 125));
    expect(recorded.panels.zukSetTimer).toEqual(point(718, 148));
    // A recording with a null position uses the fixed default-position reader.
    expect(
      resolveReplayZukSetTimerPosition({ ...source, overlayScale: 1, panels: { ...source.panels, zukSetTimer: null } }),
    ).toEqual(point(279, 74));
  });

  it('waits for matching frame metadata rather than recording B positions against frame A', () => {
    const source = base();
    const positions = new Map(snapshot(source));
    positions.set('game-panel', { position: point(500, 300), viewport: { width: 2560, height: 1440 } });
    expect(capturePanelLayout(source, positions)).toBeNull();
  });

  it('preserves recorder deduplication across unchanged solves', () => {
    const source = base();
    const positions = new Map(snapshot(source));
    const recorder = new ReplayRecorder();
    const first = capturePanelLayout(source, positions)!;
    recorder.recordPresentationState(1, 0, first);
    recorder.recordPresentationState(1, 10, capturePanelLayout(source, positions)!);
    expect(recorder.getPresentationTrack()).toHaveLength(1);
    positions.set('game-panel', { position: point(400, 300), viewport: source.frame });
    recorder.recordPresentationState(1, 20, capturePanelLayout(source, positions)!);
    expect(recorder.getPresentationTrack()).toHaveLength(2);
  });
});
