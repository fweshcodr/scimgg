import { describe, expect, it } from 'vitest';
import { createMockWebGL2Context } from '../mocks/webgl-mock';

describe('WebGL2 Mock Context', () => {
  it('creates a mock WebGL2 context', () => {
    const gl = createMockWebGL2Context();
    expect(gl).toBeDefined();
    expect(gl.VERTEX_SHADER).toBe(0x8b31);
    expect(gl.FRAGMENT_SHADER).toBe(0x8b30);
  });

  it('supports shader creation and compilation', () => {
    const gl = createMockWebGL2Context();
    const shader = gl.createShader(gl.VERTEX_SHADER);
    expect(shader).toBeDefined();

    if (shader) {
      gl.shaderSource(shader, 'void main() {}');
      gl.compileShader(shader);

      const compiled = gl.getShaderParameter(shader, gl.COMPILE_STATUS);
      expect(compiled).toBe(true);
    }
  });

  it('supports program creation and linking', () => {
    const gl = createMockWebGL2Context();
    const program = gl.createProgram();
    expect(program).toBeDefined();

    gl.linkProgram(program);
    const linked = gl.getProgramParameter(program, gl.LINK_STATUS);
    expect(linked).toBe(true);
  });

  it('supports texture creation and binding', () => {
    const gl = createMockWebGL2Context();
    const texture = gl.createTexture();
    expect(texture).toBeDefined();

    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 256, 256, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);

    const mockGL = gl as any;
    const mockTexture = mockGL.__getMockTexture(texture);
    expect(mockTexture).toBeDefined();
    expect(mockTexture.width).toBe(256);
    expect(mockTexture.height).toBe(256);
  });

  it('supports buffer creation and binding', () => {
    const gl = createMockWebGL2Context();
    const buffer = gl.createBuffer();
    expect(buffer).toBeDefined();

    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    const data = new Float32Array([0, 1, 2, 3]);
    gl.bufferData(gl.ARRAY_BUFFER, data, gl.STATIC_DRAW);

    const mockGL = gl as any;
    const mockBuffer = mockGL.__getMockBuffer(buffer);
    expect(mockBuffer).toBeDefined();
    expect(mockBuffer.size).toBe(16);
  });

  it('supports vertex array objects', () => {
    const gl = createMockWebGL2Context();
    const vao = gl.createVertexArray();
    expect(vao).toBeDefined();

    gl.bindVertexArray(vao);
    const buffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 12, 0);

    const mockGL = gl as any;
    const mockVAO = mockGL.__getMockVAO(vao);
    expect(mockVAO).toBeDefined();
    expect(mockVAO.attributes.size).toBe(1);
  });

  it('supports uniform setting', () => {
    const gl = createMockWebGL2Context();
    const program = gl.createProgram();
    gl.useProgram(program);

    const location = gl.getUniformLocation(program, 'uColor');
    expect(location).toBeDefined();

    gl.uniform4f(location, 1, 0, 0, 1);
    const mockGL = gl as any;
    const mockLocation = mockGL.__getMockUniformLocation?.(location);
    expect(mockLocation).toBeDefined();
  });

  it('supports framebuffer operations', () => {
    const gl = createMockWebGL2Context();
    const framebuffer = gl.createFramebuffer();
    expect(framebuffer).toBeDefined();

    gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffer);
    const texture = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 256, 256, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, texture, 0);

    const mockGL = gl as any;
    const mockFB = mockGL.__getMockFramebuffer?.(framebuffer);
    expect(mockFB).toBeDefined();
  });
});
