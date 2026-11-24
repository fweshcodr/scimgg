import { describe, expect, it, vi } from 'vitest';
import { PreloadCache } from '../PreloadCache';

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

describe('PreloadCache', () => {
  it('returns cached value on cache hit without calling loader', async () => {
    const cache = new PreloadCache<string, string>();
    const firstLoader = vi.fn(async () => 'value');
    const hitLoader = vi.fn(async () => 'new-value');

    await expect(cache.load('k', firstLoader)).resolves.toBe('value');
    await expect(cache.load('k', hitLoader)).resolves.toBe('value');

    expect(firstLoader).toHaveBeenCalledTimes(1);
    expect(hitLoader).not.toHaveBeenCalled();
  });

  it('calls loader on cache miss and stores result', async () => {
    const cache = new PreloadCache<string, number>();
    const loader = vi.fn(async () => 1337);

    await expect(cache.load('a', loader)).resolves.toBe(1337);
    await vi.waitFor(() => {
      expect(loader).toHaveBeenCalledTimes(1);
    });
    expect(cache.get('a')).toBe(1337);
    expect(cache.has('a')).toBe(true);
  });

  it('deduplicates concurrent in-flight loads for the same key', async () => {
    const cache = new PreloadCache<string, string>();
    const gate = deferred<string>();
    const loader = vi.fn(async () => gate.promise);

    const p1 = cache.load('same', loader);
    const p2 = cache.load('same', loader);

    await vi.waitFor(() => {
      expect(loader).toHaveBeenCalledTimes(1);
    });

    gate.resolve('shared');
    await expect(Promise.all([p1, p2])).resolves.toEqual(['shared', 'shared']);
    expect(cache.get('same')).toBe('shared');
  });

  it('does not cache null results and retries on subsequent calls', async () => {
    const cache = new PreloadCache<string, string>();
    const loader = vi.fn<() => Promise<string | null>>().mockResolvedValueOnce(null).mockResolvedValueOnce('fresh');

    await expect(cache.load('retry', loader)).resolves.toBeNull();
    expect(cache.has('retry')).toBe(false);
    expect(cache.get('retry')).toBeUndefined();

    await expect(cache.load('retry', loader)).resolves.toBe('fresh');
    expect(loader).toHaveBeenCalledTimes(2);
    expect(cache.has('retry')).toBe(true);
    expect(cache.get('retry')).toBe('fresh');
  });

  it('clear generation prevents stale in-flight loads from repopulating cache', async () => {
    const cache = new PreloadCache<string, string>();
    const staleGate = deferred<string>();
    const staleLoader = vi.fn(async () => staleGate.promise);

    const stalePromise = cache.load('k', staleLoader);
    cache.clear();

    staleGate.resolve('stale');
    await expect(stalePromise).resolves.toBe('stale');
    expect(cache.has('k')).toBe(false);
    expect(cache.get('k')).toBeUndefined();

    const freshLoader = vi.fn(async () => 'fresh');
    await expect(cache.load('k', freshLoader)).resolves.toBe('fresh');
    expect(cache.has('k')).toBe(true);
    expect(cache.get('k')).toBe('fresh');
  });

  it('returns null on loader error and does not cache failure', async () => {
    const cache = new PreloadCache<string, string>();
    const failingLoader = vi.fn(async () => {
      throw new Error('failed');
    });

    await expect(cache.load('err', failingLoader)).resolves.toBeNull();
    expect(cache.has('err')).toBe(false);
    expect(cache.get('err')).toBeUndefined();

    const successLoader = vi.fn(async () => 'ok');
    await expect(cache.load('err', successLoader)).resolves.toBe('ok');
    expect(successLoader).toHaveBeenCalledTimes(1);
    expect(cache.has('err')).toBe(true);
  });

  it('has() is false for in-flight keys and true only after caching', async () => {
    const cache = new PreloadCache<string, string>();
    const gate = deferred<string>();
    const loader = vi.fn(async () => gate.promise);

    const pending = cache.load('pending', loader);
    expect(cache.has('pending')).toBe(false);

    gate.resolve('done');
    await expect(pending).resolves.toBe('done');

    expect(cache.has('pending')).toBe(true);
    expect(cache.get('pending')).toBe('done');
  });
});
