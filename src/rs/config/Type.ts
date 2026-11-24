import { log } from '../../util/Logger';
import type { CacheInfo } from '../cache/CacheInfo';
import { type CacheType, detectCacheType } from '../cache/CacheType';
import type { ByteBuffer } from '../io/ByteBuffer';

export type ParamsMap = Map<number, number | string>;

export abstract class Type {
  readonly id: number;

  readonly cacheInfo: CacheInfo;

  readonly cacheType: CacheType;

  static readParamsMap(buf: ByteBuffer, params?: ParamsMap): ParamsMap {
    const count = buf.readUnsignedByte();
    if (!params) {
      params = new Map<number, number | string>();
    }

    for (let i = 0; i < count; i++) {
      const isStringValue = buf.readUnsignedByte() === 1;
      const key = buf.readMedium();
      if (isStringValue) {
        params.set(key, buf.readString());
      } else {
        params.set(key, buf.readInt());
      }
    }
    return params;
  }

  constructor(id: number, cacheInfo: CacheInfo) {
    this.id = id;
    this.cacheInfo = cacheInfo;
    this.cacheType = detectCacheType(cacheInfo);
  }

  readString(buffer: ByteBuffer): string {
    const stopValue = this.cacheType !== 'dat2' ? 0xa : 0;
    return buffer.readString(stopValue);
  }

  decode(buffer: ByteBuffer): void {
    const isDebugType = this.id === 12140 || this.id === 12141 || this.id === 12142;
    if (isDebugType) {
      log.trace('Config', `Type.decode(${this.id}): bufferLength=${buffer.length}`);
    }
    while (true) {
      if (buffer.offset > buffer.length - 1) {
        throw new Error('Buffer overflow');
      }
      const opcode = buffer.readUnsignedByte();
      if (opcode === 0) {
        break;
      }
      if (isDebugType) {
        log.trace('Config', `Type.decode(${this.id}): opcode=${opcode} at offset=${buffer.offset - 1}`);
      }
      this.decodeOpcode(opcode, buffer);
    }
  }

  abstract decodeOpcode(opcode: number, buffer: ByteBuffer): void;

  post(): void {}
}
