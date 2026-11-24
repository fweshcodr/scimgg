/**
 * Yama Phase 3 "shadow waves" (shadow walls).
 *
 * Diagonal X-shaped walls that sweep SOUTH → NORTH across the arena. (This is the
 * diagonal shadow wave — NOT the east/west fire wall, which is a Phase 1/2
 * mechanic and is not modeled here.)
 *
 * - L wave: y - x = L_BASE + WAVE_SPEED * tp   (the "\" arm)
 * - R wave: x + y = R_BASE + WAVE_SPEED * tp   (the "/" arm)
 * The two arms cross at x = 30; the crossing travels north at WAVE_SPEED tiles/tick.
 *
 * Cycle structure:
 *   - each cycle is a group of staggered X waves at `deltas`, one group per period.
 *   - FIRST CYCLE IS PARTIAL for base: only the delta-14 wave fires. This is REAL, not a
 *     capture gap: the client is fully streaming world data from control+1 yet emits a
 *     single shadow wall in cycle 0.
 *
 * Spatial extent: each X is confined to a central band (see WAVE_DIFF_* /
 * WAVE_SUM_*); it does not reach the arena corners. Without this band the raw
 * diagonals would extend to the corners and become "dangerous" several ticks
 * before the real wall exists.
 *
 * Contract wave offsets:
 * Sigil contracts jitter each staggered wave, and the mechanism is TEMPORAL, not spatial:
 * the two arms are sent as separate batches, every batch of a given arm carries the same
 * (coord, delay) payload, and a jittered arm is simply emitted one tick later — which puts
 * it 2 tiles back along its own diagonal. So the band must NOT move with the offset: a late
 * arm lights the same tiles one tick later, leaving its extent unchanged. Packet counts are in
 * the Yama captures; `__tests__/captureConformance.test.ts` checks them and
 * `waves.test.ts` locks all three.
 */

export const DEFAULT_WAVE_DELTAS: readonly number[] = [0, 14, 21];
export const DEFAULT_WAVE_PERIOD = 70;
/**
 * Ticks the wave grid is delayed from encounter start (sim tick 0 = P3 control
 * regained). With L_BASE/R_BASE and speed 2 the delta-0 wave's first dangerous
 * tile lands at sim tick 16 + 70*cycle, reproducing the packet captures.
 */
export const DEFAULT_WAVE_START_DELAY = 7;
/**
 * Which `deltas` actually fire in the FIRST cycle (cycleNum 0). Base P3 fires only
 * the middle (delta-14) wave in cycle 0 — a single lone X — then all three from
 * cycle 1 on. Configs that fire every wave from the start (sigil contracts) set
 * this to their full `deltas` list.
 */
export const DEFAULT_FIRST_CYCLE_DELTAS: readonly number[] = [14];
const L_BASE = -40; // base diagonal for L waves (y - x)
const R_BASE = 20; // base diagonal for R waves (x + y)
export const DEFAULT_WAVE_SPEED = 2; // tiles per tick along the diagonal

// Central band the shadow-wave X is confined to (sim coords, base/no-offset).
// Applied to BOTH arms so each is a bounded segment, not an arena-spanning line.
const WAVE_DIFF_MIN = -19; // min y - x
const WAVE_DIFF_MAX = 19; // max y - x
const WAVE_SUM_MIN = 40; // min x + y
const WAVE_SUM_MAX = 81; // max x + y

export interface WaveConfig {
  periodTicks?: number;
  deltas?: readonly number[];
  speedTilesPerTick?: number;
  /** Jitter each staggered wave's arms one tick late, independently (sigil contracts). */
  randomOffsets?: boolean;
  /** Seed for deterministic offset selection. Required when randomOffsets is true. */
  seed?: number;
  /** Ticks to delay the wave grid from encounter start. Base P3 = 7. */
  startDelay?: number;
  /** Deltas allowed to fire in cycle 0. Base P3 = [14] (lone first wave). */
  firstCycleDeltas?: readonly number[];
}

interface WavePhase {
  tp: number; // phase-tick within the period [0, period)
  cycleNum: number; // which cycle (0 = first); negative before the grid starts
}

function wavePhase(tick: number, delta: number, period: number, startDelay: number): WavePhase {
  const phase = tick + 1 - delta - startDelay;
  return {
    tp: ((phase % period) + period) % period,
    cycleNum: Math.floor(phase / period),
  };
}

function isWaveActiveInCycle(delta: number, cycleNum: number, firstCycleDeltas: readonly number[]): boolean {
  if (cycleNum < 0) return false;
  if (cycleNum === 0) return firstCycleDeltas.includes(delta);
  return true;
}

function isInWaveBand(yDiff: number, xSum: number): boolean {
  return yDiff >= WAVE_DIFF_MIN && yDiff <= WAVE_DIFF_MAX && xSum >= WAVE_SUM_MIN && xSum <= WAVE_SUM_MAX;
}

/**
 * Possible wave set offsets: [lBaseAdjust, rBaseAdjust]. -2 on an arm puts it one tick
 * behind, which is how the packet expresses the jitter. The two arms flip independently, so
 * dropping the both-arms-late entry silently under-reports danger on a quarter of every
 * contract's staggered waves.
 */
const WAVE_OFFSET_VARIANTS: readonly (readonly [number, number])[] = [
  [0, 0],
  [0, -2], // R arm a tick late
  [-2, 0], // L arm a tick late
  [-2, -2], // both arms a tick late
];

function waveOffsetHash(seed: number, waveIndex: number, cycle: number): number {
  // A zero multiplier would collapse every seed onto the same variant, so neither term may
  // vanish: cycle 0 is real and delta-0 waves never reach here, hence both +1s.
  let h = Math.imul(seed ^ 0x9e3779b9, (waveIndex + 1) * 2654435761 + (cycle + 1) * 340573321);
  // murmur3 fmix32. The variant count is a power of two, so the selection below reads ONLY
  // the low two bits, and a bare `imul` product barely varies there: seeds 111 and 999 pick
  // an identical variant for every wave of every cycle without this avalanche.
  h ^= h >>> 16;
  h = Math.imul(h, 0x85ebca6b);
  h ^= h >>> 13;
  h = Math.imul(h, 0xc2b2ae35);
  h ^= h >>> 16;
  return h >>> 0;
}

/**
 * The delta-0 wave that leads each cycle is never jittered. Keyed on the delta rather than
 * the array position so it stays correct for a config whose `deltas` are not ascending.
 */
function getWaveSetOffset(seed: number, waveIndex: number, delta: number, cycle: number): readonly [number, number] {
  if (delta === 0) return WAVE_OFFSET_VARIANTS[0];
  const hash = waveOffsetHash(seed, waveIndex, cycle);
  return WAVE_OFFSET_VARIANTS[hash % WAVE_OFFSET_VARIANTS.length];
}

export function isWaveTile(x: number, y: number, tick: number, config?: WaveConfig): boolean {
  const period = config?.periodTicks ?? DEFAULT_WAVE_PERIOD;
  const deltas = config?.deltas ?? DEFAULT_WAVE_DELTAS;
  const speed = config?.speedTilesPerTick ?? DEFAULT_WAVE_SPEED;
  const startDelay = config?.startDelay ?? DEFAULT_WAVE_START_DELAY;
  const firstCycleDeltas = config?.firstCycleDeltas ?? DEFAULT_FIRST_CYCLE_DELTAS;
  const seed = config?.seed;
  const useOffsets = config?.randomOffsets === true && seed !== undefined;

  const yDiff = y - x;
  const xSum = x + y;

  for (let i = 0; i < deltas.length; i++) {
    const { tp, cycleNum } = wavePhase(tick, deltas[i], period, startDelay);
    if (!isWaveActiveInCycle(deltas[i], cycleNum, firstCycleDeltas)) continue;
    const diag = speed * tp;
    let lBase = L_BASE;
    let rBase = R_BASE;
    if (useOffsets) {
      const offset = getWaveSetOffset(seed, i, deltas[i], cycleNum);
      lBase += offset[0];
      rBase += offset[1];
    }
    if (!isInWaveBand(yDiff, xSum)) continue;
    const L = yDiff - diag;
    if (L === lBase || L === lBase + 1) return true;
    const R = xSum - diag;
    if (R === rBase || R === rBase + 1) return true;
  }
  return false;
}

export interface WaveTileInfo {
  x: number;
  y: number;
  waveType: 'L' | 'R';
  waveIndex: number;
  layer: 0 | 1;
}

export function getWaveTiles(
  tick: number,
  minX: number,
  maxX: number,
  minY: number,
  maxY: number,
  config?: WaveConfig,
): WaveTileInfo[] {
  const tiles: WaveTileInfo[] = [];
  const period = config?.periodTicks ?? DEFAULT_WAVE_PERIOD;
  const deltas = config?.deltas ?? DEFAULT_WAVE_DELTAS;
  const speed = config?.speedTilesPerTick ?? DEFAULT_WAVE_SPEED;
  const startDelay = config?.startDelay ?? DEFAULT_WAVE_START_DELAY;
  const firstCycleDeltas = config?.firstCycleDeltas ?? DEFAULT_FIRST_CYCLE_DELTAS;
  const seed = config?.seed;
  const useOffsets = config?.randomOffsets === true && seed !== undefined;

  for (let waveIndex = 0; waveIndex < deltas.length; waveIndex++) {
    const { tp, cycleNum } = wavePhase(tick, deltas[waveIndex], period, startDelay);
    if (!isWaveActiveInCycle(deltas[waveIndex], cycleNum, firstCycleDeltas)) continue;
    const diag = speed * tp;
    let lBase = L_BASE;
    let rBase = R_BASE;
    if (useOffsets) {
      const offset = getWaveSetOffset(seed, waveIndex, deltas[waveIndex], cycleNum);
      lBase += offset[0];
      rBase += offset[1];
    }

    const lOffset = lBase + diag;
    for (let x = minX; x <= maxX; x++) {
      const y0 = x + lOffset;
      const y1 = y0 + 1;
      if (y0 >= minY && y0 <= maxY && isInWaveBand(y0 - x, x + y0)) {
        tiles.push({ x, y: y0, waveType: 'L', waveIndex, layer: 0 });
      }
      if (y1 >= minY && y1 <= maxY && isInWaveBand(y1 - x, x + y1)) {
        tiles.push({ x, y: y1, waveType: 'L', waveIndex, layer: 1 });
      }
    }

    const rOffset = rBase + diag;
    for (let x = minX; x <= maxX; x++) {
      const y0 = rOffset - x;
      const y1 = y0 + 1;
      if (y0 >= minY && y0 <= maxY && isInWaveBand(y0 - x, x + y0)) {
        tiles.push({ x, y: y0, waveType: 'R', waveIndex, layer: 0 });
      }
      if (y1 >= minY && y1 <= maxY && isInWaveBand(y1 - x, x + y1)) {
        tiles.push({ x, y: y1, waveType: 'R', waveIndex, layer: 1 });
      }
    }
  }

  return tiles;
}
