import { describe, expect, it } from 'vitest';
import {
  BASE_YAMA_CONFIG,
  BLOODIED_BLOWS_CONFIG,
  DIVINE_SEVERANCE_CONFIG,
  FORFEIT_BREATH_CONFIG,
  GLYPHIC_ATTENUATION_CONFIG,
  resolveEncounterConfig,
  SENSORY_CLOUDING_CONFIG,
  type YamaContractConfig,
} from '../contractConfig';
import {
  DEFAULT_FIRST_CYCLE_DELTAS,
  DEFAULT_WAVE_DELTAS,
  DEFAULT_WAVE_PERIOD,
  DEFAULT_WAVE_SPEED,
  DEFAULT_WAVE_START_DELAY,
  getWaveTiles,
  isWaveTile,
  type WaveConfig,
} from '../waves';

/**
 * Phase-3 shadow-wave ground truth, auto-extracted from
 * capture yama-packet-data.txt (the diagonal shadow wall — vfx_shadow_wall_02 /
 * _03 — NOT the east/west fire wall).
 *
 * This is the SINGLE lone wave that fires in base cycle 0 (the delta-14 member).
 * Emission is sim tick 26 and the first danger tile is at sim tick 30. Key: t =
 * ticks since emission (tile dangerous when delay ∈ {30t, 30t+15}); a tile at
 * offset t maps to sim tick 26+t.
 *
 * Cross-capture analysis (`captureConformance.test.ts`) showed the FULL cycle
 * structure: period 70, base deltas [0,14,21], but cycle 0 fires only delta-14
 * (this lone wave), then 3 staggered waves every cycle after.
 */
const PACKET_WAVE_TILES: Record<number, [number, number][]> = {
  4: [
    [18, 22],
    [18, 23],
    [19, 22],
    [40, 21],
    [41, 22],
  ],
  5: [
    [17, 26],
    [18, 24],
    [19, 23],
    [19, 24],
    [20, 22],
    [20, 23],
    [21, 21],
    [21, 22],
    [22, 21],
    [38, 21],
    [39, 21],
    [39, 22],
    [40, 22],
    [40, 23],
    [41, 23],
    [41, 24],
    [42, 24],
    [42, 25],
    [43, 25],
    [43, 26],
    [44, 26],
  ],
  6: [
    [18, 26],
    [18, 27],
    [19, 25],
    [19, 26],
    [20, 24],
    [20, 25],
    [21, 23],
    [21, 24],
    [22, 22],
    [22, 23],
    [23, 21],
    [23, 22],
    [24, 21],
    [36, 21],
    [37, 21],
    [37, 22],
    [38, 22],
    [38, 23],
    [39, 23],
    [39, 24],
    [40, 24],
    [40, 25],
    [41, 25],
    [41, 26],
    [42, 26],
    [42, 27],
  ],
  7: [
    [18, 28],
    [18, 29],
    [19, 27],
    [19, 28],
    [20, 26],
    [20, 27],
    [21, 25],
    [21, 26],
    [22, 24],
    [22, 25],
    [23, 23],
    [23, 24],
    [24, 22],
    [24, 23],
    [25, 21],
    [25, 22],
    [26, 21],
    [33, 20],
    [34, 20],
    [34, 21],
    [35, 21],
    [35, 22],
    [36, 22],
    [36, 23],
    [37, 23],
    [37, 24],
    [38, 24],
    [38, 25],
    [39, 25],
    [39, 26],
    [40, 26],
    [40, 27],
    [41, 27],
    [41, 28],
    [42, 28],
    [42, 29],
  ],
  8: [
    [19, 29],
    [19, 30],
    [20, 28],
    [20, 29],
    [21, 27],
    [21, 28],
    [22, 26],
    [22, 27],
    [23, 25],
    [23, 26],
    [24, 24],
    [24, 25],
    [25, 23],
    [25, 24],
    [26, 22],
    [26, 23],
    [27, 21],
    [27, 22],
    [28, 20],
    [28, 21],
    [29, 20],
    [31, 20],
    [32, 20],
    [32, 21],
    [33, 21],
    [33, 22],
    [34, 22],
    [34, 23],
    [35, 23],
    [35, 24],
    [36, 24],
    [36, 25],
    [37, 25],
    [37, 26],
    [38, 26],
    [38, 27],
    [39, 27],
    [39, 28],
    [40, 28],
    [40, 29],
    [41, 29],
    [41, 30],
    [42, 30],
    [42, 31],
    [43, 31],
    [43, 32],
  ],
  9: [
    [18, 33],
    [19, 31],
    [19, 32],
    [20, 30],
    [20, 31],
    [21, 29],
    [21, 30],
    [22, 28],
    [22, 29],
    [23, 27],
    [23, 28],
    [24, 26],
    [24, 27],
    [25, 25],
    [25, 26],
    [26, 24],
    [26, 25],
    [27, 23],
    [27, 24],
    [28, 22],
    [28, 23],
    [29, 20],
    [29, 21],
    [29, 22],
    [30, 20],
    [30, 21],
    [31, 20],
    [31, 21],
    [31, 22],
    [32, 22],
    [32, 23],
    [33, 23],
    [33, 24],
    [34, 24],
    [34, 25],
    [35, 25],
    [35, 26],
    [36, 26],
    [36, 27],
    [37, 27],
    [37, 28],
    [38, 28],
    [38, 29],
    [39, 29],
    [39, 30],
    [40, 30],
    [40, 31],
    [41, 31],
    [41, 32],
    [42, 32],
    [42, 33],
    [43, 33],
    [43, 34],
  ],
  10: [
    [18, 34],
    [18, 35],
    [19, 33],
    [19, 34],
    [20, 32],
    [20, 33],
    [21, 31],
    [21, 32],
    [22, 30],
    [22, 31],
    [23, 29],
    [23, 30],
    [24, 28],
    [24, 29],
    [25, 27],
    [25, 28],
    [26, 26],
    [26, 27],
    [27, 25],
    [27, 26],
    [28, 20],
    [28, 21],
    [28, 24],
    [28, 25],
    [29, 21],
    [29, 22],
    [29, 23],
    [29, 24],
    [30, 22],
    [30, 23],
    [31, 21],
    [31, 22],
    [31, 23],
    [31, 24],
    [32, 20],
    [32, 21],
    [32, 24],
    [32, 25],
    [33, 20],
    [33, 25],
    [33, 26],
    [34, 26],
    [34, 27],
    [35, 27],
    [35, 28],
    [36, 28],
    [36, 29],
    [37, 29],
    [37, 30],
    [38, 30],
    [38, 31],
    [39, 31],
    [39, 32],
    [40, 32],
    [40, 33],
    [41, 33],
    [41, 34],
    [42, 34],
    [42, 35],
    [43, 35],
    [43, 36],
    [44, 36],
    [44, 37],
  ],
  11: [
    [18, 37],
    [19, 35],
    [19, 36],
    [20, 34],
    [20, 35],
    [21, 33],
    [21, 34],
    [22, 32],
    [22, 33],
    [23, 31],
    [23, 32],
    [24, 30],
    [24, 31],
    [25, 29],
    [25, 30],
    [26, 21],
    [26, 28],
    [26, 29],
    [27, 21],
    [27, 22],
    [27, 27],
    [27, 28],
    [28, 22],
    [28, 23],
    [28, 26],
    [28, 27],
    [29, 23],
    [29, 24],
    [29, 25],
    [29, 26],
    [30, 24],
    [30, 25],
    [31, 23],
    [31, 24],
    [31, 25],
    [31, 26],
    [32, 22],
    [32, 23],
    [32, 26],
    [32, 27],
    [33, 21],
    [33, 22],
    [33, 27],
    [33, 28],
    [34, 20],
    [34, 21],
    [34, 28],
    [34, 29],
    [35, 29],
    [35, 30],
    [36, 30],
    [36, 31],
    [37, 31],
    [37, 32],
    [38, 32],
    [38, 33],
    [39, 33],
    [39, 34],
    [40, 34],
    [40, 35],
    [41, 35],
    [41, 36],
    [42, 36],
    [42, 37],
    [43, 37],
    [43, 38],
  ],
  12: [
    [19, 37],
    [20, 36],
    [20, 37],
    [21, 35],
    [21, 36],
    [22, 34],
    [22, 35],
    [23, 33],
    [23, 34],
    [24, 21],
    [24, 32],
    [24, 33],
    [25, 21],
    [25, 22],
    [25, 31],
    [25, 32],
    [26, 22],
    [26, 23],
    [26, 30],
    [26, 31],
    [27, 23],
    [27, 24],
    [27, 29],
    [27, 30],
    [28, 24],
    [28, 25],
    [28, 28],
    [28, 29],
    [29, 25],
    [29, 26],
    [29, 27],
    [29, 28],
    [30, 26],
    [30, 27],
    [31, 25],
    [31, 26],
    [31, 27],
    [31, 28],
    [32, 24],
    [32, 25],
    [32, 28],
    [32, 29],
    [33, 23],
    [33, 24],
    [33, 29],
    [33, 30],
    [34, 22],
    [34, 23],
    [34, 30],
    [34, 31],
    [35, 21],
    [35, 22],
    [35, 31],
    [35, 32],
    [36, 21],
    [36, 32],
    [36, 33],
    [37, 33],
    [37, 34],
    [38, 34],
    [38, 35],
    [39, 35],
    [39, 36],
    [40, 36],
    [40, 37],
    [41, 37],
    [41, 38],
    [42, 38],
  ],
  13: [
    [20, 38],
    [21, 37],
    [22, 21],
    [22, 36],
    [22, 37],
    [23, 21],
    [23, 22],
    [23, 35],
    [23, 36],
    [24, 22],
    [24, 23],
    [24, 34],
    [24, 35],
    [25, 23],
    [25, 24],
    [25, 33],
    [25, 34],
    [26, 24],
    [26, 25],
    [26, 32],
    [26, 33],
    [27, 25],
    [27, 26],
    [27, 31],
    [27, 32],
    [28, 26],
    [28, 27],
    [28, 30],
    [28, 31],
    [29, 27],
    [29, 28],
    [29, 29],
    [29, 30],
    [30, 28],
    [30, 29],
    [31, 27],
    [31, 28],
    [31, 29],
    [31, 30],
    [32, 26],
    [32, 27],
    [32, 30],
    [32, 31],
    [33, 25],
    [33, 26],
    [33, 31],
    [33, 32],
    [34, 24],
    [34, 25],
    [34, 32],
    [34, 33],
    [35, 23],
    [35, 24],
    [35, 33],
    [35, 34],
    [36, 22],
    [36, 23],
    [36, 34],
    [36, 35],
    [37, 21],
    [37, 22],
    [37, 35],
    [37, 36],
    [38, 21],
    [38, 36],
    [38, 37],
    [39, 37],
    [39, 38],
    [40, 38],
  ],
  14: [
    [21, 21],
    [21, 22],
    [22, 22],
    [22, 23],
    [23, 23],
    [23, 24],
    [23, 37],
    [23, 38],
    [24, 24],
    [24, 25],
    [24, 36],
    [24, 37],
    [25, 25],
    [25, 26],
    [25, 35],
    [25, 36],
    [26, 26],
    [26, 27],
    [26, 34],
    [26, 35],
    [27, 27],
    [27, 28],
    [27, 33],
    [27, 34],
    [28, 28],
    [28, 29],
    [28, 32],
    [28, 33],
    [29, 29],
    [29, 30],
    [29, 31],
    [29, 32],
    [30, 30],
    [30, 31],
    [31, 29],
    [31, 30],
    [31, 31],
    [31, 32],
    [32, 28],
    [32, 29],
    [32, 32],
    [32, 33],
    [33, 27],
    [33, 28],
    [33, 33],
    [33, 34],
    [34, 26],
    [34, 27],
    [34, 34],
    [34, 35],
    [35, 25],
    [35, 26],
    [35, 35],
    [35, 36],
    [36, 24],
    [36, 25],
    [36, 36],
    [36, 37],
    [37, 23],
    [37, 24],
    [37, 37],
    [37, 38],
    [38, 22],
    [38, 23],
    [38, 38],
    [38, 39],
    [39, 21],
    [39, 22],
    [40, 21],
  ],
  15: [
    [19, 22],
    [20, 22],
    [20, 23],
    [21, 23],
    [21, 24],
    [22, 24],
    [22, 25],
    [23, 25],
    [23, 26],
    [24, 26],
    [24, 27],
    [24, 38],
    [25, 27],
    [25, 28],
    [25, 37],
    [25, 38],
    [26, 28],
    [26, 29],
    [26, 36],
    [26, 37],
    [27, 29],
    [27, 30],
    [27, 35],
    [27, 36],
    [28, 30],
    [28, 31],
    [28, 34],
    [28, 35],
    [29, 31],
    [29, 32],
    [29, 33],
    [29, 34],
    [30, 32],
    [30, 33],
    [31, 31],
    [31, 32],
    [31, 33],
    [31, 34],
    [32, 30],
    [32, 31],
    [32, 34],
    [32, 35],
    [33, 29],
    [33, 30],
    [33, 35],
    [33, 36],
    [34, 28],
    [34, 29],
    [34, 36],
    [34, 37],
    [35, 27],
    [35, 28],
    [35, 37],
    [35, 38],
    [36, 26],
    [36, 27],
    [36, 38],
    [36, 39],
    [37, 25],
    [37, 26],
    [37, 39],
    [38, 24],
    [38, 25],
    [39, 23],
    [39, 24],
    [40, 22],
    [40, 23],
    [41, 22],
  ],
  16: [
    [18, 22],
    [18, 23],
    [19, 23],
    [19, 24],
    [20, 24],
    [20, 25],
    [21, 25],
    [21, 26],
    [22, 26],
    [22, 27],
    [23, 27],
    [23, 28],
    [24, 28],
    [24, 29],
    [25, 29],
    [25, 30],
    [25, 39],
    [26, 30],
    [26, 31],
    [26, 38],
    [26, 39],
    [27, 31],
    [27, 32],
    [27, 37],
    [27, 38],
    [28, 32],
    [28, 33],
    [28, 36],
    [28, 37],
    [29, 33],
    [29, 34],
    [29, 35],
    [29, 36],
    [30, 34],
    [30, 35],
    [31, 33],
    [31, 34],
    [31, 35],
    [31, 36],
    [32, 32],
    [32, 33],
    [32, 36],
    [32, 37],
    [33, 31],
    [33, 32],
    [33, 37],
    [33, 38],
    [34, 30],
    [34, 31],
    [34, 38],
    [34, 39],
    [35, 29],
    [35, 30],
    [35, 39],
    [35, 40],
    [36, 28],
    [36, 29],
    [37, 27],
    [37, 28],
    [38, 26],
    [38, 27],
    [39, 25],
    [39, 26],
    [40, 24],
    [40, 25],
    [41, 23],
    [41, 24],
  ],
  17: [
    [18, 24],
    [19, 25],
    [19, 26],
    [20, 26],
    [20, 27],
    [21, 27],
    [21, 28],
    [22, 28],
    [22, 29],
    [23, 29],
    [23, 30],
    [24, 30],
    [24, 31],
    [25, 31],
    [25, 32],
    [26, 32],
    [26, 33],
    [26, 40],
    [27, 33],
    [27, 34],
    [27, 39],
    [27, 40],
    [28, 34],
    [28, 35],
    [28, 38],
    [28, 39],
    [29, 35],
    [29, 36],
    [29, 37],
    [29, 38],
    [30, 36],
    [30, 37],
    [31, 35],
    [31, 36],
    [31, 37],
    [31, 38],
    [32, 34],
    [32, 35],
    [32, 38],
    [32, 39],
    [33, 33],
    [33, 34],
    [33, 39],
    [33, 40],
    [34, 32],
    [34, 33],
    [34, 40],
    [35, 31],
    [35, 32],
    [35, 42],
    [36, 30],
    [36, 31],
    [37, 29],
    [37, 30],
    [38, 28],
    [38, 29],
    [39, 27],
    [39, 28],
    [40, 26],
    [40, 27],
    [41, 25],
    [41, 26],
    [42, 24],
    [42, 25],
  ],
  18: [
    [17, 26],
    [18, 26],
    [18, 27],
    [19, 27],
    [19, 28],
    [20, 28],
    [20, 29],
    [21, 29],
    [21, 30],
    [22, 30],
    [22, 31],
    [23, 31],
    [23, 32],
    [24, 32],
    [24, 33],
    [25, 33],
    [25, 34],
    [26, 34],
    [26, 35],
    [27, 35],
    [27, 36],
    [28, 36],
    [28, 37],
    [28, 40],
    [29, 37],
    [29, 38],
    [29, 39],
    [29, 40],
    [30, 38],
    [30, 39],
    [31, 37],
    [31, 38],
    [31, 39],
    [31, 40],
    [32, 36],
    [32, 37],
    [32, 40],
    [33, 35],
    [33, 36],
    [33, 42],
    [34, 34],
    [34, 35],
    [34, 42],
    [34, 43],
    [35, 33],
    [35, 34],
    [35, 43],
    [35, 44],
    [36, 32],
    [36, 33],
    [37, 31],
    [37, 32],
    [38, 30],
    [38, 31],
    [39, 29],
    [39, 30],
    [40, 28],
    [40, 29],
    [41, 27],
    [41, 28],
    [42, 26],
    [42, 27],
    [43, 25],
    [43, 26],
  ],
  19: [
    [18, 28],
    [18, 29],
    [19, 29],
    [19, 30],
    [20, 30],
    [20, 31],
    [21, 31],
    [21, 32],
    [22, 32],
    [22, 33],
    [23, 33],
    [23, 34],
    [24, 34],
    [24, 35],
    [25, 35],
    [25, 36],
    [26, 36],
    [26, 37],
    [27, 37],
    [27, 38],
    [27, 43],
    [27, 44],
    [28, 38],
    [28, 39],
    [28, 42],
    [28, 43],
    [29, 39],
    [29, 40],
    [29, 42],
    [30, 40],
    [31, 39],
    [31, 40],
    [31, 42],
    [32, 38],
    [32, 39],
    [32, 42],
    [32, 43],
    [33, 37],
    [33, 38],
    [33, 43],
    [33, 44],
    [34, 36],
    [34, 37],
    [34, 44],
    [34, 45],
    [35, 35],
    [35, 36],
    [35, 45],
    [36, 34],
    [36, 35],
    [37, 33],
    [37, 34],
    [38, 32],
    [38, 33],
    [39, 31],
    [39, 32],
    [40, 30],
    [40, 31],
    [41, 29],
    [41, 30],
    [42, 28],
    [42, 29],
    [44, 26],
  ],
  20: [
    [19, 31],
    [19, 32],
    [20, 32],
    [20, 33],
    [21, 33],
    [21, 34],
    [22, 34],
    [22, 35],
    [23, 35],
    [23, 36],
    [24, 36],
    [24, 37],
    [25, 37],
    [25, 38],
    [26, 38],
    [26, 39],
    [27, 39],
    [27, 40],
    [27, 45],
    [28, 40],
    [28, 44],
    [28, 45],
    [29, 42],
    [29, 43],
    [29, 44],
    [30, 42],
    [30, 43],
    [31, 42],
    [31, 43],
    [31, 44],
    [32, 40],
    [32, 44],
    [32, 45],
    [33, 39],
    [33, 40],
    [33, 45],
    [34, 38],
    [34, 39],
    [35, 37],
    [35, 38],
    [36, 36],
    [36, 37],
    [37, 35],
    [37, 36],
    [38, 34],
    [38, 35],
    [39, 33],
    [39, 34],
    [40, 32],
    [40, 33],
    [41, 31],
    [41, 32],
    [42, 30],
    [42, 31],
  ],
  21: [
    [18, 33],
    [19, 33],
    [19, 34],
    [20, 34],
    [20, 35],
    [21, 35],
    [21, 36],
    [22, 36],
    [22, 37],
    [23, 37],
    [23, 38],
    [24, 38],
    [25, 39],
    [26, 40],
    [28, 42],
    [28, 43],
    [29, 43],
    [29, 44],
    [29, 45],
    [30, 44],
    [30, 45],
    [31, 43],
    [31, 44],
    [31, 45],
    [32, 42],
    [32, 43],
    [33, 42],
    [34, 40],
    [35, 39],
    [35, 40],
    [36, 38],
    [36, 39],
    [37, 37],
    [37, 38],
    [38, 36],
    [38, 37],
    [39, 35],
    [39, 36],
    [40, 34],
    [40, 35],
    [41, 33],
    [41, 34],
    [42, 32],
    [42, 33],
    [43, 31],
    [43, 32],
  ],
  22: [
    [18, 34],
    [18, 35],
    [19, 35],
    [19, 36],
    [20, 36],
    [20, 37],
    [21, 37],
    [27, 43],
    [27, 44],
    [28, 44],
    [28, 45],
    [29, 45],
    [31, 45],
    [32, 44],
    [32, 45],
    [33, 43],
    [33, 44],
    [34, 42],
    [34, 43],
    [35, 42],
    [37, 39],
    [38, 38],
    [38, 39],
    [39, 37],
    [39, 38],
    [40, 36],
    [40, 37],
    [41, 35],
    [41, 36],
    [42, 34],
    [42, 35],
    [43, 33],
    [43, 34],
  ],
  23: [
    [18, 37],
    [19, 37],
    [20, 38],
    [27, 45],
    [33, 45],
    [34, 44],
    [34, 45],
    [35, 43],
    [35, 44],
    [40, 38],
    [41, 37],
    [41, 38],
    [42, 36],
    [42, 37],
    [43, 35],
    [43, 36],
  ],
  24: [
    [35, 45],
    [42, 38],
    [43, 37],
    [43, 38],
    [44, 36],
    [44, 37],
  ],
};

const BOUNDS = { minX: 17, maxX: 44, minY: 0, maxY: 45 };
const EMISSION_SIM_TICK = 26; // base cycle-0 lone wave emitted at packet 836 - control 810
const baseConfig: WaveConfig = resolveEncounterConfig().waves;

const tileKey = (x: number, y: number): string => `${x},${y}`;
function waveTileSet(tick: number, cfg: WaveConfig = baseConfig): Set<string> {
  return new Set(
    getWaveTiles(tick, BOUNDS.minX, BOUNDS.maxX, BOUNDS.minY, BOUNDS.maxY, cfg).map((t) => tileKey(t.x, t.y)),
  );
}
function distinctWaves(tick: number, cfg: WaveConfig = baseConfig): number {
  return new Set(getWaveTiles(tick, BOUNDS.minX, BOUNDS.maxX, BOUNDS.minY, BOUNDS.maxY, cfg).map((t) => t.waveIndex))
    .size;
}
function activeWaveIndices(tick: number, cfg: WaveConfig): number[] {
  return [
    ...new Set(getWaveTiles(tick, BOUNDS.minX, BOUNDS.maxX, BOUNDS.minY, BOUNDS.maxY, cfg).map((t) => t.waveIndex)),
  ].sort((a, b) => a - b);
}

const BASE_TIMED_CONFIGS: readonly (readonly [string, YamaContractConfig])[] = [['base', BASE_YAMA_CONFIG]] as const;

const SIGIL_TIMED_CONFIGS: readonly (readonly [string, YamaContractConfig])[] = [
  ['divine severance', DIVINE_SEVERANCE_CONFIG],
  ['forfeit breath', FORFEIT_BREATH_CONFIG],
  ['sensory clouding', SENSORY_CLOUDING_CONFIG],
  ['bloodied blows', BLOODIED_BLOWS_CONFIG],
  ['glyphic attenuation', GLYPHIC_ATTENUATION_CONFIG],
] as const;

describe('Yama P3 shadow-wave defaults', () => {
  it('uses packet-derived constants (period 70, 3 staggered, speed 2, startDelay 7, firstCycle [14])', () => {
    expect(DEFAULT_WAVE_PERIOD).toBe(70);
    expect([...DEFAULT_WAVE_DELTAS]).toEqual([0, 14, 21]);
    expect(DEFAULT_WAVE_SPEED).toBe(2);
    expect(DEFAULT_WAVE_START_DELAY).toBe(7);
    expect([...DEFAULT_FIRST_CYCLE_DELTAS]).toEqual([14]);
  });

  it('resolves the base encounter to the same wave constants', () => {
    expect(baseConfig.periodTicks).toBe(70);
    expect([...(baseConfig.deltas ?? [])]).toEqual([0, 14, 21]);
    expect(baseConfig.speedTilesPerTick).toBe(2);
    expect(baseConfig.startDelay).toBe(7);
    expect([...(baseConfig.firstCycleDeltas ?? [])]).toEqual([14]);
    expect(baseConfig.randomOffsets).toBe(false);
  });
});

describe('Yama P3 shadow-wave timing (the "waves reach the player too soon" fix)', () => {
  it('produces NO wave tiles during the opening (ticks 0-29) — not even the early cycle-0 members', () => {
    for (let tick = 0; tick <= 29; tick++) {
      expect(waveTileSet(tick).size, `tick ${tick} should have no shadow-wave tiles`).toBe(0);
    }
  });

  it('first dangerous wave tile appears at sim tick 30 (packet 840), NOT tick 16', () => {
    expect(waveTileSet(16).size).toBe(0); // the suppressed delta-0 wave would have fired here
    expect(waveTileSet(29).size).toBe(0);
    expect(waveTileSet(30).size).toBeGreaterThan(0);
  });

  it('cycle 0 is a SINGLE lone wave; later cycles are staggered groups', () => {
    // Cycle 0 (ticks 30-50): only the delta-14 wave => one waveIndex on the floor.
    for (const t of [30, 34, 40, 46, 50]) {
      expect(distinctWaves(t), `cycle-0 tick ${t}`).toBe(1);
    }
    // Cycle 1 (ticks 86-126): multiple staggered waves overlap.
    expect(Math.max(distinctWaves(96), distinctWaves(100), distinctWaves(107))).toBeGreaterThanOrEqual(2);
  });

  it('full cycles recur on a 70-tick period (cycle 1 == cycle 2)', () => {
    for (const tick of [86, 96, 100, 107, 120]) {
      expect(waveTileSet(tick), `tick ${tick} vs ${tick + 70}`).toEqual(waveTileSet(tick + 70));
    }
  });

  it('the partial cycle 0 differs from a full cycle (fewer waves)', () => {
    // tick 30 (cycle0, 1 wave) vs tick 100 (cycle1, staggered) must differ.
    expect(waveTileSet(30)).not.toEqual(waveTileSet(100));
  });
});

describe('Yama P3 shadow-wave geometry (X centered on x=30, sweeps south->north)', () => {
  it('the cycle-0 wave crosses x=30 and the crossing travels north at 2 tiles/tick', () => {
    // delta-14 wave: tp = (tick+1-14-7) % 70; crossing at (30, 2*tp-10).
    let prevY: number | null = null;
    for (const tick of [38, 40, 42, 44]) {
      const tp = tick + 1 - 14 - 7;
      const crossY = 2 * tp - 10;
      expect(isWaveTile(30, crossY, tick, baseConfig), `crossing (30,${crossY}) at tick ${tick}`).toBe(true);
      if (prevY !== null) expect(crossY - prevY).toBe(4); // +2 tiles/tick over a 2-tick step
      prevY = crossY;
    }
  });
});

describe('Yama P3 shadow-wave matches packet capture', () => {
  it('every tile of the captured cycle-0 wave is dangerous in the sim (no free passes)', () => {
    for (const [offset, tiles] of Object.entries(PACKET_WAVE_TILES)) {
      const tick = EMISSION_SIM_TICK + Number(offset);
      for (const [x, y] of tiles) {
        expect(isWaveTile(x, y, tick, baseConfig), `packet tile (${x},${y}) at sim tick ${tick}`).toBe(true);
      }
    }
  });

  it('reproduces the captured cycle-0 wave exactly inside the player dodge zone', () => {
    // Cycle 0 has only the one wave, so the player zone should match the packet exactly.
    const inZone = (x: number, y: number): boolean => x >= 28 && x <= 33 && y >= 34 && y <= 40;
    for (const [offset, tiles] of Object.entries(PACKET_WAVE_TILES)) {
      const tick = EMISSION_SIM_TICK + Number(offset);
      const packetZone = new Set(tiles.filter(([x, y]) => inZone(x, y)).map(([x, y]) => tileKey(x, y)));
      const modelZone = new Set(
        [...waveTileSet(tick)].filter((k) => {
          const [x, y] = k.split(',').map(Number);
          return inZone(x, y);
        }),
      );
      expect(modelZone, `player-zone tiles at sim tick ${tick}`).toEqual(packetZone);
    }
  });
});

describe('Yama P3 shadow-wave band clipping', () => {
  it('never marks an arena corner outside the central band as dangerous', () => {
    for (let tick = 30; tick <= 120; tick++) {
      expect(isWaveTile(BOUNDS.minX, BOUNDS.minY, tick, baseConfig)).toBe(false);
      expect(isWaveTile(BOUNDS.maxX, BOUNDS.minY, tick, baseConfig)).toBe(false);
    }
  });
});

describe('Sigil contracts fire all three waves from cycle 0', () => {
  it('sensory clouding (sigil) uses deltas [0,15,22] with no first-cycle suppression', () => {
    const sigil = resolveEncounterConfig(SENSORY_CLOUDING_CONFIG.encounter).waves;
    expect([...(sigil.deltas ?? [])]).toEqual([0, 15, 22]);
    expect([...(sigil.firstCycleDeltas ?? [])]).toEqual([0, 15, 22]);
    expect(sigil.startDelay).toBe(7);
    expect(sigil.randomOffsets).toBe(true);
    // Disable RNG offset for a deterministic structural check.
    const sigilCfg: WaveConfig = { ...sigil, randomOffsets: false };
    // Unlike base, the sigil first wave appears at sim tick 16 (delta-0 fires in cycle 0).
    expect(getWaveTiles(16, BOUNDS.minX, BOUNDS.maxX, BOUNDS.minY, BOUNDS.maxY, sigilCfg).length).toBeGreaterThan(0);
  });

  it.each(BASE_TIMED_CONFIGS)('%s uses the base single-wave opening, then 3-wave cycles', (_name, contract) => {
    const waves = resolveEncounterConfig(contract.encounter).waves;
    expect(waves.periodTicks).toBe(70);
    expect([...waves.deltas]).toEqual([0, 14, 21]);
    expect([...waves.firstCycleDeltas]).toEqual([14]);
    expect(waves.randomOffsets).toBe(false);
    expect(activeWaveIndices(16, waves)).toEqual([]);
    expect(activeWaveIndices(30, waves)).toEqual([1]);
    expect(activeWaveIndices(86, waves)).toEqual([0]);
    expect(activeWaveIndices(100, waves)).toEqual([0, 1]);
    expect(activeWaveIndices(107, waves)).toEqual([1, 2]);
  });

  it.each(SIGIL_TIMED_CONFIGS)('%s uses the sigil 3-wave opening and 70-tick cadence', (_name, contract) => {
    const waves = resolveEncounterConfig(contract.encounter).waves;
    const deterministicWaves: WaveConfig = { ...waves, randomOffsets: false };
    expect(waves.periodTicks).toBe(70);
    expect([...waves.deltas]).toEqual([0, 15, 22]);
    expect([...waves.firstCycleDeltas]).toEqual([0, 15, 22]);
    expect(waves.randomOffsets).toBe(true);
    expect(activeWaveIndices(16, deterministicWaves)).toEqual([0]);
    expect(activeWaveIndices(31, deterministicWaves)).toEqual([0, 1]);
    expect(activeWaveIndices(38, deterministicWaves)).toEqual([1, 2]);
    expect(activeWaveIndices(86, deterministicWaves)).toEqual([0]);
    expect(activeWaveIndices(101, deterministicWaves)).toEqual([0, 1]);
    expect(activeWaveIndices(108, deterministicWaves)).toEqual([1, 2]);
  });
});

describe('Sigil contract wave jitter', () => {
  const sigil = () => resolveEncounterConfig(SENSORY_CLOUDING_CONFIG.encounter).waves;
  const tilesOf = (tick: number, config: WaveConfig, waveIndex: number) =>
    getWaveTiles(tick, BOUNDS.minX, BOUNDS.maxX, BOUNDS.minY, BOUNDS.maxY, config)
      .filter((t) => t.waveIndex === waveIndex)
      .map((t) => `${t.waveType}${t.x},${t.y}`)
      .sort()
      .join(' ');

  it('never jitters the delta-0 wave leading a cycle, whatever the seed', () => {
    const unjittered: WaveConfig = { ...sigil(), randomOffsets: false };
    for (let seed = 0; seed < 64; seed++) {
      const jittered: WaveConfig = { ...sigil(), seed };
      for (let tick = 16; tick <= 400; tick++) {
        expect(tilesOf(tick, jittered, 0), `seed ${seed}, tick ${tick}`).toBe(tilesOf(tick, unjittered, 0));
      }
    }
  });

  /** How many ticks behind the un-jittered grid one arm of `waveIndex` runs at `tick`. */
  const armLateness = (tick: number, config: WaveConfig, waveIndex: number, arm: 'L' | 'R') => {
    const unjittered: WaveConfig = { ...sigil(), randomOffsets: false };
    const armTiles = (t: number, c: WaveConfig) =>
      getWaveTiles(t, BOUNDS.minX, BOUNDS.maxX, BOUNDS.minY, BOUNDS.maxY, c)
        .filter((tile) => tile.waveIndex === waveIndex && tile.waveType === arm)
        .map((tile) => `${tile.x},${tile.y}`)
        .sort()
        .join(' ');
    const actual = armTiles(tick, config);
    for (const late of [0, 1]) {
      if (actual === armTiles(tick - late, unjittered)) return late;
    }
    return Number.NaN;
  };

  it('offers all four jitter combinations to the staggered waves', () => {
    // Each arm flips independently in the captures, so a table missing the both-arms-late
    // combination under-reports danger on a quarter of every contract's staggered waves.
    const combos = new Set<string>();
    for (let seed = 0; seed < 64; seed++) {
      const jittered: WaveConfig = { ...sigil(), seed };
      for (const waveIndex of [1, 2]) {
        const tick = 16 + (waveIndex === 1 ? 15 : 22);
        combos.add(`L${armLateness(tick, jittered, waveIndex, 'L')}R${armLateness(tick, jittered, waveIndex, 'R')}`);
      }
    }
    expect([...combos].sort()).toEqual(['L0R0', 'L0R1', 'L1R0', 'L1R1']);
  });

  // The variant count is a power of two, so selection reads only the low bits of the hash.
  // A bare `imul` product locked seeds 111 and 999 onto identical variants everywhere, and
  // the four-combination test above still passes under a merely SKEWED hash — only a rate
  // check catches one arm flipping far more often than the game's coin.
  it('picks the four variants at close to equal rates', () => {
    const counts = new Map<string, number>();
    for (let seed = 0; seed < 400; seed++) {
      const jittered: WaveConfig = { ...sigil(), seed };
      for (let cycle = 0; cycle < 6; cycle++) {
        for (const waveIndex of [1, 2]) {
          const tick = 16 + 70 * cycle + (waveIndex === 1 ? 15 : 22);
          const key = `L${armLateness(tick, jittered, waveIndex, 'L')}R${armLateness(tick, jittered, waveIndex, 'R')}`;
          counts.set(key, (counts.get(key) ?? 0) + 1);
        }
      }
    }
    const total = [...counts.values()].reduce((a, b) => a + b, 0);
    expect(counts.size).toBe(4);
    for (const [key, n] of counts) {
      expect(n / total, `${key} share of ${total}`).toBeGreaterThan(0.22);
      expect(n / total, `${key} share of ${total}`).toBeLessThan(0.28);
    }
  });

  // `isWaveTile` decides damage and `getWaveTiles` decides what is drawn, and each resolves
  // the config, phase, activation, jitter and band independently. Every fix in this area has
  // had to be made twice; if one copy is ever missed the arena grows an invisible wall or a
  // harmless-looking one, and no other test in the suite would notice.
  it.each([
    ['sigil, jittered', { ...resolveEncounterConfig(SENSORY_CLOUDING_CONFIG.encounter).waves, seed: 4242 }],
    ['sigil, unjittered', { ...resolveEncounterConfig(SENSORY_CLOUDING_CONFIG.encounter).waves, randomOffsets: false }],
    ['base', resolveEncounterConfig(BASE_YAMA_CONFIG.encounter).waves],
  ] as const)('%s — the drawn tiles are exactly the damaging tiles', (_name, config) => {
    // Mismatches are collected and asserted ONCE. A per-tile `expect` is ~390k calls here and
    // overruns vitest's 5s timeout when the suite runs all workers, while passing in isolation.
    const mismatches: string[] = [];
    let compared = 0;
    let dangerous = 0;
    for (let tick = 0; tick <= 300; tick++) {
      const drawn = new Set(
        getWaveTiles(tick, BOUNDS.minX, BOUNDS.maxX, BOUNDS.minY, BOUNDS.maxY, config).map((t) => `${t.x},${t.y}`),
      );
      for (let x = BOUNDS.minX; x <= BOUNDS.maxX; x++) {
        for (let y = BOUNDS.minY; y <= BOUNDS.maxY; y++) {
          const damages = isWaveTile(x, y, tick, config);
          if (damages !== drawn.has(`${x},${y}`)) {
            if (mismatches.length < 10) mismatches.push(`(${x},${y}) at tick ${tick}: damages=${damages}`);
          }
          compared++;
          if (damages) dangerous++;
        }
      }
    }
    expect(mismatches).toEqual([]);
    // Guards against agreeing only because both said 'safe everywhere'.
    expect(dangerous).toBeGreaterThan(1000);
    expect(compared).toBeGreaterThan(100000);
  });
});
