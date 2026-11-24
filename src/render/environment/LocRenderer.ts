import type { LocWithType } from '../../cache/CacheManager';
import type { LocModelLoader } from '../../rs/config/loctype/LocModelLoader';
import { LocModelType } from '../../rs/config/loctype/LocModelType';
import type { LocType } from '../../rs/config/loctype/LocType';
import type { SeqType } from '../../rs/config/seqtype/SeqType';
import type { ModelData } from '../../rs/model/ModelData';
import type { SeqFrameLoader } from '../../rs/model/seq/SeqFrameLoader';
import { log } from '../../util/Logger';
import { profiler } from '../../util/Profiler';
import { LocAnimated } from '../backends/picogl/LocAnimated';
import type { AnimationFrames } from '../core/animation';
import type { NpcMesh3DCommand, RenderQueue } from '../core/commands';
import { ImmutableMeshSource, type MeshUploadData } from '../core/meshSource';
import {
  bakeLocFrameGeometry,
  type LocFrameGeometry,
  locFrameGeometryKey,
  placeLocFrameGeometry,
} from './locMeshBaker';
import {
  buildBoundaryDisplacementIndex,
  buildLocModelMatrix,
  type LocModelRequest,
  type LocPlacementDescriptor,
  parseCardinalRotation,
  parseLocMapType,
  resolveBoundaryDisplacement,
  resolveLocPlacement,
} from './locPlacement';
import { resolveLocRenderFilter, resolveRenderLoc } from './locRenderFilter';
import type { LocRenderOptions } from './locRenderOptions';
import {
  createStaticLocCommands,
  finalizeStaticLocModels,
  type StaticLocMesh3DCommand,
  type StaticLocRenderModel,
} from './staticLocFinalizer';
import {
  contourStaticLocModel,
  getStagedLocSourceCategory,
  mergeStagedLocNormals,
  type StagedStaticLoc,
} from './staticLocNormals';

export type { LocRenderOptions } from './locRenderOptions';

const Z_LOC = 1; // Z_LAYERS.BACKGROUND + 1
const SHARED_ANIMATED_LOC_PREFIX = 'loc-anim:';
/** Every scene's merged static scenery is one resident source under this id. */
const STATIC_LOC_SOURCE_ID = 'merged-static-locs';

/** One animated LOC bake in model space, shared by every un-contoured placement of it. */
interface SharedAnimatedLoc {
  readonly frames: LocFrameGeometry;
  readonly frameCount: number;
  readonly seqType: SeqType;
}

/** A staged static model and the (drawn) LOC id it belongs to. */
type StagedLocModel = StaticLocRenderModel & { readonly locId: number };
type ShareLightLocModel = StagedStaticLoc & StagedLocModel;

/** The tiles a static LOC placement stands on, in scene tiles. */
export interface StaticLocFootprint {
  readonly locId: number;
  readonly level: number;
  readonly x: number;
  readonly y: number;
  readonly sizeX: number;
  readonly sizeY: number;
}

const NO_LOC_IDS: ReadonlySet<number> = new Set();

export class LocRenderer {
  private cachedLocMeshes: StaticLocMesh3DCommand[] = [];
  private locsLoading = false;
  /** The last load's inputs, for a rebuild when the hidden LOCs change; null until loaded. */
  private recipe: StaticLocRecipe | null = null;
  /** Every LOC id the static scenery has a model of. */
  private stagedLocIds: ReadonlySet<number> = NO_LOC_IDS;
  /** The ids {@link setHiddenLocIds} asked for, and those of them the merged scenery leaves out. */
  private requestedHiddenLocIds: ReadonlySet<number> = NO_LOC_IDS;
  private excludedLocIds: ReadonlySet<number> = NO_LOC_IDS;
  private footprintsByIds = new Map<ReadonlySet<number>, readonly StaticLocFootprint[]>();

  private animatedLocs: Map<string, LocAnimated> = new Map();
  private animatedLocFrameMeshes: Map<string, NpcMesh3DCommand[][]> = new Map();
  /** The LOC id of each animated placement, by loc key. */
  private animatedLocIds = new Map<string, number>();
  private seqFrameLoader: SeqFrameLoader | null = null;

  private terrainHeights: Int32Array[] | null = null;
  private speedMultiplier = 1;

  dispose(): void {
    this.cachedLocMeshes.length = 0;
    this.locsLoading = false;
    this.recipe = null;
    this.stagedLocIds = NO_LOC_IDS;
    this.requestedHiddenLocIds = NO_LOC_IDS;
    this.excludedLocIds = NO_LOC_IDS;
    this.footprintsByIds.clear();
    this.animatedLocs.clear();
    this.animatedLocFrameMeshes.clear();
    this.animatedLocIds.clear();
    this.seqFrameLoader = null;
    this.terrainHeights = null;
  }

  setTerrainHeights(heights: Int32Array[] | null): void {
    this.terrainHeights = heights;
  }

  setSpeedMultiplier(multiplier: number): void {
    this.speedMultiplier = multiplier;
  }

  isLoaded(): boolean {
    return this.cachedLocMeshes.length > 0;
  }

  async load(locModelLoader: LocModelLoader, locsWithTypes: LocWithType[], options?: LocRenderOptions): Promise<void> {
    if (this.cachedLocMeshes.length > 0 || this.locsLoading) {
      return;
    }

    profiler.start('LocRenderer.load');
    this.locsLoading = true;
    this.seqFrameLoader = locModelLoader.getSeqFrameLoader();

    try {
      const animatedFallbacks = new Map<string, number>();
      const recipe: StaticLocRecipe = {
        loader: locModelLoader,
        locs: [...locsWithTypes],
        options,
        terrainHeights: this.terrainHeights,
        animatedFallbacks,
      };
      const staged = stageStaticLocModels(recipe, this.createAnimatedLocPlacer(locModelLoader, animatedFallbacks));
      this.recipe = recipe;
      this.stagedLocIds = new Set(staged.map((model) => model.locId));
      this.footprintsByIds.clear();
      this.buildMergedScenery(staged, this.presentHiddenLocIds(this.requestedHiddenLocIds));

      profiler.end('LocRenderer.load');
    } catch (error) {
      profiler.end('LocRenderer.load');
      log.error('LocRenderer', 'Failed to load loc meshes', error);
      throw error;
    } finally {
      this.locsLoading = false;
    }
  }

  /**
   * Stops drawing every placement of `locIds`, static or animated; a presentation setting, so call it
   * every frame with the current choice. Static ones are left out of the merged scenery, which is
   * rebuilt (as a RuneLite plugin reloads the scene) only when the set of hidden ids it actually
   * holds changes: with none of them present, or none hidden, it is the scene's ordinary build.
   */
  setHiddenLocIds(locIds: ReadonlySet<number>): void {
    if (locIds === this.requestedHiddenLocIds) return;
    this.requestedHiddenLocIds = locIds;
    const excluded = this.presentHiddenLocIds(locIds);
    if (!this.recipe || sameLocIds(excluded, this.excludedLocIds)) return;
    const recipe = this.recipe;
    this.buildMergedScenery(
      stageStaticLocModels(recipe, ({ locKey }) => recipe.animatedFallbacks.get(locKey) ?? null),
      excluded,
    );
  }

  /** Where each rendered static placement of `locIds` stands, footprint turned with it, hidden or not. */
  getLocFootprints(locIds: ReadonlySet<number>): readonly StaticLocFootprint[] {
    if (!this.recipe) return [];
    let footprints = this.footprintsByIds.get(locIds);
    if (!footprints) {
      footprints = resolveStaticLocFootprints(this.recipe, locIds);
      this.footprintsByIds.set(locIds, footprints);
    }
    return footprints;
  }

  private presentHiddenLocIds(locIds: ReadonlySet<number>): ReadonlySet<number> {
    if (locIds.size === 0) return NO_LOC_IDS;
    const present = [...locIds].filter((locId) => this.stagedLocIds.has(locId));
    return present.length === 0 ? NO_LOC_IDS : new Set(present);
  }

  private buildMergedScenery(staged: readonly StagedLocModel[], excluded: ReadonlySet<number>): void {
    if (!this.recipe) return;
    const kept = excluded.size === 0 ? staged : staged.filter((model) => !excluded.has(model.locId));
    const source = createStaticLocSource(this.recipe, excluded, finalizeStaticLocModels(kept));
    this.cachedLocMeshes = createStaticLocCommands(source);
    this.excludedLocIds = excluded;
  }

  /**
   * Bakes each animated placement into shared frame geometry and its own animation state. A
   * placement whose sequence has no frames draws static; its height offset is recorded so the
   * static scenery can be rebuilt later without loading the frames again.
   */
  private createAnimatedLocPlacer(locModelLoader: LocModelLoader, fallbacks: Map<string, number>): PlaceAnimatedLoc {
    // Placements hold the arrays they draw, so the cache only has to outlive one load.
    const sharedAnimatedGeometry = new Map<string, SharedAnimatedLoc>();
    const cycle = performance.now() / 20;

    return ({ locKey, location, locType, request, placement, terrainHeights, terrainLocalX, terrainLocalY }) => {
      // Contoured frames are bent to the terrain under this placement, so they cannot be shared.
      const contoured = locType.contouredGround >= 0;
      const geometryKey = contoured
        ? null
        : locFrameGeometryKey(location.id, request.modelType, request.rotation, locType.seqId);
      let animated = geometryKey ? sharedAnimatedGeometry.get(geometryKey) : undefined;
      let animData: ReturnType<LocModelLoader['loadAnimatedLocMeshFrames']>;
      if (!animated) {
        animData = locModelLoader.loadAnimatedLocMeshFrames(
          location.id,
          request.modelType,
          request.rotation,
          locType.seqId,
        );
        if (animData && animData.frames.length > 0) {
          animated = {
            frames: bakeLocFrameGeometry({
              frames: animData.frames,
              locKey: geometryKey ? `${SHARED_ANIMATED_LOC_PREFIX}${geometryKey}` : locKey,
              ...(contoured
                ? {
                    contour: {
                      terrainHeights,
                      terrainLocalX,
                      terrainLocalY,
                      footprint: placement.terrainFootprint,
                      contouredGround: locType.contouredGround,
                    },
                  }
                : {}),
            }),
            frameCount: animData.frames.length,
            seqType: animData.seqType,
          };
          if (geometryKey) sharedAnimatedGeometry.set(geometryKey, animated);
        }
      }
      if (animated) {
        const frameMeshes = placeLocFrameGeometry(animated.frames, {
          modelMatrix: buildLocModelMatrix({
            placement,
            localX: location.localX,
            localY: location.localY,
            terrainLocalX,
            terrainLocalY,
            terrainHeights,
            animationHeightOffset: animated.seqType.heightOffset,
          }),
          zIndex: Z_LOC,
        });
        this.animatedLocFrameMeshes.set(locKey, frameMeshes);
        this.animatedLocIds.set(locKey, location.id);
        const dummyDrawRanges: AnimationFrames = {
          frames: Array.from({ length: animated.frameCount }, (_, i) => [i, 0, 0] as [number, number, number]),
        };
        this.animatedLocs.set(locKey, new LocAnimated(0, dummyDrawRanges, animated.seqType, cycle, true));
        return null;
      }
      const fallbackHeightOffset =
        animData?.seqType.heightOffset ?? locModelLoader.loadSeqType(locType.seqId)?.heightOffset ?? 0;
      fallbacks.set(locKey, fallbackHeightOffset);
      return fallbackHeightOffset;
    };
  }

  renderLocs(queue: RenderQueue): void {
    for (const locMesh of this.cachedLocMeshes) {
      queue.commands.push(locMesh);
    }

    this.renderAnimatedLocs(queue);
  }

  private renderAnimatedLocs(queue: RenderQueue): void {
    if (this.animatedLocs.size === 0) {
      return;
    }
    const hidden = this.requestedHiddenLocIds;

    const cycle = performance.now() / (20 / this.speedMultiplier);

    for (const [locKey, locAnimated] of this.animatedLocs) {
      if (hidden.size > 0 && hidden.has(this.animatedLocIds.get(locKey) ?? -1)) continue;
      const frameMeshes = this.animatedLocFrameMeshes.get(locKey);
      if (!frameMeshes || frameMeshes.length === 0) {
        log.warn('LocRenderer', `No frame meshes for ${locKey}`);
        continue;
      }

      if (this.seqFrameLoader) {
        locAnimated.update(this.seqFrameLoader, cycle);
      }

      const frameIndex = Math.floor(locAnimated.frame) % frameMeshes.length;
      const meshCommands = frameMeshes[frameIndex];

      if (meshCommands) {
        for (const cmd of meshCommands) {
          queue.commands.push(cmd);
        }
      }
    }
  }
}

/** A placement of an animated LOC type, as {@link stageStaticLocModels} hands it out. */
interface AnimatedLocPlacement {
  readonly locKey: string;
  readonly location: LocWithType['location'];
  readonly locType: LocType;
  readonly request: LocModelRequest;
  readonly placement: LocPlacementDescriptor;
  readonly terrainHeights: Int32Array[] | null;
  readonly terrainLocalX: number;
  readonly terrainLocalY: number;
}

/** Takes an animated placement and returns null, or the animation height offset to draw it static at. */
type PlaceAnimatedLoc = (placement: AnimatedLocPlacement) => number | null;

/**
 * Everything the merged static scenery is built from, all of it retained anyway by the scene or
 * the cache: the loader, the map's placements and terrain, and the load's animated-loc outcome.
 */
interface StaticLocRecipe {
  readonly loader: LocModelLoader;
  readonly locs: readonly LocWithType[];
  readonly options: LocRenderOptions | undefined;
  readonly terrainHeights: Int32Array[] | null;
  /** Height offsets of animated placements that fell back to static, by loc key. */
  readonly animatedFallbacks: ReadonlyMap<string, number>;
}

/**
 * The static scenery's resident source, without the `excluded` LOC ids. Its own function so the
 * rebuild closure's scope holds the recipe and that set and nothing else: not the first build,
 * and not the staged models.
 */
function createStaticLocSource(
  recipe: StaticLocRecipe,
  excluded: ReadonlySet<number>,
  firstBuild: readonly MeshUploadData[],
): ImmutableMeshSource {
  return new ImmutableMeshSource(STATIC_LOC_SOURCE_ID, firstBuild, () => {
    const staged = stageStaticLocModels(recipe, ({ locKey }) => recipe.animatedFallbacks.get(locKey) ?? null);
    return finalizeStaticLocModels(excluded.size === 0 ? staged : staged.filter((model) => !excluded.has(model.locId)));
  });
}

function sameLocIds(left: ReadonlySet<number>, right: ReadonlySet<number>): boolean {
  if (left.size !== right.size) return false;
  for (const locId of left) if (!right.has(locId)) return false;
  return true;
}

/** Where each rendered static placement of `locIds` stands, footprint turned with it. */
function resolveStaticLocFootprints(recipe: StaticLocRecipe, locIds: ReadonlySet<number>): StaticLocFootprint[] {
  if (locIds.size === 0) return [];
  const filter = resolveLocRenderFilter(recipe.options);
  const footprints: StaticLocFootprint[] = [];
  for (const entry of recipe.locs) {
    const resolved = resolveRenderLoc(entry, filter, recipe.loader);
    if (!resolved || !locIds.has(resolved.location.id)) continue;
    const { location, locType } = resolved;
    const type = parseLocMapType(location.type);
    const rotation = parseCardinalRotation(location.rotation);
    if (type === null || rotation === null) continue;
    const { sceneFootprint } = resolveLocPlacement({
      type,
      rotation,
      sizeX: locType.sizeX,
      sizeY: locType.sizeY,
      boundaryDisplacement: 0,
    });
    footprints.push({
      locId: location.id,
      level: location.level,
      x: location.localX,
      y: location.localY,
      sizeX: sceneFootprint.sizeX,
      sizeY: sceneFootprint.sizeY,
    });
  }
  return footprints;
}

/**
 * Resolves, places, contours and normal-merges every static LOC model part in map order. Animated
 * placements go to `placeAnimated`, which either takes them or names the offset to draw them static.
 */
function stageStaticLocModels(recipe: StaticLocRecipe, placeAnimated: PlaceAnimatedLoc): StagedLocModel[] {
  const { loader: locModelLoader, locs: locsWithTypes } = recipe;
  const stagedLocModels: StagedLocModel[] = [];
  const shareLightLocModels: ShareLightLocModel[] = [];
  const ordinaryModelCache = new Map<string, ModelData>();
  const boundaryDisplacements = buildBoundaryDisplacementIndex(locsWithTypes);

  const filter = resolveLocRenderFilter(recipe.options);

  for (const [objectIndex, locWithType] of locsWithTypes.entries()) {
    const resolved = resolveRenderLoc(locWithType, filter, locModelLoader);
    if (!resolved) {
      continue;
    }
    const { location, locType } = resolved;

    const sourceType = parseLocMapType(location.type);
    const sourceRotation = parseCardinalRotation(location.rotation);
    if (sourceType === null || sourceRotation === null) {
      continue;
    }
    const terrainHeights =
      locWithType.terrainHeightPlanes?.[location.level] ?? (location.level === 0 ? recipe.terrainHeights : null);
    const terrainLocalX = location.localX - locWithType.mapSquareOffset.x + locWithType.terrainContextOrigin.x;
    const terrainLocalY = location.localY - locWithType.mapSquareOffset.y + locWithType.terrainContextOrigin.y;

    const boundaryDisplacement = resolveBoundaryDisplacement(boundaryDisplacements, location);
    const placement = resolveLocPlacement({
      type: sourceType,
      rotation: sourceRotation,
      sizeX: locType.sizeX,
      sizeY: locType.sizeY,
      boundaryDisplacement,
    });
    const stagedSourceCategory = getStagedLocSourceCategory(sourceType);
    const isAnimated = locType.seqId !== -1;

    for (const [partIndex, request] of placement.modelRequests.entries()) {
      const locKey = [
        'loc',
        location.id,
        location.level,
        location.localX,
        location.localY,
        'source',
        sourceType,
        'model',
        request.modelType,
        'rotation',
        request.rotation,
        'part',
        partIndex,
      ].join('-');
      let fallbackAnimationHeightOffset = 0;

      if (isAnimated) {
        const fallback = placeAnimated({
          locKey,
          location,
          locType,
          request,
          placement,
          terrainHeights,
          terrainLocalX,
          terrainLocalY,
        });
        if (fallback === null) continue;
        fallbackAnimationHeightOffset = fallback;
      }

      const modelMatrix = buildLocModelMatrix({
        placement,
        localX: location.localX,
        localY: location.localY,
        terrainLocalX,
        terrainLocalY,
        terrainHeights,
        animationHeightOffset: fallbackAnimationHeightOffset,
      });

      const sharesLight = Boolean(locType.mergeNormals && !isAnimated && stagedSourceCategory);
      const ordinaryModelKey =
        !sharesLight && locType.contouredGround < 0 ? `${location.id}:${request.modelType}:${request.rotation}` : null;
      let model = ordinaryModelKey ? ordinaryModelCache.get(ordinaryModelKey) : undefined;
      if (!model) {
        model = locModelLoader.getLocModelData(locType, request.modelType, request.rotation);
        if (!model) continue;
        if (request.modelType === LocModelType.NORMAL && request.rotation > 3) model.rotate(256);
        if (ordinaryModelKey) ordinaryModelCache.set(ordinaryModelKey, model);
      }
      contourStaticLocModel({
        model,
        terrainHeights,
        terrainLocalX,
        terrainLocalY,
        footprint: placement.terrainFootprint,
        contouredGround: locType.contouredGround,
      });
      const staticModel: StagedLocModel = {
        locId: location.id,
        model,
        modelMatrix,
        ambient: locType.ambient + 64,
        contrast: locType.contrast + 768,
      };

      if (sharesLight && stagedSourceCategory) {
        shareLightLocModels.push({
          objectIndex,
          partIndex,
          sourceCategory: stagedSourceCategory,
          level: location.level,
          tileX: location.localX,
          tileY: location.localY,
          sizeX: placement.sceneFootprint.sizeX,
          sizeY: placement.sceneFootprint.sizeY,
          sceneOffsetX: placement.sceneOffset.x,
          sceneOffsetY: placement.sceneOffset.y,
          terrainHeightPlanes: locWithType.terrainHeightPlanes,
          mapSquareOffsetX: locWithType.mapSquareOffset.x,
          mapSquareOffsetY: locWithType.mapSquareOffset.y,
          terrainContextOriginX: locWithType.terrainContextOrigin.x,
          terrainContextOriginY: locWithType.terrainContextOrigin.y,
          ...staticModel,
        });
        continue;
      }
      stagedLocModels.push(staticModel);
    }
  }

  mergeStagedLocNormals(shareLightLocModels);
  stagedLocModels.push(...shareLightLocModels);
  return stagedLocModels;
}
