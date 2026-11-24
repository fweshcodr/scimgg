import type { EventAudioPlayer } from '../../audio';
import type { CacheManager, LocWithType } from '../../cache/CacheManager';
import type { OverlayTypeLoader, UnderlayTypeLoader } from '../../rs/config/flotype/FloTypeLoader';
import type { LocModelLoader } from '../../rs/config/loctype/LocModelLoader';
import type { LocationData, LocTypeInfo, LocTypeInfoLoader, MapLoader } from '../../rs/map/MapLoader';
import type { NpcModelLoader } from '../../rs/model/NpcModelLoader';
import type { PlayerAppearance, PlayerEquipment, PlayerModelLoader } from '../../rs/model/PlayerModelLoader';
import type { SpotAnimModelLoader } from '../../rs/model/SpotAnimModelLoader';
import type { AnimationSystem } from '../core/animation';
import type { Projection2D, Viewport } from '../core/camera';
import type { RenderQueue } from '../core/commands';
import type { ImmutableMeshSource } from '../core/meshSource';
import { LobbySceneCompositor } from './lobby/LobbySceneCompositor';
import { loadLobbyBossNpcTypes } from './lobby/lobbyAnimations';
import { LOBBY_LEVEL, LOBBY_MAP_X, LOBBY_MAP_Y } from './lobby/lobbyShared';
import type { CoreSceneBuilder, NpcHitTestData, RenderContext, SceneBuilderLike, TextureIndexMapper } from './types';

export class LobbySceneBuilder implements CoreSceneBuilder {
  private readonly compositor = new LobbySceneCompositor(LOBBY_MAP_X, LOBBY_MAP_Y, LOBBY_LEVEL);
  private npcLoaded = false;

  constructor(
    private readonly cacheManager: CacheManager,
    eventAudioPlayer?: EventAudioPlayer,
  ) {
    if (eventAudioPlayer) {
      this.compositor.setEventAudioPlayer(eventAudioPlayer);
    }
    this.compositor.setGroundItemLoaderSource(cacheManager);
  }

  build(ctx: RenderContext, projection: Projection2D, viewport: Viewport): RenderQueue {
    return this.compositor.build(ctx, projection, viewport);
  }

  async loadTerrain(
    mapLoader: MapLoader,
    underlayLoader?: UnderlayTypeLoader,
    overlayLoader?: OverlayTypeLoader,
    textureIndexMapper?: TextureIndexMapper,
    _locations?: LocationData[],
    _locTypeInfoLoader?: LocTypeInfoLoader,
    smoothTerrain?: boolean,
  ): Promise<void> {
    const additional = await this.cacheManager.loadAdditionalMapSquare(LOBBY_MAP_X, LOBBY_MAP_Y);
    this.compositor.setForcedTerrain(additional.terrain);

    const locsWithTypes = additional.locations ?? undefined;
    const locations = locsWithTypes?.map((entry) => entry.location);
    const locTypeInfoLoader = locsWithTypes ? buildLocTypeInfoLoader(locsWithTypes) : undefined;

    await this.compositor.loadTerrain(
      mapLoader,
      underlayLoader,
      overlayLoader,
      textureIndexMapper,
      locations,
      locTypeInfoLoader,
      smoothTerrain,
    );
  }

  isTerrainLoaded(): boolean {
    return this.compositor.isTerrainLoaded();
  }

  async loadNpc(npcModelLoader: NpcModelLoader, animSystem?: AnimationSystem): Promise<void> {
    if (animSystem) {
      this.compositor.setAnimationSystem(animSystem);
    }

    await loadLobbyBossNpcTypes(this.compositor, npcModelLoader, animSystem);
    this.npcLoaded = true;
  }

  isNpcLoaded(): boolean {
    return this.npcLoaded;
  }

  async loadPlayer(
    playerModelLoader: PlayerModelLoader,
    appearance?: PlayerAppearance,
    equipment?: PlayerEquipment,
  ): Promise<void> {
    await this.compositor.loadPlayer(playerModelLoader, appearance, equipment);
  }

  isPlayerLoaded(): boolean {
    return this.compositor.isPlayerLoaded();
  }

  async loadSpotAnims(spotAnimModelLoader: SpotAnimModelLoader): Promise<void> {
    await this.compositor.loadPlayerGraphicSpotAnims(spotAnimModelLoader);
  }

  isSpotAnimsLoaded(spotAnimModelLoader?: SpotAnimModelLoader): boolean {
    return this.compositor.isPlayerGraphicSpotAnimsLoaded(spotAnimModelLoader);
  }

  getResidentMeshSources(): readonly ImmutableMeshSource[] {
    return this.compositor.getResidentMeshSources();
  }

  async loadLocs(_locModelLoader: LocModelLoader, _locsWithTypes: LocWithType[]): Promise<void> {}

  isLocsLoaded(): boolean {
    return this.compositor.isLocsLoaded();
  }

  setSmoothTerrain(enabled: boolean): void {
    this.compositor.setSmoothTerrain(enabled);
  }

  getTerrainHeights(): Int32Array[] | null {
    return this.compositor.getTerrainHeights();
  }

  getAllNpcHitTestData(): Array<{ actorId: string; hitTestData: NpcHitTestData }> {
    return this.compositor.getAllNpcHitTestData();
  }

  getAllGroundItemHitTestData(): Array<{ groundItemId: string; hitTestData: NpcHitTestData }> {
    return this.compositor.getAllGroundItemHitTestData();
  }

  isIntroAnimationComplete(): boolean {
    return this.compositor.isIntroAnimationComplete();
  }

  getIntroAnimationRemainingMs(expectedSpeedMultiplier: number): number | null {
    return this.compositor.getIntroAnimationRemainingMs(expectedSpeedMultiplier);
  }

  resetIntroState(): void {
    this.compositor.resetIntroState();
  }

  getPrimaryAnimMovementBlock(): { blocksRunning: boolean; blocksWalking: boolean } {
    return this.compositor.getPrimaryAnimMovementBlock();
  }

  dispose(): void {
    this.compositor.dispose();
  }
}

function buildLocTypeInfoLoader(locsWithTypes: LocWithType[]): LocTypeInfoLoader {
  const map = new Map<number, LocTypeInfo>();
  for (const entry of locsWithTypes) {
    if (map.has(entry.location.id)) continue;
    map.set(entry.location.id, {
      clipped: entry.locType.clipped,
      sizeX: entry.locType.sizeX,
      sizeY: entry.locType.sizeY,
    });
  }
  return (locId: number) => map.get(locId);
}

export function createLobbySceneBuilder(options: {
  cacheManager: CacheManager;
  eventAudioPlayer?: EventAudioPlayer;
}): SceneBuilderLike {
  return new LobbySceneBuilder(options.cacheManager, options.eventAudioPlayer);
}
