import { describe, expect, it } from 'vitest';
import { findCustomMenuSwapIndex, parseCustomMenuSwaps, type SwappableMenuEntry } from '../customMenuSwaps';

const npcMenu: SwappableMenuEntry[] = [
  { action: 'Talk-to', target: 'Yama  (level-700)' },
  { action: 'Attack', target: 'Yama  (level-700)' },
  { action: 'Walk here' },
];

function indexFor(rules: string, entries: SwappableMenuEntry[] = npcMenu): number {
  return findCustomMenuSwapIndex(entries, parseCustomMenuSwaps(rules));
}

describe('parseCustomMenuSwaps', () => {
  it('drops blank lines', () => {
    expect(parseCustomMenuSwaps('\n\nattack,*\n  \n')).toHaveLength(1);
  });

  it('reads no rules from empty text', () => {
    expect(parseCustomMenuSwaps('')).toHaveLength(0);
  });
});

describe('findCustomMenuSwapIndex', () => {
  it('promotes an exact option + wildcard target match', () => {
    expect(indexFor('attack,*')).toBe(1);
  });

  it('matches a target prefix, suffix, and substring', () => {
    expect(indexFor('attack,yama*')).toBe(1);
    expect(indexFor('attack,*(level-700)')).toBe(1);
    expect(indexFor('attack,*ama*')).toBe(1);
  });

  it('is case-insensitive and ignores surrounding whitespace', () => {
    expect(indexFor('  ATTACK , Yama*  ')).toBe(1);
  });

  it('reads a missing target field as "no target", not as a wildcard', () => {
    expect(indexFor('walk here')).toBe(2);
    expect(indexFor('attack')).toBe(-1);
  });

  it('ignores the leading attack-target marker on a target', () => {
    const attacking: SwappableMenuEntry[] = [
      { action: 'Talk-to', target: '*Yama  (level-700)' },
      { action: 'Attack', target: '*Yama  (level-700)' },
    ];
    expect(indexFor('attack,yama*', attacking)).toBe(1);
  });

  it('applies a rule only when the top entry matches its condition fields', () => {
    expect(indexFor('walk here,,talk-to,yama*')).toBe(2);
    expect(indexFor('walk here,,attack,yama*')).toBe(-1);
  });

  it('lets a later rule outrank an earlier one', () => {
    expect(indexFor('attack,*\nwalk here')).toBe(2);
    expect(indexFor('walk here\nattack,*')).toBe(1);
  });

  it('keeps the topmost entry when two match the same rule', () => {
    const stacked: SwappableMenuEntry[] = [
      { action: 'Walk here' },
      { action: 'Attack', target: 'Jal-Nib  (level-32)' },
      { action: 'Attack', target: 'Jal-MejRah  (level-85)' },
    ];
    expect(indexFor('attack,*', stacked)).toBe(1);
  });

  it('reports the top entry itself when a rule names it, which is not the same as no match', () => {
    expect(indexFor('talk-to,*')).toBe(0);
  });

  it('reports no match when nothing matches, or when there are no rules', () => {
    expect(indexFor('use,*')).toBe(-1);
    expect(findCustomMenuSwapIndex(npcMenu, [])).toBe(-1);
    expect(indexFor('attack,*', [])).toBe(-1);
  });
});
