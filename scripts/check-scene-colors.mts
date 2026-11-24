// Run with Node 22.18+ (not tsx, whose __name helpers cannot cross page.evaluate):
// node scripts/check-scene-colors.mts -- requires Playwright Chromium.
import { readFileSync } from 'node:fs';
import { chromium } from 'playwright';

function checkSceneColors(sources: { readonly base: string; readonly effects: string; readonly fragment: string }) {
  const canvas = document.createElement('canvas');
  canvas.width = 1;
  canvas.height = 1;
  const gl = canvas.getContext('webgl2', { antialias: false, premultipliedAlpha: false });
  if (!gl) throw new Error('Scene color regression requires WebGL2');

  const failures: string[] = [];
  const samples: { program: string; material: string; defaults: number[]; darker: number[]; brighter: number[] }[] = [];
  let checks = 0;
  const check = (name: string, passed: boolean, actual: readonly number[]) => {
    checks++;
    if (!passed) failures.push(`${name}: [${actual.join(', ')}]`);
  };
  const compile = (type: number, source: string) => {
    const shader = gl.createShader(type);
    if (!shader) throw new Error('Cannot allocate scene shader');
    gl.shaderSource(shader, source);
    gl.compileShader(shader);
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS))
      throw new Error(gl.getShaderInfoLog(shader) ?? 'Compile failed');
    return shader;
  };
  const fragment = compile(gl.FRAGMENT_SHADER, sources.fragment);
  const vertices = gl.createBuffer();
  const texture = gl.createTexture();
  gl.bindBuffer(gl.ARRAY_BUFFER, vertices);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 0, 3, -1, 0, -1, 3, 0]), gl.STATIC_DRAW);
  gl.enableVertexAttribArray(0);
  gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 0, 0);
  gl.vertexAttrib2f(2, 0.5, 0.5);
  gl.bindTexture(gl.TEXTURE_2D_ARRAY, texture);
  gl.texParameteri(gl.TEXTURE_2D_ARRAY, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
  gl.texParameteri(gl.TEXTURE_2D_ARRAY, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
  gl.texStorage3D(gl.TEXTURE_2D_ARRAY, 1, gl.RGBA8, 1, 1, 2);
  gl.viewport(0, 0, 1, 1);
  gl.disable(gl.DITHER);

  try {
    for (const [programName, vertexSource] of [
      ['base', sources.base],
      ['effects', sources.effects],
    ]) {
      const vertex = compile(gl.VERTEX_SHADER, vertexSource);
      const program = gl.createProgram();
      if (!program) throw new Error('Cannot allocate scene program');
      gl.attachShader(program, vertex);
      gl.attachShader(program, fragment);
      gl.linkProgram(program);
      if (!gl.getProgramParameter(program, gl.LINK_STATUS))
        throw new Error(gl.getProgramInfoLog(program) ?? 'Link failed');
      const bindProgram = gl.useProgram.bind(gl);
      bindProgram(program);
      const uniform = (name: string, value: number) => gl.uniform1f(gl.getUniformLocation(program, name), value);
      gl.uniformMatrix4fv(
        gl.getUniformLocation(program, 'u_viewProjMatrix'),
        false,
        new Float32Array([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]),
      );
      gl.uniform1i(gl.getUniformLocation(program, 'u_textures'), 0);
      uniform('u_colorBanding', 255);

      try {
        for (const material of [
          { name: 'HSL', textureId: 0, hsl: 688, baseline: [194, 79, 70] },
          { name: 'texture', textureId: 1, hsl: 96, baseline: [146, 96, 63] },
        ]) {
          const label = `${programName}/${material.name}`;
          gl.vertexAttrib1f(3, material.textureId);
          gl.vertexAttrib1f(4, material.hsl);
          gl.vertexAttrib1f(6, 0.5);
          uniform('u_hasTextures', 1);
          uniform('u_discardAlpha', 0);
          gl.texSubImage3D(
            gl.TEXTURE_2D_ARRAY,
            0,
            0,
            0,
            1,
            1,
            1,
            1,
            gl.RGBA,
            gl.UNSIGNED_BYTE,
            new Uint8Array([40, 80, 160, 255]),
          );

          const draw = (brightness = 0.6, contrast = 1, saturation = 1) => {
            uniform('u_brightness', brightness);
            uniform('u_contrast', contrast);
            uniform('u_saturation', saturation);
            gl.clearColor(0, 0, 0, 0);
            gl.clear(gl.COLOR_BUFFER_BIT);
            gl.drawArrays(gl.TRIANGLES, 0, 3);
            const pixel = new Uint8Array(4);
            gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, pixel);
            return Array.from(pixel);
          };
          const defaults = draw();
          check(
            `${label} preserves default RGB`,
            material.baseline.every((value, index) => Math.abs(defaults[index] - value) <= 1),
            defaults,
          );
          const darker = draw(0.4);
          const brighter = draw(0.9);
          samples.push({ program: programName, material: material.name, defaults, darker, brighter });
          check(
            `${label} lower brightness darkens`,
            darker.slice(0, 3).every((value, index) => value < defaults[index]),
            darker,
          );
          check(
            `${label} higher brightness brightens`,
            brighter.slice(0, 3).every((value, index) => value > defaults[index]),
            brighter,
          );
          const black = draw(0);
          check(
            `${label} zero brightness is black`,
            black.slice(0, 3).every((value) => value === 0),
            black,
          );
          const maximum = draw(1.2);
          check(
            `${label} maximum brightness doubles RGB`,
            maximum.slice(0, 3).every((value, index) => Math.abs(value - Math.min(255, defaults[index] * 2)) <= 1),
            maximum,
          );

          for (const contrast of [0.5, 2]) {
            const pixel = draw(0.6, contrast);
            check(
              `${label} contrast ${contrast} scales distance from midgray`,
              pixel
                .slice(0, 3)
                .every(
                  (value, index) =>
                    Math.abs(value - Math.max(0, Math.min(255, (defaults[index] - 127.5) * contrast + 127.5))) <= 1.5,
                ),
              pixel,
            );
          }
          const gray = draw(0.6, 1, 0);
          const luminance = defaults[0] * 0.299 + defaults[1] * 0.587 + defaults[2] * 0.114;
          check(
            `${label} saturation zero is luminance grayscale`,
            gray[0] === gray[1] && gray[1] === gray[2] && Math.abs(gray[0] - luminance) <= 1,
            gray,
          );
          const vivid = draw(0.6, 1, 2);
          check(
            `${label} saturation two increases channel separation`,
            Math.max(...vivid.slice(0, 3)) - Math.min(...vivid.slice(0, 3)) >
              Math.max(...defaults.slice(0, 3)) - Math.min(...defaults.slice(0, 3)),
            vivid,
          );
          const combined = draw(0.9, 0.5, 0);
          check(
            `${label} brightness precedes contrast and saturation`,
            combined.slice(0, 3).every((value) => Math.abs(value - (luminance * 1.5 * 0.5 + 127.5 * 0.5)) <= 1),
            combined,
          );
          check(
            `${label} controls preserve vertex alpha`,
            Math.abs(defaults[3] - 127.5) <= 0.5 &&
              [darker, brighter, black, maximum, gray, vivid, combined].every((pixel) => pixel[3] === defaults[3]),
            combined,
          );

          gl.vertexAttrib1f(6, 0.005);
          uniform('u_discardAlpha', 1);
          const discarded = draw(1.2, 2, 2);
          check(
            `${label} alpha discard survives color controls`,
            discarded.every((value) => value === 0),
            discarded,
          );
          gl.vertexAttrib1f(6, 0.5);
          uniform('u_discardAlpha', 0);

          if (material.textureId > 0) {
            gl.vertexAttrib1f(4, 48);
            const shaded = draw();
            check(
              `${label} texture lighting remains linear after palette gamma`,
              shaded.slice(0, 3).every((value, index) => Math.abs(value * 2 - defaults[index]) <= 1),
              shaded,
            );
            gl.vertexAttrib1f(4, material.hsl);
            gl.texSubImage3D(
              gl.TEXTURE_2D_ARRAY,
              0,
              0,
              0,
              1,
              1,
              1,
              1,
              gl.RGBA,
              gl.UNSIGNED_BYTE,
              new Uint8Array([40, 80, 160, 254]),
            );
            const cutout = draw(1.2, 2, 2);
            check(
              `${label} nonopaque texels remain discarded`,
              cutout.every((value) => value === 0),
              cutout,
            );
            uniform('u_hasTextures', 0);
            const fallback = draw();
            check(
              `${label} missing texture retains vertex lighting`,
              fallback.slice(0, 3).every((value) => value === 193),
              fallback,
            );
          }
        }
        check(`${programName} WebGL error state`, gl.getError() === gl.NO_ERROR, []);
      } finally {
        gl.deleteProgram(program);
        gl.deleteShader(vertex);
      }
    }
    const info = gl.getExtension('WEBGL_debug_renderer_info');
    const renderer: unknown = info ? gl.getParameter(info.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER);
    const report = { checks, failures, samples, renderer };
    if (failures.length > 0) throw new Error(JSON.stringify(report, null, 2));
    return report;
  } finally {
    gl.deleteBuffer(vertices);
    gl.deleteTexture(texture);
    gl.deleteShader(fragment);
    gl.getExtension('WEBGL_lose_context')?.loseContext();
  }
}

const shader = (name: string) =>
  readFileSync(new URL(`../src/render/backends/picogl/shaders/${name}.glsl`, import.meta.url), 'utf8');
const browser = await chromium.launch({ headless: true });
try {
  const page = await browser.newPage();
  const report = await page.evaluate(checkSceneColors, {
    base: shader('scene-base.vert'),
    effects: shader('scene-effects.vert'),
    fragment: shader('scene.frag'),
  });
  console.log(JSON.stringify(report, null, 2));
} finally {
  await browser.close();
}
