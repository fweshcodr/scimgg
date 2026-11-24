/**
 * Deterministic RNG / hash primitives for the simulation and renderer.
 *
 * These are intentionally hand-vendored rather than pulled from a dependency.
 * The replay system records seeds and must reproduce results bit-for-bit: a
 * third-party RNG that changed its algorithm in a release would silently desync
 * every recording (and shift the lobby visuals seeded with the constants below).
 * The routines here are small, well known, and frozen on purpose.
 *
 * They are seedable/stateless so a value can be derived independently from an
 * `(index, seed)` pair without advancing a shared stream — the exact shape the
 * fireball / void-flare / wave hazards need.
 */

/**
 * mulberry32 — a fast, well-distributed 32-bit seeded PRNG. Returns a generator
 * yielding floats in [0, 1). Deterministic for a given seed.
 *
 * Tommy Ettinger's algorithm, in the JavaScript form of bryc/code's PRNGs.md at
 * 88c1317ea6f9b25c153afa9c369c365fed11b482, which is public domain (the original C
 * is CC0). Recorded in THIRD_PARTY_NOTICES.md and licenses.txt.
 *
 * Ref: https://github.com/bryc/code/blob/88c1317ea6f9b25c153afa9c369c365fed11b482/jshash/PRNGs.md#mulberry32
 */
export function mulberry32(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 0x100000000;
  };
}

/**
 * A 32-bit integer hash finalizer: two xorshift-16/multiply-by-0x45d9f3b rounds
 * and a closing xorshift-16. It has the shape of MurmurHash3's fmix32, but not its
 * constants (Murmur3 multiplies by 0x85ebca6b then 0xc2b2ae35, with a 13-bit middle
 * shift), so its output is not Murmur3's. The name borrows Murmur3's, and both it and
 * the constants are frozen like the rest of this file.
 *
 * A stateless avalanche hash: it thoroughly mixes every input bit, so any single
 * output bit is an independent ~coin flip. Use it to turn an `(index, seed)` pair into a deterministic pseudo-random
 * value, e.g. `fmix32(index ^ seed) & 1` for an unbiased boolean per index.
 *
 * Why this and not `(index * k + seed) % 2`: a single bit of a *linear*
 * expression is never random — it only strictly alternates or repeats in a
 * fixed quasi-periodic pattern. The avalanche is what makes the bit a coin flip.
 */
export function fmix32(hash: number): number {
  let h = hash >>> 0;
  h = Math.imul(h ^ (h >>> 16), 0x45d9f3b) >>> 0;
  h = Math.imul(h ^ (h >>> 16), 0x45d9f3b) >>> 0;
  return (h ^ (h >>> 16)) >>> 0;
}
