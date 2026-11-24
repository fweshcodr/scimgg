import type { EncounterModifierTier } from '../../../core/encounters/encounterFactory';
import type { EncounterContext, EnvironmentalDamage, NpcMovementInfo } from '../../../core/encounters/types';
import { createNpcDefinition } from '../../../core/npcs';
import { createColosseumActor } from '../../../npcs/colosseum/actors';
import type { Coordinate } from '../../../types/simulation';
import { ColosseumRouteRunner, type CornerRouteTiming } from './routeRunner';

/** VERIFIED: Run A waves 5–7 and A:4980+; Wiki Modifiers oldid=15163385; M8277..8517. */
export const SOLARFLARE_TIMING: Readonly<Record<EncounterModifierTier, CornerRouteTiming>> = {
  1: { stepInterval: 2, cornerPause: 7 },
  2: { stepInterval: 2, cornerPause: 0 },
  3: { stepInterval: 1, cornerPause: 2 },
};

interface SolarflareState {
  readonly route: ColosseumRouteRunner;
  readonly firstStepTick: number;
  readonly movementSpeed?: 'crawl';
}

/** Route-following NPC: no pursuit, direct attacks or collisions. The modifier owns departure hits. */
export const solarflareDefinition = createNpcDefinition<SolarflareState, undefined>({
  id: 'colosseum-solarflare',
  move: ({ actor, context }) => {
    if (!actor.alive) return [];
    const position = actor.state.route.positionAt(context.tick - actor.state.firstStepTick);
    if (position[0] === actor.position[0] && position[1] === actor.position[1]) return [];
    return [
      {
        npcId: actor.id,
        path: [position],
        ...(actor.state.movementSpeed ? { movementSpeed: actor.state.movementSpeed } : {}),
      },
    ];
  },
});

export function createSolarflare(input: {
  readonly id: string;
  readonly corners: readonly Readonly<Coordinate>[];
  readonly tier: EncounterModifierTier;
  readonly spawnTick: number;
  readonly firstStepTick: number;
}) {
  const route = new ColosseumRouteRunner(input.corners, SOLARFLARE_TIMING[input.tier]);
  return solarflareDefinition.createActor(
    { ...createColosseumActor('solarflare', input.id, route.positionAt(-1)), spawnTick: input.spawnTick },
    { route, firstStepTick: input.firstStepTick, ...(input.tier < 3 ? { movementSpeed: 'crawl' as const } : {}) },
  );
}

export const SOLARFLARE_DAMAGE_SOURCE = 'Solarflare';

/** Per-run delayed hits, independent of any particular encounter's orb routes or lifecycle. */
export class SolarflareDamageState {
  private pending: number[] = [];

  reset(): void {
    this.pending = [];
  }

  resolveTick(
    ctx: Pick<EncounterContext, 'tick' | 'playerPos' | 'world' | 'setProtectionPrayer'>,
    movements: Iterable<NpcMovementInfo>,
    tier: EncounterModifierTier,
  ): EnvironmentalDamage[] {
    const damages = this.pending
      .filter((tick) => tick <= ctx.tick)
      .map(
        (): EnvironmentalDamage => ({
          // MODEL: A:1406/1508/1560/1597/1599/1891/1921/1985/2291/2311/2331 span 10–20,
          // with no observed tier difference. The engine rolls the inclusive range with combat RNG.
          baseDamage: [10, 20],
          attackType: 'typeless',
          source: SOLARFLARE_DAMAGE_SOURCE,
          playerPosition: [...ctx.playerPos],
        }),
      );
    this.pending = this.pending.filter((tick) => tick > ctx.tick);
    for (const movement of movements) {
      // A:2290->2291 and the other ten hits: departure occupancy at T, damage at T+1.
      // A:1854/1888: arrival-only overlap does not qualify. ctx.playerPos is pre-player-move.
      if (!movement.moved || movement.from[0] !== ctx.playerPos[0] || movement.from[1] !== ctx.playerPos[1]) continue;
      this.pending.push(ctx.tick + 1);
      if (tier === 3 && ctx.world.getPlayer()?.activePrayer != null) {
        // A:2290/2330: drop only the overhead slot now, without installing a prayer lockout.
        ctx.setProtectionPrayer?.(null);
      }
    }
    return damages;
  }
}
