import { describe, expect, it } from 'vitest';
import type { CacheInfo } from '../../../cache/CacheInfo';
import { ByteBuffer } from '../../../io/ByteBuffer';
import { SeqType } from '../SeqType';

const REV_232_CACHE_INFO: CacheInfo = {
  name: 'test',
  game: 'oldschool',
  environment: 'test',
  revision: 232,
  timestamp: '1970-01-01T00:00:00.000Z',
  size: 0,
};

describe('SeqType heightOffset', () => {
  it('decodes opcode 16 as a signed render-height byte on revision 232', () => {
    const seq = new SeqType(7514, REV_232_CACHE_INFO);

    seq.decode(new ByteBuffer(new Int8Array([16, -15, 0])));

    expect(seq.heightOffset).toBe(-15);
  });

  it('continues decoding the opcode after heightOffset', () => {
    const seq = new SeqType(7514, REV_232_CACHE_INFO);

    seq.decode(new ByteBuffer(new Int8Array([16, -15, 5, 7, 0])));

    expect(seq.heightOffset).toBe(-15);
    expect(seq.forcedPriority).toBe(7);
  });
});

const MOCK_CACHE_INFO: CacheInfo = {
  name: 'mock-oldschool-live-225',
  game: 'oldschool',
  environment: 'live',
  revision: 225,
  timestamp: '2024-01-01T00:00:00.000Z',
  size: 0,
};

function createSeqType(
  id: number,
  overrides: Partial<Pick<SeqType, 'masks' | 'skeletalMasks' | 'precedenceAnimating' | 'priority'>> = {},
): SeqType {
  const seq = new SeqType(id, MOCK_CACHE_INFO);
  if (overrides.masks !== undefined) seq.masks = overrides.masks;
  if (overrides.skeletalMasks !== undefined) seq.skeletalMasks = overrides.skeletalMasks;
  if (overrides.precedenceAnimating !== undefined) seq.precedenceAnimating = overrides.precedenceAnimating;
  if (overrides.priority !== undefined) seq.priority = overrides.priority;
  return seq;
}

describe('SeqType postDecode — movement blocking flags', () => {
  it('no masks + default fields → precedenceAnimating=0, priority=0 (blocks movement)', () => {
    // This is the case for full-body animations like demonbane cast (8977).
    // No interleaveOrder (opcode 3) means the animation can't blend with movement,
    // so OSRS blocks visual movement during it.
    const seq = createSeqType(8977);
    (seq as any).postDecode();
    expect(seq.precedenceAnimating).toBe(0);
    expect(seq.priority).toBe(0);
  });

  it('has masks + default fields → precedenceAnimating=2, priority=2 (allows movement)', () => {
    // Animations WITH interleaveOrder can blend with walk/run.
    // postDecode sets the fields to 2 (allows movement).
    const seq = createSeqType(1234, { masks: [0, 1, 2, 9999999] });
    (seq as any).postDecode();
    expect(seq.precedenceAnimating).toBe(2);
    expect(seq.priority).toBe(2);
  });

  it('has skeletalMasks + default fields → precedenceAnimating=2, priority=2 (allows movement)', () => {
    const seq = createSeqType(5678, { skeletalMasks: new Array(256).fill(false) as any });
    (seq as any).postDecode();
    expect(seq.precedenceAnimating).toBe(2);
    expect(seq.priority).toBe(2);
  });

  it('explicit opcode 9/10 values are NOT overwritten by postDecode', () => {
    const seq = createSeqType(9999, { precedenceAnimating: 5, priority: 3 });
    (seq as any).postDecode();
    expect(seq.precedenceAnimating).toBe(5);
    expect(seq.priority).toBe(3);
  });

  it('explicit 0 values are preserved (animation explicitly blocks movement)', () => {
    const seq = createSeqType(7777, { precedenceAnimating: 0, priority: 0 });
    (seq as any).postDecode();
    expect(seq.precedenceAnimating).toBe(0);
    expect(seq.priority).toBe(0);
  });
});
