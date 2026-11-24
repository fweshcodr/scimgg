// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { deleteSetting, isStorageNamespaced, loadSetting, saveSetting, setStorageNamespace } from '../storage';

const KEY = 'osrs-test-key';

describe('storage', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  describe('loadSetting', () => {
    it('returns null when nothing is persisted', () => {
      expect(loadSetting(KEY)).toBeNull();
    });

    it('reads a value from localStorage', () => {
      localStorage.setItem(KEY, JSON.stringify({ a: 1 }));
      expect(loadSetting(KEY)).toEqual({ a: 1 });
    });

    it('returns null and clears the entry when localStorage holds corrupt JSON', () => {
      localStorage.setItem(KEY, '{not json');
      expect(loadSetting(KEY)).toBeNull();
      expect(localStorage.getItem(KEY)).toBeNull();
    });
  });

  describe('saveSetting', () => {
    it('persists to localStorage as JSON', () => {
      expect(saveSetting(KEY, { a: 1, b: [2, 3] })).toBe(true);
      expect(localStorage.getItem(KEY)).toBe(JSON.stringify({ a: 1, b: [2, 3] }));
    });

    it('returns false when the value is not JSON-serializable', () => {
      const cyclic: { self?: unknown } = {};
      cyclic.self = cyclic;
      expect(saveSetting(KEY, cyclic)).toBe(false);
    });
  });

  describe('deleteSetting', () => {
    it('removes the localStorage entry', () => {
      localStorage.setItem(KEY, JSON.stringify({ x: 1 }));
      deleteSetting(KEY);
      expect(localStorage.getItem(KEY)).toBeNull();
    });
  });
});

describe('storage namespace', () => {
  const NAMESPACE = 'ui-harness:';

  beforeEach(() => {
    localStorage.clear();
    setStorageNamespace('');
  });

  afterEach(() => {
    // Module-global: leaving it installed would redirect every later suite's reads.
    setStorageNamespace('');
  });

  it('reports whether persistence is scoped', () => {
    expect(isStorageNamespaced()).toBe(false);
    setStorageNamespace(NAMESPACE);
    expect(isStorageNamespaced()).toBe(true);
  });

  it('writes and reads under the prefix, leaving the app key untouched', () => {
    saveSetting(KEY, { scope: 'app' });

    setStorageNamespace(NAMESPACE);
    saveSetting(KEY, { scope: 'harness' });

    expect(loadSetting(KEY)).toEqual({ scope: 'harness' });
    expect(localStorage.getItem(`${NAMESPACE}${KEY}`)).toBe(JSON.stringify({ scope: 'harness' }));
    // The unprefixed key — the developer's real settings — must be exactly as it was.
    expect(localStorage.getItem(KEY)).toBe(JSON.stringify({ scope: 'app' }));
  });

  it('deletes only the namespaced key', () => {
    saveSetting(KEY, { scope: 'app' });
    setStorageNamespace(NAMESPACE);
    saveSetting(KEY, { scope: 'harness' });

    deleteSetting(KEY);

    expect(loadSetting(KEY)).toBeNull();
    setStorageNamespace('');
    expect(loadSetting(KEY)).toEqual({ scope: 'app' });
  });
});
