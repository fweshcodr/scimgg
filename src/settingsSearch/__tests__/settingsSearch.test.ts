import { describe, expect, it } from 'vitest';
import { SETTINGS_SEARCH_ENTRIES } from '../entries';
import {
  GAMEPANEL_AUDIO_ID,
  GAMEPANEL_AUDIO_IDS,
  GAMEPANEL_KEYBINDS_CAMERA_ID,
  GAMEPANEL_KEYBINDS_ID,
  GAMEPANEL_KEYBINDS_PLUGINS_ID,
  pluginSearchId,
  settingsSearchId,
  slugify,
} from '../ids';
import { allowedEdits, damerauLevenshtein, normalizeText, search, stem, suggest, tokenize } from '../match';
import type { SearchEntry } from '../types';

const E = SETTINGS_SEARCH_ENTRIES;

function topIds(query: string, n = 3): string[] {
  return search(query, E, { limit: n }).map((result) => result.entry.id);
}

describe('normalizeText', () => {
  it('folds case, accents, punctuation and ampersands, keeping digits', () => {
    expect(normalizeText('  Graphics & Performance!! ')).toBe('graphics and performance');
    expect(normalizeText('Résolution — 1080p')).toBe('resolution 1080p');
    expect(normalizeText("Auto-size: don't")).toBe('auto size dont');
  });
});

describe('stem', () => {
  it('folds plural, -ing, -ed and -er forms of one word together', () => {
    for (const group of [
      ['marker', 'markers', 'marking', 'marked', 'mark'],
      ['flick', 'flicks', 'flicking', 'flicked'],
      ['swap', 'swaps', 'swapper', 'swapping'],
      ['drop', 'drops', 'dropped'],
      ['scale', 'scales', 'scaling'],
      ['entry', 'entries'],
      ['infobox', 'infoboxes'],
    ]) {
      expect(new Set(group.map(stem)), group.join('/')).toHaveProperty('size', 1);
    }
  });

  it('leaves -ss and -us words and short words alone', () => {
    expect(stem('brightness')).toBe('bright');
    expect(stem('status')).toBe('status');
    expect(stem('bar')).toBe('bar');
  });
});

describe('damerauLevenshtein', () => {
  it('counts a transposition as one edit', () => {
    expect(damerauLevenshtein('cmaera', 'camera')).toBe(1);
    expect(damerauLevenshtein('metronme', 'metronome')).toBe(1);
    expect(damerauLevenshtein('kitten', 'sitting')).toBe(3);
    expect(damerauLevenshtein('', 'abc')).toBe(3);
  });

  it('gives up past the budget', () => {
    expect(damerauLevenshtein('abcdef', 'uvwxyz', 1)).toBe(2);
    expect(damerauLevenshtein('a', 'abcdef', 2)).toBe(3);
  });

  it('scales the typo budget with word length', () => {
    expect([3, 4, 7, 8, 12].map(allowedEdits)).toEqual([0, 1, 1, 2, 2]);
  });
});

describe('search over the sidebar index', () => {
  const resolution = settingsSearchId('Interface', 'Game window', 'Resolution');
  const popOut = settingsSearchId('Interface', 'Game window', 'Pop Out Game');
  const gameWindow = settingsSearchId('Interface', 'Game window');
  const mobileScaling = settingsSearchId('Mobile', 'Interface scaling');
  const outlineColor = settingsSearchId('Interface', 'Infobox appearance', 'Outline color');

  // query → ids that must all appear in the top 3.
  const cases: [string, string[]][] = [
    // Typos
    ['metronme', ['plugins.tickAudioMetronome', 'plugins.attackTimerMetronome']],
    ['brightnes', ['settings.graphics-performance.brightness']],
    ['stretchd', ['plugins.stretchedMode']],
    ['grond markers', ['plugins.tileMarkers']],
    ['menu entry swaper', ['plugins.customMenuSwaps']],
    ['cmaera', ['plugins.camera']],
    ['prayr flik', ['plugins.prayerFlickHelper']],
    // Word variants and RuneLite / everyday words
    ['tile marker', ['plugins.tileMarkers']],
    ['ground markers', ['plugins.tileMarkers']],
    ['mark tile', ['plugins.tileMarkers']],
    ['tile highlight', ['plugins.tileMarkers', 'plugins.tileIndicators']],
    ['xp drop', ['plugins.xpDrops']],
    ['exp', ['plugins.xpDrops']],
    ['experience', ['plugins.xpDrops']],
    ['fps', ['settings.graphics-performance.fps-cap', 'settings.graphics-performance']],
    ['frame rate', ['settings.graphics-performance.fps-cap']],
    ['stutter', ['settings.graphics-performance', 'settings.graphics-performance.fps-cap']],
    ['lag', ['settings.simulation.input-lag', 'settings.graphics-performance']],
    ['ui size', ['plugins.stretchedMode.ui-scale', 'plugins.stretchedMode']],
    ['bigger interface', [mobileScaling, 'plugins.stretchedMode']],
    // The Interface scaling row only links on; its own words find the editors.
    ['interface scaling', ['plugins.stretchedMode.ui-scale', mobileScaling]],
    ['fixed size', ['plugins.stretchedMode.fixed-layout-scale']],
    ['stretch', ['plugins.stretchedMode']],
    ['left click', ['plugins.customMenuSwaps']],
    ['zuk', ['plugins.setTimer']],
    ['set timer', ['plugins.setTimer']],
    ['hp bar', ['plugins.bossHealthBar', 'plugins.statusBars']],
    ['health bar', ['plugins.bossHealthBar', 'plugins.statusBars']],
    ['invert camera', ['plugins.camera.invert-yaw', 'plugins.camera.invert-pitch']],
    ['camera speed', ['plugins.camera.keyboard-speed', 'plugins.camera.mouse-speed']],
    ['zoom limit', ['plugins.camera.inner-limit', 'plugins.camera.outer-limit']],
    ['volume', [GAMEPANEL_AUDIO_IDS.masterVolume, GAMEPANEL_AUDIO_IDS.sfxVolume, GAMEPANEL_AUDIO_IDS.areaVolume]],
    ['sound', [GAMEPANEL_AUDIO_IDS.sfxVolume, GAMEPANEL_AUDIO_IDS.areaVolume, GAMEPANEL_AUDIO_ID]],
    ['metronome volume', ['plugins.tickAudioMetronome.volume']],
    ['tick sound', ['plugins.tickAudioMetronome']],
    ['dps', ['plugins.dpsOverlay']],
    ['damage', ['plugins.dpsOverlay']],
    ['prayer flick', ['plugins.prayerFlickHelper', 'plugins.prayer.pray-flick-on-prayer-orb']],
    ['flicking', ['plugins.prayerFlickHelper']],
    ['overhead timer', ['plugins.attackTimerMetronome', 'plugins.tickCounter']],
    ['attack cycle', ['plugins.attackTimerMetronome']],
    ['transparent chat', ['settings.interface.transparent-chatbox']],
    ['window', [gameWindow]],
    ['resolution', [resolution, gameWindow]],
    ['screen size', [gameWindow, resolution]],
    ['pop out', [popOut]],
    ['popout', [popOut]],
    ['second monitor', [popOut]],
    ['gamma', ['settings.graphics-performance.brightness']],
    ['dark', ['settings.graphics-performance.brightness']],
    ['speed', ['settings.simulation.playback-speed']],
    ['slow motion', ['settings.simulation.playback-speed']],
    ['restart', ['settings.simulation.restart-simulation']],
    ['reset', ['settings.simulation.restart-simulation']],
    ['phone', ['settings.mobile']],
    ['touch', ['settings.mobile']],
    ['tablet', ['settings.mobile']],
    ['layout', ['settings.interface.layout']],
    ['resizable', ['settings.interface.layout']],
    ['classic', ['settings.interface.layout']],
    ['desktop mode', ['settings.interface.device-mode']],
    ['mobile mode', ['settings.interface.device-mode']],
    ['infobox colour', [outlineColor]],
    ['infobox color', [outlineColor]],
    ['infobox position', [settingsSearchId('Interface', 'Infobox appearance', 'Position')]],
    // Partial typing
    ['brigh', ['settings.graphics-performance.brightness']],
    ['tick c', ['plugins.tickCounter']],
    ['stretc', ['plugins.stretchedMode']],
    // Filler words and compounds
    ['how do i change the layout', ['settings.interface.layout']],
    ['hpbar', ['plugins.bossHealthBar', 'plugins.statusBars']],
    ['tickcounter', ['plugins.tickCounter']],
  ];

  it.each(cases)('%s', (query, expected) => {
    const top = topIds(query);
    for (const id of expected) expect(top, `"${query}" top 3`).toContain(id);
  });

  it.each([
    ['brightness', 'settings.graphics-performance.brightness'],
    ['BRIGHTNESS!!', 'settings.graphics-performance.brightness'],
    ['brigh', 'settings.graphics-performance.brightness'],
    ['camera', 'plugins.camera'],
    ['zuk', 'plugins.setTimer'],
    ['fps', 'settings.graphics-performance.fps-cap'],
    ['tile marker', 'plugins.tileMarkers'],
    ['xp drop', 'plugins.xpDrops'],
    ['pop out', popOut],
    ['tick c', 'plugins.tickCounter'],
    ['speed', 'settings.simulation.playback-speed'],
    // Short words that are also the start of longer title words.
    ['exp', 'plugins.xpDrops'],
    ['xp', 'plugins.xpDrops'],
    ['cam', 'plugins.camera'],
    ['res', resolution],
    ['ui', 'plugins.stretchedMode.ui-scale'],
    ['zoom', 'plugins.camera'],
    ['chat', 'settings.interface.transparent-chatbox'],
    // Partial words that are not words of their own still complete the title.
    ['stretc', 'plugins.stretchedMode'],
  ])('ranks the obvious row first for "%s"', (query, id) => {
    expect(topIds(query, 1)).toEqual([id]);
  });

  it.each<[string, string[]]>([
    // TzHaar HP Tracker and its Show HP and Dynamic HP color options carry the word in their titles.
    ['hp', ['plugins.tzhaarHpTracker', 'plugins.tzhaarHpTracker.show-hp']],
    ['tile', ['plugins.tileIndicators', 'plugins.tileMarkers']],
    ['ui', ['settings.interface', 'plugins.stretchedMode']],
    ['fps', ['settings.graphics-performance']],
    ['inv', ['plugins.instantInventory', 'plugins.inventoryTags']],
  ])('keeps the rows "%s" means in the top 3', (query, expected) => {
    const top = topIds(query);
    for (const id of expected) expect(top).toContain(id);
  });

  it('keeps Tile Indicators in reach for "mark tile" past each arena\'s Mark pillar tiles', () => {
    // Inferno and Colosseum Additions each have the option; only one is ever usable at a time,
    // and the panel lists the other under "Available elsewhere".
    const top = topIds('mark tile', 4);
    expect(top).toContain('plugins.tileIndicators');
    expect(top).toContain('plugins.infernoAdditions.mark-pillar-tiles');
    expect(top).toContain('plugins.colosseumAdditions.mark-pillar-tiles');
  });

  it('puts the health bar plugins straight after the rows named "HP" for "hp"', () => {
    const next = topIds('hp', 6).slice(3);
    expect(next).toContain('plugins.bossHealthBar');
    expect(next).toContain('plugins.statusBars');
  });

  it('does not let a finished short word rank a title that merely starts with it first', () => {
    // "exp" is a keyword and a synonym of "xp"; "Expand pitch limit" only starts with it.
    expect(topIds('exp', 2)).not.toContain('plugins.camera.expand-pitch-limit');
    expect(topIds('inv', 2)).not.toContain('plugins.camera.invert-yaw');
  });

  it('reports what each query word matched on', () => {
    const [top] = search('grond markers', E);
    expect(top.entry.id).toBe('plugins.tileMarkers');
    expect(top.matchedOn).toEqual([
      { queryToken: 'grond', field: 'keywords', text: expect.stringMatching(/ground marker/), kind: 'fuzzy' },
      { queryToken: 'markers', field: 'title', text: 'Tile Markers', kind: 'exact' },
    ]);
  });

  it('requires every word of a short query to match', () => {
    expect(search('camera zzzzzz', E)).toEqual([]);
  });

  it('lets one word in three miss in a longer query', () => {
    expect(topIds('tile markers qqqq')).toContain('plugins.tileMarkers');
  });

  it('only completes a 1-2 letter word when it is the one being typed', () => {
    expect(topIds('c tick')).not.toContain('plugins.tickCounter');
  });

  it('returns nothing for an empty or punctuation-only query', () => {
    expect(search('', E)).toEqual([]);
    expect(search('  ?! ', E)).toEqual([]);
    expect(suggest('', E)).toEqual([]);
  });

  it('honors the limit', () => {
    expect(search('tick', E, { limit: 2 })).toHaveLength(2);
  });
});

describe('ranking', () => {
  const entry = (id: string, fields: Partial<SearchEntry>): SearchEntry => ({
    id,
    title: id,
    panel: 'settings',
    breadcrumb: ['Settings'],
    kind: 'setting',
    ...fields,
  });

  const fixture: SearchEntry[] = [
    entry('in-description', { title: 'Something', description: 'Adjusts the glow strength' }),
    entry('in-breadcrumb', { title: 'Other', breadcrumb: ['Settings', 'Glow'] }),
    entry('in-keywords', { title: 'Another', keywords: ['glow'] }),
    entry('title-fuzzy', { title: 'Glwo effects' }),
    entry('title-prefix', { title: 'Glow effects' }),
    entry('title-exact', { title: 'Glow' }),
  ];

  it('orders exact title, title prefix, title fuzzy, keyword, breadcrumb, description', () => {
    expect(search('glow', fixture).map((r) => r.entry.id)).toEqual([
      'title-exact',
      'title-prefix',
      'title-fuzzy',
      'in-keywords',
      'in-breadcrumb',
      'in-description',
    ]);
  });

  it('ranks a title match above a description match', () => {
    const [first] = search('glow', [fixture[0], fixture[3]]);
    expect(first.entry.id).toBe('title-fuzzy');
  });

  it('ranks an exact keyword above a title that only starts with the finished word', () => {
    const words = [
      entry('title-starts-with-it', { title: 'Expand limits' }),
      entry('exact-keyword', { title: 'Drops', keywords: ['exp'] }),
    ];
    expect(search('exp', words).map((r) => r.entry.id)).toEqual(['exact-keyword', 'title-starts-with-it']);
    // One letter more and "expa" is no word of its own: the title completion wins again.
    expect(search('expa', words).map((r) => r.entry.id)).toEqual(['title-starts-with-it']);
  });

  it('still completes a partial word to the title when no row has it as a whole word', () => {
    const words = [
      entry('keyword-prefix', { title: 'Other', keywords: ['brightly'] }),
      entry('title', { title: 'Brightness' }),
    ];
    expect(search('brigh', words).map((r) => r.entry.id)).toEqual(['title', 'keyword-prefix']);
  });

  it('keeps index order on equal scores', () => {
    const twins = [entry('first', { title: 'Same' }), entry('second', { title: 'Same' })];
    expect(search('same', twins).map((r) => r.entry.id)).toEqual(['first', 'second']);
    expect(search('same', [...twins].reverse()).map((r) => r.entry.id)).toEqual(['second', 'first']);
  });
});

describe('description and availability', () => {
  const entry = (id: string, fields: Partial<SearchEntry>): SearchEntry => ({
    id,
    title: 'Unrelated',
    panel: 'settings',
    breadcrumb: ['Settings'],
    kind: 'setting',
    ...fields,
  });

  it('matches their words exactly or as variants only', () => {
    const rows = [entry('described', { description: 'Adjusts the glow strength of colours' })];
    expect(search('strength', rows).map((r) => r.entry.id)).toEqual(['described']);
    expect(search('colour', rows).map((r) => r.entry.id)).toEqual(['described']);
    // A typo, a synonym, or a filler word in the prose finds nothing there.
    expect(search('strenght', rows)).toEqual([]);
    expect(search('color', rows)).toEqual([]);
  });

  it('completes a word still being typed when no row has it as a whole word', () => {
    const rows = [entry('described', { description: 'Adjusts the glow strength' })];
    expect(search('stren', rows).map((r) => r.entry.id)).toEqual(['described']);
    expect(search('stren glow', rows)).toEqual([]);
  });

  it('does not complete "theme" from every "them" in a description', () => {
    expect(E.some((entry) => /\bthem\b/.test(entry.description ?? ''))).toBe(true);
    expect(search('theme', E)).toEqual([]);
  });

  it('does not let a typo of a description-only word surface the row', () => {
    expect(topIds('current bindings', 1)).toEqual(['settings.keyboard-shortcuts-reference']);
    expect(topIds('crurent bindings')).not.toContain('settings.keyboard-shortcuts-reference');
  });
});

describe('layout context', () => {
  const mobileScaling = settingsSearchId('Mobile', 'Interface scaling');

  it('ranks the Mobile layout\'s own Interface scaling first for "ui size" in Mobile', () => {
    expect(search('ui size', E, { layout: 'mobile', limit: 1 })[0].entry.id).toBe(mobileScaling);
  });

  it('ranks UI scale first and Mobile\'s Interface scaling out of the top 3 for "ui size" in Modern', () => {
    const top = search('ui size', E, { layout: 'resizable', limit: 3 }).map((r) => r.entry.id);
    expect(top[0]).toBe('plugins.stretchedMode.ui-scale');
    expect(top).toContain('plugins.stretchedMode');
    expect(top).not.toContain(mobileScaling);
  });

  it('ranks Fixed layout scale first for "ui size" in Fixed', () => {
    expect(search('ui size', E, { layout: 'fixed', limit: 1 })[0].entry.id).toBe(
      'plugins.stretchedMode.fixed-layout-scale',
    );
  });

  it('finds Stretch to Window under the Fixed layout scale, and Integer scaling on its own', () => {
    expect(search('stretch to window', E, { layout: 'fixed', limit: 1 })[0].entry.id).toBe(
      'plugins.stretchedMode.fixed-layout-scale',
    );
    expect(search('integer scaling', E, { layout: 'fixed', limit: 1 })[0].entry.id).toBe(
      'plugins.stretchedMode.integer-scaling',
    );
  });

  it('reorders but never hides, and leaves an exact title on top', () => {
    const ids = (layout?: 'fixed' | 'resizable' | 'mobile') =>
      search('ui size', E, { layout })
        .map((r) => r.entry.id)
        .sort();
    expect(ids('mobile')).toEqual(ids());
    expect(ids('fixed')).toEqual(ids());
    expect(search('fixed layout scale', E, { layout: 'mobile', limit: 1 })[0].entry.id).toBe(
      'plugins.stretchedMode.fixed-layout-scale',
    );
  });

  it('tags every Mobile-layout-only row with the mobile layout', () => {
    for (const e of E.filter((entry) => entry.availability === 'Mobile layout')) {
      expect(e.layouts, e.id).toEqual(['mobile']);
    }
  });
});

describe('suggest', () => {
  it.each(['qwzxv', 'xyzzy plugh', 'jad', '42'])('never comes back empty for "%s"', (query) => {
    expect(search(query, E)).toEqual([]);
    const suggestions = suggest(query, E);
    expect(suggestions.length).toBe(5);
    for (let i = 1; i < suggestions.length; i++) {
      expect(suggestions[i - 1].score).toBeGreaterThanOrEqual(suggestions[i].score);
    }
  });

  it('offers the nearest rows for a word too mangled to pass', () => {
    expect(search('metrnm', E)).toEqual([]);
    expect(
      suggest('metrnm', E, { limit: 2 })
        .map((r) => r.entry.id)
        .sort(),
    ).toEqual(['plugins.attackTimerMetronome', 'plugins.tickAudioMetronome']);
  });
});

describe('title highlights (titleSpans)', () => {
  // query → the words of `id`'s shown title (resultTitle, else title) the query picks out.
  it.each<[string, string, string, string[]]>([
    ['a one-letter last word completes', 'b', 'settings.graphics-performance.brightness', ['Brightness']],
    ['a short typo keeps its first letter', 'tule markers presets', 'plugins.tileMarkers', ['Tile', 'Markers']],
    ['a short typo with a new first letter is no match', 'bile markers presets', 'plugins.tileMarkers', ['Markers']],
    ['a synonym-only match picks out nothing', 'sfx', GAMEPANEL_AUDIO_ID, []],
    [
      'a synonym in a qualified title picks out nothing',
      'colour',
      settingsSearchId('Interface', 'Infobox appearance', 'Outline color'),
      [],
    ],
    [
      "a qualified title's added words, matched through other fields",
      'metronome volume',
      pluginSearchId('tickAudioMetronome', 'Volume'),
      ['Metronome', 'volume'],
    ],
  ])('%s', (_case, query, id, words) => {
    const result = search(query, E).find((r) => r.entry.id === id);
    if (!result) throw new Error(`${id} not found for "${query}"`);
    const shown = result.entry.resultTitle ?? result.entry.title;
    expect(result.titleSpans.map(([start, end]) => shown.slice(start, end))).toEqual(words);
  });
});

describe('index', () => {
  it('describes countdown length in game ticks, not seconds', () => {
    const length = E.find(({ id }) => id === settingsSearchId('Simulation', 'Start of Fight Countdown', 'Length'));
    expect(length?.description).toBe('Sets the fight countdown length from 1 to 5 game ticks.');
    expect(length?.keywords).toEqual(expect.arrayContaining(['countdown ticks', 'game ticks', 'ticks']));
    expect(length?.keywords).not.toContain('seconds');
    expect(length?.keywords).not.toContain('countdown seconds');
  });

  it('keeps Layout available on both device modes and routes Mobile requirements to Device Mode', () => {
    const layout = E.find(({ id }) => id === settingsSearchId('Interface', 'Layout'));
    expect(layout?.description).toBe('Chooses a desktop layout; Mobile mode always uses Mobile.');
    expect(layout?.availability).toBeUndefined();
    expect(layout?.whenUnavailable).toBeUndefined();
    expect(layout?.keywords).not.toContain('mobile layout');
    const device = E.find(({ id }) => id === settingsSearchId('Interface', 'Device Mode'));
    expect(device?.keywords).toContain('mobile layout');
    for (const entry of E.filter(({ whenUnavailable }) =>
      whenUnavailable?.reason.startsWith('Requires the Mobile layout'),
    )) {
      expect(entry.whenUnavailable?.route).toEqual({
        label: 'Open Device Mode settings',
        target: settingsSearchId('Interface', 'Device Mode'),
      });
    }
  });

  it('has unique ids', () => {
    const ids = E.map((e) => e.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('gives every entry a title and a breadcrumb rooted at its panel', () => {
    for (const e of E) {
      expect(e.title.trim(), e.id).not.toBe('');
      expect(e.breadcrumb.length, e.id).toBeGreaterThan(0);
      expect(e.breadcrumb[0], e.id).toBe(
        e.panel === 'settings' ? 'Settings' : e.panel === 'plugins' ? 'Plugins' : 'Game panel',
      );
      expect(e.id.startsWith(`${e.panel}.`), e.id).toBe(true);
      for (const keyword of e.keywords ?? []) expect(normalizeText(keyword), `${e.id} keyword`).not.toBe('');
    }
  });

  it('builds each id from the slug of its own title', () => {
    // Plugin rows use their expand key, and the game panel's two fixed ids come from ids.ts.
    for (const e of E) {
      if (e.kind === 'plugin' || e.panel === 'gamepanel') continue;
      expect(e.id.endsWith(`.${slugify(e.title)}`), e.id).toBe(true);
    }
  });

  it('carries the planned final structure', () => {
    const ids = new Set(E.map((e) => e.id));
    for (const id of [
      'settings.simulation',
      'settings.graphics-performance',
      'settings.graphics-performance.3d-render-scale',
      'settings.interface',
      'settings.interface.game-window',
      'settings.interface.infobox-appearance',
      'settings.interface.infobox-appearance.position',
      'settings.interface.infobox-appearance.text-outline',
      'settings.interface.infobox-appearance.outline-color',
      'settings.keyboard-shortcuts-reference',
      GAMEPANEL_KEYBINDS_ID,
      GAMEPANEL_KEYBINDS_CAMERA_ID,
      GAMEPANEL_KEYBINDS_PLUGINS_ID,
      'settings.mobile',
      'plugins.stretchedMode.fixed-layout-scale',
      'plugins.stretchedMode.ui-scale',
      'plugins.stretchedMode.auto-size-interface-and-overlays',
      'plugins.setTimer',
    ]) {
      expect(ids, id).toContain(id);
    }
    // Moved, folded into the editor it links to, or development-only.
    for (const gone of [
      'settings.display',
      'settings.interface.infoboxes',
      'settings.interface.interface-scaling',
      'settings.keyboard-shortcuts',
      'plugins.infobox-appearance',
      'plugins.debugOverlays',
      'gamepanel.keybinds.simulation',
    ]) {
      expect(
        [...ids].some((id) => id === gone || id.startsWith(`${gone}.`)),
        gone,
      ).toBe(false);
    }
    expect(E.find((e) => e.id === 'plugins.setTimer')?.title).toBe('Zuk Set Timer');
  });

  it('leads with the keybind editor for "keybinds", and finds the reference too for "shortcuts"', () => {
    for (const query of ['keybinds', 'rebind', 'key bindings', 'change keys', 'f keys']) {
      expect(topIds(query, 1), query).toEqual([GAMEPANEL_KEYBINDS_ID]);
    }
    expect(topIds('camera keys', 1)).toEqual([GAMEPANEL_KEYBINDS_CAMERA_ID]);
    for (const query of ['plugin keys', 'plugin shortcuts', 'plugin keybinds']) {
      expect(topIds(query, 1), query).toEqual([GAMEPANEL_KEYBINDS_PLUGINS_ID]);
    }
    // Each feature-specific shortcut group ranks alongside the editor and reference.
    const shortcuts = topIds('shortcuts', 5);
    expect(shortcuts).toContain(GAMEPANEL_KEYBINDS_ID);
    expect(shortcuts).toContain('settings.keyboard-shortcuts-reference');
    expect(topIds('simulation shortcuts', 5)).not.toContain('gamepanel.keybinds.simulation');
    // A plugin's own keys stay with the plugin.
    expect(topIds('zuk timer keys', 1)).toEqual([pluginSearchId('setTimer', 'Shortcuts')]);
    // The Mobile layout's hotkey slots are their own row.
    expect(topIds('mobile hotkeys', 1)).toEqual([settingsSearchId('Mobile', 'Hotkeys')]);
  });

  it('does not advertise checkpoint shortcuts and preserves the separate full restart description', () => {
    expect(E.some((entry) => entry.id === 'gamepanel.keybinds.simulation')).toBe(false);
    expect(topIds('set checkpoint', 5)).not.toContain('gamepanel.keybinds.simulation');
    expect(E.find((entry) => entry.id === settingsSearchId('Simulation', 'Restart Simulation'))?.description).toContain(
      'clears the practice start',
    );
  });

  it('finds the dismissal binding by its plain-language action and Escape key', () => {
    for (const query of ['close or cancel', 'close menu', 'cancel action', 'escape', 'esc']) {
      expect(topIds(query, 1), query).toEqual([GAMEPANEL_KEYBINDS_ID]);
    }
  });

  describe('the game panel Audio page', () => {
    const audioIds = [GAMEPANEL_AUDIO_ID, ...Object.values(GAMEPANEL_AUDIO_IDS)];
    const rank = (query: string, id: string) => search(query, E).findIndex((result) => result.entry.id === id);
    const metronomeVolume = pluginSearchId('tickAudioMetronome', 'Volume');

    it('lists the page and each of its controls under the game panel, usable without a keyboard', () => {
      for (const id of audioIds) {
        const entry = E.find((e) => e.id === id);
        expect(entry?.panel, id).toBe('gamepanel');
        expect(entry?.needsKeyboard, id).toBeUndefined();
      }
    });

    it('finds its volumes for "volume" ahead of the Tick Audio Metronome\'s own', () => {
      const metronome = rank('volume', metronomeVolume);
      expect(metronome).toBeGreaterThan(-1);
      for (const id of [
        GAMEPANEL_AUDIO_IDS.masterVolume,
        GAMEPANEL_AUDIO_IDS.sfxVolume,
        GAMEPANEL_AUDIO_IDS.areaVolume,
      ]) {
        expect(rank('volume', id), id).toBeGreaterThan(-1);
        expect(rank('volume', id), id).toBeLessThan(metronome);
      }
      expect(topIds('volume', 1)).toEqual([GAMEPANEL_AUDIO_IDS.masterVolume]);
    });

    it.each([
      ['audio', GAMEPANEL_AUDIO_ID],
      ['music', GAMEPANEL_AUDIO_ID],
      ['sfx', GAMEPANEL_AUDIO_IDS.sfxVolume],
      ['sound effects', GAMEPANEL_AUDIO_IDS.sfxVolume],
      ['area sounds', GAMEPANEL_AUDIO_IDS.areaVolume],
      ['area sound', GAMEPANEL_AUDIO_IDS.areaVolume],
      ['ambient', GAMEPANEL_AUDIO_IDS.areaVolume],
      ['master volume', GAMEPANEL_AUDIO_IDS.masterVolume],
      ['mute', GAMEPANEL_AUDIO_IDS.muteWhenUnfocused],
    ])('"%s" leads with %s', (query, id) => {
      expect(topIds(query, 1)).toEqual([id]);
    });

    it.each(['sound', 'mute', 'quiet', 'loud'])('"%s" ranks the Audio page above the metronome volume', (query) => {
      expect(rank(query, GAMEPANEL_AUDIO_ID)).toBeGreaterThan(-1);
      const metronome = rank(query, metronomeVolume);
      if (metronome !== -1) expect(rank(query, GAMEPANEL_AUDIO_ID)).toBeLessThan(metronome);
    });
  });

  it('marks the keybind rows as needing a keyboard', () => {
    for (const id of [GAMEPANEL_KEYBINDS_ID, GAMEPANEL_KEYBINDS_CAMERA_ID, GAMEPANEL_KEYBINDS_PLUGINS_ID]) {
      expect(E.find((e) => e.id === id)?.needsKeyboard, id).toBe(true);
    }
  });

  it('qualifies bare labels for the results without changing their ids', () => {
    const volume = E.find((e) => e.id === pluginSearchId('tickAudioMetronome', 'Volume'));
    expect(volume?.title).toBe('Volume');
    expect(volume?.resultTitle).toBe('Metronome volume');
    expect(E.find((e) => e.id === pluginSearchId('bossHealthBar', 'Show percentage'))?.resultTitle).toBe(
      'Show hitpoint percentage',
    );
    for (const e of E.filter((entry) => entry.resultTitle)) {
      expect(e.resultTitle, e.id).not.toBe(e.title);
      // Search matches the qualified title in place of the label, so it must keep every label word.
      const shown = new Set(tokenize(e.resultTitle ?? '').map(stem));
      expect(
        tokenize(e.title).filter((word) => !shown.has(stem(word))),
        e.id,
      ).toEqual([]);
    }
  });

  it('keeps descriptions to one short sentence about the effect', () => {
    for (const e of E) {
      if (!e.description) continue;
      expect(e.description.split(/[.!?](\s|$)/).filter((part) => part.trim()).length, e.id).toBeLessThanOrEqual(2);
      expect(e.description.length, e.id).toBeLessThanOrEqual(110);
    }
  });

  it.each([
    ['Transparent side panel', 'Requires a Resizable layout.'],
    ['Hotkeys close side panel', 'Requires the Resizable Modern layout.'],
  ])('tags %s with the Resizable search family and routes unavailable rows to Layout', (title, reason) => {
    const entry = E.find(({ id }) => id === settingsSearchId('Interface', title));
    expect(entry?.layouts).toEqual(['resizable']);
    expect(entry?.whenUnavailable).toEqual({
      reason,
      route: { label: 'Open Layout settings', target: settingsSearchId('Interface', 'Layout') },
    });
  });

  it('explains every conditionally shown row, and routes only to rows that exist', () => {
    const ids = new Set(E.map((e) => e.id));
    for (const e of E) {
      // A plugin row is always in the panel (its own note says when it applies); Zuk's is not.
      if (e.availability && (e.kind !== 'plugin' || e.id === 'plugins.setTimer')) {
        expect(e.whenUnavailable, e.id).toBeDefined();
      }
      const route = e.whenUnavailable?.route;
      if (route) {
        expect(ids, `${e.id} → ${route.target}`).toContain(route.target);
        expect(route.target, e.id).not.toBe(e.id);
      }
    }
    expect(
      E.find((e) => e.id === settingsSearchId('Interface', 'Click through transparent chatbox'))?.whenUnavailable,
    ).toEqual({
      reason: 'Turn on Transparent chatbox to use this.',
      route: { label: 'Show Transparent chatbox', target: settingsSearchId('Interface', 'Transparent chatbox') },
    });
    expect(E.find((e) => e.id === 'plugins.setTimer')?.whenUnavailable).toEqual({
      reason: 'Available in the Inferno.',
    });
  });
});

describe('id helpers', () => {
  it('slugs labels to stable kebab-case', () => {
    expect(slugify('Graphics & Performance')).toBe('graphics-performance');
    expect(slugify('3D render scale')).toBe('3d-render-scale');
    expect(slugify('Auto-size interface and overlays')).toBe('auto-size-interface-and-overlays');
    expect(slugify('  Pop Out Game… ')).toBe('pop-out-game');
    expect(slugify('Résumé’s Colour')).toBe('resumes-colour');
  });

  it('joins the panel and label path', () => {
    expect(settingsSearchId('Simulation')).toBe('settings.simulation');
    expect(settingsSearchId('Interface', 'Game window')).toBe('settings.interface.game-window');
    expect(settingsSearchId('Interface', 'Game window', 'Pop Out Game')).toBe(
      'settings.interface.game-window.pop-out-game',
    );
    expect(pluginSearchId('stretchedMode')).toBe('plugins.stretchedMode');
    expect(pluginSearchId('stretchedMode', 'Fixed layout scale')).toBe('plugins.stretchedMode.fixed-layout-scale');
  });
});

describe('performance', () => {
  it('searches the full index quickly', () => {
    const queries = [
      'metronme',
      'tile marker',
      'ui size',
      'brigh',
      'how do i change the layout',
      'grond markers',
      'zz',
    ];
    for (const q of queries) search(q, E); // warm the prepared index and JIT
    const rounds = 50;
    const start = performance.now();
    for (let i = 0; i < rounds; i++) for (const q of queries) search(q, E);
    const perSearch = (performance.now() - start) / (rounds * queries.length);
    console.info(`settingsSearch: ${perSearch.toFixed(3)} ms per search over ${E.length} entries`);
    // Typical is well under 2 ms; the bound only catches an accidental blow-up, not a slower machine.
    expect(perSearch).toBeLessThan(25);
  });
});
