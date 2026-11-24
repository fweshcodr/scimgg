// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SimulationEngine } from '../../../core/SimulationEngine';
import { LobbyEncounter } from '../../../encounters/lobby/LobbyEncounter';
import {
  COLOSSEUM_PILLAR_LOC_IDS,
  DEFAULT_PILLAR_ADDITIONS_OPTIONS,
  INFERNO_PILLAR_LOC_IDS,
  type PillarAdditionsOptions,
} from '../../../types/pillarAdditions';
import type { SimulationState } from '../../../types/simulation';
import type { Projection2D } from '../../core/camera';
import { SceneCompositor } from '../SceneCompositor';
import type { RenderContext } from '../types';

const projection: Projection2D = {
  tileToScreen: (tile) => ({ x: tile.x, y: tile.y }),
  tileDeltaToScreen: (delta) => delta,
  screenToTile: () => null,
  tilePolygonScreen: () => [],
};

type Internals = {
  locRenderer: SceneCompositor['locRenderer'];
  createOutlineMesh3D: (x1: number, y1: number, x2: number, y2: number, hsl: number, ...rest: number[]) => unknown;
  pushTileMesh3D: (queue: unknown, x: number, y: number, hsl: number, alpha: number, ...rest: unknown[]) => void;
  hexToPackedHsl: (hex: string) => number;
  syncAndRenderSceneObjects: (...args: unknown[]) => void;
};

type Plugins = { inferno?: Partial<PillarAdditionsOptions>; colosseum?: Partial<PillarAdditionsOptions> };

describe('SceneCompositor Inferno and Colosseum Additions', () => {
  let scene: SceneCompositor;
  let internals: Internals;
  let baseState: SimulationState;

  beforeEach(() => {
    scene = new SceneCompositor();
    internals = scene as unknown as Internals;
    scene['terrainHeights'] = Array.from({ length: 65 }, () => new Int32Array(65));
    baseState = new SimulationEngine({ encounter: new LobbyEncounter(), combatSeed: 1 }).getState();
    standOnePillar();
  });

  // One standing 3x3 Colosseum pillar in the static scenery.
  function standOnePillar(): void {
    vi.spyOn(internals.locRenderer, 'getLocFootprints').mockImplementation((ids) =>
      ids.has(52490) ? [{ locId: 52490, level: 0, x: 24, y: 26, sizeX: 3, sizeY: 3 }] : [],
    );
  }

  afterEach(() => {
    scene.dispose();
    vi.restoreAllMocks();
  });

  function build(plugins: Plugins | null): void {
    const options = (plugin: Partial<PillarAdditionsOptions> | undefined) =>
      plugin ? { ...DEFAULT_PILLAR_ADDITIONS_OPTIONS, ...plugin } : null;
    const context: RenderContext = {
      simulationState: { ...baseState, currentTick: 5 },
      events: [],
      options: {
        renderMode: '3d',
        showCoordinates: false,
        showNpcClickbox: false,
        showTileMarkers: false,
        showTileMarkerLabels: false,
        showLineMarkers: false,
        showLineMarkerLabels: false,
        smoothTerrain: false,
        brightness: 1,
        contrast: 1,
        saturation: 1,
        encounterDebugFlags: {},
        pillarAdditions: plugins ? { inferno: options(plugins.inferno), colosseum: options(plugins.colosseum) } : null,
      },
      interaction: { hoveredTile: null, targetTile: null },
      interpolatedTick: 5,
      speedMultiplier: 1,
    };
    scene.build(context, projection, { width: 800, height: 600, dpr: 1 });
  }

  it("stops drawing each enabled plugin's chosen pillars in the static scenery and the scene objects", () => {
    const staticScenery = vi.spyOn(internals.locRenderer, 'setHiddenLocIds');
    const sceneObjects = vi.spyOn(internals, 'syncAndRenderSceneObjects');
    const hiddenSets = () => [staticScenery.mock.lastCall?.[0], sceneObjects.mock.lastCall?.[5]];
    const sizes = () => hiddenSets().map((set) => (set as ReadonlySet<number>).size);

    build(null);
    expect(sizes()).toEqual([0, 0]);
    build({ inferno: {}, colosseum: {} });
    expect(sizes()).toEqual([0, 0]);
    build({ inferno: { hidePillars: true } });
    expect(hiddenSets()).toEqual([INFERNO_PILLAR_LOC_IDS, INFERNO_PILLAR_LOC_IDS]);
    build({ inferno: {}, colosseum: { hidePillars: true } });
    expect(hiddenSets()).toEqual([COLOSSEUM_PILLAR_LOC_IDS, COLOSSEUM_PILLAR_LOC_IDS]);
    build({ inferno: { hidePillars: true }, colosseum: { hidePillars: true } });
    expect(sizes()).toEqual([
      INFERNO_PILLAR_LOC_IDS.size + COLOSSEUM_PILLAR_LOC_IDS.size,
      INFERNO_PILLAR_LOC_IDS.size + COLOSSEUM_PILLAR_LOC_IDS.size,
    ]);
  });

  describe('pillar tile marks', () => {
    const colour = '#282828';
    const alpha = DEFAULT_PILLAR_ADDITIONS_OPTIONS.pillarTileOpacity;

    function marks(plugin: Partial<PillarAdditionsOptions>, plugins: Plugins = { colosseum: plugin }) {
      const outline = vi.spyOn(internals, 'createOutlineMesh3D');
      const fill = vi.spyOn(internals, 'pushTileMesh3D');
      build(plugins);
      const packed = internals.hexToPackedHsl(colour);
      return {
        outlines: outline.mock.calls
          .filter(([, , , , hsl]) => hsl === packed)
          .map(([x1, y1, x2, y2, , width, , opacity]) => [x1, y1, x2, y2, width, opacity]),
        fills: fill.mock.calls
          .filter(([, , , , , prefix]) => String(prefix).startsWith('pillar-tile-fill'))
          .map(([, x, y, hsl, fillAlpha]) => [x, y, hsl, fillAlpha]),
        packed,
      };
    }

    it('draws a bordered tile by default: one outline round the footprint over a black fill on each tile', () => {
      const { outlines, fills } = marks({});

      expect(outlines).toEqual([[24, 26, 26, 28, 0.04, alpha]]);
      expect(fills).toHaveLength(9);
      expect(new Set(fills.map(([, , hsl, fillAlpha]) => `${hsl}:${fillAlpha}`))).toEqual(new Set([`0:${50 / 255}`]));
      expect(fills.map(([x, y]) => `${x},${y}`)).toContain('26,28');
    });

    it('fills each tile in the color at an alpha of at least 40/255 for Tile fill, with no outline', () => {
      const tileFill = marks({ pillarMarkerStyle: 'tileFill', pillarTileOpacity: 0.1 });

      expect(tileFill.outlines).toEqual([]);
      expect(tileFill.fills).toHaveLength(9);
      expect(tileFill.fills[0]?.slice(2)).toEqual([tileFill.packed, 40 / 255]);
    });

    it('outlines the footprint alone for Line, and marks nothing while marking is off', () => {
      const line = marks({ pillarMarkerStyle: 'line' });
      expect([line.outlines, line.fills]).toEqual([[[24, 26, 26, 28, 0.04, alpha]], []]);

      vi.restoreAllMocks();
      standOnePillar();
      const off = marks({ markPillarTiles: false });
      expect([off.outlines, off.fills]).toEqual([[], []]);
    });

    it('marks a pillar it is not hiding, as the plugin overlay does', () => {
      expect(marks({ hidePillars: false }).outlines).toHaveLength(1);
    });

    it('draws the marks over a standing Inferno pillar, as the plugin overlay does, not hidden under its model', () => {
      // An Inferno pillar is a scene object, not static scenery: its footprint comes from the scene objects.
      const sceneObjects = {
        setTerrainHeights: vi.fn(),
        clear: vi.fn(),
        getLocFootprints: (ids: ReadonlySet<number>) =>
          ids.has(30353) ? [{ locId: 30353, x: 17, y: 37, sizeX: 3, sizeY: 3 }] : [],
      };
      scene['sceneObjectRenderer'] = sceneObjects as unknown as SceneCompositor['sceneObjectRenderer'];
      const context = (inferno: Partial<PillarAdditionsOptions>): RenderContext => ({
        simulationState: { ...baseState, currentTick: 5 },
        events: [],
        options: {
          renderMode: '3d',
          showCoordinates: false,
          showNpcClickbox: false,
          showTileMarkers: false,
          showTileMarkerLabels: false,
          showLineMarkers: false,
          showLineMarkerLabels: false,
          smoothTerrain: false,
          brightness: 1,
          contrast: 1,
          saturation: 1,
          encounterDebugFlags: {},
          pillarAdditions: { inferno: { ...DEFAULT_PILLAR_ADDITIONS_OPTIONS, ...inferno }, colosseum: null },
        },
        interaction: { hoveredTile: null, targetTile: null },
        interpolatedTick: 5,
        speedMultiplier: 1,
      });
      const pillarMarks = (inferno: Partial<PillarAdditionsOptions>) =>
        scene
          .build(context(inferno), projection, { width: 800, height: 600, dpr: 1 })
          .commands.filter(
            (command): command is Extract<typeof command, { kind: 'mesh3d' }> =>
              command.kind === 'mesh3d' &&
              (command.meshId.startsWith('pillar-tile-fill-') ||
                command.meshId.startsWith(`outline-17-37-19-39-${internals.hexToPackedHsl(colour)}-`)),
          );

      // The pillar is drawn by default, so a depth-tested mark would lie under its model.
      const marks = pillarMarks({ hidePillars: false });
      expect(marks).toHaveLength(9 + 1);
      for (const mark of marks) expect(mark.depth).toBe('none');
      expect(pillarMarks({ hidePillars: false, markPillarTiles: false })).toEqual([]);
    });

    it("marks a Colosseum pillar by Colosseum Additions' options alone", () => {
      // Inferno Additions on and marking does not reach the Colosseum's pillars, nor style them.
      expect(marks({}, { inferno: { pillarMarkerStyle: 'tileFill' } })).toMatchObject({ outlines: [], fills: [] });

      vi.restoreAllMocks();
      standOnePillar();
      const line = marks({}, { inferno: { pillarMarkerStyle: 'tileFill' }, colosseum: { pillarMarkerStyle: 'line' } });
      expect([line.outlines, line.fills]).toEqual([[[24, 26, 26, 28, 0.04, alpha]], []]);
    });
  });
});
