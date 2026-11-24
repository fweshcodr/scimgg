import type { GamePanelTab } from '../hooks/keybindStore';
import type { InfoboxPinTarget, UIPosition } from '../hooks/usePersistedSettings';
import type { SafeAreaInsets } from '../hooks/useSafeAreaInsets';
import { JAGEX_BOSSING_HOTKEYS, type OsmHotkeySlot } from '../layout/osmHotkeys';
import type { ClientLayoutMode } from '../layout/osrsClientLayout';
import { scaleOverlayDefaultPosition } from '../layout/overlayScale';
import type { WorkspacePresentationGeometry } from '../layout/workspaceLayout';
import type { CompactOrbId, CompactOrbsLayout } from '../types/compactOrbs';
import type { EquipmentPanelView, SettingsSubTab } from '../types/gamePanelViews';
import type { LineMarker } from '../types/lineMarkers';
import type { PrayerFilterOptions, SpellCategory, SpellFilterOptions } from '../types/panelFilters';
import type { TileMarker } from '../types/tileMarkers';

/**
 * The layout to draw while a recording may be on screen: the recorded one, so a Mobile
 * recording plays back in Mobile on a desktop too.
 *
 * A phone or tablet keeps the Mobile layout for the viewer's own chrome (the tool window
 * and its menu, the full-screen stone), which has no desktop form on a touch screen.
 * The game frame is separate: App draws it as the recording's layout whatever this returns
 * (`frameClientLayoutMode`), so a desktop recording plays back inside the shrunk frame as
 * it was recorded, and its cursor lands on its own chrome.
 */
export function playbackClientLayoutMode(
  own: ClientLayoutMode,
  recorded: ClientLayoutMode | undefined,
  onMobileDevice: boolean,
): ClientLayoutMode {
  if (onMobileDevice) return 'mobile';
  return recorded ?? own;
}

/**
 * The safe-area insets the Mobile chrome is laid out in: the recorder's while a recording
 * is on screen, since its frame is rebuilt notch and all and the viewer's own notch says
 * nothing about where the recorder's buttons were. A recording without them (any other
 * layout, drawn as Mobile on a phone) keeps the viewer's.
 */
export function resolveReplaySafeAreaInsets(
  presentation: ReplayPresentationState | null,
  live: SafeAreaInsets,
): SafeAreaInsets {
  return presentation?.safeAreaInsets ?? live;
}

/**
 * The Mobile chrome's scale, by the same rule as {@link resolveReplaySafeAreaInsets}: the
 * recorder's while a recording is on screen, since it came from their screen height, pixel
 * ratio and Interface scaling setting, none of which the viewer shares. A recording without
 * one (any other layout, drawn as Mobile on a phone) keeps the viewer's.
 */
export function resolveReplayMobileChromeScale(presentation: ReplayPresentationState | null, live: number): number {
  return presentation?.mobileChromeScale ?? live;
}

/**
 * The recorder's Mobile panel state while replaying, else the viewer's. A recording silent
 * on it (the panel had not yet mounted) gets the panel's starting state, not the viewer's:
 * like the panel bodies, the viewer's is whatever they last left on screen.
 */
export function resolveReplayMobilePanelModes(
  recorded: ReplayPanelModes | null | undefined,
  own: ReplayMobilePanelModes,
): ReplayMobilePanelModes {
  if (!recorded) return own;
  return recorded.mobile ?? DEFAULT_MOBILE_PANEL_MODES;
}

/** The Mobile panel as it starts: open, rail expanded, hotkeys out, panel on the right. */
export const DEFAULT_MOBILE_PANEL_MODES: ReplayMobilePanelModes = {
  panelOpen: true,
  tabsCollapsed: false,
  panelFromHotkey: false,
  hotkeysCollapsed: false,
  hotkeysOpenOnLeft: false,
  hotkeys: JAGEX_BOSSING_HOTKEYS,
};

/**
 * A description of the recorder's on-screen layout, complete enough that
 * playback can rebuild the frame they were looking at.
 *
 * WHY THIS EXISTS: the replay cursor is only meaningful relative to a layout.
 * Storing cursor samples as a FRACTION of the game viewport frame and
 * re-projecting them against the viewer's frame would be a non-uniform stretch
 * that preserves nothing. Aspect changes bend world positions, and every panel is
 * anchored to a frame edge by absolute pixels — so the same fraction is a
 * different button at a different width, a different `uiScale`, or after the
 * viewer dragged their inventory somewhere else.
 *
 * Instead, cursor samples are recorded in LOGICAL FRAME PIXELS (see
 * `LogicalFrameReplayCursorTrack`) and playback reproduces the frame those
 * pixels were measured in. Placement then reduces to a uniform scale, and it is
 * exact for the 3D world, for every panel, and for UI that does not exist yet —
 * with no per-element tagging.
 *
 * CONTRACT: every REQUIRED field here changes where something clickable lands.
 * An OPTIONAL field is one the recorder may omit: playback MUST fall back to the
 * viewer's own value where it is absent, unless the field documents another
 * fallback.
 */
export interface ReplayPresentationState {
  /**
   * Which OSRS client layout the recorder's frame was composed as. Moves the
   * side panel, the tab stones and — in fixed — the scene rectangle itself, so
   * it belongs to the layout every bit as much as the panel anchors below.
   */
  readonly clientLayoutMode: ClientLayoutMode;
  /**
   * The recorder's safe-area insets, present exactly when the layout is Mobile. The
   * Mobile chrome keeps clear of them (see `osmFrame`), so with the frame they decide
   * where its every button was; see {@link resolveReplaySafeAreaInsets}.
   */
  readonly safeAreaInsets?: SafeAreaInsets;
  /**
   * The recorder's Mobile chrome scale (`osmChromeScale`: CSS pixels per logical pixel),
   * present exactly when the layout is Mobile. It sets every Mobile button's size and, with
   * the frame and safe area, its place; see {@link resolveReplayMobileChromeScale}.
   */
  readonly mobileChromeScale?: number;
  /** Measured CSS pixel size of `.game-viewport-frame` at record time. */
  readonly frame: ReplayPresentationFrame;
  /**
   * The live workspace, which is the game frame and matches `frame`. Present once the stage has
   * been measured; `fitReplayWorkspace` places a recording with it on whole pixels.
   */
  readonly workspace?: WorkspacePresentationGeometry;
  /**
   * Frame-local sidebar overlap. The Settings/Plugins sidebars do not resize
   * the frame, but they translate the 3D canvas and shift the chatbox and its
   * infobox rows, so their overlap is part of the layout.
   */
  readonly insets: ReplayPresentationInsets;
  /** Global panel scale. Multiplies panel dimensions AND their anchor offsets. */
  readonly uiScale: number;
  /** Unlike the viewer-value fallback rule, absence means the fixed 1× overlay layout. */
  readonly overlayScale?: number;
  readonly panels: ReplayPresentationPanels;
  readonly variants: ReplayPresentationVariants;
}

export interface ReplayPresentationFrame {
  readonly width: number;
  readonly height: number;
}

export interface ReplayPresentationInsets {
  readonly left: number;
  readonly right: number;
}

/**
 * Concrete frame-local target for every mounted movable in-frame panel that owns
 * click targets, captured from the solved layout rather than persisted offsets.
 * Unmounted panels retain their settings/default fallback. Playback applies these
 * numbers literally at the recorded frame and scale, without projection or docking.
 * For infoboxes, `null` means unpositioned or pinned: playback derives the default
 * or pin from the recorded hosts. The Zuk timer is null only in the stand-in layout a
 * recording falls back to when its own never validated; live captures record it concretely.
 *
 * NOT captured: the XP-drop overlay and boss health bar. Both are read-only
 * displays — their contents are pointer-inert and only an Alt-drag moves them —
 * and captured clickable followers already include any inferred attachment
 * displacement. Playback does not infer docking, so the viewer's placement of
 * these overlays cannot move a recorded target. They remain viewer preferences.
 */
export interface ReplayPresentationPanels {
  readonly gamePanel: UIPosition;
  readonly minimap: UIPosition;
  readonly compactOrbs: UIPosition;
  readonly infobox: UIPosition | null;
  /** Null when the recording holds no timer position: playback uses {@link REPLAY_ZUK_SET_TIMER_DEFAULT_POSITION}. */
  readonly zukSetTimer: UIPosition | null;
}

/** Where playback draws the timer for a null recorded position: (279, 74) at overlay scale 1. */
export const REPLAY_ZUK_SET_TIMER_DEFAULT_POSITION: UIPosition = {
  x: 279,
  y: 74,
  anchorX: 'left',
  anchorY: 'top',
};

export function resolveReplayZukSetTimerPosition(presentation: ReplayPresentationState): UIPosition {
  return (
    presentation.panels.zukSetTimer ??
    scaleOverlayDefaultPosition(REPLAY_ZUK_SET_TIMER_DEFAULT_POSITION, presentation.overlayScale ?? 1)
  );
}

export interface ReplayPresentationVariants {
  readonly activeGamePanelTab: GamePanelTab;
  readonly compactOrbsEnabled: boolean;
  readonly compactOrbsLayout: CompactOrbsLayout;
  readonly compactOrbsOrder: readonly CompactOrbId[];
  readonly infoboxPinTarget: InfoboxPinTarget;
  readonly showCoordinates: boolean;
  /**
   * Whether the Fixed layout drew its chatbox. It selects the scene rectangle
   * itself — shown, the scene is the cache's 512x334 viewport; hidden, it takes
   * the chatbox's rows as well — so it moves every world position a recorded
   * cursor was measured against, and the tab row it puts on screen is clickable.
   *
   * Optional, and absent means FALSE (the taller, chatbox-less scene) rather than
   * the viewer's own value, which is the second exception to the rule above.
   */
  readonly fixedChatboxVisible?: boolean;
  /**
   * Whether a resizable layout drew its chatbox, which sits over the scene's bottom-left corner
   * and moves the Chatbox infoboxes and any panel that would cover it. Absent means FALSE, like
   * `fixedChatboxVisible`.
   */
  readonly resizableChatboxVisible?: boolean;
  /**
   * Minimap pixels per tile. Transient `Minimap` state, persisted nowhere, and it
   * decides which stretch of map sits under a cursor recorded over the minimap.
   */
  readonly minimapZoom?: number;
  /**
   * The recorder's prayer and spellbook panel. Every member of it moves icons in
   * those two panels, so a cursor recorded over "Rigour" lands on whatever the
   * VIEWER has in that slot without it.
   */
  readonly panelPresentation?: ReplayPanelPresentation;
}

/**
 * Everything `GamePanel` owns that arranges the prayer and spellbook grids. One
 * object because it is one reporting unit: the panel holds the modes in local state
 * and the arrangement in `usePanelFilters`, and a snapshot missing either half
 * reproduces neither — `filterPrayerGrid`/`filterSpellGrid` return the UNFILTERED
 * grid in reorder mode, so the recorded `filters` do nothing unless `modes` match too.
 */
export interface ReplayPanelPresentation {
  readonly filters: ReplayPanelFilters;
  readonly modes: ReplayPanelModes;
}

/**
 * The panel's transient editing modes. Local `useState` in `GamePanel`, persisted
 * nowhere. Each one changes which icons are on screen and therefore where every
 * icon below it lands.
 */
export interface ReplayPanelModes {
  readonly prayerReordering: boolean;
  readonly prayerFiltering: boolean;
  readonly spellReordering: boolean;
  readonly spellFiltering: boolean;
  /**
   * Which body each tab is showing. Every one REPLACES its tab's grid, so without
   * them a cursor recorded over "Rigour" lands on a quick-prayer checkbox, a spell
   * picker, an equipment stats readout or a settings row. Absent, playback falls back
   * to the DEFAULT body rather than the viewer's, which is the one exception to the
   * rule above and is argued at the resolution site in `GamePanel`.
   */
  readonly quickPrayerSetupOpen?: boolean;
  /** Attack-style row the autocast picker was opened from; `null` while it is closed. */
  readonly autocastPickerStyleIndex?: number | null;
  readonly equipmentView?: EquipmentPanelView;
  readonly settingsSubTab?: SettingsSubTab;
  readonly prayerFilterViewOpen?: boolean;
  readonly spellFilterViewOpen?: boolean;
  /** Modern layout only. Absent means the panel is open. */
  readonly modernPanelOpen?: boolean;
  /** Mobile layout only. See {@link resolveReplayMobilePanelModes} for what absence means. */
  readonly mobile?: ReplayMobilePanelModes;
}

/**
 * The Mobile side panel and hotkeys bar, as `GamePanel` holds them. Each one moves or hides
 * clickable chrome: the panel and its tab, the rail's second column, the panel's side, the
 * hotkey stones.
 */
export interface ReplayMobilePanelModes {
  /** The side panel is showing. */
  readonly panelOpen: boolean;
  /** The tab rail collapsed to its left column. */
  readonly tabsCollapsed: boolean;
  /** The last open came from a hotkey, which can put the panel on the left. */
  readonly panelFromHotkey: boolean;
  /** The hotkeys bar folded down to its master toggle. */
  readonly hotkeysCollapsed: boolean;
  /** The viewer setting that lets a hotkey open the panel on the left. */
  readonly hotkeysOpenOnLeft: boolean;
  /** The five hotkey slots (enum 5607 ids, 0 empty): which stone is where, and what it does. */
  readonly hotkeys: readonly OsmHotkeySlot[];
}

/**
 * The recorder's prayer/spellbook arrangement, mirroring `PanelFilterSettings`
 * minus `quickPrayerSelections` — those feed a live engine action rather than the
 * panel's layout, and playback must never hand the viewer's engine the recorder's set.
 */
export interface ReplayPanelFilters {
  readonly prayer: {
    readonly hidden: readonly string[];
    readonly order: readonly string[] | null;
    /**
     * Any row may be absent; the reader spreads it over `PRAYER_FILTER_DEFAULTS`, so an
     * absent row takes its default.
     */
    readonly filterOptions: Partial<PrayerFilterOptions>;
  };
  readonly spellbook: {
    readonly hidden: Readonly<Record<string, readonly string[]>>;
    readonly order: Readonly<Record<string, readonly string[] | null>>;
    /** One set for every book, as `SpellbookFilterSettings` holds it. */
    readonly activeCategories: readonly SpellCategory[];
    /** See the prayer's `filterOptions`; the reader spreads it over `SPELL_FILTER_DEFAULTS`. */
    readonly filterOptions: Partial<SpellFilterOptions>;
  };
}

/**
 * Tile and line markers as RESOLVED at record time — user markers merged with
 * whichever packs were active. Pack ids are not stored: a pack's contents are code
 * and change between releases, so an id would replay as whatever the viewer's build
 * happens to define today rather than what the recorder saw.
 *
 * Captured ONCE at run start and held outside the presentation track, not sampled
 * over time. Markers are pre-fight setup; putting them on the track made every
 * unrelated layout change carry a full copy of the marker set, which is quadratic
 * in the number of edits and unbounded in payload. A marker changed mid-run
 * therefore replays as its run-start state — if demonstrating marker edits ever
 * becomes a real use case, that wants a delta track, not a snapshot per layout change.
 */
export interface ReplayOverlays {
  readonly tileMarkers: readonly TileMarker[];
  readonly showTileMarkers: boolean;
  readonly showTileMarkerLabels: boolean;
  /** Absent means the default width. */
  readonly tileMarkerWidth?: number;
  readonly lineMarkers: readonly LineMarker[];
  readonly showLineMarkers: boolean;
  readonly showLineMarkerLabels: boolean;
  readonly lineMarkerWidth: number;
}

export interface ReplayPresentationSample {
  readonly tMs: number;
  readonly state: ReplayPresentationState;
}

/**
 * How to draw a recorded frame inside the space the viewer actually has.
 *
 * Never upscales. When the viewer has room the frame renders at its recorded
 * size untransformed (`scale === 1`), which keeps the WebGL canvas at its
 * native backing resolution and avoids a transform entirely. Only a viewer
 * with less room than the recording pays for a downscale.
 */
export interface ReplayPresentationLayout {
  readonly scale: number;
  readonly offsetX: number;
  readonly offsetY: number;
  readonly displayWidth: number;
  readonly displayHeight: number;
}

export function computeReplayPresentationLayout(
  frame: ReplayPresentationFrame,
  availableWidth: number,
  availableHeight: number,
): ReplayPresentationLayout {
  const usableWidth = Math.max(0, availableWidth);
  const usableHeight = Math.max(0, availableHeight);
  const scale =
    frame.width > 0 && frame.height > 0 ? Math.min(1, usableWidth / frame.width, usableHeight / frame.height) : 1;
  const displayWidth = frame.width * scale;
  const displayHeight = frame.height * scale;
  return {
    scale,
    offsetX: Math.max(0, (usableWidth - displayWidth) / 2),
    offsetY: Math.max(0, (usableHeight - displayHeight) / 2),
    displayWidth,
    displayHeight,
  };
}

/**
 * Index of the presentation in effect at `tMs`, or -1 for an empty track.
 *
 * Step-hold, not interpolated: layout is a discrete state, and a half-applied
 * layout would place the cursor somewhere that never existed. Samples are
 * recorded in ascending `tMs`.
 *
 * Deliberately backfills before the first sample rather than reporting nothing.
 * The first sample is the run-start snapshot, so it describes the layout from the
 * very beginning of the recording — its timestamp is merely the moment it was
 * written. Returning -1 there would leave the opening of every replay with no
 * frame to rebuild, which is the exact failure this track exists to prevent.
 */
export function presentationIndexAt(samples: readonly ReplayPresentationSample[], tMs: number): number {
  const first = samples[0];
  if (!first) return -1;
  if (tMs < first.tMs) return 0;

  let lo = 0;
  let hi = samples.length - 1;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    const sample = samples[mid];
    if (sample && sample.tMs <= tMs) {
      lo = mid;
    } else {
      hi = mid - 1;
    }
  }
  return lo;
}

/**
 * The chatbox state playback must draw: the recorded field for the recorded layout, see
 * {@link ReplayPresentationVariants.fixedChatboxVisible} and `resizableChatboxVisible`.
 */
export function resolveReplayChatboxVisible(
  presentation: ReplayPresentationState | null,
  viewerValue: boolean,
): boolean {
  if (!presentation) return viewerValue;
  const { variants } = presentation;
  return (
    (presentation.clientLayoutMode === 'fixed' ? variants.fixedChatboxVisible : variants.resizableChatboxVisible) ??
    false
  );
}

export function presentationStateAt(
  samples: readonly ReplayPresentationSample[],
  tMs: number,
): ReplayPresentationState | null {
  const index = presentationIndexAt(samples, tMs);
  return index < 0 ? null : (samples[index]?.state ?? null);
}

/**
 * Whether a new snapshot is worth storing. Layout changes are rare; identical ones are not
 * recorded.
 *
 * Structural, not field-by-field. A hand-written comparison is a second list of the state's
 * fields, and the one that goes stale silently: a field added to {@link
 * ReplayPresentationState} would ride into the recording correctly and yet never trigger a
 * sample, so changing it mid-run would replay as though it never changed. Both objects are
 * built by the same code path, so their key order agrees and stringify is a fair test.
 */
export function replayPresentationStatesEqual(a: ReplayPresentationState, b: ReplayPresentationState): boolean {
  return a === b || JSON.stringify(a) === JSON.stringify(b);
}
