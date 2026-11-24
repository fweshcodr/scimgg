import 'picogl';

declare module 'picogl' {
  interface App {
    gl: WebGL2RenderingContext;
    state: {
      textures: Array<Texture | null>;
    };
  }

  interface Program {
    program: WebGLProgram;
    /** False when linking failed; picogl logs the info log instead of throwing. */
    linked: boolean;
  }

  interface Texture {
    texture: WebGLTexture | null;
    delete(): void;
  }

  interface VertexArray {
    vertexArray: WebGLVertexArrayObject;
  }

  interface VertexBuffer {
    buffer: WebGLBuffer;
  }

  interface IndexBuffer {
    buffer: WebGLBuffer;
  }
}

declare module 'picogl/build/module/texture.js' {
  export interface PicoGLAppState {
    textures?: Array<import('picogl').Texture | null>;
    [key: string]: unknown;
  }

  export interface PicoTextureOptions {
    [key: string]: unknown;
  }

  interface Texture {
    gl: WebGLRenderingContext;
    appState: PicoGLAppState;
    binding: number;
    texture: WebGLTexture | null;
    currentUnit: number;
    width: number;
    height: number;
    depth: number;
    minFilter: number;
    magFilter: number;
    wrapS: number;
    wrapT: number;
    wrapR: number;
    compareFunc: number;
    compareMode: number;
    minLOD: number | null;
    maxLOD: number | null;
    baseLevel: number | null;
    maxLevel: number | null;
    maxAnisotropy: number;
    is3D: boolean;
    mipmaps: boolean;
    internalFormat: number;
    bind(unit: number): this;
    delete(): void;
  }
}
