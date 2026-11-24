import { describe, expect, it } from 'vitest';
import { generatorDecisionRandom } from '../../../core/decisionRandom';
import { mulberry32 } from '../../../core/rng';
import { INFERNO_WAVE_NPC_IDS } from '../../../npcs/inferno/constants';
import type { Coordinate } from '../../../types/simulation';
import {
  INFERNO_SPAWN_SLOTS,
  JAD_HEALER_SPAWN_DISTANCE,
  NIBBLER_SPAWN_AREA,
  WAVE_67_JAD_TILE,
  WAVE_68_JAD_TILES,
} from '../constants';
import { pickJadHealerTiles, planWaveSpawns, type WaveSpawnPlacement } from '../layout';
import { parseSpawnLayout } from '../spawnLayout';
import { isInfernoWave, type WaveNpcKind, waveComposition, waveSpawnKinds } from '../waves';
import { INFERNO_WAVE_SPAWNS } from './fixtures/infernoWaveSpawnsCapture';

const KIND_BY_ID = new Map<number, WaveNpcKind>([
  [INFERNO_WAVE_NPC_IDS.nibbler, 'nibbler'],
  [INFERNO_WAVE_NPC_IDS.bat, 'bat'],
  [INFERNO_WAVE_NPC_IDS.blob, 'blob'],
  [INFERNO_WAVE_NPC_IDS.meleer, 'meleer'],
  [INFERNO_WAVE_NPC_IDS.ranger, 'ranger'],
  [INFERNO_WAVE_NPC_IDS.mager, 'mager'],
  [INFERNO_WAVE_NPC_IDS.jad, 'jad'],
]);

type CapturedBatch = { readonly kinds: WaveNpcKind[]; readonly tiles: Coordinate[] };

/** The `add`s on each `Wave: N` tick of a capture, in index order, as local tiles. */
function readCapturedBatches(file: string): Map<number, CapturedBatch> {
  const batches = new Map<number, CapturedBatch>();
  for (const [wave, adds] of Object.entries(INFERNO_WAVE_SPAWNS[file] ?? {})) {
    const known = adds
      .flatMap(([npcId, index, x, y]) => {
        const kind = KIND_BY_ID.get(npcId);
        return kind ? [{ kind, index, tile: [x, y] as Coordinate }] : [];
      })
      .sort((a, b) => a.index - b.index);
    batches.set(Number(wave), { kinds: known.map(({ kind }) => kind), tiles: known.map(({ tile }) => tile) });
  }
  return batches;
}

const P = readCapturedBatches('inferno-waves-1-68-packet-data.txt');
const Q = readCapturedBatches('inferno-waves-(35ish)-to-68-packet-data.txt');
const ALL_WAVES = Array.from({ length: 68 }, (_, index) => index + 1);

describe('Inferno wave table', () => {
  it('covers waves 1-68 and nothing else', () => {
    expect(ALL_WAVES.every(isInfernoWave)).toBe(true);
    expect([0, 69, 1.5].some(isInfernoWave)).toBe(false);
    expect(() => waveComposition(69)).toThrow(RangeError);
  });

  it.each(ALL_WAVES)('matches both captures on wave %i, in index order', (wave) => {
    const expected = waveSpawnKinds(wave);
    expect(P.get(wave)?.kinds).toEqual(expected);
    if (wave >= 28) expect(Q.get(wave)?.kinds).toEqual(expected);
  });

  it('gives three nibblers per wave except the six-nibbler waves, and Jads only on 67-68', () => {
    for (const wave of ALL_WAVES) {
      const composition = waveComposition(wave);
      if (wave >= 67) {
        expect(composition).toEqual({ jad: wave === 67 ? 1 : 3 });
        continue;
      }
      expect(composition.nibbler).toBe([3, 8, 17, 34].includes(wave) ? 6 : 3);
      if ([3, 8, 17, 34].includes(wave)) expect(Object.keys(composition)).toEqual(['nibbler']);
    }
  });

  it('introduces each species where the progression does', () => {
    const first = (kind: WaveNpcKind) => ALL_WAVES.find((wave) => (waveComposition(wave)[kind] ?? 0) > 0);
    expect([first('bat'), first('blob'), first('meleer'), first('ranger'), first('mager')]).toEqual([1, 4, 9, 18, 35]);
  });

  it('places every captured batch where the layout can (slots, nibbler area, Jad tiles)', () => {
    const slots = new Set(INFERNO_SPAWN_SLOTS.map(([x, y]) => `${x},${y}`));
    for (const batches of [P, Q]) {
      for (const [wave, batch] of batches) {
        const slotTiles = batch.tiles.filter((_, index) => !['nibbler', 'jad'].includes(batch.kinds[index]));
        expect(new Set(slotTiles.map(String)).size, `wave ${wave} reused a slot`).toBe(slotTiles.length);
        for (const [index, [x, y]] of batch.tiles.entries()) {
          const kind = batch.kinds[index];
          if (kind === 'nibbler') {
            expect(x >= NIBBLER_SPAWN_AREA.minX && x <= NIBBLER_SPAWN_AREA.maxX).toBe(true);
            expect(y >= NIBBLER_SPAWN_AREA.minY && y <= NIBBLER_SPAWN_AREA.maxY).toBe(true);
          } else if (kind === 'jad') {
            expect(wave === 67 ? [WAVE_67_JAD_TILE] : WAVE_68_JAD_TILES).toContainEqual([x, y]);
          } else {
            expect(slots.has(`${x},${y}`), `wave ${wave} ${kind} at ${x},${y}`).toBe(true);
          }
        }
      }
    }
  });
});

describe('seeded wave layout', () => {
  it('reproduces a wave from (runSeed, wave) alone', () => {
    for (const wave of [1, 30, 62, 68]) {
      expect(planWaveSpawns(1234, wave)).toEqual(planWaveSpawns(1234, wave));
    }
    expect(
      ALL_WAVES.some((wave) => JSON.stringify(planWaveSpawns(1, wave)) !== JSON.stringify(planWaveSpawns(2, wave))),
    ).toBe(true);
  });

  it.each(ALL_WAVES)('spawns wave %i in table order on distinct slots and in the nibbler area', (wave) => {
    for (const seed of [0, 1, 0xffffffff, 987654321]) {
      const plan = planWaveSpawns(seed, wave);
      expect(plan.map((placement) => placement.kind)).toEqual(waveSpawnKinds(wave));
      const slotTiles = plan.filter((placement) => placement.kind !== 'nibbler' && placement.kind !== 'jad');
      expect(new Set(slotTiles.map((placement) => String(placement.position))).size).toBe(slotTiles.length);
      for (const placement of slotTiles) expect(INFERNO_SPAWN_SLOTS).toContainEqual(placement.position);
      for (const placement of plan.filter((candidate) => candidate.kind === 'nibbler')) {
        const [x, y] = placement.position;
        expect(x >= 25 && x <= 27 && y >= 33 && y <= 35).toBe(true);
      }
    }
  });

  it('draws the nine slots uniformly', () => {
    const counts = new Map<string, number>();
    const runs = 9000;
    for (let seed = 0; seed < runs; seed++) {
      const bat = planWaveSpawns(seed, 1).find((placement) => placement.kind === 'bat');
      const key = String(bat?.position);
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
    expect(counts.size).toBe(9);
    for (const count of counts.values()) expect(Math.abs(count - runs / 9)).toBeLessThan(150);
  });

  it('lets nibblers share tiles over the whole 3x3 area', () => {
    const tiles = new Set<string>();
    let shared = false;
    for (let seed = 0; seed < 200; seed++) {
      const nibblers = planWaveSpawns(seed, 3).map((placement) => String(placement.position));
      for (const tile of nibblers) tiles.add(tile);
      if (new Set(nibblers).size < nibblers.length) shared = true;
    }
    expect(tiles.size).toBe(9);
    expect(shared).toBe(true);
  });

  describe('with a custom layout', () => {
    // Wave 31 spawns ranger, meleer, blob, blob; slot 0 is (18,41), 2 (18,18), 4 (32,18), 6 (33,29).
    const full = parseSpawnLayout('31:m-l-r-l--');
    const meleerOnly = parseSpawnLayout('31:m--------');
    const slotsOf = (plan: readonly WaveSpawnPlacement[]) =>
      plan.filter(({ kind }) => kind !== 'nibbler').map(({ position }) => position);
    const nibblersOf = (plan: readonly WaveSpawnPlacement[]) => plan.filter(({ kind }) => kind === 'nibbler');

    it('places a whole one exactly, its nibblers where the random wave has them', () => {
      const plan = planWaveSpawns(7, 31, undefined, -1, full);
      expect(plan).toEqual([
        { kind: 'ranger', position: [32, 18] },
        { kind: 'meleer', position: [18, 41] },
        { kind: 'blob', position: [18, 18] },
        { kind: 'blob', position: [33, 29] },
        { kind: 'nibbler', position: [27, 33] },
        { kind: 'nibbler', position: [26, 34] },
        { kind: 'nibbler', position: [27, 35] },
      ]);
      expect(nibblersOf(plan)).toEqual(nibblersOf(planWaveSpawns(7, 31)));
    });

    it('fills a partial one’s free slots from the seeded shuffle, in spawn order', () => {
      for (const seed of [0, 7, 99, 0xffffffff]) {
        const random = planWaveSpawns(seed, 31);
        const plan = planWaveSpawns(seed, 31, undefined, -1, meleerOnly);
        expect(plan.map(({ kind }) => kind)).toEqual(waveSpawnKinds(31));
        expect(plan[1].position).toEqual(INFERNO_SPAWN_SLOTS[0]);
        // The others take the shuffle's slots in its order, skipping the meleer's. The random wave's
        // four slots are the shuffle's first four, which hold the three free ones needed.
        const shuffleFree = slotsOf(random).filter(([x, y]) => x !== 18 || y !== 41);
        expect([plan[0], plan[2], plan[3]].map(({ position }) => position)).toEqual(shuffleFree.slice(0, 3));
        expect(nibblersOf(plan)).toEqual(nibblersOf(random));
      }
      expect(planWaveSpawns(7, 31, undefined, -1, meleerOnly)).toEqual(
        planWaveSpawns(7, 31, undefined, -1, meleerOnly),
      );
      const fills = new Set(
        Array.from({ length: 20 }, (_, seed) =>
          JSON.stringify(slotsOf(planWaveSpawns(seed, 31, undefined, -1, meleerOnly))),
        ),
      );
      expect(fills.size).toBeGreaterThan(1);
    });
  });

  it('puts Jads on their fixed tiles, opening by spawn index in a seeded wave-68 order', () => {
    expect(planWaveSpawns(5, 67)).toEqual([
      { kind: 'jad', position: [25, 35], jad: { openingDelayTicks: 4, rangedMagicPeriod: 8 } },
    ]);
    const orders = new Set<string>();
    for (let seed = 0; seed < 60; seed++) {
      const plan = planWaveSpawns(seed, 68);
      expect(plan.map((placement) => placement.jad)).toEqual(
        [4, 7, 10].map((openingDelayTicks) => ({ openingDelayTicks, rangedMagicPeriod: 9 })),
      );
      expect([...plan.map((placement) => placement.position)].sort()).toEqual([...WAVE_68_JAD_TILES].sort());
      orders.add(JSON.stringify(plan.map((placement) => placement.position)));
    }
    expect(orders.size).toBe(6);
  });
});

/**
 * Every captured wave-67/68 Yt-HurKot batch: its Jad's SW tile and the healers' add tiles (P, R = P's
 * resumed wave 68, Q; line ranges in inferno-open-questions.md C15).
 */
const CAPTURED_HEALER_BATCHES: readonly { readonly jad: Coordinate; readonly healers: readonly Coordinate[] }[] = [
  {
    jad: [25, 35],
    healers: [
      [27, 43],
      [27, 41],
      [25, 42],
      [21, 42],
      [22, 35],
    ],
  }, // P t9814
  {
    jad: [28, 23],
    healers: [
      [31, 32],
      [33, 20],
      [34, 20],
    ],
  }, // R t129
  {
    jad: [25, 35],
    healers: [
      [26, 44],
      [21, 32],
      [21, 37],
    ],
  }, // R t380
  {
    jad: [34, 34],
    healers: [
      [30, 38],
      [31, 39],
      [30, 36],
    ],
  }, // R t703
  {
    jad: [25, 35],
    healers: [
      [25, 42],
      [25, 43],
      [29, 31],
      [22, 42],
      [23, 40],
    ],
  }, // Q t4791
  {
    jad: [28, 23],
    healers: [
      [27, 30],
      [25, 23],
      [26, 21],
    ],
  }, // Q t4891
  {
    jad: [25, 35],
    healers: [
      [29, 43],
      [23, 43],
      [21, 38],
    ],
  }, // Q t5004
  {
    jad: [34, 34],
    healers: [
      [37, 40],
      [36, 41],
      [38, 31],
    ],
  }, // Q t5125
];

const JAD = { size: 5 } as const;
const distanceFromCentre = ([jx, jy]: Coordinate, [x, y]: Coordinate) => Math.hypot(x - (jx + 2), y - (jy + 2));
const healerKey = { site: 'inferno.jad_healer.tile', tick: 0, actorId: 'jad' } as const;

describe('wave 67-68 Jad healer placement (fitted policy)', () => {
  it('covers every captured healer: 4-8 tiles from the Jad center, distinct within a batch', () => {
    expect(CAPTURED_HEALER_BATCHES.flatMap((batch) => batch.healers)).toHaveLength(28);
    for (const { jad, healers } of CAPTURED_HEALER_BATCHES) {
      expect(new Set(healers.map(String)).size).toBe(healers.length);
      for (const tile of healers) {
        const distance = distanceFromCentre(jad, tile);
        expect(
          distance >= JAD_HEALER_SPAWN_DISTANCE.min && distance <= JAD_HEALER_SPAWN_DISTANCE.max,
          String(tile),
        ).toBe(true);
      }
    }
  });

  it('draws distinct band tiles, never the player, over the whole band', () => {
    const jad: Coordinate = [25, 35];
    const player: Coordinate = [27, 43];
    const seen = new Set<string>();
    for (let seed = 0; seed < 2000; seed++) {
      const tiles = pickJadHealerTiles({ position: jad, ...JAD }, 5, {
        isOpen: () => true,
        player,
        decisions: generatorDecisionRandom(mulberry32(seed)),
        key: healerKey,
      });
      expect(tiles).toHaveLength(5);
      expect(new Set(tiles.map(String)).size).toBe(5);
      for (const tile of tiles) {
        const distance = distanceFromCentre(jad, tile);
        expect(distance >= 4 && distance <= 8).toBe(true);
        expect(tile).not.toEqual(player);
        seen.add(String(tile));
      }
    }
    let band = 0;
    for (let x = 19; x <= 35; x++)
      for (let y = 29; y <= 45; y++) {
        const distance = distanceFromCentre(jad, [x, y]);
        if (distance >= 4 && distance <= 8 && (x !== player[0] || y !== player[1])) band++;
      }
    expect(seen.size).toBe(band);
  });

  it('labels one draw per healer and only offers open tiles', () => {
    const keys: unknown[] = [];
    const offered: number[] = [];
    const inner = generatorDecisionRandom(mulberry32(3));
    const open = (x: number) => x <= 27;
    const tiles = pickJadHealerTiles({ position: [25, 35], ...JAD }, 3, {
      isOpen: open,
      player: null,
      decisions: {
        ...inner,
        choose: (key, options) => {
          keys.push(key);
          offered.push(options.length);
          expect(options.every(({ value }) => open((value as unknown as Coordinate)[0]))).toBe(true);
          return inner.choose(key, options);
        },
      },
      key: healerKey,
    });
    expect(tiles.every(([x]) => x <= 27)).toBe(true);
    expect(keys).toEqual([0, 1, 2].map((ordinal) => ({ ...healerKey, ordinal })));
    expect(offered[1]).toBe((offered[0] ?? 0) - 1);
  });

  it('fills a short band with the nearest free tiles around the Jad, and never invents a tile', () => {
    const decisions = generatorDecisionRandom(mulberry32(1));
    // Open: one band tile (31,37), one tile beside the footprint (24,37), and the player's (30,36).
    const open = new Set(['31,37', '24,37', '30,36']);
    expect(
      pickJadHealerTiles({ position: [25, 35], ...JAD }, 4, {
        isOpen: (x, y) => open.has(`${x},${y}`),
        player: [30, 36],
        decisions,
        key: healerKey,
      }),
    ).toEqual([
      [31, 37],
      [24, 37],
    ]);
    // Nothing free, the player on the tile just east of the Jad: no healer lands anywhere.
    expect(
      pickJadHealerTiles({ position: [25, 35], ...JAD }, 2, {
        isOpen: () => false,
        player: [30, 35],
        decisions,
        key: healerKey,
      }),
    ).toEqual([]);
  });
});
