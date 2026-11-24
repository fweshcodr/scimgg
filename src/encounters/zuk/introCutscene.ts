import { SIMULATION_START_TICK } from '../../core/constants';
import { fmix32 } from '../../core/rng';
import type { Coordinate } from '../../types/simulation';
import { ZUK_INTRO } from './constants';

const CYCLES_PER_TICK = 30;

/**
 * Wave 69's intro cutscene after wave 68, relative to control C, from
 * capture inferno-waves-69-zuk-packet-data.txt (C = t26; the tbow capture matches one tick
 * later). Presentation only: the busy window, teleport and adds are `ZUK_INTRO`.
 *
 * - Fade (the capture's fade-overlay call, args from color, from trans, to color, to trans,
 *   cycles; linear): black from transparent to opaque over 15
 *   cycles at C-12 (t14 L2759), back to transparent over 50 cycles at C-8 (t18 L2849).
 * - Camera: `cam_lookat` (2268, 5368) height 140 and `cam_moveto` (2275, 5347) height 1000 at
 *   C-9 (t17 L2828-2829), both rate 0 / rate2 100, taken as an immediate cut (an assumption: no
 *   permitted source states the rate semantics); held until `cam_reset` at C (t26 L2914). Capture
 *   (x, y) - (2240, 5312) is the sim tile. Heights are taken as OSRS units above the tile's ground.
 * - Shake: `cam_shake` random 3 / 5 / 2 on axes 0-2 (east, height, north) from C-10 (t16 L2822-2824)
 *   until the reset; the tbow capture rolled 5 / 2 / 4, so the magnitudes vary per run. C-10 is
 *   still under the black fade, so only the scripted view is shaken.
 */
export const ZUK_INTRO_CUTSCENE = {
  fadeOut: { offset: ZUK_INTRO.busyFrom, cycles: 15 },
  fadeIn: { offset: ZUK_INTRO.add, cycles: 50 },
  camera: {
    offset: -9,
    eye: { tile: [35, 35] as Coordinate, height: 1000 },
    lookAt: { tile: [28, 56] as Coordinate, height: 140 },
  },
  shake: { random: [3, 5, 2] as const },
} as const;

/**
 * The tick Zuk is added: C-8 after wave 68's intro, C itself on a run started on wave 69 (C = 0,
 * where no intro plays, as `ZukWaveDirector.createOpeningActors` decides). His spawn tick is C either way.
 */
export function zukIntroAddTick(controlTick: number): number {
  return controlTick > SIMULATION_START_TICK ? controlTick + ZUK_INTRO.add : controlTick;
}

/** A cutscene camera point: a tile's center at `height` OSRS units above its ground. */
export interface ZukIntroCameraPoint {
  readonly tile: Coordinate;
  readonly height: number;
}

export interface ZukIntroCutsceneFrame {
  /** Opacity of the black fade over the scene, 0 (clear) to 1 (black). */
  readonly fadeOpacity: number;
  /** The scripted view, or null where the player's own camera shows. */
  readonly camera: {
    readonly eye: ZukIntroCameraPoint;
    readonly lookAt: ZukIntroCameraPoint;
    /** This client cycle's shake on the eye, OSRS units: east, height, north. */
    readonly shake: readonly [number, number, number];
  } | null;
}

/**
 * The intro's presentation at `presentationTick` (the tick being shown plus its progress), or null
 * outside C-12..C. A pure function of the snapshot's control tick, so a replay seek lands exactly. A
 * run that starts on wave 69 has C = 0 and never shows a tick before it, so it plays none of this.
 */
export function zukIntroCutsceneFrame(
  controlTick: number | null,
  presentationTick: number,
): ZukIntroCutsceneFrame | null {
  if (controlTick === null) return null;
  const offset = presentationTick - controlTick;
  const { fadeOut, fadeIn, camera, shake } = ZUK_INTRO_CUTSCENE;
  if (offset < fadeOut.offset || offset >= 0) return null;
  const fadeOpacity =
    offset < fadeIn.offset
      ? Math.min(1, ((offset - fadeOut.offset) * CYCLES_PER_TICK) / fadeOut.cycles)
      : Math.max(0, 1 - ((offset - fadeIn.offset) * CYCLES_PER_TICK) / fadeIn.cycles);
  if (offset < camera.offset) return { fadeOpacity, camera: null };
  // A fresh offset each client cycle, hashed from the cycle so a replay draws the same one.
  const cycle = Math.floor(presentationTick * CYCLES_PER_TICK);
  const jitter = (axis: 0 | 1 | 2) => {
    const unit = fmix32((cycle * 3 + axis) >>> 0) / 0x100000000;
    return Math.round((unit * 2 - 1) * shake.random[axis]);
  };
  return {
    fadeOpacity,
    camera: { eye: camera.eye, lookAt: camera.lookAt, shake: [jitter(0), jitter(1), jitter(2)] },
  };
}
