import type { TextureLayerResolver } from '../../rs/model/textureUv';

/**
 * Late-bound handle from an OSRS texture id to its layer in the renderer's
 * `TEXTURE_2D_ARRAY`.
 *
 * Mesh builders (player, NPC, loc, spotanim) are constructed before the cache
 * has produced a `TextureLoader`, and the array is only uploaded once
 * `PicoGLRenderer.loadTextures()` runs. Sharing one instance by reference lets
 * every builder resolve layers at mesh-build time without threading the mapper
 * through each constructor, and without caring about load order.
 */
export class ModelTextureIndex {
  private mapper: ((textureId: number) => number) | null = null;

  setMapper(mapper: ((textureId: number) => number) | null): void {
    this.mapper = mapper;
  }

  hasMapper(): boolean {
    return this.mapper !== null;
  }

  /** Texture-array layer for an OSRS texture id; 0 when unmapped (renders untextured). */
  readonly resolve: TextureLayerResolver = (osrsTextureId: number): number => {
    if (!this.mapper) return 0;
    const layer = this.mapper(osrsTextureId);
    return layer > 0 ? layer : 0;
  };
}

/**
 * App-wide instance. One GPU texture array is uploaded per session (from
 * `TextureLoader.getTextureIds()`), so every mesh builder resolves against the
 * same mapping. `RenderViewport3D` binds it as soon as
 * `PicoGLRenderer.loadTextures()` has run.
 */
export const sharedModelTextureIndex = new ModelTextureIndex();
