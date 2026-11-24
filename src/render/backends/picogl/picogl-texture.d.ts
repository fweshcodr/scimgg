declare module 'picogl/build/module/texture.js' {
  export class Texture {
    constructor(
      gl: WebGLRenderingContext,
      appState: any,
      binding: number,
      image: ArrayBufferView,
      width: number,
      height: number,
      depth: number,
      mipmaps: boolean,
      options: any,
    );
    resize(width: number, height: number, depth?: number): this;
  }
}
