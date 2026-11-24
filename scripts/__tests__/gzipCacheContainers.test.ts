import { gunzipSync } from 'node:zlib';
import { beforeAll, describe, expect, it } from 'vitest';
import { Container } from '../../src/rs/cache/Container';
import { Bzip2 } from '../../src/rs/compression/Bzip2';
import { CompressionType } from '../../src/rs/compression/CompressionType';
import { ByteBuffer } from '../../src/rs/io/ByteBuffer';
import { gzipBzip2Container } from '../gzipCacheContainers';

const DATA = 'scim.gg cache container payload, scim.gg cache container payload';
// `printf '<DATA>' | bzip2 -1`; a container stores the stream without its 4-byte "BZh1" header.
const BZIP2_STREAM = Buffer.from(
  '425a6831314159265359e433b7e200001d118040052ee7dc2020005425400d0d0c81554683469a7a4f4955586fd5dda12f965d2a2884a1858e194976553239e96843e2ee48a70a121c8676fc40',
  'hex',
);

function bzip2Container(trailer: readonly number[]): Uint8Array {
  const payload = BZIP2_STREAM.subarray(4);
  const out = new Uint8Array(9 + payload.length + trailer.length);
  const view = new DataView(out.buffer);
  out[0] = CompressionType.Bzip2;
  view.setUint32(1, payload.length);
  view.setUint32(5, DATA.length);
  out.set(payload, 9);
  out.set(trailer, 9 + payload.length);
  return out;
}

const decode = (container: Uint8Array) => Container.decode(new ByteBuffer(Int8Array.from(container)));

beforeAll(async () => {
  await Bzip2.initWasm();
});

describe('gzipBzip2Container', () => {
  it.each([
    ['no version trailer', []],
    ['a 2-byte version', [0x01, 0x02]],
    ['a 4-byte version', [0x01, 0x02, 0x03, 0x04]],
  ])('re-encodes a bzip2 container with %s to gzip carrying the same data and revision', (_name, trailer) => {
    const original = bzip2Container(trailer);

    const reencoded = gzipBzip2Container(original, '2:13');

    expect(reencoded[0]).toBe(CompressionType.Gzip);
    const before = decode(original);
    const after = decode(reencoded);
    expect(Buffer.from(after.data).toString()).toBe(DATA);
    expect(after.data).toEqual(before.data);
    expect(after.revision).toBe(before.revision);
    expect([...reencoded.subarray(reencoded.length - trailer.length)]).toEqual(trailer);
  });

  it('is byte-deterministic, with no build-machine OS in the gzip header', () => {
    const first = gzipBzip2Container(bzip2Container([1, 2]), '2:13');
    const gzip = first.subarray(9, first.length - 2);

    expect(gzipBzip2Container(bzip2Container([1, 2]), '2:13')).toEqual(first);
    expect([...gzip.subarray(4, 10)]).toEqual([0, 0, 0, 0, 2, 0xff]);
    expect(gunzipSync(gzip).toString()).toBe(DATA);
  });

  it('returns stored and gzip containers untouched', () => {
    const gzip = gzipBzip2Container(bzip2Container([]), '2:13');
    const stored = Uint8Array.from([CompressionType.None, 0, 0, 0, 1, 42]);

    expect(gzipBzip2Container(gzip, '7:1')).toBe(gzip);
    expect(gzipBzip2Container(stored, '7:2')).toBe(stored);
  });

  it('refuses an encrypted container rather than shipping it as bzip2', () => {
    const encrypted = bzip2Container([]);
    encrypted[9] ^= 0x5a;

    expect(() => gzipBzip2Container(encrypted, '5:3')).toThrow(/bzip2 container 5:3 .*XTEA-encrypted or corrupt/);
  });

  it('refuses a container whose payload runs past its end', () => {
    const truncated = bzip2Container([]).subarray(0, 20);

    expect(() => gzipBzip2Container(truncated, '0:4')).toThrow('declares a');
  });
});
