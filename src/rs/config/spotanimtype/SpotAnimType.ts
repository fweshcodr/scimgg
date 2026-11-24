import { log } from '../../../util/Logger';
import type { CacheInfo } from '../../cache/CacheInfo';
import type { ByteBuffer } from '../../io/ByteBuffer';
import { Type } from '../Type';

export class SpotAnimType extends Type {
  modelId: number;
  sequenceId: number;

  recolorFrom!: number[];
  recolorTo!: number[];

  retextureFrom!: number[];
  retextureTo!: number[];

  widthScale: number;
  heightScale: number;

  orientation: number;

  ambient: number;
  contrast: number;

  constructor(id: number, cacheInfo: CacheInfo) {
    super(id, cacheInfo);
    this.modelId = -1;
    this.sequenceId = -1;
    this.widthScale = 128;
    this.heightScale = 128;
    this.orientation = 0;
    this.ambient = 0;
    this.contrast = 0;
  }

  override decodeOpcode(opcode: number, buffer: ByteBuffer): void {
    if (opcode === 1) {
      this.modelId = buffer.readUnsignedShort();
    } else if (opcode === 2) {
      this.sequenceId = buffer.readUnsignedShort();
    } else if (opcode === 3) {
      this.modelId = buffer.readInt();
    } else if (opcode === 4) {
      this.widthScale = buffer.readUnsignedShort();
    } else if (opcode === 5) {
      this.heightScale = buffer.readUnsignedShort();
    } else if (opcode === 6) {
      this.orientation = buffer.readUnsignedShort();
    } else if (opcode === 7) {
      this.ambient = buffer.readUnsignedByte();
    } else if (opcode === 8) {
      this.contrast = buffer.readUnsignedByte();
    } else if (opcode === 9) {
      buffer.readString();
    } else if (opcode === 10) {
      // Not clickable (RuneLite SpotAnimLoader); no payload.
    } else if (opcode === 40) {
      const count = buffer.readUnsignedByte();
      this.recolorFrom = new Array<number>(count);
      this.recolorTo = new Array<number>(count);
      for (let i = 0; i < count; i++) {
        this.recolorFrom[i] = buffer.readUnsignedShort();
        this.recolorTo[i] = buffer.readUnsignedShort();
      }
    } else if (opcode === 41) {
      const count = buffer.readUnsignedByte();
      this.retextureFrom = new Array<number>(count);
      this.retextureTo = new Array<number>(count);
      for (let i = 0; i < count; i++) {
        this.retextureFrom[i] = buffer.readUnsignedShort();
        this.retextureTo[i] = buffer.readUnsignedShort();
      }
    } else {
      log.warn('Config', `SpotAnimType: Unknown opcode ${opcode}. ID: ${this.id}`);
    }
  }
}
