import type { EmbeddedMeshCommand } from './lobbyConstants';
import { IDENTITY_MATRIX } from './lobbyConstants';

export interface LobbyMeshVertex {
  x: number;
  y: number;
  z: number;
  nx: number;
  ny: number;
  nz: number;
  color: number;
  alpha?: number;
}

export interface LobbyMeshCommandOptions {
  materialId?: string;
  modelMatrix?: Float32Array;
  depth?: EmbeddedMeshCommand['depth'];
  blend?: EmbeddedMeshCommand['blend'];
  shaderId?: EmbeddedMeshCommand['shaderId'];
  uniforms?: EmbeddedMeshCommand['uniforms'];
}

export function makeIndices(indices: number[]): Uint16Array | Uint32Array {
  return indices.length > 65535 ? new Uint32Array(indices) : new Uint16Array(indices);
}

export function createLobbyMeshBuilder() {
  const positions: number[] = [];
  const normals: number[] = [];
  const colors: number[] = [];
  const alphas: number[] = [];
  const indices: number[] = [];
  let vIdx = 0;

  const ensureAlphaAlignment = (alpha?: number) => {
    if (alpha === undefined) {
      if (alphas.length > 0) {
        alphas.push(1);
      }
      return;
    }

    while (alphas.length < vIdx) {
      alphas.push(1);
    }
    alphas.push(alpha);
  };

  const addVertex = (
    x: number,
    y: number,
    z: number,
    nx: number,
    ny: number,
    nz: number,
    color: number,
    alpha?: number,
  ): number => {
    const current = vIdx;
    positions.push(x, y, z);
    normals.push(nx, ny, nz);
    colors.push(color);
    ensureAlphaAlignment(alpha);
    vIdx += 1;
    return current;
  };

  const addQuad = (v0: LobbyMeshVertex, v1: LobbyMeshVertex, v2: LobbyMeshVertex, v3: LobbyMeshVertex): number => {
    const start = vIdx;
    addVertex(v0.x, v0.y, v0.z, v0.nx, v0.ny, v0.nz, v0.color, v0.alpha);
    addVertex(v1.x, v1.y, v1.z, v1.nx, v1.ny, v1.nz, v1.color, v1.alpha);
    addVertex(v2.x, v2.y, v2.z, v2.nx, v2.ny, v2.nz, v2.color, v2.alpha);
    addVertex(v3.x, v3.y, v3.z, v3.nx, v3.ny, v3.nz, v3.color, v3.alpha);
    indices.push(start, start + 1, start + 2, start, start + 2, start + 3);
    return start;
  };

  const toCommand = (meshId: string, zIndex: number, options: LobbyMeshCommandOptions = {}): EmbeddedMeshCommand => {
    const command: EmbeddedMeshCommand = {
      kind: 'mesh3d',
      meshId,
      materialId: options.materialId ?? 'osrs-terrain',
      modelMatrix: options.modelMatrix ?? IDENTITY_MATRIX,
      depth: options.depth ?? 'readwrite',
      cullFace: 'none',
      zIndex,
      positions: new Float32Array(positions),
      normals: new Float32Array(normals),
      perVertexHslColors: new Float32Array(colors),
      indices: makeIndices(indices),
    };

    if (alphas.length > 0) {
      command.perVertexAlphas = new Float32Array(alphas);
    }
    if (options.blend !== undefined) {
      command.blend = options.blend;
    }
    if (options.shaderId !== undefined) {
      command.shaderId = options.shaderId;
    }
    if (options.uniforms !== undefined) {
      command.uniforms = options.uniforms;
    }

    return command;
  };

  return {
    positions,
    normals,
    colors,
    alphas,
    indices,
    addVertex,
    addQuad,
    vIdx: () => vIdx,
    toCommand,
  };
}
