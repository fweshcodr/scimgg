// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NetworkError, UnsupportedBrowserError } from '../../../cache/networkRetry';
import { loadViaBrowser } from '../Bzip2Loader';

vi.mock('../../../util/Logger', () => ({ log: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }));

declare const global: typeof globalThis;

const WASM_BYTES = new Uint8Array([0x00, 0x61, 0x73, 0x6d, 0x01, 0x00, 0x00, 0x00]).buffer;
const fakeModule = { decompress: vi.fn() };
const factory = vi.fn(async (_opts?: Record<string, unknown>) => fakeModule);
const realFetch = global.fetch;

/**
 * Stands in for the browser loading /bzip2-module.js: each injected script either
 * fails or "runs" the Emscripten glue, which assigns its factory to `module.exports`.
 */
function interceptScripts(outcomes: Array<'error' | 'load'>) {
  const appended: string[] = [];
  vi.spyOn(document.head, 'appendChild').mockImplementation(<T extends Node>(node: T): T => {
    const script = node as unknown as HTMLScriptElement;
    appended.push(script.src);
    const outcome = outcomes.shift() ?? 'load';
    queueMicrotask(() => {
      if (outcome === 'error') {
        script.onerror?.(new Event('error'));
        return;
      }
      (window as unknown as { module: { exports: unknown } }).module.exports = factory;
      script.onload?.(new Event('load'));
    });
    return node;
  });
  return appended;
}

function wasmResponse(buffer: ArrayBuffer) {
  return { ok: true, status: 200, headers: { get: () => null }, body: null, arrayBuffer: async () => buffer };
}

async function settle<T>(promise: Promise<T>): Promise<T> {
  const guarded = promise.then(
    (value) => ({ value }),
    (error: unknown) => ({ error }),
  );
  await vi.runAllTimersAsync();
  const result = await guarded;
  if ('error' in result) throw result.error;
  return result.value;
}

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  factory.mockClear();
  global.fetch = realFetch;
});

describe('loadViaBrowser', () => {
  it('hands the fetched binary to the Emscripten factory instead of letting it fetch', async () => {
    interceptScripts(['load']);
    global.fetch = vi.fn().mockResolvedValue(wasmResponse(WASM_BYTES));

    await expect(settle(loadViaBrowser())).resolves.toBe(fakeModule);

    expect(fetch).toHaveBeenCalledWith('/bzip2.wasm', expect.anything());
    expect(factory).toHaveBeenCalledWith({ wasmBinary: WASM_BYTES });
    expect('module' in window).toBe(false);
    expect('require' in window).toBe(false);
  });

  it('retries the glue script after a failed load', async () => {
    const appended = interceptScripts(['error', 'load']);
    global.fetch = vi.fn().mockResolvedValue(wasmResponse(WASM_BYTES));

    await expect(settle(loadViaBrowser())).resolves.toBe(fakeModule);

    expect(appended).toHaveLength(2);
  });

  it('gives up on the glue script with a NetworkError after three attempts', async () => {
    const appended = interceptScripts(['error', 'error', 'error']);
    global.fetch = vi.fn();

    const error = await settle(loadViaBrowser()).catch((e: unknown) => e);

    expect(appended).toHaveLength(3);
    expect(error).toBeInstanceOf(NetworkError);
    expect(fetch).not.toHaveBeenCalled();
    expect('module' in window).toBe(false);
  });

  it('retries a dropped wasm fetch', async () => {
    interceptScripts(['load']);
    global.fetch = vi
      .fn()
      .mockRejectedValueOnce(new TypeError('Load failed'))
      .mockResolvedValueOnce(wasmResponse(WASM_BYTES));

    await expect(settle(loadViaBrowser())).resolves.toBe(fakeModule);

    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it('rejects an HTML page served as the wasm binary without retrying or calling the factory', async () => {
    interceptScripts(['load']);
    global.fetch = vi.fn().mockResolvedValue(wasmResponse(new TextEncoder().encode('\n<!DOCTYPE html>').buffer));

    const error = await settle(loadViaBrowser()).catch((e: unknown) => e);

    expect(error).not.toBeInstanceOf(NetworkError);
    expect((error as Error).message).toBe('/bzip2.wasm is not a WebAssembly module (starts with 0a 3c 21 44)');
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(factory).not.toHaveBeenCalled();
  });

  it('does not retry a 404 for the wasm binary', async () => {
    interceptScripts(['load']);
    global.fetch = vi.fn().mockResolvedValue({ ok: false, status: 404, statusText: 'Not Found' });

    const error = await settle(loadViaBrowser()).catch((e: unknown) => e);

    expect(error).not.toBeInstanceOf(NetworkError);
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it('reports a browser without WebAssembly directly instead of loading anything', async () => {
    vi.stubGlobal('WebAssembly', undefined);
    const appended = interceptScripts([]);

    const error = await settle(loadViaBrowser()).catch((e: unknown) => e);

    expect(error).toBeInstanceOf(UnsupportedBrowserError);
    expect((error as Error).message).toContain('WebAssembly is unavailable in this browser');
    expect(appended).toHaveLength(0);
  });
});
