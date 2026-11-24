import { vi } from 'vitest';

/**
 * Turns a mock WebGL2 context into one that keeps a limited model of a real context's state and
 * records it at every draw, so two renderers that issue different call sequences can be compared
 * draw by draw. The model covers what PicoGLRenderer's draws depend on and no more:
 *
 * - buffers and their storage; vertex arrays with their element binding, enabled locations and
 *   attribute pointers, which must be tightly packed, non-normalized `FLOAT` at offset 0; generic
 *   attribute constants set with `vertexAttrib1f`-`4f`;
 * - the program and its scalar, `vec4` and `mat4` uniforms;
 * - capabilities, depth and color masks, cull face, front face, depth function, blend functions
 *   and texture bindings (by object, not contents or parameters);
 * - `drawArrays` and `drawElements` with 16- or 32-bit indices, reading every enabled attribute's
 *   values for the vertices drawn.
 *
 * While `recording`, anything outside that model which could change what a draw reads (instanced
 * or ranged draws, other attribute layouts, framebuffers, uniform buffers, other uniform types,
 * blend equations, stencil, scissor and polygon offset) throws instead of being silently ignored.
 * Calls are counted by name while `recording` is set.
 */
export interface GlDrawStateRecorder {
  /** One JSON snapshot per draw. */
  readonly draws: string[];
  readonly calls: Map<string, number>;
  /** Use of deleted objects and out-of-range reads or writes. */
  readonly errors: string[];
  recording: boolean;
  /** A restored context: every object of the lost one is gone and all state is back to its defaults. */
  resetContext(): void;
}

interface SimBuffer {
  readonly id: number;
  storage: Uint8Array;
  deleted: boolean;
}

interface SimVao {
  readonly id: number;
  readonly attributes: Map<number, { buffer: SimBuffer; size: number }>;
  readonly enabled: Set<number>;
  elements: SimBuffer | null;
  deleted: boolean;
}

interface SimProgram {
  readonly id: number;
  readonly uniforms: Map<string, unknown>;
}

type Location = { readonly name?: string } | null;

const ATTRIBUTE_LOCATIONS = 8;

/** Calls that change what a draw reads in ways the model does not track. */
const UNSUPPORTED_WHILE_RECORDING = [
  'vertexAttribIPointer',
  'vertexAttribDivisor',
  'drawArraysInstanced',
  'drawElementsInstanced',
  'drawRangeElements',
  'drawBuffers',
  'bindFramebuffer',
  'bindBufferBase',
  'bindBufferRange',
  'uniformBlockBinding',
  'bindSampler',
  'uniform2fv',
  'uniform3fv',
  'uniform1iv',
  'uniformMatrix3fv',
  'blendEquation',
  'blendEquationSeparate',
  'blendColor',
  'polygonOffset',
  'stencilFunc',
  'stencilOp',
  'stencilMask',
  'scissor',
];

export function recordGlDrawState(gl: WebGL2RenderingContext): GlDrawStateRecorder {
  const recorder: GlDrawStateRecorder = {
    draws: [],
    calls: new Map(),
    errors: [],
    recording: false,
    resetContext: () => reset(),
  };
  const target = gl as unknown as Record<string, unknown>;

  let nextId = 1;
  let defaultVao: SimVao;
  let vao: SimVao;
  let arrayBuffer: SimBuffer | null;
  let program: SimProgram | null;
  let generics: Map<number, number[]>;
  let state: Map<string, unknown>;
  const newVao = (): SimVao => ({
    id: nextId++,
    attributes: new Map(),
    enabled: new Set(),
    elements: null,
    deleted: false,
  });
  const reset = () => {
    defaultVao = newVao();
    vao = defaultVao;
    arrayBuffer = null;
    program = null;
    generics = new Map();
    state = new Map<string, unknown>([
      ['depthMask', true],
      ['colorMask', [true, true, true, true]],
      ['cullFace', gl.BACK],
      ['frontFace', 0x0901],
      ['caps', []],
    ]);
  };
  reset();

  const copy = (value: unknown): unknown =>
    ArrayBuffer.isView(value) ? Array.from(value as unknown as ArrayLike<number>) : value;
  const bytesOf = (data: ArrayBufferView) => new Uint8Array(data.buffer, data.byteOffset, data.byteLength);
  const live = (buffer: SimBuffer | null, call: string): SimBuffer | null => {
    if (!buffer || buffer.deleted) {
      recorder.errors.push(`${call} without a live buffer`);
      return null;
    }
    return buffer;
  };
  const bound = (bindTarget: number) => (bindTarget === gl.ELEMENT_ARRAY_BUFFER ? vao.elements : arrayBuffer);
  const setCap = (cap: number, on: boolean) => {
    const caps = new Set(state.get('caps') as number[]);
    if (on) caps.add(cap);
    else caps.delete(cap);
    state.set(
      'caps',
      [...caps].sort((a, b) => a - b),
    );
  };
  const setUniform = (location: Location, value: unknown) => {
    if (!program) {
      recorder.errors.push(`uniform ${location?.name} without a program`);
      return;
    }
    program.uniforms.set(location?.name ?? '?', value);
  };

  const read = (vertices: readonly number[]): Record<string, unknown> => {
    if (vao.deleted) recorder.errors.push('drew a deleted VAO');
    const attributes: Record<number, unknown> = {};
    for (let location = 0; location < ATTRIBUTE_LOCATIONS; location++) {
      const attribute = vao.attributes.get(location);
      if (!vao.enabled.has(location) || !attribute) {
        attributes[location] = { constant: generics.get(location) ?? [0, 0, 0, 1] };
        continue;
      }
      if (attribute.buffer.deleted) recorder.errors.push(`location ${location} reads a deleted buffer`);
      const floats = new Float32Array(
        attribute.buffer.storage.buffer,
        attribute.buffer.storage.byteOffset,
        attribute.buffer.storage.byteLength >> 2,
      );
      const values: number[] = [];
      for (const vertex of vertices) {
        if ((vertex + 1) * attribute.size > floats.length)
          recorder.errors.push(`location ${location} read past the end`);
        for (let component = 0; component < attribute.size; component++) {
          values.push(floats[vertex * attribute.size + component] ?? Number.NaN);
        }
      }
      attributes[location] = values;
    }
    return {
      program: program?.id ?? null,
      uniforms: program ? Object.fromEntries([...program.uniforms].sort(([a], [b]) => a.localeCompare(b))) : null,
      state: Object.fromEntries([...state].sort(([a], [b]) => a.localeCompare(b))),
      attributes,
    };
  };
  const draw = (call: Record<string, unknown>, vertices: readonly number[]) => {
    recorder.draws.push(JSON.stringify({ ...call, ...read(vertices) }));
  };

  const unsupported = (what: string): never => {
    throw new Error(`${what} is outside the draw-state recorder's model`);
  };

  const overrides: Record<string, (...args: never[]) => unknown> = {
    createBuffer: () => ({ id: nextId++, storage: new Uint8Array(0), deleted: false }) satisfies SimBuffer,
    deleteBuffer: (buffer: SimBuffer | null) => {
      if (buffer) buffer.deleted = true;
    },
    bindBuffer: (bindTarget: number, buffer: SimBuffer | null) => {
      if (buffer?.deleted) recorder.errors.push('bound a deleted buffer');
      if (bindTarget === gl.ELEMENT_ARRAY_BUFFER) vao.elements = buffer;
      else if (bindTarget === gl.ARRAY_BUFFER) arrayBuffer = buffer;
      else if (recorder.recording) unsupported(`bindBuffer to target ${bindTarget}`);
    },
    bufferData: (bindTarget: number, data: number | ArrayBufferView) => {
      const buffer = live(bound(bindTarget), 'bufferData');
      if (buffer) buffer.storage = typeof data === 'number' ? new Uint8Array(data) : bytesOf(data).slice();
    },
    bufferSubData: (bindTarget: number, offset: number, data: ArrayBufferView) => {
      const buffer = live(bound(bindTarget), 'bufferSubData');
      if (!buffer) return;
      if (offset + data.byteLength > buffer.storage.length) recorder.errors.push('bufferSubData past the end');
      else buffer.storage.set(bytesOf(data), offset);
    },
    createVertexArray: () => newVao(),
    deleteVertexArray: (deleted: SimVao | null) => {
      if (!deleted) return;
      deleted.deleted = true;
      // Deleting the bound vertex array reverts the binding to the default one.
      if (vao === deleted) vao = defaultVao;
    },
    bindVertexArray: (next: SimVao | null) => {
      if (next?.deleted) recorder.errors.push('bound a deleted VAO');
      vao = next ?? defaultVao;
    },
    enableVertexAttribArray: (location: number) => vao.enabled.add(location),
    disableVertexAttribArray: (location: number) => vao.enabled.delete(location),
    vertexAttribPointer: (
      location: number,
      size: number,
      type: number,
      normalized: boolean,
      stride: number,
      offset: number,
    ) => {
      if (type !== gl.FLOAT || normalized || (stride !== 0 && stride !== size * 4) || offset !== 0) {
        throw new Error(
          `vertexAttribPointer(${location}, ${size}, ${type}, ${normalized}, ${stride}, ${offset}) is not modeled`,
        );
      }
      const buffer = live(arrayBuffer, 'vertexAttribPointer');
      if (buffer) vao.attributes.set(location, { buffer, size });
    },
    vertexAttrib1f: (location: number, x: number) => generics.set(location, [x, 0, 0, 1]),
    vertexAttrib2f: (location: number, x: number, y: number) => generics.set(location, [x, y, 0, 1]),
    vertexAttrib3f: (location: number, x: number, y: number, z: number) => generics.set(location, [x, y, z, 1]),
    vertexAttrib4f: (location: number, x: number, y: number, z: number, w: number) =>
      generics.set(location, [x, y, z, w]),
    createProgram: () => ({ id: nextId++, uniforms: new Map() }) satisfies SimProgram,
    useProgram: (next: SimProgram | null) => {
      program = next;
    },
    createTexture: () => ({ id: nextId++ }),
    enable: (cap: number) => setCap(cap, true),
    disable: (cap: number) => setCap(cap, false),
    depthMask: (flag: boolean) => state.set('depthMask', flag),
    colorMask: (r: boolean, g: boolean, b: boolean, a: boolean) => state.set('colorMask', [r, g, b, a]),
    cullFace: (mode: number) => state.set('cullFace', mode),
    frontFace: (mode: number) => state.set('frontFace', mode),
    depthFunc: (func: number) => state.set('depthFunc', func),
    blendFunc: (src: number, dst: number) => state.set('blendFunc', [src, dst, src, dst]),
    blendFuncSeparate: (srcRgb: number, dstRgb: number, srcAlpha: number, dstAlpha: number) =>
      state.set('blendFunc', [srcRgb, dstRgb, srcAlpha, dstAlpha]),
    activeTexture: (unit: number) => state.set('activeTexture', unit),
    bindTexture: (bindTarget: number, texture: { id?: number } | null) =>
      state.set(`texture:${state.get('activeTexture') ?? 0x84c0}:${bindTarget}`, texture?.id ?? null),
    uniform1f: (location: Location, x: number) => setUniform(location, [x]),
    uniform1i: (location: Location, x: number) => setUniform(location, [x]),
    uniform2f: (location: Location, x: number, y: number) => setUniform(location, [x, y]),
    uniform3f: (location: Location, x: number, y: number, z: number) => setUniform(location, [x, y, z]),
    uniform4f: (location: Location, x: number, y: number, z: number, w: number) => setUniform(location, [x, y, z, w]),
    uniform1fv: (location: Location, value: ArrayLike<number>) => setUniform(location, copy(value)),
    uniform4fv: (location: Location, value: ArrayLike<number>) => setUniform(location, copy(value)),
    uniformMatrix4fv: (location: Location, transpose: boolean, value: ArrayLike<number>) =>
      setUniform(location, [transpose, copy(value)]),
    drawArrays: (mode: number, first: number, count: number) =>
      draw(
        { call: 'drawArrays', mode, first, count },
        Array.from({ length: count }, (_, index) => first + index),
      ),
    drawElements: (mode: number, count: number, type: number, offset: number) => {
      if (type !== gl.UNSIGNED_SHORT && type !== gl.UNSIGNED_INT) unsupported(`drawElements with index type ${type}`);
      const elements = live(vao.elements, 'drawElements');
      if (!elements) return;
      const width = type === gl.UNSIGNED_SHORT ? 2 : 4;
      if (offset + count * width > elements.storage.length) {
        recorder.errors.push('drawElements past the index buffer');
        return;
      }
      const view = new DataView(elements.storage.buffer, elements.storage.byteOffset);
      const indices = Array.from({ length: count }, (_, index) =>
        width === 2 ? view.getUint16(offset + index * 2, true) : view.getUint32(offset + index * 4, true),
      );
      draw({ call: 'drawElements', mode, count, type, offset }, indices);
    },
  };

  for (const name of Object.keys(target)) {
    const original = target[name];
    if (typeof original !== 'function') continue;
    const implementation = overrides[name] ?? original;
    const modelled = !UNSUPPORTED_WHILE_RECORDING.includes(name);
    target[name] = vi.fn((...args: never[]) => {
      if (recorder.recording) {
        if (!modelled) unsupported(name);
        recorder.calls.set(name, (recorder.calls.get(name) ?? 0) + 1);
      }
      return (implementation as (...args: never[]) => unknown).apply(gl, args);
    });
  }
  return recorder;
}
