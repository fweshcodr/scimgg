import { describe, expect, it } from 'vitest';
import type { CacheInfo } from '../../cache/CacheInfo';
import { ByteBuffer } from '../../io/ByteBuffer';
import { ModelData } from '../../model/ModelData';
import { SeqBase } from '../../model/seq/SeqBase';
import { SeqFrame } from '../../model/seq/SeqFrame';
import { SeqTransformType } from '../../model/seq/SeqTransformType';
import { NpcType } from '../npctype/NpcType';

describe('NpcType', () => {
  const mockCacheInfo: CacheInfo = {
    name: 'test',
    game: 'oldschool',
    environment: 'live',
    revision: 220,
    timestamp: '2024-01-01',
    size: 1000,
  };

  it('should create NpcType with default values', () => {
    const npc = new NpcType(14176, mockCacheInfo);

    expect(npc.id).toBe(14176);
    expect(npc.name).toBe('null');
    expect(npc.size).toBe(1);
    expect(npc.idleSeqId).toBe(-1);
    expect(npc.walkSeqId).toBe(-1);
    expect(npc.combatLevel).toBe(-1);
    expect(npc.widthScale).toBe(128);
    expect(npc.heightScale).toBe(128);
    expect(npc.isInteractable).toBe(true);
    expect(npc.isClickable).toBe(true);
  });

  it('should decode name opcode (2)', () => {
    const npc = new NpcType(1, mockCacheInfo);
    const buffer = new ByteBuffer(new Int8Array([89, 97, 109, 97, 0]));
    npc.decodeOpcode(2, buffer);

    expect(npc.name).toBe('Yama');
  });

  it('should decode size opcode (12)', () => {
    const npc = new NpcType(1, mockCacheInfo);
    const buffer = new ByteBuffer(new Int8Array([5]));
    npc.decodeOpcode(12, buffer);

    expect(npc.size).toBe(5);
  });

  it('defaults height to -1 when opcode 124 is absent', () => {
    const npc = new NpcType(1, mockCacheInfo);
    npc.decode(new ByteBuffer(new Int8Array([12, 3, 0])));

    expect(npc.height).toBe(-1);
  });

  it('decodes unsigned height opcode 124', () => {
    const npc = new NpcType(1, mockCacheInfo);
    npc.decodeOpcode(124, new ByteBuffer(new Int8Array([1, 203])));

    expect(npc.height).toBe(459);
  });

  it('keeps opcodes aligned across footprint (126) and the payload-free flags (129, 130)', () => {
    const npc = new NpcType(1, mockCacheInfo);
    npc.decode(new ByteBuffer(new Int8Array([126, 0, 5, 129, 130, 12, 3, 0])));

    expect(npc.size).toBe(3);
  });

  it('keeps opcodes aligned across the menu sub-ops (251-253) and the no-zbuf flag (147)', () => {
    const npc = new NpcType(1, mockCacheInfo);
    const text = [65, 0]; // "A"
    const varCondition = [0, 1, 0, 2, 0, 0, 0, 3, 0, 0, 0, 4]; // varp, varbit, min, max
    npc.decode(
      new ByteBuffer(
        new Int8Array([
          ...[251, 4, 1, ...text],
          ...[252, 4, ...varCondition, ...text],
          ...[253, 4, 0, 7, ...varCondition, ...text],
          147,
          ...[12, 3],
          0,
        ]),
      ),
    );

    expect(npc.size).toBe(3);
  });

  it('keeps subsequent opcodes aligned after height', () => {
    const npc = new NpcType(1, mockCacheInfo);
    npc.decode(new ByteBuffer(new Int8Array([124, 1, 203, 12, 3, 95, 0, 172, 0])));

    expect(npc.height).toBe(459);
    expect(npc.size).toBe(3);
    expect(npc.combatLevel).toBe(172);
  });

  it('should decode idle seq opcode (13)', () => {
    const npc = new NpcType(1, mockCacheInfo);
    const buffer = new ByteBuffer(new Int8Array([0x01, 0x00]));
    npc.decodeOpcode(13, buffer);

    expect(npc.idleSeqId).toBe(256);
  });

  it('should decode walk seq opcode (14)', () => {
    const npc = new NpcType(1, mockCacheInfo);
    const buffer = new ByteBuffer(new Int8Array([0x02, 0x00]));
    npc.decodeOpcode(14, buffer);

    expect(npc.walkSeqId).toBe(512);
  });

  it('should decode combat level opcode (95)', () => {
    const npc = new NpcType(1, mockCacheInfo);
    const buffer = new ByteBuffer(new Int8Array([0x01, 0xf4]));
    npc.decodeOpcode(95, buffer);

    expect(npc.combatLevel).toBe(500);
  });

  it('should decode contrast opcode (101) without extra scaling', () => {
    const npc = new NpcType(1, mockCacheInfo);
    const buffer = new ByteBuffer(new Int8Array([10]));
    npc.decodeOpcode(101, buffer);

    expect(npc.contrast).toBe(10);
  });

  it('should decode model IDs opcode (1)', () => {
    const npc = new NpcType(1, mockCacheInfo);
    const buffer = new ByteBuffer(new Int8Array([2, 0x00, 0x64, 0x00, 0xc8]));
    npc.decodeOpcode(1, buffer);

    expect(npc.modelIds).toEqual([100, 200]);
  });

  it('should decode recolor opcode (40)', () => {
    const npc = new NpcType(1, mockCacheInfo);
    const buffer = new ByteBuffer(new Int8Array([1, 0x00, 0x0a, 0x00, 0x14]));
    npc.decodeOpcode(40, buffer);

    expect(npc.recolorFrom).toEqual([10]);
    expect(npc.recolorTo).toEqual([20]);
  });

  it('should decode actions opcode (30-34)', () => {
    const npc = new NpcType(1, mockCacheInfo);
    const buffer = new ByteBuffer(new Int8Array([65, 116, 116, 97, 99, 107, 0]));
    npc.decodeOpcode(30, buffer);

    expect(npc.actions[0]).toBe('Attack');
  });

  it('should decode full NPC type with multiple opcodes', () => {
    const npc = new NpcType(14176, mockCacheInfo);
    const data = new Int8Array([2, 89, 97, 109, 97, 0, 12, 5, 95, 0x03, 0xe8, 0]);
    const buffer = new ByteBuffer(data);
    npc.decode(buffer);

    expect(npc.name).toBe('Yama');
    expect(npc.size).toBe(5);
    expect(npc.combatLevel).toBe(1000);
  });
});

describe('ModelData', () => {
  it('should create empty ModelData', () => {
    const model = new ModelData();

    expect(model.verticesCount).toBe(0);
    expect(model.faceCount).toBe(0);
    expect(model.version).toBe(-1);
  });

  it('should decode simple model data', () => {
    const model = new ModelData();
    expect(model.canMergeNormals()).toBe(true);
  });

  it('should translate vertices', () => {
    const model = new ModelData();
    model.verticesCount = 2;
    model.verticesX = new Int32Array([0, 10]);
    model.verticesY = new Int32Array([0, 20]);
    model.verticesZ = new Int32Array([0, 30]);

    model.translate(5, 10, 15);

    expect(model.verticesX[0]).toBe(5);
    expect(model.verticesX[1]).toBe(15);
    expect(model.verticesY[0]).toBe(10);
    expect(model.verticesY[1]).toBe(30);
    expect(model.verticesZ[0]).toBe(15);
    expect(model.verticesZ[1]).toBe(45);
  });

  it('should resize vertices', () => {
    const model = new ModelData();
    model.verticesCount = 1;
    model.verticesX = new Int32Array([128]);
    model.verticesY = new Int32Array([256]);
    model.verticesZ = new Int32Array([384]);

    model.resize(256, 256, 256);

    expect(model.verticesX[0]).toBe(256);
    expect(model.verticesY[0]).toBe(512);
    expect(model.verticesZ[0]).toBe(768);
  });

  it('should recolor faces', () => {
    const model = new ModelData();
    model.faceCount = 3;
    model.faceColors = new Uint16Array([100, 200, 100]);

    model.recolor(100, 300);

    expect(model.faceColors[0]).toBe(300);
    expect(model.faceColors[1]).toBe(200);
    expect(model.faceColors[2]).toBe(300);
  });

  it('should retexture faces', () => {
    const model = new ModelData();
    model.faceCount = 3;
    model.faceTextures = new Int16Array([10, 20, 10]);

    model.retexture(10, 30);

    expect(model.faceTextures[0]).toBe(30);
    expect(model.faceTextures[1]).toBe(20);
    expect(model.faceTextures[2]).toBe(30);
  });

  it('should calculate bounds', () => {
    const model = new ModelData();
    model.usedVertexCount = 3;
    model.verticesX = new Int32Array([-10, 0, 10]);
    model.verticesY = new Int32Array([-20, 0, 20]);
    model.verticesZ = new Int32Array([-30, 0, 30]);

    model.calculateBounds();

    expect(model.minX).toBe(-10);
    expect(model.maxX).toBe(10);
    expect(model.minY).toBe(-20);
    expect(model.maxY).toBe(20);
    expect(model.minZ).toBe(-30);
    expect(model.maxZ).toBe(30);
    expect(model.isBoundsCalculated).toBe(true);
  });

  it('should merge models', () => {
    const model1 = new ModelData();
    model1.verticesCount = 1;
    model1.faceCount = 1;
    model1.textureFaceCount = 0;
    model1.verticesX = new Int32Array([0]);
    model1.verticesY = new Int32Array([0]);
    model1.verticesZ = new Int32Array([0]);
    model1.indices1 = new Int32Array([0]);
    model1.indices2 = new Int32Array([0]);
    model1.indices3 = new Int32Array([0]);
    model1.faceColors = new Uint16Array([100]);
    model1.priority = 5;

    const model2 = new ModelData();
    model2.verticesCount = 1;
    model2.faceCount = 1;
    model2.textureFaceCount = 0;
    model2.verticesX = new Int32Array([10]);
    model2.verticesY = new Int32Array([10]);
    model2.verticesZ = new Int32Array([10]);
    model2.indices1 = new Int32Array([0]);
    model2.indices2 = new Int32Array([0]);
    model2.indices3 = new Int32Array([0]);
    model2.faceColors = new Uint16Array([200]);
    model2.priority = 5;

    const merged = ModelData.merge([model1, model2], 2);

    expect(merged.faceCount).toBe(2);
    expect(merged.faceColors[0]).toBe(100);
    expect(merged.faceColors[1]).toBe(200);
  });
});

describe('SeqBase', () => {
  it('should create SeqBase with correct properties', () => {
    const types = [SeqTransformType.ORIGIN, SeqTransformType.TRANSLATE];
    const transformActor = [true, true];
    const masks = new Uint16Array([0xffff, 0xffff]);
    const labels = [[0], [1, 2]];

    const base = new SeqBase(1, 2, types, transformActor, masks, labels);

    expect(base.id).toBe(1);
    expect(base.count).toBe(2);
    expect(base.types).toEqual(types);
    expect(base.labels[0]).toEqual([0]);
    expect(base.labels[1]).toEqual([1, 2]);
  });
});

describe('SeqFrame', () => {
  it('should create SeqFrame with correct properties', () => {
    const base = new SeqBase(
      1,
      2,
      [SeqTransformType.ORIGIN, SeqTransformType.TRANSLATE],
      [true, true],
      new Uint16Array([0xffff, 0xffff]),
      [[0], [1]],
    );

    const frame = new SeqFrame(10, base, 2, [0, 1], [100, 200], [150, 250], [50, 100], [-1, 0], false, false);

    expect(frame.frameLength).toBe(10);
    expect(frame.base).toBe(base);
    expect(frame.transformCount).toBe(2);
    expect(frame.transformX).toEqual([100, 200]);
    expect(frame.transformY).toEqual([150, 250]);
    expect(frame.transformZ).toEqual([50, 100]);
    expect(frame.hasAlphaTransform).toBe(false);
  });
});

describe('SeqTransformType', () => {
  it('should have correct enum values', () => {
    expect(SeqTransformType.ORIGIN).toBe(0);
    expect(SeqTransformType.TRANSLATE).toBe(1);
    expect(SeqTransformType.ROTATE).toBe(2);
    expect(SeqTransformType.SCALE).toBe(3);
    expect(SeqTransformType.ALPHA).toBe(5);
    expect(SeqTransformType.LIGHT).toBe(7);
  });
});

describe('TextureLoader interface', () => {
  it('should define TextureLoader interface', async () => {
    const module = await import('../../texture/TextureLoader');
    expect(module).toBeDefined();
  });
});
