/**
 * Sol Heredit's regular ground attacks: the tile sets, their per-tile visual ripple, and the
 * variant alternation that picks between them.
 *
 * The tile shapes, ripple and alternation are capture-derived and reproduce all 114 observed
 * bursts across the three captures (K 25, M 29, N 60) with zero missing and zero extra tiles. See
 * `docs/encounters/sol-heredit-capture-analysis.md` sections 1.1-1.4 and 10 for the derivation.
 * The footprint-aligned aim boundary is simulator policy, not capture-derived; see
 * {@link solAimToward}.
 *
 * Coordinates follow the project convention throughout: `+X` east, `+Y` north, no axis flips.
 */
import type { Coordinate } from '../../types/simulation';
import { SOL_SIZE } from './constants';

export type SolAttackStyle = 'spear' | 'shield';

/**
 * Which of a style's two shapes is used. Sol alternates within a run of one style and resets to
 * `1` whenever he switches style — see {@link selectSolVariant}.
 */
export type SolAttackVariant = 1 | 2;

export type CardinalDirection = 'north' | 'south' | 'east' | 'west';
export type DiagonalDirection = 'north-east' | 'north-west' | 'south-east' | 'south-west';
/** Where a spear points. Shields ignore it. */
export type SolAimDirection = CardinalDirection | DiagonalDirection;

export interface ArenaRect {
  readonly minX: number;
  readonly maxX: number;
  readonly minY: number;
  readonly maxY: number;
}

/**
 * Sol's 5x5 footprint is anchored at its south-west tile, so the center the ground effects
 * radiate from is two tiles in on each axis.
 */
export function solCentreTile(position: Readonly<Coordinate>): Coordinate {
  return [position[0] + 2, position[1] + 2];
}

export function chebyshevDistance(a: Readonly<Coordinate>, b: Readonly<Coordinate>): number {
  return Math.max(Math.abs(a[0] - b[0]), Math.abs(a[1] - b[1]));
}

/**
 * The arena's four corner tiles carry no ground effect in either capture, so the effect domain is
 * the bounding rectangle minus those corners rather than a plain rectangle.
 */
export function isInsideArena(tile: Readonly<Coordinate>, arena: ArenaRect): boolean {
  const [x, y] = tile;
  if (x < arena.minX || x > arena.maxX || y < arena.minY || y > arena.maxY) return false;
  const onXEdge = x === arena.minX || x === arena.maxX;
  const onYEdge = y === arena.minY || y === arena.maxY;
  return !(onXEdge && onYEdge);
}

/**
 * Converts a tile's offset from Sol's anchor into his facing-relative frame, where `lateral`
 * runs across his 5-tile width and `forward` counts tiles ahead of his back edge: the footprint
 * spans `forward` -4..0 and the tile immediately ahead of him is `forward` 1.
 */
function toFacingLocal(dx: number, dy: number, facing: CardinalDirection): readonly [number, number] {
  const back = SOL_SIZE - 1;
  switch (facing) {
    case 'south':
      return [dx, -dy];
    case 'north':
      return [dx, dy - back];
    case 'west':
      return [dy, -dx];
    case 'east':
      return [dy, dx - back];
  }
}

/**
 * Prong lanes by variant. Variant 1 throws two lines, variant 2 throws three — matching the OSRS
 * Wiki's "two 4x1 lines" and "three 4x1 lines" for Spear 1 and Spear 2 respectively.
 */
const SPEAR_PRONG_LATERALS: Record<SolAttackVariant, readonly number[]> = {
  1: [1, 3],
  2: [0, 2, 4],
};

/**
 * Diagonal spear lines, as offsets from the corner diagonal. Each line is three tiles long and
 * starts against Sol's body, whatever room the arena leaves beyond it (N:7353 SW/1, N:7360 SW/2,
 * N:7558 NW/2; lines stop at three tiles with in-arena tiles still ahead). Variant 1 flanks the
 * corner diagonal; variant 2 takes it plus both lines three tiles out.
 */
const DIAGONAL_SPEAR_LINE_OFFSETS: Record<SolAttackVariant, readonly number[]> = {
  1: [-1, 1],
  2: [-3, 0, 3],
};
const DIAGONAL_SPEAR_LINE_LENGTH = 3;

/**
 * Spear coverage: Sol's own footprint plus, for a cardinal aim, the full row directly ahead and
 * prongs running forward from the variant's lanes; for a diagonal aim, the diagonal lines
 * leaving the aimed corner.
 *
 * Cardinal prongs run until the arena stops them; they are NOT a fixed four tiles. Six-tile prongs
 * are observed (capture K:4115), and the Wiki's "4x1" is a simplification of the common case.
 * The Wiki also omits variant 2's full forward row, which every capture sample has.
 */
export function spearTiles(
  solPosition: Readonly<Coordinate>,
  aim: SolAimDirection,
  variant: SolAttackVariant,
  arena: ArenaRect,
): Coordinate[] {
  if (isDiagonal(aim)) return diagonalSpearTiles(solPosition, aim, variant, arena);
  const prongs = SPEAR_PRONG_LATERALS[variant];
  const tiles: Coordinate[] = [];
  for (let x = arena.minX; x <= arena.maxX; x++) {
    for (let y = arena.minY; y <= arena.maxY; y++) {
      if (!isInsideArena([x, y], arena)) continue;
      const [lateral, forward] = toFacingLocal(x - solPosition[0], y - solPosition[1], aim);
      if (lateral < 0 || lateral > SOL_SIZE - 1) continue;
      const inBody = forward >= -(SOL_SIZE - 1) && forward <= 1;
      if (inBody || (forward >= 2 && prongs.includes(lateral))) tiles.push([x, y]);
    }
  }
  return tiles;
}

function isDiagonal(aim: SolAimDirection): aim is DiagonalDirection {
  return aim.includes('-');
}

function diagonalSpearTiles(
  solPosition: Readonly<Coordinate>,
  aim: DiagonalDirection,
  variant: SolAttackVariant,
  arena: ArenaRect,
): Coordinate[] {
  const signX = aim.endsWith('east') ? 1 : -1;
  const signY = aim.startsWith('north') ? 1 : -1;
  const cornerX = solPosition[0] + (signX > 0 ? SOL_SIZE - 1 : 0);
  const cornerY = solPosition[1] + (signY > 0 ? SOL_SIZE - 1 : 0);
  const tiles: Coordinate[] = [];
  for (let dx = 0; dx < SOL_SIZE; dx++) {
    for (let dy = 0; dy < SOL_SIZE; dy++) {
      const tile: Coordinate = [solPosition[0] + dx, solPosition[1] + dy];
      if (isInsideArena(tile, arena)) tiles.push(tile);
    }
  }
  for (const offset of DIAGONAL_SPEAR_LINE_OFFSETS[variant]) {
    for (let step = 1; step <= DIAGONAL_SPEAR_LINE_LENGTH; step++) {
      // Outward steps along each axis; the line's offset shifts it along the body's side.
      const outX = offset >= 0 ? step : step + offset;
      const outY = offset >= 0 ? step - offset : step;
      const tile: Coordinate = [cornerX + signX * outX, cornerY + signY * outY];
      if (isInsideArena(tile, arena)) tiles.push(tile);
    }
  }
  return tiles;
}

/**
 * Shield coverage: every tile within ten of Sol's center except one complete ring at a fixed
 * Chebyshev distance - the "safe 9x9 line" (radius 4) and "safe 11x11 line" (radius 5) the Wiki
 * describes for Shield 1 and Shield 2.
 *
 * The ten-tile reach only shows when Sol stands near a wall (N:7327 and N:7333 match exactly);
 * all 51 shield bursts across the three captures fit it. Shields are not rotated by aim.
 */
export function shieldSafeRadius(variant: SolAttackVariant): number {
  return variant === 1 ? 4 : 5;
}

const SHIELD_MAX_RADIUS = 10;

export function shieldTiles(
  solPosition: Readonly<Coordinate>,
  variant: SolAttackVariant,
  arena: ArenaRect,
): Coordinate[] {
  const centre = solCentreTile(solPosition);
  const safeRadius = shieldSafeRadius(variant);
  const tiles: Coordinate[] = [];
  for (let x = arena.minX; x <= arena.maxX; x++) {
    for (let y = arena.minY; y <= arena.maxY; y++) {
      if (!isInsideArena([x, y], arena)) continue;
      const distance = chebyshevDistance([x, y], centre);
      if (distance !== safeRadius && distance <= SHIELD_MAX_RADIUS) tiles.push([x, y]);
    }
  }
  return tiles;
}

export function solAttackTiles(
  solPosition: Readonly<Coordinate>,
  aim: SolAimDirection,
  style: SolAttackStyle,
  variant: SolAttackVariant,
  arena: ArenaRect,
): Coordinate[] {
  return style === 'spear' ? spearTiles(solPosition, aim, variant, arena) : shieldTiles(solPosition, variant, arena);
}

/**
 * Client-cycle offset a tile's effect plays at, two per ring outward from Sol's center.
 *
 * Every observed delay is below one tick's 30 cycles, so this is a ripple WITHIN the emission
 * tick, not a multi-tick hazard: all tiles of one attack resolve together.
 */
export function telegraphDelayCycles(tile: Readonly<Coordinate>, centre: Readonly<Coordinate>): number {
  return 2 * chebyshevDistance(tile, centre);
}

/** What Sol did last, for the alternation rule. Specials count as a style change. */
export type SolLastAction = SolAttackStyle | 'special';

export interface SolVariantMemory {
  readonly lastAction: SolLastAction | null;
  readonly lastVariant: SolAttackVariant;
}

export const INITIAL_SOL_VARIANT_MEMORY: SolVariantMemory = { lastAction: null, lastVariant: 1 };

/**
 * Picks the shape for `style`: alternate while Sol keeps using the same style, otherwise reset to
 * variant 1.
 *
 * This is the Wiki's "two consecutive Spear attacks alternate patterns; a style change resets
 * that style to pattern 1", and it reproduces all 54 observed attacks across both captures,
 * including the phase-transition cases that discriminate it from a simpler rule: alternation
 * carries THROUGH a transition (M:8326 Spear 1 -> M:8340 Spear 2) unless a different style
 * intervened first (M:8448 Spear 1, M:8454 shield, M:8466 Spear 1 again).
 */
export function selectSolVariant(memory: SolVariantMemory, style: SolAttackStyle): SolAttackVariant {
  if (memory.lastAction !== style) return 1;
  return memory.lastVariant === 1 ? 2 : 1;
}

export function rememberSolAction(action: SolLastAction, variant: SolAttackVariant): SolVariantMemory {
  return { lastAction: action, lastVariant: variant };
}

/**
 * Eight-way direction from `from` to `to`: diagonal when the shorter axis is more than half the
 * longer, otherwise the longer axis's cardinal. Reproduces all 63 spears in the three captures,
 * including the discriminating 1:2 case (N:7376, (-4,-2) -> west) and 3:5 cases (N:7353/7360/7558
 * -> diagonal). Standard 45-degree octants (boundary tan 22.5 = 0.41) would call N:7376 south-west.
 * A zero offset has no direction; `south`, the spawn orientation, is returned.
 */
export function octantToward(from: Readonly<Coordinate>, to: Readonly<Coordinate>): SolAimDirection {
  const dx = to[0] - from[0];
  const dy = to[1] - from[1];
  const ew = dx < 0 ? 'west' : 'east';
  const ns = dy < 0 ? 'south' : 'north';
  const shorter = Math.min(Math.abs(dx), Math.abs(dy));
  const longer = Math.max(Math.abs(dx), Math.abs(dy));
  if (longer === 0) return 'south';
  if (shorter * 2 > longer) return `${ns}-${ew}`;
  return Math.abs(dx) > Math.abs(dy) ? ew : ns;
}

/**
 * Targets outside Sol's body but within a face's inclusive width aim toward that face; elsewhere
 * retain the center-based octant rule, including inside/zero offsets.
 *
 * The exact face boundary is simulator policy, not established by the captures or Wiki: every
 * captured spear fits both this rule and the plain octant rule.
 * https://oldschool.runescape.wiki/w/Sol_Heredit#Fight_overview and
 * https://oldschool.runescape.wiki/w/Fortis_Colosseum/Strategies#Sol_Heredit support the 5x5 body
 * and straight/diagonal pattern distinction, not this precise targeting boundary.
 */
export function solAimToward(solPosition: Readonly<Coordinate>, target: Readonly<Coordinate>): SolAimDirection {
  const [x, y] = target;
  const maxX = solPosition[0] + SOL_SIZE - 1;
  const maxY = solPosition[1] + SOL_SIZE - 1;
  if (x >= solPosition[0] && x <= maxX) {
    if (y < solPosition[1]) return 'south';
    if (y > maxY) return 'north';
  }
  if (y >= solPosition[1] && y <= maxY) {
    if (x < solPosition[0]) return 'west';
    if (x > maxX) return 'east';
  }
  return octantToward(solCentreTile(solPosition), target);
}
