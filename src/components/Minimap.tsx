import { forwardRef, useCallback, useEffect, useImperativeHandle, useMemo, useRef, useState } from 'react';
import { useReplayPresentation, useReportMinimapZoom } from '../contexts/ReplayPresentationContext';
import type { ReplayClickType } from '../core/ReplayRecorder';
import { DEFAULT_COMPACT_ORBS_POSITION, type UIPosition } from '../hooks/usePersistedSettings';
import {
  OSM_COMPASS_MASK,
  OSM_MAP_COMPASS_FRAME,
  OSM_MAP_CONTAINER,
  OSM_MAP_MINIMAP,
  OSM_ORBS_ORIGIN,
  OSM_XP_ORB,
} from '../layout/osmClientLayout';
import type { OsmFrame } from '../layout/osmFrame';
import {
  FIXED_MINIMAP_BLOCK,
  FIXED_MINIMAP_BLOCK_RECT,
  FIXED_MINIMAP_EDGE_LEFT,
  FIXED_MINIMAP_EDGE_RIGHT,
  FIXED_MINIMAP_FRAME_ORIGIN,
  FIXED_MINIMAP_ORBS_ORIGIN,
  FIXED_MINIMAP_STRIP_BOTTOM,
  FIXED_XP_ORB,
  type Rect,
  scaleRect,
} from '../layout/osrsClientLayout';
import { PlayerVisualTracker } from '../render/core/interpolation';
import { isNpcStandingAt } from '../render/npc/npcStanding';
import { MINIMAP, MOBILE } from '../resourcePack';
import type { ArenaBounds } from '../rs/collision/WalkabilityAnalyzer';
import type { OverlayTypeLoader, UnderlayTypeLoader } from '../rs/config/flotype/FloTypeLoader';
import type { NpcTypeLoader } from '../rs/config/npctype/NpcTypeLoader';
import type { MapLoader, MapSquareData } from '../rs/map/MapLoader';
import type { TextureLoader } from '../rs/texture/TextureLoader';
import {
  type CompactOrbId,
  type CompactOrbsLayout,
  DEFAULT_COMPACT_ORBS_LAYOUT,
  DEFAULT_COMPACT_ORBS_ORDER,
} from '../types/compactOrbs';
import type { SimulationState } from '../types/simulation';
import { animationFrames } from '../util/animationFrames';
import { log } from '../util/Logger';
import { DraggablePanel } from './DraggablePanel';
import { MinimapOrbs } from './MinimapOrbs';
import { COMPACT_ORBS_GEOMETRY, FIXED_ORBS_GEOMETRY, MOBILE_ORBS_GEOMETRY } from './minimapOrbGeometry';
import {
  blendUnderlays,
  buildOverlayMinimapHsls,
  computeTileLights,
  drawMapSquareTerrain,
  MAP_SQUARE_SIZE,
} from './minimapTerrain';
import { PackImage } from './PackImage';
import { PixelSprite } from './PixelSprite';
import { useTooltip, useTooltipScale } from './Tooltip';
import { HoverHintButton } from './ui/HoverHintControl';

interface MinimapProps {
  simulationState: SimulationState;
  mapLoader?: MapLoader;
  underlayLoader?: UnderlayTypeLoader;
  overlayLoader?: OverlayTypeLoader;
  textureLoader?: TextureLoader;
  npcTypeLoader?: NpcTypeLoader;
  minimapNpcDotUrl?: string;
  mapSquare?: { x: number; y: number };
  /** Initial camera yaw for first render. Use the imperative handle for updates. */
  initialCameraYaw?: number;
  speedMultiplier?: number;
  arenaBounds?: ArenaBounds | null;
  hasSpecialAttack: boolean;
  /** See `MinimapOrbsProps.soulreaperStacks`. */
  soulreaperStacks?: number;
  isQuickPrayerActive?: boolean;
  /** Client-predicted prayer activity, including inputs still crossing the lag buffer. */
  hasPredictedPrayer?: boolean;
  isRunEnabled?: boolean;
  isSpecialAttackActive?: boolean;
  pendingSpecialAttackToggles?: number;
  prayerEnabled?: boolean;
  prayerFlickOrbEnabled?: boolean;
  prayerFlickAlwaysOn?: boolean;
  onQuickPrayerToggle?: () => void;
  onQuickPrayerSetup?: () => void;
  onRunToggle: () => void;
  onSpecialAttackToggle: () => void;
  xpDropsEnabled?: boolean;
  onXpDropsToggle?: () => void;
  onReplayCursorClick?: (clientX: number, clientY: number, type: ReplayClickType, nowMs?: number) => void;
  panelPosition?: UIPosition;
  onPanelPositionChange?: (position: UIPosition) => void;
  viewportWidth?: number;
  viewportHeight?: number;
  exclusionRects?: Array<{ left: number; top: number; right: number; bottom: number }>;
  /** Suppresses Alt-drag. Set in fixed layout, where the minimap is pinned to the frame. */
  locked?: boolean;
  fixedLayout?: boolean;
  /**
   * Mobile layout: the map container's CSS rect in the viewport, already snapped in
   * gameframe space. Pins the minimap there, in the mobile client's own surround and
   * orbs; Compact Orbs does not apply, exactly as in fixed.
   */
  mobileContainer?: { readonly frame: OsmFrame; readonly rect: Rect };
  onCompassClick?: () => void;
  /**
   * Compact Orbs plugin: hide the minimap, compass and frame, and pack the
   * four orbs into a compact block. See src/types/compactOrbs.ts.
   *
   * The hidden parts stay MOUNTED (display: none) rather than unmounting.
   * The wheel-zoom listener and the terrain paint are both bound once, to the
   * nodes they find on mount; unmounting them on toggle left the remounted
   * minimap blank with dead wheel zoom.
   */
  compactOrbs?: boolean;
  compactOrbsLayout?: CompactOrbsLayout;
  compactOrbsOrder?: readonly CompactOrbId[];
}

/** Imperative handle for direct DOM updates (bypasses React re-renders). */
export interface MinimapHandle {
  setCameraYaw(yaw: number): void;
}

const MINIMAP_FRAME_WIDTH = 182;
const MINIMAP_FRAME_HEIGHT = 166;
// Frame opening (transparent span): x=[24,175] y=[8,159], diameter=152, center≈(99.5, 83.5).
// Clip slightly larger than measured opening to fully fill the frame.
const MINIMAP_CLIP_SIZE = 154;
const MINIMAP_CLIP_TOP = 7;
const MINIMAP_CLIP_RIGHT = 6;
// Map-circle offset from the frame sprite's OWN left edge, so the clip follows
// the frame wherever a layout places it.
const MINIMAP_CLIP_LEFT = MINIMAP_FRAME_WIDTH - MINIMAP_CLIP_RIGHT - MINIMAP_CLIP_SIZE;
const COMPASS_SIZE = 51;
const COMPASS_CLIP_SIZE = 37;
const ORBS_OVERFLOW_LEFT = 62;
const COMPASS_CLIP_LEFT = 4;
const COMPASS_CLIP_TOP = 4;
const TOTAL_WIDTH = ORBS_OVERFLOW_LEFT + MINIMAP_FRAME_WIDTH;
const TOTAL_HEIGHT = MINIMAP_FRAME_HEIGHT;

/**
 * Fixed mode uses the client's own minimap surround (sprite 1182), which is
 * smaller than the resizable one and shows the map and compass through
 * different holes.
 *
 * Openings are the cache's rects for interface group 548, re-expressed relative
 * to the frame sprite: the map mask (component 22) sits at (54,5) in the
 * 249-wide container and the frame (component 23) at x=29, so the map shows
 * through at (25,5) over 145x151; the compass mask (component 21) at (29,0)
 * over 32x33 lands at (0,0).
 *
 * The frame paints over the map, so the clip may overfill the opening — but only
 * up to the frame's own bounds, since past those there is no stone to hide it.
 * 148 is the largest circle that stays inside 172x156 when centered on the
 * opening, and it covers the circular hole the art actually leaves.
 */
const FIXED_FRAME_WIDTH = 172;
const FIXED_FRAME_HEIGHT = 156;
const FIXED_MAP_OPENING = { x: 25, y: 5, width: 145, height: 151 };
const FIXED_MAP_CLIP_SIZE = 148;
const FIXED_MAP_CLIP_LEFT = Math.round(FIXED_MAP_OPENING.x + FIXED_MAP_OPENING.width / 2 - FIXED_MAP_CLIP_SIZE / 2);
const FIXED_MAP_CLIP_TOP = Math.round(FIXED_MAP_OPENING.y + FIXED_MAP_OPENING.height / 2 - FIXED_MAP_CLIP_SIZE / 2);
const FIXED_COMPASS_CLIP_SIZE = 33;
const FIXED_COMPASS_CLIP_LEFT = 0;
const FIXED_COMPASS_CLIP_TOP = 0;

const DEFAULT_MAP_SQUARE = { x: 23, y: 157 };
const MAP_SIZE = MAP_SQUARE_SIZE;
const TILE_SCALE = 4;
const GRID_SIZE = 1;
const TOTAL_MAP_SIZE = MAP_SIZE * GRID_SIZE;
const CANVAS_SIZE = TOTAL_MAP_SIZE * TILE_SCALE;
const GRID_HALF = Math.floor(GRID_SIZE / 2);
const GRID_TILE_OFFSET = GRID_HALF * MAP_SIZE;

// OSRS minimap zoom: 2 (most zoomed out) to 8 (most zoomed in), default 4. Held in
// those units, not CSS scale, because the aperture differs per layout (154 resizable,
// 148 fixed) and only `minimapCssScale` knows which one the canvas is laid out in.
/** Seeds both `Minimap`'s own zoom and the value App records before one is reported. */
export const DEFAULT_MINIMAP_ZOOM = 4;
const MIN_MINIMAP_ZOOM = 2;
const MAX_MINIMAP_ZOOM = 8;
const MINIMAP_ZOOM_FACTOR = 0.5;

/** CSS scale that puts `osrsZoom` px per tile on a `clipSize`-wide aperture. */
export function minimapCssScale(osrsZoom: number, clipSize: number): number {
  return (osrsZoom * CANVAS_SIZE) / (TILE_SCALE * clipSize);
}

/**
 * Exported so the Alt-key bypass and zoom-clamping math can be unit-tested
 * without a full Minimap render (which requires a heavy `SimulationState` mock).
 *
 * Alt+wheel → no-op. The event bubbles up to DraggablePanel's window-level
 * listener, which uses Alt+wheel as the global UI-scale gesture.
 */
/** Stable identity, so an inert wheel handler does not rebind the listener every render. */
const NO_ZOOM_CHANGE = () => {};

/**
 * The zoom to draw at: the recording's while replaying one that carries it, the viewer's
 * otherwise. Clamped rather than trusted — the replay format bounds this generously so raising
 * MAX_MINIMAP_ZOOM cannot invalidate existing recordings, which leaves a replay free to
 * carry a zoom this build has no transform math for.
 *
 * An ABSENT recorded zoom falls back to the viewer's own, NOT to the default: that is the
 * optional-field rule in src/core/replayPresentation.ts.
 */
export function resolveMinimapZoom(replayZoom: number | undefined, ownZoom: number): number {
  if (replayZoom === undefined) return ownZoom;
  return Math.max(MIN_MINIMAP_ZOOM, Math.min(MAX_MINIMAP_ZOOM, replayZoom));
}

export function createMinimapWheelHandler(
  setMinimapZoom: (updater: (prev: number) => number) => void,
): (e: WheelEvent) => void {
  return (e: WheelEvent) => {
    if (e.altKey) return;
    e.preventDefault();
    e.stopPropagation();
    setMinimapZoom((prev) => {
      const delta = e.deltaY > 0 ? -MINIMAP_ZOOM_FACTOR : MINIMAP_ZOOM_FACTOR;
      return Math.max(MIN_MINIMAP_ZOOM, Math.min(MAX_MINIMAP_ZOOM, prev + delta));
    });
  };
}

export const Minimap = forwardRef<MinimapHandle, MinimapProps>(function Minimap(
  {
    simulationState,
    mapLoader,
    underlayLoader,
    overlayLoader,
    textureLoader,
    npcTypeLoader,
    minimapNpcDotUrl,
    mapSquare,
    initialCameraYaw = 180,
    speedMultiplier = 1,
    arenaBounds,
    hasSpecialAttack,
    soulreaperStacks,
    isQuickPrayerActive,
    hasPredictedPrayer,
    isRunEnabled,
    isSpecialAttackActive,
    pendingSpecialAttackToggles,
    onQuickPrayerToggle,
    onQuickPrayerSetup,
    onRunToggle,
    onSpecialAttackToggle,
    xpDropsEnabled = true,
    onXpDropsToggle,
    onReplayCursorClick,
    panelPosition,
    onPanelPositionChange,
    viewportWidth,
    viewportHeight,
    exclusionRects,
    locked,
    fixedLayout = false,
    mobileContainer,
    onCompassClick,
    compactOrbs = false,
    compactOrbsLayout = DEFAULT_COMPACT_ORBS_LAYOUT,
    compactOrbsOrder = DEFAULT_COMPACT_ORBS_ORDER,
    prayerEnabled = false,
    prayerFlickOrbEnabled = false,
    prayerFlickAlwaysOn = false,
  },
  ref,
) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const compassRef = useRef<HTMLCanvasElement>(null);
  const npcDotRefs = useRef(new Map<string, HTMLElement>());
  const npcTypeEligibilityRef = useRef(new Map<number, boolean>());
  const npcTypeEligibilityLoaderRef = useRef(npcTypeLoader);
  const cameraYawRef = useRef(initialCameraYaw);
  const minimapZoomRef = useRef(DEFAULT_MINIMAP_ZOOM);
  const mapClipSizeRef = useRef(MINIMAP_CLIP_SIZE);
  const playerVisualTrackerRef = useRef<PlayerVisualTracker>(null!);
  if (playerVisualTrackerRef.current === null) {
    const tracker = new PlayerVisualTracker(simulationState.playerPosition[0], simulationState.playerPosition[1]);
    tracker.facingAngle = simulationState.playerFacingAngle;
    playerVisualTrackerRef.current = tracker;
  }
  const lastObservedTickRef = useRef<number>(simulationState.currentTick);
  const speedMultiplierRef = useRef<number>(speedMultiplier);
  const animationFrameRef = useRef<number>(0);
  const lastFrameTimeRef = useRef<number>(animationFrames.clock.now());
  const simulationStateRef = useRef(simulationState);
  const arenaBoundsRef = useRef(arenaBounds);
  const [mapDataGrid, setMapDataGrid] = useState<(MapSquareData | null)[][]>(() =>
    Array.from({ length: GRID_SIZE }, () => Array(GRID_SIZE).fill(null)),
  );
  const [ownMinimapZoom, setMinimapZoom] = useState(DEFAULT_MINIMAP_ZOOM);
  const [xpOrbHovered, setXpOrbHovered] = useState(false);
  const { setScale: setUiScale } = useTooltip();
  const uiScale = useTooltipScale();
  const replayPresentation = useReplayPresentation();
  const reportMinimapZoom = useReportMinimapZoom();
  // Reports what the VIEWER owns, never the override, for the same reason `GamePanel`
  // reports its own modes: recording the override back would leave each replay seeding
  // the zoom of the next recording.
  useEffect(() => {
    reportMinimapZoom(ownMinimapZoom);
  }, [reportMinimapZoom, ownMinimapZoom]);

  const effectiveMapSquare = mapSquare ?? DEFAULT_MAP_SQUARE;
  // Fixed draws a smaller surround with a smaller opening, and the canvas fills
  // whichever one is mounted. Every px-per-tile and centering term below is derived
  // from this rather than from the resizable aperture.
  const mapClipSize = fixedLayout ? FIXED_MAP_CLIP_SIZE : MINIMAP_CLIP_SIZE;
  mapClipSizeRef.current = mapClipSize;
  const replayMinimapZoom = replayPresentation?.variants.minimapZoom;
  const minimapZoom = resolveMinimapZoom(replayMinimapZoom, ownMinimapZoom);
  minimapZoomRef.current = minimapZoom;
  speedMultiplierRef.current = speedMultiplier;
  simulationStateRef.current = simulationState;
  arenaBoundsRef.current = arenaBounds;

  if (npcTypeEligibilityLoaderRef.current !== npcTypeLoader) {
    npcTypeEligibilityLoaderRef.current = npcTypeLoader;
    npcTypeEligibilityRef.current.clear();
  }

  // A queued death keeps its dot while it stands at 0 HP; every dead NPC loses it as its death animation starts.
  const minimapNpcs = simulationState.npcs.filter((npc) => {
    if (!isNpcStandingAt(npc, simulationState.currentTick * 30)) return false;
    if (!npcTypeLoader) return true;

    const cachedEligibility = npcTypeEligibilityRef.current.get(npc.npcTypeId);
    if (cachedEligibility !== undefined) return cachedEligibility;

    try {
      const npcType = npcTypeLoader.load(npc.npcTypeId);
      const isEligible = npcType.drawMapDot && npcType.isInteractable;
      npcTypeEligibilityRef.current.set(npc.npcTypeId, isEligible);
      return isEligible;
    } catch (error) {
      if (!(error instanceof Error)) {
        throw error;
      }
      log.debug('UI', `Failed to load minimap NPC type ${npc.npcTypeId}`, error);
      npcTypeEligibilityRef.current.set(npc.npcTypeId, false);
      return false;
    }
  });

  const clampPlayerToArena = useCallback((x: number, y: number) => {
    const bounds = arenaBoundsRef.current;
    if (!bounds) {
      return [x, y] as const;
    }
    let clampedX = x;
    let clampedY = y;
    if (clampedX < bounds.minX) clampedX = bounds.minX;
    else if (clampedX > bounds.maxX) clampedX = bounds.maxX;
    if (clampedY < bounds.minY) clampedY = bounds.minY;
    else if (clampedY > bounds.maxY) clampedY = bounds.maxY;
    return [clampedX, clampedY] as const;
  }, []);

  const applyMinimapTransforms = useCallback(
    (playerCanvasX: number, playerCanvasY: number, yaw: number, osrsZoom: number, clipSize: number) => {
      const playerPercentX = (playerCanvasX / CANVAS_SIZE) * 100;
      const playerPercentY = (playerCanvasY / CANVAS_SIZE) * 100;
      const translateX = clipSize / 2 - (playerCanvasX / CANVAS_SIZE) * clipSize;
      const translateY = clipSize / 2 - (playerCanvasY / CANVAS_SIZE) * clipSize;
      const scale = minimapCssScale(osrsZoom, clipSize);
      const transform = `translate(${translateX}px, ${translateY}px) scale(${scale}) rotate(${yaw}deg)`;
      const transformOrigin = `${playerPercentX}% ${playerPercentY}%`;

      if (canvasRef.current) {
        canvasRef.current.style.transform = transform;
        canvasRef.current.style.transformOrigin = transformOrigin;
      }
    },
    [],
  );

  useImperativeHandle(
    ref,
    () => ({
      setCameraYaw(yaw: number) {
        cameraYawRef.current = yaw;
        if (compassRef.current) {
          compassRef.current.style.transform = `rotate(${yaw}deg)`;
        }
        const zoom = minimapZoomRef.current;
        const playerVisual = playerVisualTrackerRef.current.advance(0, speedMultiplierRef.current);
        const [visualX, visualY] = clampPlayerToArena(playerVisual.position[0], playerVisual.position[1]);
        const playerCanvasX = (visualX + GRID_TILE_OFFSET) * TILE_SCALE + TILE_SCALE / 2;
        const playerCanvasY = (TOTAL_MAP_SIZE - 1 - (visualY + GRID_TILE_OFFSET)) * TILE_SCALE + TILE_SCALE / 2;
        applyMinimapTransforms(playerCanvasX, playerCanvasY, yaw, zoom, mapClipSizeRef.current);
      },
    }),
    [applyMinimapTransforms, clampPlayerToArena],
  );

  // Inert while a replay owns the zoom: the override masks the write, so scrolling here
  // would only reappear as a changed minimap the moment playback ended.
  const handleMinimapWheel = useMemo(
    () => createMinimapWheelHandler(replayMinimapZoom === undefined ? setMinimapZoom : NO_ZOOM_CHANGE),
    [replayMinimapZoom],
  );

  useEffect(() => {
    const container = mapContainerRef.current;
    if (!container) return;
    container.addEventListener('wheel', handleMinimapWheel, { passive: false });
    return () => container.removeEventListener('wheel', handleMinimapWheel);
  }, [handleMinimapWheel]);

  const blendedUnderlayHslGrid = useMemo(() => {
    return mapDataGrid.map((row) =>
      row.map((data) => (data && underlayLoader ? blendUnderlays(data, underlayLoader, 0) : null)),
    );
  }, [mapDataGrid, underlayLoader]);

  const tileLightsGrid = useMemo(() => {
    return mapDataGrid.map((row) => row.map((data) => (data ? computeTileLights(data, 0) : null)));
  }, [mapDataGrid]);

  const overlayHslMap = useMemo(
    () => (overlayLoader ? buildOverlayMinimapHsls(overlayLoader, textureLoader) : new Map<number, number>()),
    [overlayLoader, textureLoader],
  );

  useEffect(() => {
    if (!mapLoader) return;

    let active = true;

    const loadData = async () => {
      try {
        const grid: (MapSquareData | null)[][] = [];
        for (let dx = -GRID_HALF; dx <= GRID_HALF; dx++) {
          const row: (MapSquareData | null)[] = [];
          for (let dy = -GRID_HALF; dy <= GRID_HALF; dy++) {
            const data = await mapLoader.loadMapSquare(effectiveMapSquare.x + dx, effectiveMapSquare.y + dy);
            row.push(data);
          }
          grid.push(row);
        }
        if (active) {
          setMapDataGrid(grid);
        }
      } catch (error) {
        log.error('UI', 'Failed to load minimap data:', error);
      }
    };

    loadData();

    return () => {
      active = false;
    };
  }, [mapLoader, effectiveMapSquare.x, effectiveMapSquare.y]);

  const terrainImageData = useMemo(() => {
    const hasAnyData = mapDataGrid.some((row) => row.some((data) => data !== null));
    if (!hasAnyData) return null;

    const imgData = new ImageData(CANVAS_SIZE, CANVAS_SIZE);
    const pixels = new Uint32Array(imgData.data.buffer);

    const level = 0;

    for (let gx = 0; gx < GRID_SIZE; gx++) {
      for (let gy = 0; gy < GRID_SIZE; gy++) {
        const mapData = mapDataGrid[gx][gy];
        if (!mapData) {
          continue;
        }

        drawMapSquareTerrain(
          {
            pixels,
            width: CANVAS_SIZE,
            height: CANVAS_SIZE,
            tileScale: TILE_SCALE,
            originX: gx * MAP_SIZE * TILE_SCALE,
            originY: (GRID_SIZE - 1 - gy) * MAP_SIZE * TILE_SCALE,
          },
          mapData,
          blendedUnderlayHslGrid[gx][gy],
          tileLightsGrid[gx][gy],
          overlayHslMap,
          level,
        );
      }
    }

    return imgData;
  }, [mapDataGrid, blendedUnderlayHslGrid, tileLightsGrid, overlayHslMap]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    if (terrainImageData) {
      ctx.putImageData(terrainImageData, 0, 0);
    } else {
      ctx.fillStyle = '#000';
      ctx.fillRect(0, 0, CANVAS_SIZE, CANVAS_SIZE);
      ctx.strokeStyle = '#333';
      ctx.lineWidth = 1;
      ctx.beginPath();
      for (let i = 0; i <= TOTAL_MAP_SIZE; i += 8) {
        const px = i * TILE_SCALE;
        ctx.moveTo(px, 0);
        ctx.lineTo(px, CANVAS_SIZE);
        ctx.moveTo(0, px);
        ctx.lineTo(CANVAS_SIZE, px);
      }
      ctx.stroke();
    }
  }, [terrainImageData]);

  useEffect(() => {
    const render = () => {
      const now = animationFrames.clock.now();
      const deltaTime = Math.min(now - lastFrameTimeRef.current, 50);
      lastFrameTimeRef.current = now;

      const currentState = simulationStateRef.current;
      const tracker = playerVisualTrackerRef.current;

      const previousObservedTick = lastObservedTickRef.current;
      const tickDelta = currentState.currentTick - previousObservedTick;
      if (tickDelta < 0 || tickDelta > 1) {
        // We can't reconstruct intermediate paths, so just reset.
        tracker.reset(currentState.playerPosition[0], currentState.playerPosition[1]);
        tracker.facingAngle = currentState.playerFacingAngle;
        tracker.lastProcessedTick = currentState.currentTick;
      }

      if (currentState.currentTick !== previousObservedTick) {
        lastObservedTickRef.current = currentState.currentTick;
      }

      if (currentState.currentTick !== tracker.lastProcessedTick) {
        tracker.enqueueTickMovement(
          currentState.currentTick,
          currentState.playerMovementPath,
          currentState.playerIsRunning,
        );
        tracker.snapToUnwalkedPlacement(currentState.playerPosition, currentState.playerFacingAngle);
        if (currentState.playerMovementPath.length === 0) {
          tracker.setTargetAngle(currentState.playerFacingAngle);
        }
        tracker.setInteracting(!!currentState.attackTarget);
        tracker.setForcedFacingAngle(currentState.attackTarget ? currentState.playerFacingAngle : null);
      } else {
        // Placed without a tick (a restart from a run still on tick 0, a countdown step, a tick-zero
        // setup edit): the dot follows the state, which is all the minimap reads.
        tracker.snapToUnwalkedPlacement(currentState.playerPosition, currentState.playerFacingAngle);
      }

      const playerVisual = tracker.advance(deltaTime, speedMultiplierRef.current);
      const [visualX, visualY] = clampPlayerToArena(playerVisual.position[0], playerVisual.position[1]);
      const playerCanvasX = (visualX + GRID_TILE_OFFSET) * TILE_SCALE + TILE_SCALE / 2;
      const playerCanvasY = (TOTAL_MAP_SIZE - 1 - (visualY + GRID_TILE_OFFSET)) * TILE_SCALE + TILE_SCALE / 2;
      const clipSize = mapClipSizeRef.current;
      applyMinimapTransforms(playerCanvasX, playerCanvasY, cameraYawRef.current, minimapZoomRef.current, clipSize);

      const state = simulationStateRef.current;
      for (const npc of state.npcs) {
        const npcDot = npcDotRefs.current.get(npc.id);
        if (npcDot) {
          if (!isNpcStandingAt(npc, state.currentTick * 30)) {
            npcDot.style.display = 'none';
            continue;
          }
          const npcCenterX = npc.position[0] + npc.size / 2;
          const npcCenterY = npc.position[1] + npc.size / 2;
          const dtx = npcCenterX - visualX - 0.5;
          const dty = npcCenterY - visualY - 0.5;
          const pxPerTile = minimapZoomRef.current;
          // Screen delta (Y flipped: +Y tile = up = -Y screen)
          const screenDx = dtx * pxPerTile;
          const screenDy = -dty * pxPerTile;
          const yawRad = (cameraYawRef.current * Math.PI) / 180;
          const cosY = Math.cos(yawRad);
          const sinY = Math.sin(yawRad);
          const rx = screenDx * cosY - screenDy * sinY;
          const ry = screenDx * sinY + screenDy * cosY;
          const cx = clipSize / 2 + rx;
          const cy = clipSize / 2 + ry;
          const distSq = rx * rx + ry * ry;
          const clipRadius = clipSize / 2;
          if (distSq <= clipRadius * clipRadius) {
            npcDot.style.display = '';
            npcDot.style.left = `${cx}px`;
            npcDot.style.top = `${cy}px`;
          } else {
            npcDot.style.display = 'none';
          }
        }
      }
      animationFrameRef.current = animationFrames.request(render);
    };

    animationFrameRef.current = animationFrames.request(render);
    return () => animationFrames.cancel(animationFrameRef.current);
  }, [applyMinimapTransforms, clampPlayerToArena]);

  const [initialPlayerX, initialPlayerY] = clampPlayerToArena(
    simulationState.playerPosition[0],
    simulationState.playerPosition[1],
  );
  const initialPlayerCanvasX = (initialPlayerX + GRID_TILE_OFFSET) * TILE_SCALE + TILE_SCALE / 2;
  const initialPlayerCanvasY = (TOTAL_MAP_SIZE - 1 - (initialPlayerY + GRID_TILE_OFFSET)) * TILE_SCALE + TILE_SCALE / 2;
  const initialTranslateX = mapClipSize / 2 - (initialPlayerCanvasX / CANVAS_SIZE) * mapClipSize;
  const initialTranslateY = mapClipSize / 2 - (initialPlayerCanvasY / CANVAS_SIZE) * mapClipSize;
  const initialScale = minimapCssScale(minimapZoom, mapClipSize);
  const initialTransform = `translate(${initialTranslateX}px, ${initialTranslateY}px) scale(${initialScale}) rotate(${cameraYawRef.current}deg)`;
  const initialTransformOrigin = `${(initialPlayerCanvasX / CANVAS_SIZE) * 100}% ${(initialPlayerCanvasY / CANVAS_SIZE) * 100}%`;

  const compactGeometry = COMPACT_ORBS_GEOMETRY[compactOrbsLayout];
  const isMobileLayout = mobileContainer !== undefined;
  // Both pinned layouts ignore Compact Orbs: their blocks are sized by the client frame
  // rather than by the orbs.
  const pinnedLayout = fixedLayout || isMobileLayout;
  const effectiveCompactOrbs = compactOrbs && !pinnedLayout;
  // Fixed's block is a fixed-size slice of the right-hand column, so it cannot
  // shrink to a Compact Orbs block — the column has to stay contiguous.
  const panelWidth = fixedLayout
    ? FIXED_MINIMAP_BLOCK.width
    : isMobileLayout
      ? OSM_MAP_CONTAINER.width
      : effectiveCompactOrbs
        ? compactGeometry.width
        : TOTAL_WIDTH;
  const panelHeight = fixedLayout
    ? FIXED_MINIMAP_BLOCK.height
    : isMobileLayout
      ? OSM_MAP_CONTAINER.height
      : effectiveCompactOrbs
        ? compactGeometry.height
        : TOTAL_HEIGHT;
  // Pinned to the client frame, so the block's physical box is its frame-space
  // rect snapped by `scaleRect` — never `logical * scale`. That is what keeps its
  // bottom edge on the side column's top edge at every scale. See scaleRect.
  const fixedPhysicalSize = useMemo(
    () => (fixedLayout ? scaleRect(FIXED_MINIMAP_BLOCK_RECT, uiScale) : undefined),
    [fixedLayout, uiScale],
  );
  const mobileRect = mobileContainer?.rect;
  const pinnedPhysicalSize = mobileRect ? { width: mobileRect.width, height: mobileRect.height } : fixedPhysicalSize;
  const mobilePosition = useMemo<UIPosition | undefined>(
    () => (mobileRect ? { x: mobileRect.x, y: mobileRect.y, anchorX: 'left', anchorY: 'top' } : undefined),
    [mobileRect],
  );
  // Fixed ignores Compact Orbs outright, exactly as `orbsLayout` below does: its block is sized
  // by the column rather than by the orbs, and the surround this hides is the only thing painting
  // the frame's box — the block has no backing fill, so dropping the guard leaves a black hole
  // where the map was.
  const minimapDisplay = effectiveCompactOrbs ? ('none' as const) : undefined;
  // Everything inside the block is placed off the frame sprite's own corner, so
  // one origin moves the map, the compass and the clip together. Mobile's surround
  // (601:36) is the resizable frame's size with the same map opening, inside
  // MAP_MINIMAP (601:31), which sits 17 columns into the container.
  const frameLeft = fixedLayout
    ? FIXED_MINIMAP_FRAME_ORIGIN.x
    : isMobileLayout
      ? OSM_MAP_MINIMAP.x + OSM_MAP_COMPASS_FRAME.x
      : ORBS_OVERFLOW_LEFT;
  const frameTop = fixedLayout ? FIXED_MINIMAP_FRAME_ORIGIN.y : isMobileLayout ? OSM_MAP_MINIMAP.y : 0;
  // Fixed and mobile draw different surrounds, so the sprite and every hole in it swap together.
  const frameSrc = fixedLayout ? MINIMAP.fixedFrame : isMobileLayout ? MOBILE.mapCompassFrame : MINIMAP.frame;
  const frameWidth = fixedLayout ? FIXED_FRAME_WIDTH : MINIMAP_FRAME_WIDTH;
  const frameHeight = fixedLayout ? FIXED_FRAME_HEIGHT : MINIMAP_FRAME_HEIGHT;
  const mapClipLeft = fixedLayout ? FIXED_MAP_CLIP_LEFT : MINIMAP_CLIP_LEFT;
  const mapClipTop = fixedLayout ? FIXED_MAP_CLIP_TOP : MINIMAP_CLIP_TOP;
  // 601:33, the 35x35 compass mask, is local to MAP_MINIMAP like the frame.
  const compassClipLeft = fixedLayout
    ? FIXED_COMPASS_CLIP_LEFT
    : isMobileLayout
      ? OSM_COMPASS_MASK.x - OSM_MAP_COMPASS_FRAME.x
      : COMPASS_CLIP_LEFT;
  const compassClipTop = fixedLayout
    ? FIXED_COMPASS_CLIP_TOP
    : isMobileLayout
      ? OSM_COMPASS_MASK.y - OSM_MAP_COMPASS_FRAME.y
      : COMPASS_CLIP_TOP;
  const compassClipSize = fixedLayout
    ? FIXED_COMPASS_CLIP_SIZE
    : isMobileLayout
      ? OSM_COMPASS_MASK.width
      : COMPASS_CLIP_SIZE;
  const orbsLayout = fixedLayout
    ? ('fixed' as const)
    : isMobileLayout
      ? ('mobile' as const)
      : effectiveCompactOrbs
        ? compactOrbsLayout
        : ('arc' as const);
  // The pinned layouts draw the XP drops orb as part of their orb group.
  const orbBlock = fixedLayout
    ? { origin: FIXED_MINIMAP_ORBS_ORIGIN, size: FIXED_ORBS_GEOMETRY, xpOrb: FIXED_XP_ORB }
    : isMobileLayout
      ? { origin: OSM_ORBS_ORIGIN, size: MOBILE_ORBS_GEOMETRY, xpOrb: OSM_XP_ORB }
      : null;

  const orbs = (
    <MinimapOrbs
      centerX={ORBS_OVERFLOW_LEFT + 100}
      centerY={84}
      layout={orbsLayout}
      orbOrder={compactOrbsOrder}
      radius={73}
      currentHP={simulationState.playerHP}
      maxHP={simulationState.maxHP}
      poisonVarp={simulationState.poisonVarp}
      currentPrayer={simulationState.prayerState.points}
      isQuickPrayerActive={isQuickPrayerActive}
      hasPredictedPrayer={
        hasPredictedPrayer ??
        (simulationState.pendingProtectionPrayer[1] !== null || simulationState.pendingOffensivePrayer[1] !== null)
      }
      hasCommittedPrayer={simulationState.activePrayer !== null || simulationState.offensivePrayer !== null}
      prayerEnabled={prayerEnabled}
      prayerFlickOrbEnabled={prayerFlickOrbEnabled}
      prayerFlickAlwaysOn={prayerFlickAlwaysOn}
      runEnergy={Math.floor(simulationState.runEnergy.energy / 100)}
      specialAttack={simulationState.specialAttack.energy}
      soulreaperStacks={soulreaperStacks}
      isRunEnabled={isRunEnabled ?? simulationState.isRunEnabled}
      isSpecialAttackActive={
        isSpecialAttackActive ?? simulationState.pendingSpecialAttackActive ?? simulationState.isSpecialAttackActive
      }
      pendingSpecialAttackToggles={
        pendingSpecialAttackToggles ??
        (simulationState.pendingSpecialAttackActive === undefined ? simulationState.pendingSpecialAttackToggles : 0)
      }
      hasSpecialAttack={hasSpecialAttack}
      onQuickPrayerToggle={onQuickPrayerToggle}
      onQuickPrayerSetup={onQuickPrayerSetup}
      onRunToggle={onRunToggle}
      onSpecialAttackToggle={onSpecialAttackToggle}
      onReplayCursorClick={onReplayCursorClick}
    />
  );

  return (
    <DraggablePanel
      inputSurface="gameplay"
      defaultPosition={
        effectiveCompactOrbs ? DEFAULT_COMPACT_ORBS_POSITION : { x: 0, y: 0, anchorX: 'right', anchorY: 'top' }
      }
      position={mobilePosition ?? panelPosition}
      width={panelWidth}
      height={panelHeight}
      scale={mobileContainer?.frame.scale ?? uiScale}
      physicalSize={pinnedPhysicalSize}
      onPositionChange={onPanelPositionChange}
      onScaleChange={setUiScale}
      viewportWidth={viewportWidth}
      viewportHeight={viewportHeight}
      exclusionRects={exclusionRects}
      locked={locked || isMobileLayout}
      scaleEnabled={!pinnedLayout}
      dataTutorial="minimap"
      pointerPassthrough
    >
      <div
        /* Reproduced OSRS client chrome (minimap, compass, orbs), so it takes the
           same no-cursor contract as the GamePanel (--- GamePanel cursor policy ---
           in index.css). */
        className="panel-surface"
        style={{
          position: 'relative',
          width: panelWidth,
          height: panelHeight,
          pointerEvents: 'none',
        }}
        /* A browser page translation rewriting text nodes React owns tears the live game HUD
           down mid-render. The orb readouts change every tick, so they opt out. */
        translate="no"
      >
        {/* The stone the client packs around the surround to fill the column. Together
            with the frame and the top bezel Grid paints over the block, these cover it
            edge to edge — there is no backing fill, and `fixed_mode_side_panel_background`
            could not serve as one anyway (see SideColumnGeometry.backgroundTiled). */}
        {fixedLayout &&
          (
            [
              [MINIMAP.fixedLeftEdge, FIXED_MINIMAP_EDGE_LEFT],
              [MINIMAP.fixedRightEdge, FIXED_MINIMAP_EDGE_RIGHT],
              [MINIMAP.fixedBottom, FIXED_MINIMAP_STRIP_BOTTOM],
            ] as const
          ).map(([src, rect]) => (
            <img
              crossOrigin="anonymous"
              key={src}
              src={src}
              alt=""
              aria-hidden
              style={{
                position: 'absolute',
                left: rect.x,
                top: rect.y,
                width: rect.width,
                height: rect.height,
                pointerEvents: 'none',
                imageRendering: 'pixelated',
                zIndex: 10,
              }}
            />
          ))}
        <div
          style={{
            position: 'absolute',
            display: minimapDisplay,
            left: frameLeft + compassClipLeft,
            top: frameTop + compassClipTop,
            width: compassClipSize,
            height: compassClipSize,
            borderRadius: '50%',
            overflow: 'hidden',
            pointerEvents: 'none',
            zIndex: 8,
          }}
        >
          <PixelSprite
            ref={compassRef}
            src={MINIMAP.compass}
            alt="Compass"
            style={{
              position: 'absolute',
              left: (compassClipSize - COMPASS_SIZE) / 2,
              top: (compassClipSize - COMPASS_SIZE) / 2,
              width: COMPASS_SIZE,
              height: COMPASS_SIZE,
              pointerEvents: 'none',
              transform: `rotate(${cameraYawRef.current}deg)`,
              transformOrigin: 'center center',
              imageRendering: 'pixelated',
            }}
          />
          {onCompassClick && (
            <HoverHintButton
              type="button"
              onMouseDown={(e) => {
                // Trigger on mousedown (matches orb buttons) so the action fires
                // immediately on press rather than waiting for mouseup, which can
                // read as a stutter when the click motion is slow. Pointer-only, and
                // it keeps no focus that would take Space from the game.
                e.preventDefault();
                if (e.button === 0) {
                  onCompassClick();
                }
              }}
              aria-label="Face north"
              hintPlacement="above"
              style={{
                position: 'absolute',
                inset: 0,
                // clip-path matches the visible round compass so the square
                // corners stay click-through.
                clipPath: 'circle(50%)',
                border: 'none',
                background: 'transparent',
                padding: 0,
                margin: 0,
                outline: 'none',
                // 'default' matches the orb buttons - clickable OSRS UI uses the
                // regular cursor, not the pointer/hand cursor.
                cursor: 'default',
                pointerEvents: 'auto',
              }}
            />
          )}
        </div>

        {orbBlock ? (
          <div
            style={{
              position: 'absolute',
              left: orbBlock.origin.x,
              top: orbBlock.origin.y,
              width: orbBlock.size.width,
              height: orbBlock.size.height,
            }}
          >
            <HoverHintButton
              type="button"
              aria-label={xpDropsEnabled ? 'Disable XP drops' : 'Enable XP drops'}
              hintPlacement="above"
              onClick={onXpDropsToggle}
              onMouseEnter={() => setXpOrbHovered(true)}
              onMouseLeave={() => setXpOrbHovered(false)}
              style={{
                position: 'absolute',
                left: orbBlock.xpOrb.x,
                top: orbBlock.xpOrb.y,
                width: orbBlock.xpOrb.width,
                height: orbBlock.xpOrb.height,
                border: 'none',
                background: 'transparent',
                padding: 0,
                margin: 0,
                outline: 'none',
                cursor: 'default',
                pointerEvents: 'auto',
                zIndex: 20,
              }}
            >
              <PackImage
                src={
                  xpDropsEnabled
                    ? xpOrbHovered
                      ? MINIMAP.orbXpActivatedHovered
                      : MINIMAP.orbXpActivated
                    : xpOrbHovered
                      ? MINIMAP.orbXpHovered
                      : MINIMAP.orbXp
                }
                alt=""
                aria-hidden
                width={orbBlock.xpOrb.width}
                height={orbBlock.xpOrb.height}
                style={{ display: 'block', imageRendering: 'pixelated', pointerEvents: 'none' }}
              />
            </HoverHintButton>
            {orbs}
          </div>
        ) : (
          orbs
        )}
        <div
          ref={mapContainerRef}
          data-tutorial="minimap-circle"
          style={{
            position: 'absolute',
            display: minimapDisplay,
            left: frameLeft + mapClipLeft,
            top: frameTop + mapClipTop,
            width: mapClipSize,
            height: mapClipSize,
            borderRadius: '50%',
            // clip-path also clips the hit-test area, so the square corners
            // outside the visible circle are click-through (matches frame opening).
            clipPath: 'circle(50%)',
            overflow: 'hidden',
            backgroundColor: '#000',
            pointerEvents: 'auto',
            zIndex: 5,
          }}
        >
          <canvas
            ref={canvasRef}
            width={CANVAS_SIZE}
            height={CANVAS_SIZE}
            style={{
              width: '100%',
              height: '100%',
              display: 'block',
              transform: initialTransform,
              transformOrigin: initialTransformOrigin,
            }}
          />
          <div
            style={{
              position: 'absolute',
              left: '50%',
              top: '50%',
              width: 3,
              height: 3,
              marginLeft: -1.5,
              marginTop: -1.5,
              backgroundColor: '#ffffff',
              pointerEvents: 'none',
              zIndex: 2,
            }}
          />
          {minimapNpcDotUrl &&
            minimapNpcs.map((npc) => (
              <img
                crossOrigin="anonymous"
                key={npc.id}
                ref={(element) => {
                  if (element) {
                    npcDotRefs.current.set(npc.id, element);
                  } else {
                    npcDotRefs.current.delete(npc.id);
                  }
                }}
                src={minimapNpcDotUrl}
                alt=""
                style={{
                  position: 'absolute',
                  imageRendering: 'pixelated',
                  transform: 'translate(-50%, -50%)',
                  pointerEvents: 'none',
                  zIndex: 2,
                  display: 'none',
                }}
              />
            ))}
          {!minimapNpcDotUrl &&
            minimapNpcs.map((npc) => (
              <div
                key={npc.id}
                ref={(element) => {
                  if (element) {
                    npcDotRefs.current.set(npc.id, element);
                  } else {
                    npcDotRefs.current.delete(npc.id);
                  }
                }}
                style={{
                  position: 'absolute',
                  width: 5,
                  height: 5,
                  marginLeft: -2.5,
                  marginTop: -2.5,
                  backgroundColor: '#ffff00',
                  transform: 'rotate(45deg)',
                  pointerEvents: 'none',
                  zIndex: 2,
                  display: 'none',
                }}
              />
            ))}
        </div>
        <PixelSprite
          src={frameSrc}
          alt=""
          aria-hidden
          width={frameWidth}
          height={frameHeight}
          style={{
            position: 'absolute',
            display: minimapDisplay,
            left: frameLeft,
            top: frameTop,
            pointerEvents: 'none',
            zIndex: 10,
            imageRendering: 'pixelated',
          }}
        />
      </div>
    </DraggablePanel>
  );
});
