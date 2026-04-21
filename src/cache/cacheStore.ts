/**
 * Centralized in-memory cache store.
 * Single-process, TTL-based, deterministic behavior.
 */

export type CacheValue = unknown;

type CacheEntry = {
  value: CacheValue;
  expiresAt: number;
};

class CacheStore {
  private store = new Map<string, CacheEntry>();

  /**
   * Retrieve a cached value by key.
   * Automatically evicts expired entries.
   */
  get<T = CacheValue>(key: string): T | null {
    const entry = this.store.get(key);
    if (!entry) return null;

    if (Date.now() > entry.expiresAt) {
      this.store.delete(key);
      return null;
    }

    return entry.value as T;
  }

  /**
   * Store a value with a TTL.
   */
  set(key: string, value: CacheValue, ttlMs: number): void {
    this.store.set(key, {
      value,
      expiresAt: Date.now() + ttlMs,
    });
  }

  /**
   * Delete a single cache entry by key.
   */
  del(key: string): void {
    this.store.delete(key);
  }

  /**
   * Delete all cache entries matching a predicate.
   * Used for DELETE-based invalidation of resource variants.
   */
  delWhere(predicate: (key: string) => boolean): void {
    for (const key of this.store.keys()) {
      if (predicate(key)) {
        this.store.delete(key);
      }
    }
  }

  /**
   * Check if a non-expired entry exists for the given key.
   */
  has(key: string): boolean {
    return this.get(key) !== null;
  }

  /**
   * Clear all cache entries.
   */
  clear(): void {
    this.store.clear();
  }

  /**
   * Number of entries currently in the cache.
   */
  size(): number {
    return this.store.size;
  }
}

/**
 * Singleton cache instance.
 * Do NOT create additional instances.
 */
export const cacheStore = new CacheStore();
