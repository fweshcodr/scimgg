import type { BZ2Module } from '@foxglove/wasm-bz2/wasm/module';
import { fetchBody, NetworkError, retryTransient, UnsupportedBrowserError } from '../../cache/networkRetry';

const SCRIPT_URL = '/bzip2-module.js';
const WASM_URL = '/bzip2.wasm';
const WASM_MAGIC = [0x00, 0x61, 0x73, 0x6d]; // "\0asm"

export async function createWasmBzip2Module(): Promise<BZ2Module> {
  if (typeof document !== 'undefined' && typeof process === 'undefined') {
    return loadViaBrowser();
  }
  return loadViaNode();
}

function loadScript(src: string): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    const script = document.createElement('script');
    script.src = src;
    script.onload = () => {
      script.remove();
      resolve();
    };
    // A script element cannot tell a 404 from a dropped connection; both are retried.
    script.onerror = () => {
      script.remove();
      reject(new NetworkError('Failed to load @foxglove/wasm-bz2 script'));
    };
    document.head.appendChild(script);
  });
}

async function fetchWasmBinary(): Promise<ArrayBuffer> {
  const { bytes } = await retryTransient(() => fetchBody(WASM_URL));
  const head = new Uint8Array(bytes, 0, Math.min(WASM_MAGIC.length, bytes.byteLength));
  if (!WASM_MAGIC.every((byte, i) => head[i] === byte)) {
    const hex = Array.from(head, (byte) => byte.toString(16).padStart(2, '0')).join(' ');
    throw new Error(`${WASM_URL} is not a WebAssembly module (starts with ${hex || 'nothing'})`);
  }
  return bytes;
}

/**
 * The binary is fetched here and handed over as `wasmBinary`, rather than letting the
 * Emscripten glue fetch it, so a transient failure is retried and a wrong response
 * (an HTML page) is rejected with a clear error instead of an Emscripten abort.
 */
export async function loadViaBrowser(): Promise<BZ2Module> {
  if (typeof WebAssembly === 'undefined') {
    throw new UnsupportedBrowserError(
      'WebAssembly is unavailable in this browser (it may be disabled, e.g. by Lockdown Mode)',
    );
  }

  const win = window as unknown as Record<string, unknown>;
  const moduleShim: { exports: unknown } = { exports: {} };

  win.module = moduleShim;
  win.exports = moduleShim.exports;
  win.require = (path: string) => {
    if (path === './module.wasm') return WASM_URL;
    return {};
  };

  try {
    await retryTransient(() => loadScript(SCRIPT_URL));
    const wasmBinary = await fetchWasmBinary();

    const factory = moduleShim.exports as (opts?: Record<string, unknown>) => Promise<BZ2Module>;
    if (typeof factory !== 'function') {
      throw new Error(`WASM module factory not found (got ${typeof factory})`);
    }
    return await factory({ wasmBinary });
  } finally {
    delete win.module;
    delete win.exports;
    delete win.require;
  }
}

async function loadViaNode(): Promise<BZ2Module> {
  // Assembled at runtime so the client bundler cannot follow it; the browser never reaches this
  // path. A literal specifier pulls the package's Emscripten glue into the browser build, where
  // Vite's wasm plugin gives module.wasm a top-level await that the glue require()s — rolldown
  // rejects that with REQUIRE_TLA and the production build fails.
  const specifier = ['@foxglove', 'wasm-bz2', 'wasm', 'module.js'].join('/');
  const moduleExports = await import(/* @vite-ignore */ specifier);
  const factory = (moduleExports as Record<string, unknown>).default ?? moduleExports;
  if (typeof factory !== 'function') {
    throw new Error('Failed to load WASM module factory in Node.js');
  }
  return await (factory as () => Promise<BZ2Module>)();
}
