export interface TextureMaterial {
  id: number;
  isSmall: boolean;
  isSd: boolean;
  isTransparent: boolean;
  averageHsl: number;
  animationU: number;
  animationV: number;
}

export interface TextureLoader {
  getTextureIds(): number[];

  getTextureIndex(id: number): number;

  isSmall(id: number): boolean;

  isSd(id: number): boolean;

  isTransparent(id: number): boolean;

  getAverageHsl(id: number): number;

  getAnimationUv(id: number): [number, number];

  getMaterial(id: number): TextureMaterial;

  getPixelsRgb(id: number, size: number, flipH: boolean, brightness: number): Int32Array;
  getPixelsArgb(id: number, size: number, flipH: boolean, brightness: number): Int32Array;
}
