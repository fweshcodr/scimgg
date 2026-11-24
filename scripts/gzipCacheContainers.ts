/**
 * Re-encodes the trimmed cache's bzip2 containers as gzip, so production can decode the whole
 * mirror with pako and never loads the bzip2 WebAssembly decoder.
 *
 * A dat2 container is `[compression u8][length u32][uncompressed size u32][payload][version]`,
 * the version trailer being 0, 2 or 4 bytes. Only the payload changes: the uncompressed size
 * and the trailer are copied, so `Container.decode` returns the same data and revision. The
 * reference tables' CRCs describe the upstream bytes and no longer match a re-encoded container;
 * the client never checks them.
 */
import { gzipSync } from 'node:zlib';
import { Bzip2 } from '../src/rs/compression/Bzip2';
import { CompressionType } from '../src/rs/compression/CompressionType';

/** How `manifest.json` names each container compression (see `CacheInfo.containerCompressions`). */
export const COMPRESSION_NAMES: Readonly<Record<CompressionType, 'none' | 'bzip2' | 'gzip'>> = {
  [CompressionType.None]: 'none',
  [CompressionType.Bzip2]: 'bzip2',
  [CompressionType.Gzip]: 'gzip',
};

// Every bzip2 stream opens with a block header (pi) or, if empty, the end-of-stream marker
// (sqrt pi). The container drops the "BZh1" file header (see Bzip2.decompress), so these are
// its first bytes; XTEA-encrypted bytes would not be.
const BZIP2_BLOCK_MAGIC = [0x31, 0x41, 0x59, 0x26, 0x53, 0x59];
const BZIP2_END_MAGIC = [0x17, 0x72, 0x45, 0x38, 0x50, 0x90];
const GZIP_OS_BYTE = 9;
const GZIP_OS_UNKNOWN = 0xff;

/**
 * Returns `container` with a bzip2 payload replaced by gzip (zlib level 9, memLevel 9); any other container is
 * returned unchanged. `Bzip2.initWasm()` must have resolved. Throws on a container it cannot
 * re-encode faithfully - truncated, encrypted, or decompressing to the wrong size - because
 * leaving it bzip2 would ship an archive production cannot read.
 */
export function gzipBzip2Container(container: Uint8Array, key: string): Uint8Array {
  if (container[0] !== CompressionType.Bzip2) return container;

  const view = new DataView(container.buffer, container.byteOffset, container.byteLength);
  if (container.length < 9) throw new Error(`bzip2 container ${key} is truncated (${container.length} bytes)`);
  const length = view.getUint32(1);
  const actualSize = view.getUint32(5);
  const payload = container.subarray(9, 9 + length);
  const trailer = container.subarray(9 + length);
  if (payload.length !== length || trailer.length > 4) {
    throw new Error(`bzip2 container ${key} declares a ${length}-byte payload but holds ${container.length - 9}`);
  }
  const starts = (magic: readonly number[]) => magic.every((byte, i) => payload[i] === byte);
  if (!starts(BZIP2_BLOCK_MAGIC) && !starts(BZIP2_END_MAGIC)) {
    throw new Error(
      `bzip2 container ${key} does not open with a bzip2 block: it is XTEA-encrypted or corrupt, and cannot ` +
        `be re-encoded without its key. The production mirror must decode without the bzip2 decoder, so it cannot ship as bzip2 either.`,
    );
  }

  const data = Bzip2.decompress(payload, actualSize);
  if (data.length !== actualSize) {
    throw new Error(`bzip2 container ${key} decompressed to ${data.length} bytes, not ${actualSize}`);
  }
  const gzip = gzipSync(new Uint8Array(data.buffer, data.byteOffset, data.byteLength), { level: 9, memLevel: 9 });
  // zlib already writes a zero mtime; the OS byte is the only header field that depends on the
  // build machine, so pin it to "unknown" and keep the artifact byte-identical across platforms.
  gzip[GZIP_OS_BYTE] = GZIP_OS_UNKNOWN;

  const out = new Uint8Array(9 + gzip.length + trailer.length);
  const outView = new DataView(out.buffer);
  out[0] = CompressionType.Gzip;
  outView.setUint32(1, gzip.length);
  outView.setUint32(5, actualSize);
  out.set(gzip, 9);
  out.set(trailer, 9 + gzip.length);
  return out;
}
