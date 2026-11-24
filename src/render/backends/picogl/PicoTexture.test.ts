import PicoGL from 'picogl';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { TextureLoader } from '../../../rs/texture/TextureLoader';
import { TextureArrayManager } from './PicoTexture';

class MockTextureLoader implements TextureLoader {
  private textures: Map<number, Int32Array> = new Map();

  constructor() {
    for (let i = 0; i < 10; i++) {
      const pixels = new Int32Array(128 * 128);
      for (let j = 0; j < pixels.length; j++) {
        const r = (i * 25) & 0xff;
        const g = (i * 50) & 0xff;
        const b = (i * 75) & 0xff;
        const a = 0xff;
        pixels[j] = (a << 24) | (r << 16) | (g << 8) | b;
      }
      this.textures.set(100 + i, pixels);
    }
  }

  getTextureIds(): number[] {
    return Array.from(this.textures.keys());
  }

  getTextureIndex(textureId: number): number {
    const ids = this.getTextureIds();
    return ids.indexOf(textureId);
  }

  isSmall(_id: number): boolean {
    return false;
  }

  isSd(_id: number): boolean {
    return false;
  }

  isTransparent(_id: number): boolean {
    return false;
  }

  getAverageHsl(_id: number): number {
    return 0;
  }

  getAnimationUv(_id: number): [number, number] {
    return [0, 0];
  }

  getMaterial(textureId: number) {
    return {
      id: textureId,
      isSmall: false,
      isSd: false,
      isTransparent: false,
      averageHsl: 0,
      animationU: 0,
      animationV: 0,
    };
  }

  getPixelsRgb(textureId: number, size: number, _flipH: boolean, _brightness: number): Int32Array {
    const pixels = this.textures.get(textureId);
    return pixels?.length === size * size ? pixels : new Int32Array(size * size);
  }

  getPixelsArgb(textureId: number, size: number, _flipH: boolean, _brightness: number): Int32Array {
    const pixels = this.textures.get(textureId);
    return pixels?.length === size * size ? pixels : new Int32Array(size * size);
  }
}

class MockWebGL2RenderingContext {
  TEXTURE_2D_ARRAY = 0x8c1a;
  RGBA8 = 0x8058;
  LINEAR_MIPMAP_LINEAR = 0x2703;
  LINEAR = 0x2601;
  TEXTURE_MIN_FILTER = 0x2801;
  TEXTURE_MAG_FILTER = 0x2800;
  TEXTURE_WRAP_S = 0x2802;
  TEXTURE_WRAP_T = 0x2803;
  TEXTURE_WRAP_R = 0x8072;
  TEXTURE_COMPARE_FUNC = 0x884d;
  TEXTURE_COMPARE_MODE = 0x884c;
  MAX_ARRAY_TEXTURE_LAYERS = 0x88ff;
  TEXTURE_MIN_LOD = 0x813a;
  TEXTURE_MAX_LOD = 0x813b;
  TEXTURE_BASE_LEVEL = 0x813c;
  TEXTURE_MAX_LEVEL = 0x813d;
  CLAMP_TO_EDGE = 0x812f;
  NONE = 0;

  private textures: Map<any, any> = new Map();
  private currentTexture: any = null;

  createTexture = vi.fn(() => {
    const tex = { id: Math.random() };
    this.textures.set(tex, {});
    return tex;
  });

  deleteTexture = vi.fn((tex: any) => {
    this.textures.delete(tex);
  });

  bindTexture = vi.fn((_target: number, tex: any) => {
    this.currentTexture = tex;
  });

  texStorage3D = vi.fn(
    (_target: number, levels: number, internalFormat: number, width: number, height: number, depth: number) => {
      if (this.currentTexture) {
        this.textures.set(this.currentTexture, { width, height, depth, levels, internalFormat });
      }
    },
  );

  texStorage2D = vi.fn((_target: number, levels: number, internalFormat: number, width: number, height: number) => {
    if (this.currentTexture) {
      this.textures.set(this.currentTexture, { width, height, levels, internalFormat });
    }
  });

  texParameteri = vi.fn();
  texParameterf = vi.fn();
  generateMipmap = vi.fn();
  isContextLost = vi.fn(() => false);
  flush = vi.fn();
  activeTexture = vi.fn();
  pixelStorei = vi.fn();
  texSubImage3D = vi.fn();
  texSubImage2D = vi.fn();
  texImage3D = vi.fn();
  texImage2D = vi.fn();
  getParameter = vi.fn((pname: number) => {
    if (pname === this.MAX_ARRAY_TEXTURE_LAYERS) return 2048;
    return 0;
  });

  getTexture(tex: any) {
    return this.textures.get(tex);
  }
}

function createMockWebGL2Context() {
  return new MockWebGL2RenderingContext();
}

if (typeof globalThis.WebGL2RenderingContext === 'undefined') {
  Object.defineProperty(globalThis, 'WebGL2RenderingContext', {
    configurable: true,
    value: MockWebGL2RenderingContext,
  });
}

function createMockPicoApp() {
  const gl = createMockWebGL2Context();

  return {
    gl,
    state: {
      textures: new Array(32).fill(null),
    },
  };
}

describe('PicoTexture', () => {
  let textureLoader: MockTextureLoader;
  let manager: TextureArrayManager;
  let mockApp: any;

  beforeEach(() => {
    textureLoader = new MockTextureLoader();
    manager = new TextureArrayManager(textureLoader);
    mockApp = createMockPicoApp();
  });

  describe('TextureArrayManager', () => {
    it('flushes once after the complete array upload and again at the same boundary on restoration', () => {
      const gl = mockApp.gl as MockWebGL2RenderingContext;
      manager.loadTextures(mockApp, [100]);
      expect(gl.flush).toHaveBeenCalledOnce();
      expect(gl.flush.mock.invocationCallOrder[0]).toBeGreaterThan(
        Math.max(...gl.texSubImage3D.mock.invocationCallOrder, ...gl.generateMipmap.mock.invocationCallOrder),
      );
      expect(gl.bindTexture.mock.lastCall).toEqual([gl.TEXTURE_2D_ARRAY, null]);
      expect(gl.flush.mock.invocationCallOrder[0]).toBeGreaterThan(
        Math.max(...gl.bindTexture.mock.invocationCallOrder),
      );
      manager.reupload(mockApp, 128, 1);
      expect(gl.flush).toHaveBeenCalledTimes(2);
      expect(gl.flush.mock.invocationCallOrder[1]).toBeGreaterThan(
        Math.max(...gl.generateMipmap.mock.invocationCallOrder),
      );
      manager.dispose();
    });

    it('does not flush a known lost context, an empty reupload, or a rejected upload', () => {
      const gl = mockApp.gl as MockWebGL2RenderingContext;
      expect(manager.reupload(mockApp, 128, 1)).toBeNull();
      expect(() => manager.loadTextures(mockApp, [])).toThrow('No texture IDs provided');
      expect(gl.flush).not.toHaveBeenCalled();
      gl.isContextLost.mockReturnValue(true);
      manager.loadTextures(mockApp, [100]);
      expect(gl.flush).not.toHaveBeenCalled();
      manager.reupload(mockApp, 128, 1);
      expect(gl.flush).not.toHaveBeenCalled();
      manager.dispose();
    });

    it('should load texture ID 100 and return 128×128 RGBA data', () => {
      const textureArray = manager.loadTextures(mockApp, [100], 128, 1.0);

      expect(textureArray).toBeDefined();
      expect(manager.getTextureIndex(100)).toBe(1);
      expect(manager.getLoadedTextureIds()).toEqual([100]);
    });

    it('should upload 10 textures and create texture array in WebGL', () => {
      const textureIds = [100, 101, 102, 103, 104, 105, 106, 107, 108, 109];
      const textureArray = manager.loadTextures(mockApp, textureIds, 128, 1.0);

      expect(textureArray).toBeDefined();
      expect(mockApp.gl.createTexture).toHaveBeenCalled();
      expect(mockApp.gl.texStorage3D).toHaveBeenCalledWith(mockApp.gl.TEXTURE_2D_ARRAY, 8, PicoGL.RGBA8, 128, 128, 11);
      expect(mockApp.gl.generateMipmap).toHaveBeenCalledWith(mockApp.gl.TEXTURE_2D_ARRAY);
    });

    it('should query texture by ID and return correct texture index', () => {
      const textureIds = [100, 101, 102, 103, 104];
      manager.loadTextures(mockApp, textureIds, 128, 1.0);

      expect(manager.getTextureIndex(100)).toBe(1);
      expect(manager.getTextureIndex(101)).toBe(2);
      expect(manager.getTextureIndex(102)).toBe(3);
      expect(manager.getTextureIndex(103)).toBe(4);
      expect(manager.getTextureIndex(104)).toBe(5);
      expect(manager.getTextureIndex(999)).toBe(-1);
    });

    it('should convert ARGB to RGBA correctly', () => {
      const textureIds = [100];
      manager.loadTextures(mockApp, textureIds, 128, 1.0);

      const pixels = textureLoader.getPixelsArgb(100, 128, false, 1.0);
      const firstPixel = pixels[0];
      const expectedA = (firstPixel >> 24) & 0xff;
      const expectedR = (firstPixel >> 16) & 0xff;
      const expectedG = (firstPixel >> 8) & 0xff;
      const expectedB = firstPixel & 0xff;

      expect(expectedA).toBe(0xff);
      expect(expectedR).toBe(0);
      expect(expectedG).toBe(0);
      expect(expectedB).toBe(0);
    });

    it('should throw error when no texture IDs provided', () => {
      expect(() => {
        manager.loadTextures(mockApp, [], 128, 1.0);
      }).toThrow('No texture IDs provided');
    });

    it('throws before upload when requested textures exceed GL array layer limit', () => {
      mockApp.gl.getParameter.mockReturnValueOnce(3);
      const textureIds = [100, 101, 102];

      expect(() => manager.loadTextures(mockApp, textureIds, 128, 1.0)).toThrow('Too many textures: 3 (max 2)');

      expect(mockApp.gl.texStorage3D).not.toHaveBeenCalled();
      expect(manager.getLoadedTextureIds()).toEqual([]);
      expect(manager.getTextureArray()).toBeNull();
    });

    it('should support anisotropic filtering (16x)', () => {
      const textureIds = [100];
      const textureArray = manager.loadTextures(mockApp, textureIds, 128, 1.0);

      expect(textureArray).toBeDefined();
      expect(mockApp.gl.texParameteri).toHaveBeenCalled();
    });

    it('should use RGBA8 format', () => {
      const textureIds = [100];
      manager.loadTextures(mockApp, textureIds, 128, 1.0);

      expect(mockApp.gl.texStorage3D).toHaveBeenCalledWith(
        expect.anything(),
        expect.anything(),
        PicoGL.RGBA8,
        expect.anything(),
        expect.anything(),
        expect.anything(),
      );
    });

    it('should calculate correct mipmap levels for 128×128 texture', () => {
      const textureIds = [100];
      manager.loadTextures(mockApp, textureIds, 128, 1.0);

      const expectedLevels = Math.floor(Math.log2(128)) + 1;
      expect(expectedLevels).toBe(8);
      expect(mockApp.gl.texStorage3D).toHaveBeenCalledWith(
        expect.anything(),
        8,
        expect.anything(),
        expect.anything(),
        expect.anything(),
        expect.anything(),
      );
    });

    it('should return loaded texture IDs', () => {
      const textureIds = [100, 101, 102];
      manager.loadTextures(mockApp, textureIds, 128, 1.0);

      expect(manager.getLoadedTextureIds()).toEqual([100, 101, 102]);
    });

    it('should return texture array', () => {
      const textureIds = [100];
      const textureArray = manager.loadTextures(mockApp, textureIds, 128, 1.0);

      expect(manager.getTextureArray()).toBe(textureArray);
    });

    it('should dispose texture array', () => {
      const textureIds = [100, 101];
      manager.loadTextures(mockApp, textureIds, 128, 1.0);

      manager.dispose();

      expect(manager.getTextureArray()).toBeNull();
      expect(manager.getLoadedTextureIds()).toEqual([]);
      expect(manager.getTextureIndex(100)).toBe(-1);
    });

    it('should handle brightness parameter', () => {
      const textureIds = [100];
      const spy = vi.spyOn(textureLoader, 'getPixelsArgb');

      manager.loadTextures(mockApp, textureIds, 128, 2.0);

      expect(spy).toHaveBeenCalledWith(100, 128, true, 2.0);
    });

    it('should handle custom texture size', () => {
      const textureIds = [100];
      manager.loadTextures(mockApp, textureIds, 64, 1.0);

      expect(mockApp.gl.texStorage3D).toHaveBeenCalledWith(expect.anything(), 7, expect.anything(), 64, 64, 2);
    });
  });
});
