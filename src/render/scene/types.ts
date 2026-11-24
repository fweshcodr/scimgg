import type { LocWithType } from '../../cache/CacheManager';
import type { GameEvent } from '../../core/events/types';
import type { ReplayDisplayFrame } from '../../core/ReplayRecorder';
import type { OverlayTypeLoader, UnderlayTypeLoader } from '../../rs/config/flotype/FloTypeLoader';
import type { LocModelLoader } from '../../rs/config/loctype/LocModelLoader';
import type { LocationData, LocTypeInfoLoader, MapLoader } from '../../rs/map/MapLoader';
import type { NpcModelLoader } from '../../rs/model/NpcModelLoader';
import type { PlayerAppearance, PlayerEquipment, PlayerModelLoader } from '../../rs/model/PlayerModelLoader';
import type { SpotAnimModelLoader } from '../../rs/model/SpotAnimModelLoader';
import type { EntityHiderOptions } from '../../types/entityHider';
import type { LineMarker } from '../../types/lineMarkers';
import type { NpcHighlightEntry } from '../../types/npcHighlight';
import type { PillarAdditionsPlugins } from '../../types/pillarAdditions';
import type { RestoredPresentation } from '../../types/restoredPresentation';
import type { Coordinate, SimulationState } from '../../types/simulation';
import type { TileGridStyle } from '../../types/tileGrid';
import type { TileIndicatorConfig } from '../../types/tileIndicators';
import type { TileMarker } from '../../types/tileMarkers';
import type { TzhaarHpTrackerOptions } from '../../types/tzhaarHpTracker';
import type { AnimationSystem } from '../core/animation';
import type { Projection2D, Viewport } from '../core/camera';
import type { RenderQueue } from '../core/commands';
import type { PlayerVisualState } from '../core/interpolation';
import type { ImmutableMeshSource } from '../core/meshSource';
import type { FightStartCountdownPhase } from '../graphics/sceneObjectTypes';
import type { NpcTypeLoadConfig } from '../npc/NpcInstanceManager';
import type { PlayerOverheadNumbers } from '../overlay/UIOverlayRenderer';
import type { ScriptedCameraPose } from '../projections/Projection3D';

export interface SceneOptions {
  renderMode?: '2d' | '3d';
  showCoordinates: boolean;
  /** The Tile Grid plugin's style; absent or `null` when it is off. Drawn in 3D only. */
  tileGrid?: TileGridStyle | null;
  showNpcClickbox: boolean;
  showTileMarkers: boolean;
  showNpcHighlights?: boolean;
  showTileMarkerLabels: boolean;
  /** Tile-marker outline thickness on the shared 0.5–10 UI scale; defaults when absent. */
  tileMarkerWidth?: number;
  showLineMarkers: boolean;
  showLineMarkerLabels: boolean;
  /** Line-marker thickness on the shared 0.5–10 UI scale; defaults when absent. */
  lineMarkerWidth?: number;
  smoothTerrain: boolean;
  playerOverheadNumbers?: PlayerOverheadNumbers;
  showAttackTimerMetronome?: boolean;
  showNpcAttackTimerMetronome?: boolean;
  brightness: number;
  contrast: number;
  saturation: number;
  encounterDebugFlags: Record<string, boolean | number>;
  tileIndicatorConfig?: TileIndicatorConfig;
  /** The Entity Hider plugin's options; absent or `null` while it is off. */
  entityHider?: EntityHiderOptions | null;
  /** The TzHaar HP Tracker plugin's options; absent or `null` while it is off. */
  tzhaarHpTracker?: TzhaarHpTrackerOptions | null;
  /** The Inferno and Colosseum Additions plugins' options, each `null` while it is off. */
  pillarAdditions?: PillarAdditionsPlugins | null;
}

export interface InteractionState {
  hoveredTile: Coordinate | null;
  targetTile: Coordinate | null;
}

/**
 * Encounter-agnostic replay-timeline descriptor. The base SceneCompositor uses
 * `timelineKey` (a stable identity that changes on live↔replay, engine takeover,
 * and scene load) together with the displayed tick to detect timeline
 * discontinuities and drive a uniform resetTransientState across all
 * render/audio participants. `paused` mirrors replay pause (suppresses clock
 * advancement + sound) and is NOT itself a discontinuity.
 */
export interface ReplayTimeline {
  readonly timelineKey: string;
  readonly paused: boolean;
  /** Delayed audio can outlast the final geometry tick, so this clock is not pose-clamped. */
  readonly timeMs?: number;
}

export interface RenderContext {
  restoredPresentation?: RestoredPresentation;
  simulationState: SimulationState;
  events: GameEvent[];
  options: SceneOptions;
  interaction: InteractionState;
  interpolatedTick: number;
  frameDeltaMs?: number;
  speedMultiplier: number;
  playerVisual?: PlayerVisualState;
  tileMarkers?: TileMarker[];
  lineMarkers?: LineMarker[];
  npcHighlights?: NpcHighlightEntry[];
  /**
   * Encounter-agnostic replay-timeline descriptor (see ReplayTimeline). Optional:
   * surfaces that don't supply it (lobby / 2D) still get tick-based rewind /
   * forward-jump detection, just not timeline-key-change detection.
   */
  timeline?: ReplayTimeline;
  replayHistory?: {
    readonly frames: readonly ReplayDisplayFrame[];
    readonly throughFrameIndex: number;
  };
  /** When true, replay is paused — suppress all sound playback (event + frame sounds). */
  replayPaused?: boolean;
  /** The live start-of-fight countdown, passed through to scene-object controllers' frame context. */
  fightStartCountdown?: FightStartCountdownPhase;
}

export type TextureIndexMapper = (textureId: number) => number;

export interface ModelBounds {
  minX: number;
  minY: number;
  minZ: number;
  maxX: number;
  maxY: number;
  maxZ: number;
}

/** Current animated vertex/face data in OSRS model space for click detection. */
export interface NpcHitTestData {
  verticesX: Int32Array;
  verticesY: Int32Array;
  verticesZ: Int32Array;
  verticesCount: number;
  indices1: Int32Array;
  indices2: Int32Array;
  indices3: Int32Array;
  faceCount: number;
  /** Per-face lit color. -2 = invisible (skip). Null = all visible. */
  faceColors3: Int32Array | null;
  /** Model-to-world transform (4x4, column-major). */
  modelMatrix: Float32Array;
  readonly depthBias?: number;
  /**
   * `true` uses the posed model's projected AABB; absent or false uses per-face hit testing.
   */
  useBoundingBox?: boolean;
}

export interface CoreSceneBuilder {
  build(ctx: RenderContext, projection: Projection2D, viewport: Viewport): RenderQueue;
  /** A call while a load is in flight resolves when that load does, never early. */
  loadTerrain(
    mapLoader: MapLoader,
    underlayLoader?: UnderlayTypeLoader,
    overlayLoader?: OverlayTypeLoader,
    textureIndexMapper?: TextureIndexMapper,
    locations?: LocationData[],
    locTypeInfoLoader?: LocTypeInfoLoader,
    smoothTerrain?: boolean,
  ): Promise<void>;
  isTerrainLoaded(): boolean;
  loadNpc(npcModelLoader: NpcModelLoader, animSystem?: AnimationSystem): Promise<void>;
  isNpcLoaded(): boolean;
  loadPlayer(
    playerModelLoader: PlayerModelLoader,
    appearance?: PlayerAppearance,
    equipment?: PlayerEquipment,
  ): Promise<void>;
  isPlayerLoaded(): boolean;
  loadSpotAnims(spotAnimModelLoader: SpotAnimModelLoader): Promise<void>;
  /**
   * With a loader, also requires the effects to have been loaded from that loader, so a replaced
   * loader (a cache reload) reads as not loaded and the scene reloads from the new one.
   */
  isSpotAnimsLoaded(spotAnimModelLoader?: SpotAnimModelLoader): boolean;
  /** Resident GPU sources loaded so far, for the renderer to upload ahead of their first draw. */
  getResidentMeshSources?(): readonly ImmutableMeshSource[];
  loadLocs(locModelLoader: LocModelLoader, locsWithTypes: LocWithType[]): Promise<void>;
  isLocsLoaded(): boolean;
}

export interface SceneBuilderCapabilities {
  setSmoothTerrain(enabled: boolean): void;
  getTerrainHeights(): Int32Array[] | null;

  getAllNpcHitTestData(): Array<{ actorId: string; hitTestData: NpcHitTestData }>;
  getAllGroundItemHitTestData(): Array<{ groundItemId: string; hitTestData: NpcHitTestData }>;
  loadNpcType(
    npcTypeId: number,
    npcModelLoader: NpcModelLoader,
    animSystem?: AnimationSystem,
    config?: NpcTypeLoadConfig,
  ): Promise<void>;
  isNpcTypeLoaded(npcTypeId: number): boolean;

  isIntroAnimationComplete?(): boolean;
  /** Already-speed-adjusted wall-clock ms; null until playing at a built, matching requested tempo. */
  getIntroAnimationRemainingMs?(expectedSpeedMultiplier: number): number | null;
  resetIntroState?(): void;
  getPrimaryAnimMovementBlock?(): { blocksRunning: boolean; blocksWalking: boolean };
  /**
   * An encounter cutscene's hold on the 3D view at `interpolatedTick`, or null for none. Read before
   * the frame's build; derived from the state alone so a replay seek lands on the same frame.
   */
  getCutsceneFrame?(state: SimulationState, interpolatedTick: number): SceneCutsceneFrame | null;
}

/** What a cutscene does to the 3D view this frame. */
export interface SceneCutsceneFrame {
  /** Opacity of a plain black layer over the 3D viewport, 0 to 1. */
  readonly fadeOpacity: number;
  /** The scripted camera, or null to show the player's own. */
  readonly camera: ScriptedCameraPose | null;
}

export type SceneBuilder = CoreSceneBuilder & SceneBuilderCapabilities;

export type SceneBuilderLike = CoreSceneBuilder &
  Partial<SceneBuilderCapabilities> & {
    dispose?(): void;
  };
