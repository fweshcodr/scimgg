import { FIRST_INFERNO_WAVE, LAST_ORDINARY_WAVE } from './constants';

/** Wave-start species. Blob children, resurrections and Jad healers are later dynamic adds. */
export type WaveNpcKind = 'mager' | 'ranger' | 'meleer' | 'blob' | 'bat' | 'nibbler' | 'jad';

export type WaveComposition = Readonly<Partial<Record<WaveNpcKind, number>>>;

/**
 * Spawn (processing) order within a batch: both captures index magers, rangers, meleers, blobs, bats,
 * then nibblers (e.g. P wave 62: 7699, 7698, 7697, 7693, 7692 x2, 7691 x3).
 */
export const WAVE_NPC_SPAWN_ORDER: readonly WaveNpcKind[] = [
  'mager',
  'ranger',
  'meleer',
  'blob',
  'bat',
  'nibbler',
  'jad',
];

/**
 * https://oldschool.runescape.wiki/w/Inferno (Wave breakdown). Both captures agree on every overlapping
 * wave (P 1-68, Q 28-68); `__tests__/waves.test.ts` checks this table against both.
 */
const WAVES: readonly WaveComposition[] = [
  /*  1 */ { bat: 1, nibbler: 3 },
  /*  2 */ { bat: 2, nibbler: 3 },
  /*  3 */ { nibbler: 6 },
  /*  4 */ { blob: 1, nibbler: 3 },
  /*  5 */ { blob: 1, bat: 1, nibbler: 3 },
  /*  6 */ { blob: 1, bat: 2, nibbler: 3 },
  /*  7 */ { blob: 2, nibbler: 3 },
  /*  8 */ { nibbler: 6 },
  /*  9 */ { meleer: 1, nibbler: 3 },
  /* 10 */ { meleer: 1, bat: 1, nibbler: 3 },
  /* 11 */ { meleer: 1, bat: 2, nibbler: 3 },
  /* 12 */ { meleer: 1, blob: 1, nibbler: 3 },
  /* 13 */ { meleer: 1, blob: 1, bat: 1, nibbler: 3 },
  /* 14 */ { meleer: 1, blob: 1, bat: 2, nibbler: 3 },
  /* 15 */ { meleer: 1, blob: 2, nibbler: 3 },
  /* 16 */ { meleer: 2, nibbler: 3 },
  /* 17 */ { nibbler: 6 },
  /* 18 */ { ranger: 1, nibbler: 3 },
  /* 19 */ { ranger: 1, bat: 1, nibbler: 3 },
  /* 20 */ { ranger: 1, bat: 2, nibbler: 3 },
  /* 21 */ { ranger: 1, blob: 1, nibbler: 3 },
  /* 22 */ { ranger: 1, blob: 1, bat: 1, nibbler: 3 },
  /* 23 */ { ranger: 1, blob: 1, bat: 2, nibbler: 3 },
  /* 24 */ { ranger: 1, blob: 2, nibbler: 3 },
  /* 25 */ { ranger: 1, meleer: 1, nibbler: 3 },
  /* 26 */ { ranger: 1, meleer: 1, bat: 1, nibbler: 3 },
  /* 27 */ { ranger: 1, meleer: 1, bat: 2, nibbler: 3 },
  /* 28 */ { ranger: 1, meleer: 1, blob: 1, nibbler: 3 },
  /* 29 */ { ranger: 1, meleer: 1, blob: 1, bat: 1, nibbler: 3 },
  /* 30 */ { ranger: 1, meleer: 1, blob: 1, bat: 2, nibbler: 3 },
  /* 31 */ { ranger: 1, meleer: 1, blob: 2, nibbler: 3 },
  /* 32 */ { ranger: 1, meleer: 2, nibbler: 3 },
  /* 33 */ { ranger: 2, nibbler: 3 },
  /* 34 */ { nibbler: 6 },
  /* 35 */ { mager: 1, nibbler: 3 },
  /* 36 */ { mager: 1, bat: 1, nibbler: 3 },
  /* 37 */ { mager: 1, bat: 2, nibbler: 3 },
  /* 38 */ { mager: 1, blob: 1, nibbler: 3 },
  /* 39 */ { mager: 1, blob: 1, bat: 1, nibbler: 3 },
  /* 40 */ { mager: 1, blob: 1, bat: 2, nibbler: 3 },
  /* 41 */ { mager: 1, blob: 2, nibbler: 3 },
  /* 42 */ { mager: 1, meleer: 1, nibbler: 3 },
  /* 43 */ { mager: 1, meleer: 1, bat: 1, nibbler: 3 },
  /* 44 */ { mager: 1, meleer: 1, bat: 2, nibbler: 3 },
  /* 45 */ { mager: 1, meleer: 1, blob: 1, nibbler: 3 },
  /* 46 */ { mager: 1, meleer: 1, blob: 1, bat: 1, nibbler: 3 },
  /* 47 */ { mager: 1, meleer: 1, blob: 1, bat: 2, nibbler: 3 },
  /* 48 */ { mager: 1, meleer: 1, blob: 2, nibbler: 3 },
  /* 49 */ { mager: 1, meleer: 2, nibbler: 3 },
  /* 50 */ { mager: 1, ranger: 1, nibbler: 3 },
  /* 51 */ { mager: 1, ranger: 1, bat: 1, nibbler: 3 },
  /* 52 */ { mager: 1, ranger: 1, bat: 2, nibbler: 3 },
  /* 53 */ { mager: 1, ranger: 1, blob: 1, nibbler: 3 },
  /* 54 */ { mager: 1, ranger: 1, blob: 1, bat: 1, nibbler: 3 },
  /* 55 */ { mager: 1, ranger: 1, blob: 1, bat: 2, nibbler: 3 },
  /* 56 */ { mager: 1, ranger: 1, blob: 2, nibbler: 3 },
  /* 57 */ { mager: 1, ranger: 1, meleer: 1, nibbler: 3 },
  /* 58 */ { mager: 1, ranger: 1, meleer: 1, bat: 1, nibbler: 3 },
  /* 59 */ { mager: 1, ranger: 1, meleer: 1, bat: 2, nibbler: 3 },
  /* 60 */ { mager: 1, ranger: 1, meleer: 1, blob: 1, nibbler: 3 },
  /* 61 */ { mager: 1, ranger: 1, meleer: 1, blob: 1, bat: 1, nibbler: 3 },
  /* 62 */ { mager: 1, ranger: 1, meleer: 1, blob: 1, bat: 2, nibbler: 3 },
  /* 63 */ { mager: 1, ranger: 1, meleer: 1, blob: 2, nibbler: 3 },
  /* 64 */ { mager: 1, ranger: 1, meleer: 2, nibbler: 3 },
  /* 65 */ { mager: 1, ranger: 2, nibbler: 3 },
  /* 66 */ { mager: 2, nibbler: 3 },
  /* 67 */ { jad: 1 },
  /* 68 */ { jad: 3 },
];

export function isInfernoWave(wave: number): boolean {
  return Number.isInteger(wave) && wave >= FIRST_INFERNO_WAVE && wave <= LAST_ORDINARY_WAVE;
}

export function waveComposition(wave: number): WaveComposition {
  if (!isInfernoWave(wave)) throw new RangeError(`Inferno wave out of range: ${wave}`);
  return WAVES[wave - FIRST_INFERNO_WAVE];
}

/** The batch's kinds in spawn order, one entry per NPC. */
export function waveSpawnKinds(wave: number): WaveNpcKind[] {
  const composition = waveComposition(wave);
  return WAVE_NPC_SPAWN_ORDER.flatMap((kind) => Array.from({ length: composition[kind] ?? 0 }, () => kind));
}
