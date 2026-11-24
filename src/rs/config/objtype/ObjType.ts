import { log } from '../../../util/Logger';
import type { CacheInfo } from '../../cache/CacheInfo';
import type { ByteBuffer } from '../../io/ByteBuffer';
import { type ParamsMap, Type } from '../Type';

export class ObjType extends Type {
  name: string;

  inventoryModel: number;
  zoom2d: number;
  xan2d: number;
  yan2d: number;
  zan2d: number;
  offsetX2d: number;
  offsetY2d: number;

  stackable: boolean;
  cost: number;
  members: boolean;

  groundActions: (string | undefined)[];
  inventoryActions: (string | undefined)[];

  maleModel0: number;
  maleModel1: number;
  maleModel2: number;
  maleOffset: number;
  femaleModel0: number;
  femaleModel1: number;
  femaleModel2: number;
  femaleOffset: number;

  wearPos1: number;
  wearPos2: number;
  wearPos3: number;

  maleHeadModel: number;
  maleHeadModel2: number;
  femaleHeadModel: number;
  femaleHeadModel2: number;

  recolorFrom!: number[];
  recolorTo!: number[];
  retextureFrom!: number[];
  retextureTo!: number[];

  note: number;
  noteTemplate: number;
  countItem!: number[];
  countCo!: number[];

  weight: number;

  shiftClickDropIndex: number;
  team: number;
  bought: number;
  boughtTemplate: number;
  placeholder: number;
  placeholderTemplate: number;

  params!: ParamsMap;

  constructor(id: number, cacheInfo: CacheInfo) {
    super(id, cacheInfo);
    this.name = 'null';
    this.inventoryModel = 0;
    this.zoom2d = 2000;
    this.xan2d = 0;
    this.yan2d = 0;
    this.zan2d = 0;
    this.offsetX2d = 0;
    this.offsetY2d = 0;
    this.stackable = false;
    this.cost = 1;
    this.members = false;
    this.groundActions = new Array(5);
    this.inventoryActions = new Array(5);
    this.maleModel0 = -1;
    this.maleModel1 = -1;
    this.maleModel2 = -1;
    this.maleOffset = 0;
    this.femaleModel0 = -1;
    this.femaleModel1 = -1;
    this.femaleModel2 = -1;
    this.femaleOffset = 0;
    this.wearPos1 = -1;
    this.wearPos2 = -1;
    this.wearPos3 = -1;
    this.maleHeadModel = -1;
    this.maleHeadModel2 = -1;
    this.femaleHeadModel = -1;
    this.femaleHeadModel2 = -1;
    this.note = -1;
    this.noteTemplate = -1;
    this.shiftClickDropIndex = -2;
    this.team = 0;
    this.bought = -1;
    this.boughtTemplate = -1;
    this.placeholder = -1;
    this.placeholderTemplate = -1;
    this.weight = 0;
  }

  isEquippable(): boolean {
    return this.wearPos1 !== -1 || this.maleModel0 !== -1 || this.femaleModel0 !== -1;
  }

  getWornModelId(gender: 0 | 1, slotIndex: 0 | 1 | 2): number {
    if (gender === 1) {
      const femaleModel = slotIndex === 0 ? this.femaleModel0 : slotIndex === 1 ? this.femaleModel1 : this.femaleModel2;
      if (femaleModel !== -1) return femaleModel;
    }
    return slotIndex === 0 ? this.maleModel0 : slotIndex === 1 ? this.maleModel1 : this.maleModel2;
  }

  getWornOffset(gender: 0 | 1): number {
    return gender === 1 ? this.femaleOffset : this.maleOffset;
  }

  override decodeOpcode(opcode: number, buffer: ByteBuffer): void {
    if (opcode === 1) {
      this.inventoryModel = buffer.readUnsignedShort();
    } else if (opcode === 2) {
      this.name = this.readString(buffer);
    } else if (opcode === 3) {
      this.readString(buffer);
    } else if (opcode === 4) {
      this.zoom2d = buffer.readUnsignedShort();
    } else if (opcode === 5) {
      this.xan2d = buffer.readUnsignedShort();
    } else if (opcode === 6) {
      this.yan2d = buffer.readUnsignedShort();
    } else if (opcode === 7) {
      this.offsetX2d = buffer.readUnsignedShort();
      if (this.offsetX2d > 32767) {
        this.offsetX2d -= 65536;
      }
    } else if (opcode === 8) {
      this.offsetY2d = buffer.readUnsignedShort();
      if (this.offsetY2d > 32767) {
        this.offsetY2d -= 65536;
      }
    } else if (opcode === 9) {
      this.readString(buffer);
    } else if (opcode === 10) {
      buffer.readUnsignedShort();
    } else if (opcode === 11) {
      this.stackable = true;
    } else if (opcode === 12) {
      this.cost = buffer.readInt();
    } else if (opcode === 13) {
      this.wearPos1 = buffer.readByte();
    } else if (opcode === 14) {
      this.wearPos2 = buffer.readByte();
    } else if (opcode === 16) {
      this.members = true;
    } else if (opcode === 23) {
      this.maleModel0 = buffer.readUnsignedShort();
      this.maleOffset = buffer.readUnsignedByte();
    } else if (opcode === 24) {
      this.maleModel1 = buffer.readUnsignedShort();
    } else if (opcode === 25) {
      this.femaleModel0 = buffer.readUnsignedShort();
      this.femaleOffset = buffer.readUnsignedByte();
    } else if (opcode === 26) {
      this.femaleModel1 = buffer.readUnsignedShort();
    } else if (opcode === 27) {
      this.wearPos3 = buffer.readByte();
    } else if (opcode >= 30 && opcode < 35) {
      this.groundActions[opcode - 30] = this.readString(buffer);
      if (this.groundActions[opcode - 30]?.toLowerCase() === 'hidden') {
        this.groundActions[opcode - 30] = undefined;
      }
    } else if (opcode >= 35 && opcode < 40) {
      this.inventoryActions[opcode - 35] = this.readString(buffer);
    } else if (opcode === 40) {
      const count = buffer.readUnsignedByte();
      this.recolorFrom = new Array(count);
      this.recolorTo = new Array(count);
      for (let i = 0; i < count; i++) {
        this.recolorFrom[i] = buffer.readUnsignedShort();
        this.recolorTo[i] = buffer.readUnsignedShort();
      }
    } else if (opcode === 41) {
      const count = buffer.readUnsignedByte();
      this.retextureFrom = new Array(count);
      this.retextureTo = new Array(count);
      for (let i = 0; i < count; i++) {
        this.retextureFrom[i] = buffer.readUnsignedShort();
        this.retextureTo[i] = buffer.readUnsignedShort();
      }
    } else if (opcode === 42) {
      this.shiftClickDropIndex = buffer.readByte();
    } else if (opcode === 43) {
      // Subops (variable length)
      buffer.readUnsignedByte();
      while (buffer.readUnsignedByte() !== 0) {
        this.readString(buffer);
      }
    } else if (opcode === 44) {
      this.inventoryModel = buffer.readInt();
    } else if (opcode === 45) {
      this.maleModel0 = buffer.readInt();
      this.maleOffset = buffer.readUnsignedByte();
    } else if (opcode === 46) {
      this.maleModel1 = buffer.readInt();
    } else if (opcode === 47) {
      this.maleModel2 = buffer.readInt();
    } else if (opcode === 48) {
      this.femaleModel0 = buffer.readInt();
      this.femaleOffset = buffer.readUnsignedByte();
    } else if (opcode === 49) {
      this.femaleModel1 = buffer.readInt();
    } else if (opcode === 50) {
      this.femaleModel2 = buffer.readInt();
    } else if (opcode === 51) {
      this.maleHeadModel = buffer.readInt();
    } else if (opcode === 52) {
      this.maleHeadModel2 = buffer.readInt();
    } else if (opcode === 53) {
      this.femaleHeadModel = buffer.readInt();
    } else if (opcode === 54) {
      this.femaleHeadModel2 = buffer.readInt();
    } else if (opcode === 65) {
    } else if (opcode === 75) {
      this.weight = buffer.readShort();
    } else if (opcode === 78) {
      this.maleModel2 = buffer.readUnsignedShort();
    } else if (opcode === 79) {
      this.femaleModel2 = buffer.readUnsignedShort();
    } else if (opcode === 84 || opcode === 99) {
      buffer.readUnsignedShort();
    } else if (opcode === 90) {
      this.maleHeadModel = buffer.readUnsignedShort();
    } else if (opcode === 91) {
      this.femaleHeadModel = buffer.readUnsignedShort();
    } else if (opcode === 92) {
      this.maleHeadModel2 = buffer.readUnsignedShort();
    } else if (opcode === 93) {
      this.femaleHeadModel2 = buffer.readUnsignedShort();
    } else if (opcode === 94) {
      buffer.readUnsignedShort();
    } else if (opcode === 95) {
      this.zan2d = buffer.readUnsignedShort();
    } else if (opcode === 96) {
      buffer.readUnsignedByte();
    } else if (opcode === 97) {
      this.note = buffer.readUnsignedShort();
    } else if (opcode === 98) {
      this.noteTemplate = buffer.readUnsignedShort();
    } else if (opcode >= 100 && opcode < 110) {
      if (!this.countItem) {
        this.countItem = new Array(10);
        this.countCo = new Array(10);
      }
      this.countItem[opcode - 100] = buffer.readUnsignedShort();
      this.countCo[opcode - 100] = buffer.readUnsignedShort();
    } else if (opcode === 110 || opcode === 111 || opcode === 112) {
      buffer.readUnsignedShort();
    } else if (opcode === 113 || opcode === 114) {
      buffer.readByte();
    } else if (opcode === 115) {
      this.team = buffer.readUnsignedByte();
    } else if (opcode === 116 || opcode === 117) {
      buffer.readUnsignedShort();
    } else if (opcode === 121 || opcode === 122) {
      buffer.readUnsignedShort();
    } else if (opcode === 125 || opcode === 126) {
      buffer.readByte();
      buffer.readByte();
      buffer.readByte();
    } else if (opcode >= 127 && opcode <= 130) {
      buffer.readUnsignedByte();
      buffer.readUnsignedShort();
    } else if (opcode === 132) {
      const count = buffer.readUnsignedByte();
      for (let i = 0; i < count; i++) {
        buffer.readUnsignedShort();
      }
    } else if (opcode === 139) {
      this.bought = buffer.readUnsignedShort();
    } else if (opcode === 140) {
      this.boughtTemplate = buffer.readUnsignedShort();
    } else if (opcode >= 142 && opcode < 147) {
      buffer.readUnsignedShort();
    } else if (opcode === 148) {
      this.placeholder = buffer.readUnsignedShort();
    } else if (opcode === 149) {
      this.placeholderTemplate = buffer.readUnsignedShort();
    } else if (opcode >= 150 && opcode < 155) {
      buffer.readUnsignedShort();
    } else if (opcode === 200) {
      // Entity sub-op: index(1) + subID(1) + string
      buffer.readUnsignedByte();
      buffer.readUnsignedByte();
      this.readString(buffer);
    } else if (opcode === 201) {
      // Entity conditional op: index(1) + varp(2) + varb(2) + min(4) + max(4) + string
      buffer.readUnsignedByte();
      buffer.readUnsignedShort();
      buffer.readUnsignedShort();
      buffer.readInt();
      buffer.readInt();
      this.readString(buffer);
    } else if (opcode === 202) {
      // Entity conditional sub-op: index(1) + subID(2) + varp(2) + varb(2) + min(4) + max(4) + string
      buffer.readUnsignedByte();
      buffer.readUnsignedShort();
      buffer.readUnsignedShort();
      buffer.readUnsignedShort();
      buffer.readInt();
      buffer.readInt();
      this.readString(buffer);
    } else if (opcode === 249) {
      this.params = Type.readParamsMap(buffer, this.params);
    } else {
      log.trace('Config', `Unknown opcode ${opcode} for item ${this.id}`);
    }
  }
}
