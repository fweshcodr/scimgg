import { readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';

/** Production sources: everything under `src/` except tests and test infrastructure. */
function* productionSources(directory: string): Generator<string> {
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) {
      if (entry.name !== '__tests__' && entry.name !== '__mocks__' && path !== join('src', 'test'))
        yield* productionSources(path);
    } else if (/\.[cm]?[jt]sx?$/.test(entry.name) && !/\.(test|spec)\.[cm]?[jt]sx?$/.test(entry.name)) {
      yield path;
    }
  }
}

function* allFiles(directory: string): Generator<string> {
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) yield* allFiles(path);
    else yield path;
  }
}

describe('capture test infrastructure boundary', () => {
  it('is not imported by production code', () => {
    const importers = [...productionSources('src')].filter((path) =>
      /(?:from\s+|import\s*\(\s*|import\s+)['"][^'"]*test\/capture(?:\/|['"])/.test(readFileSync(path, 'utf8')),
    );
    expect(importers).toEqual([]);
  });

  it('ships no capture fixtures as public assets', () => {
    const fixtures = [...allFiles('public')].filter((path) => /\.replay\.txt$/.test(path));
    expect(fixtures.map((path) => relative('public', path))).toEqual([]);
  });
});
