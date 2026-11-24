/**
 * The practice start tile: where a run started on waves 2-68 opens (fresh entries and Go to wave;
 * Retry, Random spawns and Restart fight keep the tile the player stood on). Wave 1 lands on
 * `INFERNO_LANDING_TILE` and wave 69 opens on `ZUK_PLAYER_START`, whatever is chosen here.
 *
 * Stored as the `infernoStartTile` mechanics value, `"x,y"` in local coordinates ('' = the default,
 * {@link INFERNO_PRACTICE_START_TILE}). Pure: terrain is the arena's, so callers that have one pass
 * `isOpen`; the encounter falls back to the default on a tile its arena closes.
 */
import type { Coordinate } from '../../types/simulation';
import {
  FIRST_INFERNO_WAVE,
  INFERNO_ARENA_BOUNDS,
  INFERNO_PRACTICE_START_TILE,
  LAST_ORDINARY_WAVE,
  LAST_PILLAR_WAVE,
} from './constants';
import { INFERNO_PILLARS, type PillarKey, pillarFootprint } from './pillars';

export { INFERNO_PRACTICE_START_TILE };

/** Whether a run started on `startWave` opens on the start tile (2-68). */
export function startTileApplies(startWave: number): boolean {
  return startWave > FIRST_INFERNO_WAVE && startWave <= LAST_ORDINARY_WAVE;
}

/** `"x,y"`, integers; null for '' or anything else. Validity is {@link validateInfernoStartTile}'s. */
export function parseInfernoStartTile(value: unknown): Coordinate | null {
  if (typeof value !== 'string') return null;
  const match = /^(\d{1,3}),(\d{1,3})$/.exec(value);
  return match ? [Number(match[1]), Number(match[2])] : null;
}

export function serializeInfernoStartTile(tile: Readonly<Coordinate>): string {
  return `${tile[0]},${tile[1]}`;
}

export type InfernoStartTileProblem = 'out-of-bounds' | 'pillar' | 'blocked';

export type InfernoStartTileCheck =
  | { readonly ok: true }
  | { readonly ok: false; readonly reason: InfernoStartTileProblem; readonly message: string };

/** The standing pillar whose footprint holds `tile` for a run started as `setup`, if any. */
function standingPillarAt(
  [x, y]: Readonly<Coordinate>,
  setup: { readonly startWave: number; readonly destroyedPillars: Readonly<Record<PillarKey, boolean>> },
): PillarKey | null {
  if (setup.startWave > LAST_PILLAR_WAVE) return null;
  const pillar = INFERNO_PILLARS.find(
    (candidate) =>
      !setup.destroyedPillars[candidate.key] && pillarFootprint(candidate).some(([px, py]) => px === x && py === y),
  );
  return pillar?.key ?? null;
}

/**
 * Whether the player can start a run set up as `setup` on `tile`: inside the arena, off any pillar
 * that stands at the start (none from wave 67, nor a destroyed one), and, given `isOpen` (the
 * arena's terrain, pillars aside), on open floor.
 */
export function validateInfernoStartTile(
  tile: Readonly<Coordinate>,
  setup: { readonly startWave: number; readonly destroyedPillars: Readonly<Record<PillarKey, boolean>> },
  isOpen?: (x: number, y: number) => boolean,
): InfernoStartTileCheck {
  const [x, y] = tile;
  const { minX, maxX, minY, maxY } = INFERNO_ARENA_BOUNDS;
  const at = `[${x},${y}]`;
  if (!Number.isInteger(x) || !Number.isInteger(y) || x < minX || x > maxX || y < minY || y > maxY) {
    return { ok: false, reason: 'out-of-bounds', message: `The start tile ${at} is outside the arena.` };
  }
  if (standingPillarAt(tile, setup) !== null) {
    return { ok: false, reason: 'pillar', message: `The start tile ${at} is under a standing pillar.` };
  }
  const onPillarFloor = INFERNO_PILLARS.some((pillar) =>
    pillarFootprint(pillar).some(([px, py]) => px === x && py === y),
  );
  if (isOpen && !onPillarFloor && !isOpen(x, y)) {
    return { ok: false, reason: 'blocked', message: `The start tile ${at} is not open floor.` };
  }
  return { ok: true };
}

/** The stored choice for a run set up as `setup`, or the default where it is unset or invalid. */
export function resolveInfernoStartTile(
  value: unknown,
  setup: { readonly startWave: number; readonly destroyedPillars: Readonly<Record<PillarKey, boolean>> },
): Coordinate {
  const tile = parseInfernoStartTile(value);
  return tile && validateInfernoStartTile(tile, setup).ok ? tile : [...INFERNO_PRACTICE_START_TILE];
}
