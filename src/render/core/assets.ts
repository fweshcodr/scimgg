export interface MeshData {
  positions: Float32Array;
  normals?: Float32Array;
  uvs?: Float32Array;
  colors?: Float32Array;
  indices?: Uint16Array | Uint32Array;
}

export interface UnlitMaterial {
  kind: 'unlit';
  baseColor: [number, number, number, number];
}

export interface TexturedMaterial {
  kind: 'textured';
  textureId: string;
  tint?: [number, number, number, number];
}

export interface OsrsMaterial {
  kind: 'osrs';
  textureId?: string;
  colorPalette?: Uint32Array;
  alpha?: number;
}

export type MaterialData = UnlitMaterial | TexturedMaterial | OsrsMaterial;

export interface AssetManager {
  hasTexture2D(id: string): boolean;
  ensureTexture2D(id: string, source: TexImageSource): void;
  deleteTexture2D(id: string): void;

  hasMesh(id: string): boolean;
  ensureMesh(id: string, mesh: MeshData): void;
  deleteMesh(id: string): void;

  hasMaterial(id: string): boolean;
  ensureMaterial(id: string, material: MaterialData): void;
  deleteMaterial(id: string): void;

  clear(): void;
}
