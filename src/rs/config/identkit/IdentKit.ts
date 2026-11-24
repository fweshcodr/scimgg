import { log } from '../../../util/Logger';
import type { CacheInfo } from '../../cache/CacheInfo';
import type { ByteBuffer } from '../../io/ByteBuffer';
import { Type } from '../Type';

export class IdentKit extends Type {
  bodyPartId: number;
  models: number[];
  nonSelectable: boolean;

  recolorFrom!: number[];
  recolorTo!: number[];
  retextureFrom!: number[];
  retextureTo!: number[];

  chatheadModels: number[];

  constructor(id: number, cacheInfo: CacheInfo) {
    super(id, cacheInfo);
    this.bodyPartId = -1;
    this.models = [];
    this.nonSelectable = false;
    this.chatheadModels = new Array(10).fill(-1);
  }

  override decodeOpcode(opcode: number, buffer: ByteBuffer): void {
    if (opcode === 1) {
      this.bodyPartId = buffer.readUnsignedByte();
    } else if (opcode === 2) {
      const count = buffer.readUnsignedByte();
      this.models = new Array(count);
      for (let i = 0; i < count; i++) {
        this.models[i] = buffer.readUnsignedShort();
      }
    } else if (opcode === 3) {
      this.nonSelectable = true;
    } else if (opcode === 5) {
      const count = buffer.readUnsignedByte();
      this.models = new Array(count);
      for (let i = 0; i < count; i++) {
        this.models[i] = buffer.readInt();
      }
    } else if (opcode === 40) {
      const count = buffer.readUnsignedByte();
      this.recolorFrom = new Array(count);
      this.recolorTo = new Array(count);
      for (let i = 0; i < count; i++) {
        this.recolorFrom[i] = buffer.readShort();
        this.recolorTo[i] = buffer.readShort();
      }
    } else if (opcode === 41) {
      const count = buffer.readUnsignedByte();
      this.retextureFrom = new Array(count);
      this.retextureTo = new Array(count);
      for (let i = 0; i < count; i++) {
        this.retextureFrom[i] = buffer.readShort();
        this.retextureTo[i] = buffer.readShort();
      }
    } else if (opcode >= 60 && opcode < 70) {
      this.chatheadModels[opcode - 60] = buffer.readUnsignedShort();
    } else if (opcode >= 70 && opcode < 80) {
      this.chatheadModels[opcode - 70] = buffer.readInt();
    } else {
      log.warn('Config', `Unknown opcode ${opcode} for kit ${this.id}`);
    }
  }
}
