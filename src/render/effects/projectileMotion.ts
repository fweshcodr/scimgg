export type ProjectilePoint = {
  readonly x: number;
  readonly y: number;
  readonly z: number;
};

export type ProjectileEndpoint = {
  readonly worldX: number;
  readonly worldY: number;
  readonly resolvedOsrsZ: number;
  readonly heightOffset: number;
};

export type ProjectileLaunch = {
  readonly source: ProjectileEndpoint;
  readonly target: ProjectileEndpoint;
  readonly startOffset: number;
  readonly slope: number;
};

export type ProjectileMotion = {
  readonly position: ProjectilePoint;
  readonly velocity: ProjectilePoint;
  readonly verticalAcceleration: number;
};

// Unit and caller-owned scheduling contracts: docs/architecture/projectile-motion.md.
const LOCAL_UNITS_PER_TILE = 128;

export function projectileEndpoint(endpoint: ProjectileEndpoint): ProjectilePoint {
  return {
    x: endpoint.worldX,
    y: endpoint.worldY,
    z: (endpoint.heightOffset - endpoint.resolvedOsrsZ) / LOCAL_UNITS_PER_TILE,
  };
}

function requirePositiveHorizon(horizonCycles: number): void {
  if (!Number.isFinite(horizonCycles) || horizonCycles <= 0) {
    throw new RangeError(`horizonCycles must be finite and greater than zero; received ${horizonCycles}`);
  }
}

export function createProjectileMotion(launch: ProjectileLaunch, horizonCycles: number): ProjectileMotion {
  requirePositiveHorizon(horizonCycles);
  const source = projectileEndpoint(launch.source);
  const target = projectileEndpoint(launch.target);
  const deltaX = target.x - source.x;
  const deltaY = target.y - source.y;
  const distance = Math.hypot(deltaX, deltaY);
  const offsetRatio = distance === 0 ? 0 : launch.startOffset / LOCAL_UNITS_PER_TILE / distance;
  const position = {
    x: source.x + deltaX * offsetRatio,
    y: source.y + deltaY * offsetRatio,
    z: source.z,
  };
  const velocityX = (target.x - position.x) / horizonCycles;
  const velocityY = (target.y - position.y) / horizonCycles;
  const velocityZ = Math.hypot(velocityX, velocityY) * Math.tan((launch.slope * Math.PI) / 128);
  return {
    position,
    velocity: { x: velocityX, y: velocityY, z: velocityZ },
    verticalAcceleration: (2 * (target.z - position.z - velocityZ * horizonCycles)) / horizonCycles ** 2,
  };
}

export function aimProjectileMotion(
  motion: ProjectileMotion,
  target: ProjectilePoint,
  horizonCycles: number,
): ProjectileMotion {
  requirePositiveHorizon(horizonCycles);
  return {
    position: motion.position,
    velocity: {
      x: (target.x - motion.position.x) / horizonCycles,
      y: (target.y - motion.position.y) / horizonCycles,
      z: motion.velocity.z,
    },
    verticalAcceleration: (2 * (target.z - motion.position.z - motion.velocity.z * horizonCycles)) / horizonCycles ** 2,
  };
}

export function advanceProjectileMotion(motion: ProjectileMotion, elapsedCycles: number): ProjectileMotion {
  if (!Number.isFinite(elapsedCycles) || elapsedCycles < 0) {
    throw new RangeError(`elapsedCycles must be finite and nonnegative; received ${elapsedCycles}`);
  }
  return {
    position: {
      x: motion.position.x + motion.velocity.x * elapsedCycles,
      y: motion.position.y + motion.velocity.y * elapsedCycles,
      z: motion.position.z + motion.velocity.z * elapsedCycles + (motion.verticalAcceleration * elapsedCycles ** 2) / 2,
    },
    velocity: {
      x: motion.velocity.x,
      y: motion.velocity.y,
      z: motion.velocity.z + motion.verticalAcceleration * elapsedCycles,
    },
    verticalAcceleration: motion.verticalAcceleration,
  };
}

export function projectileDirection(motion: ProjectileMotion): {
  readonly yawRadians: number;
  readonly pitchRadians: number;
} {
  return {
    yawRadians: Math.atan2(motion.velocity.y, motion.velocity.x),
    pitchRadians: Math.atan2(motion.velocity.z, Math.hypot(motion.velocity.x, motion.velocity.y)),
  };
}
