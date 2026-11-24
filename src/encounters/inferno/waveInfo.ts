/**
 * Presentation-side facts about a wave: what players call its monsters, what a given wave
 * contains, and the waves each monster first appears on.
 *
 * Monster milestones and compositions come from the one wave table in `waves.ts`. Practice
 * checkpoints additionally name useful starting points; tests pin their compositions too.
 */
import { FIRST_INFERNO_WAVE, LAST_ORDINARY_WAVE, LAST_PILLAR_WAVE, ZUK_WAVE } from './constants';
import { WAVE_NPC_SPAWN_ORDER, type WaveNpcKind, waveComposition } from './waves';

/**
 * The names a player uses out loud, and the name the game gives the same monster.
 *
 * The short name leads because it is what the Inferno is discussed in and what fits a 200px
 * column; the game name is offered on hover so the two stay connected.
 */
export const WAVE_NPC_NAMES: Readonly<
  Record<WaveNpcKind, { readonly one: string; readonly many: string; readonly game: string }>
> = {
  mager: { one: 'mager', many: 'magers', game: 'Jal-Zek' },
  ranger: { one: 'ranger', many: 'rangers', game: 'Jal-Xil' },
  meleer: { one: 'meleer', many: 'meleers', game: 'Jal-ImKot' },
  blob: { one: 'blob', many: 'blobs', game: 'Jal-Ak' },
  bat: { one: 'bat', many: 'bats', game: 'Jal-MejRah' },
  nibbler: { one: 'nibbler', many: 'nibblers', game: 'Jal-Nib' },
  jad: { one: 'Jad', many: 'Jads', game: 'JalTok-Jad' },
};

/** Clamp anything to a wave this encounter can start on: 1-68, or TzKal-Zuk's 69. */
export function clampWave(wave: number): number {
  if (!Number.isFinite(wave)) return FIRST_INFERNO_WAVE;
  return Math.min(Math.max(Math.round(wave), FIRST_INFERNO_WAVE), ZUK_WAVE);
}

/** Pillars stand through wave 66 and are never up for the Jad waves. */
export function waveHasPillars(wave: number): boolean {
  return wave <= LAST_PILLAR_WAVE;
}

/** `[{ kind: 'mager', count: 1 }, …]` in the order the wave spawns them. Empty for wave 69. */
export function waveParts(wave: number): readonly { readonly kind: WaveNpcKind; readonly count: number }[] {
  const clamped = clampWave(wave);
  if (clamped === ZUK_WAVE) return [];
  const composition = waveComposition(clamped);
  return WAVE_NPC_SPAWN_ORDER.flatMap((kind) => {
    const count = composition[kind] ?? 0;
    return count > 0 ? [{ kind, count }] : [];
  });
}

/** What the wave spawns, e.g. "1 mager, 1 ranger, 1 meleer, 1 blob, 2 bats, 3 nibblers". */
export function waveCompositionText(wave: number): string {
  if (clampWave(wave) === ZUK_WAVE) return 'TzKal-Zuk';
  return waveParts(wave)
    .map(({ kind, count }) => `${count} ${count === 1 ? WAVE_NPC_NAMES[kind].one : WAVE_NPC_NAMES[kind].many}`)
    .join(', ');
}

/** The lowest wave spawning at least `count` of `kind`, or null if no wave does. */
function firstWaveWith(kind: WaveNpcKind, count: number): number | null {
  for (let wave = FIRST_INFERNO_WAVE; wave <= LAST_ORDINARY_WAVE; wave += 1) {
    if ((waveComposition(wave)[kind] ?? 0) >= count) return wave;
  }
  return null;
}

export interface WaveMilestone {
  readonly kind: WaveNpcKind;
  readonly count: number;
  readonly wave: number;
  /** Chip face: the monster, and the wave it arrives on. */
  readonly label: string;
  readonly hint: string;
}

/**
 * The jumps the picker offers: the first wave each monster appears on, in the order the Inferno
 * introduces them, plus wave 68 as the only wave with more than one Jad.
 *
 * This is the question a player actually asks ("where does the first mager wave start?"), which a
 * list of 68 numbers cannot answer. The waves are read from the table, never typed in here.
 */
export const WAVE_MILESTONES: readonly WaveMilestone[] = (
  [
    ['bat', 1],
    ['blob', 1],
    ['meleer', 1],
    ['ranger', 1],
    ['mager', 1],
    ['jad', 1],
    ['jad', 3],
  ] as const
).flatMap(([kind, count]) => {
  const wave = firstWaveWith(kind, count);
  if (wave === null) return [];
  const names = WAVE_NPC_NAMES[kind];
  const face = count === 1 ? names.one : `${count} ${names.many}`;
  return [
    {
      kind,
      count,
      wave,
      label: `${face.charAt(0).toUpperCase()}${face.slice(1)}`,
      hint:
        count === 1
          ? `${names.game} first appears on wave ${wave}.`
          : `Wave ${wave} is the only wave with ${count} ${names.many}.`,
    },
  ];
});

export interface WaveJump {
  /** Stable list key. */
  readonly id: string;
  readonly wave: number;
  /** What the wave is known by, in full: the button's accessible name. */
  readonly label: string;
  /** The button's face beside the wave number, where that is shorter than {@link label}. */
  readonly face: string;
  readonly hint: string;
}

/**
 * The destinations the start-wave picker offers: monster firsts, practice checkpoints, and Zuk.
 *
 * He is written here rather than derived, because wave 69 spawns no ordinary monsters and so has
 * no row in the wave table; the wave itself still comes from the constant the fight runs on. The
 * replay chapters read {@link WAVE_MILESTONES} instead: those answer which monster a wave
 * introduces, which is a different question from where a player wants to start.
 */
export const WAVE_JUMPS: readonly WaveJump[] = [
  ...WAVE_MILESTONES.map((milestone) => ({
    id: `${milestone.kind}-${milestone.count}`,
    wave: milestone.wave,
    label: milestone.label,
    face: milestone.label,
    hint: milestone.hint,
  })),
  {
    id: 'mager-ranger',
    wave: 50,
    label: 'Mager and ranger',
    face: 'M + R',
    hint: 'The first wave with a mager and a ranger together. A common practice start.',
  },
  {
    id: 'hard-practice',
    wave: 63,
    label: 'Hard wave',
    face: 'Hard',
    hint: 'A mager, ranger, meleer and two blobs. Often named one of the hardest waves to solve.',
  },
  {
    id: 'zuk',
    wave: ZUK_WAVE,
    label: 'TzKal-Zuk',
    // What players call him, and what fits a compact chip beside his wave number.
    face: 'Zuk',
    hint: `TzKal-Zuk is wave ${ZUK_WAVE}, the last wave of the Inferno.`,
  },
].sort((a, b) => a.wave - b.wave);
