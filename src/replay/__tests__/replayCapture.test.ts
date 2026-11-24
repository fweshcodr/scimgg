import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ReplayOverlays, ReplayPresentationState } from '../../core/replayPresentation';
import { osmChromeScale } from '../../layout/osmClientLayout';
import type { WorkspacePresentationGeometry } from '../../layout/workspaceLayout';
import type { LineMarker } from '../../types/lineMarkers';
import type { PrayerFilterOptions, SpellFilterOptions } from '../../types/panelFilters';
import { DEFAULT_TILE_MARKER_WIDTH, type TileMarker } from '../../types/tileMarkers';
import {
  ReplayOverlaysSchema,
  ReplayPresentationStateSchema,
  type ReplayWireLineMarker,
  type ReplayWireOverlays,
  type ReplayWirePresentationState,
  type ReplayWireTileMarker,
} from '../format/presentationFormat';
import { projectReplayOverlays, projectReplayPresentation } from '../replayCapture';

function validPresentation(): ReplayPresentationState {
  return {
    clientLayoutMode: 'fixed',
    frame: { width: 1360, height: 960 },
    insets: { left: 320, right: 0 },
    uiScale: 1.5,
    panels: {
      gamePanel: { x: 67, y: 186, anchorX: 'right', anchorY: 'bottom' },
      minimap: { x: 0, y: 0, anchorX: 'right', anchorY: 'top' },
      compactOrbs: { x: 202, y: 253, anchorX: 'right', anchorY: 'top' },
      infobox: { x: 2, y: 57, anchorX: 'right', anchorY: 'bottom' },
      zukSetTimer: null,
    },
    variants: {
      activeGamePanelTab: 'prayer',
      compactOrbsEnabled: true,
      compactOrbsLayout: 'horizontal',
      compactOrbsOrder: ['prayer', 'special', 'hitpoints', 'run'],
      infoboxPinTarget: 'hud',
      showCoordinates: false,
    },
  };
}

function validOverlays(): ReplayOverlays {
  return {
    tileMarkers: [{ x: 37, y: 25, color: '#2F5BFF', opacity: 1, fillOpacity: 0.35, label: 'stand here' }],
    showTileMarkers: true,
    showTileMarkerLabels: true,
    tileMarkerWidth: 3,
    lineMarkers: [{ x: 30, y: 30, orientation: 'horizontal', color: '#FF0000', opacity: 0.5 }],
    showLineMarkers: true,
    showLineMarkerLabels: false,
    lineMarkerWidth: 2,
  };
}

/** Derived so a new field is covered without being listed. */
function leafPaths(value: unknown, prefix: readonly string[] = []): string[][] {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return [[...prefix]];
  return Object.entries(value).flatMap(([key, child]) => leafPaths(child, [...prefix, key]));
}

function withValueAt<T>(root: T, path: readonly string[], value: unknown): T {
  const copy = structuredClone(root) as Record<string, unknown>;
  let cursor = copy;
  for (const key of path.slice(0, -1)) cursor = cursor[key] as Record<string, unknown>;
  cursor[path[path.length - 1] as string] = value;
  return copy as T;
}

/** Values a stored, broadcast or hand-edited profile has actually been seen to hold. */
const HOSTILE_VALUES = [undefined, null, Number.NaN, Number.POSITIVE_INFINITY, -1, 0, 'nope', [], {}, true];

describe('projectReplayPresentation', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('passes a valid layout through untouched', () => {
    const presentation = validPresentation();

    expect(projectReplayPresentation(presentation, null)).toBe(presentation);
  });

  it('records a resolved overlay scale while preserving its absence', () => {
    const recorded = { ...validPresentation(), overlayScale: 4 / 3 };
    expect(projectReplayPresentation(recorded, null)).toBe(recorded);
    expect(ReplayPresentationStateSchema.parse(JSON.parse(JSON.stringify(recorded))).overlayScale).toBe(4 / 3);
    expect(projectReplayPresentation(validPresentation(), recorded)).not.toHaveProperty('overlayScale');
    expect(ReplayPresentationStateSchema.parse(validPresentation())).not.toHaveProperty('overlayScale');
  });

  it.each([0, -1, 9, Infinity, NaN, 'auto', null])('rejects invalid recorded overlay scale %s', (overlayScale) => {
    const candidate = withValueAt(validPresentation(), ['overlayScale'], overlayScale);
    expect(ReplayPresentationStateSchema.safeParse(candidate).success).toBe(false);
    expect(() => projectReplayPresentation(candidate, null)).toThrow(/overlayScale/);
    vi.stubEnv('MODE', 'production');
    expect(projectReplayPresentation(candidate, { ...validPresentation(), overlayScale: 1.5 }).overlayScale).toBe(1.5);
    expect(projectReplayPresentation(candidate, null).overlayScale).toBeUndefined();
  });

  it.each([
    [['overlayScales'], { zukSetTimer: 2 }],
    [['toolsScale'], 2],
    [['variants', 'hudCollapsed'], true],
  ])('rejects the unknown field %j', (path, value) => {
    const candidate = withValueAt(validPresentation(), path, value);
    expect(ReplayPresentationStateSchema.safeParse(candidate).success).toBe(false);
  });

  describe('workspace geometry', () => {
    const workspace: WorkspacePresentationGeometry = { width: 1360, height: 960 };

    it('copies valid workspace geometry without aliasing the candidate', () => {
      const candidate = { ...validPresentation(), workspace };

      const projected = projectReplayPresentation(candidate, null);

      expect(projected.workspace).toEqual(workspace);
      expect(projected.workspace).not.toBe(workspace);
    });

    it('preserves valid workspace geometry when another field needs projection', () => {
      vi.stubEnv('MODE', 'production');
      const candidate = { ...validPresentation(), workspace, uiScale: Number.NaN };

      const projected = projectReplayPresentation(candidate, null);

      expect(projected.workspace).toEqual(workspace);
      expect(projected.workspace).not.toBe(workspace);
    });

    it.each([
      { ...workspace, width: -1 },
      { ...workspace, height: Number.POSITIVE_INFINITY },
      { ...workspace, width: 1361 },
      { ...workspace, height: 959 },
    ])('falls back to compatible previous geometry when workspace is invalid: %j', (invalid) => {
      vi.stubEnv('MODE', 'production');
      const previous = { ...validPresentation(), workspace };

      const projected = projectReplayPresentation({ ...previous, workspace: invalid }, previous);

      expect(projected.workspace).toEqual(workspace);
      expect(projected.workspace).not.toBe(workspace);
      expect(ReplayPresentationStateSchema.safeParse(projected).success).toBe(true);
    });

    it('drops invalid workspace geometry when the new frame no longer matches the previous workspace', () => {
      vi.stubEnv('MODE', 'production');
      const previous = { ...validPresentation(), workspace };
      const candidate = { ...previous, frame: { width: 1800, height: 960 } };

      const projected = projectReplayPresentation(candidate, previous);

      expect(projected).not.toHaveProperty('workspace');
      expect(projected.frame).toEqual(candidate.frame);
      expect(ReplayPresentationStateSchema.safeParse(projected).success).toBe(true);
    });

    it('drops invalid workspace geometry when there is no previous workspace', () => {
      vi.stubEnv('MODE', 'production');
      const candidate = { ...validPresentation(), workspace: { ...workspace, width: 0 } };

      const projected = projectReplayPresentation(candidate, null);

      expect(projected).not.toHaveProperty('workspace');
    });

    it('preserves absent workspace geometry even when the previous presentation had a workspace', () => {
      vi.stubEnv('MODE', 'production');
      const candidate = { ...validPresentation(), uiScale: Number.NaN };

      const projected = projectReplayPresentation(candidate, { ...validPresentation(), workspace });

      expect(projected).not.toHaveProperty('workspace');
    });
  });

  describe('Mobile layout', () => {
    const mobilePresentation = (): ReplayPresentationState => ({
      ...validPresentation(),
      clientLayoutMode: 'mobile',
      safeAreaInsets: { top: 0, right: 34, bottom: 21, left: 47 },
      // 175% on a DPR 3 phone.
      mobileChromeScale: 1.75 / 3,
      frame: { width: 844, height: 390 },
      insets: { left: 0, right: 0 },
    });

    it('records Mobile as itself, with its safe area and chrome scale', () => {
      const presentation = mobilePresentation();

      expect(projectReplayPresentation(presentation, null)).toBe(presentation);
    });

    it('preserves the actual chrome scale above 16 without falling back for an uneven viewport', () => {
      vi.stubEnv('MODE', 'production');
      const frame = { width: 15356, height: 8636 };
      const safeAreaInsets = { top: 0, right: 0, bottom: 0, left: 0 };
      const mobileChromeScale = osmChromeScale({
        interfaceScaling: 400,
        devicePixelRatio: 0.25,
        viewport: frame,
        safeAreaInsets,
      });
      const presentation = { ...mobilePresentation(), frame, safeAreaInsets, mobileChromeScale };

      expect(mobileChromeScale).toBeGreaterThan(16);
      for (const previous of [null, mobilePresentation()]) {
        const projected = projectReplayPresentation(presentation, previous);

        expect(projected).toBe(presentation);
        expect(projected.mobileChromeScale).toBe(mobileChromeScale);
        expect(ReplayPresentationStateSchema.parse(projected).mobileChromeScale).toBe(mobileChromeScale);
      }
    });

    it('projects every corrupted Mobile field onto something the replay schema accepts', () => {
      vi.stubEnv('MODE', 'production');
      const rejected: string[] = [];
      for (const path of leafPaths(mobilePresentation())) {
        for (const hostile of HOSTILE_VALUES) {
          const candidate = withValueAt(mobilePresentation(), path, hostile);
          const projected = projectReplayPresentation(candidate, mobilePresentation());
          if (!ReplayPresentationStateSchema.safeParse(projected).success) {
            rejected.push(`${path.join('.')} = ${String(hostile)}`);
          }
        }
      }

      expect(rejected).toEqual([]);
    });

    it('keeps the layout and falls back to no insets when the safe area is unusable', () => {
      vi.stubEnv('MODE', 'production');
      const candidate = withValueAt(mobilePresentation(), ['safeAreaInsets', 'left'], Number.NaN);

      const projected = projectReplayPresentation(candidate, null);

      expect(projected.clientLayoutMode).toBe('mobile');
      expect(projected.safeAreaInsets).toEqual({ top: 0, right: 0, bottom: 0, left: 0 });
    });

    it('keeps the last good chrome scale, else the default setting at DPR 1, when the scale is unusable', () => {
      vi.stubEnv('MODE', 'production');
      // 18 exceeds the nominal maximum plus its logical-dimension rounding allowance.
      for (const hostile of [Number.NaN, 0, -1, 18]) {
        const candidate = withValueAt(mobilePresentation(), ['mobileChromeScale'], hostile);

        expect(projectReplayPresentation(candidate, mobilePresentation()).mobileChromeScale).toBe(1.75 / 3);
        // 400% at DPR 1 on the recorded frame and safe area: 503 safe rows bind, 531 screen rows.
        expect(projectReplayPresentation(candidate, null).mobileChromeScale).toBe(390 / 531);
      }
    });

    it('drops the safe area and scale when the layout falls back to one that does not read them', () => {
      vi.stubEnv('MODE', 'production');
      const candidate = withValueAt(mobilePresentation(), ['clientLayoutMode'], 'tablet');

      const projected = projectReplayPresentation(candidate, validPresentation());

      expect(projected.clientLayoutMode).toBe('fixed');
      expect(projected).not.toHaveProperty('safeAreaInsets');
      expect(projected).not.toHaveProperty('mobileChromeScale');
    });
  });

  it('carries a recording of the set timer overlay position through untouched', () => {
    // A recording may position that overlay; the wire schema requires the field, so
    // the value must pass through rather than being dropped as unknown.
    const presentation = withValueAt(validPresentation(), ['panels', 'zukSetTimer'], {
      x: 279,
      y: 74,
      anchorX: 'left',
      anchorY: 'top',
    });

    const projected = projectReplayPresentation(presentation, null);

    expect(projected).toBe(presentation);
    expect(ReplayPresentationStateSchema.safeParse(projected).success).toBe(true);
  });

  it('projects every corrupted field onto something the replay schema accepts', () => {
    vi.stubEnv('MODE', 'production');
    const paths = leafPaths(validPresentation());
    expect(paths.length).toBeGreaterThan(20);

    const rejected: string[] = [];
    for (const path of paths) {
      for (const hostile of HOSTILE_VALUES) {
        const candidate = withValueAt(validPresentation(), path, hostile);
        const projected = projectReplayPresentation(candidate, validPresentation());
        if (!ReplayPresentationStateSchema.safeParse(projected).success) {
          rejected.push(`${path.join('.')} = ${String(hostile)}`);
        }
      }
    }

    expect(rejected).toEqual([]);
  });

  it('prefers the last valid layout to an invented one', () => {
    vi.stubEnv('MODE', 'production');
    const previous = validPresentation();
    const candidate = withValueAt(validPresentation(), ['frame', 'width'], Number.NaN);

    expect(projectReplayPresentation(candidate, previous).frame.width).toBe(previous.frame.width);
  });

  it('keeps the fields that were fine when one of them is not', () => {
    vi.stubEnv('MODE', 'production');
    const candidate = withValueAt(validPresentation(), ['uiScale'], 'huge');

    const projected = projectReplayPresentation(candidate, null);

    expect(projected.panels.gamePanel).toEqual(validPresentation().panels.gamePanel);
    expect(projected.variants.activeGamePanelTab).toBe('prayer');
  });

  it('still produces a valid layout with no previous one to fall back on', () => {
    vi.stubEnv('MODE', 'production');
    const candidate = withValueAt(validPresentation(), ['panels', 'gamePanel'], 'nope');

    expect(ReplayPresentationStateSchema.safeParse(projectReplayPresentation(candidate, null)).success).toBe(true);
  });

  // Production degrades; the suite must not, or drift ships behind the backstop.
  it('throws under test so drift cannot pass silently', () => {
    const candidate = withValueAt(validPresentation(), ['uiScale'], Number.NaN);

    expect(() => projectReplayPresentation(candidate, null)).toThrow(/replay schema/);
  });
});

describe('projectReplayOverlays', () => {
  it('projects every corrupted field onto something the replay schema accepts', () => {
    const rejected: string[] = [];
    for (const path of leafPaths(validOverlays())) {
      for (const hostile of HOSTILE_VALUES) {
        const candidate = withValueAt(validOverlays(), path, hostile);
        const { overlays } = projectReplayOverlays(candidate);
        if (!ReplayOverlaysSchema.safeParse(overlays).success) {
          rejected.push(`${path.join('.')} = ${String(hostile)}`);
        }
      }
    }

    expect(rejected).toEqual([]);
  });

  it('carries a valid tile marker width through untouched', () => {
    const { overlays } = projectReplayOverlays({ ...validOverlays(), tileMarkerWidth: 4.5 });

    expect(overlays.tileMarkerWidth).toBe(4.5);
  });

  // An absent width must produce the default rather than a hole the renderer has to guess at.
  it('defaults the tile marker width when the settings omit it', () => {
    const { tileMarkerWidth: _omitted, ...withoutWidth } = validOverlays();

    const { overlays } = projectReplayOverlays(withoutWidth);

    expect(overlays.tileMarkerWidth).toBe(DEFAULT_TILE_MARKER_WIDTH);
    expect(ReplayOverlaysSchema.safeParse(overlays).success).toBe(true);
  });

  it('replaces a tile marker width the wire cannot carry with the default', () => {
    for (const hostile of [0, -1, 11, Number.NaN, Number.POSITIVE_INFINITY]) {
      const { overlays } = projectReplayOverlays({ ...validOverlays(), tileMarkerWidth: hostile });

      expect(overlays.tileMarkerWidth).toBe(DEFAULT_TILE_MARKER_WIDTH);
    }
  });

  it("carries a marker's own fill through untouched, and a marker without one", () => {
    const { overlays } = projectReplayOverlays(validOverlays());

    expect(overlays.tileMarkers[0].fillOpacity).toBe(0.35);

    const noFill = validOverlays();
    const { fillOpacity: _omitted, ...marker } = noFill.tileMarkers[0];
    const { overlays: plain } = projectReplayOverlays({ ...noFill, tileMarkers: [marker] });

    expect(plain.tileMarkers[0]).not.toHaveProperty('fillOpacity');
    expect(ReplayOverlaysSchema.safeParse(plain).success).toBe(true);
  });

  it('drops a marker it cannot describe and counts it', () => {
    const candidate = validOverlays();
    const withBadMarker: ReplayOverlays = {
      ...candidate,
      tileMarkers: [...candidate.tileMarkers, { x: Number.NaN, y: 4, color: '#FFF', opacity: 1 }],
    };

    const { overlays, omitted } = projectReplayOverlays(withBadMarker);

    expect(overlays.tileMarkers).toHaveLength(1);
    expect(omitted.tileMarkers).toBe(1);
  });

  // A label too long for the wire is not a reason to lose the tile it names.
  it('shortens over-long text instead of dropping the marker', () => {
    const candidate = validOverlays();
    const withLongLabel: ReplayOverlays = {
      ...candidate,
      tileMarkers: [{ x: 1, y: 2, color: '#2F5BFF', opacity: 1, label: 'x'.repeat(500) }],
    };

    const { overlays, omitted } = projectReplayOverlays(withLongLabel);

    expect(overlays.tileMarkers).toHaveLength(1);
    expect(overlays.tileMarkers[0]?.label).toHaveLength(64);
    expect(omitted.tileMarkers).toBe(0);
  });

  it('trims a marker set the format cannot carry without touching the one on screen', () => {
    const tileMarkers = Array.from({ length: 2_100 }, (_, index) => ({
      x: index % 60,
      y: Math.floor(index / 60),
      color: '#2F5BFF',
      opacity: 1,
    }));
    const candidate: ReplayOverlays = { ...validOverlays(), tileMarkers };

    const { overlays, omitted } = projectReplayOverlays(candidate);

    expect(overlays.tileMarkers).toHaveLength(2_048);
    expect(omitted.tileMarkers).toBe(52);
    // The player keeps every marker they placed; only the recording is trimmed.
    expect(candidate.tileMarkers).toHaveLength(2_100);
    expect(ReplayOverlaysSchema.safeParse(overlays).success).toBe(true);
  });
});

describe('presentation schema coverage', () => {
  type WirePanelFilters = NonNullable<ReplayWirePresentationState['variants']['panelPresentation']>['filters'];
  /** Zod outputs mutable arrays; the app's own types are readonly. Neither difference is drift. */
  type DeepMutable<T> = T extends readonly (infer E)[]
    ? DeepMutable<E>[]
    : T extends object
      ? { -readonly [K in keyof T]: DeepMutable<T[K]> }
      : T;
  /** How the schema carries a filter model: every row optional. */
  type SchemaRowsOf<T> = { [K in keyof T]?: T[K] };
  type Exact<A, B> = [A] extends [B] ? ([B] extends [A] ? true : false) : false;

  it('rejects at compile time when a filter row drifts from the schema', () => {
    // A row the schema does not list is dropped from every recording, so playback shows the
    // viewer's value for it. Added, removed, renamed or retyped, it is a compile error here.
    const prayerRowsMatch: Exact<WirePanelFilters['prayer']['filterOptions'], SchemaRowsOf<PrayerFilterOptions>> = true;
    const spellRowsMatch: Exact<
      WirePanelFilters['spellbook']['filterOptions'],
      SchemaRowsOf<SpellFilterOptions>
    > = true;

    expect([prayerRowsMatch, spellRowsMatch]).toEqual([true, true]);
  });

  it('rejects at compile time when the presentation or overlay shape drifts from the schema', () => {
    // The recorder projects the app's own types through these schemas, so a field the schema
    // lacks is a field recordings silently lose.
    const presentationMatches: Exact<
      DeepMutable<ReplayWirePresentationState>,
      DeepMutable<ReplayPresentationState>
    > = true;
    const overlaysMatch: Exact<DeepMutable<ReplayWireOverlays>, DeepMutable<ReplayOverlays>> = true;
    const tileMarkersMatch: Exact<DeepMutable<ReplayWireTileMarker>, DeepMutable<TileMarker>> = true;
    const lineMarkersMatch: Exact<DeepMutable<ReplayWireLineMarker>, DeepMutable<LineMarker>> = true;

    expect([presentationMatches, overlaysMatch, tileMarkersMatch, lineMarkersMatch]).toEqual([true, true, true, true]);
  });
});
