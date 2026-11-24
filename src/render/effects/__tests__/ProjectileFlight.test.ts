import { describe, expect, it } from 'vitest';
import { MAX_REPLAY_PROJECTILE_STEPS, ReplaySafetyError } from '../../../core/replaySafety';
import type { RenderQueue } from '../../core/commands';
import { ProjectileFlight, type ProjectileFlightConfig, type ProjectileFlightFrame } from '../ProjectileFlight';
import { advanceProjectileMotion } from '../projectileMotion';
import { ReplayProjectileWork } from '../replayProjectileWork';
import { SpotAnimRenderer } from '../SpotAnimRenderer';

const config: ProjectileFlightConfig = {
  instanceId: 'flight',
  spotAnimId: 450,
  startCycle: 10,
  endCycleExclusive: 50,
  startOffset: 64,
  slope: 16,
  animationLoop: 'frame-step',
  heightOffsetMode: 'actor',
};
const frame: ProjectileFlightFrame = {
  cycle: 10,
  source: { worldX: 0, worldY: 0, resolvedOsrsZ: -128, heightOffset: 256 },
  target: { worldX: 10, worldY: 0, resolvedOsrsZ: -128, heightOffset: 128 },
};

function rendererFixture() {
  const renderer = new SpotAnimRenderer();
  renderer['meshCache'].set(450, {
    static: [
      {
        meshId: 'projectile',
        materialId: 'osrs-npc',
        positions: new Float32Array([0, 0, 0, 1, 0, 0, 0, 0, -1]),
        depth: 'readwrite',
      },
    ],
    frames: [],
    frameLengths: [2, 3, 5],
    frameStep: 2,
    heightOffset: 128,
  });
  return renderer;
}

describe('ProjectileFlight', () => {
  it('requires sorting and back-face culling for an arbitrary flight graphic', () => {
    const renderer = rendererFixture();
    const flight = new ProjectileFlight(config);

    flight.update(renderer, frame);

    expect(renderer['activeInstances'].get('flight')?.style).toEqual({
      cullFace: 'back',
      requireTransparentSort: true,
    });
  });

  it('spawns its graphic as a projectile, for Entity Hider to leave out', () => {
    const renderer = rendererFixture();

    new ProjectileFlight(config).update(renderer, frame);

    expect(renderer['activeInstances'].get('flight')?.projectile).toBe(true);
  });

  it('preserves caller style overrides above flight defaults', () => {
    const renderer = rendererFixture();
    const style = { cullFace: 'none', requireTransparentSort: false, depthBias: 0.25, zIndex: 7 } as const;
    const flight = new ProjectileFlight({ ...config, style });

    flight.update(renderer, frame);

    expect(renderer['activeInstances'].get('flight')?.style).toEqual(style);
  });

  it.each([
    { start: 3e16, end: 3e16 + 32, destination: 3e16 + 4, reason: 'invalid-clock' },
    { start: 10, end: 3e9 + 100, destination: 3e9, reason: 'projectile-work-limit' },
    { start: 10, end: 50, destination: Infinity, reason: 'invalid-clock' },
    { start: 10, end: 50, destination: 3e16, reason: 'invalid-clock' },
    { start: 10.5, end: 50, destination: 20, reason: 'invalid-clock' },
    { start: 10, end: 9, destination: 10, reason: 'invalid-clock' },
    { start: 10, end: Infinity, destination: 10, reason: 'invalid-clock' },
    { start: NaN, end: 10, destination: 10, reason: 'invalid-clock' },
  ] as const)('rejects $reason before sampling or mutation ($start / $destination)', ({
    start,
    end,
    destination,
    reason,
  }) => {
    const flight = new ProjectileFlight({ ...config, startCycle: start, endCycleExclusive: end });
    let calls = 0;
    const frameAt = (cycle: number) => {
      if (++calls > 64) throw new TypeError('Guarded excessive sampling');
      return { ...frame, cycle };
    };

    expect(() => flight.updateReplay(rendererFixture(), destination, frameAt)).toThrowError(
      new ReplaySafetyError(
        reason,
        reason === 'projectile-work-limit'
          ? { actual: destination - start + 2, limit: MAX_REPLAY_PROJECTILE_STEPS }
          : {},
      ),
    );
    expect(calls).toBe(0);
    expect(flight['motion']).toBeNull();
    expect(flight['cycle']).toBe(start);
  });

  it.each([0, 9, 10, 10.5, 11])('expires an empty flight without sampling or drawing at cycle %s', (cycle) => {
    const flight = new ProjectileFlight({ ...config, endCycleExclusive: config.startCycle });
    const renderer = rendererFixture();
    const work = new ReplayProjectileWork();
    work.charge(MAX_REPLAY_PROJECTILE_STEPS);

    expect(flight.update(renderer, { ...frame, cycle })).toBe('expired');
    expect(
      flight.updateReplay(
        renderer,
        cycle,
        () => {
          throw new Error('Empty flight sampled');
        },
        work,
      ),
    ).toBe('expired');
    const queue: RenderQueue = { replayPresentationReady: true, commands: [] };
    renderer.render(queue);

    expect(queue.commands).toEqual([]);
    expect(flight['motion']).toBeNull();
  });

  it('retains every whole-history sample and only temporarily samples the fractional tail', () => {
    const flight = new ProjectileFlight(config);
    const samples: number[] = [];
    const frameAt = (cycle: number) => {
      samples.push(cycle);
      return { ...frame, cycle, target: { ...frame.target, worldY: cycle } };
    };
    flight.updateReplay(rendererFixture(), 12.5, frameAt);
    const motion = flight['motion'];
    expect(samples).toEqual([10, 11, 12, 12.5]);
    expect(flight['cycle']).toBe(12);
    samples.length = 0;

    flight.updateReplay(rendererFixture(), 12.75, frameAt);

    expect(samples).toEqual([12.75]);
    expect(flight['motion']).toBe(motion);
    expect(flight['cycle']).toBe(12);
  });

  it('expires before catch-up even when the unsampled interval is billions of cycles', () => {
    const flight = new ProjectileFlight({ ...config, endCycleExclusive: 3e9 });
    const samples: number[] = [];

    const status = flight.updateReplay(rendererFixture(), 3e9, (cycle) => {
      if (samples.length > 1) throw new TypeError('Expired flight caught up');
      samples.push(cycle);
      return { ...frame, cycle };
    });

    expect(status).toBe('expired');
    expect(samples).toEqual([3e9]);
    expect(flight['motion']).toBeNull();
  });

  it.each([
    10, 3e12,
  ])('accepts a distant unused expiry and a fractional destination after safe start %s', (startCycle) => {
    const flight = new ProjectileFlight({ ...config, startCycle, endCycleExclusive: startCycle + 3e9 });
    const samples: number[] = [];

    const status = flight.updateReplay(rendererFixture(), startCycle + 2.5, (cycle) => {
      samples.push(cycle);
      return { ...frame, cycle };
    });

    expect(status).toBe('active');
    expect(samples).toEqual([startCycle, startCycle + 1, startCycle + 2, startCycle + 2.5]);
    expect(flight['cycle']).toBe(startCycle + 2);
  });

  it('rejects a non-progressing sampler without looping or mutating motion', () => {
    const flight = new ProjectileFlight(config);
    let calls = 0;
    const frameAt = () => {
      if (++calls > 64) throw new TypeError('Guarded non-progressing sampler');
      return { ...frame, cycle: 0 };
    };

    expect(() => flight.updateReplay(rendererFixture(), 20, frameAt)).toThrowError(
      new ReplaySafetyError('invalid-clock'),
    );
    expect(calls).toBe(1);
    expect(flight['motion']).toBeNull();
  });

  it.each([
    { destination: 12.5, required: 4 },
    { destination: 9, required: 1 },
    { destination: 50, required: 1 },
  ])('charges exactly $required samples at $destination, including pending/expired updates', ({
    destination,
    required,
  }) => {
    const flight = new ProjectileFlight(config);
    const work = new ReplayProjectileWork();
    work.charge(MAX_REPLAY_PROJECTILE_STEPS - required);
    let samples = 0;
    flight.updateReplay(
      rendererFixture(),
      destination,
      (cycle) => {
        samples++;
        return { ...frame, cycle };
      },
      work,
    );

    expect(samples).toBe(required);
    expect(() => work.charge(1)).toThrowError(
      new ReplaySafetyError('projectile-work-limit', {
        actual: MAX_REPLAY_PROJECTILE_STEPS + 1,
        limit: MAX_REPLAY_PROJECTILE_STEPS,
      }),
    );
  });

  it('reconstructs backwards from the original start instead of retaining later motion', () => {
    const renderer = rendererFixture();
    const flight = new ProjectileFlight(config);
    const reference = new ProjectileFlight(config);
    const frameAt = (cycle: number) => ({ ...frame, cycle, target: { ...frame.target, worldY: cycle } });
    flight.updateReplay(renderer, 40, frameAt);
    flight.updateReplay(renderer, 12.5, frameAt);
    reference.updateReplay(renderer, 12.5, frameAt);

    expect(flight['motion']).toEqual(reference['motion']);
    expect(flight['cycle']).toBe(12);
  });

  it('restores the whole-cycle motion even when drawing the temporary fractional tail throws', () => {
    const renderer = rendererFixture();
    const flight = new ProjectileFlight(config);
    const frameAt = (cycle: number) => ({ ...frame, cycle });
    flight.updateReplay(renderer, 12, frameAt);
    const motion = flight['motion'];
    const error = new TypeError('Renderer failed');
    renderer.upsert = () => {
      throw error;
    };

    expect(() => flight.updateReplay(renderer, 12.5, frameAt)).toThrow(error);
    expect(flight['motion']).toBe(motion);
    expect(flight['cycle']).toBe(12);
  });

  it.each([9, 10, 49.9, 50, 100])('samples only the explicit active interval at cycle %s', (cycle) => {
    const flight = new ProjectileFlight(config);

    const sample = flight.sample({ ...frame, cycle });

    expect(sample.kind).toBe(cycle < 10 ? 'pending' : cycle < 50 ? 'active' : 'expired');
  });

  it('solves arrival at endtime when the absolute packet end is the exclusive boundary', () => {
    const flight = new ProjectileFlight(config);
    const sample = flight.sample(frame);
    if (sample.kind !== 'active') expect.fail('Expected active flight');

    const arrival = advanceProjectileMotion(sample.motion, 50 - 10);

    expect(arrival.position.x).toBeCloseTo(10, 12);
    expect(arrival.position.y).toBeCloseTo(0, 12);
    expect(arrival.position.z).toBeCloseTo(2, 12);
  });

  it.each([50, 50.5, 51])('emits no mesh when a loaded flight is sampled at or after endtime: %s', (cycle) => {
    const flight = new ProjectileFlight(config);
    const renderer = rendererFixture();
    flight.update(renderer, { ...frame, cycle: 49.5 });

    const status = flight.update(renderer, { ...frame, cycle });
    renderer.tick(Math.floor(cycle / 30), cycle / 30);
    const queue: RenderQueue = { replayPresentationReady: true, commands: [] };
    renderer.render(queue);

    expect(status).toBe('expired');
    expect(queue.commands).toEqual([]);
  });

  it('initializes from the first active endpoints rather than pending endpoints', () => {
    const flight = new ProjectileFlight(config);
    flight.sample({ ...frame, cycle: 9 });

    const sample = flight.sample({ ...frame, source: { ...frame.source, worldX: 2 } });

    if (sample.kind !== 'active') expect.fail('Expected active flight');
    expect(sample.motion.position).toEqual({ x: 2.5, y: 0, z: 3 });
  });

  it('keeps the entire sample unchanged when the same cycle resolves different endpoints', () => {
    const flight = new ProjectileFlight(config);
    const before = flight.sample({ ...frame, cycle: 30 });

    const held = flight.sample({ ...frame, cycle: 30, target: { ...frame.target, worldY: 20 } });

    expect(held).toEqual(before);
  });

  it('re-aims from current position and vertical velocity when a target moves', () => {
    const flight = new ProjectileFlight(config);
    const before = flight.sample({ ...frame, cycle: 30 });
    if (before.kind !== 'active') expect.fail('Expected active flight');
    const target = { ...frame.target, worldY: 20, heightOffset: 512 };

    const after = flight.sample({ ...frame, cycle: 30.001, target });

    if (after.kind !== 'active') expect.fail('Expected active flight');
    expect(after.motion.position.x).toBeCloseTo(
      before.motion.position.x + ((10 - before.motion.position.x) / 20) * 0.001,
      10,
    );
    expect(after.motion.position.y).toBeCloseTo(0.001, 10);
    const acceleration = (2 * (5 - before.motion.position.z - before.motion.velocity.z * 20)) / 400;
    expect(after.motion.position.z).toBeCloseTo(
      before.motion.position.z + before.motion.velocity.z * 0.001 + (acceleration * 0.001 ** 2) / 2,
      10,
    );
    expect(after.motion.velocity.z).toBeCloseTo(before.motion.velocity.z + acceleration * 0.001, 10);
  });

  it.each([
    [10, 0, 128],
    [0, 10, 128],
    [-10, 0, 128],
    [0, -10, 128],
    [10, 10, 768],
    [10, -10, -256],
  ])('aligns the real renderer native -Z head with velocity toward %j', (worldX, worldY, heightOffset) => {
    const flight = new ProjectileFlight(config);
    const renderer = rendererFixture();
    const input = { ...frame, cycle: 30, target: { ...frame.target, worldX, worldY, heightOffset } };

    flight.update(renderer, input);
    const sample = flight.sample(input);
    renderer.tick(1, 1);
    const queue: RenderQueue = { replayPresentationReady: true, commands: [] };
    renderer.render(queue);

    if (sample.kind !== 'active') expect.fail('Expected active flight');
    const mesh = queue.commands[0];
    if (mesh?.kind !== 'mesh3d') expect.fail('Expected projectile mesh');
    const velocity = sample.motion.velocity;
    const head = Array.from(mesh.modelMatrix.slice(8, 11), (value) => -value);
    const alignment =
      (head[0] * velocity.x + head[1] * velocity.y + head[2] * velocity.z) /
      Math.hypot(...head) /
      Math.hypot(velocity.x, velocity.y, velocity.z);
    expect(alignment).toBeCloseTo(1, 6);
  });

  it('advances while unloaded and resumes animation at elapsed time when cache becomes ready', () => {
    const flight = new ProjectileFlight(config);
    const renderer = rendererFixture();
    const cache = renderer['meshCache'].get(450);
    if (!cache) expect.fail('Expected fixture cache');
    renderer['meshCache'].delete(450);
    flight.update(renderer, { ...frame, cycle: 20 });
    const before = flight.sample({ ...frame, cycle: 20 });
    renderer['meshCache'].set(450, cache);

    flight.update(renderer, { ...frame, cycle: 21, target: { ...frame.target, worldY: 20 } });

    const instance = renderer['activeInstances'].get('flight');
    if (before.kind !== 'active' || instance?.transform.kind !== 'static') expect.fail('Expected active flight');
    expect(instance.transform.value.position[0]).toBeCloseTo(
      before.motion.position.x + (10 - before.motion.position.x) / 30,
    );
    expect(instance.transform.value.position[1]).toBeCloseTo(20 / 30);
    expect(instance.frameProgress).toBeCloseTo(0.3);
  });

  it.each([
    { animationLoop: 'full-sequence', expected: 0.1 },
    { animationLoop: 'frame-step', expected: 0.3 },
  ] as const)('uses $animationLoop animation independently of flight duration', ({ animationLoop, expected }) => {
    const flight = new ProjectileFlight({ ...config, animationLoop });
    const renderer = rendererFixture();

    flight.update(renderer, { ...frame, cycle: 21 });

    expect(renderer['activeInstances'].get('flight')?.frameProgress).toBeCloseTo(expected);
  });

  it.each([-1, 0, 4])('loops all frames when cache frameStep %s has no valid tail', (frameStep) => {
    const flight = new ProjectileFlight(config);
    const renderer = rendererFixture();
    const cache = renderer['meshCache'].get(450);
    if (!cache) expect.fail('Expected fixture cache');
    cache.frameStep = frameStep;

    flight.update(renderer, { ...frame, cycle: 21 });

    expect(renderer['activeInstances'].get('flight')?.frameProgress).toBeCloseTo(0.1);
  });

  it.each([
    { animationLoop: 'full-sequence', expected: 0.5 },
    { animationLoop: 'frame-step', expected: 0 },
  ] as const)('preserves $animationLoop progress fallback when cache has no animation', ({
    animationLoop,
    expected,
  }) => {
    const flight = new ProjectileFlight({ ...config, animationLoop });
    const renderer = rendererFixture();
    const cache = renderer['meshCache'].get(450);
    if (!cache) expect.fail('Expected fixture cache');
    cache.frameLengths = [];

    flight.update(renderer, { ...frame, cycle: 30 });

    expect(renderer['activeInstances'].get('flight')?.frameProgress).toBe(expected);
  });

  it('removes a drawn instance at the exclusive end even when its cache is unavailable', () => {
    const flight = new ProjectileFlight(config);
    const renderer = rendererFixture();
    flight.update(renderer, frame);
    renderer['meshCache'].delete(450);

    const status = flight.update(renderer, { ...frame, cycle: 50 });

    expect(status).toBe('expired');
    expect(renderer['activeInstances'].size).toBe(0);
  });
});
