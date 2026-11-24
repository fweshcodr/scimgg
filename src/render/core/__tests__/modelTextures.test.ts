import { afterEach, describe, expect, it } from 'vitest';
import { ModelTextureIndex, sharedModelTextureIndex } from '../modelTextures';

describe('ModelTextureIndex', () => {
  it('resolves to layer 0 until a mapper is bound', () => {
    const index = new ModelTextureIndex();

    expect(index.hasMapper()).toBe(false);
    expect(index.resolve(40)).toBe(0);
  });

  it('resolves through the bound mapper', () => {
    const index = new ModelTextureIndex();
    index.setMapper((textureId) => (textureId === 40 ? 7 : 0));

    expect(index.hasMapper()).toBe(true);
    expect(index.resolve(40)).toBe(7);
  });

  it('clamps unmapped textures to layer 0 so they render untextured', () => {
    const index = new ModelTextureIndex();
    // TextureArrayManager.getTextureIndex returns -1 for textures it never uploaded.
    index.setMapper(() => -1);

    expect(index.resolve(40)).toBe(0);
  });

  it('reverts to layer 0 when the mapper is cleared', () => {
    const index = new ModelTextureIndex();
    index.setMapper(() => 7);
    index.setMapper(null);

    expect(index.hasMapper()).toBe(false);
    expect(index.resolve(40)).toBe(0);
  });
});

describe('sharedModelTextureIndex', () => {
  afterEach(() => {
    sharedModelTextureIndex.setMapper(null);
  });

  it('is a single app-wide instance every mesh builder resolves against', () => {
    sharedModelTextureIndex.setMapper((textureId) => textureId + 1);

    expect(sharedModelTextureIndex.resolve(40)).toBe(41);
  });
});
