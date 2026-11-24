import { describe, expect, it } from 'vitest';
import { ENCOUNTER_CATALOG } from '../../encounters/catalog';
import {
  ENCOUNTER_PLUGINS,
  type EncounterPluginKey,
  encounterPluginOptions,
  encounterPluginSectionName,
  isEncounterPluginShown,
} from '../encounterPlugins';

const shownIn = (kind: string | null) =>
  (Object.keys(ENCOUNTER_PLUGINS) as EncounterPluginKey[]).filter((plugin) => isEncounterPluginShown(plugin, kind));

describe('isEncounterPluginShown', () => {
  it('shows each plugin only in its own encounters', () => {
    expect(shownIn('inferno')).toEqual(['infernoAdditions', 'tzhaarHpTracker', 'setTimer']);
    expect(shownIn('sol_heredit')).toEqual(['colosseumAdditions', 'tzhaarHpTracker']);
    expect(shownIn('yama_p3')).toEqual([]);
    expect(shownIn('lobby')).toEqual([]);
    expect(shownIn(null)).toEqual([]);
  });

  it('answers a variant or retired kind for the encounter it belongs to', () => {
    expect(shownIn('zuk')).toEqual(shownIn('inferno'));
    expect(shownIn('yama_p3_bloodied')).toEqual([]);
  });

  it('names only catalog encounters', () => {
    const kinds = new Set(ENCOUNTER_CATALOG.map((entry) => entry.kind));
    for (const { encounters } of Object.values(ENCOUNTER_PLUGINS)) {
      for (const kind of encounters) expect(kinds.has(kind)).toBe(true);
    }
  });
});

describe('encounterPluginOptions', () => {
  const options = { showHp: 'aboveHpBar' };

  it('passes the options on only while the plugin is on and its encounter is loaded', () => {
    expect(encounterPluginOptions('tzhaarHpTracker', 'inferno', true, options)).toBe(options);
    expect(encounterPluginOptions('tzhaarHpTracker', 'zuk', true, options)).toBe(options);
    expect(encounterPluginOptions('tzhaarHpTracker', 'inferno', false, options)).toBeNull();
  });

  it('turns a plugin left on off in the lobby, another fight, or while loading', () => {
    expect(encounterPluginOptions('tzhaarHpTracker', 'lobby', true, options)).toBeNull();
    expect(encounterPluginOptions('infernoAdditions', 'sol_heredit', true, options)).toBeNull();
    expect(encounterPluginOptions('colosseumAdditions', null, true, options)).toBeNull();
  });
});

describe('encounterPluginSectionName', () => {
  it('names the place for each encounter with plugins, and nothing for one without', () => {
    expect(encounterPluginSectionName('inferno')).toBe('Inferno');
    expect(encounterPluginSectionName('zuk')).toBe('Inferno');
    expect(encounterPluginSectionName('sol_heredit')).toBe('Colosseum');
    expect(encounterPluginSectionName('yama_p3')).toBeNull();
    expect(encounterPluginSectionName('lobby')).toBeNull();
    expect(encounterPluginSectionName(null)).toBeNull();
  });

  it('has a heading for every encounter an encounter plugin names', () => {
    for (const { encounters } of Object.values(ENCOUNTER_PLUGINS)) {
      for (const kind of encounters) expect(encounterPluginSectionName(kind)).not.toBeNull();
    }
  });
});

describe('ENCOUNTER_PLUGINS labels', () => {
  it('names, under each row, every encounter section the plugin shows in', () => {
    for (const { encounters, label } of Object.values(ENCOUNTER_PLUGINS)) {
      for (const kind of encounters) expect(label).toContain(encounterPluginSectionName(kind));
    }
  });
});
