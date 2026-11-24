import { describe, expect, it } from 'vitest';
import { ProjectileAim, type ProjectileAimPoint } from '../projectileAim';

const LAUNCH_POINT: ProjectileAimPoint = { sw: [10, 0], size: 2, height: 3 };

describe('ProjectileAim', () => {
  it('re-resolves an actor aim against the live position on every call', () => {
    const aim = ProjectileAim.atActor('npc-1', LAUNCH_POINT);

    expect(aim.resolve(() => [12, 4]).sw).toEqual([12, 4]);
    expect(aim.resolve(() => [15, 9]).sw).toEqual([15, 9]);
  });

  it('keeps the footprint size and height fixed for the whole flight', () => {
    const aim = ProjectileAim.atActor('npc-1', LAUNCH_POINT);

    const resolved = aim.resolve(() => [12, 4]);

    expect(resolved.size).toBe(2);
    expect(resolved.height).toBe(3);
  });

  it('holds the last resolved position once the actor stops resolving', () => {
    // Target died or despawned mid-flight: finish where it was last seen instead
    // of snapping back to the launch tile.
    const aim = ProjectileAim.atActor('npc-1', LAUNCH_POINT);
    aim.resolve(() => [12, 4]);

    expect(aim.resolve(() => null).sw).toEqual([12, 4]);
  });

  it('falls back to the launch point when no resolver is supplied', () => {
    const aim = ProjectileAim.atActor('npc-1', LAUNCH_POINT);

    expect(aim.resolve(null).sw).toEqual([10, 0]);
  });

  it('never moves a fixed-point aim, even with a resolver that would', () => {
    // Non-targeted attacks (AoE meteors, tile-marked specials) own their square.
    const aim = ProjectileAim.atPoint(LAUNCH_POINT);

    expect(aim.isHoming).toBe(false);
    expect(aim.resolve(() => [99, 99]).sw).toEqual([10, 0]);
  });
});
