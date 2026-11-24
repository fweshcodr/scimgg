import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { SeqSoundEffect, SeqType } from '../../rs/config/seqtype/SeqType';
import type { Coordinate } from '../../types/simulation';
import type { AudioEngine } from '../AudioEngine';
import type { ActorFrameState } from '../FrameSoundTracker';
import { FrameSoundTracker } from '../FrameSoundTracker';

const LISTENER: Coordinate = [30, 30];
/** Yama's attack clips: audible out to 10 tiles, full volume inside 4 (`retain & 31` minus one). */
const SOUND_RANGE = 10;
const SOUND_RETAIN = 5;

describe('FrameSoundTracker', () => {
  let mockAudioEngine: { play: ReturnType<typeof vi.fn> };
  let tracker: FrameSoundTracker;

  beforeEach(() => {
    mockAudioEngine = { play: vi.fn() };
    tracker = new FrameSoundTracker(mockAudioEngine as unknown as AudioEngine);
  });

  function update(actors: ActorFrameState[]): void {
    tracker.update(actors, LISTENER);
  }

  function makeActorState(currentFrame: number, seqId = 10): ActorFrameState {
    const frameSounds = new Map<number, SeqSoundEffect[]>([
      [1, [{ id: 200, loops: 0, location: SOUND_RANGE, retain: SOUND_RETAIN } as SeqSoundEffect]],
    ]);

    return {
      actorId: 'yama',
      seqId,
      currentFrame,
      seqType: { frameSounds, isLooping: () => true } as unknown as SeqType,
      position: LISTENER,
    };
  }

  function makeMultiFrameActorState(
    currentFrame: number,
    soundFrames: Array<[number, number]>,
    totalFrames: number,
    seqId = 10,
    looping = true,
    position: Readonly<Coordinate> | null = LISTENER,
  ): ActorFrameState {
    const frameSounds = new Map<number, SeqSoundEffect[]>();
    for (const [frame, soundId] of soundFrames) {
      frameSounds.set(frame, [
        { id: soundId, loops: 0, location: SOUND_RANGE, retain: SOUND_RETAIN } as SeqSoundEffect,
      ]);
    }

    const frameIds = new Array(totalFrames).fill(0);

    return {
      actorId: 'yama',
      seqId,
      currentFrame,
      seqType: { frameSounds, frameIds, isLooping: () => looping } as unknown as SeqType,
      position,
    };
  }

  it('plays sounds when an actor reaches a frame with registered effects', () => {
    update([makeActorState(0)]);
    update([makeActorState(1)]);

    expect(mockAudioEngine.play).toHaveBeenCalledWith(200, { channel: 'area', volume: 1 }, 'frame:seq=10,f=1');
  });

  it('plays Yama snap sound when frame 56 is reached on the attack animation sequence', () => {
    const yamaState = (f: number) => makeMultiFrameActorState(f, [[56, 10251]], 64, 12144);

    update([yamaState(0)]);
    mockAudioEngine.play.mockClear();

    update([yamaState(56)]);

    expect(mockAudioEngine.play).toHaveBeenCalledTimes(1);
    expect(mockAudioEngine.play).toHaveBeenCalledWith(10251, { channel: 'area', volume: 1 }, 'frame:seq=12144,f=56');
  });

  it('does not play Yama snap sound when the animation frame is not 56', () => {
    const yamaState = (f: number) => makeMultiFrameActorState(f, [[56, 10251]], 64, 12144);

    update([yamaState(54)]);
    mockAudioEngine.play.mockClear();

    update([yamaState(55)]);

    expect(mockAudioEngine.play).not.toHaveBeenCalled();
  });

  it('does not replay sounds when the frame does not change', () => {
    update([makeActorState(1)]);
    mockAudioEngine.play.mockClear();

    update([makeActorState(1)]);

    expect(mockAudioEngine.play).not.toHaveBeenCalled();
  });

  it('treats actors as new again after reset', () => {
    update([makeActorState(1)]);
    expect(mockAudioEngine.play).toHaveBeenCalledTimes(1);

    mockAudioEngine.play.mockClear();
    tracker.reset();
    update([makeActorState(1)]);

    expect(mockAudioEngine.play).toHaveBeenCalledTimes(1);
  });

  it('plays sounds for skipped frames during multi-frame advance', () => {
    const state = (f: number) =>
      makeMultiFrameActorState(
        f,
        [
          [1, 200],
          [3, 300],
        ],
        8,
      );

    update([state(0)]);
    mockAudioEngine.play.mockClear();

    update([state(4)]);

    expect(mockAudioEngine.play).toHaveBeenCalledTimes(2);
    expect(mockAudioEngine.play).toHaveBeenCalledWith(200, { channel: 'area', volume: 1 }, 'frame:seq=10,f=1');
    expect(mockAudioEngine.play).toHaveBeenCalledWith(300, { channel: 'area', volume: 1 }, 'frame:seq=10,f=3');
  });

  it('plays sounds on wrapped frames when animation loops (high → low)', () => {
    const state = (f: number) =>
      makeMultiFrameActorState(
        f,
        [
          [7, 700],
          [1, 100],
        ],
        8,
      );

    update([state(5)]);
    mockAudioEngine.play.mockClear();

    update([state(2)]);

    expect(mockAudioEngine.play).toHaveBeenCalledWith(700, { channel: 'area', volume: 1 }, 'frame:seq=10,f=7');
    expect(mockAudioEngine.play).toHaveBeenCalledWith(100, { channel: 'area', volume: 1 }, 'frame:seq=10,f=1');
    expect(mockAudioEngine.play).toHaveBeenCalledTimes(2);
  });

  it('resumes a frameStep loop at its loop start without replaying intro-frame sounds', () => {
    // Shaped like the solar flare's stand seq: an intro sound on frame 1, loop back 4 frames.
    const state = (currentFrame: number): ActorFrameState => ({
      ...makeMultiFrameActorState(
        currentFrame,
        [
          [1, 100],
          [5, 500],
        ],
        8,
      ),
      seqType: {
        frameSounds: new Map([
          [1, [{ id: 100, loops: 0, location: SOUND_RANGE, retain: SOUND_RETAIN } as SeqSoundEffect]],
          [5, [{ id: 500, loops: 0, location: SOUND_RANGE, retain: SOUND_RETAIN } as SeqSoundEffect]],
        ]),
        frameIds: new Array(8).fill(0),
        frameStep: 4,
        isLooping: () => true,
      } as unknown as SeqType,
    });

    update([state(7)]);
    mockAudioEngine.play.mockClear();
    update([state(5)]);

    expect(mockAudioEngine.play.mock.calls.map(([id]) => id)).toEqual([500]);

    mockAudioEngine.play.mockClear();
    update([state(7)]);
    update([state(2)]);
    expect(mockAudioEngine.play.mock.calls.map(([id]) => id)).toEqual([100]);
  });

  it('does not loop frame sounds infinitely (loops field is ignored for Web Audio)', () => {
    const frameSounds = new Map<number, SeqSoundEffect[]>([
      [0, [{ id: 999, loops: 1, location: SOUND_RANGE, retain: SOUND_RETAIN } as SeqSoundEffect]],
    ]);

    update([
      {
        actorId: 'yama',
        seqId: 10,
        currentFrame: 0,
        seqType: { frameSounds, isLooping: () => true } as unknown as SeqType,
        position: LISTENER,
      },
    ]);

    expect(mockAudioEngine.play).toHaveBeenCalledWith(999, { channel: 'area', volume: 1 }, 'frame:seq=10,f=0');
    const options = mockAudioEngine.play.mock.calls[0][1];
    expect(options).not.toHaveProperty('loop');
  });

  it('plays initial frame sounds when actor first appears', () => {
    const state = makeMultiFrameActorState(3, [[3, 300]], 8);

    update([state]);

    expect(mockAudioEngine.play).toHaveBeenCalledWith(300, { channel: 'area', volume: 1 }, 'frame:seq=10,f=3');
  });

  describe('silentSync', () => {
    it('does not call play during silentSync', () => {
      tracker.silentSync([makeActorState(1)]);

      expect(mockAudioEngine.play).not.toHaveBeenCalled();
    });

    it('does not call play when update remains on same frame after silentSync', () => {
      tracker.silentSync([makeActorState(1)]);

      update([makeActorState(1)]);

      expect(mockAudioEngine.play).not.toHaveBeenCalled();
    });

    it('plays sounds when frame advances after silentSync', () => {
      tracker.silentSync([makeActorState(0)]);

      update([makeActorState(1)]);

      expect(mockAudioEngine.play).toHaveBeenCalledTimes(1);
      expect(mockAudioEngine.play).toHaveBeenCalledWith(200, { channel: 'area', volume: 1 }, 'frame:seq=10,f=1');
    });

    it('replays only missing intermediate sounds after rewind reset and silentSync', () => {
      const state = (f: number) => makeMultiFrameActorState(f, [[3, 300]], 8);

      update([state(4)]);
      tracker.reset();
      tracker.silentSync([state(2)]);
      mockAudioEngine.play.mockClear();

      update([state(4)]);

      expect(mockAudioEngine.play).toHaveBeenCalledTimes(1);
      expect(mockAudioEngine.play).toHaveBeenCalledWith(300, { channel: 'area', volume: 1 }, 'frame:seq=10,f=3');
    });

    it('replaces tracked state when silentSync sees same actor with different seqId', () => {
      update([makeActorState(1)]);
      mockAudioEngine.play.mockClear();

      tracker.silentSync([{ ...makeActorState(1), seqId: 11 }]);
      update([{ ...makeActorState(1), seqId: 11 }]);

      expect(mockAudioEngine.play).not.toHaveBeenCalled();
    });

    it('plays current frame sound when sequence changes after silentSync', () => {
      tracker.silentSync([{ ...makeActorState(0), seqId: 10 }]);

      update([{ ...makeActorState(1), seqId: 11 }]);

      expect(mockAudioEngine.play).toHaveBeenCalledTimes(1);
      expect(mockAudioEngine.play).toHaveBeenCalledWith(200, { channel: 'area', volume: 1 }, 'frame:seq=11,f=1');
    });

    it('handles silentSync with an empty actor list', () => {
      tracker.silentSync([makeActorState(1)]);
      tracker.silentSync([]);

      update([makeActorState(1)]);

      expect(mockAudioEngine.play).toHaveBeenCalledTimes(1);
      expect(mockAudioEngine.play).toHaveBeenCalledWith(200, { channel: 'area', volume: 1 }, 'frame:seq=10,f=1');
    });

    it('supports multiple reset and silentSync rewind cycles', () => {
      for (let i = 0; i < 3; i++) {
        tracker.reset();
        tracker.silentSync([makeActorState(0)]);
        update([makeActorState(1)]);
      }

      expect(mockAudioEngine.play).toHaveBeenCalledTimes(3);
      expect(mockAudioEngine.play).toHaveBeenNthCalledWith(1, 200, { channel: 'area', volume: 1 }, 'frame:seq=10,f=1');
      expect(mockAudioEngine.play).toHaveBeenNthCalledWith(2, 200, { channel: 'area', volume: 1 }, 'frame:seq=10,f=1');
      expect(mockAudioEngine.play).toHaveBeenNthCalledWith(3, 200, { channel: 'area', volume: 1 }, 'frame:seq=10,f=1');
    });
  });
  describe('one-shot sequences', () => {
    /** Yama's mage impact spotanim: seq 12099, sounds on f1 and f23, does not loop. */
    const impact = (f: number) =>
      makeMultiFrameActorState(
        f,
        [
          [1, 10263],
          [23, 10216],
        ],
        44,
        12099,
        false,
      );

    it('replays from the start when a reused instance id re-fires the sequence', () => {
      update([impact(0)]);
      update([impact(23)]);
      mockAudioEngine.play.mockClear();

      // The renderer upserts the same instance id for the next attack, so the frame index
      // drops back to 0 without the seq id ever changing.
      update([impact(0)]);
      update([impact(23)]);

      const played = mockAudioEngine.play.mock.calls.map(([id]) => id as number);
      expect(played).toEqual([10263, 10216]);
    });

    it('does not treat the backwards jump as a loop wrap', () => {
      update([impact(30)]);
      mockAudioEngine.play.mockClear();

      update([impact(2)]);

      // A wrap would replay f31..43 then f0..2, re-firing nothing here but sounding every
      // later frame's effect on a sequence that has them; only f1 is behind the new frame.
      expect(mockAudioEngine.play.mock.calls.map(([id]) => id as number)).toEqual([10263]);
    });
  });

  describe('attenuation', () => {
    const at = (tile: number, f: number) =>
      makeMultiFrameActorState(f, [[1, 200]], 8, 10, true, [LISTENER[0] + tile, LISTENER[1]]);

    function volumeAfterAdvancingTo(state: ActorFrameState, from: ActorFrameState): number | undefined {
      update([from]);
      mockAudioEngine.play.mockClear();
      update([state]);
      return mockAudioEngine.play.mock.calls[0]?.[1]?.volume;
    }

    it.each([
      // One tile is forgiven before falloff, so 5 tiles away is distance 4 — still inside `inner`.
      { what: 'inside the inner radius', tiles: 5, volume: 1 },
      { what: 'halfway down the falloff', tiles: 8, volume: (10 - 7) / (10 - 4) },
      { what: 'one tile inside the cutoff', tiles: 10, volume: (10 - 9) / (10 - 4) },
    ])('plays $what at the attenuated volume', ({ tiles, volume }) => {
      expect(volumeAfterAdvancingTo(at(tiles, 1), at(tiles, 0))).toBeCloseTo(volume, 10);
    });

    it('drops the sound entirely at or beyond the outer range', () => {
      expect(volumeAfterAdvancingTo(at(11, 1), at(11, 0))).toBeUndefined();
      expect(mockAudioEngine.play).not.toHaveBeenCalled();
    });

    it('plays unattenuated on sfx when the producer has no position yet', () => {
      const unplaced = (f: number) => makeMultiFrameActorState(f, [[1, 200]], 8, 10, true, null);

      update([unplaced(0)]);
      mockAudioEngine.play.mockClear();
      update([unplaced(1)]);

      expect(mockAudioEngine.play).toHaveBeenCalledWith(200, { channel: 'sfx' }, 'frame:seq=10,f=1');
    });
  });
});
