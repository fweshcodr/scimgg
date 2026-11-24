import { getEquipmentCombatBaseId } from '../../data/equipmentCombatFamilies';
import { log } from '../../util/Logger';
import type { IdentKitLoader } from '../config/identkit/IdentKitLoader';
import type { ObjType } from '../config/objtype/ObjType';
import type { ObjTypeLoader } from '../config/objtype/ObjTypeLoader';
import { ModelData } from './ModelData';
import type { ModelLoader } from './ModelLoader';
import { computeFaceTextureUv, faceTextureLayer, modelHasTextures, type TextureLayerResolver } from './textureUv';
import { writeUnitNormal } from './VertexNormal';

export enum KitType {
  HEAD = 0,
  CAPE = 1,
  AMULET = 2,
  WEAPON = 3,
  TORSO = 4,
  SHIELD = 5,
  ARMS = 6,
  LEGS = 7,
  HAIR = 8,
  HANDS = 9,
  BOOTS = 10,
  JAW = 11,
}

export const KIT_OFFSET = 256;
export const ITEM_OFFSET = 512;

export type Gender = 0 | 1;

export interface PlayerAppearance {
  gender: Gender;
  hairKit: number;
  jawKit: number;
  torsoKit: number;
  armsKit: number;
  handsKit: number;
  legsKit: number;
  feetKit: number;
  hairColor: number;
  torsoColor: number;
  legsColor: number;
  feetColor: number;
  skinColor: number;
}

export interface PlayerEquipment {
  head?: number;
  cape?: number;
  amulet?: number;
  weapon?: number;
  body?: number;
  shield?: number;
  legs?: number;
  hands?: number;
  boots?: number;
  ring?: number;
}

export interface PlayerLitColors {
  faceColors1: Int32Array;
  faceColors2: Int32Array;
  faceColors3: Int32Array;
}

export interface PlayerModelData {
  mergedModel: ModelData;
  litColors: PlayerLitColors;
  weaponShieldFaceMask: Uint8Array;
  subModelFaceCounts: number[];
}

export const DEFAULT_MALE_APPEARANCE: PlayerAppearance = {
  gender: 0,
  hairKit: 0,
  jawKit: 10,
  torsoKit: 18,
  armsKit: 26,
  handsKit: 33,
  legsKit: 36,
  feetKit: 42,
  hairColor: 0,
  torsoColor: 0,
  legsColor: 0,
  feetColor: 0,
  skinColor: 0,
};

export class PlayerModelLoader {
  private static readonly MODEL_CACHE_LIMIT = 128;
  private objTypeLoader: ObjTypeLoader;
  private identKitLoader: IdentKitLoader;
  private modelLoader: ModelLoader;
  private modelCache: Map<string, ModelData> = new Map();

  constructor(objTypeLoader: ObjTypeLoader, identKitLoader: IdentKitLoader, modelLoader: ModelLoader) {
    this.objTypeLoader = objTypeLoader;
    this.identKitLoader = identKitLoader;
    this.modelLoader = modelLoader;
  }

  loadPlayerModel(appearance: PlayerAppearance, equipment: PlayerEquipment): PlayerModelData | undefined {
    log.trace('PlayerModel', 'Loading player model', { appearance, equipment });

    const composition = this.buildComposition(appearance, equipment);
    log.trace('PlayerModel', 'Composition built', composition);

    const { models, slots } = this.loadCompositionModels(composition, appearance.gender);
    log.debug('PlayerModel', 'Models loaded', models.length);

    if (models.length === 0) {
      log.warn('PlayerModel', 'No models loaded for player');
      return undefined;
    }

    const mergedModel = models.length === 1 ? models[0] : ModelData.merge(models, models.length);

    mergedModel.computeAnimationTables();

    const weaponShieldFaceMask = new Uint8Array(mergedModel.faceCount);
    let faceOffset = 0;
    for (let i = 0; i < models.length; i++) {
      const isWeaponOrShield = slots[i] === KitType.WEAPON || slots[i] === KitType.SHIELD;
      if (isWeaponOrShield) {
        weaponShieldFaceMask.fill(1, faceOffset, faceOffset + models[i].faceCount);
      }
      faceOffset += models[i].faceCount;
    }
    if (faceOffset !== mergedModel.faceCount) {
      log.warn('PlayerModel', 'Face mask size mismatch', { faceOffset, faceCount: mergedModel.faceCount });
    }

    log.debug('PlayerModel', 'Merged model', {
      verticesCount: mergedModel.verticesCount,
      faceCount: mergedModel.faceCount,
      hasVertexLabels: !!mergedModel.vertexLabels,
      vertexLabelsCount: mergedModel.vertexLabels?.length ?? 0,
    });

    const ambient = 64;
    const contrast = 850;
    const litColors = mergedModel.computeLitColors(ambient, contrast, -30, -50, -30);

    return {
      mergedModel,
      litColors,
      weaponShieldFaceMask,
      subModelFaceCounts: models.map((m) => m.faceCount),
    };
  }

  private buildComposition(appearance: PlayerAppearance, equipment: PlayerEquipment): (number | undefined)[] {
    const composition: (number | undefined)[] = new Array(12).fill(undefined);

    composition[KitType.HAIR] = appearance.hairKit >= 0 ? KIT_OFFSET + appearance.hairKit : undefined;
    composition[KitType.JAW] = appearance.jawKit >= 0 ? KIT_OFFSET + appearance.jawKit : undefined;
    composition[KitType.TORSO] = appearance.torsoKit >= 0 ? KIT_OFFSET + appearance.torsoKit : undefined;
    composition[KitType.ARMS] = appearance.armsKit >= 0 ? KIT_OFFSET + appearance.armsKit : undefined;
    composition[KitType.HANDS] = appearance.handsKit >= 0 ? KIT_OFFSET + appearance.handsKit : undefined;
    composition[KitType.LEGS] = appearance.legsKit >= 0 ? KIT_OFFSET + appearance.legsKit : undefined;
    composition[KitType.BOOTS] = appearance.feetKit >= 0 ? KIT_OFFSET + appearance.feetKit : undefined;

    this.applyEquipmentToComposition(composition, equipment, appearance.gender);

    return composition;
  }

  private loadWornObj(itemId: number, gender: Gender): ObjType {
    const obj = this.objTypeLoader.load(itemId);
    const baseId = getEquipmentCombatBaseId(itemId);
    if (baseId === itemId || this.hasCompleteWornModels(obj, gender)) return obj;
    const base = this.objTypeLoader.load(baseId);
    return this.hasCompleteWornModels(base, gender) ? base : obj;
  }

  private hasCompleteWornModels(obj: ObjType, gender: Gender): boolean {
    if (obj.getWornModelId(gender, 0) < 0) return false;
    const slots = [obj.wearPos1, obj.wearPos2, obj.wearPos3];
    for (const part of [0, 1, 2] as const) {
      if (part > 0 && slots[part] < 0) continue;
      const modelId = obj.getWornModelId(gender, part);
      if (modelId >= 0 && this.modelLoader.getModel(modelId) === undefined) return false;
    }
    return true;
  }

  private applyEquipmentToComposition(
    composition: (number | undefined)[],
    equipment: PlayerEquipment,
    gender: Gender,
  ): void {
    if (equipment.head !== undefined) {
      const obj = this.loadWornObj(equipment.head, gender);
      this.applyItemToComposition(composition, obj, KitType.HEAD);
    }
    if (equipment.cape !== undefined) {
      const obj = this.loadWornObj(equipment.cape, gender);
      this.applyItemToComposition(composition, obj, KitType.CAPE);
    }
    if (equipment.amulet !== undefined) {
      const obj = this.loadWornObj(equipment.amulet, gender);
      this.applyItemToComposition(composition, obj, KitType.AMULET);
    }
    if (equipment.weapon !== undefined) {
      const obj = this.loadWornObj(equipment.weapon, gender);
      this.applyItemToComposition(composition, obj, KitType.WEAPON);
    }
    if (equipment.body !== undefined) {
      const obj = this.loadWornObj(equipment.body, gender);
      this.applyItemToComposition(composition, obj, KitType.TORSO);
    }
    if (equipment.shield !== undefined) {
      const obj = this.loadWornObj(equipment.shield, gender);
      this.applyItemToComposition(composition, obj, KitType.SHIELD);
    }
    if (equipment.legs !== undefined) {
      const obj = this.loadWornObj(equipment.legs, gender);
      this.applyItemToComposition(composition, obj, KitType.LEGS);
    }
    if (equipment.hands !== undefined) {
      const obj = this.loadWornObj(equipment.hands, gender);
      this.applyItemToComposition(composition, obj, KitType.HANDS);
    }
    if (equipment.boots !== undefined) {
      const obj = this.loadWornObj(equipment.boots, gender);
      this.applyItemToComposition(composition, obj, KitType.BOOTS);
    }
  }

  private applyItemToComposition(composition: (number | undefined)[], obj: ObjType, primarySlot: KitType): void {
    const itemId = obj.id;

    if (obj.wearPos1 !== -1) {
      composition[obj.wearPos1] = ITEM_OFFSET + itemId;
    } else {
      composition[primarySlot] = ITEM_OFFSET + itemId;
    }

    if (obj.wearPos2 !== -1) {
      composition[obj.wearPos2] = ITEM_OFFSET + itemId;
    }

    if (obj.wearPos3 !== -1) {
      composition[obj.wearPos3] = ITEM_OFFSET + itemId;
    }
  }

  private loadCompositionModels(
    composition: (number | undefined)[],
    gender: Gender,
  ): { models: ModelData[]; slots: number[] } {
    const models: ModelData[] = [];
    const slots: number[] = [];

    for (let slot = 0; slot < 12; slot++) {
      const entry = composition[slot];
      if (entry === undefined) continue;

      if (entry >= ITEM_OFFSET) {
        const itemId = entry - ITEM_OFFSET;
        const model = this.loadEquipmentModel(itemId, gender, slot);
        if (model) {
          models.push(model);
          slots.push(slot);
        }
      } else if (entry >= KIT_OFFSET) {
        const kitId = entry - KIT_OFFSET;
        const kitModels = this.loadKitModels(kitId);
        for (const m of kitModels) {
          models.push(m);
          slots.push(slot);
        }
      }
    }

    return { models, slots };
  }

  private loadEquipmentModel(itemId: number, gender: Gender, slot: number): ModelData | undefined {
    const obj = this.objTypeLoader.load(itemId);

    let slotIndex: 0 | 1 | 2;
    if (obj.wearPos1 === slot) {
      slotIndex = 0;
    } else if (obj.wearPos2 === slot) {
      slotIndex = 1;
    } else if (obj.wearPos3 === slot) {
      slotIndex = 2;
    } else {
      slotIndex = 0;
    }

    const modelId = obj.getWornModelId(gender, slotIndex);
    if (modelId === -1) {
      return undefined;
    }

    const cacheKey = `obj_${itemId}_${gender}_${slotIndex}`;
    const cached = this.modelCache.get(cacheKey);
    if (cached !== undefined) {
      this.modelCache.delete(cacheKey);
      this.modelCache.set(cacheKey, cached);
      return ModelData.copyFrom(cached, false, false, true, true);
    }

    let model = this.modelLoader.getModel(modelId);
    if (model) {
      model = ModelData.copyFrom(model, false, false, true, true);

      if (obj.recolorFrom && obj.recolorTo) {
        for (let i = 0; i < obj.recolorFrom.length; i++) {
          for (let f = 0; f < model.faceCount; f++) {
            if (model.faceColors[f] === obj.recolorFrom[i]) {
              model.faceColors[f] = obj.recolorTo[i];
            }
          }
        }
      }

      if (obj.retextureFrom && obj.retextureTo) {
        for (let i = 0; i < obj.retextureFrom.length; i++) {
          model.retexture(obj.retextureFrom[i], obj.retextureTo[i]);
        }
      }

      this.modelCache.set(cacheKey, model);
      this.evictOldestCacheEntries();
    }

    return model ? ModelData.copyFrom(model, false, false, true, true) : undefined;
  }

  private loadKitModels(kitId: number): ModelData[] {
    const kit = this.identKitLoader.load(kitId);
    if (!kit || !kit.models || kit.models.length === 0) {
      return [];
    }

    const models: ModelData[] = [];
    for (const modelId of kit.models) {
      if (modelId === -1) continue;

      const cacheKey = `kit_${kitId}_${modelId}`;
      const cached = this.modelCache.get(cacheKey);
      if (cached !== undefined) {
        this.modelCache.delete(cacheKey);
        this.modelCache.set(cacheKey, cached);
        models.push(ModelData.copyFrom(cached, false, false, true, true));
        continue;
      }

      let model = this.modelLoader.getModel(modelId);
      if (model) {
        model = ModelData.copyFrom(model, false, false, true, true);

        if (kit.recolorFrom && kit.recolorTo) {
          for (let i = 0; i < kit.recolorFrom.length; i++) {
            for (let f = 0; f < model.faceCount; f++) {
              if (model.faceColors[f] === kit.recolorFrom[i]) {
                model.faceColors[f] = kit.recolorTo[i];
              }
            }
          }
        }

        if (kit.retextureFrom && kit.retextureTo) {
          for (let i = 0; i < kit.retextureFrom.length; i++) {
            model.retexture(kit.retextureFrom[i], kit.retextureTo[i]);
          }
        }

        this.modelCache.set(cacheKey, model);
        this.evictOldestCacheEntries();
      }

      if (model) {
        models.push(ModelData.copyFrom(model, false, false, true, true));
      }
    }

    return models;
  }

  clearCache(): void {
    this.modelCache.clear();
  }

  private evictOldestCacheEntries(): void {
    while (this.modelCache.size > PlayerModelLoader.MODEL_CACHE_LIMIT) {
      const oldestKey = this.modelCache.keys().next().value;
      if (oldestKey === undefined) {
        break;
      }
      this.modelCache.delete(oldestKey);
    }
  }
}

/** One unit normal, as doubles so pushing its components keeps their exact values. Scratch, never retained. */
const unitNormal = new Float64Array(3);

export function modelDataToPlayerMesh(
  modelData: PlayerModelData,
  sortedFaceOrder?: number[],
  resolveTextureLayer?: TextureLayerResolver,
): {
  positions: Float32Array;
  hslColors: Float32Array;
  alphas: Float32Array;
  normals: Float32Array;
  faceBias: Float32Array;
  uvs?: Float32Array;
  textureIds?: Float32Array;
} {
  const model = modelData.mergedModel;
  const { faceColors1, faceColors2, faceColors3 } = modelData.litColors;
  const positions: number[] = [];
  const hslColors: number[] = [];
  const alphas: number[] = [];
  const normals: number[] = [];
  const faceBias: number[] = [];

  model.calculateVertexNormals();

  const faceOrder = sortedFaceOrder;
  const iterCount = faceOrder ? faceOrder.length : model.faceCount;

  const hasTextures = resolveTextureLayer !== undefined && modelHasTextures(model.faceTextures, model.faceCount);
  const uvs: number[] | undefined = hasTextures ? [] : undefined;
  const textureIds: number[] | undefined = hasTextures ? [] : undefined;
  const faceUv = new Float32Array(6);

  for (let i = 0; i < iterCount; i++) {
    const f = faceOrder ? faceOrder[i] : i;

    const hslA = faceColors1[f];
    let hslB = faceColors2[f];
    let hslC = faceColors3[f];

    if (hslC === -2) {
      continue;
    }

    // hslC -1 denotes a flat-shaded face.
    if (hslC === -1) {
      hslC = hslB = hslA;
    }

    const i1 = model.indices1[f];
    const i2 = model.indices2[f];
    const i3 = model.indices3[f];

    const faceAlpha = model.faceAlphas ? (255 - (model.faceAlphas[f] & 0xff)) / 255 : 1.0;
    const fb = model.faceBias ? (model.faceBias[f] === -1 ? 0 : model.faceBias[f] & 0xff) : 0;

    const indices = [i1, i2, i3];
    const colors = [hslA, hslB, hslC];

    let textureLayer = 0;
    if (hasTextures) {
      textureLayer = faceTextureLayer(model.faceTextures, f, resolveTextureLayer);
      if (textureLayer > 0) {
        computeFaceTextureUv(model, f, faceUv, 0);
      } else {
        faceUv.fill(0);
      }
    }

    for (let v = 0; v < 3; v++) {
      const idx = indices[v];
      positions.push(model.verticesX[idx]);
      positions.push(model.verticesY[idx]);
      positions.push(model.verticesZ[idx]);

      writeUnitNormal(model.normals, idx, unitNormal, 0);
      normals.push(unitNormal[0], unitNormal[1], unitNormal[2]);

      hslColors.push(colors[v] & 0xffff);
      alphas.push(faceAlpha);
      faceBias.push(fb);
      if (uvs && textureIds) {
        uvs.push(faceUv[v * 2], faceUv[v * 2 + 1]);
        textureIds.push(textureLayer);
      }
    }
  }

  return {
    positions: new Float32Array(positions),
    hslColors: new Float32Array(hslColors),
    alphas: new Float32Array(alphas),
    normals: new Float32Array(normals),
    faceBias: new Float32Array(faceBias),
    ...(uvs && textureIds ? { uvs: new Float32Array(uvs), textureIds: new Float32Array(textureIds) } : {}),
  };
}
