export type GpuStatus = 'hardware' | 'software' | 'no-webgl2';

export interface GpuDetectionResult {
  status: GpuStatus;
  renderer: string | null;
  vendor: string | null;
}

/**
 * Known software renderer substrings (case-insensitive).
 *
 * These indicate the browser is falling back to CPU-based rasterization,
 * which will cause extremely poor performance for this WebGL2 app.
 */
const SOFTWARE_RENDERER_PATTERNS = [
  'swiftshader',
  'llvmpipe',
  'softpipe',
  'software rasterizer',
  'mesa software',
  'microsoft basic render',
  'google swiftshader',
] as const;

const REQUIRED_WEBGL2_METHODS = [
  'viewport',
  'getParameter',
  'getExtension',
  'isContextLost',
  'createShader',
  'createProgram',
  'createBuffer',
  'createVertexArray',
  'texStorage3D',
  'drawElements',
] as const;

/**
 * Privacy and anti-fingerprinting extensions can make `getContext('webgl2')` return a
 * truthy stand-in that is not a real context (`this.gl.viewport is not a function` from
 * inside PicoGL). Only the methods the renderer calls are checked, not
 * `instanceof`: cross-realm and forwarding wrappers fail identity yet work fine.
 */
export function isUsableWebGL2Context(gl: unknown): gl is WebGL2RenderingContext {
  if (typeof gl !== 'object' || gl === null) return false;
  const candidate = gl as Record<string, unknown>;
  return REQUIRED_WEBGL2_METHODS.every((name) => typeof candidate[name] === 'function');
}

let cachedResult: GpuDetectionResult | null = null;

/**
 * Seed the cached result so no probe context is ever created.
 *
 * The probe allocates a real WebGL2 context, and several components call it
 * independently (App, LoadingScreen, WebGL2Gate). The dev UI harness renders no
 * scene and must stay GL-free, so its entry seeds the answer before React
 * mounts. Nothing in the app itself calls this.
 */
export function presetGpuStatus(result: GpuDetectionResult | null): void {
  cachedResult = result;
}

export function detectGpuStatus(): GpuDetectionResult {
  if (cachedResult) return cachedResult;
  const canvas = document.createElement('canvas');
  let gl: WebGL2RenderingContext | null = null;
  try {
    const candidate: unknown = canvas.getContext('webgl2');
    gl = isUsableWebGL2Context(candidate) ? candidate : null;
  } catch {
    gl = null;
  }

  if (!gl) {
    cachedResult = { status: 'no-webgl2', renderer: null, vendor: null };
    return cachedResult;
  }

  let renderer: string | null = null;
  let vendor: string | null = null;

  try {
    const debugInfo = gl.getExtension('WEBGL_debug_renderer_info');
    if (debugInfo) {
      renderer = gl.getParameter(debugInfo.UNMASKED_RENDERER_WEBGL) as string | null;
      vendor = gl.getParameter(debugInfo.UNMASKED_VENDOR_WEBGL) as string | null;
    }
  } catch {
    renderer = null;
    vendor = null;
  }

  const isSoftware = isSoftwareRenderer(renderer);

  try {
    const loseCtx = gl.getExtension('WEBGL_lose_context');
    if (loseCtx) loseCtx.loseContext();
  } catch {
    // Context cleanup is best-effort only. Dev tools such as webgl-lint can
    // throw when WEBGL_lose_context is exercised; that must not turn an
    // already-created WebGL2 context into a false "unsupported" result.
  }

  cachedResult = {
    status: isSoftware ? 'software' : 'hardware',
    renderer,
    vendor,
  };
  return cachedResult;
}

function isSoftwareRenderer(renderer: string | null): boolean {
  if (!renderer) return false;
  const lower = renderer.toLowerCase();
  return SOFTWARE_RENDERER_PATTERNS.some((pattern) => lower.includes(pattern));
}
