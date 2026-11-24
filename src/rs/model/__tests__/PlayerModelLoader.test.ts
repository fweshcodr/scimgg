import assert from 'node:assert/strict';
import { describe, expect, it, vi } from 'vitest';
import type { CacheInfo } from '../../cache/CacheInfo';
import { IdentKit } from '../../config/identkit/IdentKit';
import { ObjType } from '../../config/objtype/ObjType';
import { ModelData } from '../ModelData';
import { DEFAULT_MALE_APPEARANCE, type Gender, PlayerModelLoader } from '../PlayerModelLoader';

const CACHE: CacheInfo = {
  name: 'test',
  game: 'oldschool',
  environment: 'live',
  revision: 240,
  timestamp: '',
  size: 0,
};

function triangle(color: number): ModelData {
  const model = new ModelData();
  model.verticesCount = 3;
  model.usedVertexCount = 3;
  model.faceCount = 1;
  model.verticesX = new Int32Array([0, 100, 50]);
  model.verticesY = new Int32Array([0, 0, -100]);
  model.verticesZ = new Int32Array([0, 0, 100]);
  model.indices1 = new Int32Array([0]);
  model.indices2 = new Int32Array([1]);
  model.indices3 = new Int32Array([2]);
  model.faceColors = new Uint16Array([color]);
  return model;
}

function fixture(gender: Gender, variantId = 24666) {
  const base = new ObjType(21021, CACHE);
  Object.assign(base, {
    wearPos1: 4,
    wearPos2: 6,
    maleModel0: 101,
    maleModel1: 102,
    femaleModel0: 111,
    femaleModel1: 112,
  });
  const variant = new ObjType(variantId, CACHE);
  Object.assign(variant, {
    wearPos1: 4,
    wearPos2: 8,
    maleModel0: 201,
    maleModel1: 202,
    femaleModel0: 211,
    femaleModel1: 212,
  });
  variant.recolorFrom = [201, 211];
  variant.recolorTo = [401, 411];
  const objects = new Map([
    [base.id, base],
    [variant.id, variant],
  ]);
  const models = new Map([101, 102, 111, 112, 201, 202, 211, 212, 301, 302].map((id) => [id, triangle(id)]));
  const getModel = vi.fn((id: number) => models.get(id));
  const loader = new PlayerModelLoader(
    {
      load(id) {
        const obj = objects.get(id);
        assert.ok(obj);
        return obj;
      },
      getCount: () => objects.size,
      clearCache() {},
    },
    {
      load(id) {
        const kit = new IdentKit(id, CACHE);
        kit.models = [id === 1 ? 301 : 302];
        return kit;
      },
      getCount: () => 2,
      clearCache() {},
    },
    { getModel },
  );
  const appearance = {
    ...DEFAULT_MALE_APPEARANCE,
    gender,
    hairKit: 1,
    armsKit: 2,
    jawKit: -1,
    torsoKit: -1,
    handsKit: -1,
    legsKit: -1,
    feetKit: -1,
  };
  const equipment = { body: variant.id };
  const colors = () =>
    [...(loader.loadPlayerModel(appearance, equipment)?.mergedModel.faceColors ?? [])].sort(
      (left, right) => left - right,
    );
  return { base, variant, models, getModel, colors, equipment };
}

describe.each([0, 1] as const)('cosmetic worn model fallback for gender %i', (gender) => {
  const primary = gender === 0 ? 201 : 211;
  const secondary = gender === 0 ? 202 : 212;
  const baseColors = gender === 0 ? [101, 102, 301] : [111, 112, 301];

  it('preserves complete raw models, recolors and wear slots', () => {
    const subject = fixture(gender);
    expect(subject.colors()).toEqual([secondary, 302, primary + 200]);
    expect(subject.getModel).not.toHaveBeenCalledWith(gender === 0 ? 101 : 111);
    expect(subject.equipment).toEqual({ body: 24666 });
  });

  it.each([
    'primary',
    'secondary',
  ] as const)('chooses base composition when the required %s asset is absent', (part) => {
    const subject = fixture(gender);
    subject.models.delete(part === 'primary' ? primary : secondary);
    expect(subject.colors()).toEqual(baseColors);
    expect(subject.equipment).toEqual({ body: 24666 });
  });

  it('falls back when no primary worn model is declared', () => {
    const subject = fixture(gender);
    subject.variant.maleModel0 = -1;
    subject.variant.femaleModel0 = -1;
    expect(subject.colors()).toEqual(baseColors);
  });

  it('checks the required third worn part before applying any raw wear slots', () => {
    const subject = fixture(gender);
    subject.variant.wearPos3 = 11;
    subject.variant.maleModel2 = 203;
    subject.variant.femaleModel2 = 213;
    expect(subject.colors()).toEqual(baseColors);
  });

  it('uses the fallback object recolors with its model parts', () => {
    const subject = fixture(gender);
    subject.models.delete(primary);
    subject.base.recolorFrom = [101, 111];
    subject.base.recolorTo = [501, 511];
    expect(subject.colors()).toEqual(gender === 0 ? [102, 301, 501] : [112, 301, 511]);
  });

  it('does not treat absent optional secondary models as missing assets or erase the arms kit', () => {
    const subject = fixture(gender);
    subject.variant.wearPos2 = -1;
    subject.variant.maleModel1 = -1;
    subject.variant.femaleModel1 = -1;
    expect(subject.colors()).toEqual([301, 302, primary + 200]);
    expect(subject.getModel).not.toHaveBeenCalledWith(gender === 0 ? 101 : 111);
  });

  it('ignores an unused declared model when no wear slot loads that part', () => {
    const subject = fixture(gender);
    subject.variant.wearPos2 = -1;
    subject.models.delete(secondary);

    expect(subject.colors()).toEqual([301, 302, primary + 200]);
    expect(subject.getModel).not.toHaveBeenCalledWith(secondary);
  });

  it('retries the raw cosmetic after an asset becomes available', () => {
    const subject = fixture(gender);
    subject.models.delete(primary);
    expect(subject.colors()).toEqual(baseColors);
    subject.models.set(primary, triangle(primary));
    expect(subject.colors()).toEqual([secondary, 302, primary + 200]);
  });

  it('never borrows a base for an unknown missing item', () => {
    const subject = fixture(gender, 999999);
    subject.models.delete(primary);
    expect(subject.colors()).toEqual([secondary, 302]);
    expect(subject.getModel).not.toHaveBeenCalledWith(gender === 0 ? 101 : 111);
  });
});
