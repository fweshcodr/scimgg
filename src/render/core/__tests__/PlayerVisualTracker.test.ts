import { describe, expect, it } from 'vitest';
import type { Coordinate } from '../../../types/simulation';
import { PlayerVisualTracker } from '../interpolation';

const CLIENT_CYCLE_MS = 20;

describe('PlayerVisualTracker bounded queue draining', () => {
  it.each([0, 1, 2])('settles every step when a normal tick supplies %s steps', (count) => {
    const tracker = new PlayerVisualTracker(0, 0);
    tracker.facingAngle = 1536;
    const path = Array.from({ length: count }, (_, index): Coordinate => [index + 1, 0]);

    tracker.enqueueTickMovement(1, path, true);
    const state = tracker.advance(640, 1);

    expect(state.position).toEqual([count, 0]);
    expect(state.simIsMoving).toBe(false);
  });

  it.each(['coincident', 'teleport'] as const)('drains a large %s path without recursive calls', (kind) => {
    const tracker = new PlayerVisualTracker(0, 0);
    const retarget = tracker['retargetToPathHead'].bind(tracker);
    let depth = 0;
    tracker['retargetToPathHead'] = () => {
      if (++depth > 128) expect.fail('Queue draining recursed');
      try {
        retarget();
      } finally {
        depth--;
      }
    };
    const path = Array.from(
      { length: 16384 },
      (_, index): Coordinate => [kind === 'teleport' ? (index + 1) * 4 : 0, 0],
    );

    tracker.enqueueTickMovement(1, path, false);
    const state = tracker.advance(20, 1);

    expect(state.position).toEqual(path.at(-1));
    expect(state.simIsMoving).toBe(false);
    expect(state.isRunning).toBe(false);
  });

  it('reads queue entries linearly when draining a coincident prefix', () => {
    const tracker = new PlayerVisualTracker(0, 0);
    let reads = 0;
    tracker['pathQueue'] = new Proxy(tracker['pathQueue'], {
      get(target, property, receiver) {
        if (typeof property === 'string' && /^\d+$/.test(property)) {
          if (++reads > 4096) expect.fail('Queue draining exceeded linear work budget');
        }
        return Reflect.get(target, property, receiver);
      },
    });
    const path = Array.from({ length: 512 }, (): Coordinate => [0, 0]);
    path.push([1, 0]);

    tracker.enqueueTickMovement(1, path, false);

    expect(reads).toBeLessThan(4 * path.length);
    expect(tracker.advance(20, 1).position).toEqual([2 / 128, 0]);
  });

  it('retains multi-tick backlog and queue-dependent speeds after a primary animation releases it', () => {
    const tracker = new PlayerVisualTracker(0, 0);
    tracker.facingAngle = 1536;
    tracker.setPrimaryAnimBlocking(true, true);
    for (let tick = 1; tick <= 4; tick++) tracker.enqueueTickMovement(tick, [[tick, 0]], false);
    const blocked = tracker.advance(20, 1);
    expect(blocked.position).toEqual([0, 0]);
    tracker.setPrimaryAnimBlocking(false, false);

    const states = [320, 320, 640, 640].map((delta) => tracker.advance(delta, 1));

    expect(states.map((state) => state.position)).toEqual([
      [1, 0],
      [1.75, 0],
      [2.8333333333333335, 0],
      [3.8333333333333335, 0],
    ]);
    expect(states.every((state) => state.simIsMoving)).toBe(true);
  });
});

describe('PlayerVisualTracker - turning direction', () => {
  it('facingAngle targets _targetAngle when not forced', () => {
    const tracker = new PlayerVisualTracker(5, 5);

    tracker.enqueueTickMovement(1, [[6, 5]], false);

    let state = tracker.advance(CLIENT_CYCLE_MS, 1);
    expect(state.simIsMoving).toBe(true);

    const initialFacingAngle = state.facingAngle;

    for (let i = 0; i < 10; i++) {
      state = tracker.advance(CLIENT_CYCLE_MS, 1);
    }

    expect(state.facingAngle).toBeDefined();
    expect(state.targetAngle).toBeDefined();
    expect(state.facingAngle).not.toBe(initialFacingAngle);
  });

  it('clearing forcedFacingAngle does not snap facingAngle', () => {
    const tracker = new PlayerVisualTracker(5, 5);

    tracker.setForcedFacingAngle(1024);

    for (let i = 0; i < 5; i++) {
      tracker.advance(CLIENT_CYCLE_MS, 1);
    }

    let state = tracker.advance(CLIENT_CYCLE_MS, 1);

    tracker.setForcedFacingAngle(null);
    tracker.enqueueTickMovement(2, [[5, 4]], false);

    state = tracker.advance(CLIENT_CYCLE_MS, 1);
    expect(state.facingAngle).not.toBe(state.targetAngle);

    for (let i = 0; i < 10; i++) {
      state = tracker.advance(CLIENT_CYCLE_MS, 1);
    }

    expect(state.facingAngle).toBeDefined();
  });

  it('uses forced facing as render turn target during active path interaction', () => {
    const tracker = new PlayerVisualTracker(5, 5);
    tracker.facingAngle = 1024;
    tracker.enqueueTickMovement(1, [[5, 6]], false);
    tracker.setInteracting(true);
    tracker.setForcedFacingAngle(0);

    const state = tracker.advance(CLIENT_CYCLE_MS, 1);

    expect(state.simIsMoving).toBe(true);
    expect(state.targetAngle).toBe(0);
    expect(state.isTurning).toBe(true);
    expect(state.facingAngle).not.toBe(1024);
  });

  it('simIsMoving reflects active queued path', () => {
    const tracker = new PlayerVisualTracker(5, 5);

    tracker.enqueueTickMovement(1, [[6, 5]], false);
    let state = tracker.advance(CLIENT_CYCLE_MS, 1);
    expect(state.simIsMoving).toBe(true);

    for (let i = 0; i < 5; i++) {
      state = tracker.advance(CLIENT_CYCLE_MS, 1);
    }

    tracker.enqueueTickMovement(2, [], false);
    state = tracker.advance(CLIENT_CYCLE_MS, 1);
    expect(state.simIsMoving).toBe(true);

    for (let i = 0; i < 80 && state.simIsMoving; i++) {
      state = tracker.advance(CLIENT_CYCLE_MS, 1);
    }
    expect(state.simIsMoving).toBe(false);
  });

  it('reports locomotionState from the targetAngle - facingAngle (target - visual) bucket while sim path is active', () => {
    const tracker = new PlayerVisualTracker(5, 5);
    tracker.facingAngle = 0;
    tracker.enqueueTickMovement(1, [[6, 6]], false);

    const state = tracker.advance(CLIENT_CYCLE_MS, 1);

    expect(state.simIsMoving).toBe(true);
    const delta = (state.targetAngle - state.facingAngle) & 2047;
    const signed = delta > 1024 ? delta - 2048 : delta;
    const expectedBucket =
      signed >= -256 && signed <= 256
        ? 'walk'
        : signed > 256 && signed < 768
          ? 'turnRight'
          : signed < -256 && signed >= -768
            ? 'turnLeft'
            : 'walkBack';
    expect(state.locomotionState).toBe(expectedBucket);
    expect(state.locomotionState).toBe('turnLeft');
  });

  it('isRunning reflects run-tier speed (>= 8), not only path flag', () => {
    const walkTracker = new PlayerVisualTracker(5, 5);
    walkTracker.facingAngle = 1536;
    walkTracker.enqueueTickMovement(1, [[6, 5]], false);
    let state = walkTracker.advance(CLIENT_CYCLE_MS, 1);
    expect(state.isRunning).toBe(false);

    const runTracker = new PlayerVisualTracker(5, 5);
    runTracker.facingAngle = 1536;
    runTracker.enqueueTickMovement(1, [[6, 5]], true);
    state = runTracker.advance(CLIENT_CYCLE_MS, 1);
    expect(state.isRunning).toBe(true);
  });

  it('advance scales interpolation by speedMultiplier', () => {
    const trackerSlow = new PlayerVisualTracker(5, 5);
    trackerSlow.enqueueTickMovement(1, [[6, 5]], false);
    const slowState = trackerSlow.advance(CLIENT_CYCLE_MS, 1);

    const trackerFast = new PlayerVisualTracker(5, 5);
    trackerFast.enqueueTickMovement(1, [[6, 5]], false);
    const fastState = trackerFast.advance(CLIENT_CYCLE_MS, 2);

    expect(fastState.position[0]).toBeGreaterThan(slowState.position[0]);
  });

  it('carries positive Y-axis leftover into the next path segment', () => {
    const tracker = new PlayerVisualTracker(5, 5);
    tracker.facingAngle = 1024;
    tracker.enqueueTickMovement(
      1,
      [
        [5, 6],
        [5, 7],
      ],
      false,
    );

    const state = tracker.advance(CLIENT_CYCLE_MS, 100);

    expect(state.position[0]).toBe(5);
    expect(state.position[1]).toBe(7);
    expect(state.isVisuallyMoving).toBe(false);
  });

  it('locomotion bucket stays coherent with visible facing when interaction ends mid-move', () => {
    const tracker = new PlayerVisualTracker(5, 5);
    tracker.facingAngle = 0;
    tracker.enqueueTickMovement(1, [[6, 5]], false);
    tracker.setInteracting(true);
    tracker.setForcedFacingAngle(1024);

    for (let i = 0; i < 5; i++) {
      tracker.advance(CLIENT_CYCLE_MS, 1);
    }

    tracker.setInteracting(false);
    tracker.setForcedFacingAngle(null);
    tracker.enqueueTickMovement(2, [[7, 5]], false);

    let state = tracker.advance(CLIENT_CYCLE_MS, 1);

    if (state.locomotionState !== null) {
      const facingDelta = (state.targetAngle - state.facingAngle) & 2047;
      const signedFacingDelta = facingDelta > 1024 ? facingDelta - 2048 : facingDelta;

      if (signedFacingDelta >= -256 && signedFacingDelta <= 256) {
        expect(state.locomotionState).toBe('walk');
      }
    }

    for (let i = 0; i < 20; i++) {
      state = tracker.advance(CLIENT_CYCLE_MS, 1);
    }
    expect(state.isTurning).toBe(false);
  });

  it('locomotionState is non-null during active multi-tile movement on long frames', () => {
    const tracker = new PlayerVisualTracker(5, 5);
    tracker.facingAngle = 1536;
    tracker.enqueueTickMovement(
      1,
      [
        [6, 5],
        [7, 5],
        [8, 5],
      ],
      false,
    );

    const state = tracker.advance(CLIENT_CYCLE_MS * 5, 1);

    if (state.simIsMoving) {
      expect(state.locomotionState).not.toBeNull();
    }
  });

  it('multi-tile queue is not fully drained to idle on a single long frame', () => {
    const tracker = new PlayerVisualTracker(5, 5);
    tracker.facingAngle = 1536;
    tracker.enqueueTickMovement(
      1,
      [
        [6, 5],
        [7, 5],
        [8, 5],
        [9, 5],
      ],
      false,
    );

    const state = tracker.advance(CLIENT_CYCLE_MS * 2, 1);

    expect(state.simIsMoving).toBe(true);
    expect(state.locomotionState).not.toBeNull();
    expect(state.isVisuallyMoving).toBe(true);
  });
});

describe('PlayerVisualTracker - forced facing drives the single visual angle (target/visual model)', () => {
  it('forced facing rotates facingAngle to the target regardless of setTargetAngle, and the post-attack move penalty is identical', () => {
    const makeTracker = (callSetTargetAngle: boolean): PlayerVisualTracker => {
      const t = new PlayerVisualTracker(31, 37);
      t.facingAngle = 1536; // facing east
      t.enqueueTickMovement(1, [], false);
      if (callSetTargetAngle) t.setTargetAngle(0); // south (boss)
      t.setInteracting(true);
      t.setForcedFacingAngle(0);
      for (let i = 0; i < 30; i++) t.advance(CLIENT_CYCLE_MS, 1);
      return t;
    };

    const withTarget = makeTracker(true);
    const withoutTarget = makeTracker(false);

    expect(withTarget.facingAngle).toBe(0);
    expect(withoutTarget.facingAngle).toBe(0);

    const stepEast = (t: PlayerVisualTracker): number => {
      t.enqueueTickMovement(
        2,
        [
          [32, 37],
          [33, 37],
        ],
        true,
      );
      t.setInteracting(false);
      t.setForcedFacingAngle(null);
      return t.advance(CLIENT_CYCLE_MS, 1).position[0];
    };
    expect(stepEast(withTarget)).toBe(stepEast(withoutTarget));
  });
});

describe('PlayerVisualTracker - animation movement blocking', () => {
  it('blocks visual movement when primary animation blocks running', () => {
    const tracker = new PlayerVisualTracker(31, 37);
    tracker.facingAngle = 0;

    tracker.enqueueTickMovement(
      1,
      [
        [32, 37],
        [33, 37],
      ],
      true,
    );
    tracker.setInteracting(false);

    tracker.setPrimaryAnimBlocking(true, true);

    const startState = tracker.advance(CLIENT_CYCLE_MS, 1);
    const startPos = startState.position;

    for (let i = 0; i < 29; i++) {
      tracker.advance(CLIENT_CYCLE_MS, 1);
    }

    const blockedState = tracker.advance(CLIENT_CYCLE_MS, 1);
    expect(blockedState.position[0]).toBeCloseTo(startPos[0], 2);
    expect(blockedState.position[1]).toBeCloseTo(startPos[1], 2);

    tracker.setPrimaryAnimBlocking(false, false);

    const catchUpState = tracker.advance(CLIENT_CYCLE_MS * 5, 1);
    expect(catchUpState.position[0]).not.toBeCloseTo(startPos[0], 1);
  });

  it('accumulates movementDelay per client cycle, not per tick', () => {
    const tracker = new PlayerVisualTracker(31, 37);
    tracker.facingAngle = 0;

    tracker.enqueueTickMovement(
      1,
      [
        [32, 37],
        [33, 37],
      ],
      true,
    );
    tracker.setPrimaryAnimBlocking(true, true);

    for (let i = 0; i < 10; i++) {
      tracker.advance(CLIENT_CYCLE_MS, 1);
    }

    tracker.setPrimaryAnimBlocking(false, false);

    for (let i = 0; i < 5; i++) {
      tracker.advance(CLIENT_CYCLE_MS, 1);
    }

    // The player should still be catching up (movementDelay > 0)
    // meaning speed is 8, which with running means speed 16 → _isRunning = true
    const state = tracker.advance(CLIENT_CYCLE_MS, 1);
    expect(state.isRunning).toBe(true);
  });
});

describe('PlayerVisualTracker - attack → move turning penalty', () => {
  it('applies turning penalty immediately after a ground click cancels attack interaction', () => {
    const tracker = new PlayerVisualTracker(31, 37);
    tracker.facingAngle = 0;

    tracker.enqueueTickMovement(1, [], true);
    tracker.setTargetAngle(0);
    tracker.setInteracting(true);
    tracker.setForcedFacingAngle(0);
    tracker.advance(CLIENT_CYCLE_MS, 1);

    tracker.enqueueTickMovement(2, [[32, 37]], true);
    tracker.setInteracting(false);
    tracker.setForcedFacingAngle(null);

    const state = tracker.advance(CLIENT_CYCLE_MS, 1);

    // The pending interaction clear must not suppress OSRS's turn penalty.
    // Walk turning speed is 2 sub-units/cycle, doubled to 4 while running.
    expect(state.position[0]).toBe(31 + 4 / 128);
  });

  it('facing tracks forced facing during interaction, then movement pays the normal (target - visual) turn penalty', () => {
    // During the attack the single visual angle is pulled to the boss (south). When the
    // player then walks east, cycle 1 sees target(east) != visual(south), not interacting, so the
    // OSRS turn penalty (speed 2) applies: +2/128 tile this cycle.
    const tracker = new PlayerVisualTracker(31, 37);
    tracker.facingAngle = 1536; // facing east

    tracker.enqueueTickMovement(1, [], false);
    tracker.setTargetAngle(0); // south (boss direction)
    tracker.setInteracting(true);
    tracker.setForcedFacingAngle(0);

    for (let i = 0; i < 30; i++) {
      tracker.advance(CLIENT_CYCLE_MS, 1);
    }
    expect(tracker.facingAngle).toBe(0);

    tracker.enqueueTickMovement(2, [[32, 37]], false);
    tracker.setInteracting(false);
    tracker.setForcedFacingAngle(null);

    const state = tracker.advance(CLIENT_CYCLE_MS, 1);
    expect(state.simIsMoving).toBe(true);
    expect(state.position[0]).toBeCloseTo(31 + 2 / 128, 5);
  });

  it('full combat cycle: turn away, attack, move — no excessive turn penalty', () => {
    const tracker = new PlayerVisualTracker(31, 37);
    tracker.facingAngle = 1024; // facing north (away from boss)

    tracker.enqueueTickMovement(1, [], false);
    tracker.setTargetAngle(0); // south (boss)
    tracker.setInteracting(true);
    tracker.setForcedFacingAngle(0);

    for (let i = 0; i < 30; i++) {
      tracker.advance(CLIENT_CYCLE_MS, 1);
    }

    tracker.enqueueTickMovement(
      2,
      [
        [32, 37],
        [33, 37],
      ],
      true,
    );
    tracker.setInteracting(false);
    tracker.setForcedFacingAngle(null);

    let state = tracker.advance(CLIENT_CYCLE_MS, 1);
    expect(state.simIsMoving).toBe(true);
    const startPos = state.position[0];

    for (let i = 0; i < 20; i++) {
      state = tracker.advance(CLIENT_CYCLE_MS, 1);
    }

    expect(state.position[0]).toBeGreaterThan(startPos);
  });
});

describe('PlayerVisualTracker - movementDelay accumulation rate', () => {
  it('movementDelay increments once per 20ms client cycle while blocked', () => {
    const tracker = new PlayerVisualTracker(31, 37);
    tracker.facingAngle = 0;

    tracker.enqueueTickMovement(
      1,
      [
        [32, 37],
        [33, 37],
      ],
      true,
    );
    tracker.setPrimaryAnimBlocking(true, true);

    for (let i = 0; i < 10; i++) {
      tracker.advance(CLIENT_CYCLE_MS, 1);
    }

    tracker.setPrimaryAnimBlocking(false, false);

    let state = tracker.advance(CLIENT_CYCLE_MS, 1);
    const posAfter1 = state.position[0];

    for (let i = 0; i < 9; i++) {
      state = tracker.advance(CLIENT_CYCLE_MS, 1);
    }

    const posAfter10 = state.position[0];
    expect(posAfter10).toBeGreaterThan(posAfter1);
  });

  it('blocked movement produces zero visual displacement', () => {
    const tracker = new PlayerVisualTracker(31, 37);
    tracker.facingAngle = 0;

    tracker.enqueueTickMovement(1, [[32, 37]], false);
    tracker.setPrimaryAnimBlocking(true, true);

    const initialState = tracker.advance(CLIENT_CYCLE_MS, 1);
    const initialPos = initialState.position;

    for (let i = 0; i < 29; i++) {
      tracker.advance(CLIENT_CYCLE_MS, 1);
    }

    const blockedState = tracker.advance(CLIENT_CYCLE_MS, 1);

    expect(blockedState.position[0]).toBeCloseTo(initialPos[0], 4);
    expect(blockedState.position[1]).toBeCloseTo(initialPos[1], 4);
  });

  it('catch-up after blocking moves player faster than normal', () => {
    const trackerA = new PlayerVisualTracker(31, 37);
    trackerA.facingAngle = 1536; // east
    trackerA.enqueueTickMovement(
      1,
      [
        [32, 37],
        [33, 37],
        [34, 37],
      ],
      true,
    );

    let stateA = trackerA.advance(CLIENT_CYCLE_MS, 1);
    for (let i = 0; i < 9; i++) {
      stateA = trackerA.advance(CLIENT_CYCLE_MS, 1);
    }
    const posA = stateA.position[0];

    const trackerB = new PlayerVisualTracker(31, 37);
    trackerB.facingAngle = 1536; // east
    trackerB.enqueueTickMovement(
      1,
      [
        [32, 37],
        [33, 37],
        [34, 37],
      ],
      true,
    );
    trackerB.setPrimaryAnimBlocking(true, true);

    for (let i = 0; i < 10; i++) {
      trackerB.advance(CLIENT_CYCLE_MS, 1);
    }

    trackerB.setPrimaryAnimBlocking(false, false);
    let stateB = trackerB.advance(CLIENT_CYCLE_MS, 1);
    for (let i = 0; i < 9; i++) {
      stateB = trackerB.advance(CLIENT_CYCLE_MS, 1);
    }
    const posB = stateB.position[0];

    expect(posB).toBeGreaterThanOrEqual(posA);
  });
});

describe('PlayerVisualTracker - OSRS turning penalty during movementDelay catch-up', () => {
  it('applies turning penalty on delayed one-tile run when movementDelay cannot catch up', () => {
    // OSRS only overrides catch-up speed when movementDelay > 0 AND pathLength > 1.
    // A delayed one-tile run must still pay the turning penalty: speed 2, doubled to 4.
    const tracker = new PlayerVisualTracker(31, 37);
    tracker.facingAngle = 0; // south (from attack)

    tracker.enqueueTickMovement(1, [[32, 37]], true);
    tracker.setInteracting(false);

    tracker.setPrimaryAnimBlocking(true, true);
    tracker.advance(CLIENT_CYCLE_MS, 1);

    tracker.setPrimaryAnimBlocking(false, false);
    const state = tracker.advance(CLIENT_CYCLE_MS, 1);

    expect(state.position[0]).toBeCloseTo(31 + 4 / 128, 5);
  });

  it('uses catch-up speed on delayed multi-tile run before the last tile', () => {
    // While pathQueue.length > 1, OSRS catch-up overrides the turning penalty.
    const tracker = new PlayerVisualTracker(31, 37);
    tracker.facingAngle = 0; // south (from attack)

    tracker.enqueueTickMovement(
      1,
      [
        [32, 37],
        [33, 37],
      ],
      true,
    );
    tracker.setInteracting(false);

    tracker.setPrimaryAnimBlocking(true, true);
    for (let i = 0; i < 10; i++) {
      tracker.advance(CLIENT_CYCLE_MS, 1);
    }

    tracker.setPrimaryAnimBlocking(false, false);

    for (let i = 0; i < 20; i++) {
      tracker.advance(CLIENT_CYCLE_MS, 1);
    }

    const state = tracker.advance(CLIENT_CYCLE_MS, 1);

    expect(state.position[0]).toBeGreaterThanOrEqual(32.5);
  });

  it('turning penalty still applies when movementDelay is 0 (no prior blocking)', () => {
    const tracker = new PlayerVisualTracker(31, 37);
    tracker.facingAngle = 0; // south

    tracker.enqueueTickMovement(1, [[32, 37]], false);
    tracker.setInteracting(false);

    const state = tracker.advance(CLIENT_CYCLE_MS, 1);

    // With turning penalty (speed 2), after 1 cycle the player moves 2 sub-units out of 128.
    expect(state.position[0] - 31).toBeLessThan(0.1);
  });
});

describe('PlayerVisualTracker - walk→attack→run locomotion state', () => {
  it('facing keeps stepping during animation blocking, so locomotion resolves to walk on release', () => {
    // Rotation is decoupled from movement. While a primary animation blocks position, the
    // single visual angle still steps toward the move direction, so when movement resumes
    // (target - visual) ~ 0 -> 'walk', not a stale turn.
    const tracker = new PlayerVisualTracker(31, 37);
    tracker.facingAngle = 1536; // east (from prior walk)

    tracker.enqueueTickMovement(1, [], false);
    tracker.setTargetAngle(0); // face south (boss)
    tracker.setInteracting(true);
    tracker.setForcedFacingAngle(0);
    for (let i = 0; i < 30; i++) {
      tracker.advance(CLIENT_CYCLE_MS, 1);
    }

    tracker.enqueueTickMovement(
      2,
      [
        [32, 37],
        [33, 37],
      ],
      true,
    );
    tracker.setInteracting(false);
    tracker.setForcedFacingAngle(null);
    tracker.setPrimaryAnimBlocking(true, true);

    // 16 blocked cycles: facing steps from south (0) toward east (1536) = 512 / 32 = 16.
    for (let i = 0; i < 16; i++) {
      tracker.advance(CLIENT_CYCLE_MS, 1);
    }

    tracker.setPrimaryAnimBlocking(false, false);
    const state = tracker.advance(CLIENT_CYCLE_MS, 1);

    expect(state.facingAngle).toBe(state.targetAngle);
    expect(state.locomotionState).toBe('walk');
    expect(state.isRunning).toBe(true);
  });

  it('short blocking still shows a transient turn before facing catches up', () => {
    // With only a few blocked cycles the visual angle has not reached the move direction,
    // so (target - visual) is still a large negative delta -> 'turnLeft' briefly, while catch-up
    // keeps the run flag set.
    const tracker = new PlayerVisualTracker(31, 37);
    tracker.facingAngle = 0; // south (from attack)

    tracker.enqueueTickMovement(
      1,
      [
        [32, 37],
        [33, 37],
      ],
      true,
    );
    tracker.setPrimaryAnimBlocking(true, true);

    tracker.advance(CLIENT_CYCLE_MS, 1);
    tracker.advance(CLIENT_CYCLE_MS, 1);

    tracker.setPrimaryAnimBlocking(false, false);
    const state = tracker.advance(CLIENT_CYCLE_MS, 1);

    expect(state.locomotionState).toBe('turnLeft');
    expect(state.isRunning).toBe(true);
  });
});

describe('PlayerVisualTracker - two-angle (target/visual) parity', () => {
  it('applies the walk turn penalty when target != visual and suppresses it while interacting (claims 1, 8)', () => {
    // Not interacting: facing south (0), walk east (target=1536) -> visual != target -> speed 2.
    const turning = new PlayerVisualTracker(31, 37);
    turning.facingAngle = 0;
    turning.enqueueTickMovement(1, [[32, 37]], false);
    turning.setInteracting(false);
    const s1 = turning.advance(CLIENT_CYCLE_MS, 1);
    expect(s1.position[0]).toBeCloseTo(31 + 2 / 128, 5);

    // Interacting: same geometry, but the turn penalty is suppressed -> full speed 4.
    const interacting = new PlayerVisualTracker(31, 37);
    interacting.facingAngle = 0;
    interacting.enqueueTickMovement(1, [[32, 37]], false);
    interacting.setInteracting(true);
    const s2 = interacting.advance(CLIENT_CYCLE_MS, 1);
    expect(s2.position[0]).toBeCloseTo(31 + 4 / 128, 5);
  });

  it('derives locomotionState from the (target - visual) bucket for each turn direction (claims 2, 9)', () => {
    const cases: Array<[number, string]> = [
      [0, 'walk'],
      [512, 'turnRight'],
      [1536, 'turnLeft'],
      [1024, 'walkBack'],
    ];
    for (const [forced, expected] of cases) {
      const tracker = new PlayerVisualTracker(5, 5);
      tracker.facingAngle = 0; // visual angle = 0
      tracker.enqueueTickMovement(
        1,
        [
          [6, 5],
          [7, 5],
          [8, 5],
          [9, 5],
        ],
        false,
      );
      tracker.setForcedFacingAngle(forced); // target = forced facing
      const state = tracker.advance(CLIENT_CYCLE_MS, 1);
      expect(state.targetAngle).toBe(forced);
      expect(state.locomotionState).toBe(expected);
    }
  });

  it('position interpolation does not change the target angle across sub-cycle frames (claims 3, 10)', () => {
    // Position interpolation never writes the target angle. Advancing in many small sub-cycle
    // steps must not drift it.
    const tracker = new PlayerVisualTracker(5, 5);
    tracker.facingAngle = 0;
    tracker.enqueueTickMovement(1, [[6, 6]], false); // diagonal step, target angle 1280
    const initial = tracker.advance(1, 1).targetAngle;
    expect(initial).toBe(1280);
    for (let i = 0; i < 200; i++) {
      const s = tracker.advance(1, 1);
      if (s.simIsMoving) {
        expect(s.targetAngle).toBe(1280);
      }
    }
  });

  it('steps the visual angle by turnSpeed (32) per cycle and snaps within one step (claim 4)', () => {
    const tracker = new PlayerVisualTracker(5, 5);
    tracker.facingAngle = 0;
    tracker.setForcedFacingAngle(512); // turn target = west (512), a 512-unit turn
    let state = tracker.advance(CLIENT_CYCLE_MS, 1);
    expect(state.facingAngle).toBe(32);
    for (let i = 0; i < 15; i++) {
      state = tracker.advance(CLIENT_CYCLE_MS, 1);
    }
    expect(state.facingAngle).toBe(512);
  });

  it('during interaction with forced facing offset from movement, locomotion is a turn/strafe, not walk (claims 2, 5)', () => {
    // While attacking, the target angle is the boss-facing (forced), not the movement direction, so the
    // locomotion bucket reflects (forcedFacing - visual) -> a strafe/turn, not a forward walk.
    const tracker = new PlayerVisualTracker(5, 5);
    tracker.facingAngle = 1536; // visual angle aligned to east movement
    tracker.enqueueTickMovement(
      1,
      [
        [6, 5],
        [7, 5],
        [8, 5],
      ],
      true,
    );
    tracker.setInteracting(true);
    tracker.setForcedFacingAngle(512); // facing west (boss), offset from move dir
    const state = tracker.advance(CLIENT_CYCLE_MS, 1);
    expect(state.simIsMoving).toBe(true);
    expect(state.targetAngle).toBe(512);
    expect(state.locomotionState).not.toBe('walk');
  });
});

describe('PlayerVisualTracker - diagonal-to-cardinal facing during continuous walking', () => {
  it('turns to the new cardinal direction after diagonal walking (no stuck-SW from a fractional float pop)', () => {
    // Walking several diagonal (SW) tiles builds a ~1-tile visual backlog because a
    // walk crosses 128 sub-units in 32 cycles but a tick is only 30 cycles. When the
    // tile then pops, worldXFloat can sit a hair past the tile (e.g. 768.3). Recomputing
    // the next target angle from that FLOAT would read south (0,-128) as SW (-0.3,-128), so
    // the facing would stick at SW while the player visibly moves south. The tracker
    // recomputes from the tile coords instead.
    const FRAME_MS = 1000 / 60;
    const FRAMES_PER_TICK = Math.round(600 / FRAME_MS);
    const tracker = new PlayerVisualTracker(10, 10);
    tracker.facingAngle = 0;
    // 4 SW tiles (build the backlog), then the first S tile.
    const steps: Array<[number, number]> = [
      [9, 9],
      [8, 8],
      [7, 7],
      [6, 6],
      [6, 5],
    ];
    let state = tracker.advance(0, 1); // initialize state (no-op)
    let tick = 0;
    for (const step of steps) {
      tick++;
      tracker.enqueueTickMovement(tick, [step], false);
      tracker.setInteracting(false);
      tracker.setForcedFacingAngle(null);
      for (let f = 0; f < FRAMES_PER_TICK; f++) {
        state = tracker.advance(FRAME_MS, 1);
      }
    }
    expect(state.targetAngle).toBe(0);
    expect(state.facingAngle).toBe(0);
  });
});

describe('PlayerVisualTracker - tile settle (sub-unit pop residue)', () => {
  it('snaps exactly onto the tile on pop, so a later cardinal walk is not read as a diagonal', () => {
    // The pop only requires trunc(worldXFloat) === tile, so a walk can end at e.g. tile+0.5.
    // If that residue survives the stop, the next walk's retargetToPathHead computes dx=-0.5 and
    // reads south (0,-128) as SW (-0.5,-128). Snapping worldXFloat/worldYFloat to the tile on
    // pop prevents it. We force the residue with a non-frame-aligned advance: 637.5ms =
    // 31.875 cycles * speed 4 = 127.5 of 128 sub-units, so the pop lands at tile+0.5 pre-snap.
    const tracker = new PlayerVisualTracker(10, 10);
    tracker.facingAngle = 256; // SW already (no turn penalty -> speed 4)

    tracker.enqueueTickMovement(1, [[9, 9]], false);
    tracker.setInteracting(false);
    tracker.setForcedFacingAngle(null);
    let state = tracker.advance(637.5, 1);
    // Settled exactly on the tile (would be 9.00390625 = 1152.5/128 without the snap).
    expect(state.position[0]).toBe(9);
    expect(state.position[1]).toBe(9);

    // WAIT (stationary, sim still faces SW), then walk south.
    tracker.enqueueTickMovement(2, [], false);
    tracker.setTargetAngle(256);
    tracker.advance(600, 1);

    tracker.enqueueTickMovement(3, [[9, 8]], false);
    tracker.setInteracting(false);
    tracker.setForcedFacingAngle(null);
    state = tracker.advance(600, 1);

    expect(state.targetAngle).toBe(0);
    expect(state.facingAngle).toBe(0);
  });
});

describe('PlayerVisualTracker steps outside the tick stream', () => {
  it('walks countdown positioning steps at tick 0 and lets tick 1 continue without replaying them', () => {
    const tracker = new PlayerVisualTracker(31, 37);
    tracker.facingAngle = 1024;
    tracker.enqueueTickMovement(0, [], true);

    tracker.enqueueSteps(
      [
        [31, 38],
        [31, 39],
      ],
      true,
    );
    expect(tracker.lastProcessedTick).toBe(0);
    expect(tracker.advance(640, 1).position).toEqual([31, 39]);
    // The tick-0 test the viewport runs every frame stays satisfied: nothing is queued again.
    tracker.enqueueTickMovement(0, [[31, 38]], true);
    expect(tracker.advance(640, 1).position).toEqual([31, 39]);

    tracker.enqueueTickMovement(
      1,
      [
        [31, 40],
        [31, 41],
      ],
      true,
    );
    expect(tracker.lastProcessedTick).toBe(1);
    expect(tracker.advance(640, 1).position).toEqual([31, 41]);
  });
});

describe('PlayerVisualTracker - placement without walking (teleport)', () => {
  // The viewport's per-tick feed: queue the tick's steps, then reconcile with the sim tile.
  function feedTick(tracker: PlayerVisualTracker, tick: number, path: Coordinate[], position: Coordinate, facing = 0) {
    tracker.enqueueTickMovement(tick, path, false);
    const snapped = tracker.snapToUnwalkedPlacement(position, facing);
    if (path.length === 0) tracker.setTargetAngle(facing);
    return snapped;
  }

  it('snaps to a teleport tile and its facing on the tick it happens, keeping the processed tick', () => {
    // Wave 68 -> 69: the intro teleports the player from wherever they stood to [31, 44] facing
    // north with an empty route (previousPosition is the new tile too).
    const tracker = new PlayerVisualTracker(22, 22);
    tracker.facingAngle = 256;
    expect(feedTick(tracker, 26, [], [22, 22], 256)).toBe(false);
    expect(feedTick(tracker, 27, [], [31, 44], 1024)).toBe(true);
    expect(tracker.lastProcessedTick).toBe(27);
    const state = tracker.advance(20, 1);
    expect(state.position).toEqual([31, 44]);
    expect(state.facingAngle).toBe(1024);
    expect(state.simIsMoving).toBe(false);

    // Walking on from the new tile interpolates normally.
    expect(
      feedTick(
        tracker,
        38,
        [
          [31, 43],
          [31, 42],
        ],
        [31, 42],
      ),
    ).toBe(false);
    const walking = tracker.advance(300, 1);
    expect(walking.position[1]).toBeGreaterThan(42);
    expect(walking.position[1]).toBeLessThan(44);
  });

  it('snaps a jump to an adjacent tile too', () => {
    const tracker = new PlayerVisualTracker(10, 10);
    expect(feedTick(tracker, 1, [], [11, 10])).toBe(true);
    expect(tracker.advance(20, 1).position).toEqual([11, 10]);
  });

  it('leaves walking and running mid-interpolation alone', () => {
    const tracker = new PlayerVisualTracker(10, 10);
    expect(
      feedTick(
        tracker,
        1,
        [
          [11, 10],
          [12, 10],
        ],
        [12, 10],
      ),
    ).toBe(false);
    const midRun = tracker.advance(100, 1).position;
    // A still tick while the run is still being drawn: the queue already ends on the sim tile.
    expect(feedTick(tracker, 2, [], [12, 10])).toBe(false);
    expect(tracker.advance(20, 1).position[0]).toBeGreaterThanOrEqual(midRun[0]);
    expect(tracker.advance(2000, 1).position).toEqual([12, 10]);
  });
});
