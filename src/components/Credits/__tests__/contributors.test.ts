import { describe, expect, it } from 'vitest';
import { CONTRIBUTORS } from '../contributors';

describe('CONTRIBUTORS', () => {
  it('credits each person once, comparing every alias case-insensitively', () => {
    const aliases = CONTRIBUTORS.flatMap((c) => c.name.split('/').map((alias) => alias.trim().toLowerCase()));
    const duplicates = aliases.filter((alias, i) => aliases.indexOf(alias) !== i);
    expect(duplicates).toEqual([]);
  });
});
