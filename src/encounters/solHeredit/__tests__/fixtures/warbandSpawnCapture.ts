/**
 * Facts extracted from a private gameplay capture (colosseum-waves-bees-death(no-sol)-packet-data-1.txt).
 * Every capture tick that added Fremennik warband members: whether the tick also carried a
 * "Wave: N" game message, and each `add` as `[npc id, x, y]` relative to the Colosseum arena origin
 * (world 1792, 3072).
 */
export const WARBAND_SPAWN_TICKS: readonly {
  readonly tick: number;
  readonly waveMessage: boolean;
  readonly adds: readonly (readonly [npcId: number, x: number, y: number])[];
}[] = [
  {
    tick: 1862,
    waveMessage: true,
    adds: [
      [12816, 33, 38],
      [12814, 32, 37],
      [12815, 34, 37],
    ],
  },
  {
    tick: 1931,
    waveMessage: true,
    adds: [
      [12816, 35, 34],
      [12814, 34, 33],
      [12815, 36, 33],
    ],
  },
  {
    tick: 2037,
    waveMessage: true,
    adds: [
      [12815, 32, 37],
      [12816, 31, 38],
      [12814, 30, 37],
    ],
  },
  {
    tick: 2201,
    waveMessage: true,
    adds: [
      [12816, 34, 39],
      [12814, 33, 38],
      [12815, 34, 37],
      [12815, 35, 38],
    ],
  },
  {
    tick: 2361,
    waveMessage: true,
    adds: [
      [12816, 30, 38],
      [12814, 29, 37],
      [12814, 30, 36],
      [12815, 31, 37],
    ],
  },
  {
    tick: 2630,
    waveMessage: true,
    adds: [
      [12815, 32, 36],
      [12816, 31, 37],
      [12814, 30, 36],
      [12815, 31, 35],
    ],
  },
  {
    tick: 2975,
    waveMessage: true,
    adds: [
      [12816, 35, 38],
      [12814, 34, 37],
      [12815, 35, 36],
      [12815, 36, 37],
    ],
  },
  {
    tick: 3347,
    waveMessage: true,
    adds: [
      [12815, 32, 33],
      [12816, 31, 34],
      [12814, 30, 33],
      [12814, 31, 32],
    ],
  },
];
