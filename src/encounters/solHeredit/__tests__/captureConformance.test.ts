import { describe, expect, it } from 'vitest';
import { TELEGRAPH_TO_GROUND_TICKS } from '../../../npcs/colosseum/constants';
import {
  type ArenaRect,
  INITIAL_SOL_VARIANT_MEMORY,
  rememberSolAction,
  type SolAimDirection,
  type SolAttackStyle,
  type SolAttackVariant,
  selectSolVariant,
  shieldTiles,
  solAimToward,
  solCentreTile,
  spearTiles,
  telegraphDelayCycles,
} from '../../../npcs/colosseum/solAttacks';
import { SOL_ARENA } from '../constants';
import { SOL_GROUND_ATTACK_BURSTS, SOL_SPECIAL_TELEGRAPH_TICKS } from './fixtures/solGroundAttackCapture';

/**
 * Conformance of Sol Heredit's ground-attack model against the captures it was derived from.
 *
 * Every burst, Sol's anchor, his facing and each tile's ripple delay come from facts extracted from
 * the captures (`fixtures/solGroundAttackCapture.ts`), and the attack labels are recovered from the
 * geometry rather than transcribed, so a burst the model cannot produce fails.
 *
 * Decoding conventions:
 *   sim (x, y)     = world (x - 1792, y - 3072)
 *   map_anim delay = client cycles, 30 per tick
 *   Sol's coord    = the south-west tile of his 5x5 footprint
 */

const ARENA: ArenaRect = SOL_ARENA;

const CAPTURES = [
  'colosseum-sol-heredit-packet-data.txt',
  'colosseum-sol-heredit-solar-flare-doom-volatility-packet-data.txt',
  'colosseum-sol-heredit-packet-data-2.txt',
] as const;

const AIMS: readonly SolAimDirection[] = [
  'north',
  'south',
  'east',
  'west',
  'north-east',
  'north-west',
  'south-east',
  'south-west',
];

interface Burst {
  readonly tick: number;
  /** Tile -> the `delay=` client-cycle offset that tile's effect played at. */
  readonly tiles: ReadonlyMap<string, number>;
  readonly solPosition: readonly [number, number];
  /** Where the player stood when the landing tick began, before that tick's movement. */
  readonly playerPosition: readonly [number, number] | null;
}

function parseBursts(fileName: string): Burst[] {
  return (SOL_GROUND_ATTACK_BURSTS[fileName] ?? []).map((burst) => ({
    ...burst,
    tiles: new Map(burst.tiles.map(([x, y, delay]) => [`${x},${y}`, delay])),
  }));
}

function parseSpecialTelegraphTicks(fileName: string): readonly number[] {
  return SOL_SPECIAL_TELEGRAPH_TICKS[fileName] ?? [];
}

interface RecoveredAttack {
  readonly style: SolAttackStyle;
  readonly variant: SolAttackVariant;
  readonly aim: SolAimDirection | null;
}

/**
 * Finds every (style, variant, facing) the model would render as exactly this tile set. Recovering
 * the label from the geometry rather than reading it off a table is what makes the match meaningful:
 * a burst the model cannot produce at all yields no candidate and fails.
 */
function recoverCandidates(burst: Burst): RecoveredAttack[] {
  const observed = new Set(burst.tiles.keys());
  const sameSet = (tiles: readonly (readonly number[])[]): boolean =>
    tiles.length === observed.size && tiles.every(([x, y]) => observed.has(`${x},${y}`));
  const found: RecoveredAttack[] = [];
  for (const variant of [1, 2] as const) {
    if (sameSet(shieldTiles(burst.solPosition, variant, ARENA))) {
      found.push({ style: 'shield', variant, aim: null });
    }
    for (const aim of AIMS) {
      if (sameSet(spearTiles(burst.solPosition, aim, variant, ARENA))) found.push({ style: 'spear', variant, aim });
    }
  }
  return found;
}

describe.each(CAPTURES)('Sol Heredit ground attacks vs %s', (fileName) => {
  const bursts = parseBursts(fileName);

  it('finds Sol ground-attack bursts in the capture', () => {
    expect(bursts.length).toBeGreaterThan(20);
  });

  it('reproduces every observed burst exactly, with no missing or extra tiles', () => {
    const failures: string[] = [];
    for (const burst of bursts) {
      const candidates = recoverCandidates(burst);
      if (candidates.length === 0) {
        failures.push(`tick ${burst.tick}: no spear/shield shape produces the observed ${burst.tiles.size} tiles`);
      }
    }
    expect(failures).toEqual([]);
  });

  it('aims every spear at where the player stood when its landing tick began', () => {
    const checked: string[] = [];
    for (const burst of bursts) {
      const spear = recoverCandidates(burst).find((candidate) => candidate.style === 'spear');
      if (!spear || !burst.playerPosition) continue;
      const predicted = solAimToward(burst.solPosition, burst.playerPosition);
      checked.push(`${burst.tick}: ${predicted} vs ${spear.aim}`);
      expect(predicted, `spear aim at tick ${burst.tick}`).toBe(spear.aim);
    }
    expect(checked.length).toBeGreaterThan(0);
  });

  it('plays each tile effect on the two-cycles-per-ring ripple from Sol center', () => {
    for (const burst of bursts) {
      const centre = solCentreTile(burst.solPosition);
      for (const [key, delay] of burst.tiles) {
        const [x, y] = key.split(',').map(Number);
        expect(telegraphDelayCycles([x, y], centre), `delay at tick ${burst.tick} tile ${key}`).toBe(delay);
      }
    }
  });

  it('picks each variant by the alternation rule, with specials resetting the run', () => {
    const specials = parseSpecialTelegraphTicks(fileName);
    let memory = INITIAL_SOL_VARIANT_MEMORY;
    let previousTelegraph = Number.NEGATIVE_INFINITY;
    for (const burst of bursts) {
      const recovered = recoverCandidates(burst)[0];
      expect(recovered, `tick ${burst.tick} is unrecognized`).toBeDefined();
      const telegraph = burst.tick - TELEGRAPH_TO_GROUND_TICKS;
      // Wiki: a grapple or triple between two regular attacks resets the run.
      if (specials.some((tick) => tick > previousTelegraph && tick < telegraph))
        memory = rememberSolAction('special', memory.lastVariant);
      expect(selectSolVariant(memory, recovered.style), `variant at tick ${burst.tick}`).toBe(recovered.variant);
      memory = rememberSolAction(recovered.style, recovered.variant);
      previousTelegraph = telegraph;
    }
  });
});
