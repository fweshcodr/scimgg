import { describe, expect, it } from 'vitest';
import type { CacheInfo } from '../../../rs/cache/CacheInfo';
import { SeqType } from '../../../rs/config/seqtype/SeqType';
import { type PrimarySpec, ReplayPrimaryIndex } from '../../core/replayPrimaryIndex';
import type {
  AnimClipRef,
  FrameClipRef,
  NpcAnimationSet,
  NpcAnimationUpdateInput,
  NpcAnimModelAdapter,
} from '../animationTypes';
import { CLIENT_TICK_MS } from '../animationTypes';
import { NpcAnimationController, npcPrimarySpec } from '../NpcAnimationController';

const TEST_CACHE_INFO: CacheInfo = {
  name: 'test',
  game: 'oldschool',
  environment: 'test',
  revision: 0,
  timestamp: '1970-01-01T00:00:00.000Z',
  size: 0,
};

function createFrameClip(id: string, frameIds: number[], frameLengths: number[]): FrameClipRef {
  const seqId = frameIds[0] ?? 0;
  const seqType = new SeqType(seqId, TEST_CACHE_INFO);
  seqType.frameIds = [...frameIds];
  seqType.frameLengths = [...frameLengths];

  return {
    kind: 'frame',
    id,
    seqId,
    seqType,
    frameIds,
    frameLengths,
  };
}

function createMockAnimSet(): NpcAnimationSet {
  return {
    idle: createFrameClip('idle', [0], [1]),
    walk: createFrameClip('walk', [1], [1]),
    attack: createFrameClip('attack', [2, 3], [2, 2]),
    turnLeft: createFrameClip('turnLeft', [4, 5, 6], [1, 1, 1]),
    turnRight: createFrameClip('turnRight', [7, 8, 9], [1, 1, 1]),
  };
}

function createMockAdapter(): NpcAnimModelAdapter {
  return {
    resetPose: () => {},
    applyFrame: () => {},
    applyFrameInterleaved: () => {},
    applySkeletal: () => {},
    resize: () => {},
    commitPose: () => {},
  };
}

function makeInput(overrides: Partial<NpcAnimationUpdateInput> = {}): NpcAnimationUpdateInput {
  return {
    deltaMs: CLIENT_TICK_MS,
    speedMultiplier: 1,
    turn: { isTurning: false, turnDeltaSigned: 0 },
    movement: { isMoving: false },
    ...overrides,
  };
}

describe('NpcAnimationController', () => {
  it.each(['loop', 'loopFrameStep'] as const)('restores the canonical %s base phase directly', (idlePlayMode) => {
    const idle = createFrameClip('idle', [100, 101, 102], [2, 3, 5]);
    idle.seqType.frameStep = 2;
    const animationSet = { idle, idlePlayMode };
    const reference = new NpcAnimationController({ animationSet, modelAdapter: createMockAdapter() });
    const sought = new NpcAnimationController({ animationSet, modelAdapter: createMockAdapter() });
    for (let cycle = 0; cycle < 21; cycle++) reference.update(makeInput());
    reference.update(makeInput({ deltaMs: 10 }));
    sought.restoreBaseAt(21.5, false);
    sought.update(makeInput({ deltaMs: 0 }));
    expect(sought.getFrameState()).toEqual(reference.getFrameState());
    expect(sought.getFrameState()?.currentFrameIndex).toBe(idlePlayMode === 'loop' ? 0 : 2);
    expect(sought['tickRemainderMs']).toBe(10);
  });

  it('restores a corpse at its local death age without updating intermediate poses', () => {
    const animationSet = { ...createMockAnimSet(), death: createFrameClip('death', [100, 101, 102], [20, 20, 20]) };
    const reference = new NpcAnimationController({ animationSet, modelAdapter: createMockAdapter() });
    reference.triggerDeath();
    for (let cycle = 0; cycle < 45; cycle++) reference.update(makeInput());
    reference.update(makeInput({ deltaMs: 10 }));
    let commits = 0;
    const sought = new NpcAnimationController({
      animationSet,
      modelAdapter: {
        ...createMockAdapter(),
        commitPose() {
          commits++;
        },
      },
    });
    sought.restoreDeathAt(45.5);
    expect(commits).toBe(0);
    sought.update(makeInput({ deltaMs: 0 }));
    expect(sought.getFrameState()).toEqual(reference.getFrameState());
    expect(sought.getActiveState()).toBe('death');
    expect(commits).toBe(1);
  });

  describe('a set with no idle clip', () => {
    function recordingAdapter() {
      const poses: (number | 'rest')[] = [];
      let pending: number | 'rest' = 'rest';
      const adapter: NpcAnimModelAdapter = {
        ...createMockAdapter(),
        resetPose: () => {
          pending = 'rest';
        },
        applyFrame: (frameId) => {
          pending = frameId;
        },
        commitPose: () => {
          poses.push(pending);
        },
      };
      return { adapter, poses };
    }

    it('rests unanimated with nothing playing, plays one-shot and walk clips, then returns to rest', () => {
      const attack = createFrameClip('attack', [20, 21], [2, 2]);
      const walk = createFrameClip('walk', [30], [1]);
      const { adapter, poses } = recordingAdapter();
      const controller = new NpcAnimationController({ animationSet: { attack, walk }, modelAdapter: adapter });

      controller.update(makeInput());
      expect(controller.getFrameState()).toBeNull();
      expect(controller.getAnimationHeightOffset()).toBe(0);
      // Already at rest: nothing to rebuild.
      expect(poses).toEqual([]);

      controller.triggerAttack();
      controller.update(makeInput({ deltaMs: 0 }));
      expect(controller.getFrameState()).toMatchObject({ seqId: 20, currentFrameIndex: 0 });
      for (let cycle = 0; cycle < 4; cycle++) controller.update(makeInput());
      expect(controller.getFrameState()).toBeNull();
      expect(controller.getActiveState()).toBe('idle');

      controller.update(makeInput({ movement: { isMoving: true } }));
      expect(controller.getActiveState()).toBe('walk');
      controller.update(makeInput());
      expect(controller.getFrameState()).toBeNull();
      expect(poses).toEqual([20, 21, 'rest', 30, 'rest']);
    });

    it('holds a restored primary that never retires and drops it back to rest on reset', () => {
      const spawn = createFrameClip('spawn', [40, 41, 42], [2, 3, 5]);
      const { adapter, poses } = recordingAdapter();
      const controller = new NpcAnimationController({ animationSet: { spawn }, modelAdapter: adapter });
      controller.restorePrimaryAt({
        clip: spawn,
        duration: Number.POSITIVE_INFINITY,
        elapsedTicks: 4,
        delayClientTicks: 0,
        remainderMs: 0,
      });
      controller.update(makeInput({ deltaMs: 0 }));
      expect(controller.getFrameState()).toMatchObject({ seqId: 40, currentFrameIndex: 1 });
      for (let cycle = 0; cycle < 30; cycle++) controller.update(makeInput());
      expect(controller.getFrameState()).toMatchObject({ seqId: 40, currentFrameIndex: 2 });

      controller.reset();
      controller.update(makeInput());
      expect(poses).toEqual([41, 42, 'rest']);
    });
  });

  describe('accepted replay primary restoration', () => {
    it('matches chronological delayed Yama phases, duration override and rejected secondary cues', () => {
      const attack = createFrameClip('attack', [100, 101, 102], [20, 20, 20]);
      const secondary = createFrameClip('secondary', [200, 201], [20, 20]);
      attack.seqType.forcedPriority = 10;
      secondary.seqType.forcedPriority = 5;
      const animationSet = { idle: createFrameClip('idle', [0], [1]), attack };
      const live = new NpcAnimationController({ animationSet, modelAdapter: createMockAdapter() });
      const sought = new NpcAnimationController({ animationSet, modelAdapter: createMockAdapter() });
      const timeline = new ReplayPrimaryIndex<PrimarySpec<AnimClipRef>, AnimClipRef>([
        { frameIndex: 0, tick: 0, value: npcPrimarySpec(attack, { durationClientTicks: 90, delayClientTicks: 30 }) },
        { frameIndex: 1, tick: 0, value: npcPrimarySpec(secondary) },
      ]);
      live.triggerAttack({ durationClientTicks: 90, delayClientTicks: 30 });
      live.triggerAttack({ clip: secondary });
      live.update(makeInput({ deltaMs: 0 }));
      const expected = new Map<number, ReturnType<NpcAnimationController['getFrameState']>>();
      for (let cycle = 0; cycle <= 120; cycle++) {
        if (cycle > 0) live.update(makeInput());
        expected.set(cycle, live.getFrameState());
      }
      for (const cycle of [70, 29, 30, 50, 100, 119, 120]) {
        sought.restorePrimaryAt(timeline.sample({ cycle, throughFrameIndex: 1 }, animationSet, (cue) => cue).primary);
        sought.update(makeInput({ deltaMs: 0 }));
        expect(sought.getFrameState()).toEqual(expected.get(cycle));
      }
    });

    it('resumes from fractional primary phase without consuming the reconstruction render delta', () => {
      const animationSet = createMockAnimSet();
      if (!animationSet.attack) expect.fail('Missing test attack');
      const timeline = new ReplayPrimaryIndex<PrimarySpec<AnimClipRef>, AnimClipRef>([
        { frameIndex: 0, tick: 0, value: npcPrimarySpec(animationSet.attack) },
      ]);
      const controller = new NpcAnimationController({ animationSet, modelAdapter: createMockAdapter() });
      controller.restorePrimaryAt(
        timeline.sample({ cycle: 1.5, throughFrameIndex: 0 }, animationSet, (cue) => cue).primary,
      );
      controller.update(makeInput({ deltaMs: 600 }));
      expect(controller.getFrameState()?.currentFrameIndex).toBe(0);
      controller.update(makeInput({ deltaMs: 10 }));
      expect(controller.getFrameState()?.currentFrameIndex).toBe(1);
    });
  });
  describe('animation height offset', () => {
    it('uses the primary offset while idle and the base offset while moving or turning', () => {
      const animationSet = createMockAnimSet();
      if (!animationSet.attack || !animationSet.walk || !animationSet.turnRight) {
        throw new Error('Expected complete test animation set');
      }
      animationSet.attack.seqType.masks = [0, 1, 9999999];
      Object.assign(animationSet.idle!.seqType, { heightOffset: 3 });
      Object.assign(animationSet.walk.seqType, { heightOffset: 7 });
      Object.assign(animationSet.turnRight.seqType, { heightOffset: 11 });
      Object.assign(animationSet.attack.seqType, { heightOffset: 15 });
      const controller = new NpcAnimationController({ animationSet, modelAdapter: createMockAdapter() });

      controller.triggerAttack();
      controller.update(makeInput());
      expect(controller.getAnimationHeightOffset()).toBe(15);

      controller.update(makeInput({ movement: { isMoving: true } }));
      expect(controller.getAnimationHeightOffset()).toBe(7);

      controller.update(makeInput({ turn: { isTurning: true, turnDeltaSigned: 50 } }));
      expect(controller.getAnimationHeightOffset()).toBe(11);
    });

    it('suppresses a turn state when its clip is the idle sequence', () => {
      const animationSet = createMockAnimSet();
      if (!animationSet.attack) throw new Error('Expected attack clip');
      animationSet.attack.seqType.masks = [0, 1, 9999999];
      animationSet.attack.seqType.heightOffset = 15;
      animationSet.turnRight = animationSet.idle;
      const controller = new NpcAnimationController({ animationSet, modelAdapter: createMockAdapter() });

      controller.triggerAttack();
      controller.update(makeInput({ turn: { isTurning: true, turnDeltaSigned: 50 } }));

      expect(controller.getAnimationHeightOffset()).toBe(15);
    });
  });

  describe('No turn clips (e.g. Yama): turning falls back to walk animation', () => {
    function createNoTurnClipAnimSet(): NpcAnimationSet {
      return {
        idle: createFrameClip('idle', [0], [1]),
        walk: createFrameClip('walk', [1], [1]),
        attack: createFrameClip('attack', [2, 3], [2, 2]),
      };
    }

    it('should play walk (via turn state) when turning with no turn clips', () => {
      const controller = new NpcAnimationController({
        animationSet: createNoTurnClipAnimSet(),
        modelAdapter: createMockAdapter(),
      });

      controller.update(makeInput({ turn: { isTurning: true, turnDeltaSigned: -50 } }));
      expect(controller.getActiveState()).toBe('turnLeft');
    });

    it('should use turnRight state when delta is positive', () => {
      const controller = new NpcAnimationController({
        animationSet: createNoTurnClipAnimSet(),
        modelAdapter: createMockAdapter(),
      });

      controller.update(makeInput({ turn: { isTurning: true, turnDeltaSigned: 50 } }));
      expect(controller.getActiveState()).toBe('turnRight');
    });

    it('should not oscillate walk↔idle due to grace period on turn state', () => {
      const controller = new NpcAnimationController({
        animationSet: createNoTurnClipAnimSet(),
        modelAdapter: createMockAdapter(),
      });

      controller.update(makeInput({ turn: { isTurning: true, turnDeltaSigned: -10 } }));
      expect(controller.getActiveState()).toBe('turnLeft');

      controller.update(makeInput({ turn: { isTurning: false, turnDeltaSigned: 0 } }));
      expect(controller.getActiveState()).toBe('turnLeft');

      controller.update(makeInput({ turn: { isTurning: true, turnDeltaSigned: -10 } }));
      expect(controller.getActiveState()).toBe('turnLeft');

      controller.update(makeInput({ turn: { isTurning: false, turnDeltaSigned: 0 } }));
      expect(controller.getActiveState()).toBe('turnLeft');
    });

    it('should transition to idle after grace period expires', () => {
      const controller = new NpcAnimationController({
        animationSet: createNoTurnClipAnimSet(),
        modelAdapter: createMockAdapter(),
      });

      controller.update(makeInput({ turn: { isTurning: true, turnDeltaSigned: -50 } }));
      expect(controller.getActiveState()).toBe('turnLeft');

      for (let i = 0; i < 10; i++) {
        controller.update(makeInput({ turn: { isTurning: false, turnDeltaSigned: 0 } }));
      }
      expect(controller.getActiveState()).toBe('idle');
    });

    it('should play walk when moving even without turn clips', () => {
      const controller = new NpcAnimationController({
        animationSet: createNoTurnClipAnimSet(),
        modelAdapter: createMockAdapter(),
      });

      controller.update(
        makeInput({
          turn: { isTurning: true, turnDeltaSigned: -50 },
          movement: { isMoving: true },
        }),
      );
      expect(controller.getActiveState()).toBe('turnLeft');
    });

    it('should stay idle when turning with no turn clips and no walk clip', () => {
      const noWalkAnimSet: NpcAnimationSet = {
        idle: createFrameClip('idle', [0], [1]),
      };
      const controller = new NpcAnimationController({
        animationSet: noWalkAnimSet,
        modelAdapter: createMockAdapter(),
      });

      controller.update(makeInput({ turn: { isTurning: true, turnDeltaSigned: -50 } }));
      expect(controller.getActiveState()).toBe('idle');
    });
  });

  describe('Turn animation without stuttering', () => {
    it('should not transition turn→idle for brief isTurning=false gaps (grace period)', () => {
      const controller = new NpcAnimationController({
        animationSet: createMockAnimSet(),
        modelAdapter: createMockAdapter(),
      });

      controller.update(makeInput({ turn: { isTurning: true, turnDeltaSigned: -50 } }));
      expect(controller.getActiveState()).toBe('turnLeft');

      // Grace period is 10 ticks — these 3 updates (3 ticks) should NOT transition
      controller.update(makeInput({ turn: { isTurning: false, turnDeltaSigned: 0 } }));
      expect(controller.getActiveState()).toBe('turnLeft');

      controller.update(makeInput({ turn: { isTurning: false, turnDeltaSigned: 0 } }));
      expect(controller.getActiveState()).toBe('turnLeft');

      controller.update(makeInput({ turn: { isTurning: false, turnDeltaSigned: 0 } }));
      expect(controller.getActiveState()).toBe('turnLeft');

      // After 10 total ticks of no turning, should transition to idle
      for (let i = 0; i < 7; i++) {
        controller.update(makeInput({ turn: { isTurning: false, turnDeltaSigned: 0 } }));
      }
      expect(controller.getActiveState()).toBe('idle');
    });

    it('should keep turn clip active through brief false gaps even after turn clip duration is exceeded', () => {
      const controller = new NpcAnimationController({
        animationSet: createMockAnimSet(),
        modelAdapter: createMockAdapter(),
      });

      controller.update(makeInput({ turn: { isTurning: true, turnDeltaSigned: -50 } }));
      expect(controller.getActiveState()).toBe('turnLeft');

      for (let i = 0; i < 5; i++) {
        controller.update(makeInput({ turn: { isTurning: true, turnDeltaSigned: -50 } }));
      }

      controller.update(makeInput({ turn: { isTurning: false, turnDeltaSigned: 0 } }));
      expect(controller.getActiveState()).toBe('turnLeft');
    });

    it('should NOT reset turn animation when isTurning flickers false briefly', () => {
      const controller = new NpcAnimationController({
        animationSet: createMockAnimSet(),
        modelAdapter: createMockAdapter(),
      });

      controller.update(makeInput({ turn: { isTurning: true, turnDeltaSigned: -50 } }));
      expect(controller.getActiveState()).toBe('turnLeft');

      controller.update(makeInput({ turn: { isTurning: false, turnDeltaSigned: 0 } }));
      expect(controller.getActiveState()).toBe('turnLeft');
    });

    it('should transition to idle after turn animation completes its duration', () => {
      const controller = new NpcAnimationController({
        animationSet: createMockAnimSet(),
        modelAdapter: createMockAdapter(),
      });

      controller.update(makeInput({ turn: { isTurning: true, turnDeltaSigned: -50 } }));
      expect(controller.getActiveState()).toBe('turnLeft');

      for (let i = 0; i < 10; i++) {
        controller.update(makeInput({ turn: { isTurning: false, turnDeltaSigned: 0 } }));
      }

      expect(controller.getActiveState()).toBe('idle');
    });

    it('should still allow attack to interrupt a turn', () => {
      const controller = new NpcAnimationController({
        animationSet: createMockAnimSet(),
        modelAdapter: createMockAdapter(),
      });

      controller.update(makeInput({ turn: { isTurning: true, turnDeltaSigned: -50 } }));
      expect(controller.getActiveState()).toBe('turnLeft');

      controller.triggerAttack();
      controller.update(makeInput({ turn: { isTurning: true, turnDeltaSigned: -50 } }));
      expect(controller.getActiveState()).toBe('attack');
    });

    it('should not stutter when isTurning rapidly alternates true/false', () => {
      const controller = new NpcAnimationController({
        animationSet: createMockAnimSet(),
        modelAdapter: createMockAdapter(),
      });

      controller.update(makeInput({ turn: { isTurning: true, turnDeltaSigned: -30 } }));
      expect(controller.getActiveState()).toBe('turnLeft');

      controller.update(makeInput({ turn: { isTurning: false, turnDeltaSigned: 0 } }));
      expect(controller.getActiveState()).toBe('turnLeft');

      controller.update(makeInput({ turn: { isTurning: true, turnDeltaSigned: -30 } }));
      expect(controller.getActiveState()).toBe('turnLeft');
    });

    it('should start new turn direction if direction changes during hold', () => {
      const controller = new NpcAnimationController({
        animationSet: createMockAnimSet(),
        modelAdapter: createMockAdapter(),
      });

      controller.update(makeInput({ turn: { isTurning: true, turnDeltaSigned: -50 } }));
      expect(controller.getActiveState()).toBe('turnLeft');

      controller.update(makeInput({ turn: { isTurning: true, turnDeltaSigned: 50 } }));
      expect(controller.getActiveState()).toBe('turnRight');
    });
  });

  describe('delayClientTicks', () => {
    it('should activate immediate attack on next update when no delay is provided', () => {
      const controller = new NpcAnimationController({
        animationSet: createMockAnimSet(),
        modelAdapter: createMockAdapter(),
      });

      controller.triggerAttack();
      controller.update(makeInput());

      expect(controller.getActiveState()).toBe('attack');
    });

    it('should stay idle during delay period before activating attack', () => {
      const controller = new NpcAnimationController({
        animationSet: createMockAnimSet(),
        modelAdapter: createMockAdapter(),
      });

      controller.triggerAttack({ delayClientTicks: 60 });
      controller.update(makeInput({ deltaMs: CLIENT_TICK_MS }));
      expect(controller.getActiveState()).toBe('idle');

      controller.update(makeInput({ deltaMs: 59 * CLIENT_TICK_MS }));
      expect(controller.getActiveState()).toBe('idle');

      controller.update(makeInput({ deltaMs: CLIENT_TICK_MS }));
      expect(controller.getActiveState()).toBe('attack');
    });

    it('should activate delayed attack once delay elapses', () => {
      const controller = new NpcAnimationController({
        animationSet: createMockAnimSet(),
        modelAdapter: createMockAdapter(),
      });

      controller.triggerAttack({ delayClientTicks: 30 });

      controller.update(makeInput({ deltaMs: CLIENT_TICK_MS }));
      expect(controller.getActiveState()).toBe('idle');

      controller.update(makeInput({ deltaMs: 30 * CLIENT_TICK_MS }));
      expect(controller.getActiveState()).toBe('attack');
    });

    it('should replace a pending delayed attack with a newer delayed signal', () => {
      const controller = new NpcAnimationController({
        animationSet: createMockAnimSet(),
        modelAdapter: createMockAdapter(),
      });

      controller.triggerAttack({ delayClientTicks: 60 });
      controller.triggerAttack({ delayClientTicks: 30 });

      controller.update(makeInput({ deltaMs: CLIENT_TICK_MS }));
      expect(controller.getActiveState()).toBe('idle');

      controller.update(makeInput({ deltaMs: 30 * CLIENT_TICK_MS }));
      expect(controller.getActiveState()).toBe('attack');
    });
  });

  describe('sequence priority arbitration (OSRS forcedPriority)', () => {
    /**
     * JalTok-Jad's real cache `forcedPriority` values (seq config opcode 5, the
     * field the arbitration compares): `jaltokjad_attack_ranged` (7593) = 10,
     * `jaltokjad_defend` (7591) = 4. Same shape for every Zuk-wave NPC, e.g.
     * `zuk_attack` (10) vs `zuk_defend` (6).
     */
    function createJadClips(): { range: FrameClipRef; defend: FrameClipRef } {
      const range = createFrameClip('range', [20, 21, 22, 23], [2, 2, 2, 2]);
      range.seqType.forcedPriority = 10;
      const defend = createFrameClip('defend', [30, 31], [2, 2]);
      defend.seqType.forcedPriority = 4;
      return { range, defend };
    }

    it('discards a lower-priority defend clip while an attack clip is still playing', () => {
      const { range, defend } = createJadClips();
      const controller = new NpcAnimationController({
        animationSet: createMockAnimSet(),
        modelAdapter: createMockAdapter(),
      });

      controller.triggerAttack({ clip: range });
      controller.update(makeInput());
      expect(controller.getFrameState()?.seqId).toBe(range.seqId);

      // Player lands a hit one client tick into the 8-tick attack clip. In OSRS
      // the defend sequence is dropped outright and the attack plays through.
      controller.triggerAttack({ clip: defend });
      controller.update(makeInput());

      expect(controller.getFrameState()?.seqId).toBe(range.seqId);
    });

    it('plays the defend clip once the attack clip has retired', () => {
      const animationSet = createMockAnimSet();
      const { range, defend } = createJadClips();
      const controller = new NpcAnimationController({ animationSet, modelAdapter: createMockAdapter() });

      controller.triggerAttack({ clip: range });
      controller.update(makeInput());
      // Run the 8-client-tick attack clip to completion so the slot empties.
      controller.update(makeInput({ deltaMs: 8 * CLIENT_TICK_MS }));
      expect(controller.getFrameState()?.seqId).toBe(animationSet.idle?.seqId);

      controller.triggerAttack({ clip: defend });
      controller.update(makeInput());

      expect(controller.getFrameState()?.seqId).toBe(defend.seqId);
    });

    it('lets a higher-priority attack clip interrupt a defend clip mid-play', () => {
      const { range, defend } = createJadClips();
      const controller = new NpcAnimationController({
        animationSet: createMockAnimSet(),
        modelAdapter: createMockAdapter(),
      });

      controller.triggerAttack({ clip: defend });
      controller.update(makeInput());
      expect(controller.getFrameState()?.seqId).toBe(defend.seqId);

      controller.triggerAttack({ clip: range });
      controller.update(makeInput());

      expect(controller.getFrameState()?.seqId).toBe(range.seqId);
    });

    it('does not let a lower-priority clip cancel one still counting down its start delay', () => {
      const animationSet = createMockAnimSet();
      const { range, defend } = createJadClips();
      const controller = new NpcAnimationController({ animationSet, modelAdapter: createMockAdapter() });

      controller.triggerAttack({ clip: range, delayClientTicks: 4 });
      controller.triggerAttack({ clip: defend });
      controller.update(makeInput());
      // The delayed attack already owns the sequence slot, so the defend loses
      // and the base pose shows until the delay elapses.
      expect(controller.getFrameState()?.seqId).toBe(animationSet.idle?.seqId);

      controller.update(makeInput({ deltaMs: 4 * CLIENT_TICK_MS }));

      expect(controller.getFrameState()?.seqId).toBe(range.seqId);
    });

    it('lets an equal-priority clip take the slot under the >= rule', () => {
      const first = createFrameClip('first', [40, 41, 42, 43], [2, 2, 2, 2]);
      const second = createFrameClip('second', [50, 51], [2, 2]);
      const controller = new NpcAnimationController({
        animationSet: createMockAnimSet(),
        modelAdapter: createMockAdapter(),
      });

      // Both keep SeqType's default forcedPriority of 5.
      controller.triggerAttack({ clip: first });
      controller.update(makeInput());
      controller.triggerAttack({ clip: second });
      controller.update(makeInput());

      expect(controller.getFrameState()?.seqId).toBe(second.seqId);
    });
  });
});

describe('NpcAnimationController.reset (replay timeline discontinuity)', () => {
  it('clears queued signals, a delayed primary clip, tick remainder, and turn state', () => {
    const controller = new NpcAnimationController({
      animationSet: createMockAnimSet(),
      modelAdapter: createMockAdapter(),
    });
    (controller as any).signalQueue.push({ type: 'attack' });
    (controller as any).primaryTrack = {
      state: 'attack',
      clip: createMockAnimSet().idle,
      mode: 'oneshot',
      elapsedTicks: 0,
      durationClientTicks: 4,
      delayClientTicks: 10,
    };
    (controller as any).tickRemainderMs = 123;
    (controller as any)._turnReleaseCount = 5;

    controller.reset();

    expect((controller as any).signalQueue).toHaveLength(0);
    expect((controller as any).primaryTrack).toBeNull();
    expect((controller as any).tickRemainderMs).toBe(0);
    expect((controller as any)._turnReleaseCount).toBe(0);
    // lastPoseKey is deliberately NOT cleared. It is derived purely from
    // (clipId, frameId), so update() already rebuilds the model exactly when the
    // resolved pose differs. Clearing it forced a redundant full rebuild on every
    // frame of a replay scrub (one discontinuity per frame, per NPC).
    expect(controller.getActiveState()).toBe('idle');
  });

  it('drops an active attack clip back to the idle base pose', () => {
    const controller = new NpcAnimationController({
      animationSet: createMockAnimSet(),
      modelAdapter: createMockAdapter(),
    });
    controller.triggerAttack();
    controller.update(makeInput());
    expect(controller.getActiveState()).toBe('attack');

    controller.reset();

    expect(controller.getActiveState()).toBe('idle');
    // A subsequent zero-delta update holds the idle pose (no stale attack frame).
    controller.update(makeInput({ deltaMs: 0 }));
    expect(controller.getActiveState()).toBe('idle');
  });

  it('PERF: resetting an already-idle NPC rebuilds nothing', () => {
    let commits = 0;
    const modelAdapter: NpcAnimModelAdapter = { ...createMockAdapter(), commitPose: () => commits++ };
    const animationSet = createMockAnimSet();
    animationSet.idle = createFrameClip('idle', [0, 1, 2, 3], [1, 1, 1, 1]);
    const controller = new NpcAnimationController({ animationSet, modelAdapter });
    controller.update(makeInput());
    commits = 0;

    // A scrub fires one reset + update per animation frame, for every live NPC.
    for (let i = 0; i < 30; i++) {
      controller.reset();
      controller.update(makeInput({ deltaMs: 0 }));
    }

    expect(commits).toBe(0);
  });

  it('PERF: reset does not rewind a free-running idle loop', () => {
    const animationSet = createMockAnimSet();
    animationSet.idle = createFrameClip('idle', [0, 1, 2, 3], [1, 1, 1, 1]);
    const controller = new NpcAnimationController({ animationSet, modelAdapter: createMockAdapter() });
    controller.update(makeInput());
    controller.update(makeInput());
    const before = controller.getFrameState()?.currentFrameIndex;
    expect(before).toBeGreaterThan(0);

    controller.reset();

    expect(controller.getFrameState()?.currentFrameIndex).toBe(before);
  });
});
describe("NpcAnimationController idle 'loopFrameStep' mode", () => {
  function createIdleFrameClip(frameIds: number[], frameLengths: number[], frameStep: number): FrameClipRef {
    const clip = createFrameClip('idle', frameIds, frameLengths);
    clip.seqType.frameStep = frameStep;
    return clip;
  }

  // Sample the active frame index via the public getFrameState(): once before any
  // update (elapsedTicks 0), then once per client tick (one tick per update()).
  function sampleFrameIndices(animationSet: NpcAnimationSet, ticks: number): number[] {
    const controller = new NpcAnimationController({ animationSet, modelAdapter: createMockAdapter() });
    const frames = [controller.getFrameState()?.currentFrameIndex ?? -1];
    for (let i = 0; i < ticks; i++) {
      controller.update(makeInput());
      frames.push(controller.getFrameState()?.currentFrameIndex ?? -1);
    }
    return frames;
  }

  it('plays the intro once, then loops only the last frameStep frames (frameStep = 2)', () => {
    const idle = createIdleFrameClip([10, 11, 12, 13], [1, 1, 1, 1], 2);
    // Intro 0→1→2→3 plays once; then only the tail (indices 2,3) repeats.
    expect(sampleFrameIndices({ idle, idlePlayMode: 'loopFrameStep' }, 7)).toEqual([0, 1, 2, 3, 2, 3, 2, 3]);
  });

  it('holds the final frame when frameStep is -1 (play once)', () => {
    const idle = createIdleFrameClip([10, 11, 12, 13], [1, 1, 1, 1], -1);
    expect(sampleFrameIndices({ idle, idlePlayMode: 'loopFrameStep' }, 7)).toEqual([0, 1, 2, 3, 3, 3, 3, 3]);
  });

  it("defaults idle to whole-seq 'loop' when no play mode is set (ignores frameStep)", () => {
    const idle = createIdleFrameClip([10, 11, 12, 13], [1, 1, 1, 1], 2);
    expect(sampleFrameIndices({ idle }, 7)).toEqual([0, 1, 2, 3, 0, 1, 2, 3]);
  });
});
