import PicoGL, { type App } from 'picogl';
import type { PicoTextureOptions } from 'picogl/build/module/texture.js';
import { Texture } from 'picogl/build/module/texture.js';
import type { TextureLoader } from '../../../rs/texture/TextureLoader';
import { log } from '../../../util/Logger';
import { profiler } from '../../../util/Profiler';

export class PicoTexture extends Texture {
  resize(width: number, height: number, depth?: number | undefined) {
    if (!(this.gl instanceof WebGL2RenderingContext)) {
      throw new Error('Only WebGL2 is supported');
    }
    const gl = this.gl;
    depth = depth || 0;

    if (this.texture && width === this.width && height === this.height && depth === this.depth) {
      return this;
    }

    if (this.texture) {
      this.gl.deleteTexture(this.texture);
    }
    if (this.currentUnit !== -1 && this.appState.textures) {
      this.appState.textures[this.currentUnit] = null;
    }

    this.texture = this.gl.createTexture();
    this.bind(Math.max(this.currentUnit, 0));

    this.width = width;
    this.height = height;
    this.depth = depth;

    this.gl.texParameteri(this.binding, gl.TEXTURE_MIN_FILTER, this.minFilter);
    this.gl.texParameteri(this.binding, gl.TEXTURE_MAG_FILTER, this.magFilter);
    this.gl.texParameteri(this.binding, gl.TEXTURE_WRAP_S, this.wrapS);
    this.gl.texParameteri(this.binding, gl.TEXTURE_WRAP_T, this.wrapT);
    this.gl.texParameteri(this.binding, gl.TEXTURE_WRAP_R, this.wrapR);
    this.gl.texParameteri(this.binding, gl.TEXTURE_COMPARE_FUNC, this.compareFunc);
    this.gl.texParameteri(this.binding, gl.TEXTURE_COMPARE_MODE, this.compareMode);

    if (this.minLOD !== null) {
      this.gl.texParameterf(this.binding, gl.TEXTURE_MIN_LOD, this.minLOD);
    }

    if (this.maxLOD !== null) {
      this.gl.texParameterf(this.binding, gl.TEXTURE_MAX_LOD, this.maxLOD);
    }

    if (this.baseLevel !== null) {
      this.gl.texParameteri(this.binding, gl.TEXTURE_BASE_LEVEL, this.baseLevel);
    }

    if (this.maxLevel !== null) {
      this.gl.texParameteri(this.binding, gl.TEXTURE_MAX_LEVEL, this.maxLevel);
    }

    if (this.maxAnisotropy > 1) {
      this.gl.texParameteri(this.binding, PicoGL.TEXTURE_MAX_ANISOTROPY_EXT, this.maxAnisotropy);
    }

    let levels: number;
    if (this.is3D) {
      if (this.mipmaps) {
        levels = Math.floor(Math.log2(Math.max(this.width, this.height))) + 1;
      } else {
        levels = 1;
      }
      this.gl.texStorage3D(this.binding, levels, this.internalFormat, this.width, this.height, this.depth);
    } else {
      if (this.mipmaps) {
        levels = Math.floor(Math.log2(Math.max(this.width, this.height))) + 1;
      } else {
        levels = 1;
      }
      this.gl.texStorage2D(this.binding, levels, this.internalFormat, this.width, this.height);
    }

    return this;
  }
}

export function createTextureArray(
  app: App,
  image: ArrayBufferView,
  width: number,
  height: number,
  depth: number,
  options: PicoTextureOptions,
): Texture {
  return new PicoTexture(app.gl, app.state, PicoGL.TEXTURE_2D_ARRAY, image, width, height, depth, true, options);
}

const DEFAULT_TEXTURE_ARRAY_LAYERS = 2048;
const TEXTURE_SIZE = 128;

export class TextureArrayManager {
  private textureLoader: TextureLoader;
  private textureIdToIndex: Map<number, number> = new Map();
  private loadedTextureIds: number[] = [];
  private textureArray: Texture | null = null;

  constructor(textureLoader: TextureLoader) {
    this.textureLoader = textureLoader;
  }

  /**
   * IMPORTANT: This follows rs-map-viewer's pattern:
   * - Index 0 is a white placeholder texture (0xFFFFFFFF)
   * - Actual textures start at index 1
   * - Total array depth = textureCount + 1
   */
  loadTextures(app: App, textureIds: number[], size: number = TEXTURE_SIZE, brightness: number = 1.0): Texture {
    profiler.start('TextureArrayManager.loadTextures');
    if (!(app.gl instanceof WebGL2RenderingContext)) {
      profiler.end('TextureArrayManager.loadTextures');
      throw new Error('Only WebGL2 is supported');
    }
    if (textureIds.length === 0) {
      profiler.end('TextureArrayManager.loadTextures');
      throw new Error('No texture IDs provided');
    }

    const maxTextureLayers = this.getMaxTextureArrayLayers(app.gl);
    const maxTextureIds = maxTextureLayers - 1;

    if (textureIds.length > maxTextureIds) {
      profiler.end('TextureArrayManager.loadTextures');
      throw new Error(`Too many textures: ${textureIds.length} (max ${maxTextureIds})`);
    }

    const limitedTextureIds = [...textureIds];

    this.textureIdToIndex.clear();
    this.loadedTextureIds = [...limitedTextureIds];

    limitedTextureIds.forEach((id, index) => {
      this.textureIdToIndex.set(id, index + 1);
    });

    const textureCount = limitedTextureIds.length;
    const pixelCount = size * size;

    const pixels = new Int32Array((textureCount + 1) * pixelCount);

    pixels.fill(0xffffffff, 0, pixelCount);

    profiler.start('TextureArrayManager.decodePixels');
    for (let i = 0; i < textureCount; i++) {
      const textureId = limitedTextureIds[i];
      try {
        const texturePixels = this.textureLoader.getPixelsArgb(textureId, size, true, brightness);
        pixels.set(texturePixels, (i + 1) * pixelCount);
      } catch (e) {
        log.error('Renderer', 'Failed loading texture', textureId, e);
      }
    }
    profiler.end('TextureArrayManager.decodePixels');

    const textureData = new Uint8Array(pixels.buffer);

    profiler.start('TextureArrayManager.createTextureArray');
    if (this.textureArray) {
      this.textureArray.delete();
      this.textureArray = null;
    }
    this.textureArray = createTextureArray(app, textureData, size, size, textureCount + 1, {
      internalFormat: PicoGL.RGBA8,
      minFilter: PicoGL.LINEAR_MIPMAP_LINEAR,
      magFilter: PicoGL.LINEAR,
      maxAnisotropy: 16,
    });

    const gl = app.gl;
    gl.bindTexture(gl.TEXTURE_2D_ARRAY, this.textureArray.texture);
    profiler.start('TextureArrayManager.generateMipmap');
    gl.generateMipmap(gl.TEXTURE_2D_ARRAY);
    profiler.end('TextureArrayManager.generateMipmap');
    gl.bindTexture(gl.TEXTURE_2D_ARRAY, null);
    // Submit the completed array upload before scene drawing can queue more work.
    // Shared by initial loading and restoration; this does not wait for GPU completion.
    if (!gl.isContextLost()) gl.flush();
    profiler.end('TextureArrayManager.createTextureArray');

    profiler.end('TextureArrayManager.loadTextures');
    return this.textureArray;
  }

  /**
   * Rebuilds the array on a restored context from the same ids in the same order, so
   * every texture keeps its layer and meshes baked against the old mapping stay valid.
   * The previous handle died with the lost context, so it is dropped, not deleted.
   */
  reupload(app: App, size: number, brightness: number): Texture | null {
    this.textureArray = null;
    if (this.loadedTextureIds.length === 0) return null;
    return this.loadTextures(app, this.loadedTextureIds, size, brightness);
  }

  /**
   * Returns the 1-based index in the texture array (0 is white placeholder).
   * Returns -1 if texture ID is not loaded.
   */
  getTextureIndex(textureId: number): number {
    return this.textureIdToIndex.get(textureId) ?? -1;
  }

  hasTexture(textureId: number): boolean {
    return this.textureIdToIndex.has(textureId);
  }

  getLoadedTextureIds(): number[] {
    return [...this.loadedTextureIds];
  }

  getTextureArray(): Texture | null {
    return this.textureArray;
  }

  private getMaxTextureArrayLayers(gl: WebGL2RenderingContext): number {
    const layerLimit = gl.getParameter(gl.MAX_ARRAY_TEXTURE_LAYERS);
    if (typeof layerLimit === 'number' && Number.isFinite(layerLimit)) {
      return Math.max(1, Math.floor(layerLimit));
    }
    return DEFAULT_TEXTURE_ARRAY_LAYERS;
  }

  dispose(): void {
    if (this.textureArray) {
      this.textureArray.delete();
      this.textureArray = null;
    }
    this.textureIdToIndex.clear();
    this.loadedTextureIds = [];
  }
}
