import { describe, expect, it } from 'vitest';
import { fmix32, mulberry32 } from '../rng';

describe('mulberry32', () => {
  it('is deterministic for a given seed', () => {
    const a = mulberry32(0xdeadbeef);
    const b = mulberry32(0xdeadbeef);
    for (let i = 0; i < 100; i++) {
      expect(a()).toBe(b());
    }
  });

  it('yields floats in [0, 1)', () => {
    const r = mulberry32(12345);
    for (let i = 0; i < 10000; i++) {
      const v = r();
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });

  it('produces different streams for different seeds', () => {
    const a = Array.from(
      { length: 16 },
      (
        (g) => () =>
          g()
      )(mulberry32(1)),
    );
    const b = Array.from(
      { length: 16 },
      (
        (g) => () =>
          g()
      )(mulberry32(2)),
    );
    expect(a).not.toEqual(b);
  });

  // Golden uint stream locks the exact algorithm so replays — and the
  // lobby visuals seeded with these exact constants — reproduce bit-for-bit
  // forever. uint = round(value * 2^32) is exact (value is k/2^32, k < 2^53).
  it('matches the golden uint stream (replay + lobby-visual stability lock)', () => {
    const golden: Array<[number, number[]]> = [
      [0xdeadbeef, [4043151706, 1147597007, 3315858022, 1538288752, 2042435954]], // lobby starfield
      [0xbbbbbbbb, [699794470, 3199600868, 4134529702, 551244107, 1662430806]], // lobby braziers
      [0x12345678, [455919406, 4042750857, 4036713555, 1004527575, 3885174651]], // lobby arena props
      [0, [1144304738, 1416247, 958946056, 627933444, 2007157716]],
    ];
    for (const [seed, expected] of golden) {
      const r = mulberry32(seed);
      const got = expected.map(() => Math.round(r() * 0x100000000));
      expect(got).toEqual(expected);
    }
  });

  it('is roughly uniform over many draws', () => {
    const r = mulberry32(98765);
    let sum = 0;
    let below = 0;
    const N = 200000;
    for (let i = 0; i < N; i++) {
      const v = r();
      sum += v;
      if (v < 0.5) below++;
    }
    expect(sum / N).toBeCloseTo(0.5, 2);
    expect(below / N).toBeCloseTo(0.5, 2);
  });
});

describe('fmix32', () => {
  it('is deterministic', () => {
    expect(fmix32(123456789)).toBe(fmix32(123456789));
  });

  it('returns a uint32', () => {
    for (const v of [0, 1, -1, 0x7fffffff, 0xffffffff, 123456789]) {
      const h = fmix32(v);
      expect(Number.isInteger(h)).toBe(true);
      expect(h).toBeGreaterThanOrEqual(0);
      expect(h).toBeLessThanOrEqual(0xffffffff);
    }
  });

  it('maps 0 -> 0 (fmix32 fixed point)', () => {
    expect(fmix32(0)).toBe(0);
  });

  // Golden hashes lock the exact finalizer constants.
  it('matches golden hashes', () => {
    expect(fmix32(1)).toBe(824515495);
    expect(fmix32(2)).toBe(1722258072);
    expect(fmix32(3)).toBe(3753300549);
    expect(fmix32(0xdeadbeef)).toBe(1398006505);
    expect(fmix32(0x12345678)).toBe(89967310);
    expect(fmix32(0x7fffffff)).toBe(3192437470);
  });

  // The whole point of the avalanche: the low bit is an unbiased, independent
  // coin flip across consecutive inputs. The failure this guards against is reading
  // a bit of a linear expression, which gives frac 0.0/1.0 or strict alternation.
  it('avalanches: low bit is ~50% and uncorrelated across adjacent inputs', () => {
    let ones = 0;
    let adjacentEqual = 0;
    const N = 200000;
    for (let i = 0; i < N; i++) {
      if (fmix32(i) & 1) ones++;
      if ((fmix32(i) & 1) === (fmix32(i + 1) & 1)) adjacentEqual++;
    }
    expect(ones / N).toBeCloseTo(0.5, 2);
    expect(adjacentEqual / N).toBeCloseTo(0.5, 2);
  });

  it('gives distinct hashes for distinct small inputs (no trivial collisions)', () => {
    const seen = new Set<number>();
    for (let i = 0; i < 10000; i++) seen.add(fmix32(i));
    expect(seen.size).toBe(10000);
  });
});
