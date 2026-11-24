import { afterEach, describe, expect, it } from 'vitest';
import { infernoSetupQuery, planInfernoSetupLink, readInfernoSetupLink } from '../setupLink';
import {
  dismissInfernoSetupLinkNotice,
  getInfernoSetupLinkNotice,
  showInfernoSetupLinkNotice,
} from '../setupLinkNotice';
import { buildInfernoSetupUrl } from '../spawnLayout';

/** An Inventory Setups export: a supported helm and a brew. */
function gearExport(helmId = 21018): string {
  const inv = new Array(28).fill(null);
  inv[0] = { id: 6685 };
  const eq = new Array(14).fill(null);
  eq[0] = { id: helmId };
  return JSON.stringify({ setup: { name: 'Inferno', inv, eq }, layout: [] });
}

const WAVE_5 = 'bat=[[1,5]]&blob=[[3,11]]';
const WAVE_5_MECHANICS = {
  infernoStartWave: '5',
  infernoSpawnLayout: '5:bl-------',
  infernoWestPillarDestroyed: false,
  infernoSouthPillarDestroyed: false,
  infernoNorthEastPillarDestroyed: false,
};

function plan(query: string) {
  return planInfernoSetupLink(new URLSearchParams(query));
}

afterEach(() => {
  dismissInfernoSetupLinkNotice();
});

describe('Inferno setup link plan', () => {
  it('applies the setup and opens the setup card when the link has no gear', () => {
    expect(plan(`${WAVE_5}&copyable`)).toEqual({
      mechanics: WAVE_5_MECHANICS,
      loadout: null,
      autoStart: false,
      notice: { tone: 'success', message: 'Wave 5 spawn loaded from link.' },
    });
    expect(plan('wave=40&pillars=south')).toMatchObject({
      mechanics: { infernoStartWave: '40', infernoSpawnLayout: '', infernoSouthPillarDestroyed: true },
      autoStart: false,
      notice: { message: 'Start wave 40 loaded from link.' },
    });
  });

  it('saves a named start tile on waves 2-68, and keeps the player’s own otherwise', () => {
    // [7,16] in the monsters' coordinates is local (24,30).
    expect(plan(`${WAVE_5}&player=[7,16]`)?.mechanics).toEqual({ ...WAVE_5_MECHANICS, infernoStartTile: '24,30' });
    expect(plan(WAVE_5)?.mechanics).not.toHaveProperty('infernoStartTile');
    expect(plan('wave=69&player=[7,16]')?.mechanics).not.toHaveProperty('infernoStartTile');
    expect(plan('wave=1&player=[7,16]')?.mechanics).not.toHaveProperty('infernoStartTile');
    // A tile the run cannot start on is an error like any other: nothing is applied.
    expect(plan(`${WAVE_5}&player=[11,22]`)).toMatchObject({
      mechanics: null,
      notice: { tone: 'error', message: expect.stringContaining('[11,22] is under a standing pillar') },
    });
  });

  it('round-trips a built link, start tile included', () => {
    const url = new URL(
      buildInfernoSetupUrl('https://example.com', {
        startWave: 40,
        layout: null,
        destroyedPillars: { west: false, south: true, northEast: false },
        startTile: [28, 24],
      }),
    );
    expect(url.search).toBe('?wave=40&pillars=south&player=[11,22]');
    expect(planInfernoSetupLink(url.searchParams)?.mechanics).toMatchObject({
      infernoStartWave: '40',
      infernoSouthPillarDestroyed: true,
      infernoStartTile: '28,24',
    });
  });

  it('starts at once with complete gear', () => {
    const result = plan(`${WAVE_5}&setup=${encodeURIComponent(gearExport())}`);
    expect(result).toMatchObject({
      mechanics: WAVE_5_MECHANICS,
      autoStart: true,
      notice: { tone: 'success', message: 'Wave 5 spawn and gear loaded from link.' },
    });
    expect(result?.loadout?.equipment).toEqual({ head: 21018 });
    expect(result?.loadout?.inventory[0]).toEqual({ id: 6685 });
  });

  it('keeps the setup but waits for Start when the gear is unreadable or incomplete', () => {
    expect(plan(`${WAVE_5}&setup=not-json`)).toMatchObject({
      mechanics: WAVE_5_MECHANICS,
      loadout: null,
      autoStart: false,
      notice: { tone: 'warning' },
    });
    // An item this build does not have is left out of the gear, so the player checks it first.
    const partial = plan(`${WAVE_5}&setup=${encodeURIComponent(gearExport(1))}`);
    expect(partial).toMatchObject({ mechanics: WAVE_5_MECHANICS, autoStart: false, notice: { tone: 'warning' } });
    expect(partial?.loadout?.inventory[0]).toEqual({ id: 6685 });
  });

  it('applies nothing, gear included, when the setup cannot be read', () => {
    const gear = `setup=${encodeURIComponent(gearExport())}`;
    for (const query of [`bat=[[2,5]]&${gear}`, gear, 'wave=99']) {
      expect(plan(query)).toMatchObject({
        mechanics: null,
        loadout: null,
        autoStart: false,
        notice: { tone: 'error' },
      });
    }
  });

  it('is no link without any Inferno parameter', () => {
    expect(plan('')).toBeNull();
    expect(plan('popout=1&copyable')).toBeNull();
  });
});

describe('reading the boot address', () => {
  const at = (pathname: string, search: string, hash = '') => readInfernoSetupLink({ pathname, search, hash });

  it('reads /inferno/ and the root, leaving the lobby path with the other parameters', () => {
    expect(at('/inferno/', `?${WAVE_5}&copyable&popout=1`, '#x')?.cleanedUrl).toBe('/?popout=1#x');
    expect(at('/inferno', `?wave=3&setup=${encodeURIComponent(gearExport())}`)?.cleanedUrl).toBe('/');
    expect(at('/', '?wave=3')?.plan?.mechanics).toMatchObject({ infernoStartWave: '3' });
  });

  it('never reads another page’s query, or an address without a link', () => {
    expect(at('/yama/', '?wave=3')).toBeNull();
    expect(at('/inferno/extra/', '?wave=3')).toBeNull();
    expect(at('/r/abc/', '?wave=3')).toBeNull();
    expect(at('/inferno/', '?popout=1')).toBeNull();
  });

  describe('against the saved setup', () => {
    const saved = { infernoStartWave: '5', infernoSpawnLayout: '5:bl-------', infernoWestPillarDestroyed: true };
    const read = (pathname: string, search: string) => readInfernoSetupLink({ pathname, search, hash: '' }, saved);

    it('takes the address bar’s own mirror as no plan, saying which route it was on', () => {
      const mirror = `?${infernoSetupQuery(saved)}`;
      expect(mirror).toBe(`?wave=5&${WAVE_5}&pillars=west`);
      expect(read('/inferno/', `${mirror}&popout=1`)).toEqual({
        plan: null,
        cleanedUrl: '/?popout=1',
        onInfernoRoute: true,
      });
      expect(read('/', `${mirror}&popout=1`)).toEqual({ plan: null, cleanedUrl: '/?popout=1', onInfernoRoute: false });
      // Without the saved setup, the same address is a link to apply.
      expect(readInfernoSetupLink({ pathname: '/inferno/', search: mirror, hash: '' })?.plan).not.toBeNull();
      // Equal by what it sets up, not by spelling: the plugin's form, without `wave`.
      expect(read('/inferno/', `?${WAVE_5}&copyable&pillars=west`)?.plan).toBeNull();
    });

    it('still applies a link that changes the setup, or one that brings gear', () => {
      expect(read('/inferno/', `?${WAVE_5}`)).toMatchObject({ plan: { notice: { tone: 'success' } }, cleanedUrl: '/' });
      const gear = `&setup=${encodeURIComponent(gearExport())}`;
      expect(read('/inferno/', `?${infernoSetupQuery(saved)}${gear}`)?.plan).toMatchObject({ autoStart: true });
      expect(read('/inferno/', '?bat=[[2,5]]')?.plan).toMatchObject({ notice: { tone: 'error' } });
    });
  });
});

describe('the address bar’s setup query', () => {
  it('is empty for the untouched default, so the plain route stays plain', () => {
    // The default start is wave 69, where pillars and start tiles do not apply.
    expect(infernoSetupQuery({})).toBe('');
    expect(infernoSetupQuery({ infernoStartWave: '69', infernoSpawnLayout: '', infernoStartTile: '24,30' })).toBe('');
    expect(infernoSetupQuery({ infernoStartWave: '69', infernoSouthPillarDestroyed: true })).toBe('');
    // Wave 1 is a choice now, so the mirror names it.
    expect(infernoSetupQuery({ infernoStartWave: '1', infernoSpawnLayout: '', infernoStartTile: '24,30' })).toBe(
      'wave=1',
    );
    expect(infernoSetupQuery({ infernoStartWave: '1', infernoSouthPillarDestroyed: true })).toBe(
      'wave=1&pillars=south',
    );
  });

  it('writes only what a run of the setup uses, in the link format', () => {
    expect(infernoSetupQuery({ infernoStartWave: '40' })).toBe('wave=40');
    // The default start tile, written or not, is not written.
    expect(infernoSetupQuery({ infernoStartWave: '40', infernoStartTile: '34,44' })).toBe('wave=40');
    expect(infernoSetupQuery({ infernoStartWave: '40', infernoStartTile: '24,30' })).toBe('wave=40&player=[7,16]');
    // A layout for another wave, and pillars from wave 67 on, change nothing a link could carry.
    expect(infernoSetupQuery({ infernoStartWave: '4', infernoSpawnLayout: '5:bl-------' })).toBe('wave=4');
    expect(infernoSetupQuery({ infernoStartWave: '67', infernoWestPillarDestroyed: true })).toBe('wave=67');
    // Kept spawns are the run's alone: a link of its setup is the same with or without them.
    expect(infernoSetupQuery({ infernoStartWave: '40', infernoPinnedWave: '40' })).toBe('wave=40');
    const query = infernoSetupQuery({ infernoStartWave: '5', infernoSpawnLayout: '5:bl-------' });
    expect(planInfernoSetupLink(new URLSearchParams(query))?.mechanics).toMatchObject({
      infernoStartWave: '5',
      infernoSpawnLayout: '5:bl-------',
    });
  });
});

describe('setup link notice', () => {
  it('holds one notice until dismissed', () => {
    expect(getInfernoSetupLinkNotice()).toBeNull();
    showInfernoSetupLinkNotice({ tone: 'error', message: 'No.' });
    expect(getInfernoSetupLinkNotice()).toEqual({ tone: 'error', message: 'No.' });
    dismissInfernoSetupLinkNotice();
    expect(getInfernoSetupLinkNotice()).toBeNull();
  });
});
