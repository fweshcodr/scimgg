import type { z } from 'zod';
import type { ReplayOverlays, ReplayPresentationState } from '../core/replayPresentation';
import { OSM_INTERFACE_SCALING_DEFAULT, osmChromeScale } from '../layout/osmClientLayout';
import { DEFAULT_LINE_MARKER_WIDTH } from '../types/lineMarkers';
import { DEFAULT_TILE_MARKER_WIDTH } from '../types/tileMarkers';
import { log } from '../util/Logger';
import {
  MAX_REPLAY_MARKER_COLOR_LENGTH,
  MAX_REPLAY_MARKER_LABEL_LENGTH,
  MAX_REPLAY_OVERLAY_MARKERS,
  ReplayFrameEdgeSchema,
  ReplayInsetSchema,
  ReplayLineMarkerSchema,
  ReplayMarkerWidthSchema,
  ReplayMobileChromeScaleSchema,
  ReplayOverlaysSchema,
  ReplayPresentationStateSchema,
  ReplaySafeAreaInsetsSchema,
  ReplayTileMarkerSchema,
  ReplayUiPositionSchema,
  ReplayUiScaleSchema,
  ReplayWorkspaceSchema,
  replayWorkspaceMatchesFrame,
} from './format/presentationFormat';

/**
 * The exact replay schema rejects the entire replay for one bad field, but its inputs cannot
 * guarantee finite numbers.
 * A field that validates passes unchanged; only one the wire cannot carry is replaced.
 * Development and test throw on invalid candidates so drift surfaces, whereas production falls
 * back to the last known-good layout rather than lose a recording.
 */

function accepted<T>(schema: z.ZodType<T>, value: unknown, fallback: T): T {
  const result = schema.safeParse(value);
  return result.success ? result.data : fallback;
}

/**
 * Stands in when a recording starts against a layout that never validated and there is no
 * earlier one to fall back on. The dimensions are arbitrary because the real frame was
 * unusable: a cursor recorded against a frame that cannot be described was already
 * unplaceable, and a replay that plays with the viewer's own layout beats no replay.
 */
const FALLBACK_PRESENTATION: ReplayPresentationState = {
  clientLayoutMode: 'modern',
  frame: { width: 1280, height: 720 },
  insets: { left: 0, right: 0 },
  uiScale: 1,
  panels: {
    gamePanel: { x: 0, y: 0, anchorX: 'right', anchorY: 'bottom' },
    minimap: { x: 0, y: 0, anchorX: 'right', anchorY: 'top' },
    compactOrbs: { x: 0, y: 0, anchorX: 'right', anchorY: 'top' },
    infobox: null,
    zukSetTimer: null,
  },
  variants: {
    activeGamePanelTab: 'inventory',
    compactOrbsEnabled: false,
    compactOrbsLayout: 'vertical',
    compactOrbsOrder: ['hitpoints', 'prayer', 'run', 'special'],
    infoboxPinTarget: 'hud',
    showCoordinates: false,
  },
};

const VariantsSchema = ReplayPresentationStateSchema.shape.variants;
const PanelsSchema = ReplayPresentationStateSchema.shape.panels;

/**
 * `previous` is the last projection that survived, so a frame the ResizeObserver briefly
 * reports as unusable replays as the layout in effect a moment earlier rather than as an
 * invented one.
 */
export function projectReplayPresentation(
  candidate: ReplayPresentationState,
  previous: ReplayPresentationState | null,
): ReplayPresentationState {
  const strict = ReplayPresentationStateSchema.safeParse(candidate);
  if (strict.success) {
    return strict.data.workspace === undefined ? candidate : { ...candidate, workspace: strict.data.workspace };
  }

  const issues = strict.error.issues.map((issue) => issue.path.join('.')).join(', ');
  if (import.meta.env.DEV) {
    const message = `Layout does not satisfy the replay schema at: ${issues}. Fix it at the source that owns the value; the projection below is a production backstop, not the design.`;
    // Fails the suite, where drift must never pass silently, but only warns in a dev
    // session: throwing here runs inside a render and would replace the app with an
    // error screen over a value the projection can handle.
    if (import.meta.env.MODE === 'test') throw new Error(message);
    log.error('Replay', message);
  }

  const fallback = previous ?? FALLBACK_PRESENTATION;
  const panels = accepted(PanelsSchema, candidate.panels, fallback.panels);
  const frame = {
    width: accepted(ReplayFrameEdgeSchema, candidate.frame?.width, fallback.frame.width),
    height: accepted(ReplayFrameEdgeSchema, candidate.frame?.height, fallback.frame.height),
  };
  const workspaceSchema = ReplayWorkspaceSchema.refine((workspace) => replayWorkspaceMatchesFrame(workspace, frame));
  const workspace =
    candidate.workspace === undefined
      ? undefined
      : accepted(workspaceSchema.optional(), candidate.workspace, workspaceSchema.safeParse(fallback.workspace).data);
  const clientLayoutMode = accepted(
    ReplayPresentationStateSchema.shape.clientLayoutMode,
    candidate.clientLayoutMode,
    fallback.clientLayoutMode,
  );
  // Carried with, and only with, Mobile. No insets is the honest stand-in for unusable
  // ones: it is what a device without a notch reports. An unusable scale is the formula's
  // at the default setting and DPR 1 for the recorded frame and insets.
  const safeAreaInsets =
    clientLayoutMode === 'mobile'
      ? accepted(
          ReplaySafeAreaInsetsSchema,
          candidate.safeAreaInsets,
          fallback.safeAreaInsets ?? { top: 0, right: 0, bottom: 0, left: 0 },
        )
      : undefined;
  const projected: ReplayPresentationState = {
    clientLayoutMode,
    ...(safeAreaInsets
      ? {
          safeAreaInsets,
          mobileChromeScale: accepted(
            ReplayMobileChromeScaleSchema,
            candidate.mobileChromeScale,
            fallback.mobileChromeScale ??
              osmChromeScale({
                interfaceScaling: OSM_INTERFACE_SCALING_DEFAULT,
                devicePixelRatio: 1,
                viewport: frame,
                safeAreaInsets,
              }),
          ),
        }
      : {}),
    frame,
    ...(workspace === undefined ? {} : { workspace }),
    insets: {
      left: accepted(ReplayInsetSchema, candidate.insets?.left, fallback.insets.left),
      right: accepted(ReplayInsetSchema, candidate.insets?.right, fallback.insets.right),
    },
    uiScale: accepted(ReplayUiScaleSchema, candidate.uiScale, fallback.uiScale),
    overlayScale: accepted(ReplayUiScaleSchema.optional(), candidate.overlayScale, fallback.overlayScale),
    panels: {
      gamePanel: accepted(ReplayUiPositionSchema, candidate.panels?.gamePanel, panels.gamePanel),
      minimap: accepted(ReplayUiPositionSchema, candidate.panels?.minimap, panels.minimap),
      compactOrbs: accepted(ReplayUiPositionSchema, candidate.panels?.compactOrbs, panels.compactOrbs),
      infobox: accepted(ReplayUiPositionSchema.nullable(), candidate.panels?.infobox, null),
      zukSetTimer: accepted(ReplayUiPositionSchema.nullable(), candidate.panels?.zukSetTimer, null),
    },
    // Whole-object fallback: the variants are the panel arrangement, and mixing half a
    // recorder's arrangement with half a default one describes a screen nobody saw.
    variants: accepted(VariantsSchema, candidate.variants, fallback.variants),
  };

  const result = ReplayPresentationStateSchema.safeParse(projected);
  if (result.success) return projected;
  log.warn('Replay', 'Layout could not be projected onto the replay format; recording the last valid one', {
    issues: result.error.issues.map((issue) => issue.path.join('.')),
  });
  return fallback;
}

/**
 * A color or label too long for the wire still describes a tile the viewer needs to see, and
 * losing the tile loses more than losing the end of its name.
 */
function shortenMarkerText(marker: unknown): unknown {
  if (marker === null || typeof marker !== 'object') return marker;
  const { color, label } = marker as { color?: unknown; label?: unknown };
  return {
    ...marker,
    ...(typeof color === 'string' ? { color: color.slice(0, MAX_REPLAY_MARKER_COLOR_LENGTH) } : {}),
    ...(typeof label === 'string' ? { label: label.slice(0, MAX_REPLAY_MARKER_LABEL_LENGTH) } : {}),
  };
}

function markerList(value: unknown): readonly unknown[] {
  return Array.isArray(value) ? value : [];
}

export interface ReplayOverlayProjection {
  readonly overlays: ReplayOverlays;
  /** Markers the recording cannot carry. Counted rather than silently lost. */
  readonly omitted: { readonly tileMarkers: number; readonly lineMarkers: number };
}

/**
 * Markers are dropped here and NEVER in storage: the format's ceiling is a recording limit,
 * so a player who keeps 3,000 markers keeps all 3,000 on screen and in their settings, and
 * only the recording is trimmed. The count comes back so the omission can be reported instead
 * of discovered.
 */
export function projectReplayOverlays(candidate: ReplayOverlays): ReplayOverlayProjection {
  const candidateTiles = markerList(candidate.tileMarkers);
  const candidateLines = markerList(candidate.lineMarkers);
  const tileMarkers = candidateTiles
    .map(shortenMarkerText)
    .filter(
      (marker): marker is ReplayOverlays['tileMarkers'][number] => ReplayTileMarkerSchema.safeParse(marker).success,
    );
  const lineMarkers = candidateLines
    .map(shortenMarkerText)
    .filter(
      (marker): marker is ReplayOverlays['lineMarkers'][number] => ReplayLineMarkerSchema.safeParse(marker).success,
    );
  const overlays: ReplayOverlays = {
    tileMarkers: tileMarkers.slice(0, MAX_REPLAY_OVERLAY_MARKERS),
    showTileMarkers: candidate.showTileMarkers === true,
    showTileMarkerLabels: candidate.showTileMarkerLabels === true,
    tileMarkerWidth: accepted(ReplayMarkerWidthSchema, candidate.tileMarkerWidth, DEFAULT_TILE_MARKER_WIDTH),
    lineMarkers: lineMarkers.slice(0, MAX_REPLAY_OVERLAY_MARKERS),
    showLineMarkers: candidate.showLineMarkers === true,
    showLineMarkerLabels: candidate.showLineMarkerLabels === true,
    lineMarkerWidth: accepted(ReplayMarkerWidthSchema, candidate.lineMarkerWidth, DEFAULT_LINE_MARKER_WIDTH),
  };

  const omitted = {
    tileMarkers: candidateTiles.length - overlays.tileMarkers.length,
    lineMarkers: candidateLines.length - overlays.lineMarkers.length,
  };
  if (import.meta.env.DEV && !ReplayOverlaysSchema.safeParse(overlays).success) {
    throw new Error('Projected overlays still do not satisfy the replay schema');
  }
  return { overlays, omitted };
}
