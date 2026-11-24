import type { ZukPublicState } from '../zuk/snapshot';
import type { PillarKey } from './pillars';

/** `countdown` covers the gap before a wave and wave 69's intro; the run ends on Zuk's defeat. */
export type InfernoWavePhase = 'countdown' | 'active';

export interface InfernoPillarSnapshot {
  readonly key: PillarKey;
  readonly locId: number;
  readonly position: readonly [number, number];
  readonly intact: boolean;
  /** Proxy HP while standing (255 at full), 0 once collapsed. */
  readonly hp: number;
}

export interface InfernoPublicState {
  /** The wave being fought (1-69; 69 is TzKal-Zuk), or the next one during a countdown or intro. */
  readonly wave: number;
  readonly startWave: number;
  /**
   * The pillars this run was STARTED with already down, which {@link pillars} cannot answer: those
   * also collapse to nibblers mid-wave and together at the end of wave 66. The setup control reads
   * it to tell a choice the player has changed from the fight's own damage.
   */
  readonly startDestroyedPillars: Readonly<Record<PillarKey, boolean>>;
  /**
   * The custom spawn layout this run was STARTED with (`serializeSpawnLayout`), '' for none, for
   * the same comparison (`infernoRunSetupKey`). A recording without it reads as none through
   * `parseSpawnLayout`.
   */
  readonly startSpawnLayout: string;
  /**
   * The start tile this run was STARTED with (`serializeInfernoStartTile`, the setup's resolved
   * tile), '' for a start on wave 1 or 69, for the same comparison (`infernoRunSetupKey`). Retry and
   * Random spawns carry the attempt's own tile, so only a fresh entry or Go takes a changed one. A
   * tick-zero edit is taken by the setup, as its pillars are, though it does not move the player.
   * A recording without it reads as the default.
   */
  readonly startPlayerTile: string;
  /**
   * The wave whose spawns this run keeps for Retry (Lock layout), absent for none, as in a recording
   * without it. Kept after the run moves past it, where it no longer applies:
   * read it as `pinnedWave === wave`. A run-only choice, so not part of the setup key.
   */
  readonly pinnedWave?: number;
  /**
   * The slots the wave being fought actually spawned on (`serializeSpawnLayout`), random or custom,
   * so the player can keep or share it. '' before the wave spawns (a countdown, wave 69's intro) and
   * for a wave with nothing to place (nibbler-only waves, 67-69). A recording without it reads as
   * none through `parseSpawnLayout`.
   */
  readonly waveSpawnLayout: string;
  /**
   * The pillars already down when the wave being fought spawned (from wave 67 on, all of them), so a
   * shared spawn reproduces the wave even after a pillar falls mid-wave; {@link pillars} is live.
   * The run's {@link startDestroyedPillars} until its first wave spawns, and the last spawned wave's
   * through a countdown. A recording may lack it.
   */
  readonly waveStartDestroyedPillars: Readonly<Record<PillarKey, boolean>>;
  /**
   * The player's tile (local) when the wave being fought spawned, so a shared spawn can start the
   * player there. Null before the wave spawns (as {@link waveSpawnLayout}) and on wave 69, which
   * spawns no batch. A recording may lack it.
   */
  readonly waveStartPlayerTile: readonly [number, number] | null;
  readonly phase: InfernoWavePhase;
  /** Tick the next batch spawns on (for wave 69, its control tick); null while a wave is fought. */
  readonly nextWaveTick: number | null;
  readonly pillars: readonly InfernoPillarSnapshot[];
  /** Wave 69's fight state, from the tick its actors are added; null before. */
  readonly zuk: ZukPublicState | null;
}

export interface InfernoVisuals {
  /** Standing pillar LOCs, drawn by the encounter's scene-object controller. */
  readonly pillarLocs: readonly {
    readonly key: PillarKey;
    readonly locId: number;
    readonly position: readonly [number, number];
  }[];
  /**
   * Wave 69's control tick once the run is headed there, else null: the alcove scenery (prison walls,
   * static glyph) changes on fixed ticks around it (`ZUK_INTRO`). Always 0 on a run started at 69.
   */
  readonly zukControlTick: number | null;
}
