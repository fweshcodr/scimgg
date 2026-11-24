export interface MockWebGLProgram {
  id: number;
  vertexShader?: MockWebGLShader;
  fragmentShader?: MockWebGLShader;
  linked: boolean;
}

export interface MockWebGLShader {
  id: number;
  type: number;
  source: string;
  compiled: boolean;
}

export interface MockWebGLTexture {
  id: number;
  target: number;
  format: number;
  type: number;
  width: number;
  height: number;
  depth: number;
  data?: ArrayBufferView;
}

export interface MockWebGLBuffer {
  id: number;
  target: number;
  data?: ArrayBufferView;
  size: number;
  usage: number;
}

export interface MockWebGLFramebuffer {
  id: number;
  colorAttachments: Map<number, MockWebGLTexture>;
  depthAttachment?: MockWebGLTexture;
}

export interface MockWebGLRenderbuffer {
  id: number;
  format: number;
  width: number;
  height: number;
}

export interface MockWebGLUniformLocation {
  name: string;
  type: number;
  value: any;
}

export interface MockWebGLVertexArrayObject {
  id: number;
  elementBuffer?: MockWebGLBuffer;
  attributes: Map<
    number,
    {
      buffer: MockWebGLBuffer;
      size: number;
      type: number;
      normalized: boolean;
      stride: number;
      offset: number;
    }
  >;
}

export function createMockWebGL2Context(): WebGL2RenderingContext {
  let nextId = 1;
  const programs = new Map<WebGLProgram, MockWebGLProgram>();
  const shaders = new Map<WebGLShader, MockWebGLShader>();
  const textures = new Map<WebGLTexture, MockWebGLTexture>();
  const buffers = new Map<WebGLBuffer, MockWebGLBuffer>();
  const framebuffers = new Map<WebGLFramebuffer, MockWebGLFramebuffer>();
  const renderbuffers = new Map<WebGLRenderbuffer, MockWebGLRenderbuffer>();
  const vaos = new Map<WebGLVertexArrayObject, MockWebGLVertexArrayObject>();
  const uniformLocations = new Map<WebGLUniformLocation, MockWebGLUniformLocation>();

  let currentProgram: MockWebGLProgram | null = null;
  let currentTexture: MockWebGLTexture | null = null;
  let currentBuffer: MockWebGLBuffer | null = null;
  let currentFramebuffer: MockWebGLFramebuffer | null = null;
  let currentVAO: MockWebGLVertexArrayObject | null = null;

  const mockContext: any = {
    VERTEX_SHADER: 0x8b31,
    FRAGMENT_SHADER: 0x8b30,
    PROGRAM: 0x8259,
    TEXTURE_2D: 0x0de1,
    TEXTURE_2D_ARRAY: 0x8c1a,
    TEXTURE_3D: 0x806f,
    ARRAY_BUFFER: 0x8892,
    ELEMENT_ARRAY_BUFFER: 0x8893,
    COPY_READ_BUFFER: 0x8f36,
    COPY_WRITE_BUFFER: 0x8f37,
    UNIFORM_BUFFER: 0x8a11,
    SHADER_STORAGE_BUFFER: 0x90d2,
    FRAMEBUFFER: 0x8d40,
    RENDERBUFFER: 0x8d41,
    COLOR_ATTACHMENT0: 0x8ce0,
    DEPTH_ATTACHMENT: 0x8d00,
    DEPTH_STENCIL_ATTACHMENT: 0x821a,
    RGBA: 0x1908,
    RGB: 0x1907,
    RGBA8: 0x8058,
    RGB8: 0x8051,
    DEPTH_COMPONENT24: 0x81a6,
    DEPTH_COMPONENT32F: 0x8cac,
    UNSIGNED_BYTE: 0x1401,
    UNSIGNED_SHORT: 0x1403,
    UNSIGNED_INT: 0x1405,
    FLOAT: 0x1406,
    HALF_FLOAT: 0x140b,
    STATIC_DRAW: 0x88e4,
    DYNAMIC_DRAW: 0x88e8,
    STREAM_DRAW: 0x88e0,
    TRIANGLES: 0x0004,
    TRIANGLE_STRIP: 0x0005,
    TRIANGLE_FAN: 0x0006,
    LINES: 0x0001,
    LINE_STRIP: 0x0003,
    POINTS: 0x0000,
    COMPILE_STATUS: 0x8b81,
    LINK_STATUS: 0x8b82,
    VALIDATE_STATUS: 0x8b83,
    INFO_LOG_LENGTH: 0x8b84,
    ACTIVE_UNIFORMS: 0x8b86,
    ACTIVE_ATTRIBUTES: 0x8b89,
    TEXTURE_WRAP_S: 0x2802,
    TEXTURE_WRAP_T: 0x2803,
    TEXTURE_MIN_FILTER: 0x2801,
    TEXTURE_MAG_FILTER: 0x2800,
    LINEAR: 0x2601,
    NEAREST: 0x2600,
    LINEAR_MIPMAP_LINEAR: 0x2703,
    CLAMP_TO_EDGE: 0x812f,
    REPEAT: 0x2901,
    MIRRORED_REPEAT: 0x8370,
    UNPACK_ALIGNMENT: 0x0cf5,
    UNPACK_FLIP_Y_WEBGL: 0x9240,
    UNPACK_PREMULTIPLY_ALPHA_WEBGL: 0x9241,
    UNPACK_COLORSPACE_CONVERSION_WEBGL: 0x9243,
    VIEWPORT: 0x0ba2,
    SCISSOR_BOX: 0x0c10,
    SCISSOR_TEST: 0x0c11,
    BLEND: 0x0be2,
    CULL_FACE: 0x0b44,
    DEPTH_TEST: 0x0b71,
    DITHER: 0x0bd0,
    POLYGON_OFFSET_FILL: 0x8037,
    SAMPLE_ALPHA_TO_COVERAGE: 0x809e,
    SAMPLE_COVERAGE: 0x80a0,
    STENCIL_TEST: 0x0b90,

    createShader(type: number): WebGLShader {
      const shader: any = { __id: nextId++ };
      shaders.set(shader, {
        id: shader.__id,
        type,
        source: '',
        compiled: false,
      });
      return shader;
    },

    shaderSource(shader: WebGLShader, source: string): void {
      const mock = shaders.get(shader);
      if (mock) {
        mock.source = source;
      }
    },

    compileShader(shader: WebGLShader): void {
      const mock = shaders.get(shader);
      if (mock) {
        mock.compiled = true;
      }
    },

    getShaderParameter(shader: WebGLShader, pname: number): any {
      const mock = shaders.get(shader);
      if (!mock) return null;
      if (pname === mockContext.COMPILE_STATUS) return true;
      if (pname === mockContext.INFO_LOG_LENGTH) return 0;
      return null;
    },

    getShaderInfoLog(_shader: WebGLShader): string {
      return '';
    },

    deleteShader(shader: WebGLShader): void {
      shaders.delete(shader);
    },

    createProgram(): WebGLProgram {
      const program: any = { __id: nextId++ };
      programs.set(program, {
        id: program.__id,
        linked: false,
      });
      return program;
    },

    attachShader(program: WebGLProgram, shader: WebGLShader): void {
      const programMock = programs.get(program);
      const shaderMock = shaders.get(shader);
      if (programMock && shaderMock) {
        if (shaderMock.type === mockContext.VERTEX_SHADER) {
          programMock.vertexShader = shaderMock;
        } else if (shaderMock.type === mockContext.FRAGMENT_SHADER) {
          programMock.fragmentShader = shaderMock;
        }
      }
    },

    linkProgram(_program: WebGLProgram): void {
      const mock = programs.get(_program);
      if (mock) {
        mock.linked = true;
      }
    },

    useProgram(program: WebGLProgram | null): void {
      if (program === null) {
        currentProgram = null;
      } else {
        currentProgram = programs.get(program) || null;
      }
    },

    getProgramParameter(program: WebGLProgram, pname: number): any {
      const mock = programs.get(program);
      if (!mock) return null;
      if (pname === mockContext.LINK_STATUS) return mock.linked;
      if (pname === mockContext.VALIDATE_STATUS) return true;
      if (pname === mockContext.INFO_LOG_LENGTH) return 0;
      if (pname === mockContext.ACTIVE_UNIFORMS) return 0;
      if (pname === mockContext.ACTIVE_ATTRIBUTES) return 0;
      return null;
    },

    getProgramInfoLog(_program: WebGLProgram): string {
      return '';
    },

    deleteProgram(_program: WebGLProgram): void {
      programs.delete(_program);
    },

    getUniformLocation(_program: WebGLProgram, name: string): WebGLUniformLocation | null {
      const location: any = { __id: nextId++, __name: name };
      uniformLocations.set(location, {
        name,
        type: mockContext.FLOAT,
        value: null,
      });
      return location;
    },

    uniform1f(location: WebGLUniformLocation | null, x: number): void {
      if (location) {
        const mock = uniformLocations.get(location);
        if (mock) mock.value = x;
      }
    },

    uniform2f(location: WebGLUniformLocation | null, x: number, y: number): void {
      if (location) {
        const mock = uniformLocations.get(location);
        if (mock) mock.value = [x, y];
      }
    },

    uniform3f(location: WebGLUniformLocation | null, x: number, y: number, z: number): void {
      if (location) {
        const mock = uniformLocations.get(location);
        if (mock) mock.value = [x, y, z];
      }
    },

    uniform4f(location: WebGLUniformLocation | null, x: number, y: number, z: number, w: number): void {
      if (location) {
        const mock = uniformLocations.get(location);
        if (mock) mock.value = [x, y, z, w];
      }
    },

    uniform1i(location: WebGLUniformLocation | null, x: number): void {
      if (location) {
        const mock = uniformLocations.get(location);
        if (mock) mock.value = x;
      }
    },

    uniform2i(location: WebGLUniformLocation | null, x: number, y: number): void {
      if (location) {
        const mock = uniformLocations.get(location);
        if (mock) mock.value = [x, y];
      }
    },

    uniform3i(location: WebGLUniformLocation | null, x: number, y: number, z: number): void {
      if (location) {
        const mock = uniformLocations.get(location);
        if (mock) mock.value = [x, y, z];
      }
    },

    uniform4i(location: WebGLUniformLocation | null, x: number, y: number, z: number, w: number): void {
      if (location) {
        const mock = uniformLocations.get(location);
        if (mock) mock.value = [x, y, z, w];
      }
    },

    uniformMatrix4fv(location: WebGLUniformLocation | null, _transpose: boolean, value: Float32Array): void {
      if (location) {
        const mock = uniformLocations.get(location);
        if (mock) mock.value = new Float32Array(value);
      }
    },

    createTexture(): WebGLTexture {
      const texture: any = { __id: nextId++ };
      textures.set(texture, {
        id: texture.__id,
        target: mockContext.TEXTURE_2D,
        format: mockContext.RGBA,
        type: mockContext.UNSIGNED_BYTE,
        width: 0,
        height: 0,
        depth: 1,
      });
      return texture;
    },

    bindTexture(target: number, texture: WebGLTexture | null): void {
      if (texture === null) {
        currentTexture = null;
      } else {
        const mock = textures.get(texture);
        if (mock) {
          mock.target = target;
          currentTexture = mock;
        }
      }
    },

    texImage2D(...args: any[]): void {
      if (currentTexture) {
        if (args.length === 9) {
          currentTexture.width = args[3];
          currentTexture.height = args[4];
          currentTexture.format = args[6];
          currentTexture.type = args[7];
          currentTexture.data = args[8];
        } else if (args.length === 6) {
          currentTexture.format = args[3];
          currentTexture.type = args[4];
        }
      }
    },

    texImage3D(
      _target: number,
      _level: number,
      _internalformat: number,
      width: number,
      height: number,
      depth: number,
      _border: number,
      format: number,
      type: number,
      pixels: ArrayBufferView | null,
    ): void {
      if (currentTexture) {
        currentTexture.width = width;
        currentTexture.height = height;
        currentTexture.depth = depth;
        currentTexture.format = format;
        currentTexture.type = type;
        currentTexture.data = pixels || undefined;
      }
    },

    texParameteri(_target: number, _pname: number, _param: number): void {},

    texParameterf(_target: number, _pname: number, _param: number): void {},

    deleteTexture(texture: WebGLTexture): void {
      textures.delete(texture);
    },

    createBuffer(): WebGLBuffer {
      const buffer: any = { __id: nextId++ };
      buffers.set(buffer, {
        id: buffer.__id,
        target: mockContext.ARRAY_BUFFER,
        size: 0,
        usage: mockContext.STATIC_DRAW,
      });
      return buffer;
    },

    bindBuffer(target: number, buffer: WebGLBuffer | null): void {
      if (buffer === null) {
        currentBuffer = null;
      } else {
        const mock = buffers.get(buffer);
        if (mock) {
          mock.target = target;
          currentBuffer = mock;
        }
      }
    },

    bufferData(...args: any[]): void {
      if (currentBuffer) {
        if (typeof args[1] === 'number') {
          currentBuffer.size = args[1];
        } else {
          currentBuffer.data = args[1];
          currentBuffer.size = args[1].byteLength;
        }
        currentBuffer.usage = args[2];
      }
    },

    bufferSubData(_target: number, _offset: number, data: ArrayBufferView): void {
      if (currentBuffer) {
        currentBuffer.data = data;
      }
    },

    deleteBuffer(buffer: WebGLBuffer): void {
      buffers.delete(buffer);
    },

    createFramebuffer(): WebGLFramebuffer {
      const framebuffer: any = { __id: nextId++ };
      framebuffers.set(framebuffer, {
        id: framebuffer.__id,
        colorAttachments: new Map(),
      });
      return framebuffer;
    },

    bindFramebuffer(_target: number, framebuffer: WebGLFramebuffer | null): void {
      if (framebuffer === null) {
        currentFramebuffer = null;
      } else {
        const mock = framebuffers.get(framebuffer);
        if (mock) {
          currentFramebuffer = mock;
        }
      }
    },

    framebufferTexture2D(
      _target: number,
      attachment: number,
      _textarget: number,
      texture: WebGLTexture | null,
      _level: number,
    ): void {
      if (currentFramebuffer && texture) {
        const textureMock = textures.get(texture);
        if (textureMock) {
          if (attachment === mockContext.DEPTH_ATTACHMENT) {
            currentFramebuffer.depthAttachment = textureMock;
          } else {
            currentFramebuffer.colorAttachments.set(attachment, textureMock);
          }
        }
      }
    },

    deleteFramebuffer(framebuffer: WebGLFramebuffer): void {
      framebuffers.delete(framebuffer);
    },

    createRenderbuffer(): WebGLRenderbuffer {
      const renderbuffer: any = { __id: nextId++ };
      renderbuffers.set(renderbuffer, {
        id: renderbuffer.__id,
        format: 0,
        width: 0,
        height: 0,
      });
      return renderbuffer;
    },

    deleteRenderbuffer(renderbuffer: WebGLRenderbuffer): void {
      renderbuffers.delete(renderbuffer);
    },

    createVertexArray(): WebGLVertexArrayObject {
      const vao: any = { __id: nextId++ };
      vaos.set(vao, {
        id: vao.__id,
        attributes: new Map(),
      });
      return vao;
    },

    bindVertexArray(array: WebGLVertexArrayObject | null): void {
      if (array === null) {
        currentVAO = null;
      } else {
        const mock = vaos.get(array);
        if (mock) {
          currentVAO = mock;
        }
      }
    },

    vertexAttribPointer(
      index: number,
      size: number,
      type: number,
      normalized: boolean,
      stride: number,
      offset: number,
    ): void {
      if (currentVAO && currentBuffer) {
        currentVAO.attributes.set(index, {
          buffer: currentBuffer,
          size,
          type,
          normalized,
          stride,
          offset,
        });
      }
    },

    enableVertexAttribArray(_index: number): void {},

    disableVertexAttribArray(_index: number): void {},

    deleteVertexArray(vertexArray: WebGLVertexArrayObject): void {
      vaos.delete(vertexArray);
    },

    clear(_mask: number): void {},

    clearColor(_red: number, _green: number, _blue: number, _alpha: number): void {},

    viewport(_x: number, _y: number, _width: number, _height: number): void {},

    drawArrays(_mode: number, _first: number, _count: number): void {},

    drawElements(_mode: number, _count: number, _type: number, _offset: number): void {},

    enable(_cap: number): void {},

    disable(_cap: number): void {},

    getParameter(pname: number): any {
      if (pname === mockContext.VIEWPORT) return [0, 0, 800, 600];
      if (pname === mockContext.SCISSOR_BOX) return [0, 0, 800, 600];
      return null;
    },

    __getMockProgram(program: WebGLProgram): MockWebGLProgram | undefined {
      return programs.get(program);
    },

    __getMockTexture(texture: WebGLTexture): MockWebGLTexture | undefined {
      return textures.get(texture);
    },

    __getMockBuffer(buffer: WebGLBuffer): MockWebGLBuffer | undefined {
      return buffers.get(buffer);
    },

    __getMockVAO(vao: WebGLVertexArrayObject): MockWebGLVertexArrayObject | undefined {
      return vaos.get(vao);
    },

    __getMockFramebuffer(framebuffer: WebGLFramebuffer): any {
      return framebuffers.get(framebuffer);
    },

    __getMockUniformLocation(location: WebGLUniformLocation): MockWebGLUniformLocation | undefined {
      return uniformLocations.get(location);
    },

    __getCurrentProgram(): MockWebGLProgram | null {
      return currentProgram;
    },

    __getCurrentTexture(): MockWebGLTexture | null {
      return currentTexture;
    },

    __getCurrentBuffer(): MockWebGLBuffer | null {
      return currentBuffer;
    },

    __getCurrentVAO(): MockWebGLVertexArrayObject | null {
      return currentVAO;
    },
  };

  return mockContext as WebGL2RenderingContext;
}
