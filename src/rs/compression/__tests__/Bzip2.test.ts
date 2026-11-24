import { afterEach, describe, expect, it, vi } from 'vitest';

const createModule = vi.fn();

vi.mock('../Bzip2Loader', () => ({ createWasmBzip2Module: () => createModule() }));
vi.mock('../../../util/Logger', () => ({ log: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }));

function fakeWasmModule() {
  return {
    _malloc: () => 0,
    _free: () => {},
    HEAPU8: new Uint8Array(256),
    decompress: () => ({ code: 0, buffer: new Uint8Array([1, 2, 3]).buffer }),
  };
}

/**
 * Initialization state lives in module scope, so every case needs a fresh copy.
 * Sharing one import would let the first test's cached promise satisfy the rest
 * and turn the concurrency assertions below into no-ops.
 */
async function freshBzip2() {
  vi.resetModules();
  const module = await import('../Bzip2');
  return module.Bzip2;
}

afterEach(() => {
  createModule.mockReset();
});

describe('Bzip2.decompress', () => {
  it('throws a directed error when WASM was never initialized', async () => {
    const Bzip2 = await freshBzip2();

    expect(() => Bzip2.decompress(new Uint8Array([0]), 8)).toThrow('Bzip2 WASM is not available');
  });

  it('decompresses once initialization has completed', async () => {
    createModule.mockResolvedValue(fakeWasmModule());
    const Bzip2 = await freshBzip2();
    await Bzip2.initWasm();

    expect(Bzip2.decompress(new Uint8Array([0]), 3)).toBeInstanceOf(Int8Array);
  });
});

describe('Bzip2.initWasm', () => {
  it('initializes once no matter how many callers race', async () => {
    createModule.mockResolvedValue(fakeWasmModule());
    const Bzip2 = await freshBzip2();

    await Promise.all([Bzip2.initWasm(), Bzip2.initWasm(), Bzip2.initWasm()]);

    expect(createModule).toHaveBeenCalledTimes(1);
  });

  /**
   * `main.tsx` starts the bootstrap without awaiting it and `CacheManager` awaits a
   * second call; a boolean flag set before the await lets that call return with an
   * instance that is still null, so the next decompress throws.
   */
  it('makes a later caller wait for an in-flight initialization', async () => {
    let release: (value: unknown) => void = () => {};
    createModule.mockReturnValue(
      new Promise((resolve) => {
        release = resolve;
      }),
    );
    const Bzip2 = await freshBzip2();

    const first = Bzip2.initWasm();
    const second = Bzip2.initWasm();
    release(fakeWasmModule());
    await Promise.all([first, second]);

    expect(() => Bzip2.decompress(new Uint8Array([0]), 3)).not.toThrow();
  });

  it('rejects instead of reporting success when initialization fails', async () => {
    createModule.mockRejectedValue(new Error('wasm fetch failed'));
    const Bzip2 = await freshBzip2();

    await expect(Bzip2.initWasm()).rejects.toThrow('wasm fetch failed');
  });

  it('allows a retry after a transient failure', async () => {
    createModule.mockRejectedValueOnce(new Error('offline')).mockResolvedValueOnce(fakeWasmModule());
    const Bzip2 = await freshBzip2();

    await expect(Bzip2.initWasm()).rejects.toThrow('offline');
    await expect(Bzip2.initWasm()).resolves.toBeUndefined();
    expect(() => Bzip2.decompress(new Uint8Array([0]), 3)).not.toThrow();
  });
});
