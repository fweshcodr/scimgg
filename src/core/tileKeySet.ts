/**
 * Packed-integer mirror of a `Set<string>` of `"x,y"` tile keys.
 *
 * The string set is the shared representation for walkability across
 * {@link ArenaConfig}, the encounters, and the walkability analyzer, so it
 * stays as-is. Membership *tests*, however, run in the two hottest loops in the
 * app — pathfinding BFS (up to eight probes per explored node, every simulation
 * tick) and arena-boundary rendering (five probes per arena tile, every frame).
 *
 * This wraps the same set in a numeric lookup so a probe allocates nothing.
 * Membership is exactly equivalent to the source set: keys that cannot be
 * packed (non-integer or out of range) leave the lookup in a mixed mode where
 * a packed miss still falls back to the string test.
 */

/** Shifts negative tile coordinates into the non-negative packing range. */
const OFFSET = 8192;
/** Stride of the packed key; also the exclusive upper bound of a shifted coord. */
const SPAN = 65536;

function packable(v: number): boolean {
  return Number.isInteger(v) && v >= -OFFSET && v < SPAN - OFFSET;
}

function pack(x: number, y: number): number {
  return (x + OFFSET) * SPAN + (y + OFFSET);
}

export class TileKeySet {
  private readonly packed = new Set<number>();
  private readonly source: Set<string>;
  /** False when some source key could not be packed, forcing string fallback on a miss. */
  private readonly fullyPacked: boolean;

  constructor(source: Set<string>) {
    this.source = source;
    let fullyPacked = true;
    for (const key of source) {
      const comma = key.indexOf(',');
      if (comma < 0) {
        fullyPacked = false;
        continue;
      }
      const x = Number(key.slice(0, comma));
      const y = Number(key.slice(comma + 1));
      // Round-trip check, not just `packable`: `Number()` also accepts
      // non-canonical spellings such as '01,2', '+1,2', '1.0,2', ' 1,2' and
      // '-0,2'. Packing those would make `has(1, 2)` report membership the
      // source set does not have. Anything that does not serialize back to its
      // own key stays on the string path.
      if (!packable(x) || !packable(y) || `${x},${y}` !== key) {
        fullyPacked = false;
        continue;
      }
      this.packed.add(pack(x, y));
    }
    this.fullyPacked = fullyPacked;
  }

  has(x: number, y: number): boolean {
    if (packable(x) && packable(y)) {
      if (this.packed.has(pack(x, y))) return true;
      if (this.fullyPacked) return false;
    }
    return this.source.has(`${x},${y}`);
  }
}

/**
 * Memoizes one {@link TileKeySet} per source set.
 *
 * PRECONDITION: a published walkable set is immutable. Every producer in this
 * codebase builds its set fully before publishing it (the walkability analyzer,
 * the lobby encounter config and Yama's sealed-arena variant both
 * return a fresh `Set`), and nothing mutates one afterwards. The cache detects
 * replacement and size changes, but a same-size in-place edit - one `delete`
 * paired with one `add` - is NOT detectable without an O(n) scan per probe,
 * which is the cost this class exists to remove. Mutate a published set and the
 * mirror silently goes stale.
 *
 * {@link revision} increments on every rebuild so dependent caches (the arena
 * boundary topology) can invalidate on exactly the same signal.
 */
export class TileKeySetCache {
  private lookup: TileKeySet | null = null;
  private source: Set<string> | null = null;
  private size = -1;
  private rebuilds = 0;

  /** Increments whenever the mirror is rebuilt. Never resets, including on {@link clear}. */
  get revision(): number {
    return this.rebuilds;
  }

  get(source: Set<string>): TileKeySet {
    if (this.source !== source || this.size !== source.size || !this.lookup) {
      this.lookup = new TileKeySet(source);
      this.source = source;
      this.size = source.size;
      this.rebuilds++;
    }
    return this.lookup;
  }

  clear(): void {
    this.lookup = null;
    this.source = null;
    this.size = -1;
    this.rebuilds++;
  }
}
