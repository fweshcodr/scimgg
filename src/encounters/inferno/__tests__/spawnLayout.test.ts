import { describe, expect, it } from 'vitest';
import { INFERNO_SPAWN_SLOTS } from '../constants';
import { planWaveSpawns } from '../layout';
import {
  buildInfernoSetupUrl,
  type InfernoLinkSetup,
  type InfernoSpawnLayout,
  inferWaveFromKinds,
  isCompleteSpawnLayout,
  layoutFromPlacements,
  parseInfernoSetupParams,
  parseSpawnLayout,
  type SlotKind,
  serializeSpawnLayout,
  slotKindsForWave,
  validateSpawnLayout,
} from '../spawnLayout';

const NO_PILLARS = { west: false, south: false, northEast: false } as const;

/** Wave 31 (1 ranger, 1 meleer, 2 blobs): meleer on slot 0, blobs on 2 and 6, ranger on 4. */
const WAVE_31_SLOTS: (SlotKind | null)[] = ['meleer', null, 'blob', null, 'ranger', null, 'blob', null, null];

function layout(wave: number, slots: readonly (SlotKind | null)[]): InfernoSpawnLayout {
  const result = validateSpawnLayout(wave, slots);
  if (!result.ok) throw new Error(result.message);
  return result.layout;
}

function parse(query: string) {
  return parseInfernoSetupParams(new URLSearchParams(query));
}

describe('spawn layout validation', () => {
  it('lists each wave’s slot NPCs in spawn order, without nibblers or Jads', () => {
    expect(slotKindsForWave(31)).toEqual(['ranger', 'meleer', 'blob', 'blob']);
    expect(slotKindsForWave(62)).toEqual(['mager', 'ranger', 'meleer', 'blob', 'bat', 'bat']);
    expect(slotKindsForWave(3)).toEqual([]);
    for (const wave of [67, 68, 69, 0, 1.5]) expect(slotKindsForWave(wave)).toEqual([]);
  });

  it('infers every wave 1-66 from its slot NPCs alone, and nothing from counts no wave has', () => {
    for (let wave = 1; wave <= 66; wave++) {
      const kinds = slotKindsForWave(wave);
      expect(inferWaveFromKinds(kinds), `wave ${wave}`).toBe(kinds.length === 0 ? null : wave);
      // Order never matters: counts name the wave.
      expect(inferWaveFromKinds([...kinds].reverse())).toBe(kinds.length === 0 ? null : wave);
    }
    expect(inferWaveFromKinds(['bat', 'bat', 'bat'])).toBeNull();
    expect(inferWaveFromKinds([])).toBeNull();
  });

  it('accepts the wave’s composition on the nine slots, whole or in part', () => {
    expect(validateSpawnLayout(31, WAVE_31_SLOTS)).toEqual({ ok: true, layout: { wave: 31, slots: WAVE_31_SLOTS } });
    expect(isCompleteSpawnLayout(layout(31, WAVE_31_SLOTS))).toBe(true);
    const partial: (SlotKind | null)[] = ['meleer', null, 'blob', null, null, null, null, null, null];
    expect(validateSpawnLayout(31, partial)).toEqual({ ok: true, layout: { wave: 31, slots: partial } });
    expect(isCompleteSpawnLayout(layout(31, partial))).toBe(false);
  });

  it.each([
    [0, WAVE_31_SLOTS, 'bad-wave'],
    [67, WAVE_31_SLOTS, 'bad-wave'],
    [31.5, WAVE_31_SLOTS, 'bad-wave'],
    [3, Array(9).fill(null), 'no-slot-npcs'],
    [31, WAVE_31_SLOTS.slice(0, 8), 'bad-slots'],
    [31, Array(9).fill(null), 'empty'],
    [31, ['meleer', 'bat', 'blob', null, 'ranger', null, 'blob', null, null], 'composition-mismatch'],
    [31, ['meleer', 'meleer', null, null, null, null, null, null, null], 'composition-mismatch'],
    [30, WAVE_31_SLOTS, 'composition-mismatch'],
  ] as const)('rejects wave %s with %j as %s', (wave, slots, error) => {
    const result = validateSpawnLayout(wave, slots);
    expect(result).toMatchObject({ ok: false, error });
    expect(result.ok ? '' : result.message).not.toBe('');
  });

  it('names the wave’s own composition when a layout does not fit it', () => {
    expect(validateSpawnLayout(30, WAVE_31_SLOTS)).toMatchObject({
      message: 'Those spawns do not fit wave 30, which has 1 ranger, 1 meleer, 1 blob and 2 bats.',
    });
  });
});

describe('the layout a batch spawned on', () => {
  it('reads every wave’s random batch back onto its slots, and replays it as a custom layout', () => {
    for (let wave = 1; wave <= 68; wave++) {
      const plan = planWaveSpawns(1234, wave);
      const spawned = layoutFromPlacements(wave, plan);
      if (slotKindsForWave(wave).length === 0) {
        expect(spawned, `wave ${wave}`).toBeNull();
        continue;
      }
      if (!spawned) throw new Error(`wave ${wave} read no layout`);
      for (const { kind, position } of plan) {
        if (kind === 'nibbler') continue;
        const index = INFERNO_SPAWN_SLOTS.findIndex(([x, y]) => x === position[0] && y === position[1]);
        expect(spawned.slots[index], `wave ${wave}`).toBe(kind);
      }
      // Placing what was read reproduces the batch, nibblers included (two of a kind may swap).
      const tiles = (batch: typeof plan) => batch.map(({ kind, position }) => `${kind}@${position}`).sort();
      expect(tiles(planWaveSpawns(1234, wave, undefined, -1, spawned))).toEqual(tiles(plan));
    }
  });

  it('returns a custom layout unchanged', () => {
    const wave31 = layout(31, WAVE_31_SLOTS);
    expect(layoutFromPlacements(31, planWaveSpawns(5, 31, undefined, -1, wave31))).toEqual(wave31);
  });

  it('reads a partial layout’s batch back whole: its placements, and where the rest fell', () => {
    const partial = layout(31, ['meleer', null, null, null, null, null, null, null, null]);
    const spawned = layoutFromPlacements(31, planWaveSpawns(5, 31, undefined, -1, partial));
    expect(spawned && isCompleteSpawnLayout(spawned)).toBe(true);
    expect(spawned?.slots[0]).toBe('meleer');
  });

  it('reads nothing from a batch that is not the wave’s, one per slot', () => {
    const [x, y] = INFERNO_SPAWN_SLOTS[0];
    const bat = (position: [number, number]) => ({ kind: 'bat' as const, position });
    expect(layoutFromPlacements(1, [bat([x, y])])).toEqual({ wave: 1, slots: ['bat', ...Array(8).fill(null)] });
    expect(layoutFromPlacements(1, [bat([x + 1, y])])).toBeNull();
    expect(layoutFromPlacements(2, [bat([x, y]), bat([x, y])])).toBeNull();
    expect(layoutFromPlacements(2, [bat([x, y])])).toBeNull();
    expect(layoutFromPlacements(69, [])).toBeNull();
  });
});

describe('spawn layout mechanics value', () => {
  it('serializes one character per slot after the wave, and parses it back', () => {
    const wave31 = layout(31, WAVE_31_SLOTS);
    expect(serializeSpawnLayout(wave31)).toBe('31:m-l-r-l--');
    expect(parseSpawnLayout('31:m-l-r-l--')).toEqual(wave31);
    const wave62 = layout(62, ['bat', 'mager', 'ranger', 'meleer', 'blob', 'bat', null, null, null]);
    expect(serializeSpawnLayout(wave62)).toBe('62:bgrmlb---');
    expect(parseSpawnLayout(serializeSpawnLayout(wave62))).toEqual(wave62);
    // Part of a wave reads back as that part.
    expect(parseSpawnLayout('31:m-l------')).toEqual(layout(31, ['meleer', null, 'blob', ...Array(6).fill(null)]));
  });

  it.each([
    '',
    undefined,
    true,
    '31',
    '31:m-l-r-l-',
    '31:m-l-r-l---',
    '31:x-l-r-l--',
    ' 31:m-l-r-l--',
    '031:m-l-r-l--',
    '30:m-l-r-l--',
    '31:---------',
    '31:mm-------',
    '3:---------',
    '67:---------',
  ])('reads %j as random spawns', (value) => {
    expect(parseSpawnLayout(value)).toBeNull();
  });
});

describe('setup links', () => {
  it('maps Inferno Stats tiles onto all nine slots: x = local - 17, y = 46 - local', () => {
    const linkTiles = [
      [1, 5],
      [3, 11],
      [1, 28],
      [5, 23],
      [15, 28],
      [23, 25],
      [16, 17],
      [23, 12],
      [22, 5],
    ];
    expect(INFERNO_SPAWN_SLOTS.map(([x, y]) => [x - 17, 46 - y])).toEqual(linkTiles);
    // Each tile, alone as a wave-1 bat, lands on its own slot.
    linkTiles.forEach(([x, y], index) => {
      const result = parse(`bat=[[${x},${y}]]`);
      expect(result.ok && result.setup?.layout?.slots.indexOf('bat')).toBe(index);
    });
  });

  it('reads an Inferno Stats link verbatim, raw or percent-encoded, inferring the wave', () => {
    const expected = {
      ok: true,
      setup: { startWave: 5, layout: { wave: 5, slots: ['bat', 'blob', null, null, null, null, null, null, null] } },
    };
    expect(parse('?bat=[[1,5]]&blob=[[3,11]]&copyable')).toMatchObject(expected);
    expect(parse('bat=%5B%5B1%2C5%5D%5D&blob=%5B%5B3%2C11%5D%5D&copyable')).toMatchObject(expected);
    expect(parse('bat=%5B%5B1,%205%5D%5D&blob=[[3,+11]]')).toMatchObject(expected);
    expect(parse('bat=[[1,5]]&blob=[[3,11]]')).toMatchObject({ setup: { destroyedPillars: NO_PILLARS } });
  });

  it('reads a full wave with a named wave and destroyed pillars', () => {
    expect(parse('wave=31&blob=[[1,28],[16,17]]&melee=[[1,5]]&ranger=[[15,28]]&pillars=west,NorthEast')).toEqual({
      ok: true,
      setup: {
        startWave: 31,
        layout: layout(31, WAVE_31_SLOTS),
        destroyedPillars: { ...NO_PILLARS, west: true, northEast: true },
        startTile: null,
      },
    });
  });

  it('starts on a wave alone with random spawns, and is no link without any setup parameter', () => {
    expect(parse('wave=69')).toEqual({
      ok: true,
      setup: { startWave: 69, layout: null, destroyedPillars: NO_PILLARS, startTile: null },
    });
    expect(parse('wave=12&pillars=')).toEqual({
      ok: true,
      setup: { startWave: 12, layout: null, destroyedPillars: NO_PILLARS, startTile: null },
    });
    expect(parse('')).toEqual({ ok: true, setup: null });
    expect(parse('copyable&popout=1')).toEqual({ ok: true, setup: null });
  });

  it.each([
    ['wave=0', 'bad-wave'],
    ['wave=70', 'bad-wave'],
    ['wave=abc', 'bad-wave'],
    ['wave=', 'bad-wave'],
    ['wave=5&wave=6', 'bad-param'],
    ['pillars=west', 'missing-wave'],
    ['bat=[]', 'missing-wave'],
    ['bat=[[1,5]', 'bad-tiles'],
    ['bat=[1,5]', 'bad-tiles'],
    ['bat=[[1,5,2]]', 'bad-tiles'],
    ['bat=[[1.5,5]]', 'bad-tiles'],
    ['bat=[[2,5]]', 'unknown-tile'],
    ['bat=[[1,5]]&blob=[[1,5]]', 'shared-tile'],
    ['bat=[[1,5],[3,11],[1,28]]', 'no-matching-wave'],
    ['wave=6&blob=[[1,5],[3,11]]', 'composition-mismatch'],
    ['wave=67&bat=[[1,5]]', 'bad-wave'],
    ['wave=5&bat=[[1,5]]&blob=[[3,11]]&pillars=north', 'bad-pillars'],
    ['player=[17,2]', 'missing-wave'],
    ['wave=30&player=[17,2]&player=[17,2]', 'bad-param'],
    ['wave=30&player=abc', 'bad-player'],
    ['wave=30&player=[17,2],[1,1]', 'bad-player'],
    ['wave=30&player=[[17,2],[1,1]]', 'bad-player'],
    ['wave=30&player=[29,2]', 'bad-player'],
    ['wave=30&player=[11,21]', 'bad-player'],
  ])('rejects %s as %s', (query, error) => {
    const result = parse(query);
    expect(result).toMatchObject({ ok: false, error });
    expect(result.ok ? '' : result.message).not.toBe('');
  });

  it('reads part of a wave when the link names it, and the rest spawn at random', () => {
    const partial = parse('wave=31&blob=[[1,28]]&melee=[[1,5]]');
    expect(partial).toEqual({
      ok: true,
      setup: {
        startWave: 31,
        layout: layout(31, ['meleer', null, 'blob', null, null, null, null, null, null]),
        destroyedPillars: NO_PILLARS,
        startTile: null,
      },
    });
    // Without `wave`, the species are a whole wave's, the one they name: a blob and a meleer, wave 12.
    expect(parse('blob=[[1,28]]&melee=[[1,5]]')).toMatchObject({ ok: true, setup: { startWave: 12 } });
    // Built and read back unchanged.
    const setup = partial.ok ? partial.setup : null;
    if (!setup) throw new Error('no setup');
    const url = buildInfernoSetupUrl('https://example.com', setup);
    expect(url).toBe('https://example.com/inferno/?wave=31&blob=[[1,28]]&melee=[[1,5]]');
    expect(parseInfernoSetupParams(new URL(url).searchParams)).toEqual(partial);
  });

  it('names the tile and species that are wrong', () => {
    expect(parse('ranger=[[2,5]]')).toMatchObject({ message: 'The ranger tile [2,5] is not a spawn tile.' });
    expect(parse('bat=[[1,5],[3,11],[1,28]]')).toMatchObject({ message: 'No wave spawns exactly 3 bats.' });
  });

  it('builds links that round-trip and that the Inferno Stats format reads', () => {
    const setup: InfernoLinkSetup = {
      startWave: 31,
      layout: layout(31, WAVE_31_SLOTS),
      destroyedPillars: { ...NO_PILLARS, south: true, northEast: true },
      startTile: [24, 30],
    };
    const url = buildInfernoSetupUrl('https://example.com/', setup);
    expect(url).toBe(
      'https://example.com/inferno/?wave=31&blob=[[1,28],[16,17]]&melee=[[1,5]]&ranger=[[15,28]]&pillars=south,northeast&player=[7,16]',
    );
    expect(parseInfernoSetupParams(new URL(url).searchParams)).toEqual({ ok: true, setup });

    // Wave 69 has its own start, so a start tile is neither written nor read for it.
    const plain: InfernoLinkSetup = { startWave: 69, layout: null, destroyedPillars: NO_PILLARS, startTile: [24, 30] };
    expect(buildInfernoSetupUrl('https://example.com', plain)).toBe('https://example.com/inferno/?wave=69');
    const gear = '{"setup":{"name":"A & B"},"layout":[]}';
    const withGear = new URL(buildInfernoSetupUrl('https://example.com', plain, gear));
    expect(withGear.searchParams.get('setup')).toBe(gear);
  });

  it('reads the player’s start tile in the monsters’ coordinates, on waves 2-68 only', () => {
    // (34,44), the default start tile, is [17,2]; (28,24) is under the south pillar, [11,22].
    const start = (query: string) => {
      const result = parse(query);
      return result.ok ? result.setup?.startTile : result.message;
    };
    expect(start('wave=30&player=[17,2]')).toEqual([34, 44]);
    expect(start('wave=30&player=%5B17%2C2%5D')).toEqual([34, 44]);
    expect(start('wave=30&player=[[17,%202]]')).toEqual([34, 44]);
    expect(start('wave=30')).toBeNull();
    expect(start('wave=30&player=[11,22]')).toBe('The player tile [11,22] is under a standing pillar.');
    expect(start('wave=30&player=[11,22]&pillars=south')).toEqual([28, 24]);
    expect(start('wave=67&player=[11,22]')).toEqual([28, 24]);
    expect(start('wave=30&player=[-1,0]')).toBe('The player tile [-1,0] is outside the arena.');
    // Wave 1 lands and wave 69 has its own start: the tile is ignored, never an error.
    expect(start('wave=1&player=[0,0]')).toBeNull();
    expect(start('wave=69&player=garbage')).toBeNull();
  });

  it('refuses to build a link for a layout of another wave than the start', () => {
    expect(() =>
      buildInfernoSetupUrl('https://example.com', {
        startWave: 25,
        layout: layout(31, WAVE_31_SLOTS),
        destroyedPillars: NO_PILLARS,
      }),
    ).toThrow(RangeError);
  });
});
