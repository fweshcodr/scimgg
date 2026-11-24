import { describe, expect, it } from 'vitest';
import { TickEvents } from '../../../core/events/TickEvents';
import type { NpcDefinitionContext } from '../../../core/npcs';
import { mulberry32 } from '../../../core/rng';
import { SimulationEngine } from '../../../core/SimulationEngine';
import { SOL_ARENA } from '../../../encounters/solHeredit/constants';
import { SolHereditEncounter } from '../../../encounters/solHeredit/SolHereditEncounter';
import { type Coordinate, PrayerType } from '../../../types/simulation';
import { solGroundTiles } from '../attackScheduler';
import {
  type ColosseumRelentlessRank,
  REGULAR_AOE_MAX_HIT,
  TRIPLE_DAMAGE_LONG,
  TRIPLE_DAMAGE_SHORT,
} from '../constants';
import { createSol, solDefinition } from '../sol';
import { type SolAimDirection, spearTiles } from '../solAttacks';

const registration = solDefinition.register({ arena: SOL_ARENA });

function fixture(relentless?: ColosseumRelentlessRank) {
  const world = new SimulationEngine({ encounter: new SolHereditEncounter(1) })['worldState'];
  const player = world.getPlayer()!;
  world.actors.clear();
  world.actors.set(player.id, player);
  const sol = createSol({
    id: 'sol',
    position: [31, 36],
    targetId: player.id,
    addedTick: 0,
    firstAttackTick: 1000,
    holdUntilTick: 0,
    relentless,
  });
  world.actors.set(sol.id, sol);
  const context = (tick: number, random: () => number): NpcDefinitionContext => ({
    tick,
    world,
    tickEvents: new TickEvents(),
    random,
    spawnNpc: () => undefined,
    despawnNpc: () => undefined,
    logEvent: () => undefined,
  });
  return { player, sol, context };
}

describe('Sol damage', () => {
  it.each([
    {
      direction: 'north',
      targets: [
        [31, 41],
        [35, 41],
      ],
    },
    {
      direction: 'south',
      targets: [
        [31, 35],
        [35, 35],
      ],
    },
    {
      direction: 'east',
      targets: [
        [36, 36],
        [36, 40],
      ],
    },
    {
      direction: 'west',
      targets: [
        [30, 36],
        [30, 40],
      ],
    },
  ] satisfies {
    direction: SolAimDirection;
    targets: Coordinate[];
  }[])('lands Spear 2 on stationary players at both $direction face ends with the cardinal tile set', ({
    direction,
    targets,
  }) => {
    for (const target of targets) {
      const { player, sol, context } = fixture();
      player.position = [...target];
      const pending = { style: 'spear', variant: 2, resolveTick: 10 } as const;
      sol.state.scheduler.pendingGround = pending;
      expect(
        registration.resolveLocalEffects(
          sol,
          context(9, () => 0.5),
        ),
      ).toEqual([]);
      expect(player.position).toEqual(target);
      expect(
        registration.resolveLocalEffects(
          sol,
          context(10, () => 0.5),
        ),
      ).toEqual([{ baseDamage: 22, attackType: 'typeless', source: 'SolSpear', playerPosition: target }]);
      expect(solGroundTiles(pending, { position: sol.position, target, arena: SOL_ARENA }).tiles).toEqual(
        spearTiles(sol.position, direction, 2, SOL_ARENA),
      );
      expect(sol.state.scheduler.pendingGround).toBeNull();
    }
  });

  it.each([
    { target: [31, 34], direction: 'south', variant: 1, hit: false },
    { target: [32, 34], direction: 'south', variant: 2, hit: false },
    { target: [35, 34], direction: 'south', variant: 2, hit: true },
    { target: [30, 41], direction: 'north-west', variant: 1, hit: false },
    { target: [30, 41], direction: 'north-west', variant: 2, hit: true },
    { target: [36, 41], direction: 'north-east', variant: 2, hit: true },
    { target: [30, 35], direction: 'south-west', variant: 2, hit: true },
    { target: [36, 35], direction: 'south-east', variant: 2, hit: true },
  ] as const)('preserves $direction variant $variant coverage at $target (hit: $hit)', ({
    target,
    direction,
    variant,
    hit,
  }) => {
    const { player, sol, context } = fixture();
    player.position = [...target];
    const pending = { style: 'spear', variant, resolveTick: 10 } as const;
    sol.state.scheduler.pendingGround = pending;
    expect(solGroundTiles(pending, { position: sol.position, target, arena: SOL_ARENA }).tiles).toEqual(
      spearTiles(sol.position, direction, variant, SOL_ARENA),
    );
    const damages = registration.resolveLocalEffects(
      sol,
      context(10, () => 0.5),
    );
    expect(damages).toHaveLength(hit ? 1 : 0);
    if (hit) expect(damages[0]).toMatchObject({ source: 'SolSpear', baseDamage: 22, playerPosition: target });
  });

  it('lands every regular hit as the higher of two 0..44 rolls, with no accuracy roll', () => {
    const { player, sol, context } = fixture(2);
    const random = mulberry32(44);
    const values: number[] = [];
    for (let tick = 1; tick <= 4_000; tick++) {
      const pending = { style: 'shield', variant: 1, resolveTick: tick } as const;
      const [tile] = solGroundTiles(pending, { position: sol.position, target: [33, 31], arena: SOL_ARENA }).tiles;
      player.position = [...tile!];
      sol.state.scheduler.pendingGround = pending;
      const damages = registration.resolveLocalEffects(sol, context(tick, random));
      expect(damages).toHaveLength(1);
      values.push(damages[0]!.baseDamage as number);
    }
    // Relentless II leaves the max at 44 (L: 25 hits under it, two 44s, none 45-47).
    expect(Math.max(...values)).toBe(REGULAR_AOE_MAX_HIT);
    expect(Math.min(...values)).toBe(0);
    // E[max of two 0..44 rolls] = 29.5; one uniform roll would average 22 (captured mean 29.8, n=37).
    const mean = values.reduce((total, value) => total + value, 0) / values.length;
    expect(mean).toBeGreaterThan(29);
    expect(mean).toBeLessThan(30);
  });

  it.each([
    { relentless: undefined, bonus: 0 },
    { relentless: 1, bonus: 1 },
    { relentless: 2, bonus: 3 },
    { relentless: 3, bonus: 6 },
  ] as const)('adds Relentless $relentless to each unprayed triple hit, never to a prayed one', ({
    relentless,
    bonus,
  }) => {
    for (const damage of [TRIPLE_DAMAGE_SHORT, TRIPLE_DAMAGE_LONG]) {
      for (const prayed of [false, true]) {
        const { player, sol, context } = fixture(relentless);
        sol.state.scheduler.pendingTriple = damage.map((value, index) => ({ tick: 10 + index, damage: value, index }));
        const hits: number[] = [];
        for (let index = 0; index < damage.length; index++) {
          const tick = 10 + index;
          player.activePrayer = prayed ? PrayerType.ProtectMelee : null;
          if (prayed) player.prayerState.prayerActivationTicks[PrayerType.ProtectMelee] = tick;
          const [hit] = registration.resolveLocalEffects(
            sol,
            context(tick, () => 0.5),
          );
          hits.push(hit!.baseDamage as number);
        }
        // L (Relentless II) unprayed: 18/28/48 where Run A (none) gave exactly 15/25/35.
        expect(hits).toEqual(prayed ? [0, 0, 0] : damage.map((value) => value + bonus));
      }
    }
  });
});
