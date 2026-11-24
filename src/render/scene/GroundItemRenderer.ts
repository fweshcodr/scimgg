import { locModelDataToMesh } from '../../rs/config/loctype/LocModelLoader';
import type { ObjTypeLoader } from '../../rs/config/objtype/ObjTypeLoader';
import { ModelData } from '../../rs/model/ModelData';
import type { ModelLoader } from '../../rs/model/ModelLoader';
import type { GroundItem } from '../../types/groundItems';
import { log } from '../../util/Logger';
import type { NpcMesh3DCommand, RenderQueue } from '../core/commands';
import { sharedModelTextureIndex } from '../core/modelTextures';
import { splitTriangleSoupByAlpha, type TriangleSoup } from '../core/splitMeshByAlpha';
import { getLocCenterHeight } from '../shared/renderUtils';
import { groupGroundItemsByTile, selectGroundItemPile } from './groundItemPile';
import { buildGroundItemModelMatrix } from './groundItemPlacement';
import type { NpcHitTestData } from './types';

type GroundItemModel = {
  readonly model: ModelData;
  readonly faceColors3: Int32Array;
  readonly commandTemplates: readonly NpcMesh3DCommand[];
};

type GroundItemInstance = {
  readonly itemId: number;
  readonly model: GroundItemModel;
  readonly commands: NpcMesh3DCommand[];
  modelMatrix: Float32Array;
  /** 0 bottom, 1 middle, 2 top — the client's draw order within one tile's pile. */
  drawOrder: number;
  /** The pile a click on this model resolves to: the tile's most valuable obj. */
  takeTargetId: string;
};

const IDENTITY_MATRIX = new Float32Array([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]);

export class GroundItemRenderer {
  private objTypeLoader: ObjTypeLoader | null = null;
  private modelLoader: ModelLoader | null = null;
  private readonly modelCache = new Map<number, GroundItemModel | null>();
  private readonly instances = new Map<string, GroundItemInstance>();

  setLoaders(objTypeLoader: ObjTypeLoader | null, modelLoader: ModelLoader | null): void {
    if (this.objTypeLoader === objTypeLoader && this.modelLoader === modelLoader) return;
    this.objTypeLoader = objTypeLoader;
    this.modelLoader = modelLoader;
    this.modelCache.clear();
    this.instances.clear();
  }

  sync(groundItems: readonly GroundItem[], terrainHeights: Int32Array[] | null): void {
    if (!this.objTypeLoader || !this.modelLoader) {
      this.instances.clear();
      return;
    }

    const seenIds = new Set<string>();

    for (const piles of groupGroundItemsByTile(groundItems).values()) {
      const selection = selectGroundItemPile(piles, (itemId, quantity) => this.pileValue(itemId, quantity));
      if (!selection) continue;

      // Bottom, middle, top — all at the tile center, drawn in that order, exactly
      // as the client draws its three obj-stack renderables.
      const drawn = [selection.bottom, selection.middle, selection.top];
      for (let drawOrder = 0; drawOrder < drawn.length; drawOrder++) {
        const groundItem = drawn[drawOrder];
        if (!groundItem) continue;

        const model = this.getOrBakeModel(groundItem.itemId);
        if (!model) {
          this.instances.delete(groundItem.id);
          continue;
        }

        seenIds.add(groundItem.id);
        const terrainHeight = getLocCenterHeight(terrainHeights, groundItem.position[0], groundItem.position[1], 1, 1);
        const modelMatrix = buildGroundItemModelMatrix({ position: groundItem.position, terrainHeight });
        let instance = this.instances.get(groundItem.id);
        if (!instance || instance.itemId !== groundItem.itemId) {
          instance = this.createInstance(groundItem.id, groundItem.itemId, model, modelMatrix);
          this.instances.set(groundItem.id, instance);
        } else {
          instance.modelMatrix = modelMatrix;
          for (const command of instance.commands) {
            command.modelMatrix = modelMatrix;
          }
        }
        instance.drawOrder = drawOrder;
        instance.takeTargetId = selection.top.id;
      }
    }

    for (const groundItemId of this.instances.keys()) {
      if (!seenIds.has(groundItemId)) this.instances.delete(groundItemId);
    }
  }

  /**
   * The obj-stack score (unsourced; see groundItemPile.ts): an obj's `cost`, multiplied
   * by `count + 1` when it is stackable, so a big stack of a cheap item can still head the pile.
   */
  private pileValue(itemId: number, quantity: number): number {
    try {
      const objType = this.objTypeLoader?.load(itemId);
      if (!objType) return 0;
      return objType.stackable ? objType.cost * (quantity + 1) : objType.cost;
    } catch {
      return 0;
    }
  }

  render(queue: RenderQueue): void {
    // Bottom before top: the models sit on the same point, so the order they are
    // queued in is what decides which one reads as being on top of the pile.
    const ordered = [...this.instances.values()].sort((left, right) => left.drawOrder - right.drawOrder);
    for (const instance of ordered) {
      queue.commands.push(...instance.commands);
    }
  }

  getAllHitTestData(): Array<{ groundItemId: string; hitTestData: NpcHitTestData }> {
    const hitTestData: Array<{ groundItemId: string; hitTestData: NpcHitTestData }> = [];
    for (const instance of this.instances.values()) {
      const { model } = instance.model;
      hitTestData.push({
        // Every model in a pile answers for the whole pile: a click on the stack
        // takes its most valuable obj.
        groundItemId: instance.takeTargetId,
        hitTestData: {
          verticesX: model.verticesX,
          verticesY: model.verticesY,
          verticesZ: model.verticesZ,
          verticesCount: model.verticesCount,
          indices1: model.indices1,
          indices2: model.indices2,
          indices3: model.indices3,
          faceCount: model.faceCount,
          faceColors3: instance.model.faceColors3,
          modelMatrix: instance.modelMatrix,
          useBoundingBox: true,
        },
      });
    }
    return hitTestData;
  }

  dispose(): void {
    this.modelCache.clear();
    this.instances.clear();
    this.objTypeLoader = null;
    this.modelLoader = null;
  }

  private getOrBakeModel(itemId: number): GroundItemModel | null {
    const cached = this.modelCache.get(itemId);
    if (cached !== undefined) return cached;
    const baked = this.bakeModel(itemId);
    this.modelCache.set(itemId, baked);
    return baked;
  }

  private bakeModel(itemId: number): GroundItemModel | null {
    try {
      const objType = this.objTypeLoader?.load(itemId);
      const sourceModel = objType && this.modelLoader?.getModel(objType.inventoryModel);
      if (!objType || !sourceModel) {
        log.debug('SceneBuilder', 'Skipping ground item with no cache model', { itemId });
        return null;
      }

      const model = ModelData.copyFrom(sourceModel, false, false, false, false);
      if (objType.recolorFrom && objType.recolorTo) {
        for (let index = 0; index < objType.recolorFrom.length; index++) {
          model.recolor(objType.recolorFrom[index], objType.recolorTo[index]);
        }
      }
      if (objType.retextureFrom && objType.retextureTo) {
        for (let index = 0; index < objType.retextureFrom.length; index++) {
          model.retexture(objType.retextureFrom[index], objType.retextureTo[index]);
        }
      }

      const litColors = model.computeLitColors(64, 768, -50, -10, -50);
      const mesh = locModelDataToMesh(model, litColors, sharedModelTextureIndex.resolve);
      const split = splitTriangleSoupByAlpha({
        positions: mesh.mesh.positions,
        normals: mesh.mesh.normals ?? new Float32Array(mesh.mesh.positions.length),
        hslColors: mesh.hslColors,
        alphas: mesh.alphas,
        ...(mesh.faceBias ? { faceBias: mesh.faceBias } : {}),
        ...(mesh.uvs && mesh.textureIds ? { uvs: mesh.uvs, textureIds: mesh.textureIds } : {}),
      });
      const commandTemplates: NpcMesh3DCommand[] = [];
      if (split.opaque)
        commandTemplates.push(this.createCommand(`ground-item-model-${itemId}-opaque`, split.opaque, false));
      if (split.transparent) {
        commandTemplates.push(this.createCommand(`ground-item-model-${itemId}-transparent`, split.transparent, true));
      }
      return commandTemplates.length > 0 ? { model, faceColors3: litColors.faceColors3, commandTemplates } : null;
    } catch (error) {
      log.debug('SceneBuilder', 'Failed to bake ground item model', { itemId, error });
      return null;
    }
  }

  private createCommand(meshId: string, mesh: TriangleSoup, transparent: boolean): NpcMesh3DCommand {
    return {
      kind: 'mesh3d',
      meshId,
      materialId: 'osrs-npc',
      modelMatrix: IDENTITY_MATRIX,
      positions: mesh.positions,
      normals: mesh.normals,
      perVertexHslColors: mesh.hslColors,
      perVertexAlphas: mesh.alphas,
      ...(mesh.faceBias ? { perVertexFaceBias: mesh.faceBias } : {}),
      ...(mesh.uvs && mesh.textureIds ? { uvs: mesh.uvs, perVertexTextureIds: mesh.textureIds } : {}),
      ...(transparent ? { depth: 'read' as const, blend: 'normal' as const } : { depth: 'readwrite' as const }),
      cullFace: 'back',
      zIndex: 35,
    };
  }

  private createInstance(
    groundItemId: string,
    itemId: number,
    model: GroundItemModel,
    modelMatrix: Float32Array,
  ): GroundItemInstance {
    return {
      itemId,
      model,
      commands: model.commandTemplates.map((command) => ({ ...command, modelMatrix })),
      modelMatrix,
      drawOrder: 0,
      takeTargetId: groundItemId,
    };
  }
}
