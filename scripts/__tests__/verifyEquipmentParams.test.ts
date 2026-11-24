import { describe, expect, it } from 'vitest';
import { type ParamReadings, unpinnedParams, WITNESSES, type Witness } from '../equipmentParamWitnesses';

const witness = (item: number, wiki: Witness['wiki']): Witness => ({ item, name: `item ${item}`, wiki });

const readings = (rows: Record<number, Record<number, number>>): ParamReadings =>
  new Map(
    Object.entries(rows).map(([item, params]) => [
      Number(item),
      new Map(Object.entries(params).map(([param, value]) => [Number(param), value])),
    ]),
  );

describe('unpinnedParams', () => {
  it('reports a pair no witness value separates', () => {
    const unpinned = unpinnedParams(
      [
        witness(1, [
          [6, 'slash defence', 15],
          [9, 'ranged defence', 15],
        ]),
      ],
      readings({ 1: { 6: 15, 9: 15 } }),
    );

    expect(unpinned).toHaveLength(2);
    expect(unpinned[0]).toContain('param 6 is indistinguishable from 9');
  });

  it('accepts a pair one witness reads different values for', () => {
    expect(
      unpinnedParams(
        [
          witness(1, [
            [6, 'slash defence', 93],
            [9, 'ranged defence', 133],
          ]),
        ],
        readings({ 1: { 6: 93, 9: 133 } }),
      ),
    ).toEqual([]);
  });

  it('reports a disjoint-witness pair whose cross-reads agree', () => {
    expect(
      unpinnedParams(
        [witness(1, [[12, 'ranged strength (ammunition)', 49]]), witness(2, [[189, 'ranged strength (worn)', 49]])],
        readings({ 1: { 12: 49, 189: 49 }, 2: { 12: 49, 189: 49 } }),
      ),
    ).toHaveLength(2);
  });

  it('accepts those same disjoint witnesses once a cross-read disagrees', () => {
    expect(
      unpinnedParams(
        [witness(1, [[12, 'ranged strength (ammunition)', 49]]), witness(2, [[189, 'ranged strength (worn)', 49]])],
        readings({ 1: { 12: 49, 189: 0 }, 2: { 12: 0, 189: 49 } }),
      ),
    ).toEqual([]);
  });

  it('reports a three-cycle that no single swap would expose', () => {
    const cycle = [
      witness(1, [
        [1, 'a', 10],
        [2, 'b', 20],
        [3, 'c', 30],
      ]),
      witness(2, [
        [1, 'a', 40],
        [2, 'b', 50],
        [3, 'c', 60],
      ]),
    ];
    const rotated = readings({ 1: { 1: 30, 2: 10, 3: 20 }, 2: { 1: 60, 2: 40, 3: 50 } });

    expect(unpinnedParams(cycle, rotated).length).toBeGreaterThan(0);
  });

  it('separates a pair when the swapped id is absent from the item', () => {
    expect(
      unpinnedParams(
        [
          witness(1, [
            [6, 'slash defence', 15],
            [9, 'ranged defence', 15],
          ]),
        ],
        readings({ 1: { 6: 15 } }),
      ),
    ).toEqual([]);
  });

  it('pins every id the shipped table declares', () => {
    expect(WITNESSES.flatMap((entry) => entry.wiki).length).toBe(40);
  });
});
