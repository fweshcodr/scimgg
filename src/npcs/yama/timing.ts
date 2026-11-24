import type { AttackKind } from '../../core/events/types';

export const YAMA_SIZE = 5;
export const YAMA_NPC_ID = 14176;
export const VOID_FLARE_NPC_ID = 14179;
/** `NpcActor.deathCause` of a flare that reached its fuse; the render config gives it the explode clip. */
export const VOID_FLARE_DETONATED_DEATH_CAUSE = 'detonated';
/**
 * A flare is inert for its first three ticks: on every one of the 303 flares across the Yama
 * captures its HP bar (`headbar id=2`) and fuse bar (`headbar id=75`) first appear on add+3, and no
 * `opnpc` on one is ever sent before add+4 (e.g.
 * capture yama-contract-of-bloodied-blows-voidflare-explosions-packet-data.txt Tick 543 `add`,
 * Tick 546 headbars).
 */
export const VOID_FLARE_UNTARGETABLE_TICKS = 3;
/**
 * The fuse bar (`headbar id=75, startfill=0, endfill=30, endtime=E`) fills over E/30 ticks from
 * add+3 and completes exactly two ticks before `npc_voidflare_explode` on every flare that reached
 * its fuse, whatever E was (360, 600 or 630).
 */
export const VOID_FLARE_FUSE_BAR_LEAD_TICKS = 2;

export type ResolvedYamaAttackPattern = {
  readonly beatStartTick: number;
  readonly beatIntervalTicks: number;
  readonly beatsPerCycle: number;
  readonly fireballBeats: readonly number[];
  /** Fireball beats that replace the auto from cycle 1 on; the rest cast alongside it. */
  readonly snapFireballBeats: readonly number[];
  /** `snapFireballBeats` for cycle 0. */
  readonly firstCycleSnapFireballBeats: readonly number[];
  readonly voidFlareBeats: readonly number[];
};

/**
 * Base (no contract) phase 3. Beat 3 snaps in cycle 0 only and casts alongside its fireball from
 * cycle 1: every base capture has no cast at control+26 and a cast with each later beat-3 throw
 * (e.g. packet ticks 906 and 976 in capture yama-packet-data.txt); the capture
 * conformance suite checks the cadence against every Yama capture.
 */
export const DEFAULT_YAMA_ATTACK_PATTERN: ResolvedYamaAttackPattern = {
  beatStartTick: 4,
  beatIntervalTicks: 7,
  beatsPerCycle: 10,
  fireballBeats: [0, 3, 7],
  snapFireballBeats: [0, 7],
  firstCycleSnapFireballBeats: [0, 3, 7],
  voidFlareBeats: [8],
};

export type YamaBeatInfo = {
  readonly isBeat: boolean;
  readonly beatIndex: number;
  readonly globalBeatOrdinal: number;
  readonly isFireballBeat: boolean;
  readonly isVoidFlareBeat: boolean;
  readonly fireballBeatKind: 'none' | 'snap' | 'overlay';
};

export function getYamaBeatInfo(tick: number, pattern: ResolvedYamaAttackPattern): YamaBeatInfo {
  const { beatStartTick, beatIntervalTicks, beatsPerCycle } = pattern;
  if (tick < beatStartTick || (tick - beatStartTick) % beatIntervalTicks !== 0) {
    return {
      isBeat: false,
      beatIndex: -1,
      globalBeatOrdinal: -1,
      isFireballBeat: false,
      isVoidFlareBeat: false,
      fireballBeatKind: 'none',
    };
  }

  const globalBeatOrdinal = (tick - beatStartTick) / beatIntervalTicks;
  const beatIndex = globalBeatOrdinal % beatsPerCycle;
  const isFireballBeat = pattern.fireballBeats.includes(beatIndex);
  const snapBeats = globalBeatOrdinal < beatsPerCycle ? pattern.firstCycleSnapFireballBeats : pattern.snapFireballBeats;
  return {
    isBeat: true,
    beatIndex,
    globalBeatOrdinal,
    isFireballBeat,
    isVoidFlareBeat: pattern.voidFlareBeats.includes(beatIndex),
    fireballBeatKind: isFireballBeat ? (snapBeats.includes(beatIndex) ? 'snap' : 'overlay') : 'none',
  };
}

/** First beat strictly after `tick`, so the tick a beat lands on already counts down to the next one. */
export function nextYamaBeatTick(tick: number, pattern: ResolvedYamaAttackPattern): number {
  const { beatStartTick, beatIntervalTicks } = pattern;
  if (tick < beatStartTick) return beatStartTick;
  return beatStartTick + Math.floor((tick - beatStartTick) / beatIntervalTicks + 1) * beatIntervalTicks;
}

export function getAttackKindForStyle(style: 'magic' | 'range' | 'melee'): AttackKind {
  if (style === 'melee') return 'melee_crush';
  return style === 'range' ? 'range_shadow' : 'magic_fire';
}

export function voidFlareHash(seed: number, index: number): number {
  return (Math.imul(seed, 2654435761) + Math.imul(index, 340573321)) >>> 0;
}
