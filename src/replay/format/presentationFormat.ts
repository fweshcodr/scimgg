import { z } from 'zod';
import { MAX_REPLAY_FILTER_ENTRIES, MAX_REPLAY_OVERLAY_MARKERS, MAX_REPLAY_SPELLBOOKS } from './limits';
import { failFastReplayArray } from './parseArray';

export { MAX_REPLAY_OVERLAY_MARKERS } from './limits';

/**
 * The recorder's layout and overlays as they cross the wire, mirrored field-for-field
 * from `ReplayPresentationState` / `ReplayOverlays` in src/core/replayPresentation.ts.
 * They are written out here rather than imported so this module stays free of the app graph;
 * parity is held by the compile-time guards in src/replay/__tests__/replayCapture.test.ts.
 *
 * Every field is REQUIRED and bounded, and the objects are `strict()`. Playback casts a
 * parsed sample straight into the trusted `ReplayPresentationState` and dereferences
 * `panels`/`variants` while rebuilding the frame, so anything these schemas wave through
 * is a crash during playback rather than a rejected sample. These schemas must be extended
 * whenever the presentation shape changes.
 *
 * The OPTIONAL members are the exception to "required": the recorder may omit them, and
 * playback then falls back as `ReplayPresentationState` documents for each. They are bounded
 * exactly as tightly as the required ones, because they are dereferenced just as directly
 * once present.
 *
 * The leaf schemas and MAX_* constants are exported for the app's storage loaders, which
 * parse the same values tolerantly (`.catch(default)`) on the way IN. Sharing the
 * definition is what keeps a bound from being restated — and drifting — on the two sides.
 * Tightening one of these bounds can invalidate existing recordings, so treat a change
 * here as a format change, not a validation tweak.
 */
const UI_ANCHOR_X = ['left', 'right'] as const;
const UI_ANCHOR_Y = ['top', 'bottom'] as const;

/** Generous next to any real display, tight enough to bound the layout math. */
const MAX_REPLAY_FRAME_EDGE_PX = 16_384;
const MAX_REPLAY_UI_SCALE = 8;
/** `MAX_MINIMAP_ZOOM` in src/components/Minimap.tsx, with room to be raised without invalidating existing recordings. */
const MAX_REPLAY_MINIMAP_ZOOM = 64;
/** The autocast picker's row. The widest category in src/types/attackStyles.ts offers five styles. */
const MAX_REPLAY_ATTACK_STYLE_INDEX = 4;

export const ReplayFrameEdgeSchema = z.number().positive().max(MAX_REPLAY_FRAME_EDGE_PX);
export const ReplayInsetSchema = z.number().finite().nonnegative().max(MAX_REPLAY_FRAME_EDGE_PX);
export const ReplayUiScaleSchema = z.number().positive().max(MAX_REPLAY_UI_SCALE);

/** The workspace is the game frame, so it carries the frame's size and must match it. */
export const ReplayWorkspaceSchema = z
  .object({
    width: ReplayFrameEdgeSchema,
    height: ReplayFrameEdgeSchema,
  })
  .strict();

export function replayWorkspaceMatchesFrame(
  workspace: z.output<typeof ReplayWorkspaceSchema>,
  frame: { readonly width: number; readonly height: number },
): boolean {
  return workspace.width === frame.width && workspace.height === frame.height;
}

export const ReplayUiPositionSchema = z
  .object({
    x: z.number().finite(),
    y: z.number().finite(),
    anchorX: z.enum(UI_ANCHOR_X),
    anchorY: z.enum(UI_ANCHOR_Y),
  })
  .strict();

/** Prayer and spell names are short; these caps only have to refuse an abusive payload. */
const MAX_REPLAY_FILTER_ENTRY_LENGTH = 64;

const ReplayFilterEntryNameSchema = z.string().max(MAX_REPLAY_FILTER_ENTRY_LENGTH);

function boundedSpellbookRecord<V extends z.ZodTypeAny>(value: V) {
  return z
    .record(z.string().max(MAX_REPLAY_FILTER_ENTRY_LENGTH), value)
    .refine(
      (record) => Object.keys(record).length <= MAX_REPLAY_SPELLBOOKS,
      `at most ${MAX_REPLAY_SPELLBOOKS} spellbooks`,
    );
}

/**
 * The Mobile hotkeys bar's slots: enum 5607 hotkey ids the app can act on, or 0 for an
 * empty slot (src/layout/osmHotkeys.ts, `OSM_HOTKEY_TYPES`; a test keeps the two in step).
 * Written out rather than imported, like every other bound in this file.
 */
export const REPLAY_HOTKEY_IDS = [0, 6, 7, 8, 9, 10, 12, 18, 21, 22, 23] as const;
export const REPLAY_HOTKEY_SLOTS = 5;
const ReplayHotkeySlotSchema = z.literal(REPLAY_HOTKEY_IDS);

const ReplayPanelModesSchema = z
  .object({
    prayerReordering: z.boolean(),
    prayerFiltering: z.boolean(),
    spellReordering: z.boolean(),
    spellFiltering: z.boolean(),
    /** Which body each tab is showing; see `ReplayPanelModes` for what an absent one means. */
    quickPrayerSetupOpen: z.boolean().optional(),
    autocastPickerStyleIndex: z.number().int().min(0).max(MAX_REPLAY_ATTACK_STYLE_INDEX).nullable().optional(),
    equipmentView: z.enum(['equipment', 'stats']).optional(),
    settingsSubTab: z.enum(['audio', 'keybinds']).optional(),
    prayerFilterViewOpen: z.boolean().optional(),
    spellFilterViewOpen: z.boolean().optional(),
    modernPanelOpen: z.boolean().optional(),
    /** Mobile layout only; see `ReplayMobilePanelModes`. */
    mobile: z
      .object({
        panelOpen: z.boolean(),
        tabsCollapsed: z.boolean(),
        panelFromHotkey: z.boolean(),
        hotkeysCollapsed: z.boolean(),
        hotkeysOpenOnLeft: z.boolean(),
        hotkeys: z.array(ReplayHotkeySlotSchema).length(REPLAY_HOTKEY_SLOTS),
      })
      .strict()
      .optional(),
  })
  .strict();

const ReplayPanelFiltersSchema = z
  .object({
    prayer: z
      .object({
        hidden: failFastReplayArray(ReplayFilterEntryNameSchema, { max: MAX_REPLAY_FILTER_ENTRIES }),
        order: failFastReplayArray(ReplayFilterEntryNameSchema, { max: MAX_REPLAY_FILTER_ENTRIES }).nullable(),
        /** Every row optional: the client spreads what arrives over its defaults. */
        filterOptions: z
          .object({
            showLowerTiers: z.boolean().optional(),
            showTieredOverMultiskill: z.boolean().optional(),
            showRapidHealing: z.boolean().optional(),
            showLackLevel: z.boolean().optional(),
            showLackRequirements: z.boolean().optional(),
          })
          .strict(),
      })
      .strict(),
    spellbook: z
      .object({
        hidden: boundedSpellbookRecord(
          failFastReplayArray(ReplayFilterEntryNameSchema, { max: MAX_REPLAY_FILTER_ENTRIES }),
        ),
        order: boundedSpellbookRecord(
          failFastReplayArray(ReplayFilterEntryNameSchema, { max: MAX_REPLAY_FILTER_ENTRIES }).nullable(),
        ),
        activeCategories: z.array(z.enum(['combat', 'teleport', 'utility'])).max(3),
        /** Every row optional, as the prayer's. */
        filterOptions: z
          .object({
            showLackLevel: z.boolean().optional(),
            showLackRunes: z.boolean().optional(),
            showLackRequirements: z.boolean().optional(),
            showUnsimulated: z.boolean().optional(),
            iconResizing: z.boolean().optional(),
          })
          .strict(),
      })
      .strict(),
  })
  .strict();

/** Comfortably past a whole arena tiled edge to edge, so no real marker set is refused. */
const MAX_REPLAY_MARKER_COORDINATE = 100_000;
export const MAX_REPLAY_MARKER_COLOR_LENGTH = 32;
export const MAX_REPLAY_MARKER_LABEL_LENGTH = 64;
const MAX_REPLAY_MARKER_WIDTH = 10;

export const ReplayMarkerCoordinateSchema = z
  .number()
  .finite()
  .min(-MAX_REPLAY_MARKER_COORDINATE)
  .max(MAX_REPLAY_MARKER_COORDINATE);
const ReplayMarkerColorSchema = z.string().max(MAX_REPLAY_MARKER_COLOR_LENGTH);
const ReplayMarkerOpacitySchema = z.number().min(0).max(1);
const ReplayMarkerLabelSchema = z.string().max(MAX_REPLAY_MARKER_LABEL_LENGTH);
export const ReplayMarkerWidthSchema = z.number().positive().max(MAX_REPLAY_MARKER_WIDTH);

export const ReplayTileMarkerSchema = z
  .object({
    x: ReplayMarkerCoordinateSchema,
    y: ReplayMarkerCoordinateSchema,
    color: ReplayMarkerColorSchema,
    opacity: ReplayMarkerOpacitySchema,
    /** Absent means an outline with no fill, which is the default. */
    fillOpacity: ReplayMarkerOpacitySchema.optional(),
    label: ReplayMarkerLabelSchema.optional(),
  })
  .strict();

export const ReplayLineMarkerSchema = z
  .object({
    x: ReplayMarkerCoordinateSchema,
    y: ReplayMarkerCoordinateSchema,
    orientation: z.enum(['horizontal', 'vertical']),
    color: ReplayMarkerColorSchema,
    opacity: ReplayMarkerOpacitySchema,
    label: ReplayMarkerLabelSchema.optional(),
  })
  .strict();

export const ReplayOverlaysSchema = z
  .object({
    tileMarkers: failFastReplayArray(ReplayTileMarkerSchema, { max: MAX_REPLAY_OVERLAY_MARKERS }),
    showTileMarkers: z.boolean(),
    showTileMarkerLabels: z.boolean(),
    /** `TILE_MARKER_WIDTH_MAX` in src/types/tileMarkers.ts. Absent means the default width. */
    tileMarkerWidth: ReplayMarkerWidthSchema.optional(),
    lineMarkers: failFastReplayArray(ReplayLineMarkerSchema, { max: MAX_REPLAY_OVERLAY_MARKERS }),
    showLineMarkers: z.boolean(),
    showLineMarkerLabels: z.boolean(),
    /** `LINE_MARKER_WIDTH_MAX` in src/types/lineMarkers.ts. */
    lineMarkerWidth: ReplayMarkerWidthSchema,
  })
  .strict();

const REPLAY_CLIENT_LAYOUTS = ['fixed', 'classic', 'modern', 'mobile'] as const;

/**
 * The recorder's safe-area insets (notch, rounded corners, home indicator), in CSS pixels
 * of the recorded frame. The Mobile chrome is laid out inside them, so together with the
 * frame they decide where every Mobile button was.
 */
export const ReplaySafeAreaInsetsSchema = z
  .object({ top: ReplayInsetSchema, right: ReplayInsetSchema, bottom: ReplayInsetSchema, left: ReplayInsetSchema })
  .strict();

/**
 * CSS pixels per logical pixel of the recorder's Mobile chrome (`osmChromeScale` in
 * src/layout/osmClientLayout.ts). Its largest factor is the 400% setting over the pixel
 * ratio: nominally 16 at 400% / DPR 0.25 (a desktop browser zoomed out to 25% with Mobile
 * forced). Allow up to 17 because flooring logical dimensions can raise the actual scale.
 */
const MAX_REPLAY_MOBILE_CHROME_SCALE = 17;
export const ReplayMobileChromeScaleSchema = z.number().positive().max(MAX_REPLAY_MOBILE_CHROME_SCALE);

export const ReplayPresentationStateSchema = z
  .object({
    clientLayoutMode: z.enum(REPLAY_CLIENT_LAYOUTS),
    /** Present exactly when the layout is Mobile; see the refinement below. */
    safeAreaInsets: ReplaySafeAreaInsetsSchema.optional(),
    /** Present exactly when the layout is Mobile, like the safe area. */
    mobileChromeScale: ReplayMobileChromeScaleSchema.optional(),
    workspace: ReplayWorkspaceSchema.optional(),
    frame: z
      .object({
        width: ReplayFrameEdgeSchema,
        height: ReplayFrameEdgeSchema,
      })
      .strict(),
    insets: z
      .object({
        left: ReplayInsetSchema,
        right: ReplayInsetSchema,
      })
      .strict(),
    uiScale: ReplayUiScaleSchema,
    overlayScale: ReplayUiScaleSchema.optional(),
    panels: z
      .object({
        gamePanel: ReplayUiPositionSchema,
        minimap: ReplayUiPositionSchema,
        compactOrbs: ReplayUiPositionSchema,
        infobox: ReplayUiPositionSchema.nullable(),
        zukSetTimer: ReplayUiPositionSchema.nullable(),
      })
      .strict(),
    variants: z
      .object({
        activeGamePanelTab: z.enum(['inventory', 'combat', 'skills', 'spellbook', 'prayer', 'equipment', 'settings']),
        compactOrbsEnabled: z.boolean(),
        compactOrbsLayout: z.enum(['vertical', 'horizontal', 'horizontal-wide']),
        compactOrbsOrder: z.array(z.enum(['hitpoints', 'prayer', 'run', 'special'])).max(4),
        infoboxPinTarget: z.enum(['hud', 'inventory', 'free']),
        showCoordinates: z.boolean(),
        /** Optional, and absent resolves to `false`, not the viewer's value; see `ReplayPresentationVariants`. */
        fixedChatboxVisible: z.boolean().optional(),
        /** Optional and absent-as-`false`, like `fixedChatboxVisible`. */
        resizableChatboxVisible: z.boolean().optional(),
        minimapZoom: z.number().positive().max(MAX_REPLAY_MINIMAP_ZOOM).optional(),
        panelPresentation: z
          .object({ filters: ReplayPanelFiltersSchema, modes: ReplayPanelModesSchema })
          .strict()
          .optional(),
      })
      .strict(),
  })
  .strict()
  .refine((state) => state.workspace === undefined || replayWorkspaceMatchesFrame(state.workspace, state.frame), {
    path: ['workspace'],
    message: 'Workspace must match the game frame',
  })
  // A Mobile frame cannot be rebuilt without the insets and scale its chrome was placed
  // with, and no other layout reads them.
  .refine((state) => (state.clientLayoutMode === 'mobile') === (state.safeAreaInsets !== undefined), {
    path: ['safeAreaInsets'],
    message: 'Safe-area insets are recorded with, and only with, the Mobile layout',
  })
  .refine((state) => (state.clientLayoutMode === 'mobile') === (state.mobileChromeScale !== undefined), {
    path: ['mobileChromeScale'],
    message: 'The Mobile chrome scale is recorded with, and only with, the Mobile layout',
  });

export type ReplayWirePresentationState = z.output<typeof ReplayPresentationStateSchema>;
export type ReplayWireOverlays = z.output<typeof ReplayOverlaysSchema>;
export type ReplayWireTileMarker = z.output<typeof ReplayTileMarkerSchema>;
export type ReplayWireLineMarker = z.output<typeof ReplayLineMarkerSchema>;
