import { describe, expect, it } from 'vitest';
import { INFERNO_PILLARS } from '../../encounters/inferno/pillars';
import {
  COLOSSEUM_PILLAR_LOC_IDS,
  DEFAULT_PILLAR_ADDITIONS_OPTIONS,
  enabledPillarAdditions,
  hiddenPillarLocIds,
  INFERNO_PILLAR_LOC_IDS,
  parsePillarAdditionsOptions,
} from '../pillarAdditions';

const shown = DEFAULT_PILLAR_ADDITIONS_OPTIONS;
const hidden = { ...DEFAULT_PILLAR_ADDITIONS_OPTIONS, hidePillars: true };

describe('Inferno and Colosseum Additions pillar ids', () => {
  it('covers every pillar LOC the Inferno encounter places', () => {
    for (const pillar of INFERNO_PILLARS) expect(INFERNO_PILLAR_LOC_IDS.has(pillar.locId)).toBe(true);
  });

  it("hides each arena's pillars only while its own plugin is on and hiding them", () => {
    expect(hiddenPillarLocIds({ inferno: null, colosseum: null }).size).toBe(0);
    expect(hiddenPillarLocIds({ inferno: shown, colosseum: shown }).size).toBe(0);
    expect(hiddenPillarLocIds({ inferno: hidden, colosseum: null })).toBe(INFERNO_PILLAR_LOC_IDS);
    expect(hiddenPillarLocIds({ inferno: shown, colosseum: hidden })).toBe(COLOSSEUM_PILLAR_LOC_IDS);

    const both = hiddenPillarLocIds({ inferno: hidden, colosseum: hidden });
    expect([...both].sort()).toEqual([...INFERNO_PILLAR_LOC_IDS, ...COLOSSEUM_PILLAR_LOC_IDS].sort());
    // The same set object while the choice holds, so the static scenery is not rebuilt.
    expect(hiddenPillarLocIds({ inferno: hidden, colosseum: hidden })).toBe(both);
  });

  it("pairs each enabled plugin with its own arena's pillars", () => {
    const colosseum = { ...shown, pillarMarkerStyle: 'line' as const };
    expect(enabledPillarAdditions({ inferno: null, colosseum: null })).toEqual([]);
    expect(enabledPillarAdditions({ inferno: shown, colosseum })).toEqual([
      { locIds: INFERNO_PILLAR_LOC_IDS, options: shown },
      { locIds: COLOSSEUM_PILLAR_LOC_IDS, options: colosseum },
    ]);
  });
});

describe('parsePillarAdditionsOptions', () => {
  it('keeps each valid stored option and defaults each invalid one', () => {
    expect(
      parsePillarAdditionsOptions({
        hidePillars: true,
        markPillarTiles: 'yes',
        pillarMarkerStyle: 'tileFill',
        pillarTileColor: '#ABCDEF',
        pillarTileOpacity: 1.5,
      }),
    ).toEqual({
      ...DEFAULT_PILLAR_ADDITIONS_OPTIONS,
      hidePillars: true,
      pillarMarkerStyle: 'tileFill',
      pillarTileColor: '#abcdef',
    });
    expect(parsePillarAdditionsOptions('nope')).toEqual(DEFAULT_PILLAR_ADDITIONS_OPTIONS);
    expect(parsePillarAdditionsOptions({ pillarTileColor: 'red', pillarTileOpacity: 0 })).toEqual({
      ...DEFAULT_PILLAR_ADDITIONS_OPTIONS,
      pillarTileOpacity: 0,
    });
  });
});
