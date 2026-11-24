import { Bzip2 } from '../compression/Bzip2';
import { CompressionType } from '../compression/CompressionType';
import { Gzip } from '../compression/Gzip';
import { Xtea } from '../crypto/Xtea';
import type { ByteBuffer } from '../io/ByteBuffer';

export class Container {
  static decode(buffer: ByteBuffer, key?: number[]): Container {
    if (buffer.remaining === 0) {
      throw new Error('Empty container');
    }
    const compression: CompressionType = buffer.readUnsignedByte();
    const size = buffer.readInt();
    if (Xtea.isValidKey(key)) {
      Xtea.decrypt(buffer, buffer.offset, buffer.offset + 4 + size, key);
    }
    let data: Int8Array;
    switch (compression) {
      case CompressionType.None:
        data = buffer.readBytes(size);
        break;
      case CompressionType.Bzip2:
      case CompressionType.Gzip: {
        const actualSize = buffer.readInt() & 0xffffffff;

        const compressed = buffer.readUnsignedBytes(size);

        let decompressed: Int8Array;

        if (compression === CompressionType.Bzip2) {
          decompressed = Bzip2.decompress(compressed, actualSize);
        } else {
          decompressed = Gzip.decompress(compressed);
        }

        if (decompressed.length !== actualSize) {
          throw new Error(
            'Container: Size mismatch. Compressed: ' +
              actualSize +
              ', Decompressed: ' +
              decompressed.length +
              ', Type: ' +
              CompressionType[compression],
          );
        }
        data = decompressed;
        break;
      }
      default:
        throw new Error(`Container: Unsupported compression: ${compression}`);
    }

    // RuneLite commit 8655977 supports 4-byte revisions.
    let revision = -1;
    if (buffer.remaining >= 4) {
      revision = buffer.readInt();
    } else if (buffer.remaining >= 2) {
      revision = buffer.readUnsignedShort();
    }

    return new Container(compression, data, revision);
  }

  constructor(
    readonly compression: CompressionType,
    readonly data: Int8Array,
    readonly revision: number = -1,
  ) {}
}
