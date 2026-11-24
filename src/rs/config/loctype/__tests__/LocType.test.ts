import { describe, expect, it } from 'vitest';
import type { CacheInfo } from '../../../cache/CacheInfo';
import { ByteBuffer } from '../../../io/ByteBuffer';
import { LocType } from '../LocType';

const CACHE_INFO: CacheInfo = {
  name: 'test',
  game: 'oldschool',
  environment: 'live',
  revision: 240,
  timestamp: '2026-09-10',
  size: 0,
};

function decodeLoc(bytes: number[]): { type: LocType; buffer: ByteBuffer } {
  const type = new LocType(1, CACHE_INFO);
  const buffer = new ByteBuffer(Int8Array.from(bytes));
  type.decode(buffer);
  type.post();
  return { type, buffer };
}

describe('LocType multiloc transforms', () => {
  // Loc 150 as shipped in openrs2 cache 2752 (build 241, opcode 77, 2-byte ids) and in cache
  // 2757 (build 242, opcode 97, 3-byte ids): the same multiloc in both encodings.
  it.each([
    ['opcode 77 (build 241)', [0x13, 0x01, 0x4d, 0x07, 0x00, 0xff, 0xff, 0x01, 0x2c, 0xc3, 0x2c, 0xc4, 0x00]],
    [
      'opcode 97 (build 242)',
      [0x13, 0x01, 0x61, 0x07, 0x00, 0xff, 0xff, 0x01, 0x00, 0x2c, 0xc3, 0x00, 0x2c, 0xc4, 0x00],
    ],
  ])('decodes %s', (_label, bytes) => {
    const { type, buffer } = decodeLoc(bytes);

    expect(type.transformVarbit).toBe(0x0700);
    expect(type.transformVarp).toBe(-1);
    expect(type.transforms).toEqual([11459, 11460, -1]);
    expect(type.models).toBeUndefined();
    expect(buffer.offset).toBe(buffer.length);
  });

  it('reads 0xffffff as no loc and keeps decoding the opcodes that follow opcode 97', () => {
    // Loc 59392 from cache 2757 with opcode 74 appended after the multiloc.
    const { type, buffer } = decodeLoc([
      0x18, 0x33, 0x67, 0x3d, 0x09, 0x0e, 0x13, 0x01, 0x0e, 0x05, 0x0f, 0x05, 0x40, 0x16, 0x11, 0x44, 0x00, 0xc4, 0x61,
      0x4a, 0x29, 0xff, 0xff, 0x01, 0xff, 0xff, 0xff, 0x00, 0xeb, 0xc0, 0x4a, 0x00,
    ]);

    expect(type.seqId).toBe(0x3367);
    expect(type.sizeX).toBe(5);
    expect(type.sizeY).toBe(5);
    expect(type.transformVarbit).toBe(0x4a29);
    expect(type.transforms).toEqual([-1, 0xebc0, -1]);
    expect(type.isHollow).toBe(true);
    expect(buffer.offset).toBe(buffer.length);
  });

  it.each([
    ['opcode 92 (2-byte ids)', [0x5c, 0x23, 0x38, 0xff, 0xff, 0x88, 0x98, 0x01, 0x88, 0x97, 0xff, 0xff, 0x00]],
    [
      'opcode 98 (3-byte ids)',
      [0x62, 0x23, 0x38, 0xff, 0xff, 0x00, 0x88, 0x98, 0x01, 0x00, 0x88, 0x97, 0xff, 0xff, 0xff, 0x00],
    ],
  ])('decodes %s with its default loc last', (_label, bytes) => {
    const { type, buffer } = decodeLoc(bytes);

    expect(type.transformVarbit).toBe(0x2338);
    expect(type.transformVarp).toBe(-1);
    expect(type.transforms).toEqual([0x8897, -1, 0x8898]);
    expect(buffer.offset).toBe(buffer.length);
  });
});

describe('LocType surface raise', () => {
  it('defaults to no surface raise when opcode 96 is absent', () => {
    const type = new LocType(1, CACHE_INFO);

    type.decode(new ByteBuffer(new Int8Array([0])));

    expect(type.raise).toBe(0);
  });

  it.each([0, 1, 128, 255])('decodes an unsigned unscaled surface raise of %i', (raise) => {
    const type = new LocType(1, CACHE_INFO);
    const buffer = new ByteBuffer(new Int8Array([96, raise, 71, 0xff, 0xc0, 0]));

    type.decode(buffer);

    expect(type.raise).toBe(raise);
    expect(type.offsetHeight).toBe(-64);
    expect(buffer.offset).toBe(buffer.length);
  });
});
