import { describe, expect, it } from 'vitest';
import { osmChromeLayout, osmChromeScale, osmSidePanelOnLeft } from '../../layout/osmClientLayout';
import { osmFrame } from '../../layout/osmFrame';
import {
  computeReplayPresentationLayout,
  DEFAULT_MOBILE_PANEL_MODES,
  playbackClientLayoutMode,
  presentationStateAt,
  type ReplayMobilePanelModes,
  type ReplayPanelPresentation,
  type ReplayPresentationSample,
  type ReplayPresentationState,
  replayPresentationStatesEqual,
  resolveReplayChatboxVisible,
  resolveReplayMobileChromeScale,
  resolveReplayMobilePanelModes,
  resolveReplaySafeAreaInsets,
  resolveReplayZukSetTimerPosition,
} from '../replayPresentation';

const POSITION = { x: 0, y: 0, anchorX: 'right', anchorY: 'bottom' } as const;

function makePanelPresentation(): ReplayPanelPresentation {
  return {
    filters: {
      prayer: {
        hidden: [],
        order: ['Rigour', 'Piety'],
        filterOptions: { showLowerTiers: true, showTieredOverMultiskill: true, showRapidHealing: true },
      },
      spellbook: { hidden: {}, order: {}, activeCategories: ['combat', 'teleport', 'utility'], filterOptions: {} },
    },
    modes: { prayerReordering: false, prayerFiltering: false, spellReordering: false, spellFiltering: false },
  };
}

function makeState(overrides: Partial<ReplayPresentationState> = {}): ReplayPresentationState {
  return {
    clientLayoutMode: 'modern',
    frame: { width: 1280, height: 720 },
    insets: { left: 0, right: 0 },
    uiScale: 1,
    panels: {
      gamePanel: POSITION,
      minimap: { ...POSITION, anchorY: 'top' },
      compactOrbs: { ...POSITION, anchorY: 'top', y: 60 },
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
    ...overrides,
  };
}

describe('resolveReplayChatboxVisible', () => {
  function stateWith(
    clientLayoutMode: 'fixed' | 'modern' | 'classic',
    flags: { fixedChatboxVisible?: boolean; resizableChatboxVisible?: boolean },
  ): ReplayPresentationState {
    const base = makeState({ clientLayoutMode });
    return { ...base, variants: { ...base.variants, ...flags } };
  }

  it('uses the viewer own setting when nothing is playing', () => {
    expect(resolveReplayChatboxVisible(null, true)).toBe(true);
    expect(resolveReplayChatboxVisible(null, false)).toBe(false);
  });

  it('draws the chatbox the recording had, not the one the viewer prefers', () => {
    // The flag picks the scene rectangle, so the viewer winning here would replay
    // every recorded cursor sample against a scene of a different height.
    expect(resolveReplayChatboxVisible(stateWith('fixed', { fixedChatboxVisible: false }), true)).toBe(false);
    expect(resolveReplayChatboxVisible(stateWith('fixed', { fixedChatboxVisible: true }), false)).toBe(true);
  });

  it('reads an absent flag as the taller, chatbox-less scene', () => {
    expect(resolveReplayChatboxVisible(stateWith('fixed', {}), true)).toBe(false);
  });

  it("reads a resizable recording's own flag, not the fixed one", () => {
    // A resizable recording without its own flag may carry `fixedChatboxVisible: true` from the
    // shared setting while drawing no chatbox in Modern or Classic; honoring it would grow one over
    // their recorded panels.
    expect(resolveReplayChatboxVisible(stateWith('modern', { fixedChatboxVisible: true }), true)).toBe(false);
    for (const layout of ['modern', 'classic'] as const) {
      expect(resolveReplayChatboxVisible(stateWith(layout, { resizableChatboxVisible: true }), false)).toBe(true);
      expect(resolveReplayChatboxVisible(stateWith(layout, { resizableChatboxVisible: false }), true)).toBe(false);
    }
  });
});

describe('resolveReplayZukSetTimerPosition', () => {
  it('draws a null position at the replay default rather than the live default', () => {
    expect(resolveReplayZukSetTimerPosition(makeState())).toEqual({
      x: 279,
      y: 74,
      anchorX: 'left',
      anchorY: 'top',
    });
  });

  it('scales the null-position default by the recorded overlay size', () => {
    expect(resolveReplayZukSetTimerPosition(makeState({ overlayScale: 2 }))).toMatchObject({ x: 558, y: 148 });
  });

  it('never rescales a concrete recorded position', () => {
    const state = makeState({ overlayScale: 2 });
    const position = { x: 718, y: 148, anchorX: 'left', anchorY: 'top' } as const;
    expect(resolveReplayZukSetTimerPosition({ ...state, panels: { ...state.panels, zukSetTimer: position } })).toBe(
      position,
    );
  });
});

describe('computeReplayPresentationLayout', () => {
  it('renders at the recorded size, untransformed, when the viewer has the room', () => {
    const layout = computeReplayPresentationLayout({ width: 1280, height: 720 }, 1920, 1080);

    // Then it is NOT upscaled — the frame stays native and needs no transform,
    // which keeps the canvas at its own backing resolution.
    expect(layout.scale).toBe(1);
    expect(layout.displayWidth).toBe(1280);
    expect(layout.displayHeight).toBe(720);
    expect(layout.offsetX).toBe(320);
    expect(layout.offsetY).toBe(180);
  });

  it('downscales uniformly and letterboxes when the viewer has less room', () => {
    const layout = computeReplayPresentationLayout({ width: 1920, height: 1080 }, 1280, 800);

    expect(layout.scale).toBeCloseTo(2 / 3, 10);
    expect(layout.displayWidth).toBeCloseTo(1280, 10);
    expect(layout.displayHeight).toBeCloseTo(720, 10);
    expect(layout.offsetX).toBeCloseTo(0, 10);
    expect(layout.offsetY).toBeCloseTo(40, 10);
  });

  it('maps a recorded point onto the same place at either scale', () => {
    const frame = { width: 1920, height: 1080 };
    const recordedPoint = { x: 1728, y: 972 }; // 90% across, 90% down

    const native = computeReplayPresentationLayout(frame, 1920, 1080);
    const shrunk = computeReplayPresentationLayout(frame, 1280, 800);

    const nativeClient = {
      x: native.offsetX + recordedPoint.x * native.scale,
      y: native.offsetY + recordedPoint.y * native.scale,
    };
    const shrunkClient = {
      x: shrunk.offsetX + recordedPoint.x * shrunk.scale,
      y: shrunk.offsetY + recordedPoint.y * shrunk.scale,
    };

    expect((nativeClient.x - native.offsetX) / native.displayWidth).toBeCloseTo(0.9, 10);
    expect((shrunkClient.x - shrunk.offsetX) / shrunk.displayWidth).toBeCloseTo(0.9, 10);
    expect((shrunkClient.y - shrunk.offsetY) / shrunk.displayHeight).toBeCloseTo(0.9, 10);
  });

  it('does not divide by a zero-sized frame', () => {
    expect(computeReplayPresentationLayout({ width: 0, height: 0 }, 800, 600).scale).toBe(1);
  });
});

describe('presentationStateAt', () => {
  const first = makeState();
  const second = makeState({ uiScale: 1.2 });
  const samples: readonly ReplayPresentationSample[] = [
    { tMs: 0, state: first },
    { tMs: 5_000, state: second },
  ];

  it('step-holds rather than interpolating between layouts', () => {
    // A half-applied layout is a layout that never existed, so the earlier one
    // holds right up to the moment the change was recorded.
    expect(presentationStateAt(samples, 0)).toBe(first);
    expect(presentationStateAt(samples, 4_999)).toBe(first);
    expect(presentationStateAt(samples, 5_000)).toBe(second);
    expect(presentationStateAt(samples, 60_000)).toBe(second);
  });

  it('clamps before the first sample and reports nothing for an empty track', () => {
    expect(presentationStateAt(samples, -1)).toBe(first);
    expect(presentationStateAt([], 100)).toBeNull();
  });
});

describe('replayPresentationStatesEqual', () => {
  const workspace = { width: 1280, height: 720 } as const;

  it.each([
    { ...workspace, width: 1600 },
    { ...workspace, height: 800 },
  ])('detects a changed workspace field: %j', (changed) => {
    const original = makeState({ workspace });

    expect(replayPresentationStatesEqual(original, makeState({ workspace: changed }))).toBe(false);
  });

  it('deduplicates equal workspace geometry while distinguishing its absence', () => {
    const state = makeState({ workspace });

    expect(replayPresentationStatesEqual(state, structuredClone(state))).toBe(true);
    expect(replayPresentationStatesEqual(state, makeState())).toBe(false);
  });

  it('treats an unchanged layout as not worth recording again', () => {
    expect(replayPresentationStatesEqual(makeState(), makeState())).toBe(true);
  });

  it.each([
    ['frame size', makeState({ frame: { width: 1281, height: 720 } })],
    ['sidebar overlap', makeState({ insets: { left: 320, right: 0 } })],
    ['ui scale', makeState({ uiScale: 1.05 })],
    ['overlay scale', makeState({ overlayScale: 1.5 })],
  ])('detects a change of %s', (_label, changed) => {
    expect(replayPresentationStatesEqual(makeState(), changed)).toBe(false);
  });

  it('detects a moved panel', () => {
    const moved = makeState();
    expect(
      replayPresentationStatesEqual(makeState(), {
        ...moved,
        panels: { ...moved.panels, gamePanel: { ...POSITION, x: 40 } },
      }),
    ).toBe(false);
  });

  it('detects overlay resize steps and deduplicates unchanged recorded scales', () => {
    const state = makeState({ overlayScale: 1.5 });
    expect(replayPresentationStatesEqual(state, structuredClone(state))).toBe(true);
    expect(replayPresentationStatesEqual(state, { ...state, overlayScale: 2 })).toBe(false);
    expect(replayPresentationStatesEqual(state, makeState())).toBe(false);
  });

  it('detects an active game-panel tab change', () => {
    const base = makeState();
    expect(
      replayPresentationStatesEqual(base, { ...base, variants: { ...base.variants, activeGamePanelTab: 'prayer' } }),
    ).toBe(false);
  });

  it('detects a reordered compact-orb row', () => {
    const base = makeState();
    expect(
      replayPresentationStatesEqual(base, {
        ...base,
        variants: { ...base.variants, compactOrbsOrder: ['prayer', 'hitpoints', 'run', 'special'] },
      }),
    ).toBe(false);
  });

  it('detects a reordered prayer panel, which moves every icon under the cursor', () => {
    const base = makeState();
    expect(
      replayPresentationStatesEqual(base, {
        ...base,
        variants: { ...base.variants, panelPresentation: makePanelPresentation() },
      }),
    ).toBe(false);
  });

  it('detects a mode change, which shows icons the recorded filters had hidden', () => {
    const withPanel = {
      ...makeState(),
      variants: { ...makeState().variants, panelPresentation: makePanelPresentation() },
    };
    expect(
      replayPresentationStatesEqual(withPanel, {
        ...withPanel,
        variants: {
          ...withPanel.variants,
          panelPresentation: {
            ...makePanelPresentation(),
            modes: { ...makePanelPresentation().modes, prayerReordering: true },
          },
        },
      }),
    ).toBe(false);
  });

  // The dedupe path: without it every unrelated render would push another sample.
  it('treats a separately-built but identical panel arrangement as unchanged', () => {
    const base = makeState();
    const a = { ...base, variants: { ...base.variants, panelPresentation: makePanelPresentation() } };
    const b = { ...base, variants: { ...base.variants, panelPresentation: makePanelPresentation() } };
    expect(replayPresentationStatesEqual(a, b)).toBe(true);
  });
});

describe('client layout across recording and playback', () => {
  it("reproduces the recorder's layout on desktop, Mobile included", () => {
    expect(playbackClientLayoutMode('modern', 'fixed', false)).toBe('fixed');
    expect(playbackClientLayoutMode('mobile', 'classic', false)).toBe('classic');
    expect(playbackClientLayoutMode('classic', undefined, false)).toBe('classic');
    for (const own of ['fixed', 'classic', 'modern', 'mobile'] as const) {
      expect(playbackClientLayoutMode(own, 'mobile', false)).toBe('mobile');
    }
  });

  it('keeps a phone or tablet on the mobile layout, whatever the recording used', () => {
    for (const recorded of ['fixed', 'classic', 'modern', 'mobile', undefined] as const) {
      expect(playbackClientLayoutMode('mobile', recorded, true)).toBe('mobile');
    }
  });
});

describe('Mobile chrome while a recording is on screen', () => {
  const RECORDER_INSETS = { top: 0, right: 34, bottom: 21, left: 47 };
  const VIEWER_INSETS = { top: 0, right: 0, bottom: 12, left: 0 };
  // The recorder at the default 400% on an 844x390 iPhone; the viewer at 175% on a DPR 3 phone.
  const RECORDER_SCALE = osmChromeScale({
    interfaceScaling: 400,
    devicePixelRatio: 3,
    viewport: { width: 844, height: 390 },
    safeAreaInsets: RECORDER_INSETS,
  });
  const VIEWER_SCALE = osmChromeScale({
    interfaceScaling: 175,
    devicePixelRatio: 3,
    viewport: { width: 844, height: 390 },
    safeAreaInsets: VIEWER_INSETS,
  });
  const mobileRecording = makeState({
    clientLayoutMode: 'mobile',
    safeAreaInsets: RECORDER_INSETS,
    mobileChromeScale: RECORDER_SCALE,
    frame: { width: 844, height: 390 },
  });

  it("lays the chrome out in the recorder's safe area, not the viewer's", () => {
    expect(resolveReplaySafeAreaInsets(mobileRecording, VIEWER_INSETS)).toBe(RECORDER_INSETS);
    // Live, and under a recording that has none, the viewer's own.
    expect(resolveReplaySafeAreaInsets(null, VIEWER_INSETS)).toBe(VIEWER_INSETS);
    expect(resolveReplaySafeAreaInsets(makeState(), VIEWER_INSETS)).toBe(VIEWER_INSETS);
  });

  it("draws the chrome at the recorder's scale, not the viewer's", () => {
    expect(RECORDER_SCALE).not.toBe(VIEWER_SCALE);
    expect(resolveReplayMobileChromeScale(mobileRecording, VIEWER_SCALE)).toBe(RECORDER_SCALE);
    // Live, and under a recording that has none, the viewer's own.
    expect(resolveReplayMobileChromeScale(null, VIEWER_SCALE)).toBe(VIEWER_SCALE);
    expect(resolveReplayMobileChromeScale(makeState(), VIEWER_SCALE)).toBe(VIEWER_SCALE);
  });

  it('rebuilds the gameframe and its chrome from the recorded frame data alone', () => {
    // What the recorder's Grid laid out: its own frame, its own notch, its rail collapsed and
    // the panel opened from a hotkey onto the left.
    const recorderModes: ReplayMobilePanelModes = {
      panelOpen: true,
      tabsCollapsed: true,
      panelFromHotkey: true,
      hotkeysCollapsed: false,
      hotkeysOpenOnLeft: true,
      hotkeys: [6, 8, 9, 21, 23],
    };
    const chromeOf = (frame: ReturnType<typeof osmFrame>, modes: typeof recorderModes) =>
      osmChromeLayout(
        frame.size,
        modes.tabsCollapsed,
        osmSidePanelOnLeft(modes.panelFromHotkey, modes.hotkeysOpenOnLeft),
      );
    const recorderFrame = osmFrame(mobileRecording.frame, RECORDER_INSETS, RECORDER_SCALE);

    // What playback derives on any device, from the recording and the viewer's own state.
    const viewerModes = { ...DEFAULT_MOBILE_PANEL_MODES, hotkeysOpenOnLeft: false };
    const modes = resolveReplayMobilePanelModes(
      { ...makePanelPresentation().modes, mobile: recorderModes },
      viewerModes,
    );
    const playbackFrame = osmFrame(
      mobileRecording.frame,
      resolveReplaySafeAreaInsets(mobileRecording, VIEWER_INSETS),
      resolveReplayMobileChromeScale(mobileRecording, VIEWER_SCALE),
    );

    expect(playbackFrame).toEqual(recorderFrame);
    expect(chromeOf(playbackFrame, modes)).toEqual(chromeOf(recorderFrame, recorderModes));
    // The viewer's own insets, scale or panel state would have moved it.
    expect(osmFrame(mobileRecording.frame, VIEWER_INSETS, RECORDER_SCALE)).not.toEqual(recorderFrame);
    expect(osmFrame(mobileRecording.frame, RECORDER_INSETS, VIEWER_SCALE)).not.toEqual(recorderFrame);
    expect(chromeOf(playbackFrame, viewerModes)).not.toEqual(chromeOf(recorderFrame, recorderModes));
  });

  it("falls back to the panel's starting state, not the viewer's, where a recording is silent", () => {
    const viewer = { ...DEFAULT_MOBILE_PANEL_MODES, panelOpen: false, tabsCollapsed: true };

    expect(resolveReplayMobilePanelModes(makePanelPresentation().modes, viewer)).toBe(DEFAULT_MOBILE_PANEL_MODES);
    expect(DEFAULT_MOBILE_PANEL_MODES).toMatchObject({ panelOpen: true, tabsCollapsed: false, panelFromHotkey: false });
    // Live, the viewer's own.
    expect(resolveReplayMobilePanelModes(null, viewer)).toBe(viewer);
    expect(resolveReplayMobilePanelModes(undefined, viewer)).toBe(viewer);
  });
});
