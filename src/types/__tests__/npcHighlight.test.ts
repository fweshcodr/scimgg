import { describe, expect, it } from 'vitest';
import {
  getHighlightsForNpc,
  getNpcHighlightMenuColor,
  hasHighlightForNpc,
  isNpcHighlighted,
  type NpcHighlightEntry,
  npcHighlightKey,
} from '../npcHighlight';

function makeEntry(
  npcTypeId: number,
  mode: 'trueTile' | 'swTile' | 'clickbox',
  overrides?: Partial<NpcHighlightEntry>,
): NpcHighlightEntry {
  return { npcName: `NPC ${npcTypeId}`, npcTypeId, mode, color: '#00ffff', ...overrides };
}

describe('npcHighlightKey', () => {
  it('returns a stable npcTypeId:mode key', () => {
    expect(npcHighlightKey(1234, 'trueTile')).toBe('1234:trueTile');
    expect(npcHighlightKey(55, 'swTile')).toBe('55:swTile');
    expect(npcHighlightKey(987, 'clickbox')).toBe('987:clickbox');
  });
});

describe('hasHighlightForNpc', () => {
  it('returns false for empty list', () => {
    expect(hasHighlightForNpc([], 123)).toBe(false);
  });

  it('returns true when any mode exists for npcTypeId', () => {
    const highlights = [makeEntry(101, 'trueTile'), makeEntry(202, 'swTile'), makeEntry(202, 'clickbox')];

    expect(hasHighlightForNpc(highlights, 202)).toBe(true);
    expect(hasHighlightForNpc(highlights, 303)).toBe(false);
  });
});

describe('getHighlightsForNpc', () => {
  it('returns empty array when no entries match', () => {
    const highlights = [makeEntry(101, 'trueTile')];
    expect(getHighlightsForNpc(highlights, 999)).toEqual([]);
  });

  it('filters entries by npcTypeId across multiple modes', () => {
    const highlights = [
      makeEntry(77, 'trueTile', { color: '#111111' }),
      makeEntry(77, 'swTile', { color: '#222222' }),
      makeEntry(88, 'clickbox', { color: '#333333' }),
      makeEntry(77, 'clickbox', { color: '#444444' }),
    ];

    expect(getHighlightsForNpc(highlights, 77)).toEqual([
      makeEntry(77, 'trueTile', { color: '#111111' }),
      makeEntry(77, 'swTile', { color: '#222222' }),
      makeEntry(77, 'clickbox', { color: '#444444' }),
    ]);
  });
});

describe('isNpcHighlighted', () => {
  it('returns false for empty list', () => {
    expect(isNpcHighlighted([], 12, 'trueTile')).toBe(false);
  });

  it('checks npcTypeId and mode together', () => {
    const highlights = [makeEntry(901, 'trueTile'), makeEntry(901, 'swTile'), makeEntry(902, 'clickbox')];

    expect(isNpcHighlighted(highlights, 901, 'trueTile')).toBe(true);
    expect(isNpcHighlighted(highlights, 901, 'clickbox')).toBe(false);
    expect(isNpcHighlighted(highlights, 902, 'clickbox')).toBe(true);
    expect(isNpcHighlighted(highlights, 999, 'swTile')).toBe(false);
  });
});

// The color the right-click menu, the hover text and the plugin panel's swatch all read.
// They resolve it through this one function so a tagged NPC cannot be painted one color
// in the menu and another in the list beside it.
describe('getNpcHighlightMenuColor', () => {
  it('has no color for an NPC that is not tagged', () => {
    expect(getNpcHighlightMenuColor([], 500)).toBeUndefined();
    expect(getNpcHighlightMenuColor([makeEntry(501, 'trueTile')], 500)).toBeUndefined();
  });

  it("returns the tag's color when the NPC holds one", () => {
    expect(getNpcHighlightMenuColor([makeEntry(500, 'trueTile', { color: '#6fb0ae' })], 500)).toBe('#6fb0ae');
  });

  it('takes the first stored entry when one NPC holds several modes', () => {
    const highlights = [
      makeEntry(500, 'trueTile', { color: '#111111' }),
      makeEntry(500, 'clickbox', { color: '#222222' }),
    ];

    expect(getNpcHighlightMenuColor(highlights, 500)).toBe('#111111');
  });

  it('follows the stored order rather than the mode order', () => {
    const highlights = [
      makeEntry(500, 'clickbox', { color: '#222222' }),
      makeEntry(500, 'trueTile', { color: '#111111' }),
    ];

    expect(getNpcHighlightMenuColor(highlights, 500)).toBe('#222222');
  });
});
