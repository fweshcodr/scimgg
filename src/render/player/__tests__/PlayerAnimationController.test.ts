import { describe, expect, it, vi } from 'vitest';
import { ModelData } from '../../../rs/model/ModelData';
import type { PlayerLitColors, PlayerModelData } from '../../../rs/model/PlayerModelLoader';
import type { AnimationSequence } from '../../core/animation';
import { CLIENT_TICK_MS } from '../../core/animation';
import { type PlayerPrimaryClip, type PlayerPrimaryKind, playerPrimarySpec } from '../../core/replayPrimaryCues';
import { type PrimarySpec, ReplayPrimaryIndex } from '../../core/replayPrimaryIndex';
import { PlayerAnimationController } from '../PlayerAnimationController';
import type { PlayerAnimationSet, PlayerAnimationUpdateInput, PlayerAnimModelAdapter } from '../playerAnimationTypes';

function createSequence(id: string, frameCount: number, startFrameId = 0, forcedPriority = 5): AnimationSequence {
  return {
    kind: 'frame',
    id,
    frameIds: Array.from({ length: frameCount }, (_, i) => startFrameId + i),
    frameLengths: Array.from({ length: frameCount }, () => 1),
    looping: true,
    heightOffset: 0,
    precedenceAnimating: 2,
    priority: 2,
    forcedPriority,
  } as unknown as AnimationSequence;
}

function createMockAnimationSet(params?: {
  idleFrames?: number;
  walkFrames?: number;
  unarmedIdleFrames?: number;
  unarmedWalkFrames?: number;
  eatFrames?: number;
  attackFrames?: number;
}): PlayerAnimationSet {
  const idleFrames = params?.idleFrames ?? 5;
  const walkFrames = params?.walkFrames ?? 5;
  const unarmedIdleFrames = params?.unarmedIdleFrames ?? 5;
  const unarmedWalkFrames = params?.unarmedWalkFrames ?? 5;
  const eatFrames = params?.eatFrames ?? 3;
  const attackFrames = params?.attackFrames ?? 4;

  return {
    idle: createSequence('idle', idleFrames, 100),
    walk: createSequence('walk', walkFrames, 200),
    run: createSequence('run', 5, 300),
    turnLeft: createSequence('turnLeft', 5, 400),
    turnRight: createSequence('turnRight', 5, 500),
    walkBack: createSequence('walkBack', 5, 600),
    idleTurnLeft: createSequence('idleTurnLeft', 5, 650),
    idleTurnRight: createSequence('idleTurnRight', 5, 700),
    eat: createSequence('eat', eatFrames, 700),
    attack: createSequence('attack', attackFrames, 1400),
    unarmed: {
      idle: createSequence('unarmed_idle', unarmedIdleFrames, 800),
      walk: createSequence('unarmed_walk', unarmedWalkFrames, 900),
      run: createSequence('unarmed_run', 5, 1000),
      turnLeft: createSequence('unarmed_turnLeft', 5, 1100),
      turnRight: createSequence('unarmed_turnRight', 5, 1200),
      walkBack: createSequence('unarmed_walkBack', 5, 1300),
      idleTurnLeft: createSequence('unarmed_idleTurnLeft', 5, 1350),
      idleTurnRight: createSequence('unarmed_idleTurnRight', 5, 1400),
    },
  };
}

function createMockAdapter(): PlayerAnimModelAdapter {
  return {
    resetPose: () => {},
    applyFrame: () => {},
    applyFrameInterleaved: () => {},
    commitPose: () => {},
    applyMesh: () => {},
  };
}

function createMockPlayerModelData(overrides?: Partial<PlayerModelData>): PlayerModelData {
  const mergedModel = {
    faceCount: 1,
    verticesCount: 3,
    verticesX: new Int32Array([10, 20, 30]),
    verticesY: new Int32Array([11, 21, 31]),
    verticesZ: new Int32Array([12, 22, 32]),
    indices1: new Int32Array([0]),
    indices2: new Int32Array([1]),
    indices3: new Int32Array([2]),
    normals: null,
  };
  const litColors: PlayerLitColors = {
    faceColors1: new Int32Array([100]),
    faceColors2: new Int32Array([101]),
    faceColors3: new Int32Array([102]),
  };

  return {
    mergedModel: mergedModel as any,
    litColors,
    weaponShieldFaceMask: new Uint8Array([0]),
    subModelFaceCounts: [1] as number[],
    ...overrides,
  } as PlayerModelData;
}

function makeInput(overrides: Partial<PlayerAnimationUpdateInput> = {}): PlayerAnimationUpdateInput {
  const isMoving = overrides.isMoving ?? false;
  return {
    isMoving,
    simIsMoving: overrides.simIsMoving ?? isMoving,
    locomotionState: overrides.locomotionState,
    isRunning: overrides.isRunning ?? false,
    visualAngle: overrides.visualAngle ?? 0,
    targetAngle: overrides.targetAngle ?? 0,
    speedMultiplier: overrides.speedMultiplier ?? 1,
    isTurning: overrides.isTurning ?? false,
  };
}

async function advanceTicks(
  controller: PlayerAnimationController,
  input: PlayerAnimationUpdateInput,
  tickCount: number,
): Promise<void> {
  controller.updatePlayerAnimation({ ...input, deltaMs: 0 });
  for (let i = 0; i < tickCount; i++) {
    controller.updatePlayerAnimation({ ...input, deltaMs: CLIENT_TICK_MS });
  }
}

describe('PlayerAnimationController', () => {
  describe('accepted replay primary restoration', () => {
    it.each([
      'attack',
      'consume',
      'block',
      'cast',
    ] as const)('matches chronological %s phase and resumes once', (kind) => {
      const sequence = { ...createSequence('primary', 4, 700, 6), id: 99, frameLengths: [20, 20, 20, 20] };
      const animationSet = { ...createMockAnimationSet(), attack: sequence, eat: sequence, block: sequence };
      const live = new PlayerAnimationController({
        playerModelData: createMockPlayerModelData(),
        animationSet,
        modelAdapter: createMockAdapter(),
      });
      const adapter = createMockAdapter();
      const apply = vi.spyOn(adapter, 'applyFrame');
      const sought = new PlayerAnimationController({
        playerModelData: createMockPlayerModelData(),
        animationSet,
        modelAdapter: adapter,
      });
      const primaryKind: PlayerPrimaryKind = kind === 'cast' ? 'attack' : kind;
      if (kind === 'cast') live.triggerAttackWithSequence(sequence);
      else live.enqueueSignal({ type: kind });
      live.updatePlayerAnimation({ ...makeInput(), deltaMs: 0 });
      for (let cycle = 0; cycle < 45; cycle++) live.updatePlayerAnimation({ ...makeInput(), deltaMs: 20 });
      live.updatePlayerAnimation({ ...makeInput(), deltaMs: 10 });
      const timeline = new ReplayPrimaryIndex<PlayerPrimaryKind, PlayerPrimaryClip>([
        { frameIndex: 0, tick: 0, value: primaryKind },
      ]);
      const sample = timeline.sample({ cycle: 45.5, throughFrameIndex: 0 }, animationSet, (cue) =>
        playerPrimarySpec(sequence, cue),
      );

      sought.restorePrimaryAt(sample.primary);
      sought.updatePlayerAnimation({ ...makeInput(), deltaMs: 600 });

      expect(sought.getFrameState()).toEqual(live.getFrameState());
      expect(apply).toHaveBeenLastCalledWith(702);
      expect(sought.getConsumeAnimSnapshot()).toEqual(live.getConsumeAnimSnapshot());
      if (kind === 'consume') expect(sought['currentPlayerSequence']).toBe(animationSet.unarmed?.idle);
      sought.updatePlayerAnimation({ ...makeInput(), deltaMs: 10 });
      live.updatePlayerAnimation({ ...makeInput(), deltaMs: 10 });
      expect(sought.getFrameState()).toEqual(live.getFrameState());
      expect(sought['primaryAnimFrameTick']).toBe(6);
    });

    it('matches live rejection and equal-priority restart through backward seeks', () => {
      const attack = { ...createSequence('attack', 4, 1000, 6), id: 10, frameLengths: [30, 30, 30, 30] };
      const block = { ...createSequence('block', 4, 2000, 5), id: 20, frameLengths: [30, 30, 30, 30] };
      const animationSet = { ...createMockAnimationSet(), attack, block };
      const live = new PlayerAnimationController({
        playerModelData: createMockPlayerModelData(),
        animationSet,
        modelAdapter: createMockAdapter(),
      });
      const sought = new PlayerAnimationController({
        playerModelData: createMockPlayerModelData(),
        animationSet,
        modelAdapter: createMockAdapter(),
      });
      const cues = [
        { frameIndex: 0, tick: 0, value: playerPrimarySpec(attack, 'attack') },
        { frameIndex: 1, tick: 1, value: playerPrimarySpec(block, 'block') },
        { frameIndex: 2, tick: 2, value: playerPrimarySpec(attack, 'attack') },
      ];
      const timeline = new ReplayPrimaryIndex<PrimarySpec<PlayerPrimaryClip>, PlayerPrimaryClip>(cues);
      const expected = new Map<number, ReturnType<PlayerAnimationController['getFrameState']>>();
      for (let cycle = 0; cycle <= 75; cycle++) {
        if (cycle > 0) live.updatePlayerAnimation({ ...makeInput(), deltaMs: 20 });
        if (cycle === 0 || cycle === 60) live.triggerAttack();
        if (cycle === 30) live.triggerBlock();
        live.updatePlayerAnimation({ ...makeInput(), deltaMs: 0 });
        expected.set(cycle, live.getFrameState());
      }
      for (const cycle of [75, 45, 31, 60, 1]) {
        sought.restorePrimaryAt(timeline.sample({ cycle, throughFrameIndex: 2 }, animationSet, (cue) => cue).primary);
        sought.updatePlayerAnimation({ ...makeInput(), deltaMs: 0 });
        expect(sought.getFrameState()).toEqual(expected.get(cycle));
      }
    });
  });
  describe('pose sequence swap preserves frame position', () => {
    it('when primary starts and unarmed set is available, refreshCurrentPoseSequence keeps frame when valid', async () => {
      const controller = new PlayerAnimationController({
        playerModelData: createMockPlayerModelData(),
        animationSet: createMockAnimationSet({ idleFrames: 5, unarmedIdleFrames: 5 }),
        modelAdapter: createMockAdapter(),
      });

      await advanceTicks(controller, makeInput(), 3);
      expect((controller as any).playerAnimFrame).toBe(3);

      controller.triggerConsume();
      controller.updatePlayerAnimation(makeInput());

      expect((controller as any).playerAnimFrame).toBe(3);
    });

    it('when primary starts and new sequence is shorter, frame clamps by resetting to 0', async () => {
      const controller = new PlayerAnimationController({
        playerModelData: createMockPlayerModelData(),
        animationSet: createMockAnimationSet({ walkFrames: 8, unarmedWalkFrames: 4 }),
        modelAdapter: createMockAdapter(),
      });

      await advanceTicks(controller, makeInput({ isMoving: true }), 6);
      expect((controller as any).playerAnimFrame).toBe(6);

      controller.triggerConsume();
      controller.updatePlayerAnimation(makeInput({ isMoving: true }));

      expect((controller as any).playerAnimFrame).toBe(0);
    });
  });

  describe('hidden face positions are face-local not world-origin', () => {
    it('buildPlayerAnimatedMesh collapses hidden faces to face first vertex, not 0,0,0', () => {
      const mergedModel = {
        faceCount: 2,
        verticesCount: 6,
        verticesX: new Int32Array([10, 20, 30, 40, 50, 60]),
        verticesY: new Int32Array([11, 21, 31, 41, 51, 61]),
        verticesZ: new Int32Array([12, 22, 32, 42, 52, 62]),
        indices1: new Int32Array([0, 3]),
        indices2: new Int32Array([1, 4]),
        indices3: new Int32Array([2, 5]),
        normals: null,
        faceRenderPriorities: null,
        priority: 0,
        faceAlphas: null,
        faceBias: null,
        calculateVertexNormals() {},
      };
      const litColors = {
        faceColors1: new Int32Array([100, 200]),
        faceColors2: new Int32Array([101, 201]),
        faceColors3: new Int32Array([102, 202]),
      };
      const weaponShieldFaceMask = new Uint8Array([1, 0]);

      const playerModelData = createMockPlayerModelData({
        mergedModel: mergedModel as any,
        litColors,
        weaponShieldFaceMask,
      });

      const controller = new PlayerAnimationController({
        playerModelData,
        animationSet: createMockAnimationSet(),
        modelAdapter: createMockAdapter(),
      });

      controller.triggerConsume();
      controller.updatePlayerAnimation(makeInput());

      const mesh = controller.buildPlayerAnimatedMesh();
      expect(mesh).not.toBeNull();

      const positions = Array.from(mesh!.opaque!.positions.slice(0, 9));
      const expectedFirstVertex = [
        mergedModel.verticesX[mergedModel.indices1[0]],
        mergedModel.verticesY[mergedModel.indices1[0]],
        mergedModel.verticesZ[mergedModel.indices1[0]],
      ];

      expect(positions).toEqual([...expectedFirstVertex, ...expectedFirstVertex, ...expectedFirstVertex]);
      expect(expectedFirstVertex).not.toEqual([0, 0, 0]);
    });
  });

  describe('interleaved animation blending', () => {
    it('uses the primary height offset when an idle secondary is suppressed', async () => {
      const animSet = createMockAnimationSet();
      const masks = [0, 1, 2, 9999999];
      expect(animSet.idle).not.toBeNull();
      expect(animSet.attack).not.toBeNull();
      if (!animSet.idle || !animSet.attack) return;
      Object.assign(animSet.idle, { heightOffset: 3 });
      Object.assign(animSet.attack, { masks, heightOffset: 15 });
      const controller = new PlayerAnimationController({
        playerModelData: createMockPlayerModelData(),
        animationSet: animSet,
        modelAdapter: createMockAdapter(),
      });

      controller.triggerAttack();
      await advanceTicks(controller, makeInput(), 1);

      expect(controller.getAnimationHeightOffset()).toBe(15);
    });

    it('uses the movement height offset while a masked primary is moving or turning', async () => {
      const animSet = createMockAnimationSet();
      const masks = [0, 1, 2, 9999999];
      expect(animSet.walk).not.toBeNull();
      expect(animSet.turnRight).not.toBeNull();
      expect(animSet.attack).not.toBeNull();
      if (!animSet.walk || !animSet.turnRight || !animSet.attack) return;
      Object.assign(animSet.walk, { heightOffset: 7 });
      Object.assign(animSet.turnRight, { heightOffset: 11 });
      Object.assign(animSet.attack, { masks, heightOffset: 15 });
      const controller = new PlayerAnimationController({
        playerModelData: createMockPlayerModelData(),
        animationSet: animSet,
        modelAdapter: createMockAdapter(),
      });

      controller.triggerAttack();
      await advanceTicks(controller, makeInput({ isMoving: true, simIsMoving: true }), 1);
      expect(controller.getAnimationHeightOffset()).toBe(7);

      await advanceTicks(
        controller,
        makeInput({ isMoving: true, simIsMoving: true, visualAngle: 0, targetAngle: 512 }),
        1,
      );
      expect(controller.getAnimationHeightOffset()).toBe(11);
    });

    it('uses applyFrameInterleaved when primary sequence has masks and moving', async () => {
      const adapter = createMockAdapter();
      const applyFrameSpy = vi.fn();
      const applyFrameInterleavedSpy = vi.fn();
      adapter.applyFrame = applyFrameSpy;
      adapter.applyFrameInterleaved = applyFrameInterleavedSpy;

      const masks = [0, 1, 2, 9999999];
      const animSet = createMockAnimationSet();
      animSet.eat = {
        ...createSequence('eat', 3, 700),
        masks,
      } as unknown as AnimationSequence;

      const controller = new PlayerAnimationController({
        playerModelData: createMockPlayerModelData(),
        animationSet: animSet,
        modelAdapter: adapter,
      });

      const walkingInput = makeInput({ isMoving: true, simIsMoving: true });
      controller.updatePlayerAnimation(walkingInput);
      controller.triggerConsume();
      await advanceTicks(controller, walkingInput, 1);

      expect(applyFrameInterleavedSpy).toHaveBeenCalled();
      const [primaryFrameId, secondaryFrameId, passedMasks] = applyFrameInterleavedSpy.mock.calls[0];
      expect(typeof primaryFrameId).toBe('number');
      expect(typeof secondaryFrameId).toBe('number');
      expect(passedMasks).toBe(masks);
    });

    it('applies the primary alone when idle + masked primary (the idle secondary is dropped)', async () => {
      const adapter = createMockAdapter();
      const applyFrameSpy = vi.fn();
      const applyFrameInterleavedSpy = vi.fn();
      adapter.applyFrame = applyFrameSpy;
      adapter.applyFrameInterleaved = applyFrameInterleavedSpy;

      const masks = [0, 1, 2, 9999999];
      const animSet = createMockAnimationSet();
      animSet.eat = {
        ...createSequence('eat', 3, 700),
        masks,
      } as unknown as AnimationSequence;

      const controller = new PlayerAnimationController({
        playerModelData: createMockPlayerModelData(),
        animationSet: animSet,
        modelAdapter: adapter,
      });

      controller.triggerConsume();
      await advanceTicks(controller, makeInput(), 1);

      // Blending the idle secondary into a standing primary
      // would strip the primary's own grounded lower-body transforms and sink
      // the model (this was the dragon-claws-spec sink).
      expect(applyFrameInterleavedSpy).not.toHaveBeenCalled();
      expect(applyFrameSpy).toHaveBeenCalled();
    });

    it('uses primary-only applyFrame when primary has no masks and moving (null interleaveOrder)', async () => {
      const adapter = createMockAdapter();
      const applyFrameSpy = vi.fn();
      const applyFrameInterleavedSpy = vi.fn();
      adapter.applyFrame = applyFrameSpy;
      adapter.applyFrameInterleaved = applyFrameInterleavedSpy;

      const animSet = createMockAnimationSet();
      animSet.eat = createSequence('eat', 3, 700);

      const controller = new PlayerAnimationController({
        playerModelData: createMockPlayerModelData(),
        animationSet: animSet,
        modelAdapter: adapter,
      });

      const walkingInput = makeInput({ isMoving: true, simIsMoving: true });
      controller.updatePlayerAnimation(walkingInput);
      controller.triggerConsume();
      applyFrameSpy.mockClear();
      applyFrameInterleavedSpy.mockClear();
      await advanceTicks(controller, walkingInput, 1);

      expect(applyFrameInterleavedSpy).not.toHaveBeenCalled();
      // Primary applied via applyFrame, not interleaved. No movement frame bleed-through.
      expect(applyFrameSpy).toHaveBeenCalled();
    });
  });

  describe('weaponShieldFaceMask length matches faceCount', () => {
    it('mask length matches mergedModel.faceCount', () => {
      const mergedModel = {
        faceCount: 2,
        verticesCount: 6,
        verticesX: new Int32Array([10, 20, 30, 40, 50, 60]),
        verticesY: new Int32Array([11, 21, 31, 41, 51, 61]),
        verticesZ: new Int32Array([12, 22, 32, 42, 52, 62]),
        indices1: new Int32Array([0, 3]),
        indices2: new Int32Array([1, 4]),
        indices3: new Int32Array([2, 5]),
        normals: null,
      };

      const playerModelData = createMockPlayerModelData({
        mergedModel: mergedModel as any,
        weaponShieldFaceMask: new Uint8Array([1, 0]),
      });

      expect(playerModelData.weaponShieldFaceMask.length).toBe(playerModelData.mergedModel.faceCount);
    });
  });

  describe('updateModel preserves animation state across equipment changes', () => {
    it('keeps original attack sequence playing when weapon changes', async () => {
      const animSet1 = createMockAnimationSet();
      const originalAttack = createSequence('attack_shadow', 5, 1400);
      animSet1.attack = originalAttack;
      const controller = new PlayerAnimationController({
        playerModelData: createMockPlayerModelData(),
        animationSet: animSet1,
        modelAdapter: createMockAdapter(),
      });

      controller.triggerAttack();
      await advanceTicks(controller, makeInput(), 1);

      const frameBefore = (controller as any).primaryAnimFrame;
      const frameTickBefore = (controller as any).primaryAnimFrameTick;
      expect((controller as any).primaryAnimCompleted).toBe(false);

      const animSet2 = createMockAnimationSet();
      animSet2.attack = createSequence('attack_whip', 5, 2000);
      controller.updateModel({
        playerModelData: createMockPlayerModelData(),
        animationSet: animSet2,
        modelAdapter: createMockAdapter(),
      });

      expect((controller as any).primaryAnimCompleted).toBe(false);
      expect((controller as any).primaryAnimFrame).toBe(frameBefore);
      expect((controller as any).primaryAnimFrameTick).toBe(frameTickBefore);
      expect((controller as any).primarySequence).toBe(originalAttack);
    });

    it('keeps original consume sequence playing when equipment changes', async () => {
      const animSet1 = createMockAnimationSet();
      const originalEat = animSet1.eat;
      const controller = new PlayerAnimationController({
        playerModelData: createMockPlayerModelData(),
        animationSet: animSet1,
        modelAdapter: createMockAdapter(),
      });

      controller.triggerConsume();
      await advanceTicks(controller, makeInput(), 1);

      expect((controller as any).primaryAnimCompleted).toBe(false);
      expect((controller as any).primaryIsConsume).toBe(true);

      const animSet2 = createMockAnimationSet();
      controller.updateModel({
        playerModelData: createMockPlayerModelData(),
        animationSet: animSet2,
        modelAdapter: createMockAdapter(),
      });

      expect((controller as any).primaryAnimCompleted).toBe(false);
      expect((controller as any).primaryIsConsume).toBe(true);
      expect((controller as any).primarySequence).toBe(originalEat);
    });

    it('preserves movement state across model swap', async () => {
      const controller = new PlayerAnimationController({
        playerModelData: createMockPlayerModelData(),
        animationSet: createMockAnimationSet(),
        modelAdapter: createMockAdapter(),
      });

      await advanceTicks(controller, makeInput({ isMoving: true, simIsMoving: true }), 2);
      expect((controller as any).playerMovementState).toBe('walk');

      const newAnimSet = createMockAnimationSet();
      controller.updateModel({
        playerModelData: createMockPlayerModelData(),
        animationSet: newAnimSet,
        modelAdapter: createMockAdapter(),
      });

      expect((controller as any).playerMovementState).toBe('walk');
      expect((controller as any).currentPlayerSequence).toBe(newAnimSet.walk);
    });

    it('does not disturb completed state when no animation is playing', () => {
      const controller = new PlayerAnimationController({
        playerModelData: createMockPlayerModelData(),
        animationSet: createMockAnimationSet(),
        modelAdapter: createMockAdapter(),
      });

      expect((controller as any).primaryAnimCompleted).toBe(true);

      controller.updateModel({
        playerModelData: createMockPlayerModelData(),
        animationSet: createMockAnimationSet(),
        modelAdapter: createMockAdapter(),
      });

      expect((controller as any).primaryAnimCompleted).toBe(true);
      expect((controller as any).primarySequence).toBeNull();
    });

    it('clamps pose frame when new walk sequence is shorter', async () => {
      const animSet1 = createMockAnimationSet({ walkFrames: 8 });
      const controller = new PlayerAnimationController({
        playerModelData: createMockPlayerModelData(),
        animationSet: animSet1,
        modelAdapter: createMockAdapter(),
      });

      await advanceTicks(controller, makeInput({ isMoving: true, simIsMoving: true }), 6);
      expect((controller as any).playerAnimFrame).toBeGreaterThanOrEqual(4);

      const animSet2 = createMockAnimationSet({ walkFrames: 3 });
      controller.updateModel({
        playerModelData: createMockPlayerModelData(),
        animationSet: animSet2,
        modelAdapter: createMockAdapter(),
      });

      expect((controller as any).playerAnimFrame).toBe(0);
      expect((controller as any).currentPlayerSequence).toBe(animSet2.walk);
    });

    it('nulls lastPoseKey to force re-render after swap', () => {
      const controller = new PlayerAnimationController({
        playerModelData: createMockPlayerModelData(),
        animationSet: createMockAnimationSet(),
        modelAdapter: createMockAdapter(),
      });

      controller.applyInitialAnimationFrame();
      expect((controller as any).lastPoseKey).not.toBeNull();

      controller.updateModel({
        playerModelData: createMockPlayerModelData(),
        animationSet: createMockAnimationSet(),
        modelAdapter: createMockAdapter(),
      });

      expect((controller as any).lastPoseKey).toBeNull();
    });
  });

  describe('visual trailing on last movement tile', () => {
    it('N→S stop transition does not preserve directional state into trailing frame', async () => {
      const controller = new PlayerAnimationController({
        playerModelData: createMockPlayerModelData(),
        animationSet: createMockAnimationSet(),
        modelAdapter: createMockAdapter(),
      });

      await advanceTicks(
        controller,
        makeInput({
          isMoving: true,
          simIsMoving: true,
          locomotionState: 'walkBack',
          visualAngle: 0,
          targetAngle: 0,
        }),
        1,
      );
      expect((controller as any).playerMovementState).toBe('walkBack');

      await advanceTicks(
        controller,
        makeInput({
          isMoving: true,
          simIsMoving: false,
          locomotionState: null,
          isRunning: false,
          visualAngle: 0,
          targetAngle: 0,
        }),
        1,
      );

      expect((controller as any).playerMovementState).toBe('walk');
    });

    it('walk continues during visual trailing', async () => {
      const controller = new PlayerAnimationController({
        playerModelData: createMockPlayerModelData(),
        animationSet: createMockAnimationSet(),
        modelAdapter: createMockAdapter(),
      });

      await advanceTicks(controller, makeInput({ isMoving: true, simIsMoving: true }), 2);
      expect((controller as any).playerMovementState).toBe('walk');

      await advanceTicks(controller, makeInput({ isMoving: true, simIsMoving: false }), 2);
      expect((controller as any).playerMovementState).toBe('walk');
    });

    it('run continues during visual trailing', async () => {
      const controller = new PlayerAnimationController({
        playerModelData: createMockPlayerModelData(),
        animationSet: createMockAnimationSet(),
        modelAdapter: createMockAdapter(),
      });

      await advanceTicks(controller, makeInput({ isMoving: true, simIsMoving: true, isRunning: true }), 2);
      expect((controller as any).playerMovementState).toBe('run');

      await advanceTicks(controller, makeInput({ isMoving: true, simIsMoving: false, isRunning: true }), 2);
      expect((controller as any).playerMovementState).toBe('run');
    });

    it('directional locomotion falls back to walk during visual trailing', async () => {
      const controller = new PlayerAnimationController({
        playerModelData: createMockPlayerModelData(),
        animationSet: createMockAnimationSet(),
        modelAdapter: createMockAdapter(),
      });

      await advanceTicks(
        controller,
        makeInput({
          isMoving: true,
          simIsMoving: true,
          visualAngle: 0,
          targetAngle: 512,
        }),
        2,
      );
      expect((controller as any).playerMovementState).toBe('turnRight');

      await advanceTicks(
        controller,
        makeInput({
          isMoving: true,
          simIsMoving: false,
          visualAngle: 0,
          targetAngle: 512,
        }),
        2,
      );
      expect((controller as any).playerMovementState).toBe('walk');
    });

    it('idle only when fully stopped', async () => {
      const controller = new PlayerAnimationController({
        playerModelData: createMockPlayerModelData(),
        animationSet: createMockAnimationSet(),
        modelAdapter: createMockAdapter(),
      });

      await advanceTicks(controller, makeInput({ isMoving: true, simIsMoving: true }), 2);
      expect((controller as any).playerMovementState).toBe('walk');

      await advanceTicks(controller, makeInput({ isMoving: false, simIsMoving: false }), 2);
      expect((controller as any).playerMovementState).toBe('idle');
    });
  });

  describe('movement state selection (OSRS fidelity)', () => {
    it('uses provided locomotionState when available', async () => {
      const controller = new PlayerAnimationController({
        playerModelData: createMockPlayerModelData(),
        animationSet: createMockAnimationSet(),
        modelAdapter: createMockAdapter(),
      });

      await advanceTicks(
        controller,
        makeInput({
          isMoving: true,
          simIsMoving: true,
          locomotionState: 'walkBack',
          visualAngle: 0,
          targetAngle: 256,
        }),
        1,
      );

      expect((controller as any).playerMovementState).toBe('walkBack');
    });

    it('running with forward angle diff uses run animation', async () => {
      const controller = new PlayerAnimationController({
        playerModelData: createMockPlayerModelData(),
        animationSet: createMockAnimationSet(),
        modelAdapter: createMockAdapter(),
      });

      await advanceTicks(
        controller,
        makeInput({
          isMoving: true,
          simIsMoving: true,
          isRunning: true,
          visualAngle: 0,
          targetAngle: 0,
        }),
        2,
      );
      expect((controller as any).playerMovementState).toBe('run');
    });

    it('run only overrides forward walk, not directional walk', async () => {
      const controller = new PlayerAnimationController({
        playerModelData: createMockPlayerModelData(),
        animationSet: createMockAnimationSet(),
        modelAdapter: createMockAdapter(),
      });

      await advanceTicks(
        controller,
        makeInput({
          isMoving: true,
          simIsMoving: true,
          isRunning: true,
          visualAngle: 0,
          targetAngle: 512,
        }),
        2,
      );
      expect((controller as any).playerMovementState).toBe('turnRight');
    });

    it('walking with large angle diff uses directional walk animation', async () => {
      const controller = new PlayerAnimationController({
        playerModelData: createMockPlayerModelData(),
        animationSet: createMockAnimationSet(),
        modelAdapter: createMockAdapter(),
      });

      await advanceTicks(
        controller,
        makeInput({
          isMoving: true,
          simIsMoving: true,
          isRunning: false,
          visualAngle: 0,
          targetAngle: 512,
        }),
        2,
      );
      expect((controller as any).playerMovementState).toBe('turnRight');
    });

    it('walking with 180 degree angle diff uses walkBack animation', async () => {
      const controller = new PlayerAnimationController({
        playerModelData: createMockPlayerModelData(),
        animationSet: createMockAnimationSet(),
        modelAdapter: createMockAdapter(),
      });

      await advanceTicks(
        controller,
        makeInput({
          isMoving: true,
          simIsMoving: true,
          isRunning: false,
          visualAngle: 0,
          targetAngle: 1024,
        }),
        2,
      );
      expect((controller as any).playerMovementState).toBe('walkBack');
    });

    it('missing directional sequence falls back to walk while moving', async () => {
      const animationSet = createMockAnimationSet();
      animationSet.turnRight = null;
      const controller = new PlayerAnimationController({
        playerModelData: createMockPlayerModelData(),
        animationSet,
        modelAdapter: createMockAdapter(),
      });

      await advanceTicks(
        controller,
        makeInput({
          isMoving: true,
          simIsMoving: true,
          isRunning: false,
          visualAngle: 0,
          targetAngle: 512,
        }),
        2,
      );
      expect((controller as any).playerMovementState).toBe('walk');
    });

    it('missing directional sequence falls back to run when running', async () => {
      const animationSet = createMockAnimationSet();
      animationSet.turnRight = null;
      const controller = new PlayerAnimationController({
        playerModelData: createMockPlayerModelData(),
        animationSet,
        modelAdapter: createMockAdapter(),
      });

      await advanceTicks(
        controller,
        makeInput({
          isMoving: true,
          simIsMoving: true,
          isRunning: true,
          visualAngle: 0,
          targetAngle: 512,
        }),
        2,
      );
      expect((controller as any).playerMovementState).toBe('run');
    });

    it('walking with small angle diff uses walk animation', async () => {
      const controller = new PlayerAnimationController({
        playerModelData: createMockPlayerModelData(),
        animationSet: createMockAnimationSet(),
        modelAdapter: createMockAdapter(),
      });

      await advanceTicks(
        controller,
        makeInput({
          isMoving: true,
          simIsMoving: true,
          isRunning: false,
          visualAngle: 0,
          targetAngle: 0,
        }),
        2,
      );
      expect((controller as any).playerMovementState).toBe('walk');
    });

    it('movement state transition does not reset frame to zero', async () => {
      const controller = new PlayerAnimationController({
        playerModelData: createMockPlayerModelData(),
        animationSet: createMockAnimationSet(),
        modelAdapter: createMockAdapter(),
      });

      await advanceTicks(
        controller,
        makeInput({
          isMoving: true,
          simIsMoving: true,
          isRunning: true,
          visualAngle: 0,
          targetAngle: 0,
        }),
        3,
      );

      const frameBefore = (controller as any).playerAnimFrame;
      expect((controller as any).playerMovementState).toBe('run');
      expect(frameBefore).toBeGreaterThan(0);

      await advanceTicks(
        controller,
        makeInput({
          isMoving: true,
          simIsMoving: true,
          isRunning: false,
          visualAngle: 0,
          targetAngle: 0,
        }),
        1,
      );

      expect((controller as any).playerMovementState).toBe('walk');
      expect((controller as any).playerAnimFrame).toBeGreaterThan(0);
    });
  });

  describe('idle turn behavior', () => {
    it('idle turn plays after 25 cycles of turning', async () => {
      const controller = new PlayerAnimationController({
        playerModelData: createMockPlayerModelData(),
        animationSet: createMockAnimationSet(),
        modelAdapter: createMockAdapter(),
      });

      await advanceTicks(controller, makeInput({ isMoving: false, simIsMoving: false, isTurning: true }), 26);
      expect((controller as any).playerMovementState).toBe('idleTurnRight');
    });

    it('idleTurnRight plays IMMEDIATELY when a sustained multi-cycle turn starts (attacking behind while walking)', async () => {
      // Clicking to attack an NPC behind you while walking must not leave
      // playerMovementState stuck at 'walk' for 500ms (25 client ticks) before switching
      // to idleTurn. A sustained turn is detected via angle delta > turnSpeed (32) and
      // switches to idleTurn on the first frame.
      const controller = new PlayerAnimationController({
        playerModelData: createMockPlayerModelData(),
        animationSet: createMockAnimationSet(),
        modelAdapter: createMockAdapter(),
      });

      await advanceTicks(
        controller,
        makeInput({
          isMoving: true,
          simIsMoving: true,
          visualAngle: 1024,
          targetAngle: 1024,
        }),
        3,
      );
      expect((controller as any).playerMovementState).toBe('walk');

      // Now stop and need to turn 180° (north 1024 → south 0).
      // absDelta = 1024 > 32 → isSustainedTurn = true → idleTurn immediately.
      await advanceTicks(
        controller,
        makeInput({
          isMoving: false,
          simIsMoving: false,
          isTurning: true,
          visualAngle: 1024,
          targetAngle: 0,
        }),
        1,
      );

      expect((controller as any).playerMovementState).toBe('idleTurnRight');
    });

    it('idleTurnRight plays IMMEDIATELY for a clockwise 90° turn (512 units > 32)', async () => {
      const controller = new PlayerAnimationController({
        playerModelData: createMockPlayerModelData(),
        animationSet: createMockAnimationSet(),
        modelAdapter: createMockAdapter(),
      });

      // Stop+turn from north (1024) to east (1536) = 512 units = ~90°
      await advanceTicks(
        controller,
        makeInput({
          isMoving: false,
          simIsMoving: false,
          isTurning: true,
          visualAngle: 1024,
          targetAngle: 1536,
        }),
        1,
      );

      expect((controller as any).playerMovementState).toBe('idleTurnRight');
    });

    it('idleTurnLeft plays IMMEDIATELY for a counter-clockwise 90° turn', async () => {
      const controller = new PlayerAnimationController({
        playerModelData: createMockPlayerModelData(),
        animationSet: createMockAnimationSet(),
        modelAdapter: createMockAdapter(),
      });

      await advanceTicks(
        controller,
        makeInput({
          isMoving: false,
          simIsMoving: false,
          isTurning: true,
          visualAngle: 0,
          targetAngle: 1536,
        }),
        1,
      );

      expect((controller as any).playerMovementState).toBe('idleTurnLeft');
    });

    it('absDelta exactly at turn step (32) stays idle, 33 triggers idleTurn', async () => {
      // Boundary: the sustained-turn threshold is `absDelta > PLAYER_TURN_STEP_UNITS`.
      // At exactly 32, a single turn cycle can complete the rotation so we should
      // NOT upgrade to idleTurn. At 33, the turn needs more than one cycle and we
      // should enter idleTurn on the first frame.
      const controllerAt32 = new PlayerAnimationController({
        playerModelData: createMockPlayerModelData(),
        animationSet: createMockAnimationSet(),
        modelAdapter: createMockAdapter(),
      });
      await advanceTicks(
        controllerAt32,
        makeInput({
          isMoving: false,
          simIsMoving: false,
          isTurning: true,
          visualAngle: 0,
          targetAngle: 32,
        }),
        1,
      );
      expect((controllerAt32 as any).playerMovementState).toBe('idle');

      const controllerAt33 = new PlayerAnimationController({
        playerModelData: createMockPlayerModelData(),
        animationSet: createMockAnimationSet(),
        modelAdapter: createMockAdapter(),
      });
      await advanceTicks(
        controllerAt33,
        makeInput({
          isMoving: false,
          simIsMoving: false,
          isTurning: true,
          visualAngle: 0,
          targetAngle: 33,
        }),
        1,
      );
      expect((controllerAt33 as any).playerMovementState).toBe('idleTurnRight');
    });

    it('boundary wrap-around: absDelta computed across the 0/2047 seam', async () => {
      // At visualAngle=10, targetAngle=2030, the shortest path is -12 units
      // (absDelta=12, NOT 2020). Should stay idle because the turn completes
      // in one cycle.
      const controller = new PlayerAnimationController({
        playerModelData: createMockPlayerModelData(),
        animationSet: createMockAnimationSet(),
        modelAdapter: createMockAdapter(),
      });
      await advanceTicks(
        controller,
        makeInput({
          isMoving: false,
          simIsMoving: false,
          isTurning: true,
          visualAngle: 10,
          targetAngle: 2030,
        }),
        1,
      );
      expect((controller as any).playerMovementState).toBe('idle');
    });

    it('stationary small turn (delta ≤ 32) transitions OUT of walk to idle, not stuck', async () => {
      // Even when the turn is too small to warrant idleTurn, the state must still
      // exit any lingering movement pose rather than stay stuck in 'walk'.
      const controller = new PlayerAnimationController({
        playerModelData: createMockPlayerModelData(),
        animationSet: createMockAnimationSet(),
        modelAdapter: createMockAdapter(),
      });

      await advanceTicks(
        controller,
        makeInput({
          isMoving: true,
          simIsMoving: true,
          visualAngle: 0,
          targetAngle: 0,
        }),
        3,
      );
      expect((controller as any).playerMovementState).toBe('walk');

      // Stop with a tiny 16-unit turn (below the 32 sustained threshold)
      await advanceTicks(
        controller,
        makeInput({
          isMoving: false,
          simIsMoving: false,
          isTurning: true,
          visualAngle: 0,
          targetAngle: 16,
        }),
        1,
      );

      expect((controller as any).playerMovementState).toBe('idle');
    });

    it('idleTurnRight is latched — does not flicker back to idle as the turn nears completion', async () => {
      // Once idleTurn starts for a sustained turn, it must stay until the turn
      // completes. As absDelta shrinks below 32 near the end, the controller
      // should still keep 'idleTurn' instead of dropping to 'idle'.
      const controller = new PlayerAnimationController({
        playerModelData: createMockPlayerModelData(),
        animationSet: createMockAnimationSet(),
        modelAdapter: createMockAdapter(),
      });

      await advanceTicks(
        controller,
        makeInput({
          isMoving: false,
          simIsMoving: false,
          isTurning: true,
          visualAngle: 0,
          targetAngle: 1024,
        }),
        1,
      );
      expect((controller as any).playerMovementState).toBe('idleTurnRight');

      // Now the render angle has stepped close to target — absDelta = 16 (< 32),
      // but still turning. Must stay in idleTurn.
      await advanceTicks(
        controller,
        makeInput({
          isMoving: false,
          simIsMoving: false,
          isTurning: true,
          visualAngle: 1008,
          targetAngle: 1024,
        }),
        1,
      );
      expect((controller as any).playerMovementState).toBe('idleTurnRight');
    });

    it('idleTurn ends and returns to idle once isTurning becomes false', async () => {
      const controller = new PlayerAnimationController({
        playerModelData: createMockPlayerModelData(),
        animationSet: createMockAnimationSet(),
        modelAdapter: createMockAdapter(),
      });

      await advanceTicks(
        controller,
        makeInput({
          isMoving: false,
          simIsMoving: false,
          isTurning: true,
          visualAngle: 0,
          targetAngle: 1024,
        }),
        1,
      );
      expect((controller as any).playerMovementState).toBe('idleTurnRight');

      await advanceTicks(
        controller,
        makeInput({
          isMoving: false,
          simIsMoving: false,
          isTurning: false,
          visualAngle: 1024,
          targetAngle: 1024,
        }),
        1,
      );
      expect((controller as any).playerMovementState).toBe('idle');
    });

    it('falls back to walk for stationary turn when idle turn variants are missing', async () => {
      const animationSet = createMockAnimationSet();
      animationSet.idleTurnLeft = null;
      animationSet.idleTurnRight = null;
      const controller = new PlayerAnimationController({
        playerModelData: createMockPlayerModelData(),
        animationSet,
        modelAdapter: createMockAdapter(),
      });

      await advanceTicks(
        controller,
        makeInput({
          isMoving: false,
          simIsMoving: false,
          isTurning: true,
          visualAngle: 0,
          targetAngle: 1024,
        }),
        1,
      );

      expect((controller as any).playerMovementState).toBe('walk');
    });

    it('falls back to idle when moving directional and walk sequences are missing', async () => {
      const animationSet = createMockAnimationSet();
      animationSet.turnLeft = null;
      animationSet.walk = null;
      animationSet.run = null;
      const controller = new PlayerAnimationController({
        playerModelData: createMockPlayerModelData(),
        animationSet,
        modelAdapter: createMockAdapter(),
      });

      await advanceTicks(
        controller,
        makeInput({
          isMoving: true,
          simIsMoving: true,
          isRunning: false,
          visualAngle: 0,
          targetAngle: 1536,
        }),
        1,
      );

      expect((controller as any).playerMovementState).toBe('idle');
    });
  });

  describe('consume animation overrides attack animation', () => {
    it('triggerConsume during attack animation replaces it with eat animation', async () => {
      const controller = new PlayerAnimationController({
        playerModelData: createMockPlayerModelData(),
        animationSet: createMockAnimationSet({ attackFrames: 6, eatFrames: 3 }),
        modelAdapter: createMockAdapter(),
      });

      controller.triggerAttack();
      await advanceTicks(controller, makeInput(), 1);

      expect((controller as any).primaryAnimCompleted).toBe(false);
      expect((controller as any).primarySequence.id).toBe('attack');

      controller.triggerConsume();
      controller.updatePlayerAnimation(makeInput());

      expect((controller as any).primaryAnimCompleted).toBe(false);
      expect((controller as any).primarySequence.id).toBe('eat');
      expect((controller as any).primaryIsConsume).toBe(true);
      expect((controller as any).primaryAnimFrame).toBe(0);
    });

    it('triggerConsume switches to unarmed pose set mid-attack', async () => {
      const controller = new PlayerAnimationController({
        playerModelData: createMockPlayerModelData(),
        animationSet: createMockAnimationSet({ attackFrames: 6, eatFrames: 3 }),
        modelAdapter: createMockAdapter(),
      });

      controller.triggerAttack();
      await advanceTicks(controller, makeInput(), 1);

      expect((controller as any).primaryIsConsume).toBe(false);

      controller.triggerConsume();
      controller.updatePlayerAnimation(makeInput());

      expect((controller as any).primaryIsConsume).toBe(true);
      const activePoseSet = (controller as any).activePoseSet;
      const unarmedSet = (controller as any).animationSet.unarmed;
      expect(activePoseSet).toBe(unarmedSet);
    });
  });

  describe('consume animation survives equipment switch', () => {
    it('getConsumeAnimSnapshot returns state while eat animation is playing', async () => {
      const controller = new PlayerAnimationController({
        playerModelData: createMockPlayerModelData(),
        animationSet: createMockAnimationSet({ eatFrames: 5 }),
        modelAdapter: createMockAdapter(),
      });

      controller.triggerConsume();
      await advanceTicks(controller, makeInput(), 1);

      const snapshot = controller.getConsumeAnimSnapshot();
      expect(snapshot).not.toBeNull();
      expect(snapshot!.primaryAnimFrame).toBe(1);
    });

    it('getConsumeAnimSnapshot returns null when no consume animation is playing', () => {
      const controller = new PlayerAnimationController({
        playerModelData: createMockPlayerModelData(),
        animationSet: createMockAnimationSet(),
        modelAdapter: createMockAdapter(),
      });

      expect(controller.getConsumeAnimSnapshot()).toBeNull();
    });

    it('getConsumeAnimSnapshot returns null during attack animation', async () => {
      const controller = new PlayerAnimationController({
        playerModelData: createMockPlayerModelData(),
        animationSet: createMockAnimationSet({ attackFrames: 6 }),
        modelAdapter: createMockAdapter(),
      });

      controller.triggerAttack();
      await advanceTicks(controller, makeInput(), 1);

      expect(controller.getConsumeAnimSnapshot()).toBeNull();
    });

    it('restoreConsumeAnim resumes eat animation at saved frame on a new controller', async () => {
      const animSet = createMockAnimationSet({ eatFrames: 5 });

      const original = new PlayerAnimationController({
        playerModelData: createMockPlayerModelData(),
        animationSet: animSet,
        modelAdapter: createMockAdapter(),
      });

      original.triggerConsume();
      await advanceTicks(original, makeInput(), 2);

      const snapshot = original.getConsumeAnimSnapshot();
      expect(snapshot).not.toBeNull();

      const replacement = new PlayerAnimationController({
        playerModelData: createMockPlayerModelData(),
        animationSet: animSet,
        modelAdapter: createMockAdapter(),
      });

      expect((replacement as any).primaryAnimCompleted).toBe(true);

      replacement.restoreConsumeAnim(snapshot!);

      expect((replacement as any).primaryAnimCompleted).toBe(false);
      expect((replacement as any).primaryIsConsume).toBe(true);
      expect((replacement as any).primaryAnimFrame).toBe(snapshot!.primaryAnimFrame);
    });

    it('applyInitialAnimationFrame includes eat overlay after restore (no weapon flash)', async () => {
      const adapter = createMockAdapter();
      const applyFrameSpy = vi.fn();
      adapter.applyFrame = applyFrameSpy;

      const animSet = createMockAnimationSet({ eatFrames: 5 });

      const original = new PlayerAnimationController({
        playerModelData: createMockPlayerModelData(),
        animationSet: animSet,
        modelAdapter: createMockAdapter(),
      });

      original.triggerConsume();
      await advanceTicks(original, makeInput(), 1);
      const snapshot = original.getConsumeAnimSnapshot();
      expect(snapshot).not.toBeNull();

      const replacement = new PlayerAnimationController({
        playerModelData: createMockPlayerModelData(),
        animationSet: animSet,
        modelAdapter: adapter,
      });

      replacement.restoreConsumeAnim(snapshot!);
      applyFrameSpy.mockClear();
      replacement.applyInitialAnimationFrame();

      const eatFrameId = animSet.eat!.frameIds[snapshot!.primaryAnimFrame];
      expect(applyFrameSpy).toHaveBeenCalledWith(eatFrameId);
    });

    it('restoreConsumeAnim is a no-op if snapshot frame exceeds new eat sequence length', () => {
      const controller = new PlayerAnimationController({
        playerModelData: createMockPlayerModelData(),
        animationSet: createMockAnimationSet({ eatFrames: 2 }),
        modelAdapter: createMockAdapter(),
      });

      controller.restoreConsumeAnim({
        primaryAnimFrame: 10,
        primaryAnimFrameTick: 0,
        primaryAnimTickAccumulatorMs: 0,
      });

      expect((controller as any).primaryAnimCompleted).toBe(true);
    });
  });

  describe('setSorterProjection invalidates pose cache (on camera rotation)', () => {
    function createSortableModel(): ModelData {
      const model = new ModelData();
      model.faceCount = 2;
      model.verticesCount = 6;
      model.usedVertexCount = 6;
      model.verticesX = new Int32Array([0, 100, 0, 200, 300, 200]);
      model.verticesY = new Int32Array([0, 0, 0, 0, 0, 0]);
      model.verticesZ = new Int32Array([0, 0, 100, 0, 0, 100]);
      model.indices1 = new Int32Array([0, 3]);
      model.indices2 = new Int32Array([1, 4]);
      model.indices3 = new Int32Array([2, 5]);
      return model;
    }

    it('setSorterProjection sets projectionDirty so next updatePlayerAnimation rebuilds mesh', async () => {
      const adapter = createMockAdapter();
      const commitPoseSpy = vi.fn();
      adapter.commitPose = commitPoseSpy;

      const controller = new PlayerAnimationController({
        playerModelData: createMockPlayerModelData({
          mergedModel: createSortableModel(),
          litColors: {
            faceColors1: new Int32Array([100, 200]),
            faceColors2: new Int32Array([101, 201]),
            faceColors3: new Int32Array([102, 202]),
          },
          weaponShieldFaceMask: new Uint8Array([0, 0]),
        }),
        animationSet: createMockAnimationSet(),
        modelAdapter: adapter,
      });

      // Prime the time tracking so subsequent calls don't early-return
      await advanceTicks(controller, makeInput(), 1);
      expect((controller as any).lastPoseKey).not.toBeNull();
      expect((controller as any).projectionDirty).toBe(false);

      controller.setSorterProjection({
        cameraX: 0,
        cameraY: 0,
        cameraZ: -5000,
        yawSin: 0,
        yawCos: 1,
        pitchSin: 0,
        pitchCos: 1,
        orientation: 0,
        modelX: 0,
        modelY: 0,
        modelZ: 0,
      });
      expect((controller as any).projectionDirty).toBe(true);
      // lastPoseKey is preserved — only face sorting changes, not the pose
      expect((controller as any).lastPoseKey).not.toBeNull();

      commitPoseSpy.mockClear();
      await advanceTicks(controller, makeInput(), 1);
      expect((controller as any).projectionDirty).toBe(false);
    });

    it('setSorterProjection(null) also sets projectionDirty', () => {
      const controller = new PlayerAnimationController({
        playerModelData: createMockPlayerModelData({
          mergedModel: createSortableModel(),
          litColors: {
            faceColors1: new Int32Array([100, 200]),
            faceColors2: new Int32Array([101, 201]),
            faceColors3: new Int32Array([102, 202]),
          },
          weaponShieldFaceMask: new Uint8Array([0, 0]),
        }),
        animationSet: createMockAnimationSet(),
        modelAdapter: createMockAdapter(),
      });

      controller.applyInitialAnimationFrame();
      expect((controller as any).lastPoseKey).not.toBeNull();

      // First set a non-null projection so clearing to null is a real change
      controller.setSorterProjection({
        cameraX: 0,
        cameraY: 0,
        cameraZ: -5000,
        yawSin: 0,
        yawCos: 1,
        pitchSin: 0,
        pitchCos: 1,
        orientation: 0,
        modelX: 0,
        modelY: 0,
        modelZ: 0,
      });
      // Clear the dirty flag from the initial set
      (controller as any).projectionDirty = false;

      controller.setSorterProjection(null);
      expect((controller as any).projectionDirty).toBe(true);
      // lastPoseKey is preserved — projection change doesn't invalidate pose
      expect((controller as any).lastPoseKey).not.toBeNull();
    });

    it('rebuilds transparent sorting immediately when the posed model height changes', () => {
      const adapter = createMockAdapter();
      const controller = new PlayerAnimationController({
        playerModelData: createMockPlayerModelData({
          mergedModel: createSortableModel(),
          litColors: {
            faceColors1: new Int32Array([100, 200]),
            faceColors2: new Int32Array([101, 201]),
            faceColors3: new Int32Array([102, 202]),
          },
          weaponShieldFaceMask: new Uint8Array([0, 0]),
        }),
        animationSet: createMockAnimationSet(),
        modelAdapter: adapter,
      });
      controller.setSorterProjection({
        cameraX: 0,
        cameraY: 0,
        cameraZ: -5000,
        yawSin: 0,
        yawCos: 1,
        pitchSin: 0,
        pitchCos: 1,
        orientation: 0,
        modelX: 0,
        modelY: 0,
        modelZ: 0,
      });
      controller.updatePlayerAnimation(makeInput({ deltaMs: 0 }));
      const buildMeshSpy = vi.spyOn(controller, 'buildPlayerAnimatedMesh');

      controller.refreshSorterModelY(-29);

      expect(buildMeshSpy).toHaveBeenCalledTimes(1);
    });
  });

  describe('buildPlayerAnimatedMesh returns null on empty face sort (no flash)', () => {
    it('returns null when all faces are near-plane clipped', () => {
      // Vertices at OSRS position 0,0,0 — camera also at ~0,0,0 → depth < 50 → empty sort
      const model = {
        faceCount: 1,
        verticesCount: 3,
        verticesX: new Int32Array([0, 10, 0]),
        verticesY: new Int32Array([0, 0, 0]),
        verticesZ: new Int32Array([0, 0, 10]),
        indices1: new Int32Array([0]),
        indices2: new Int32Array([1]),
        indices3: new Int32Array([2]),
        normals: null,
        faceRenderPriorities: null,
        priority: 0,
        faceAlphas: null,
        faceBias: null,
        calculateVertexNormals() {},
      };

      const controller = new PlayerAnimationController({
        playerModelData: createMockPlayerModelData({
          mergedModel: model as any,
          litColors: {
            faceColors1: new Int32Array([100]),
            faceColors2: new Int32Array([101]),
            faceColors3: new Int32Array([102]),
          },
          weaponShieldFaceMask: new Uint8Array([0]),
        }),
        animationSet: createMockAnimationSet(),
        modelAdapter: createMockAdapter(),
      });

      // Set projection with camera at same position as model → near-plane clip
      controller.setSorterProjection({
        cameraX: 0,
        cameraY: 0,
        cameraZ: 0,
        yawSin: 0,
        yawCos: 1,
        pitchSin: 0,
        pitchCos: 1,
        orientation: 0,
        modelX: 0,
        modelY: 0,
        modelZ: 0,
      });

      controller.updatePlayerAnimation(makeInput());
      const mesh = controller.buildPlayerAnimatedMesh();
      // Must return null (not empty arrays) so renderer keeps previous frame
      expect(mesh).toBeNull();
    });

    it('returns valid mesh when projection is null (no-camera fallback path)', () => {
      const model = {
        faceCount: 1,
        verticesCount: 3,
        verticesX: new Int32Array([0, 100, 0]),
        verticesY: new Int32Array([0, 0, 0]),
        verticesZ: new Int32Array([0, 0, 100]),
        indices1: new Int32Array([0]),
        indices2: new Int32Array([1]),
        indices3: new Int32Array([2]),
        normals: null,
        faceRenderPriorities: null,
        priority: 0,
        faceAlphas: null,
        faceBias: null,
        calculateVertexNormals() {},
      };

      const controller = new PlayerAnimationController({
        playerModelData: createMockPlayerModelData({
          mergedModel: model as any,
          litColors: {
            faceColors1: new Int32Array([100]),
            faceColors2: new Int32Array([101]),
            faceColors3: new Int32Array([102]),
          },
          weaponShieldFaceMask: new Uint8Array([0]),
        }),
        animationSet: createMockAnimationSet(),
        modelAdapter: createMockAdapter(),
      });

      // No projection set (default null)
      controller.updatePlayerAnimation(makeInput());
      const mesh = controller.buildPlayerAnimatedMesh();
      expect(mesh).not.toBeNull();
    });
  });

  describe('buildPlayerAnimatedMesh outputs all 5 buffer arrays', () => {
    it('returns positions, normals, hslColors, alphas, and faceBias', () => {
      const model = {
        faceCount: 1,
        verticesCount: 3,
        verticesX: new Int32Array([0, 100, 0]),
        verticesY: new Int32Array([0, 0, 0]),
        verticesZ: new Int32Array([0, 0, 100]),
        indices1: new Int32Array([0]),
        indices2: new Int32Array([1]),
        indices3: new Int32Array([2]),
        normals: null,
        faceRenderPriorities: null,
        priority: 0,
        faceAlphas: null,
        faceBias: null,
        calculateVertexNormals() {},
      };

      const controller = new PlayerAnimationController({
        playerModelData: createMockPlayerModelData({
          mergedModel: model as any,
          litColors: {
            faceColors1: new Int32Array([100]),
            faceColors2: new Int32Array([101]),
            faceColors3: new Int32Array([102]),
          },
          weaponShieldFaceMask: new Uint8Array([0]),
        }),
        animationSet: createMockAnimationSet(),
        modelAdapter: createMockAdapter(),
      });

      controller.updatePlayerAnimation(makeInput());
      const mesh = controller.buildPlayerAnimatedMesh();
      expect(mesh).not.toBeNull();

      expect(mesh!.opaque!.positions).toBeInstanceOf(Float32Array);
      expect(mesh!.opaque!.normals).toBeInstanceOf(Float32Array);
      expect(mesh!.opaque!.hslColors).toBeInstanceOf(Float32Array);
      expect(mesh!.opaque!.alphas).toBeInstanceOf(Float32Array);
      expect(mesh!.opaque!.faceBias).toBeInstanceOf(Float32Array);

      // 1 face = 3 vertices = 9 position components, 9 normal components
      expect(mesh!.opaque!.positions.length).toBe(9);
      expect(mesh!.opaque!.normals.length).toBe(9);
      // 3 vertices for per-vertex attributes
      expect(mesh!.opaque!.hslColors.length).toBe(3);
      expect(mesh!.opaque!.alphas.length).toBe(3);
      expect(mesh!.opaque!.faceBias.length).toBe(3);
    });

    it('faceBias -1 (no-data sentinel) resolves to 0 instead of 255', () => {
      const model = {
        faceCount: 1,
        verticesCount: 3,
        verticesX: new Int32Array([0, 100, 0]),
        verticesY: new Int32Array([0, 0, 0]),
        verticesZ: new Int32Array([0, 0, 100]),
        indices1: new Int32Array([0]),
        indices2: new Int32Array([1]),
        indices3: new Int32Array([2]),
        normals: null,
        faceRenderPriorities: null,
        priority: 0,
        faceAlphas: null,
        faceBias: new Int8Array([-1]), // -1 = no bias data (parser default)
        calculateVertexNormals() {},
      };

      const controller = new PlayerAnimationController({
        playerModelData: createMockPlayerModelData({
          mergedModel: model as any,
          litColors: {
            faceColors1: new Int32Array([100]),
            faceColors2: new Int32Array([101]),
            faceColors3: new Int32Array([102]),
          },
          weaponShieldFaceMask: new Uint8Array([0]),
        }),
        animationSet: createMockAnimationSet(),
        modelAdapter: createMockAdapter(),
      });

      controller.updatePlayerAnimation(makeInput());
      const mesh = controller.buildPlayerAnimatedMesh();
      expect(mesh).not.toBeNull();
      // faceBias -1 must resolve to 0 (no Z offset), NOT 255 (& 0xff)
      // which would add ~2.0 to clip-space Z and break depth testing
      expect(Array.from(mesh!.opaque!.faceBias)).toEqual([0, 0, 0]);
    });

    it('faceBias positive values are preserved via & 0xff', () => {
      const model = {
        faceCount: 1,
        verticesCount: 3,
        verticesX: new Int32Array([0, 100, 0]),
        verticesY: new Int32Array([0, 0, 0]),
        verticesZ: new Int32Array([0, 0, 100]),
        indices1: new Int32Array([0]),
        indices2: new Int32Array([1]),
        indices3: new Int32Array([2]),
        normals: null,
        faceRenderPriorities: null,
        priority: 0,
        faceAlphas: null,
        faceBias: new Int8Array([3]), // actual bias value
        calculateVertexNormals() {},
      };

      const controller = new PlayerAnimationController({
        playerModelData: createMockPlayerModelData({
          mergedModel: model as any,
          litColors: {
            faceColors1: new Int32Array([100]),
            faceColors2: new Int32Array([101]),
            faceColors3: new Int32Array([102]),
          },
          weaponShieldFaceMask: new Uint8Array([0]),
        }),
        animationSet: createMockAnimationSet(),
        modelAdapter: createMockAdapter(),
      });

      controller.updatePlayerAnimation(makeInput());
      const mesh = controller.buildPlayerAnimatedMesh();
      expect(mesh).not.toBeNull();
      expect(Array.from(mesh!.opaque!.faceBias)).toEqual([3, 3, 3]);
    });

    it('opaque face has alpha 1.0 when faceAlphas is null', () => {
      const model = {
        faceCount: 1,
        verticesCount: 3,
        verticesX: new Int32Array([0, 100, 0]),
        verticesY: new Int32Array([0, 0, 0]),
        verticesZ: new Int32Array([0, 0, 100]),
        indices1: new Int32Array([0]),
        indices2: new Int32Array([1]),
        indices3: new Int32Array([2]),
        normals: null,
        faceRenderPriorities: null,
        priority: 0,
        faceAlphas: null,
        faceBias: null,
        calculateVertexNormals() {},
      };

      const controller = new PlayerAnimationController({
        playerModelData: createMockPlayerModelData({
          mergedModel: model as any,
          litColors: {
            faceColors1: new Int32Array([100]),
            faceColors2: new Int32Array([101]),
            faceColors3: new Int32Array([102]),
          },
          weaponShieldFaceMask: new Uint8Array([0]),
        }),
        animationSet: createMockAnimationSet(),
        modelAdapter: createMockAdapter(),
      });

      controller.updatePlayerAnimation(makeInput());
      const mesh = controller.buildPlayerAnimatedMesh();
      expect(mesh).not.toBeNull();
      expect(Array.from(mesh!.opaque!.alphas)).toEqual([1.0, 1.0, 1.0]);
    });

    it('per-vertex hslColors match litColors faceColors1/2/3 for each vertex', () => {
      const model = {
        faceCount: 1,
        verticesCount: 3,
        verticesX: new Int32Array([0, 100, 0]),
        verticesY: new Int32Array([0, 0, 0]),
        verticesZ: new Int32Array([0, 0, 100]),
        indices1: new Int32Array([0]),
        indices2: new Int32Array([1]),
        indices3: new Int32Array([2]),
        normals: null,
        faceRenderPriorities: null,
        priority: 0,
        faceAlphas: null,
        faceBias: null,
        calculateVertexNormals() {},
      };

      const controller = new PlayerAnimationController({
        playerModelData: createMockPlayerModelData({
          mergedModel: model as any,
          litColors: {
            faceColors1: new Int32Array([1000]),
            faceColors2: new Int32Array([2000]),
            faceColors3: new Int32Array([3000]),
          },
          weaponShieldFaceMask: new Uint8Array([0]),
        }),
        animationSet: createMockAnimationSet(),
        modelAdapter: createMockAdapter(),
      });

      controller.updatePlayerAnimation(makeInput());
      const mesh = controller.buildPlayerAnimatedMesh();
      expect(mesh).not.toBeNull();
      // vertex 0 gets faceColors1, vertex 1 gets faceColors2, vertex 2 gets faceColors3
      expect(Array.from(mesh!.opaque!.hslColors)).toEqual([1000, 2000, 3000]);
    });

    it('faceColors3 === -1 triggers flat shading (all 3 vertices use faceColors1)', () => {
      const model = {
        faceCount: 1,
        verticesCount: 3,
        verticesX: new Int32Array([0, 100, 0]),
        verticesY: new Int32Array([0, 0, 0]),
        verticesZ: new Int32Array([0, 0, 100]),
        indices1: new Int32Array([0]),
        indices2: new Int32Array([1]),
        indices3: new Int32Array([2]),
        normals: null,
        faceRenderPriorities: null,
        priority: 0,
        faceAlphas: null,
        faceBias: null,
        calculateVertexNormals() {},
      };

      const controller = new PlayerAnimationController({
        playerModelData: createMockPlayerModelData({
          mergedModel: model as any,
          litColors: {
            faceColors1: new Int32Array([5000]),
            faceColors2: new Int32Array([6000]),
            faceColors3: new Int32Array([-1]),
          },
          weaponShieldFaceMask: new Uint8Array([0]),
        }),
        animationSet: createMockAnimationSet(),
        modelAdapter: createMockAdapter(),
      });

      controller.updatePlayerAnimation(makeInput());
      const mesh = controller.buildPlayerAnimatedMesh();
      expect(mesh).not.toBeNull();
      // faceColors3 === -1 → all three vertices get faceColors1 value
      expect(Array.from(mesh!.opaque!.hslColors)).toEqual([5000, 5000, 5000]);
    });
  });

  describe('face re-sort changes buffer content without changing length (no flicker)', () => {
    // Length-based dirty detection would skip GPU uploads when face sort
    // order changes (camera rotation) but face count stays the same, flickering because
    // positions would not match their hslColors/alphas/faceBias.

    function createTwoFaceModel() {
      // Two triangles at different Z depths so sorting reorders them.
      // Both have X/Y variation for non-zero projected area (avoids backface cull).
      // Winding is CCW when viewed from camera looking along +Z axis.
      // Face 0: near (Z=0), avg Y ≈ 33
      // Face 1: far (Z=500), avg Y ≈ -4967
      //
      // The large Y difference between faces allows a pitch rotation to reverse
      // depth order: without pitch, Z dominates (face 0 nearer); with pitch,
      // face 1's large negative Y pulls its depth much closer to the camera.
      return {
        faceCount: 2,
        verticesCount: 6,
        verticesX: new Int32Array([0, 50, 100, 0, 50, 100]),
        verticesY: new Int32Array([0, 100, 0, -5000, -4900, -5000]),
        verticesZ: new Int32Array([0, 0, 0, 500, 500, 500]),
        indices1: new Int32Array([0, 3]),
        indices2: new Int32Array([1, 4]),
        indices3: new Int32Array([2, 5]),
        normals: null,
        faceRenderPriorities: null,
        priority: 0,
        faceAlphas: null,
        faceBias: null,
        calculateVertexNormals() {},
      };
    }

    it('changing projection reorders faces: same buffer lengths, different content', () => {
      const controller = new PlayerAnimationController({
        playerModelData: createMockPlayerModelData({
          mergedModel: createTwoFaceModel() as any,
          litColors: {
            // Distinct colors per face so we can detect reordering
            faceColors1: new Int32Array([1000, 2000]),
            faceColors2: new Int32Array([1001, 2001]),
            faceColors3: new Int32Array([1002, 2002]),
          },
          weaponShieldFaceMask: new Uint8Array([0, 0]),
        }),
        animationSet: createMockAnimationSet(),
        modelAdapter: createMockAdapter(),
      });

      // Set camera looking from +Z (face 1 at Z=500 is farther)
      controller.setSorterProjection({
        cameraX: 50,
        cameraY: 0,
        cameraZ: -5000,
        yawSin: 0,
        yawCos: 1,
        pitchSin: 0,
        pitchCos: 1,
        orientation: 0,
        modelX: 50,
        modelY: 0,
        modelZ: 250,
      });
      controller.updatePlayerAnimation(makeInput());
      const meshA = controller.buildPlayerAnimatedMesh();
      expect(meshA).not.toBeNull();

      const hslA = Array.from(meshA!.opaque!.hslColors);
      const posA = Array.from(meshA!.opaque!.positions);
      const alphaA = Array.from(meshA!.opaque!.alphas);
      const biasA = Array.from(meshA!.opaque!.faceBias);

      // Apply a downward pitch to reverse face depth order while keeping both front-facing.
      // With pitchSin=0 (setup A), depth ≈ Z distance: face 0 (Z=0) nearer, face 1 (Z=500) farther.
      // With pitchSin=0.3 (setup B), depth = rz*0.954 + dy*0.3: face 1's large negative Y (-5000)
      // reduces its depth dramatically, making it nearer than face 0.
      // Both faces remain front-facing because pitch rotation doesn't flip screen-space winding.
      controller.setSorterProjection({
        cameraX: 50,
        cameraY: 0,
        cameraZ: -5000,
        yawSin: 0,
        yawCos: 1,
        pitchSin: 0.3,
        pitchCos: 0.954,
        orientation: 0,
        modelX: 50,
        modelY: 0,
        modelZ: 250,
      });
      controller.updatePlayerAnimation(makeInput());
      const meshB = controller.buildPlayerAnimatedMesh();
      expect(meshB).not.toBeNull();

      const hslB = Array.from(meshB!.opaque!.hslColors);
      const posB = Array.from(meshB!.opaque!.positions);
      const alphaB = Array.from(meshB!.opaque!.alphas);
      const biasB = Array.from(meshB!.opaque!.faceBias);

      // CRITICAL: Buffer lengths must be identical (same number of faces)
      expect(hslA.length).toBe(hslB.length);
      expect(posA.length).toBe(posB.length);
      expect(alphaA.length).toBe(alphaB.length);
      expect(biasA.length).toBe(biasB.length);

      // CRITICAL: Buffer content must differ (faces are reordered by depth sort)
      // If a renderer only checks length to decide whether to re-upload, it will
      // skip the upload and cause flickering.
      // At least hslColors must differ since the two faces have distinct colors.
      expect(hslA).not.toEqual(hslB);

      // Positions must also differ since the two faces have different Z coordinates
      expect(posA).not.toEqual(posB);
    });

    it('all 5 attribute arrays stay internally consistent after re-sort', () => {
      const controller = new PlayerAnimationController({
        playerModelData: createMockPlayerModelData({
          mergedModel: createTwoFaceModel() as any,
          litColors: {
            faceColors1: new Int32Array([1000, 2000]),
            faceColors2: new Int32Array([1001, 2001]),
            faceColors3: new Int32Array([1002, 2002]),
          },
          weaponShieldFaceMask: new Uint8Array([0, 0]),
        }),
        animationSet: createMockAnimationSet(),
        modelAdapter: createMockAdapter(),
      });

      // Set some projection so sorting is active
      controller.setSorterProjection({
        cameraX: 50,
        cameraY: 0,
        cameraZ: -5000,
        yawSin: 0,
        yawCos: 1,
        pitchSin: 0,
        pitchCos: 1,
        orientation: 0,
        modelX: 50,
        modelY: 0,
        modelZ: 250,
      });
      controller.updatePlayerAnimation(makeInput());
      const mesh = controller.buildPlayerAnimatedMesh();
      expect(mesh).not.toBeNull();

      const opaque = mesh!.opaque!;
      const numVertices = opaque.positions.length / 3;

      // Each per-vertex attribute array must have exactly numVertices entries
      expect(opaque.hslColors.length).toBe(numVertices);
      expect(opaque.alphas.length).toBe(numVertices);
      expect(opaque.faceBias.length).toBe(numVertices);
      expect(opaque.normals.length).toBe(numVertices * 3);

      // Verify the hslColors contain values from both faces (not duplicated from one)
      const hslSet = new Set(Array.from(opaque.hslColors));
      // 2 faces x 3 vertices each = 6 vertices, at least 2 distinct hsl values
      expect(hslSet.size).toBeGreaterThanOrEqual(2);
    });
  });
});

describe('PlayerAnimationController flinch (block) arbitration', () => {
  /**
   * Real OSRS cache values (seq config opcode 5, the field the arbitration compares).
   * Every player weapon attack seq explicitly sets `forcedPriority` 6 —
   * `human_sword_slash` (390), `human_bow` (426), `scythe_of_vitur_attack` (8056),
   * `human_atlatl_attack_ranged_01` (11057). Every block seq omits opcode 5 and
   * falls back to the default 5 — `human_unarmedblock` (424),
   * `human_shield_defence` (1156), `human_staff_block` (415),
   * `human_scythe_block` (435). So a flinch can never cut off an attack.
   */
  function createFlinchAnimationSet(): PlayerAnimationSet {
    const animationSet = createMockAnimationSet({ attackFrames: 6 });
    animationSet.attack = createSequence('attack', 6, 1400, 6);
    animationSet.block = createSequence('block', 3, 2000, 5);
    return animationSet;
  }

  function createFlinchController(animationSet: PlayerAnimationSet): PlayerAnimationController {
    return new PlayerAnimationController({
      playerModelData: createMockPlayerModelData(),
      animationSet,
      modelAdapter: createMockAdapter(),
    });
  }

  it('discards the flinch while an attack animation is still playing', async () => {
    const controller = createFlinchController(createFlinchAnimationSet());

    controller.triggerAttack();
    await advanceTicks(controller, makeInput(), 1);
    expect(controller.getFrameState()?.seqId).toBe('attack');

    // Hit lands one client tick into the 6-tick attack clip.
    controller.triggerBlock();
    await advanceTicks(controller, makeInput(), 1);

    expect(controller.getFrameState()?.seqId).toBe('attack');
  });

  it('plays the flinch when no attack animation is active', async () => {
    const controller = createFlinchController(createFlinchAnimationSet());

    controller.triggerBlock();
    await advanceTicks(controller, makeInput(), 1);

    expect(controller.getFrameState()?.seqId).toBe('block');
  });

  it('plays the flinch once the attack animation has finished', async () => {
    const controller = createFlinchController(createFlinchAnimationSet());

    controller.triggerAttack();
    // 6 frames x 1 client tick each — run it out so the primary slot empties.
    await advanceTicks(controller, makeInput(), 7);
    expect(controller.getFrameState()?.seqId).toBe('idle');

    controller.triggerBlock();
    await advanceTicks(controller, makeInput(), 1);

    expect(controller.getFrameState()?.seqId).toBe('block');
  });

  it('lets an attack interrupt a flinch that is still playing', async () => {
    const controller = createFlinchController(createFlinchAnimationSet());

    controller.triggerBlock();
    await advanceTicks(controller, makeInput(), 1);
    expect(controller.getFrameState()?.seqId).toBe('block');

    controller.triggerAttack();
    await advanceTicks(controller, makeInput(), 1);

    expect(controller.getFrameState()?.seqId).toBe('attack');
  });

  it('ignores the flinch when the equipped weapon resolved no block clip', async () => {
    const animationSet = createFlinchAnimationSet();
    animationSet.block = null;
    const controller = createFlinchController(animationSet);

    controller.triggerBlock();
    await advanceTicks(controller, makeInput(), 1);

    expect(controller.getFrameState()?.seqId).toBe('idle');
  });

  describe('intro remaining time', () => {
    it('counts down the intro frames still to play, to the moment the intro completes', () => {
      const controller = new PlayerAnimationController({
        playerModelData: createMockPlayerModelData(),
        animationSet: createMockAnimationSet(),
        modelAdapter: createMockAdapter(),
      });
      const intro = { ...createSequence('intro', 3, 2000), looping: false, frameLengths: [3, 5, 2] };
      expect(controller.getIntroRemainingAnimMs()).toBeNull();

      controller.enqueueSignal({ type: 'intro', overrideSequence: intro });
      controller.updatePlayerAnimation({ ...makeInput(), deltaMs: 0 });
      expect(controller.getIntroRemainingAnimMs()).toBe(10 * CLIENT_TICK_MS);

      // One client tick in, and part of the next.
      controller.updatePlayerAnimation({ ...makeInput(), deltaMs: CLIENT_TICK_MS + 10 });
      expect(controller.getIntroRemainingAnimMs()).toBe(9 * CLIENT_TICK_MS - 10);

      controller.updatePlayerAnimation({ ...makeInput(), deltaMs: 9 * CLIENT_TICK_MS - 11 });
      expect(controller.isIntroAnimComplete()).toBe(false);
      expect(controller.getIntroRemainingAnimMs()).toBe(1);
      controller.updatePlayerAnimation({ ...makeInput(), deltaMs: 1 });
      expect(controller.isIntroAnimComplete()).toBe(true);
      expect(controller.getIntroRemainingAnimMs()).toBeNull();
    });
  });
});
