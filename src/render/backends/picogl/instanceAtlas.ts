import type { Mesh3DCommand } from '../../core/commands';
import type { ImmutableMeshSource, MeshUploadData } from '../../core/meshSource';

/**
 * Instanced drawing of `Mesh3DCommand.instanceAtlas` runs (see `PicoGLRenderer.drawPasses`).
 *
 * An atlas source's parts are triangle soups that index to a few shared topologies. On the GPU each
 * part becomes one row of an RGBA32F texture, two texels per indexed vertex (position + HSL, then
 * alpha + face bias), read with `texelFetch` (no filtering, so no float-filtering extension); each
 * topology keeps one index buffer. A run of consecutive compatible commands is then one
 * `drawElementsInstanced`, its instances in command order, each with the command's model-view-
 * projection matrix (computed on the CPU exactly as the per-command uniform is) and its row. The
 * values each vertex reads are the ones the command's own buffers would hold, so the draw matches.
 */

/** The texture unit the atlas binds to: unit 0 is the scene texture array, and nothing else binds textures. */
export const ATLAS_TEXTURE_UNIT = 1;
/** Per instance: the 16 floats of the MVP matrix, then the atlas row. */
export const INSTANCE_FLOATS = 17;
const INSTANCE_STRIDE_BYTES = INSTANCE_FLOATS * 4;
/** `a_instanceMvp` takes locations 8–11, one column each; `a_instanceRow` 12 (scene-base.vert.glsl). */
const MVP_LOCATION = 8;
const ROW_LOCATION = 12;
const TEXELS_PER_VERTEX = 2;

/** The arrays a static part uploads, as `createMeshVao` would build them for scene-base (indexed). */
export interface AtlasPartArrays {
  readonly positions: Float32Array;
  readonly indices?: Uint16Array | Uint32Array;
  readonly uvs?: Float32Array;
  readonly perVertexTextureIds?: Float32Array;
  readonly perVertexHslColors?: Float32Array;
  readonly perVertexAlphas?: Float32Array;
  readonly perVertexFaceBias?: Float32Array;
}

export interface AtlasLayout {
  readonly vao: WebGLVertexArrayObject;
  readonly indexBuffer: WebGLBuffer;
  readonly indexCount: number;
  readonly indexType: number;
}

export interface ResidentAtlas {
  readonly source: ImmutableMeshSource;
  readonly texture: WebGLTexture;
  readonly layouts: readonly AtlasLayout[];
  /** Per source part: the index of its layout, or -1 when it only draws through its own command. */
  readonly partLayouts: Int16Array;
  /** Texture and index buffer storage. */
  readonly bytes: number;
  /** Bytes handed to the GPU at upload: texels and indices. */
  readonly uploadBytes: number;
}

function sameIndices(left: Uint16Array | Uint32Array, right: Uint16Array | Uint32Array): boolean {
  if (left.constructor !== right.constructor || left.length !== right.length) return false;
  for (let index = 0; index < left.length; index++) if (left[index] !== right[index]) return false;
  return true;
}

/**
 * Uploads `arrays`, the parts of `source`, as an atlas; null when nothing in it can be drawn
 * instanced, when its texture and index bytes would exceed `maxBytes` (checked before the texel
 * staging or any GL object is allocated), or when a GL object cannot be made. The commands then
 * draw as they always do. A part qualifies when `index` makes it indexed, with HSL colors and
 * neither texture coordinates nor layers (the instanced program is untextured). Its effective alpha
 * and face bias are what the per-command draw reads: its uploaded values, or the constant 1 and +0
 * of an absent buffer.
 */
export function uploadAtlas(
  gl: WebGL2RenderingContext,
  source: ImmutableMeshSource,
  arrays: readonly MeshUploadData[],
  index: (part: MeshUploadData) => AtlasPartArrays,
  maxTextureSize: number,
  maxBytes: number,
): ResidentAtlas | null {
  const layoutIndices: (Uint16Array | Uint32Array)[] = [];
  const partLayouts = new Int16Array(arrays.length).fill(-1);
  const parts: (AtlasPartArrays | null)[] = [];
  let width = 0;
  for (const [partIndex, part] of arrays.entries()) {
    const mesh = part.positions.length > 0 ? index(part) : null;
    const indices = mesh?.indices;
    if (!mesh || !indices || !mesh.perVertexHslColors || mesh.uvs || mesh.perVertexTextureIds) {
      parts.push(null);
      continue;
    }
    // `index` hands back views into shared scratch: keep copies.
    const copy: AtlasPartArrays = {
      positions: mesh.positions.slice(),
      perVertexHslColors: mesh.perVertexHslColors.slice(),
      perVertexAlphas: mesh.perVertexAlphas?.slice(),
      perVertexFaceBias: mesh.perVertexFaceBias?.slice(),
    };
    let layout = layoutIndices.findIndex((held) => sameIndices(held, indices));
    if (layout < 0) {
      layout = layoutIndices.length;
      layoutIndices.push(indices.slice());
    }
    partLayouts[partIndex] = layout;
    parts.push(copy);
    width = Math.max(width, (copy.positions.length / 3) * TEXELS_PER_VERTEX);
  }
  if (layoutIndices.length === 0 || width > maxTextureSize || arrays.length > maxTextureSize) return null;
  let indexBytes = 0;
  for (const indices of layoutIndices) indexBytes += indices.byteLength;
  if (width * arrays.length * 16 + indexBytes > maxBytes) return null;

  const texels = new Float32Array(width * arrays.length * 4);
  for (const [row, part] of parts.entries()) {
    if (!part) continue;
    const { positions, perVertexHslColors: hsl, perVertexAlphas: alphas, perVertexFaceBias: faceBias } = part;
    const vertexCount = positions.length / 3;
    for (let vertex = 0; vertex < vertexCount; vertex++) {
      const texel = (row * width + vertex * TEXELS_PER_VERTEX) * 4;
      texels[texel] = positions[vertex * 3] as number;
      texels[texel + 1] = positions[vertex * 3 + 1] as number;
      texels[texel + 2] = positions[vertex * 3 + 2] as number;
      texels[texel + 3] = hsl?.[vertex] as number;
      texels[texel + 4] = alphas ? (alphas[vertex] as number) : 1;
      texels[texel + 5] = faceBias ? (faceBias[vertex] as number) : 0;
    }
  }

  const created: { texture?: WebGLTexture; buffers: WebGLBuffer[]; vaos: WebGLVertexArrayObject[] } = {
    buffers: [],
    vaos: [],
  };
  const release = () => {
    if (created.texture) gl.deleteTexture(created.texture);
    for (const buffer of created.buffers) gl.deleteBuffer(buffer);
    for (const vao of created.vaos) gl.deleteVertexArray(vao);
  };
  // Error flags raised before this upload are not its failure.
  for (let flags = 0; flags < 8 && gl.getError(); flags++);
  const texture = gl.createTexture();
  if (!texture) return null;
  created.texture = texture;
  gl.activeTexture(gl.TEXTURE0 + ATLAS_TEXTURE_UNIT);
  gl.bindTexture(gl.TEXTURE_2D, texture);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  // Rows are parts: no flip, premultiplication or row padding may touch them. Restored after.
  const flipY = gl.getParameter(gl.UNPACK_FLIP_Y_WEBGL) as boolean;
  const premultiply = gl.getParameter(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL) as boolean;
  const alignment = gl.getParameter(gl.UNPACK_ALIGNMENT) as number;
  gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
  gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
  gl.pixelStorei(gl.UNPACK_ALIGNMENT, 4);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA32F, width, arrays.length, 0, gl.RGBA, gl.FLOAT, texels);
  gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, flipY);
  gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, premultiply);
  gl.pixelStorei(gl.UNPACK_ALIGNMENT, alignment);
  gl.bindTexture(gl.TEXTURE_2D, null);
  gl.activeTexture(gl.TEXTURE0);

  let bytes = texels.byteLength;
  const layouts: AtlasLayout[] = [];
  for (const indices of layoutIndices) {
    const vao = gl.createVertexArray();
    const indexBuffer = vao ? gl.createBuffer() : null;
    if (vao) created.vaos.push(vao);
    if (indexBuffer) created.buffers.push(indexBuffer);
    if (!vao || !indexBuffer) {
      release();
      return null;
    }
    gl.bindVertexArray(vao);
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, indexBuffer);
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, indices, gl.STATIC_DRAW);
    for (let column = 0; column < 4; column++) {
      gl.enableVertexAttribArray(MVP_LOCATION + column);
      gl.vertexAttribDivisor(MVP_LOCATION + column, 1);
    }
    gl.enableVertexAttribArray(ROW_LOCATION);
    gl.vertexAttribDivisor(ROW_LOCATION, 1);
    gl.bindVertexArray(null);
    bytes += indices.byteLength;
    layouts.push({
      vao,
      indexBuffer,
      indexCount: indices.length,
      indexType: indices instanceof Uint16Array ? gl.UNSIGNED_SHORT : gl.UNSIGNED_INT,
    });
  }
  if (gl.getError() !== gl.NO_ERROR) {
    release();
    return null;
  }
  return { source, texture, layouts, partLayouts, bytes, uploadBytes: bytes };
}

export function deleteAtlas(gl: WebGL2RenderingContext, atlas: ResidentAtlas): void {
  gl.deleteTexture(atlas.texture);
  for (const layout of atlas.layouts) {
    gl.deleteBuffer(layout.indexBuffer);
    gl.deleteVertexArray(layout.vao);
  }
}

/** Points a layout's instance attributes at instances `[first, …)` of `buffer`. Its VAO must be bound. */
export function bindInstances(gl: WebGL2RenderingContext, buffer: WebGLBuffer, first: number): void {
  gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
  const offset = first * INSTANCE_STRIDE_BYTES;
  for (let column = 0; column < 4; column++)
    gl.vertexAttribPointer(MVP_LOCATION + column, 4, gl.FLOAT, false, INSTANCE_STRIDE_BYTES, offset + column * 16);
  gl.vertexAttribPointer(ROW_LOCATION, 1, gl.FLOAT, false, INSTANCE_STRIDE_BYTES, offset + 64);
}

/** Consecutive commands `[start, end)` of one pass's list drawn as one instanced draw. */
export interface AtlasRun {
  start: number;
  end: number;
  atlas: ResidentAtlas;
  layout: number;
  /** The run's first instance in the frame's instance buffer. */
  firstInstance: number;
}

/**
 * Whether `next` draws with exactly `first`'s state: program, cull mode, depth bias, depth write
 * and blend. The pass fixes everything else; the atlas and layout are compared by the caller.
 */
function sameDrawState(first: Mesh3DCommand, next: Mesh3DCommand): boolean {
  return (
    (next.shaderId ?? 'scene-base') === (first.shaderId ?? 'scene-base') &&
    (next.cullFace ?? 'back') === (first.cullFace ?? 'back') &&
    next.depthBias === first.depthBias &&
    next.depth === first.depth &&
    next.blend === first.blend
  );
}

/**
 * Appends to `runs` every run of two or more consecutive `commands` that draw from one atlas
 * layout with one state, numbering their instances on from `firstInstance`; returns the next free
 * instance. Commands outside runs, and atlases that are not resident, draw as before.
 */
export function planAtlasRuns(
  commands: readonly Mesh3DCommand[],
  resident: (source: ImmutableMeshSource) => ResidentAtlas | null,
  runs: AtlasRun[],
  firstInstance: number,
): number {
  let next = firstInstance;
  let index = 0;
  while (index < commands.length) {
    const first = commands[index] as Mesh3DCommand;
    const source = first.instanceAtlas;
    const atlas = source && (first.shaderId ?? 'scene-base') === 'scene-base' ? resident(source) : null;
    const layout = atlas ? (atlas.partLayouts[first.instanceAtlasPart ?? -1] ?? -1) : -1;
    if (!atlas || layout < 0) {
      index++;
      continue;
    }
    let end = index + 1;
    while (end < commands.length) {
      const candidate = commands[end] as Mesh3DCommand;
      if (
        candidate.instanceAtlas !== source ||
        atlas.partLayouts[candidate.instanceAtlasPart ?? -1] !== layout ||
        !sameDrawState(first, candidate)
      )
        break;
      end++;
    }
    if (end - index >= 2) {
      runs.push({ start: index, end, atlas, layout, firstInstance: next });
      next += end - index;
    }
    index = end;
  }
  return next;
}
