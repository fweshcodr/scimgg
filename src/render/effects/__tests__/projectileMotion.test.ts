import { describe, expect, it } from 'vitest';
import {
  advanceProjectileMotion,
  aimProjectileMotion,
  createProjectileMotion,
  type ProjectileLaunch,
  type ProjectileMotion,
  projectileDirection,
  projectileEndpoint,
} from '../projectileMotion';

const launch: ProjectileLaunch = {
  source: { worldX: 0, worldY: 0, resolvedOsrsZ: -128, heightOffset: 256 },
  target: { worldX: 10, worldY: 0, resolvedOsrsZ: 0, heightOffset: 128 },
  startOffset: 256,
  slope: 32,
};

describe('projectile motion cycle input domains', () => {
  const invalidHorizons = [0, -1, Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY];

  it.each(invalidHorizons)('rejects creation when horizonCycles is %s', (horizonCycles) => {
    const create = () => createProjectileMotion(launch, horizonCycles);

    expect(create).toThrow(RangeError);
  });

  it.each(invalidHorizons)('rejects re-aiming when horizonCycles is %s', (horizonCycles) => {
    const motion = createProjectileMotion(launch, 4);
    const aim = () => aimProjectileMotion(motion, { x: 8, y: 6, z: 1 }, horizonCycles);

    expect(aim).toThrow(RangeError);
  });

  it.each([
    -1,
    Number.NaN,
    Number.POSITIVE_INFINITY,
    Number.NEGATIVE_INFINITY,
  ])('rejects advancement when elapsedCycles is %s', (elapsedCycles) => {
    const motion = createProjectileMotion(launch, 4);
    const advance = () => advanceProjectileMotion(motion, elapsedCycles);

    expect(advance).toThrow(RangeError);
  });
});

describe('projectile motion boundary-value solution', () => {
  it('converts resolved negative-up height and explicit packet height offset into world Z', () => {
    const endpoint = { worldX: 7.25, worldY: -3.5, resolvedOsrsZ: -256, heightOffset: 124 };

    const point = projectileEndpoint(endpoint);

    expect(point).toEqual({ x: 7.25, y: -3.5, z: 2.96875 });
  });

  it('initializes displacement and slope from explicit packet inputs', () => {
    const motion = createProjectileMotion(launch, 4);

    expect(motion.position).toEqual({ x: 2, y: 0, z: 3 });
    expect(motion.velocity.x).toBe(2);
    expect(motion.velocity.y).toBe(0);
    expect(motion.velocity.z).toBeCloseTo(2, 12);
    expect(motion.verticalAcceleration).toBeCloseTo(-1.25, 12);
  });

  it('integrates a constant-acceleration parabola rather than a fixed arc lift', () => {
    const motion = createProjectileMotion(launch, 4);

    const advanced = advanceProjectileMotion(motion, 1);

    expect(advanced.position.x).toBe(4);
    expect(advanced.position.z).toBeCloseTo(4.375, 12);
    expect(advanced.velocity.z).toBeCloseTo(0.75, 12);
  });

  it('reaches the endpoint after exactly the caller-supplied horizon', () => {
    const motion = createProjectileMotion(launch, 4);

    const arrived = advanceProjectileMotion(motion, 4);

    expect(arrived.position.x).toBe(10);
    expect(arrived.position.y).toBe(0);
    expect(arrived.position.z).toBeCloseTo(1, 12);
  });

  it('preserves position and vertical velocity when a moving target is re-aimed', () => {
    const motion: ProjectileMotion = {
      position: { x: 2, y: 0, z: 3 },
      velocity: { x: 1, y: 0, z: 2 },
      verticalAcceleration: -0.5,
    };

    const aimed = aimProjectileMotion(motion, { x: 8, y: 6, z: 1 }, 3);

    expect(aimed.position).toEqual({ x: 2, y: 0, z: 3 });
    expect(aimed.velocity).toEqual({ x: 2, y: 2, z: 2 });
    expect(aimed.verticalAcceleration).toBeCloseTo(-16 / 9, 12);
  });

  it('reaches a moving target without restarting the launch slope or offset', () => {
    const motion = advanceProjectileMotion(createProjectileMotion(launch, 4), 1);
    const aimed = aimProjectileMotion(motion, { x: 10, y: 6, z: 2 }, 3);

    const arrived = advanceProjectileMotion(aimed, 3);

    expect(arrived.position.x).toBe(10);
    expect(arrived.position.y).toBe(6);
    expect(arrived.position.z).toBeCloseTo(2, 12);
  });

  it('advances neither position nor velocity when a paused caller supplies zero elapsed cycles', () => {
    const motion = createProjectileMotion(launch, 4);

    const paused = advanceProjectileMotion(motion, 0);

    expect(paused).toEqual(motion);
  });

  it('has the same numeric result when elapsed cycles are fractional substeps', () => {
    const motion = createProjectileMotion(launch, 4);

    const advanced = advanceProjectileMotion(advanceProjectileMotion(motion, 0.25), 0.75);

    expect(advanced.position.x).toBe(4);
    expect(advanced.position.z).toBeCloseTo(4.375, 12);
    expect(advanced.velocity.z).toBeCloseTo(0.75, 12);
  });

  it('keeps a coincident horizontal source in place instead of inventing an offset direction', () => {
    const coincident = { ...launch, target: { ...launch.target, worldX: 0 } };

    const motion = createProjectileMotion(coincident, 4);

    expect(motion.position).toEqual({ x: 0, y: 0, z: 3 });
    expect(motion.velocity).toEqual({ x: 0, y: 0, z: 0 });
    expect(motion.verticalAcceleration).toBe(-0.25);
  });

  it('derives world yaw and upward pitch from velocity', () => {
    const motion: ProjectileMotion = {
      position: { x: 0, y: 0, z: 0 },
      velocity: { x: 0, y: 2, z: 2 },
      verticalAcceleration: -1,
    };

    const direction = projectileDirection(motion);

    expect(direction.yawRadians).toBeCloseTo(Math.PI / 2, 12);
    expect(direction.pitchRadians).toBeCloseTo(Math.PI / 4, 12);
  });
});

describe('explicit capture inputs on synthetic flat resolved terrain', () => {
  // capture zuk-atlatl-dragon-hunter-wand-packet-data.txt:208-216 (emission tick 708).
  const jadPackets = [
    { id: 448, starttime: 2, endtime: 26, expectedYAt20: 5348.6875 },
    { id: 449, starttime: 6, endtime: 30, expectedYAt20: 5349.145833333333 },
    { id: 450, starttime: 10, endtime: 36, expectedYAt20: 5349.692307692308 },
  ] as const;

  it.each(jadPackets)('uses the independent clock for Jad projectile $id', (packet) => {
    const input: ProjectileLaunch = {
      source: { worldX: 2271, worldY: 5351, resolvedOsrsZ: 0, heightOffset: 512 },
      target: { worldX: 2271, worldY: 5348, resolvedOsrsZ: 0, heightOffset: 124 },
      startOffset: 32,
      slope: 16,
    };
    const motion = createProjectileMotion(input, packet.endtime - packet.starttime);

    const atCycle20 = advanceProjectileMotion(motion, 20 - packet.starttime);

    expect(atCycle20.position.x).toBe(2271);
    expect(atCycle20.position.y).toBeCloseTo(packet.expectedYAt20, 10);
  });

  // capture inferno-waves-69-zuk-packet-data.txt:3107-3109.
  it('uses the blast height 390, progress 64 and zero slope without forcing linear height', () => {
    const input: ProjectileLaunch = {
      source: { worldX: 2271, worldY: 5367, resolvedOsrsZ: 0, heightOffset: 390 },
      target: { worldX: 2284, worldY: 5361, resolvedOsrsZ: 0, heightOffset: 124 },
      startOffset: 64,
      slope: 0,
    };
    const motion = createProjectileMotion(input, 76);

    const halfway = advanceProjectileMotion(motion, 38);

    expect(motion.position.x).toBeCloseTo(2271.45397969225, 10);
    expect(motion.position.y).toBeCloseTo(5366.790470911269, 10);
    expect(halfway.position.z).toBeCloseTo(2.52734375, 12);
  });

  // capture inferno-waves-69-zuk-packet-data.txt:3820-3825.
  it.each([
    { sourceX: 2276, sourceY: 5354, midpointX: 2278, midpointY: 5356 },
    { sourceX: 2278, sourceY: 5352, midpointX: 2279, midpointY: 5355 },
  ])('uses ranger source $sourceX,$sourceY exactly as supplied', (packet) => {
    const input: ProjectileLaunch = {
      source: { worldX: packet.sourceX, worldY: packet.sourceY, resolvedOsrsZ: 0, heightOffset: 256 },
      target: { worldX: 2280, worldY: 5358, resolvedOsrsZ: 0, heightOffset: 124 },
      startOffset: 0,
      slope: 16,
    };
    const motion = createProjectileMotion(input, 34);

    const halfway = advanceProjectileMotion(motion, 17);

    expect(motion.position).toEqual({ x: packet.sourceX, y: packet.sourceY, z: 2 });
    expect(halfway.position.x).toBe(packet.midpointX);
    expect(halfway.position.y).toBe(packet.midpointY);
  });

  // capture inferno-waves-69-zuk-packet-data.txt:18164-18172.
  it.each([
    { targetX: 2280, targetY: 5358, slope: 41, expectedMidZ: 2.3841219599502605 },
    { targetX: 2279, targetY: 5356, slope: 41, expectedMidZ: 3.201765328671094 },
    { targetX: 2275, targetY: 5356, slope: 47, expectedMidZ: 5.2617899612462535 },
  ])('solves the recorded spark aimed at $targetX,$targetY with slope $slope', (packet) => {
    const input: ProjectileLaunch = {
      source: { worldX: 2280, worldY: 5363, resolvedOsrsZ: 0, heightOffset: 70 },
      target: { worldX: packet.targetX, worldY: packet.targetY, resolvedOsrsZ: 0, heightOffset: 0 },
      startOffset: 0,
      slope: packet.slope,
    };
    const motion = createProjectileMotion(input, 90);

    const halfway = advanceProjectileMotion(motion, 45);

    expect(halfway.position.z).toBeCloseTo(packet.expectedMidZ, 10);
  });
});
