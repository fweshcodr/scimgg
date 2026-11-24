import type { RenderQueue } from '../../core/commands';
import { getLocCenterHeight } from '../../shared/renderUtils';
import { buildAmbientHaze, buildAmbientMotes, buildVortexSwirl } from './lobbyAmbientFx';
import { parseLobbyEffectState, pushAnimatedLobbyEffect, pushAnimatedLobbyEffects } from './lobbyAnimations';
import { buildArenaMesh, buildBoundaryGems, buildCenterPoolGlow, buildSteppedStoneRings } from './lobbyArenaBase';
import { buildDebrisMesh, buildFallenColumnsMesh, buildScatteredRubblePiles } from './lobbyArenaProps';
import { buildBossGroundEffects, buildBossSpotlights, buildGodRays, buildPedestalAuras } from './lobbyBossEffects';
import { buildBraziers } from './lobbyBraziers';
import type { EmbeddedMeshCommand, FallenColumnEndpoint } from './lobbyShared';
import { ARENA_CENTER_X, ARENA_CENTER_Y } from './lobbyShared';
import { buildStarfieldMesh } from './lobbySkybox';

export class LobbyArenaRenderer {
  disabledEffects: Set<string> = new Set();
  effectAlphas: Map<string, number> = new Map();

  private nativeMaxAlphas = new Map<string, number>();
  private arenaFloorTilesCommand: EmbeddedMeshCommand | null = null;
  private starSpikesCommand: EmbeddedMeshCommand | null = null;
  private nebulaCommand: EmbeddedMeshCommand | null = null;
  private farStarsCommand: EmbeddedMeshCommand | null = null;
  private midStarsCommand: EmbeddedMeshCommand | null = null;
  private closeStarsCommand: EmbeddedMeshCommand | null = null;
  private shootingStarsCommand: EmbeddedMeshCommand | null = null;
  private bossGroundActiveCommands: EmbeddedMeshCommand[] = [];
  private bossGroundInactiveCommands: EmbeddedMeshCommand[] = [];
  private godRayCommands: EmbeddedMeshCommand[] = [];
  private centerPoolGlowCommand: EmbeddedMeshCommand | null = null;
  private moteCommands: EmbeddedMeshCommand[] = [];
  private bossSpotlightCommands: EmbeddedMeshCommand[] = [];
  private debrisCommand: EmbeddedMeshCommand | null = null;
  private fallenColumnsCommand: EmbeddedMeshCommand | null = null;
  private vortexSwirlCommand: EmbeddedMeshCommand | null = null;
  private ambientHazeCommand: EmbeddedMeshCommand | null = null;
  private boundaryGemsCommand: EmbeddedMeshCommand | null = null;
  private brazierBowlsCommand: EmbeddedMeshCommand | null = null;
  private brazierFlamesCommand: EmbeddedMeshCommand | null = null;
  private scatteredRubbleCommand: EmbeddedMeshCommand | null = null;
  private baseZ = 0;
  private terrainHeights: Int32Array[] | null = null;
  private fallenColumnEndpoints: FallenColumnEndpoint[] = [];

  dispose(): void {
    this.setTerrainHeights(null);
    this.disabledEffects.clear();
    this.effectAlphas.clear();
    this.nativeMaxAlphas.clear();
  }

  setEffectFlags(flags: Record<string, boolean | number>): void {
    const effectState = parseLobbyEffectState(flags);
    this.disabledEffects = effectState.disabledEffects;
    this.effectAlphas = effectState.effectAlphas;
  }

  setTerrainHeights(heights: Int32Array[] | null): void {
    if (this.terrainHeights === heights) {
      return;
    }

    this.terrainHeights = heights;
    this.baseZ = heights
      ? getLocCenterHeight(heights, Math.floor(ARENA_CENTER_X), Math.floor(ARENA_CENTER_Y), 2, 2)
      : 0;
    this.nativeMaxAlphas.clear();
    this.arenaFloorTilesCommand = null;
    this.starSpikesCommand = null;
    this.nebulaCommand = null;
    this.farStarsCommand = null;
    this.midStarsCommand = null;
    this.closeStarsCommand = null;
    this.shootingStarsCommand = null;
    this.bossGroundActiveCommands = [];
    this.bossGroundInactiveCommands = [];
    this.godRayCommands = [];
    this.centerPoolGlowCommand = null;
    this.moteCommands = [];
    this.bossSpotlightCommands = [];
    this.debrisCommand = null;
    this.fallenColumnsCommand = null;
    this.vortexSwirlCommand = null;
    this.ambientHazeCommand = null;
    this.boundaryGemsCommand = null;
    this.brazierBowlsCommand = null;
    this.brazierFlamesCommand = null;
    this.scatteredRubbleCommand = null;
  }

  renderTo(queue: RenderQueue): void {
    if (!this.arenaFloorTilesCommand) {
      const arena = buildArenaMesh(this.baseZ);
      this.arenaFloorTilesCommand = arena.tiles;
      this.starSpikesCommand = arena.starSpikes;

      const [nebula, farStars, midStars, closeStars, shootingStars] = buildStarfieldMesh({ baseZ: this.baseZ });
      this.nebulaCommand = nebula;
      this.farStarsCommand = farStars;
      this.midStarsCommand = midStars;
      this.closeStarsCommand = closeStars;
      this.shootingStarsCommand = shootingStars;

      const bossGround = buildBossGroundEffects(this.baseZ);
      this.bossGroundActiveCommands = bossGround.active;
      this.bossGroundInactiveCommands = bossGround.inactive;
      this.centerPoolGlowCommand = buildCenterPoolGlow(this.baseZ);
      this.godRayCommands = buildGodRays(this.baseZ);
      this.moteCommands = buildAmbientMotes(this.baseZ);
      this.bossSpotlightCommands = buildBossSpotlights(this.baseZ);
      this.debrisCommand = buildDebrisMesh({ baseZ: this.baseZ, fallenColumnEndpoints: this.fallenColumnEndpoints });
      this.fallenColumnsCommand = buildFallenColumnsMesh({
        baseZ: this.baseZ,
        fallenColumnEndpoints: this.fallenColumnEndpoints,
      });
      this.vortexSwirlCommand = buildVortexSwirl(this.baseZ);
      this.ambientHazeCommand = buildAmbientHaze(this.baseZ);
      this.boundaryGemsCommand = buildBoundaryGems(this.baseZ);
      if (this.disabledEffects.has('pedestalAura-preview')) buildPedestalAuras(this.baseZ);
      if (this.disabledEffects.has('steppedRings-preview')) buildSteppedStoneRings(this.baseZ);
      const braziers = buildBraziers(this.baseZ);
      this.brazierBowlsCommand = braziers.opaque;
      this.brazierFlamesCommand = braziers.flames;
      this.scatteredRubbleCommand = buildScatteredRubblePiles({
        baseZ: this.baseZ,
        fallenColumnEndpoints: this.fallenColumnEndpoints,
      });
    }

    const effectOptions = {
      disabledEffects: this.disabledEffects,
      effectAlphas: this.effectAlphas,
      nativeMaxAlphas: this.nativeMaxAlphas,
    };

    pushAnimatedLobbyEffect(queue, 'nebula', this.nebulaCommand, effectOptions);
    pushAnimatedLobbyEffect(queue, 'farStars', this.farStarsCommand, effectOptions);
    pushAnimatedLobbyEffect(queue, 'midStars', this.midStarsCommand, effectOptions);
    pushAnimatedLobbyEffect(queue, 'closeStars', this.closeStarsCommand, effectOptions);
    pushAnimatedLobbyEffect(queue, 'shootingStars', this.shootingStarsCommand, effectOptions);
    pushAnimatedLobbyEffect(queue, 'ambientHaze', this.ambientHazeCommand, effectOptions);
    pushAnimatedLobbyEffect(queue, 'starSpikes', this.starSpikesCommand, effectOptions);
    pushAnimatedLobbyEffect(queue, 'debris', this.debrisCommand, effectOptions);
    pushAnimatedLobbyEffect(queue, 'fallenColumns', this.fallenColumnsCommand, effectOptions);
    pushAnimatedLobbyEffect(queue, 'boundaryGems', this.boundaryGemsCommand, effectOptions);
    pushAnimatedLobbyEffect(queue, 'debris', this.scatteredRubbleCommand, effectOptions);
    pushAnimatedLobbyEffect(queue, 'vortexSwirl', this.vortexSwirlCommand, effectOptions);
    pushAnimatedLobbyEffects(queue, 'bossGroundActive', this.bossGroundActiveCommands, effectOptions);
    pushAnimatedLobbyEffects(queue, 'bossGroundInactive', this.bossGroundInactiveCommands, effectOptions);
    pushAnimatedLobbyEffect(queue, 'arenaFloorTiles', this.arenaFloorTilesCommand, effectOptions);
    pushAnimatedLobbyEffects(queue, 'bossSpotlights', this.bossSpotlightCommands, effectOptions);
    pushAnimatedLobbyEffects(queue, 'godRays', this.godRayCommands, effectOptions);
    pushAnimatedLobbyEffect(queue, 'centerPoolGlow', this.centerPoolGlowCommand, effectOptions);
    pushAnimatedLobbyEffect(queue, 'brazierBowls', this.brazierBowlsCommand, effectOptions);
    pushAnimatedLobbyEffect(queue, 'brazierFlames', this.brazierFlamesCommand, effectOptions);
    pushAnimatedLobbyEffects(queue, 'ambientMotes', this.moteCommands, effectOptions);
  }
}
