import Redis from 'ioredis';

const redis = new Redis({
  host: process.env.REDIS_HOST || '127.0.0.1',
  port: parseInt(process.env.REDIS_PORT || '6379'),
  password: process.env.REDIS_SERVER_PASSWORD,
});

export type CacheValue = unknown;

class CacheStore {
  /**
   * Retrieve a cached value by key.
   */
  async get<T = CacheValue>(key: string): Promise<T | null> {
    const value = await redis.get(key);
    return value ? (JSON.parse(value) as T) : null;
  }

  /**
   * Store a value with a TTL (in ms).
   */
  async set(key: string, value: CacheValue, ttlMs: number): Promise<void> {
    await redis.set(key, JSON.stringify(value), 'PX', ttlMs);
  }

  /**
   * Delete a single cache entry by key.
   */
  async del(key: string): Promise<void> {
    await redis.del(key);
  }

  /**
   * Delete all cache entries matching a predicate (using SCAN).
   */
  async delWhere(predicate: (key: string) => boolean): Promise<void> {
    const stream = redis.scanStream({ match: '*' });
    for await (const keys of stream) {
      for (const key of keys) {
        if (predicate(key)) {
          await redis.del(key);
        }
      }
    }
  }

  /**
   * Check if an entry exists for the given key.
   */
  async has(key: string): Promise<boolean> {
    return (await redis.exists(key)) === 1;
  }

  /**
   * Clear all cache entries (WARNING: dangerous).
   */
  async clear(): Promise<void> {
    await redis.flushdb();
  }

  /**
   * Approximate number of entries in the current DB.
   */
  async size(): Promise<number> {
    return await redis.dbsize();
  }
}

/**
 * Singleton cache instance.
 */
export const cacheStore = new CacheStore();
