import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ModelData } from '../../../rs/model/ModelData';
import { SeqBase } from '../../../rs/model/seq/SeqBase';
import { SeqFrame } from '../../../rs/model/seq/SeqFrame';
import { SeqTransformType } from '../../../rs/model/seq/SeqTransformType';
import { type AnimationSequence, AnimationSystem, createAnimationSystem, GAME_TICK_MS } from './AnimationSystem';

function createMockModelData(): ModelData {
  const model = new ModelData();
  model.verticesCount = 4;
  model.verticesX = new Int32Array([0, 100, 100, 0]);
  model.verticesY = new Int32Array([0, 0, 100, 100]);
  model.verticesZ = new Int32Array([0, 0, 0, 0]);
  model.faceCount = 2;
  model.indices1 = new Int32Array([0, 2]);
  model.indices2 = new Int32Array([1, 3]);
  model.indices3 = new Int32Array([2, 0]);
  model.faceColors = new Uint16Array([0, 0]);
  model.vertexLabels = [new Int32Array([0, 1]), new Int32Array([2, 3])];
  return model;
}

function createMockSeqBase(): SeqBase {
  return new SeqBase(
    1,
    3,
    [SeqTransformType.ORIGIN, SeqTransformType.TRANSLATE, SeqTransformType.ROTATE],
    [true, true, true],
    new Uint16Array([0xffff, 0xffff, 0xffff]),
    [[0], [0, 1], [0, 1]],
  );
}

function createMockSeqFrame(base: SeqBase, translateX: number, translateY: number, translateZ: number): SeqFrame {
  return new SeqFrame(1, base, 2, [0, 1], [0, translateX], [0, translateY], [0, translateZ], [-1, 0], false, false);
}

describe('AnimationSystem', () => {
  let animationSystem: AnimationSystem;

  beforeEach(() => {
    animationSystem = createAnimationSystem();
  });

  describe('createAnimationSystem', () => {
    it('creates a new AnimationSystem instance', () => {
      const system = createAnimationSystem();
      expect(system).toBeInstanceOf(AnimationSystem);
    });
  });

  describe('isInitialized', () => {
    it('returns false when not initialized', () => {
      expect(animationSystem.isInitialized()).toBe(false);
    });
  });

  describe('getCurrentTick', () => {
    it('returns 0 initially', () => {
      expect(animationSystem.getCurrentTick()).toBe(0);
    });
  });

  describe('createAnimatedModel', () => {
    it('creates an animated model with copied vertex arrays', () => {
      const model = createMockModelData();
      const animated = animationSystem.createAnimatedModel(model);

      expect(animated.originalModel).toBe(model);
      expect(animated.verticesX).not.toBe(model.verticesX);
      expect(animated.verticesY).not.toBe(model.verticesY);
      expect(animated.verticesZ).not.toBe(model.verticesZ);
      expect(animated.verticesX).toEqual(model.verticesX);
      expect(animated.verticesY).toEqual(model.verticesY);
      expect(animated.verticesZ).toEqual(model.verticesZ);
      expect(animated.animationState).toBeNull();
    });
  });

  describe('startAnimation', () => {
    it('sets animation state on the model', () => {
      const model = createMockModelData();
      const animated = animationSystem.createAnimatedModel(model);
      const sequence: AnimationSequence = {
        id: 1,
        frameIds: [100, 101, 102],
        frameLengths: [1, 1, 1],
        looping: true,
        heightOffset: 0,
        precedenceAnimating: 2,
        priority: 2,
        forcedPriority: 5,
      };

      animationSystem.startAnimation(animated, sequence);

      expect(animated.animationState).not.toBeNull();
      expect(animated.animationState?.sequence).toBe(sequence);
      expect(animated.animationState?.currentFrameIndex).toBe(0);
      expect(animated.animationState?.frameTickProgress).toBe(0);
      expect(animated.animationState?.elapsedMs).toBe(0);
      expect(animated.animationState?.completed).toBe(false);
    });
  });

  describe('stopAnimation', () => {
    it('clears animation state and resets vertices', () => {
      const model = createMockModelData();
      const animated = animationSystem.createAnimatedModel(model);
      const sequence: AnimationSequence = {
        id: 1,
        frameIds: [100],
        frameLengths: [1],
        looping: false,
        heightOffset: 0,
        precedenceAnimating: 2,
        priority: 2,
        forcedPriority: 5,
      };

      animationSystem.startAnimation(animated, sequence);
      animated.verticesX[0] = 999;

      animationSystem.stopAnimation(animated);

      expect(animated.animationState).toBeNull();
      expect(animated.verticesX[0]).toBe(model.verticesX[0]);
    });
  });

  describe('update', () => {
    it('returns false when less than 600ms has passed', () => {
      vi.useFakeTimers();
      const result = animationSystem.update(100);
      expect(result).toBe(false);
      vi.useRealTimers();
    });

    it('returns true and increments tick when 600ms has passed', () => {
      let mockTime = 0;
      const originalPerformanceNow = performance.now;
      performance.now = vi.fn(() => mockTime);

      const freshSystem = createAnimationSystem();

      freshSystem.update(0);
      expect(freshSystem.getCurrentTick()).toBe(0);

      mockTime = GAME_TICK_MS;
      const result = freshSystem.update(GAME_TICK_MS);

      expect(result).toBe(true);
      expect(freshSystem.getCurrentTick()).toBe(1);

      performance.now = originalPerformanceNow;
    });
  });

  describe('updateAnimation', () => {
    it('does nothing when no animation state', () => {
      const model = createMockModelData();
      const animated = animationSystem.createAnimatedModel(model);

      animationSystem.updateAnimation(animated, 5);

      expect(animated.verticesX).toEqual(model.verticesX);
    });

    it('does nothing when animation is completed', () => {
      const model = createMockModelData();
      const animated = animationSystem.createAnimatedModel(model);
      const sequence: AnimationSequence = {
        id: 1,
        frameIds: [100],
        frameLengths: [1],
        looping: false,
        heightOffset: 0,
        precedenceAnimating: 2,
        priority: 2,
        forcedPriority: 5,
      };

      animationSystem.startAnimation(animated, sequence);
      animated.animationState!.completed = true;

      animationSystem.updateAnimation(animated, 50);

      expect(animated.animationState?.completed).toBe(true);
    });

    it('does nothing when ticksElapsed is zero', () => {
      const model = createMockModelData();
      const animated = animationSystem.createAnimatedModel(model);
      const sequence: AnimationSequence = {
        id: 1,
        frameIds: [100, 101],
        frameLengths: [2, 2],
        looping: true,
        heightOffset: 0,
        precedenceAnimating: 2,
        priority: 2,
        forcedPriority: 5,
      };

      animationSystem.startAnimation(animated, sequence);
      animationSystem.updateAnimation(animated, 0);

      expect(animated.animationState?.frameTickProgress).toBe(0);
      expect(animated.animationState?.currentFrameIndex).toBe(0);
    });

    it('advances frame tick progress', () => {
      const model = createMockModelData();
      const animated = animationSystem.createAnimatedModel(model);
      const sequence: AnimationSequence = {
        id: 1,
        frameIds: [100, 101],
        frameLengths: [5, 5],
        looping: true,
        heightOffset: 0,
        precedenceAnimating: 2,
        priority: 2,
        forcedPriority: 5,
      };

      animationSystem.startAnimation(animated, sequence);
      animationSystem.updateAnimation(animated, 2);

      expect(animated.animationState?.frameTickProgress).toBe(2);
      expect(animated.animationState?.currentFrameIndex).toBe(0);
    });

    it('advances frame index when enough ticks pass', () => {
      const model = createMockModelData();
      const animated = animationSystem.createAnimatedModel(model);
      const sequence: AnimationSequence = {
        id: 1,
        frameIds: [100, 101, 102],
        frameLengths: [2, 2, 2],
        looping: true,
        heightOffset: 0,
        precedenceAnimating: 2,
        priority: 2,
        forcedPriority: 5,
      };

      animationSystem.startAnimation(animated, sequence);
      animationSystem.updateAnimation(animated, 3);

      expect(animated.animationState?.currentFrameIndex).toBe(1);
      expect(animated.animationState?.frameTickProgress).toBe(1);
    });

    it('loops animation when looping is true', () => {
      const model = createMockModelData();
      const animated = animationSystem.createAnimatedModel(model);
      const sequence: AnimationSequence = {
        id: 1,
        frameIds: [100, 101],
        frameLengths: [2, 2],
        looping: true,
        heightOffset: 0,
        precedenceAnimating: 2,
        priority: 2,
        forcedPriority: 5,
      };

      animationSystem.startAnimation(animated, sequence);
      animationSystem.updateAnimation(animated, 5);

      expect(animated.animationState?.completed).toBe(false);
      expect(animated.animationState?.currentFrameIndex).toBe(0);
      expect(animated.animationState?.frameTickProgress).toBe(1);
    });

    it('marks animation completed when not looping', () => {
      const model = createMockModelData();
      const animated = animationSystem.createAnimatedModel(model);
      const sequence: AnimationSequence = {
        id: 1,
        frameIds: [100, 101],
        frameLengths: [2, 2],
        looping: false,
        heightOffset: 0,
        precedenceAnimating: 2,
        priority: 2,
        forcedPriority: 5,
      };

      animationSystem.startAnimation(animated, sequence);
      animationSystem.updateAnimation(animated, 5);

      expect(animated.animationState?.completed).toBe(true);
      expect(animated.animationState?.currentFrameIndex).toBe(1);
    });
  });

  describe('createIdleSequence', () => {
    it('creates a looping animation sequence', () => {
      const sequence = animationSystem.createIdleSequence(123, [100, 101, 102], [2, 2, 2]);

      expect(sequence.id).toBe(123);
      expect(sequence.frameIds).toEqual([100, 101, 102]);
      expect(sequence.frameLengths).toEqual([2, 2, 2]);
      expect(sequence.looping).toBe(true);
    });
  });

  describe('loadFrame', () => {
    it('returns undefined when not initialized', () => {
      const frame = animationSystem.loadFrame(100);
      expect(frame).toBeUndefined();
    });
  });

  describe('clearCache', () => {
    it('does not throw when not initialized', () => {
      expect(() => animationSystem.clearCache()).not.toThrow();
    });
  });

  describe('dispose', () => {
    it('clears cache and resets state', () => {
      animationSystem.dispose();
      expect(animationSystem.isInitialized()).toBe(false);
    });
  });

  describe('GAME_TICK_MS', () => {
    it('equals 600ms', () => {
      expect(GAME_TICK_MS).toBe(600);
    });
  });
});

describe('Animation Transform Logic', () => {
  let animationSystem: AnimationSystem;

  beforeEach(() => {
    animationSystem = createAnimationSystem();
  });

  describe('interpolateFrames', () => {
    it('applies first frame when t < 0.5', () => {
      const model = createMockModelData();
      const animated = animationSystem.createAnimatedModel(model);
      const base = createMockSeqBase();
      const frame1 = createMockSeqFrame(base, 10, 0, 0);
      const frame2 = createMockSeqFrame(base, 20, 0, 0);

      animationSystem.interpolateFrames(animated, frame1, frame2, 0.3);

      expect(animated.verticesX[0]).toBe(10);
      expect(animated.verticesX[1]).toBe(110);
    });

    it('applies second frame when t >= 0.5', () => {
      const model = createMockModelData();
      const animated = animationSystem.createAnimatedModel(model);
      const base = createMockSeqBase();
      const frame1 = createMockSeqFrame(base, 10, 0, 0);
      const frame2 = createMockSeqFrame(base, 20, 0, 0);

      animationSystem.interpolateFrames(animated, frame1, frame2, 0.7);

      expect(animated.verticesX[0]).toBe(20);
      expect(animated.verticesX[1]).toBe(120);
    });
  });
});
