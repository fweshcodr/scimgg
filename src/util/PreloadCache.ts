import { networkPool } from './networkPool';

export class PreloadCache<K, V> {
  private readonly cache = new Map<K, V>();
  private readonly inFlight = new Map<K, Promise<V | null>>();
  private generation = 0;

  get(key: K): V | undefined {
    return this.cache.get(key);
  }

  /** Does not count in-flight loads, only fully cached values. */
  has(key: K): boolean {
    return this.cache.has(key);
  }

  /** Failed loads are not cached, so a subsequent call retries. */
  async load(key: K, loader: () => Promise<V | null>): Promise<V | null> {
    const cached = this.cache.get(key);
    if (cached !== undefined) return cached;

    const existing = this.inFlight.get(key);
    if (existing) return existing;

    const gen = this.generation;
    const promise = (async (): Promise<V | null> => {
      try {
        const value = await networkPool.add(loader);
        if (gen === this.generation && value !== null && value !== undefined) {
          this.cache.set(key, value);
        }
        return value;
      } catch {
        return null;
      } finally {
        if (gen === this.generation) {
          this.inFlight.delete(key);
        }
      }
    })();

    this.inFlight.set(key, promise);
    return promise;
  }

  clear(): void {
    this.generation++;
    this.cache.clear();
    this.inFlight.clear();
  }
}
