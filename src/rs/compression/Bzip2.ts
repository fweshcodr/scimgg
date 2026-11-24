import type { BZ2Module } from '@foxglove/wasm-bz2/wasm/module';
import { log } from '../../util/Logger';
import { createWasmBzip2Module } from './Bzip2Loader';

const BZIP2_HEADER = new Uint8Array([0x42, 0x5a, 0x68, 0x31]); // "BZh1"

interface WasmBzip2Instance {
  decompress(data: Uint8Array, expectedSize: number, options?: { small?: boolean }): Uint8Array;
}

class WasmBzip2InstanceImpl {
  private constructor(private module: BZ2Module) {}

  static async init(): Promise<WasmBzip2InstanceImpl> {
    return new WasmBzip2InstanceImpl(await createWasmBzip2Module());
  }

  decompress(src: Uint8Array, destSize: number, { small = false } = {}): Uint8Array {
    const srcBuf = this.module._malloc(src.byteLength); // eslint-disable-line no-underscore-dangle
    const dstBuf = this.module._malloc(destSize); // eslint-disable-line no-underscore-dangle
    this.module.HEAPU8.subarray(srcBuf, srcBuf + src.byteLength).set(src);

    try {
      const { code, error, buffer } = this.module.decompress(dstBuf, destSize, srcBuf, src.byteLength, small ? 1 : 0);
      if (code !== 0 || buffer === undefined) {
        throw new Error(`BZ2 decompression failed: ${code} (${error ?? 'unknown'})`);
      }
      return new Uint8Array(buffer);
    } finally {
      this.module._free(srcBuf); // eslint-disable-line no-underscore-dangle
      this.module._free(dstBuf); // eslint-disable-line no-underscore-dangle
    }
  }
}

/**
 * A bzip2 container was reached without the decoder loaded. The production mirror holds no bzip2
 * (trim-cache re-encodes it as gzip), so there this means a stale or mis-built artifact.
 */
export class Bzip2UnavailableError extends Error {
  override name = 'Bzip2UnavailableError';
}

let wasmInstance: WasmBzip2Instance | null = null;
let initialization: Promise<WasmBzip2Instance> | null = null;

export class Bzip2 {
  /**
   * Every caller awaits the SAME initialization, and a failure rejects.
   *
   * A `boolean` flag set before the await cannot do this: `main.tsx` starts the
   * bootstrap without awaiting it, so `CacheManager` reaching the flag mid-flight
   * would return from an "initialized" module whose instance is still null, and
   * the next decompress would throw. Swallowing the error instead is just as
   * wrong — it strands a permanently broken decompressor that every later
   * `await initWasm()` reports as success.
   */
  static async initWasm(): Promise<void> {
    initialization ??= WasmBzip2InstanceImpl.init()
      .then((instance) => {
        wasmInstance = instance;
        log.info('Compression', 'Bzip2 WASM initialized successfully');
        return instance;
      })
      .catch((error: unknown) => {
        // Cleared so a transient failure (a dropped .wasm fetch) can be retried
        // rather than poisoning the module for the rest of the session.
        initialization = null;
        log.warn('Compression', 'Bzip2 WASM failed to initialize; bzip2 cache containers cannot be read:', error);
        throw error;
      });

    await initialization;
  }

  /**
   * There is deliberately no pure-JS fallback behind this.
   *
   * The obvious candidate, the `bzip2` npm package, publishes no license at all.
   * Re-adding a fallback means finding a genuinely licensed decoder first;
   * `scripts/licenseNotices.ts` fails the build on an unlicensed one.
   */
  static decompress(compressed: Uint8Array, actualSize: number): Int8Array {
    if (!wasmInstance) {
      throw new Bzip2UnavailableError(
        'Bzip2 WASM is not available. Call Bzip2.initWasm() before decompressing, and check the browser supports WebAssembly.',
      );
    }

    const compressedBzip = new Uint8Array(compressed.length + 4);
    compressedBzip.set(BZIP2_HEADER, 0);
    compressedBzip.set(compressed, 4);

    const decompressed = wasmInstance.decompress(compressedBzip, actualSize, { small: false });
    return new Int8Array(decompressed.buffer);
  }
}
